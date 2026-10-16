import path from 'node:path';
import fs from 'node:fs';
import { runFfmpeg, x264Fast, probeSummary } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

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

const ZOOMS = new Set(['zoom', 'pop']);
const SLIDES = { 'slide-left': [1, 0], 'slide-right': [-1, 0], 'slide-up': [0, 1], 'slide-down': [0, -1] };

const f3 = (n) => Number(n).toFixed(3);
/** Progresso 0→1 da entrada e 1→0 da saída (expressões em t). */
const progIn = (m, a) => `min(1,max(0,(t-${f3(m.start)})/${f3(a)}))`;
const progOut = (m, a) => `min(1,max(0,(${f3(m.end)}-t)/${f3(a)}))`;
/** Desaceleração (ease-out cúbica). */
const ease = (p) => `(1-pow(1-${p},3))`;
/** Fator de escala da animação: zoom cresce de 60%; pop passa de 112% e assenta em 100%. */
function scaleFactor(anim, p) {
  if (anim === 'zoom') return `(0.6+0.4*${ease(p)})`;
  if (anim === 'pop') return `max(0.05,if(lt(${p},0.7),1.12*${p}/0.7,1.12-0.12*(${p}-0.7)/0.3))`;
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
  vis.forEach((m, i) => {
    const out = i === vis.length - 1 ? '[vout]' : `[v${i}]`;
    const animIn = LAYER_ANIMATIONS[m.animIn] ? m.animIn : 'none';
    const animOut = LAYER_ANIMATIONS[m.animOut] ? m.animOut : 'none';
    const a = Math.min(clamp(m.animDur, 0.15, 2, 0.4), m.d / 2);
    const op = clamp(m.opacity, 0.1, 1, 1);
    const blend = m.mode !== 'pip' && BLEND_MODES[m.blend]?.neutral ? m.blend : 'normal';
    const pi = progIn(m, a);
    const po = progOut(m, a);

    // Tamanho base da camada.
    let chain;
    let w0 = W;
    let h0 = H;
    if (m.mode === 'pip') {
      const scale = clamp(m.scale, 0.15, 0.95, 0.4);
      w0 = Math.round((W * scale) / 2) * 2;
      h0 = m._aspect ? Math.round((w0 * m._aspect) / 2) * 2 : null;
      chain = `[${m._inIdx}:v]scale=${w0}:-2,setsar=1`;
    } else {
      chain = `[${m._inIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    }
    chain += `,setpts=PTS-STARTPTS+${f3(m.start)}/TB`;

    // Transparência: opacidade fixa (no modo normal) + fades com alpha.
    const fades = [];
    if (animIn === 'fade') fades.push(`fade=t=in:st=${f3(m.start)}:d=${f3(a)}:alpha=1`);
    if (animOut === 'fade') fades.push(`fade=t=out:st=${f3(m.end - a)}:d=${f3(a)}:alpha=1`);
    if (fades.length || (op < 0.999 && blend === 'normal')) {
      chain += ',format=rgba';
      if (op < 0.999 && blend === 'normal') chain += `,colorchannelmixer=aa=${f3(op)}`;
      if (fades.length) chain += `,${fades.join(',')}`;
    }

    // Escala animada (zoom/pop), por quadro.
    const sIn = scaleFactor(animIn, pi);
    const sOut = scaleFactor(animOut, po);
    const S = [sIn, sOut].filter(Boolean).join('*');
    if (S) {
      const hExpr = m.mode === 'pip' ? '-2' : `'max(2,round(${H}*${S}/2)*2)'`;
      chain += `,scale=w='max(2,round(${w0}*${S}/2)*2)':h=${hExpr}:eval=frame`;
    }
    parts.push(`${chain}[m${i}]`);

    // Posição: no PiP, px/py são a borda superior-esquerda do tamanho FINAL; com
    // zoom/pop a camada cresce a partir do centro desse retângulo.
    let x;
    let y;
    if (m.mode === 'pip') {
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
      // sai na direção do movimento (deslizar ← sai pela esquerda)
      if (sx) dx.push(`${-sx}*W*(1-${ease(po)})`);
      if (sy) dy.push(`${-sy}*H*(1-${ease(po)})`);
    }
    if (dx.length) x = `${x}+${dx.join('+')}`;
    if (dy.length) y = `${y}+${dy.join('+')}`;
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

  const visual = items.filter((m) => m.kind === 'image' || m.kind === 'video');
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
    // adelay atrasa a música até o start; volume ajusta o nível de fundo.
    musParts.push(
      `[${inIdx}:a]asetpts=PTS-STARTPTS,volume=${vol.toFixed(3)}` +
        (ms > 0 ? `,adelay=${ms}|${ms}` : '') +
        `[am${i}]`,
    );
    musLabels.push(`[am${i}]`);
  });

  const wantAudioRebuild = music.length > 0;
  if (wantAudioRebuild) {
    parts.push(...musParts);
    parts.push(...musicMixParts(musLabels, { hasAudio: meta.hasAudio, dur, ducking: options.musicDucking }));
  }

  if (!vis.length && !wantAudioRebuild) return { output: input, applied: false, visual: 0, audio: 0 };

  const scriptPath = path.join(work, 'usermedia_filter.txt');
  fs.writeFileSync(scriptPath, parts.join(';\n'), 'utf8');

  const output = path.join(work, 'usermedia.mp4');
  const args = ['-i', input];
  for (const m of inputs) {
    if (m.kind === 'image') {
      const d = clamp(m.duration, 0.2, dur, 4);
      args.push('-loop', '1', '-t', d.toFixed(2));
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
  log.ok(`mídias do usuário aplicadas: ${vis.length} visuais, ${music.length} música(s)`);
  return { output, applied: true, visual: vis.length, audio: music.length };
}
