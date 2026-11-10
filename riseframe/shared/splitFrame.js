// Tela dividida (B-roll em cima/embaixo): a metade da PESSOA sempre preenchida e
// enquadrada no rosto — cabeça com folga em cima, ombros embaixo — com o zoom calculado
// pelo tamanho do rosto. Independe do zoom que a pessoa deu no vídeo inteiro antes da
// edição (aquele zoom é para a tela cheia; aplicado de novo na metade cortava a cabeça,
// e sem zoom a pessoa ficava pequena no meio com fundo desfocado).
//
// Mesma conta na prévia (timeline) e no render (broll.js). Puro.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Altura do rosto que fica bonita na metade (fração da altura da metade). */
export const SPLIT_FACE_SHARE = 0.3;
/** Onde fica o centro do rosto na metade (fração da altura, de cima). */
export const SPLIT_FACE_Y = 0.4;
export const SPLIT_MAX_ZOOM = 2.2;
/** Topo do cabelo acima do centro do rosto, em alturas de rosto (caixa do detector). */
export const HEAD_ABOVE = 1.0;
/** Folga acima da cabeça (fração da altura da metade). */
export const HEAD_MARGIN = 0.06;

/**
 * Recorte da metade da pessoa.
 * @param {number} srcW largura do vídeo da pessoa (px)
 * @param {number} srcH altura do vídeo da pessoa (px)
 * @param {number} regionW largura da metade (px)
 * @param {number} regionH altura da metade (px)
 * @param {{x?:number, y?:number, h?:number}|null} face centro do rosto (0–1) e altura dele
 *   (fração da altura do vídeo). Sem altura: zoom 1 (só cobre). Sem rosto: centro, um pouco acima.
 * @returns {{scaledW:number, scaledH:number, cropX:number, cropY:number, zoom:number}}
 */
export function splitPersonCrop(srcW, srcH, regionW, regionH, face = null) {
  const sw = Math.max(1, Number(srcW) || 1);
  const sh = Math.max(1, Number(srcH) || 1);
  const rw = Math.max(2, Number(regionW) || 2);
  const rh = Math.max(2, Number(regionH) || 2);
  const base = Math.max(rw / sw, rh / sh); // cobre a metade sem sobrar faixa
  const fh = Number(face?.h);
  // tamanho do rosto na metade sem zoom → zoom para ele ocupar SPLIT_FACE_SHARE
  const share = fh > 0 ? (fh * sh * base) / rh : 0;
  const zoom = share > 0 ? clamp(SPLIT_FACE_SHARE / share, 1, SPLIT_MAX_ZOOM) : 1;
  const s = base * zoom;
  const scaledW = Math.max(rw, Math.round(sw * s));
  const scaledH = Math.max(rh, Math.round(sh * s));
  const fx = clamp(Number.isFinite(Number(face?.x)) ? Number(face.x) : 0.5, 0, 1);
  const fy = clamp(Number.isFinite(Number(face?.y)) ? Number(face.y) : 0.35, 0, 1);
  const cropX = Math.round(clamp(fx * scaledW - rw / 2, 0, scaledW - rw));
  let cropY = fy * scaledH - rh * SPLIT_FACE_Y;
  // trava da cabeça: o topo dela fica dentro da metade, com folga — nunca corta a cabeça.
  // O detector marca o rosto das sobrancelhas ao queixo; o topo do cabelo fica ~1 altura do
  // rosto acima do CENTRO dele (medido em vídeo real; 0,65 cortava o cabelo). Sem o tamanho
  // do rosto, supõe um rosto grande (o caso que corta).
  const head = fy - HEAD_ABOVE * (fh > 0 ? fh : 0.2);
  cropY = Math.min(cropY, head * scaledH - rh * HEAD_MARGIN);
  cropY = Math.round(clamp(cropY, 0, scaledH - rh));
  // ponto fixo do zoom dos momentos-chave na metade: o topo da cabeça (o zoom amplia para
  // baixo e a cabeça não sai pelo topo; ampliar pelo centro cortava o cabelo no punch)
  const anchorY = +clamp((head * scaledH - cropY) / rh, 0, 0.5).toFixed(3);
  return { scaledW, scaledH, cropX, cropY, zoom: +zoom.toFixed(3), anchorY };
}
