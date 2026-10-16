// Movimento por momentos e quadros-chave — a mesma matemática no site (prévia da
// timeline) e no servidor (render), para o que se vê ao editar ser o que sai no vídeo.

/** Efeito de cada momento de movimento (bloco na faixa ZOOM da timeline). */
export const MOMENT_EFFECTS = {
  punch: 'Punch-in (zoom rápido)',
  'zoom-in': 'Zoom in (aproxima)',
  'zoom-out': 'Zoom out (afasta)',
  'ken-burns': 'Ken Burns (zoom + pan)',
  pulse: 'Pulse (respiração)',
};

/** O efeito geral escolhido vira o efeito padrão dos momentos ('dynamic' = punch-in). */
export function defaultMomentEffect(videoMotion) {
  if (videoMotion === 'dynamic') return 'punch';
  return Object.hasOwn(MOMENT_EFFECTS, videoMotion) ? videoMotion : 'punch';
}

/**
 * Zoom extra (acima de 1) e pan de um momento, no progresso p (0→1) dele.
 * `k` = zoom máximo − 1. pan (0→1) só no Ken Burns: o quadro anda na diagonal.
 */
export function momentEffectAt(effect, p, k) {
  const q = Math.max(0, Math.min(1, p));
  switch (effect) {
    case 'zoom-in': return { dz: k * q, pan: null };
    case 'zoom-out': return { dz: k * (1 - q), pan: null };
    case 'ken-burns': return { dz: k * q, pan: q };
    case 'pulse': return { dz: k * 0.6 * (0.5 - 0.5 * Math.cos(2 * Math.PI * q)), pan: null };
    default: return { dz: k, pan: null }; // punch: zoom fixo no momento inteiro
  }
}

/** Quadro neutro (sem transformação). x/y em fração da tela; rot em graus; scale 1 = 100%. */
export const NEUTRAL_KEY = { scale: 1, x: 0, y: 0, rot: 0 };
const PROPS = ['scale', 'x', 'y', 'rot'];
const LIMITS = { scale: [0.5, 3], x: [-1, 1], y: [-1, 1], rot: [-180, 180] };

/** Normaliza quadros-chave: números válidos, dentro dos limites, ordenados, sem tempos repetidos. */
export function cleanKeys(raw, max = 60) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const k of raw) {
    const t = Number(k?.t);
    if (!Number.isFinite(t) || t < 0) continue;
    const item = { t: +t.toFixed(3) };
    for (const p of PROPS) {
      const v = Number(k[p]);
      const [lo, hi] = LIMITS[p];
      item[p] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : NEUTRAL_KEY[p];
    }
    out.push(item);
  }
  out.sort((a, b) => a.t - b.t);
  const dedup = out.filter((k, i) => i === 0 || k.t - out[i - 1].t >= 0.02);
  return dedup.slice(0, max);
}

/**
 * Valor de cada propriedade no tempo t (interpolação linear entre os quadros-chave,
 * como o padrão do CapCut). Antes do 1º vale o 1º; depois do último, o último.
 */
export function keyAt(keys, t) {
  if (!keys?.length) return { ...NEUTRAL_KEY };
  if (t <= keys[0].t) return pick(keys[0]);
  const last = keys[keys.length - 1];
  if (t >= last.t) return pick(last);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const q = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const v = {};
      for (const p of PROPS) v[p] = a[p] + (b[p] - a[p]) * q;
      return v;
    }
  }
  return pick(last);
}
function pick(k) {
  return { scale: k.scale, x: k.x, y: k.y, rot: k.rot };
}
/** Tem algum quadro que muda alguma coisa? (só quadros neutros = nada a fazer) */
export function keysChangeAnything(keys) {
  return (keys || []).some((k) => PROPS.some((p) => Math.abs(k[p] - NEUTRAL_KEY[p]) > 1e-4));
}
