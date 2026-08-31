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
      resolve(computeStats(buf));
    });
  });
}

/** Estatísticas a partir do buffer rgb24 (puro; testável). */
export function computeStats(buf) {
  const n = Math.floor(buf.length / 3);
  let sR = 0, sG = 0, sB = 0, sL = 0, sL2 = 0, sSat = 0, shadow = 0, high = 0;
  for (let i = 0; i < n; i++) {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sR += r; sG += g; sB += b; sL += l; sL2 += l * l;
    sSat += mx === 0 ? 0 : (mx - mn) / mx;
    if (l < 45) shadow++;
    if (l > 215) high++;
  }
  const meanR = sR / n, meanG = sG / n, meanB = sB / n;
  const luma = sL / n;
  const variance = Math.max(0, sL2 / n - luma * luma);
  return {
    pixels: n,
    meanR: r2(meanR), meanG: r2(meanG), meanB: r2(meanB),
    luma: r2(luma),
    contrast: r2(Math.sqrt(variance)), // desvio-padrão da luminância (0–~110)
    saturation: r3(sSat / n), // 0–1
    shadowFrac: r3(shadow / n),
    highlightFrac: r3(high / n),
    warmBias: r2(meanR - meanB), // >0 quente, <0 frio
  };
}

/**
 * Calcula o grade (correção técnica + look cinematográfico) a partir das stats.
 * Puro/exportado para teste. Retorna a cadeia de filtros FFmpeg + o resumo das
 * decisões (para o relatório/UI).
 */
export function computeGrade(stats) {
  const grayMean = (stats.meanR + stats.meanG + stats.meanB) / 3 || 1;
  // Balanço de branco: gray-world parcial (força 0.5), com trava de segurança.
  const strength = 0.5;
  const gain = (mean) => clamp(1 + strength * (grayMean / (mean || 1) - 1), 0.85, 1.15);
  const gR = gain(stats.meanR), gG = gain(stats.meanG), gB = gain(stats.meanB);

  // Exposição: aproxima a luma-alvo ~118.
  const brightness = clamp(((118 - stats.luma) / 255) * 0.5, -0.06, 0.07);
  // Contraste: levanta se o desvio for baixo.
  const contrast = stats.contrast < 45 ? clamp(1 + (45 - stats.contrast) / 45 * 0.3, 1, 1.18) : 1.03;
  // Saturação: mira ~0.32; corrige para baixo se estourar.
  let saturation = 1;
  if (stats.saturation < 0.3) saturation = clamp(1 + (0.32 - stats.saturation) * 1.6, 1, 1.35);
  else if (stats.saturation > 0.46) saturation = clamp(1 - (stats.saturation - 0.42) * 0.8, 0.82, 1);
  // Gamma: levanta um pouco quando há muita sombra (imagem escura).
  const gamma = stats.shadowFrac > 0.35 ? clamp(1 + (stats.shadowFrac - 0.35) * 0.5, 1, 1.15) : 1;

  // Look: escolhido pelo conteúdo.
  let look, colorbalance;
  if (stats.warmBias >= -6) {
    look = 'teal-orange'; // assinatura: sombras frias, altas quentes
    colorbalance = 'colorbalance=rs=-0.06:gs=0.01:bs=0.08:rm=0.02:bm=-0.02:rh=0.06:gh=0.01:bh=-0.06';
  } else if (stats.warmBias < -18) {
    look = 'balanced-cool'; // já frio: equilibra e dá corpo
    colorbalance = 'colorbalance=rm=0.03:bm=-0.02:rh=0.03:bh=-0.03';
  } else {
    look = 'moody'; // frio moderado / baixa luz: dramático
    colorbalance = 'colorbalance=bs=0.05:rh=0.03:gh=-0.01';
  }

  const eqParts = [
    `contrast=${r3(contrast)}`,
    `brightness=${r3(brightness)}`,
    `saturation=${r3(saturation)}`,
    `gamma=${r3(gamma)}`,
  ].join(':');

  const vf = [
    `colorchannelmixer=rr=${r3(gR)}:gg=${r3(gG)}:bb=${r3(gB)}`,
    `eq=${eqParts}`,
    colorbalance,
    'unsharp=3:3:0.4',
  ].join(',');

  return {
    vf,
    look,
    adjustments: {
      whiteBalance: { rGain: r3(gR), gGain: r3(gG), bGain: r3(gB) },
      brightness: r3(brightness),
      contrast: r3(contrast),
      saturation: r3(saturation),
      gamma: r3(gamma),
      look,
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
