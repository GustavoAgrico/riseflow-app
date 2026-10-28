// Ajuste de cor do editor (aba Cor): valores padrão e normalização do que veio salvo.
// Mesma forma do servidor (server/src/pipeline/color.js → sanitizeColorAdjust).

export const WHEEL_IDS = ['lift', 'gamma', 'gain', 'offset'];

/** Estado zerado: nada mexido. */
export function colorAdjFresh() {
  return {
    brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, hue: 0,
    wheels: Object.fromEntries(WHEEL_IDS.map((k) => [k, { x: 0, y: 0, m: 0 }])),
  };
}

const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

/** Junta o que foi salvo com o padrão (projetos antigos não têm rodas nem tint). */
export function normColorAdj(saved) {
  const base = colorAdjFresh();
  const a = saved && typeof saved === 'object' ? saved : {};
  for (const k of ['brightness', 'contrast', 'saturation', 'temperature', 'tint', 'hue']) base[k] = num(a[k], -100, 100);
  for (const k of WHEEL_IDS) {
    const w = a.wheels?.[k] || {};
    base.wheels[k] = { x: num(w.x, -1, 1), y: num(w.y, -1, 1), m: num(w.m, -1, 1) };
  }
  return base;
}
