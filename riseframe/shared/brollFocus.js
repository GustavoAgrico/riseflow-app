// Enquadramento automático do B-roll pelo ROSTO: quando a imagem (ou o vídeo) é recortada
// para cobrir a área do B-roll, o ponto do recorte (fx/fy, 0–1) é escolhido para a cabeça de
// quem aparece caber inteira, com folga em cima — em vez do centro, que cortava a cabeça.
//
// Mesma conta na prévia (object-position) e no render (crop=(iw-ow)*fx:(ih-oh)*fy). Puro.

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Proporção (largura/altura) da área do B-roll no quadro final, por layout. */
export function brollRegionAspect(layout, frameAspect) {
  const ar = Number(frameAspect) > 0 ? Number(frameAspect) : 9 / 16;
  if (layout === 'top' || layout === 'bottom') return ar * 2; // metade da altura
  if (layout === 'cartoes') return 0.8; // cartão 4:5
  return ar;
}

/**
 * Caixa das cabeças: rostos com pelo menos 40% do maior (fundo/plateia fica de fora),
 * aumentada para cobrir o cabelo (em cima) e o queixo (embaixo). Normalizada 0–1.
 */
export function headBox(faces) {
  const list = (Array.isArray(faces) ? faces : []).filter((f) => f && f.w > 0 && f.h > 0);
  if (!list.length) return null;
  const big = Math.max(...list.map((f) => f.w * f.h));
  const keep = list.filter((f) => f.w * f.h >= big * 0.4);
  const x0 = Math.min(...keep.map((f) => f.x));
  const x1 = Math.max(...keep.map((f) => f.x + f.w));
  const top = Math.min(...keep.map((f) => f.y - f.h * 0.45)); // cabelo / topo da cabeça
  const bot = Math.max(...keep.map((f) => f.y + f.h * 1.15)); // queixo
  return { x: clamp01(x0), y: clamp01(top), w: clamp01(x1) - clamp01(x0), h: clamp01(bot) - clamp01(top) };
}

/**
 * Ponto do recorte (fx/fy) que mantém as cabeças no quadro.
 * @param {{aspect:number, faces:Array<{x,y,w,h}>}} det  rostos normalizados (0–1) e a proporção da imagem
 * @param {number} regionAspect  proporção da área do B-roll (largura/altura)
 * @param {number} [zoom=1]  ampliação escolhida na timeline (1–2,5)
 * @returns {{fx:number, fy:number}|null}  null quando não há rosto (fica o padrão)
 */
export function faceFocus(det, regionAspect, zoom = 1) {
  const sa = Number(det?.aspect);
  const ra = Number(regionAspect);
  const box = headBox(det?.faces);
  if (!box || !(sa > 0) || !(ra > 0)) return null;
  const z = Math.min(2.5, Math.max(1, Number(zoom) || 1));
  // "cobre": a imagem (altura 1, largura sa) é escalada por s para cobrir a área (altura 1,
  // largura ra) e depois ampliada por z. Fração visível da imagem em cada eixo:
  const s = Math.max(ra / sa, 1);
  const vx = Math.min(1, ra / (sa * s * z));
  const vy = Math.min(1, 1 / (s * z));
  // horizontal: centro das cabeças no meio do quadro
  const cx = box.x + box.w / 2;
  const fx = vx < 0.999 ? clamp01((cx - vx / 2) / (1 - vx)) : 0.5;
  // vertical: topo da cabeça a ~10% do topo do quadro; se as cabeças não couberem
  // inteiras, prioriza o rosto (centro da caixa a 40% da altura visível)
  let fy = 0.5;
  if (vy < 0.999) {
    const top = box.h <= vy * 0.85 ? box.y - vy * 0.1 : box.y + box.h / 2 - vy * 0.4;
    fy = clamp01(top / (1 - vy));
  }
  return { fx: +fx.toFixed(3), fy: +fy.toFixed(3) };
}
