import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { makeLogger } from '../logger.js';

const log = makeLogger('auto-color');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Amostra frames do vídeo (via ffmpeg → rawvideo rgb24 reduzido) e calcula
 * estatísticas globais de cor/luz. Base da decisão do grade.
 * @returns {Promise<object>} stats
 */
export function sampleFrameStats(input, { size = 48, everySec = 2, maxFrames = 120 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-nostdin', '-i', input,
      '-vf', `fps=1/${everySec},scale=${size}:${size}:flags=area,format=rgb24`,
      '-frames:v', String(maxFrames),
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ];
    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    let err = '';
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (buf.length < 3) return reject(new Error(`amostragem de frames falhou (code ${code})`));
      resolve(computeStats(buf, size));
    });
  });
}

/**
 * Estatísticas a partir do buffer rgb24 (puro; testável). `width` = largura da imagem
 * (os frames amostrados são quadrados `size`×`size`, empilhados) — usado para as bordas.
 */
export function computeStats(buf, width = 0) {
  const n = Math.floor(buf.length / 3);
  let sR = 0, sG = 0, sB = 0, sL = 0, sL2 = 0, sSat = 0, shadow = 0, high = 0;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sR += r; sG += g; sB += b; sL += l; sL2 += l * l;
    sSat += mx === 0 ? 0 : (mx - mn) / mx;
    if (l < 45) shadow++;
    if (l > 215) high++;
  }
  const meanR = sR / n, meanG = sG / n, meanB = sB / n;
  const luma = sL / n;
  const variance = Math.max(0, sL2 / n - luma * luma);

  // Iluminante pelas BORDAS (gray-edge): a média das diferenças entre vizinhos é
  // neutra numa cena com luz branca. Uma parede/fundo colorido grande não tem borda,
  // então não "puxa" a cor (o problema do gray-world).
  let eR = 0, eG = 0, eB = 0, eN = 0;
  const w = width > 1 ? width : Math.round(Math.sqrt(n));
  const rows = Math.floor(n / w);
  const sq = (a, b) => (a - b) * (a - b);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const lum0 = lum[i];
      if (lum0 < 20 || lum0 > 245) continue; // preto/estourado não informam a cor da luz
      for (const j of [x + 1 < w ? i + 1 : -1, y + 1 < rows && (y + 1) % w !== 0 ? i + w : -1]) {
        if (j < 0) continue;
        eR += sq(buf[i * 3], buf[j * 3]); eG += sq(buf[i * 3 + 1], buf[j * 3 + 1]); eB += sq(buf[i * 3 + 2], buf[j * 3 + 2]); eN++;
      }
    }
  }
  // Brancos da cena: entre os 15% mais claros (sem estourar), os MENOS saturados — os
  // brancos/cinzas de verdade. Uma parede bege ou pele clara (mais saturadas) ficam de fora.
  const order = [];
  for (let i = 0; i < n; i++) if (lum[i] < 250) order.push(i);
  order.sort((a, b) => lum[b] - lum[a]); // ranking exato (uma área grande de mesma luz não entra inteira)
  const bright = order.slice(0, Math.max(1, Math.round(order.length * 0.15))).map((i) => {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    const mx = Math.max(r, g, b);
    return { i, sat: mx ? (mx - Math.min(r, g, b)) / mx : 0 };
  });
  bright.sort((a, b) => a.sat - b.sat);
  const pick = bright.slice(0, Math.max(1, Math.round(bright.length * 0.3)));
  let wR = 0, wG = 0, wB = 0;
  for (const { i } of pick) { wR += buf[i * 3]; wG += buf[i * 3 + 1]; wB += buf[i * 3 + 2]; }
  const wN = bright.length ? pick.length : 0;
  const whiteSat = wN ? pick.reduce((s, p) => s + p.sat, 0) / wN : 1;
  return {
    pixels: n,
    meanR: r2(meanR), meanG: r2(meanG), meanB: r2(meanB),
    luma: r2(luma),
    contrast: r2(Math.sqrt(variance)), // desvio-padrão da luminância (0–~110)
    saturation: r3(sSat / n), // 0–1
    shadowFrac: r3(shadow / n),
    highlightFrac: r3(high / n),
    warmBias: r2(meanR - meanB), // >0 quente, <0 frio
    edge: eN ? { r: r2(Math.sqrt(eR / eN)), g: r2(Math.sqrt(eG / eN)), b: r2(Math.sqrt(eB / eN)) } : null,
    white: wN ? { r: r2(wR / wN), g: r2(wG / wN), b: r2(wB / wN), sat: r3(whiteSat) } : null,
  };
}

/**
 * Grade automático NATURAL: corrige o que está errado (cor da luz, exposição) e dá um
 * acabamento leve — sem "look" artificial. Looks fortes (teal & orange etc.) ficam como
 * opção manual. Puro/exportado para teste. Retorna a cadeia FFmpeg + o resumo.
 */
export function computeGrade(stats) {
  // 1) Balanço de branco: média das duas estimativas da cor da luz (bordas + brancos).
  // A estimativa pelas bordas fica só no relatório: em cenas com muita cor ela erra.
  // Branco "tingido" demais (saturação > 0,35) não é branco: não corrige.
  const est = [stats.white].filter((e) => e && e.r > 0 && e.g > 0 && e.b > 0 && (e.sat ?? 0) <= 0.35);
  let gR = 1, gG = 1, gB = 1;
  if (est.length) {
    const ratio = (c) => est.reduce((s, e) => s + e[c] / ((e.r + e.g + e.b) / 3), 0) / est.length;
    const [cr, cg, cb] = [ratio('r'), ratio('g'), ratio('b')];
    const castSize = Math.max(Math.abs(cr - 1), Math.abs(cg - 1), Math.abs(cb - 1));
    if (castSize > 0.03) { // abaixo disso a luz já é neutra: não mexe
      const strength = 0.9;
      const gain = (c) => clamp(1 + strength * (1 / c - 1), 0.72, 1.35);
      gR = gain(cr); gG = gain(cg); gB = gain(cb);
      // normaliza para não clarear/escurecer a imagem ao corrigir a cor
      const norm = 0.299 * gR + 0.587 * gG + 0.114 * gB;
      gR /= norm; gG /= norm; gB /= norm;
    }
  }

  // 2) Exposição pelos tons médios (gamma), sem levantar o preto nem estourar o branco.
  let gamma = 1;
  const L = clamp(stats.luma, 8, 247) / 255;
  if (stats.luma < 100 || stats.luma > 160) {
    const target = (stats.luma + (118 - stats.luma) * 0.75) / 255;
    gamma = clamp(Math.log(L) / Math.log(target), 0.8, 1.6);
  }
  // 3) Contraste leve só quando a imagem está "lavada"; saturação discreta.
  const contrast = stats.contrast < 40 ? clamp(1 + (40 - stats.contrast) / 40 * 0.12, 1, 1.1) : 1.02;
  let saturation = 1.05;
  if (stats.saturation < 0.18) saturation = 1.12;
  else if (stats.saturation > 0.45) saturation = 1;

  const vf = [
    gR !== 1 || gG !== 1 || gB !== 1 ? `colorchannelmixer=rr=${r3(gR)}:gg=${r3(gG)}:bb=${r3(gB)}` : null,
    `eq=contrast=${r3(contrast)}:saturation=${r3(saturation)}:gamma=${r3(gamma)}`,
  ].filter(Boolean).join(',');

  return {
    vf,
    look: 'natural',
    adjustments: {
      whiteBalance: { rGain: r3(gR), gGain: r3(gG), bGain: r3(gB) },
      contrast: r3(contrast),
      saturation: r3(saturation),
      gamma: r3(gamma),
      look: 'natural',
    },
  };
}

/** Analisa o vídeo e devolve o grade calculado. */
export async function analyzeAndGrade(input, opts) {
  const stats = await sampleFrameStats(input, opts);
  const grade = computeGrade(stats);
  log.ok(`grade por IA: look=${grade.look} wb=${JSON.stringify(grade.adjustments.whiteBalance)} sat=${grade.adjustments.saturation}`);
  return { stats, ...grade };
}
