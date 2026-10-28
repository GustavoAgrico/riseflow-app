// Rodas de cor (Lift/Gamma/Gain/Offset) e tint: a mesma conta no servidor (FFmpeg `curves`)
// e no navegador (prévia ao vivo com SVG). Puro.
export const WHEEL_KEYS = ['lift', 'gamma', 'gain', 'offset'];
const CH_PHASE = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Pontos de cada canal (17 amostras, x = 0..1): { r: [y…], g: [y…], b: [y…] }.
 * Cada canal parte do controle geral da roda e recebe a cor do disco (a direção diz para
 * qual canal a roda puxa, sem mudar o brilho total). Lift levanta as sombras, Gamma mexe
 * nos médios, Gain escala as altas luzes, Offset soma no todo; tint: magenta (+) põe
 * vermelho/azul e tira verde.
 */
export function wheelCurvePoints(wheels, tint = 0) {
  const shift = (w, c) => {
    if (!w.x && !w.y) return 0;
    const mag = Math.hypot(w.x, w.y);
    return 0.5 * mag * Math.cos(Math.atan2(w.y, w.x) - CH_PHASE[c]);
  };
  const channel = (c) => {
    const lift = 0.3 * wheels.lift.m + 0.3 * shift(wheels.lift, c);
    const gammaExp = 2 ** -(wheels.gamma.m + shift(wheels.gamma, c) * 2);
    const gain = 1 + 0.5 * wheels.gain.m + shift(wheels.gain, c) * 0.8;
    const offset = 0.1 * wheels.offset.m + shift(wheels.offset, c) * 0.2 + [0.05, -0.1, 0.05][c] * tint;
    const ys = [];
    for (let i = 0; i <= 16; i += 1) {
      const x = i / 16;
      let v = x + lift * (1 - x);
      v = Math.max(0, v) ** gammaExp;
      ys.push(+clamp01(v * gain + offset).toFixed(3));
    }
    return ys;
  };
  return { r: channel(0), g: channel(1), b: channel(2) };
}
