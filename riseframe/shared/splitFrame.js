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
export const SPLIT_FACE_Y = 0.45;
export const SPLIT_MAX_ZOOM = 2.2;
/** Topo do cabelo acima do centro do rosto, em alturas de rosto (caixa do detector). */
export const HEAD_ABOVE = 1.2;
/** Folga acima da cabeça (fração da altura da metade). */
export const HEAD_MARGIN = 0.08;

/**
 * Recorte da metade da pessoa.
 * @param {number} srcW largura do vídeo da pessoa (px)
 * @param {number} srcH altura do vídeo da pessoa (px)
 * @param {number} regionW largura da metade (px)
 * @param {number} regionH altura da metade (px)
 * @param {{x?:number, y?:number, h?:number}|null} face centro do rosto (0–1) e altura dele
 *   (fração da altura do vídeo). Sem altura: zoom 1 (só cobre). Sem rosto (rastreador sem
 *   Python/OpenCV, ou não achou): mostra o TOPO do vídeo — onde fica a cabeça de quem fala
 *   para a câmera. Chutar o centro cortava a cabeça de quem deu zoom no rosto antes.
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
  const hasY = face != null && face.y != null && Number.isFinite(Number(face.y));
  const cropX = Math.round(clamp(fx * scaledW - rw / 2, 0, scaledW - rw));
  if (!hasY) return { scaledW, scaledH, cropX, cropY: 0, zoom: +zoom.toFixed(3), anchorY: 0 };
  const fy = clamp(Number(face.y), 0, 1);
  let cropY = fy * scaledH - rh * SPLIT_FACE_Y;
  // trava da cabeça: o topo dela fica dentro da metade, com folga — nunca corta a cabeça.
  // O detector marca o rosto das sobrancelhas ao queixo; o topo do cabelo fica ~1,2 altura do
  // rosto acima do CENTRO dele (0,65 e depois 1,0 ainda cortavam cabelo volumoso/topete). Sem o tamanho
  // do rosto, supõe um rosto grande (o caso que corta).
  // `top`: o topo da cabeça mais alto do trecho (a pessoa se inclina para a câmera) — a
  // trava respeita esse, não só o do rosto médio
  const top = Number(face?.top);
  const head = Math.min(fy - HEAD_ABOVE * (fh > 0 ? fh : 0.2), Number.isFinite(top) ? top : Infinity);
  cropY = Math.min(cropY, head * scaledH - rh * HEAD_MARGIN);
  cropY = Math.round(clamp(cropY, 0, scaledH - rh));
  // ponto fixo do zoom dos momentos-chave na metade: o topo da cabeça (o zoom amplia para
  // baixo e a cabeça não sai pelo topo; ampliar pelo centro cortava o cabelo no punch)
  const anchorY = +clamp((head * scaledH - cropY) / rh, 0, 0.5).toFixed(3);
  return { scaledW, scaledH, cropX, cropY, zoom: +zoom.toFixed(3), anchorY };
}

/**
 * Rosto que enquadra a metade da pessoa no render direto (sem a timeline). O foco manual
 * (personFocusX/Y) é o ponto do ZOOM do vídeo inteiro, escolhido na criação — não a posição
 * do rosto. Usado como rosto, a cabeça era calculada mais baixa do que estava e saía cortada
 * no topo da metade. Com rosto detectado, vale o rosto; o foco só entra sem rosto.
 */
export function splitFaceFor(tracked, focusX, focusY) {
  if (tracked && Number.isFinite(Number(tracked.x)) && Number.isFinite(Number(tracked.y))) return { ...tracked, source: 'face' };
  const mx = Number(focusX);
  const my = Number(focusY);
  return focusX != null && focusY != null && Number.isFinite(mx) && Number.isFinite(my) ? { x: mx, y: my, source: 'manual' } : null;
}

const median = (a) => {
  const v = [...a].sort((p, q) => p - q);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const quantile = (a, q) => {
  const v = [...a].sort((p, r) => p - r);
  return v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * q)))];
};

/**
 * Rosto de um TRECHO (um momento de B-roll na tela dividida): a pessoa se mexe — inclinada
 * para a câmera num momento, recostada no outro — e um enquadramento só para o vídeo todo
 * cortava a cabeça num e deixava o rosto lá embaixo no outro. Usa os rostos rastreados
 * dentro do trecho (centro mediano, tamanho p75 e o topo de cabeça mais alto). Puro.
 * @param {Array<{t:number,x:number,y:number,h:number}>} track rostos (centro, 0–1) no tempo
 * @param {{x,y,h}|null} fallback rosto do vídeo inteiro (sem rosto no trecho)
 */
export function splitFaceInWindow(track, start, end, fallback = null) {
  const list = (Array.isArray(track) ? track : []).filter((p) => p && [p.t, p.x, p.y].every((v) => Number.isFinite(Number(v))));
  if (!list.length) return fallback;
  const a = Number(start);
  const b = Number(end);
  let pts = list.filter((p) => p.t >= a - 0.5 && p.t <= b + 0.5);
  if (!pts.length) {
    // amostra esparsa: o rosto mais perto do trecho (até 2 s)
    const mid = (a + b) / 2;
    const near = list.reduce((best, p) => (Math.abs(p.t - mid) < Math.abs(best.t - mid) ? p : best));
    if (Math.abs(near.t - mid) > (b - a) / 2 + 2) return fallback;
    pts = [near];
  }
  const hs = pts.map((p) => Number(p.h)).filter((h) => h > 0);
  const h = hs.length ? quantile(hs, 0.75) : Number(fallback?.h) || 0;
  const tops = pts.map((p) => p.y - HEAD_ABOVE * (Number(p.h) > 0 ? Number(p.h) : h || 0.2));
  return {
    x: +median(pts.map((p) => Number(p.x))).toFixed(4),
    y: +median(pts.map((p) => Number(p.y))).toFixed(4),
    ...(h > 0 ? { h: +h.toFixed(4) } : {}),
    top: +quantile(tops, 0.1).toFixed(4),
    source: 'face',
  };
}
