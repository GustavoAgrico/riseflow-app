/**
 * Curvas de movimento das animações de entrada/saída (estilo Animation Composer).
 * Mesma conta no render (expressão do FFmpeg) e na prévia (valor em JS). Puro.
 */

export const EASINGS = {
  out: 'Suave (padrão)',
  inout: 'Suave nas duas pontas',
  linear: 'Linear',
  back: 'Passa do ponto (overshoot)',
};

/**
 * easeOutBack com intensidade k (0…1): k = 0 é a suave sem passar do ponto; k = 0,5 é a de
 * sempre (sobe ~10% e assenta). Puro.
 */
export function easeBack(p, k = 0.5) {
  const x = Math.min(1, Math.max(0, p));
  const c = 1.70158 * 2 * k;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

/** Valor da curva em p (0…1). */
export function easeValue(id, p) {
  const x = Math.min(1, Math.max(0, p));
  if (id === 'linear') return x;
  if (id === 'inout') return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
  if (id === 'back') return easeBack(x, 0.5);
  return 1 - (1 - x) ** 3;
}

/** Mesma curva como expressão do FFmpeg; `p` é a expressão do progresso (já entre 0 e 1). */
export function easeExpr(id, p) {
  if (id === 'linear') return `(${p})`;
  if (id === 'inout') return `if(lt(${p},0.5),4*pow(${p},3),1-pow(2-2*${p},3)/2)`;
  if (id === 'back') return `(1+2.70158*pow(${p}-1,3)+1.70158*pow(${p}-1,2))`;
  return `(1-pow(1-${p},3))`;
}

/** Curva válida (a que não existe vira a padrão). */
export const cleanEase = (id) => (Object.hasOwn(EASINGS, id) ? id : 'out');
