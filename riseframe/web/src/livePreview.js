// Prévia AO VIVO dos efeitos no player da timeline (zoom, cor, whoosh, volume).
// Espelha as fórmulas do servidor (pipeline/motion.js, color.js, sfx.js) de forma
// aproximada, só no navegador — o render final continua sendo feito pelo FFmpeg.

/** Intensidade → zoom máximo (igual ao servidor). */
export const MOTION_Z = { suave: 1.06, medio: 1.12, forte: 1.2 };

/** Janelas [início, fim] dos punch-ins do zoom dinâmico: frases alternadas. */
export function zoomWindows(segments, dur) {
  const starts = (segments || [])
    .filter((s) => !(s.words?.length && s.words.every((w) => w.removed)))
    .map((s) => Number(s.start))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < starts.length; i += 2) {
    const a = starts[i];
    const b = i + 1 < starts.length ? starts[i + 1] : dur;
    if (b - a > 0.15) out.push([a, Math.min(b, dur)]);
  }
  return out;
}

const NONE = { scale: 1, ox: 50, oy: 50 };

/** Zoom no instante t (segundos) do vídeo. ox/oy = origem do zoom em %. */
export function motionAt(kind, intensity, t, dur, windows) {
  const z = MOTION_Z[intensity] || MOTION_Z.medio;
  const p = Math.max(0, Math.min(1, t / Math.max(0.5, dur)));
  switch (kind) {
    case 'dynamic':
      return (windows || []).some(([a, b]) => t >= a && t < b) ? { scale: z, ox: 50, oy: 50 } : NONE;
    case 'zoom-in':
      return { scale: 1 + (z - 1) * p, ox: 50, oy: 50 };
    case 'zoom-out':
      return { scale: z - (z - 1) * p, ox: 50, oy: 50 };
    case 'ken-burns':
      return { scale: 1 + (z - 1) * p, ox: p * 100, oy: p * 100 };
    case 'pulse': {
      const amp = (z - 1) * 0.6;
      const period = Math.max(0.5, dur / 2);
      return { scale: 1 + amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period)), ox: 50, oy: 50 };
    }
    default:
      return NONE;
  }
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
export function volumeAt(t, { audioMute, audioVolume, gains }) {
  if (audioMute) return 0;
  let v = Number(audioVolume ?? 1);
  for (const g of gains || []) if (t >= g.start && t < g.end) v *= Number(g.volume);
  return v;
}

/** Prévia aproximada dos looks de cor do servidor (CSS filter + véu de cor). */
export const LOOK_CSS = {
  none: { filter: '' },
  auto: { filter: 'contrast(1.06) saturate(1.1)', tint: { background: '#1fb5b0', mixBlendMode: 'soft-light', opacity: 0.08 } },
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
