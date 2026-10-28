import { volDbAt } from '../../shared/layerKeys.js';
// Prévia AO VIVO dos efeitos no player da timeline (zoom, cor, whoosh, volume).
// Espelha as fórmulas do servidor (pipeline/motion.js, color.js, sfx.js) de forma
// aproximada, só no navegador — o render final continua sendo feito pelo FFmpeg.

import { momentEffectAt, defaultMomentEffect } from '../../shared/transform.js';
import { wheelCurvePoints, WHEEL_KEYS } from '../../shared/colorWheels.js';

/** Intensidade → zoom máximo (igual ao servidor). */
export const MOTION_Z = { suave: 1.06, medio: 1.12, forte: 1.2 };

const NONE = { scale: 1, ox: 50, oy: 50 };

/**
 * Zoom no instante t (segundos) do vídeo. ox/oy = origem do zoom em %.
 * O movimento só existe nos momentos (windows = [início, fim, zoom próprio|null,
 * efeito|undefined]); fora deles o quadro fica normal — igual ao render.
 */
export function motionAt(kind, intensity, t, dur, windows) {
  if (!kind || kind === 'none') return NONE;
  const z = MOTION_Z[intensity] || MOTION_Z.medio;
  const hit = (windows || []).find(([a, b]) => t >= a && t < b);
  if (!hit) return NONE;
  const [a, b, zs, eff] = hit;
  const { dz, pan } = momentEffectAt(eff || defaultMomentEffect(kind), (t - a) / Math.max(0.01, b - a), (zs || z) - 1);
  return { scale: 1 + dz, ox: pan == null ? 50 : pan * 100, oy: pan == null ? 50 : pan * 100 };
}

/**
 * Demonstração curta (vídeo pausado) logo depois de escolher o efeito — para ver
 * o movimento sem precisar dar play. `e` = segundos desde a escolha.
 */
export function demoMotion(kind, intensity, e) {
  const z = MOTION_Z[intensity] || MOTION_Z.medio;
  const ramp = Math.min(1, (e % 2.4) / 2);
  switch (kind) {
    case 'dynamic':
      return Math.floor(e / 0.9) % 2 === 1 ? { scale: z, ox: 50, oy: 50 } : NONE;
    case 'zoom-in':
      return { scale: 1 + (z - 1) * ramp, ox: 50, oy: 50 };
    case 'zoom-out':
      return { scale: z - (z - 1) * ramp, ox: 50, oy: 50 };
    case 'ken-burns':
      return { scale: 1 + (z - 1) * ramp, ox: ramp * 100, oy: ramp * 100 };
    case 'pulse':
      return { scale: 1 + (z - 1) * 0.6 * (0.5 - 0.5 * Math.cos((2 * Math.PI * e) / 1.6)), ox: 50, oy: 50 };
    default:
      return NONE;
  }
}

/** Volume da fala no instante t (mudo, volume geral e trechos com volume próprio). */
export function volumeAt(t, { audioMute, audioVolume, gains, volKeys }) {
  if (audioMute) return 0;
  let v = Number(audioVolume ?? 1);
  for (const g of gains || []) if (t >= g.start && t < g.end) v *= Number(g.volume);
  // linha de volume da faixa A1 (pontos em dB, como no Premiere)
  if (volKeys?.length) v *= 10 ** (volDbAt(volKeys, t) / 20);
  return v;
}

/** Prévia aproximada dos looks de cor do servidor (CSS filter + véu de cor). */
export const LOOK_CSS = {
  none: { filter: '' },
  // Automático natural: corrige a luz/cor do próprio vídeo (a prévia exata vem do servidor).
  auto: { filter: 'contrast(1.02) saturate(1.05)' },
  clean: { filter: 'contrast(1.04) saturate(1.06)' },
  'teal-orange': { filter: 'contrast(1.09) saturate(1.16) sepia(0.06)', tint: { background: 'linear-gradient(180deg, rgba(255,150,70,.9), rgba(20,170,170,.9))', mixBlendMode: 'soft-light', opacity: 0.22 } },
  warm: { filter: 'contrast(1.06) saturate(1.12) sepia(0.12)', tint: { background: '#ff8a3d', mixBlendMode: 'soft-light', opacity: 0.18 } },
  cold: { filter: 'contrast(1.06) saturate(1.06)', tint: { background: '#3d8bff', mixBlendMode: 'soft-light', opacity: 0.2 } },
  vibrant: { filter: 'contrast(1.11) saturate(1.32) brightness(1.02)' },
  moody: { filter: 'contrast(1.14) saturate(0.9) brightness(0.97)', tint: { background: '#2a4d8f', mixBlendMode: 'soft-light', opacity: 0.12 } },
};

// ── Whoosh sintetizado no navegador (mesma receita do servidor: ruído marrom,
// subida longa, queda rápida, passando de um lado para o outro).
const SFX_LEVEL = { suave: 0.4, medio: 0.6, forte: 0.85 };
let audioCtx = null;
let noiseBuf = null;

function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function brownNoise(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

// Sons da biblioteca: o servidor gera o mesmo arquivo usado no render; aqui só toca.
const sfxBuffers = new Map(); // url → Promise<AudioBuffer>
const SFX_GAIN = { suave: 0.55, medio: 0.8, forte: 1 };
/** Toca o som `url` (prévia), no volume da intensidade. Baixa e guarda na 1ª vez. */
export function playSfxUrl(url, intensity = 'medio', vol = 1) {
  try {
    const ac = ctx();
    if (!ac || !url) return;
    if (!sfxBuffers.has(url)) {
      sfxBuffers.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).then((b) => ac.decodeAudioData(b)).catch((e) => { sfxBuffers.delete(url); throw e; }));
    }
    sfxBuffers.get(url).then((buf) => {
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.value = (SFX_GAIN[intensity] || SFX_GAIN.medio) * Math.max(0, Math.min(2, Number(vol) || 0));
      src.connect(g).connect(ac.destination);
      src.start();
    }).catch(() => {});
  } catch {
    /* sem áudio no navegador */
  }
}

/** Toca um whoosh no volume escolhido (suave | medio | forte). */
export function playWhoosh(intensity = 'medio') {
  try {
    const ac = ctx();
    if (!ac) return;
    if (!noiseBuf) noiseBuf = brownNoise(ac, 0.65);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const peak = ac.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 900; peak.gain.value = 4;
    const gain = ac.createGain();
    const now = ac.currentTime;
    const vol = (SFX_LEVEL[intensity] || SFX_LEVEL.medio) * 1.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.42);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    let out = gain;
    if (ac.createStereoPanner) {
      const pan = ac.createStereoPanner();
      pan.pan.setValueAtTime(-0.7, now);
      pan.pan.linearRampToValueAtTime(0.7, now + 0.65);
      gain.connect(pan);
      out = pan;
    }
    src.connect(hp).connect(lp).connect(peak).connect(gain);
    out.connect(ac.destination);
    src.start(now);
    src.stop(now + 0.7);
  } catch {
    /* sem áudio no navegador: ignora */
  }
}

// Rodas de cor e tint na prévia que toca: um filtro SVG com as MESMAS curvas do render
// (shared/colorWheels.js). O filtro é reescrito só quando os valores mudam.
let wheelKey = '';
const SVG_NS = 'http://www.w3.org/2000/svg';
export function wheelFilterId(a = {}) {
  const w = a.wheels || {};
  const tint = (Number(a.tint) || 0) / 100;
  const used = WHEEL_KEYS.some((k) => w[k] && (w[k].x || w[k].y || w[k].m)) || tint;
  if (!used || typeof document === 'undefined') return null;
  const wheels = Object.fromEntries(WHEEL_KEYS.map((k) => [k, { x: Number(w[k]?.x) || 0, y: Number(w[k]?.y) || 0, m: Number(w[k]?.m) || 0 }]));
  const pts = wheelCurvePoints(wheels, tint);
  const key = JSON.stringify(pts);
  if (key !== wheelKey) {
    wheelKey = key;
    let svg = document.getElementById('rf-color-svg');
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('id', 'rf-color-svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
      document.body.appendChild(svg);
    }
    svg.innerHTML = `<defs><filter id="rfColorWheels" color-interpolation-filters="sRGB"><feComponentTransfer>`
      + `<feFuncR type="table" tableValues="${pts.r.join(' ')}"/><feFuncG type="table" tableValues="${pts.g.join(' ')}"/><feFuncB type="table" tableValues="${pts.b.join(' ')}"/>`
      + `</feComponentTransfer></filter></defs>`;
  }
  return 'url(#rfColorWheels)';
}

/** Ajuste de cor como filtro CSS + véu (aproximado ao vivo; o pausado usa o quadro exato do render). */
export function colorAdjustCss(a = {}) {
  const b = Number(a.brightness) || 0, c = Number(a.contrast) || 0, s = Number(a.saturation) || 0, t = Number(a.temperature) || 0;
  const hue = Number(a.hue) || 0;
  const parts = [];
  if (b || c || s) parts.push(`brightness(${1 + (b / 100) * 0.25}) contrast(${1 + (c / 100) * 0.35}) saturate(${1 + (s / 100) * 0.8})`);
  if (hue) parts.push(`hue-rotate(${(hue * 0.6).toFixed(1)}deg)`);
  const wheel = wheelFilterId(a);
  if (wheel) parts.push(wheel);
  const filter = parts.length ? parts.join(' ') : undefined;
  const tint = t ? { background: t > 0 ? '#ff8a3d' : '#3d8bff', mixBlendMode: 'soft-light', opacity: (Math.abs(t) / 100) * 0.55 } : null;
  return { filter, tint };
}
