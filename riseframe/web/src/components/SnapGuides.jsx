import React from 'react';

/**
 * Guias de centralização (como no Canva/CapCut): ao arrastar algo na prévia, quando o
 * centro do item passa perto do centro do quadro ele "gruda" no meio e aparece a linha
 * vertical e/ou horizontal. `snapCenter(v, sizePx)` devolve o valor (0–1) já ajustado e
 * se grudou; a tolerância é em pixels de tela (igual em qualquer tamanho de prévia).
 */
export const SNAP_PX = 7;
export const GUIDE_COLOR = '#22D3EE';

// Guias do monitor (como no Premiere: View › Mostrar guias / Encaixar no monitor): com o
// encaixe ligado, o item também gruda nas linhas que a pessoa colocou. x = guias verticais.
let userGuides = { snap: false, x: [], y: [] };
export function setUserGuides(g) {
  userGuides = g || { snap: false, x: [], y: [] };
}

export function snapCenter(v, sizePx, tolPx = SNAP_PX, axis = null) {
  const tol = sizePx > 0 ? tolPx / sizePx : 0.02;
  if (Math.abs(v - 0.5) <= tol) return { v: 0.5, on: true };
  if (axis && userGuides.snap) {
    let best = null;
    for (const g of userGuides[axis] || []) if (Math.abs(v - g) <= tol && (best == null || Math.abs(v - g) < Math.abs(v - best))) best = g;
    if (best != null) return { v: best, on: false, guide: true };
  }
  return { v, on: false };
}

/** Linhas sobre a caixa `box` ({x,y,w,h} em px dentro do pai) ou sobre o pai inteiro. */
export default function SnapGuides({ x, y, box = null }) {
  if (!x && !y) return null;
  const frame = box
    ? { position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }
    : { position: 'absolute', inset: 0 };
  const line = { position: 'absolute', background: GUIDE_COLOR, boxShadow: `0 0 6px ${GUIDE_COLOR}` };
  return (
    <div aria-hidden="true" style={{ ...frame, pointerEvents: 'none', zIndex: 4 }}>
      {x && <div style={{ ...line, left: '50%', top: 0, bottom: 0, width: 1.5, marginLeft: -0.75 }} />}
      {y && <div style={{ ...line, top: '50%', left: 0, right: 0, height: 1.5, marginTop: -0.75 }} />}
    </div>
  );
}
