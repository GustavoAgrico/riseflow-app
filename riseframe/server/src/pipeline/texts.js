import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg, x264Fast } from './ffmpeg.js';
import { fontsDirArg, jobFontsDir } from './captions.js';
import { fontById, fontStyles } from '../../../shared/captionStyle.js';
import { textBoxMetrics, textLook, textEm, textShown, lineAlign, revealPlan, letterPlan, letterTiming, letterSegments, LETTER_ANIMS, LETTER_SAMPLED, expandCounterLayers } from '../../../shared/textLayers.js';
import { fontMetrics, fontMetricsFile } from './fontMetrics.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('texts');

const ANIM_MS = 350;

function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cs = Math.round((s % 60) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(cs / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
/** "#RRGGBB" → cor ASS "&H00BBGGRR". */
function assColor(hex) {
  const h = String(hex).replace('#', '').padStart(6, '0');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}
/** Texto seguro para o ASS: sem chaves (viram tags) e com quebra de linha \N. */
function assText(t) {
  return String(t).replace(/[{}]/g, '').replace(/\\/g, '').split('\n').map((l) => l.trim()).join('\\N');
}

/**
 * Retângulo de cantos arredondados (desenho ASS, origem no canto de cima à esquerda). As
 * curvas usam o ponto de controle do arco de círculo (0,552), igual ao border-radius do CSS.
 */
function roundRect(W, H, r) {
  const q = (v) => Math.round(v);
  r = Math.max(0, Math.min(r, W / 2, H / 2));
  const k = r * 0.4477; // r × (1 − 0,5523)
  return `m ${q(r)} 0 l ${q(W - r)} 0 b ${q(W - k)} 0 ${q(W)} ${q(k)} ${q(W)} ${q(r)} l ${q(W)} ${q(H - r)} b ${q(W)} ${q(H - k)} ${q(W - k)} ${q(H)} ${q(W - r)} ${q(H)} `
    + `l ${q(r)} ${q(H)} b ${q(k)} ${q(H)} 0 ${q(H - k)} 0 ${q(H - r)} l 0 ${q(r)} b 0 ${q(k)} ${q(k)} 0 ${q(r)} 0`;
}

/** Elipse (desenho ASS, origem no canto de cima à esquerda), com as curvas do CSS. */
function ellipse(W, H) {
  const q = (v) => Math.round(v);
  const k = 0.5523;
  const rx = W / 2;
  const ry = H / 2;
  return `m ${q(rx)} 0 b ${q(rx + rx * k)} 0 ${q(W)} ${q(ry - ry * k)} ${q(W)} ${q(ry)} b ${q(W)} ${q(ry + ry * k)} ${q(rx + rx * k)} ${q(H)} ${q(rx)} ${q(H)} `
    + `b ${q(rx - rx * k)} ${q(H)} 0 ${q(ry + ry * k)} 0 ${q(ry)} b 0 ${q(ry - ry * k)} ${q(rx - rx * k)} 0 ${q(rx)} 0`;
}

/**
 * Tags de uma letra (evento próprio, \\an5 no centro dela). Os tempos são de dentro do evento
 * (a letra começa no seu instante). Mesma conta da prévia: letrFrame em shared/textLayers.js.
 */
/** Pose de uma letra num passo amostrado (posição, escala, alfa e desfoque do quadro). */
function letterPose(f, px, py, H, W, col, outCol) {
  const a = Math.round((1 - f.alpha) * 255).toString(16).toUpperCase().padStart(2, '0');
  const sc = Math.round(f.scale * 100);
  return `\\an5\\bord0\\shad0\\1c${col}&\\3c${outCol}&\\pos(${Math.round(px + (f.dx || 0) * W)},${Math.round(py + f.dy * H)})\\fscx${sc}\\fscy${sc}\\alpha&H${a}&\\blur${Math.round(f.blur * H)}`;
}
function letterTags(anim, px, py, dMs, off, col, outCol) {
  const base = `\\an5\\bord0\\shad0\\1c${col}&\\3c${outCol}&`;
  if (anim === 'letras-subir') return `${base}\\move(${px},${py + off},${px},${py},0,${Math.round(dMs)})\\alpha&HFF&\\t(0,${Math.round(dMs)},\\alpha&H00&)`;
  if (anim === 'letras-pop') {
    const d1 = Math.round(dMs * 0.6);
    return `${base}\\pos(${px},${py})\\fscx0\\fscy0\\t(0,${d1},\\fscx115\\fscy115)\\t(${d1},${Math.round(dMs)},\\fscx100\\fscy100)`;
  }
  return `${base}\\pos(${px},${py})\\blur8\\alpha&HFF&\\t(0,${Math.round(dMs)},\\blur0\\alpha&H00&)`;
}

/**
 * Monta o .ass dos textos livres. Puro/exportado para teste. MESMO desenho da prévia
 * (StageLayers no editor): o tamanho é o "em" do CSS (no ASS vira em × célula da fonte),
 * cada linha é um evento com a altura de linha do CSS, e a caixa de cada linha é desenhada
 * do tamanho do texto (larguras reais das letras), com a folga e os cantos escolhidos.
 * Animações com \fad, \t e \move — o mesmo motor (libass) e as mesmas fontes das legendas.
 */
export function buildTextAss(rawLayers, meta) {
  const layers = expandCounterLayers(rawLayers);
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const styles = [];
  const events = [];
  const alpha = (op) => `&H${Math.round((1 - Math.max(0, Math.min(1, op))) * 255).toString(16).padStart(2, '0').toUpperCase()}&`;
  const bgr = (hex) => assColor(hex).replace('&H00', '&H');
  layers.forEach((l, i) => {
    const L = textLook(l);
    if (l.kind === 'shape') {
      // forma (retângulo/elipse): preenchimento, contorno por fora, sombra, giro e opacidade
      const durMs = Math.round((l.end - l.start) * 1000);
      const a = Math.min(ANIM_MS, Math.floor(durMs / 3));
      const bw = l.w * W;
      const bh = l.h * H;
      const cx = l.x * W;
      const cy = l.y * H;
      const shape = l.shape === 'ellipse' ? ellipse(bw, bh) : roundRect(bw, bh, (Number(l.radius) || 0) * Math.min(bw, bh) / 2);
      const fin = ['fade', 'slide-up', 'slide-left', 'zoom'].includes(l.animIn) ? a : 0;
      const fout = l.animOut === 'fade' ? a : 0;
      const rotT = L.rot ? `\\org(${Math.round(cx)},${Math.round(cy)})\\frz${(-L.rot).toFixed(2)}` : '';
      // câmera: a forma escala em torno do centro (camFrom → camTo, linear, na duração da cena)
      const camF = Number(l.camFrom) || 1;
      const camT = Number(l.camTo) || 1;
      const cam = camF !== 1 || camT !== 1;
      const camTags = (px, py) => {
        const x0 = Math.round(px - (bw * camF) / 2);
        const y0 = Math.round(py - (bh * camF) / 2);
        const x1 = Math.round(px - (bw * camT) / 2);
        const y1 = Math.round(py - (bh * camT) / 2);
        return `\\move(${x0},${y0},${x1},${y1},0,${durMs})\\fscx${(camF * 100).toFixed(2)}\\fscy${(camF * 100).toFixed(2)}\\t(0,${durMs},\\fscx${(camT * 100).toFixed(2)}\\fscy${(camT * 100).toFixed(2)})`;
      };
      const base = (px, py) => `\\an7${cam ? camTags(px, py) : `\\pos(${Math.round(px - bw / 2)},${Math.round(py - bh / 2)})`}${rotT}${fin || fout ? `\\fad(${fin},${fout})` : ''}\\shad0`;
      const bord = L.stroke ? +(L.strokeW * H).toFixed(2) : 0;
      if (L.shadow) {
        const dx = -Math.cos((L.shadowAngle * Math.PI) / 180) * L.shadowDist * H;
        const dy = Math.sin((L.shadowAngle * Math.PI) / 180) * L.shadowDist * H;
        const sa = alpha(L.shadowOpacity * L.opacity);
        events.push(`Dialogue: ${i * 4},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${base(cx + dx, cy + dy)}\\bord${bord}\\blur${(L.shadowBlur * H).toFixed(1)}\\1c${bgr(L.shadowColor)}&\\3c${bgr(L.shadowColor)}&\\1a${sa}\\3a${sa}\\p1}${shape}`);
      }
      events.push(`Dialogue: ${i * 4 + 3},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${base(cx, cy)}\\bord${bord}\\1c${bgr(L.fillColor)}&\\3c${bgr(L.strokeColor)}&\\1a${L.fill ? alpha(L.opacity) : '&HFF&'}\\3a${alpha(L.opacity)}\\p1}${shape}`);
      return;
    }
    const custom = l.fontFile && l.fontFamily;
    const st = !custom && l.fontStyle ? fontStyles(l.font).find((x) => x.id === l.fontStyle) : null;
    const f = custom ? { family: l.fontFamily, bold: false } : st ? { family: st.family, bold: false } : fontById(l.font);
    const FM = custom ? fontMetricsFile(l.fontFile) : fontMetrics(f.family);
    const em = textEm(l) * H; // = font-size do CSS, em px do quadro
    const emBase = (Number(l.size) || 0.05) * L.scale * H;
    const size = Math.max(8, Math.round(em * FM.cell));
    const bold = f.bold === false && !L.bold ? 0 : -1; // negrito falso = o do libass
    const sp = (L.tracking / 1000) * em; // espaçamento entre letras (px)
    // contorno: "fora" = a borda inteira para fora da letra; "centro" = metade
    const bord = L.stroke ? +(L.strokeW * H * (L.strokePos === 'center' ? 0.5 : 1)).toFixed(2) : 0;
    styles.push(`Style: T${i},${f.family},${size},${assColor(L.fillColor)},${assColor(L.fillColor)},${assColor(L.strokeColor)},&H00000000,${bold},${L.italic ? -1 : 0},${L.underline ? -1 : 0},0,100,100,${sp ? sp.toFixed(2) : 0},0,1,${bord},0,5,0,0,0,1`);
    const g = textBoxMetrics(l);
    const x = l.x * W;
    const y = l.y * H;
    const durMs = Math.round((l.end - l.start) * 1000);
    const a = Math.min(ANIM_MS, Math.floor(durMs / 3));
    const rot = L.rot ? `\\frz${(-L.rot).toFixed(2)}` : '';
    // mesma animação em cada pedaço (sombra, caixa e texto de cada linha)
    const tagsAt = (px0, py0, org) => {
      const px = Math.round(px0);
      const py = Math.round(py0);
      const tags = [];
      if (l.animIn === 'slide-up') tags.push(`\\an5\\move(${px},${py + Math.round(H * 0.06)},${px},${py},0,${a})`);
      else if (l.animIn === 'slide-left') tags.push(`\\an5\\move(${px + Math.round(W * 0.2)},${py},${px},${py},0,${a})`);
      else tags.push(`\\an5\\pos(${px},${py})`);
      if (rot) tags.push(`\\org(${Math.round(org[0])},${Math.round(org[1])})${rot}`);
      const fin = ['fade', 'slide-up', 'slide-left', 'zoom'].includes(l.animIn) ? a : 0;
      const fout = l.animOut === 'fade' ? a : 0;
      if (fin || fout) tags.push(`\\fad(${fin},${fout})`);
      if (l.animIn === 'pop') tags.push(`\\fscx0\\fscy0\\t(0,${Math.round(a * 0.6)},\\fscx115\\fscy115)\\t(${Math.round(a * 0.6)},${a},\\fscx100\\fscy100)`);
      if (l.animIn === 'zoom') tags.push(`\\fscx60\\fscy60\\t(0,${a},\\fscx100\\fscy100)`);
      if (l.animOut === 'zoom') tags.push(`\\t(${durMs - a},${durMs},\\fscx0\\fscy0)`);
      return tags.join('');
    };
    const clean = (t) => String(t).replace(/[{}]/g, '').replace(/\\/g, '');
    const lines = clean(textShown(l)).split('\n');
    // máquina de escrever / palavra por palavra: cada pedaço fica invisível até a sua vez
    const plan = L.smallCaps ? null : revealPlan(l, lines);
    const letters = L.smallCaps ? null : letterPlan(l, lines);
    const revealAss = (j, a1, a3) => plan[j].map(({ u, t }) => (t == null ? u : `{\\1a&HFF&\\3a&HFF&\\t(${Math.round(t * 1000)},${Math.round(t * 1000) + 1},\\1a${a1}\\3a${a3})}${u}`)).join('');
    // versalete: minúsculas viram maiúsculas menores (78%)
    const SC = 0.78;
    const runs = (line) => (L.smallCaps ? line.match(/[a-zà-ÿ]+|[^a-zà-ÿ]+/g) || [] : [line]);
    const lineW = (line) => runs(line).reduce((w, r) => w + (L.smallCaps && /[a-zà-ÿ]/.test(r[0]) ? FM.width(r.toUpperCase()) * SC : FM.width(r)), 0) * em + sp * [...line].length;
    const lineAss = (line) => (L.smallCaps ? runs(line).map((r) => (/[a-zà-ÿ]/.test(r[0]) ? `{\\fscx${SC * 100}\\fscy${SC * 100}}${r.toUpperCase()}{\\fscx100\\fscy100}` : r)).join('') : line);
    const basePitch = g.pitch * em;
    const lead = L.leading * H;
    const blockH = lines.length * basePitch + Math.max(0, lines.length - 1) * lead;
    const top = (L.valign === 'top' ? y : L.valign === 'bottom' ? y - blockH : y - blockH / 2)
      + L.baseline * H + (L.script === 'super' ? -0.33 * emBase : L.script === 'sub' ? 0.12 * emBase : 0);
    const padW = g.padX * em * 2;
    const units = lines.map((line) => (line.trim() ? lineW(line) + (L.bg && !g.block ? padW : 0) : 0));
    const blockW = Math.max(0, ...units);
    const org = [x, top + blockH / 2];
    const sh = L.shadow ? { dx: -Math.cos((L.shadowAngle * Math.PI) / 180) * L.shadowDist * H, dy: Math.sin((L.shadowAngle * Math.PI) / 180) * L.shadowDist * H } : null;
    const fillA = L.fill ? alpha(L.opacity) : '&HFF&';
    if (L.bg && g.block && units.some((u) => u > 0)) {
      // fundo inteiro: uma forma do tamanho do bloco (+ a folga nos 4 lados), como o
      // "Background" do Premiere — a entrelinha não mexe nele além do próprio bloco
      const bw0 = blockW + 2 * g.padX * em;
      const bh0 = blockH + 2 * g.padY * em;
      const shape = roundRect(bw0, bh0, g.r * Math.min(bw0, bh0) / 2);
      const cyB = top + blockH / 2;
      if (sh) events.push(`Dialogue: ${i * 4},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${tagsAt(x + sh.dx, cyB + sh.dy, [org[0] + sh.dx, org[1] + sh.dy])}\\bord0\\shad0\\blur${(L.shadowBlur * H).toFixed(1)}\\1c${bgr(L.shadowColor)}&\\1a${alpha(L.shadowOpacity * L.opacity)}\\p1}${shape}`);
      events.push(`Dialogue: ${i * 4 + 1},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${tagsAt(x, cyB, org)}\\bord0\\shad0\\1c${bgr(L.bgColor)}&\\1a${alpha(L.bgOpacity * L.opacity)}\\p1}${shape}`);
    }
    lines.forEach((line, j) => {
      if (!line.trim()) return;
      const al = lineAlign(L.align, j === lines.length - 1);
      const u = units[j];
      const cx = al === 'left' ? x - blockW / 2 + u / 2 : al === 'right' ? x + blockW / 2 - u / 2 : x;
      const cy = top + j * (basePitch + lead) + basePitch / 2;
      const ty = cy + FM.cssBase * em - FM.assBase * em;
      const shape = L.bg && !g.block ? roundRect(lineW(line) + padW, g.boxH * em, g.r * em) : null;
      if (sh && (shape || !L.bg)) {
        // sombra: uma cópia por baixo, deslocada e desfocada (como a do Premiere)
        const blur = (L.shadowBlur * H).toFixed(1);
        const sa = alpha(L.shadowOpacity * L.opacity);
        if (shape) events.push(`Dialogue: ${i * 4},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${tagsAt(cx + sh.dx, cy + sh.dy, [org[0] + sh.dx, org[1] + sh.dy])}\\bord0\\shad0\\blur${blur}\\1c${bgr(L.shadowColor)}&\\1a${sa}\\p1}${shape}`);
        else events.push(`Dialogue: ${i * 4},${assTime(l.start)},${assTime(l.end)},T${i},,0,0,0,,{${tagsAt(cx + sh.dx, ty + sh.dy, [org[0] + sh.dx, org[1] + sh.dy])}\\blur${blur}\\1c${bgr(L.shadowColor)}&\\3c${bgr(L.shadowColor)}&\\1a${sa}\\3a${sa}}${plan ? revealAss(j, sa, sa) : lineAss(line)}`);
      }
      if (shape) {
        events.push(`Dialogue: ${i * 4 + 1},${assTime(l.start)},${assTime(l.end)},TBox,,0,0,0,,{${tagsAt(cx, cy, org)}\\bord0\\shad0\\1c${bgr(L.bgColor)}&\\1a${alpha(L.bgOpacity * L.opacity)}\\p1}${shape}`);
      }
      if (letters) {
        // animação por letra: cada letra é um evento com a sua posição e o seu tempo
        const lx = cx - lineW(line) / 2;
        let pre = '';
        [...line].forEach((ch, k) => {
          const adv = FM.width(ch) * em;
          const cxk = lx + FM.width(pre) * em + sp * [...pre].length + adv / 2;
          pre += ch;
          const c = letters[j][k];
          if (!c || c.t == null || !ch.trim()) return;
          const fillC = bgr(L.fillColor);
          const outC = L.stroke ? bgr(L.strokeColor) : fillC;
          if (LETTER_SAMPLED.includes(l.animIn)) {
            // curva amostrada em passos (overshoot, desfoque): um evento por passo, com a pose do instante
            for (const st of letterSegments(l.animIn, c.d, 10, l)) {
              const t1 = st.t1 == null ? l.end : l.start + c.t + st.t1;
              events.push(`Dialogue: ${i * 4 + 3},${assTime(l.start + c.t + st.t0)},${assTime(t1)},T${i},,0,0,0,,{${letterPose(st.f, Math.round(cxk), Math.round(ty), H, W, fillC, outC)}}${clean(ch)}`);
            }
          } else {
            events.push(`Dialogue: ${i * 4 + 3},${assTime(l.start + c.t)},${assTime(l.end)},T${i},,0,0,0,,{${letterTags(l.animIn, Math.round(cxk), Math.round(ty), c.d * 1000, Math.round(H * 0.06), fillC, outC)}}${clean(ch)}`);
          }
        });
        return;
      }
      events.push(`Dialogue: ${i * 4 + 3},${assTime(l.start)},${assTime(l.end)},T${i},,0,0,0,,{${tagsAt(cx, ty, org)}\\1a${fillA}\\3a${alpha(L.opacity)}}${plan ? revealAss(j, fillA, alpha(L.opacity)) : lineAss(line)}`);
    });
  });
  styles.push('Style: TBox,Arial,20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

/**
 * Filtro dos textos livres (escreve o texts.ass na pasta do job): entra na MESMA passada
 * das legendas (uma recodificação do vídeo inteiro a menos). Rodar com cwd = work.
 */
export async function textsVf(work, meta, layers) {
  if (!layers?.length) return null;
  const NAME = 'texts.ass';
  await fs.writeFile(path.join(work, NAME), buildTextAss(layers, meta), 'utf8');
  const own = layers.map((l) => l.fontFile).filter(Boolean);
  const fontsRel = own.length ? await fontsDirArg(work, await jobFontsDir(work, own)) : await fontsDirArg(work);
  return `subtitles=${NAME}:fontsdir=${fontsRel}`;
}

/** Queima os textos livres no vídeo (por cima das legendas). */
export async function burnTexts(input, work, meta, layers, onProgress) {
  if (!layers?.length) return { output: input, count: 0 };
  const output = path.join(work, 'texts.mp4');
  // cwd = pasta do job e o .ass pelo nome relativo (igual às legendas: sem drive/espaços).
  const args = ['-i', input, '-vf', await textsVf(work, meta, layers), ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'texts', totalDuration: meta.duration, onProgress, cwd: work });
  log.ok(`textos queimados: ${layers.length}`);
  return { output, count: layers.length };
}
