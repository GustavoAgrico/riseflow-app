import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, x264Fast, probeSummary } from './ffmpeg.js';
import { makeLogger } from '../logger.js';
import { cleanLayerKf, kfExpr, kfMax } from '../../../shared/layerKeys.js';
import { cleanEase, easeExpr } from '../../../shared/easing.js';
import { ELEMENT_ANIMS, elemMotionExpr } from '../../../shared/elementMotion.js';

const log = makeLogger('usermedia');

const clamp = (v, min, max, def) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
};

/** Intensidade do ducking → quanto a música abaixa enquanto há fala. */
const DUCK = {
  suave: { threshold: 0.05, ratio: 4 },
  medio: { threshold: 0.03, ratio: 8 },
  forte: { threshold: 0.015, ratio: 16 },
};

/**
 * Mistura final das músicas com a voz (filtros do -filter_complex, terminando em [aout]).
 *
 * Com voz + ducking (padrão "medio"), a música passa por um sidechaincompress
 * disparado pela própria voz: abaixa sozinha enquanto a pessoa fala e volta nas
 * pausas — o "auto ducking" de editores como o CapCut. ducking false/'off' desliga.
 *
 * @param {string[]} musLabels rótulos das músicas já preparadas (ex.: ['[am0]'])
 * @returns {string[]}
 */
export function musicMixParts(musLabels, { hasAudio, dur, ducking = 'medio' }) {
  const tail = `alimiter=limit=0.95,atrim=0:${dur.toFixed(3)}[aout]`;
  const mixAll = (labels, n) => `${labels}amix=inputs=${n}:normalize=0:dropout_transition=0`;
  if (!hasAudio) {
    if (musLabels.length === 1) return [`${musLabels[0]}atrim=0:${dur.toFixed(3)}[aout]`];
    return [`${mixAll(musLabels.join(''), musLabels.length)},${tail}`];
  }
  const duck = ducking === false || ducking === 'off' ? null : DUCK[ducking] || DUCK.medio;
  if (!duck) return [`${mixAll(`[0:a]${musLabels.join('')}`, musLabels.length + 1)},${tail}`];

  const parts = ['[0:a]asplit=2[voice][vsc]'];
  let mus = musLabels[0];
  if (musLabels.length > 1) {
    parts.push(`${mixAll(musLabels.join(''), musLabels.length)}[mus]`);
    mus = '[mus]';
  }
  parts.push(
    `${mus}[vsc]sidechaincompress=threshold=${duck.threshold}:ratio=${duck.ratio}:attack=15:release=350[musd]`,
    `${mixAll('[voice][musd]', 2)},${tail}`,
  );
  return parts;
}

/** Animações de entrada/saída das camadas (as mais usadas no CapCut). */
export const LAYER_ANIMATIONS = {
  none: 'Nenhuma',
  fade: 'Fade',
  zoom: 'Zoom',
  pop: 'Pop (quicar)',
  'slide-left': 'Deslizar ←',
  'slide-right': 'Deslizar →',
  'slide-up': 'Deslizar ↑',
  'slide-down': 'Deslizar ↓',
  bounce: 'Quicar (mola)',
  elastic: 'Elástico',
  grow: 'Crescer do zero',
  drop: 'Cair de cima',
  'whip-left': 'Chicote da esquerda',
  'whip-right': 'Chicote da direita',
  'whip-up': 'Chicote de baixo',
  'whip-down': 'Chicote de cima',
  spin: 'Girar entrando',
};

/** Modos de mesclagem (só tela cheia). Cor neutra = a que não altera o vídeo de baixo. */
export const BLEND_MODES = {
  normal: { label: 'Normal' },
  screen: { label: 'Tela (clarear luz)', neutral: 'black' },
  lighten: { label: 'Clarear', neutral: 'black' },
  overlay: { label: 'Sobrepor', neutral: '0x808080' },
  multiply: { label: 'Multiplicar', neutral: 'white' },
  darken: { label: 'Escurecer', neutral: 'white' },
};

const ZOOMS = new Set(['zoom', 'pop', 'bounce', 'elastic', 'grow', 'spin']);
const SLIDES = { 'slide-left': [1, 0], 'slide-right': [-1, 0], 'slide-up': [0, 1], 'slide-down': [0, -1] };
const WHIPS = { 'whip-left': [-1, 0], 'whip-right': [1, 0], 'whip-up': [0, -1], 'whip-down': [0, 1] };

const f3 = (n) => Number(n).toFixed(3);
const f4 = (n) => Number(n).toFixed(4);
/** Progresso 0→1 da entrada e 1→0 da saída (expressões em t). */
const progIn = (m, a) => `min(1,max(0,(t-${f3(m.start)})/${f3(a)}))`;
const progOut = (m, a) => `min(1,max(0,(${f3(m.end)}-t)/${f3(a)}))`;

/** easeOutBounce em expressão FFmpeg */
const bounceExpr = (p) =>
  `if(lt(${p},0.3636),7.5625*${p}*${p},if(lt(${p},0.7273),7.5625*(${p}-0.5455)*(${p}-0.5455)+0.75,if(lt(${p},0.9091),7.5625*(${p}-0.8182)*(${p}-0.8182)+0.9375,7.5625*(${p}-0.9545)*(${p}-0.9545)+0.984375)))`;
/** easeOutBack em expressão FFmpeg (s=2.5 para whip) */
const backExpr = (p, s = 1.70158) => {
  const c = s + 1;
  return `(1+${f4(c)}*(${p}-1)*(${p}-1)*(${p}-1)+${f4(s)}*(${p}-1)*(${p}-1))`;
};
/** easeOutElastic em expressão FFmpeg (simplificado com 3 bounces) */
const elasticExpr = (p) =>
  `if(lte(${p},0),0,if(gte(${p},1),1,pow(2,-10*${p})*sin((${p}*10-0.75)*2.094)+1))`;

/** Fator de escala da animação: zoom cresce de 60%; pop passa de 112% e assenta em 100%. */
function scaleFactor(anim, p, ease) {
  if (anim === 'zoom') return `(0.6+0.4*${ease(p)})`;
  if (anim === 'pop') return `max(0.05,if(lt(${p},0.7),1.12*${p}/0.7,1.12-0.12*(${p}-0.7)/0.3))`;
  if (anim === 'bounce') return `max(0.05,${bounceExpr(p)})`;
  if (anim === 'elastic') return `max(0.05,${elasticExpr(p)})`;
  if (anim === 'grow') return `max(0.05,${ease(p)})`;
  if (anim === 'spin') return `max(0.05,${ease(p)})`;
  return null;
}

/**
 * Filtros das camadas visuais (imagens/vídeos do usuário), terminando em [vout].
 * Cada item: { _inIdx, start, end, d, mode: cover|pip, scale, px, py, opacity,
 * animIn, animOut, animDur, blend, _aspect? }. Puro/exportado para teste.
 *
 * - Fade: alpha da camada (fade=...:alpha=1).
 * - Zoom/Pop: escala por quadro (scale eval=frame) ancorada no centro da camada.
 * - Deslizar: a posição do overlay vem de fora da tela até o lugar (e sai do mesmo jeito).
 * - Mesclagem (tela cheia): a camada é posta sobre uma tela na cor neutra do modo e
 *   mesclada com blend — fora da janela e nos fades, a cor neutra não altera o vídeo.
 */
export function visualLayerParts(vis, { W, H, fps, dur }) {
  const parts = [];
  let vlast = '[0:v]';
  vis.forEach((m0, i) => {
    // Quadros-chave (Propriedades): posição/escala animadas deixam a camada livre (PiP).
    const kf = cleanLayerKf(m0.kf);
    const m = kf && (kf.pos || kf.scale) && m0.mode !== 'pip'
      ? { ...m0, mode: 'pip', scale: 1, cx: m0.cx ?? 0.5, cy: m0.cy ?? 0.5 } : m0;
    const out = i === vis.length - 1 ? '[vout]' : `[v${i}]`;
    const animIn = LAYER_ANIMATIONS[m.animIn] ? m.animIn : 'none';
    const animOut = LAYER_ANIMATIONS[m.animOut] ? m.animOut : 'none';
    const a = Math.min(clamp(m.animDur, 0.15, 2, 0.4), m.d / 2);
    const op = clamp(m.opacity, 0.1, 1, 1);
    const blend = m.mode !== 'pip' && BLEND_MODES[m.blend]?.neutral ? m.blend : 'normal';
    const pi = progIn(m, a);
    const po = progOut(m, a);
    // curva de movimento da camada (zoom e deslizar); a padrão é a suave de sempre
    const ease = (p) => easeExpr(cleanEase(m.animEase), p);

    // Recorte (Crop) da camada, como no Premiere: as bordas somem (ficam transparentes) e o
    // resto continua do mesmo tamanho e no mesmo lugar.
    const cr = m.crop && typeof m.crop === 'object' ? {
      l: clamp(m.crop.l, 0, 0.45, 0), t: clamp(m.crop.t, 0, 0.45, 0), r: clamp(m.crop.r, 0, 0.45, 0), b: clamp(m.crop.b, 0, 0.45, 0),
    } : null;
    const hasCrop = cr && cr.l + cr.t + cr.r + cr.b > 0.001;
    const src = `[${m._inIdx}:v]`;
    const aspect = m._aspect || null;

    // Tamanho base da camada.
    let chain;
    let w0 = W;
    let h0 = H;
    // com a escala animada, a base é a MAIOR escala (a camada só diminui: não perde nitidez)
    const scaleBase = kf?.scale ? kfMax(kf.scale) : clamp(m.scale, 0.05, 3, 0.4);
    if (m.mode === 'pip') {
      const scale = scaleBase;
      w0 = Math.max(2, Math.round((W * scale) / 2) * 2);
      h0 = aspect ? Math.round((w0 * aspect) / 2) * 2 : null;
      chain = `${src}scale=${w0}:-2,setsar=1`;
    } else {
      chain = `${src}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    }
    chain += layerAdjustVf(m);
    let rgba = false;
    if (hasCrop) {
      const kx = f3(1 - cr.l - cr.r);
      const ky = f3(1 - cr.t - cr.b);
      chain += `,format=rgba,crop=w='trunc(iw*${kx})':h='trunc(ih*${ky})':x='trunc(iw*${f3(cr.l)})':y='trunc(ih*${f3(cr.t)})'`
        + `,pad=w='trunc(iw/${kx})':h='trunc(ih/${ky})':x='trunc(iw*${f3(cr.l)}/${kx})':y='trunc(ih*${f3(cr.t)}/${ky})':color=black@0`;
      rgba = true;
    }
    chain += `,setpts=PTS-STARTPTS+${f3(m.start)}/TB`;
    // Movimento contínuo (float, pulse, wiggle…): expressões por quadro
    const motion = m.motion && m.motion !== 'none' ? m.motion : null;
    const motionOpts = { speed: clamp(m.motionSpeed, 0.2, 5, 1), amp: clamp(m.motionAmp, 0.1, 3, 1) };
    const motionExpr = motion ? elemMotionExpr(motion, `(t-${f3(m.start)})`, motionOpts) : {};

    // Camada animada (quadros-chave, zoom/pop, motion): um quadro da camada para cada quadro do vídeo.
    if (kf || scaleFactor(animIn, pi, ease) || scaleFactor(animOut, po, ease) || motion) chain += `,fps=${f3(fps)}`;

    // Transparência: opacidade fixa (no modo normal) + fades com alpha.
    const QUICK_FADE_IN = new Set(['bounce', 'elastic', 'grow', 'drop', 'whip-left', 'whip-right', 'whip-up', 'whip-down', 'spin', 'blur-in']);
    const fades = [];
    if (animIn === 'fade') fades.push(`fade=t=in:st=${f3(m.start)}:d=${f3(a)}:alpha=1`);
    else if (QUICK_FADE_IN.has(animIn)) fades.push(`fade=t=in:st=${f3(m.start)}:d=${f3(a * 0.35)}:alpha=1`);
    if (animOut === 'fade') fades.push(`fade=t=out:st=${f3(m.end - a)}:d=${f3(a)}:alpha=1`);
    if (fades.length || (op < 0.999 && blend === 'normal') || kf?.opacity) {
      if (!rgba) chain += ',format=rgba';
      rgba = true;
      if (kf?.opacity) {
        // opacidade animada: o alfa de cada pixel × o valor no tempo (T = tempo do vídeo)
        chain += `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${kfExpr(kf.opacity, { tv: 'T', start: m.start })})'`;
      } else if (op < 0.999 && blend === 'normal') chain += `,colorchannelmixer=aa=${f3(op)}`;
      if (fades.length) chain += `,${fades.join(',')}`;
    }
    // Giro (Rotation): os cantos ficam transparentes; no PiP a caixa cresce para caber.
    const rot = clamp(m.rot, -180, 180, 0);
    const hasSpinIn = animIn === 'spin';
    const hasMotionRot = Boolean(motionExpr.rot);
    const rotating = Boolean(kf?.rot) || Math.abs(rot) > 0.05 || hasSpinIn || hasMotionRot;
    if (kf?.rot) {
      const box = m.mode === 'pip' ? `:ow='hypot(iw,ih)':oh='hypot(iw,ih)'` : '';
      chain += `${rgba ? '' : ',format=rgba'},rotate=a='(${kfExpr(kf.rot, { start: m.start })})*PI/180'${box}:c=black@0`;
    } else if (!hasSpinIn && !hasMotionRot && Math.abs(rot) > 0.05) {
      const rad = f3((rot * Math.PI) / 180);
      chain += `${rgba ? '' : ',format=rgba'},rotate=${rad}${m.mode === 'pip' ? `:ow=rotw(${rad}):oh=roth(${rad})` : ''}:c=black@0`;
    } else if (hasSpinIn || hasMotionRot) {
      const rotParts = [];
      if (Math.abs(rot) > 0.05) rotParts.push(f3((rot * Math.PI) / 180));
      if (hasSpinIn) rotParts.push(`(1-${ease(pi)})*${f3(2 * Math.PI)}`);
      if (hasMotionRot) rotParts.push(motionExpr.rot);
      const rotExpr = rotParts.join('+');
      const box = m.mode === 'pip' ? `:ow='hypot(iw,ih)':oh='hypot(iw,ih)'` : '';
      chain += `${rgba ? '' : ',format=rgba'},rotate=a='${rotExpr}'${box}:c=black@0`;
    }

    // Escala animada (zoom/pop/bounce/elastic/grow + motion pulse/breathe), por quadro.
    const sIn = scaleFactor(animIn, pi, ease);
    const sOut = scaleFactor(animOut, po, ease);
    const sKf = kf?.scale ? `(${kfExpr(kf.scale, { start: m.start })})/${f3(scaleBase)}` : null;
    const sMotion = motionExpr.scale || null;
    const S = [sIn, sOut, sKf, sMotion].filter(Boolean).join('*');
    if (S) {
      // girando (caixa maior que a base) ou com escala animada: parte do tamanho que chega
      const base = rotating || sKf ? 'iw' : w0;
      const hExpr = m.mode === 'pip' ? '-2' : `'max(2,round(${H}*${S}/2)*2)'`;
      chain += `,scale=w='max(2,round(${base}*${S}/2)*2)':h=${hExpr}:eval=frame`;
    }
    parts.push(`${chain}[m${i}]`);

    // Posição: no PiP, px/py são a borda superior-esquerda do tamanho FINAL; com
    // zoom/pop a camada cresce a partir do centro desse retângulo.
    let x;
    let y;
    if (kf?.pos) {
      // posição animada: o centro anda pelos quadros-chave
      x = `(${kfExpr(kf.pos, { start: m.start, idx: 0 })})*${W}-w/2`;
      y = `(${kfExpr(kf.pos, { start: m.start, idx: 1 })})*${H}-h/2`;
    } else if (m.mode === 'pip' && Number.isFinite(Number(m.cx)) && Number.isFinite(Number(m.cy))) {
      // Posição livre (arrastada no editor): centro da camada em fração da tela — pode
      // ficar em qualquer lugar, até parcialmente fora do quadro.
      x = `${f3(clamp(m.cx, -1, 2, 0.5) * W)}-w/2`;
      y = `${f3(clamp(m.cy, -1, 2, 0.5) * H)}-h/2`;
    } else if (m.mode === 'pip') {
      const px = f3(clamp(m.px, 0, 1, 0.62));
      const py = f3(clamp(m.py, 0, 1, 0.06));
      x = S ? `(${W}-${w0})*${px}+(${w0}-w)/2` : `(W-w)*${px}`;
      y = S && h0 ? `(${H}-${h0})*${py}+(${h0}-h)/2` : `(H-h)*${py}`;
    } else {
      x = '(W-w)/2';
      y = '(H-h)/2';
    }
    // Deslizar: deslocamento a partir de fora da tela.
    const dx = [];
    const dy = [];
    if (SLIDES[animIn]) {
      const [sx, sy] = SLIDES[animIn];
      if (sx) dx.push(`${sx}*W*(1-${ease(pi)})`);
      if (sy) dy.push(`${sy}*H*(1-${ease(pi)})`);
    }
    if (SLIDES[animOut]) {
      const [sx, sy] = SLIDES[animOut];
      if (sx) dx.push(`${-sx}*W*(1-${ease(po)})`);
      if (sy) dy.push(`${-sy}*H*(1-${ease(po)})`);
    }
    // Chicote (whip): desliza com overshoot (backExpr) a partir de fora da tela
    if (WHIPS[animIn]) {
      const [wx, wy] = WHIPS[animIn];
      if (wx) dx.push(`${wx}*W*(1-${backExpr(pi, 2.5)})`);
      if (wy) dy.push(`${wy}*H*(1-${backExpr(pi, 2.5)})`);
    }
    // Drop: cai de cima com bounce
    if (animIn === 'drop') dy.push(`-H*0.5*(1-${bounceExpr(pi)})`);
    // Movimento contínuo (float, wiggle, drift…)
    if (motionExpr.dx) dx.push(`${motionExpr.dx}*${W}`);
    if (motionExpr.dy) dy.push(`${motionExpr.dy}*${H}`);
    // o avaliador do FFmpeg recusa "+-H" / "+-(": termo negativo vai entre parênteses
    const term = (s) => (s.startsWith('-') && !/^-\d/.test(s) ? `(${s})` : s);
    if (dx.length) x = `${x}+${dx.map(term).join('+')}`;
    if (dy.length) y = `${y}+${dy.map(term).join('+')}`;
    const win = `enable='between(t,${f3(m.start)},${f3(m.end)})'`;
    const pos = `x='round(${x})':y='round(${y})'`;

    if (blend === 'normal') {
      parts.push(`${vlast}[m${i}]overlay=${pos}:${win}${out}`);
    } else {
      const neutral = BLEND_MODES[blend].neutral;
      parts.push(
        `color=c=${neutral}:s=${W}x${H}:r=${fps}:d=${f3(dur)}[cv${i}]`,
        `[cv${i}][m${i}]overlay=${pos}:${win}:eof_action=pass,format=gbrp[mf${i}]`,
        `${vlast}format=gbrp[bs${i}]`,
        `[bs${i}][mf${i}]blend=all_mode=${blend}:all_opacity=${f3(op)}:shortest=1,format=yuv420p${out}`,
      );
    }
    vlast = out;
  });
  return parts;
}

/**
 * Ajustes da camada (imagem/vídeo): brilho (-0,5…0,5), contraste (0,5…2), saturação
 * (0…2) e espelhar. → trecho do filtro (vazio quando não há ajuste). Puro/exportado.
 */
export function layerAdjustVf(m = {}) {
  const b = clamp(m.bright, -0.5, 0.5, 0);
  const c = clamp(m.contrast, 0.5, 2, 1);
  const sat = clamp(m.sat, 0, 2, 1);
  let vf = '';
  if (Math.abs(b) > 0.005 || Math.abs(c - 1) > 0.005 || Math.abs(sat - 1) > 0.005) {
    vf += `,eq=brightness=${f3(b * 0.6)}:contrast=${f3(c)}:saturation=${f3(sat)}`;
  }
  if (m.flip === true) vf += ',hflip';
  return vf;
}

/**
 * Som dos vídeos adicionados (como no CapCut): entra junto, no volume escolhido, sem
 * abaixar sob a voz. `mixed` = rótulo do áudio já pronto (voz + músicas) ou null.
 * → partes do filtro terminando em [aout].
 */
export function videoSoundParts(vidLabels, { mixed, dur }) {
  const tail = `alimiter=limit=0.95,atrim=0:${dur.toFixed(3)}[aout]`;
  const all = [mixed, ...vidLabels].filter(Boolean);
  if (all.length === 1) return [`${all[0]}atrim=0:${dur.toFixed(3)}[aout]`];
  return [`${all.join('')}amix=inputs=${all.length}:normalize=0:dropout_transition=0,${tail}`];
}

/**
 * Aplica as mídias do usuário (imagens, vídeos e músicas próprias) sobre o vídeo.
 *
 * - Imagem/vídeo em modo "cover": cobre o quadro inteiro na janela de tempo.
 * - Imagem/vídeo em modo "pip": aparece menor, numa posição (px, py) da tela.
 * - Áudio: entra como música de fundo, misturada por baixo da voz (volume ajustável)
 *   e com ducking automático enquanto há fala (options.musicDucking).
 *
 * Cada item de options.userMedia já vem RESOLVIDO pelo servidor com { file, kind, ... }
 * (o cliente nunca manda caminho de arquivo). Itens sem arquivo válido são ignorados.
 *
 * @returns {{output:string, applied:boolean, visual:number, audio:number}}
 */
export async function applyUserMedia(input, work, meta, options, onProgress = () => {}) {
  const items = (options.userMedia || []).filter((m) => m && m.file && fs.existsSync(m.file));
  if (!items.length) return { output: input, applied: false, visual: 0, audio: 0 };

  const W = meta.width;
  const H = meta.height;
  const dur = meta.duration;

  // as que vão por baixo do vídeo (V0) já entraram no fundo; aqui só o som dos vídeos delas
  const visual = items.filter((m) => (m.kind === 'image' || m.kind === 'video') && !m.under);
  const underSound = items.filter((m) => m.kind === 'video' && m.under);
  const music = items.filter((m) => m.kind === 'audio');

  // Ordem dos inputs no ffmpeg: 0 = vídeo principal; depois cada mídia na ordem
  // [...visual, ...music]. Guardamos o índice do input de cada item.
  const inputs = [];
  const parts = [];

  // --- Vídeo: encadeia os overlays visuais na ordem (start crescente) ---
  const vis = visual
    .map((m) => {
      const start = clamp(m.start, 0, Math.max(0, dur - 0.05), 0);
      const d = clamp(m.duration, 0.2, dur, m.kind === 'image' ? 4 : 5);
      const end = Math.min(dur, start + d);
      return { ...m, start, end, d: end - start };
    })
    .filter((m) => m.d > 0.05)
    // Camada mais alta é desenhada por último (fica por cima); na mesma camada, por tempo.
    .sort((a, b) => (Number(a.layer) || 0) - (Number(b.layer) || 0) || a.start - b.start);

  for (const m of vis) {
    m._inIdx = inputs.length + 1; // +1 porque 0 é o vídeo principal
    inputs.push(m);
    // PiP com zoom/pop precisa do tamanho final para animar a partir do centro.
    if (m.mode === 'pip' && (ZOOMS.has(m.animIn) || ZOOMS.has(m.animOut))) {
      try {
        const s = await probeSummary(m.file);
        if (s.width && s.height) m._aspect = s.height / s.width;
      } catch { /* sem dimensões → ancora pelo canto, como antes */ }
    }
  }
  parts.push(...visualLayerParts(vis, { W, H, fps: meta.fps || 30, dur }));

  // --- Áudio: mistura as músicas por baixo do áudio original ---
  const musParts = [];
  const musLabels = [];
  music.forEach((m, i) => {
    const inIdx = inputs.length + 1;
    inputs.push(m);
    m._inIdx = inIdx;
    const start = clamp(m.start, 0, Math.max(0, dur - 0.05), 0);
    const vol = clamp(m.volume, 0, 2, 0.35);
    const ms = Math.round(start * 1000);
    // A música toca pela duração escolhida na timeline, com entrada/saída suave (fade).
    const len = clamp(m.duration, 0.2, Math.max(0.2, dur - start), Math.max(0.2, dur - start));
    const fi = clamp(m.fadeIn, 0, len / 2, 0);
    const fo = clamp(m.fadeOut, 0, len / 2, 0);
    // adelay atrasa a música até o start; volume ajusta o nível de fundo.
    musParts.push(
      `[${inIdx}:a]atrim=0:${len.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(3)}` +
        (fi > 0.01 ? `,afade=t=in:st=0:d=${fi.toFixed(2)}` : '') +
        (fo > 0.01 ? `,afade=t=out:st=${(len - fo).toFixed(3)}:d=${fo.toFixed(2)}` : '') +
        (ms > 0 ? `,adelay=${ms}|${ms}` : '') +
        `[am${i}]`,
    );
    musLabels.push(`[am${i}]`);
  });

  // Som dos vídeos adicionados (desligável em cada vídeo): só os que têm faixa de áudio.
  const vidParts = [];
  const vidLabels = [];
  const sounding = [...vis];
  for (const m0 of underSound) {
    const start = clamp(m0.start, 0, Math.max(0, dur - 0.05), 0);
    const end = Math.min(dur, start + clamp(m0.duration, 0.2, dur, 5));
    if (end - start <= 0.05) continue;
    const m = { ...m0, start, end, d: end - start, _inIdx: inputs.length + 1 };
    inputs.push(m);
    sounding.push(m);
  }
  for (const m of sounding) {
    if (m.kind !== 'video' || m.muted === true) continue;
    const vol = clamp(m.volume, 0, 2, 1);
    if (vol < 0.01) continue;
    try {
      if (!(await probeSummary(m.file)).hasAudio) continue;
    } catch { continue; }
    const ms = Math.round(m.start * 1000);
    vidParts.push(
      `[${m._inIdx}:a]atrim=0:${m.d.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(3)}` +
        (ms > 0 ? `,adelay=${ms}|${ms}` : '') + `[av${vidLabels.length}]`,
    );
    vidLabels.push(`[av${vidLabels.length}]`);
  }

  const wantAudioRebuild = music.length > 0 || vidLabels.length > 0;
  if (music.length) {
    parts.push(...musParts);
    const mix = musicMixParts(musLabels, { hasAudio: meta.hasAudio, dur, ducking: options.musicDucking });
    // com som de vídeo, a mistura (voz + música) vira uma entrada da mistura final
    if (vidLabels.length) mix[mix.length - 1] = mix[mix.length - 1].replace(/\[aout\]$/, '[amx]');
    parts.push(...mix);
  }
  if (vidLabels.length) {
    parts.push(...vidParts);
    parts.push(...videoSoundParts(vidLabels, { mixed: music.length ? '[amx]' : meta.hasAudio ? '[0:a]' : null, dur }));
  }

  if (!vis.length && !wantAudioRebuild) return { output: input, applied: false, visual: 0, audio: 0 };

  const scriptPath = path.join(work, 'usermedia_filter.txt');
  fs.writeFileSync(scriptPath, parts.join(';\n'), 'utf8');

  const output = path.join(work, 'usermedia.mp4');
  const args = ['-i', input];
  for (const m of inputs) {
    if (m.kind === 'image') {
      const d = clamp(m.duration, 0.2, dur, 4);
      // imagem na mesma cadência do vídeo (o padrão é 25 qps: animação aos trancos)
      args.push('-framerate', f3(meta.fps || 30), '-loop', '1', '-t', d.toFixed(2));
    } else {
      // Vídeo/música aparado na ponta esquerda (ou dividido): começa deste ponto do arquivo.
      const offset = clamp(m.offset, 0, 100000, 0);
      if (offset > 0.01) args.push('-ss', offset.toFixed(3));
    }
    args.push('-i', m.file);
  }
  args.push('-filter_complex_script', scriptPath);
  args.push('-map', vis.length ? '[vout]' : '0:v');
  if (wantAudioRebuild) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '160k');
  else if (meta.hasAudio) args.push('-map', '0:a', '-c:a', 'copy');
  args.push(...x264Fast(), '-movflags', '+faststart', '-t', dur.toFixed(3), '-y', output);

  await runFfmpeg(args, { label: 'usermedia', totalDuration: dur, onProgress });
  log.ok(`mídias do usuário aplicadas: ${vis.length} visuais, ${music.length} música(s)${vidLabels.length ? `, som de ${vidLabels.length} vídeo(s)` : ''}`);
  return { output, applied: true, visual: vis.length, audio: music.length };
}
