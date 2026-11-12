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
/**
 * Topo do cabelo acima do centro do rosto, em alturas de rosto (caixa do detector). Varia de
 * pessoa para pessoa (medido no vídeo do usuário: 0,64; 1,0 sobrava e deixava o rosto baixo,
 * com cenário em cima — print): a folga é a maior (HEAD_ABOVE) quando
 * cabe, e encolhe até HEAD_ABOVE_MIN só para o QUEIXO não sair por baixo em rosto grande.
 */
export const HEAD_ABOVE = 0.8;
export const HEAD_ABOVE_MIN = 0.7;
/** Zoom máximo de um momento-chave (punch) considerado para o ponto fixo na metade. */
export const MOMENT_ZOOM = 1.25;
/** O queixo (base da caixa do rosto) fica acima desta altura da metade. */
export const CHIN_MAX = 0.86;
/** Folga acima da cabeça (fração da altura da metade). */
export const HEAD_MARGIN = 0.05;

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
  // O detector marca o rosto das sobrancelhas ao queixo; o topo do cabelo fica de 0,65 a
  // 1,0 altura do rosto acima do CENTRO dele (ver HEAD_ABOVE). Chapéu alto pode encostar no topo. Sem o tamanho
  // do rosto, supõe um rosto grande (o caso que corta).
  // `top`: o topo da cabeça mais alto do trecho (a pessoa se inclina para a câmera) — a
  // trava respeita esse, não só o do rosto médio
  const top = Number(face?.top);
  const fhh = fh > 0 ? fh : 0.2;
  const head = Math.min(fy - HEAD_ABOVE * fhh, Number.isFinite(top) ? top : Infinity);
  cropY = Math.min(cropY, head * scaledH - rh * HEAD_MARGIN);
  // rosto grande: a folga cheia empurrava o rosto para baixo (cenário em cima, queixo
  // cortado — print). Sobe o quadro até o queixo caber, sem passar da folga mínima.
  const chinMin = (fy + 0.5 * fhh) * scaledH - rh * CHIN_MAX;
  if (cropY < chinMin) {
    const tight = Math.min(fy - HEAD_ABOVE_MIN * fhh, Number.isFinite(top) ? top + (HEAD_ABOVE - HEAD_ABOVE_MIN) * fhh : Infinity);
    cropY = Math.min(chinMin, tight * scaledH - rh * HEAD_MARGIN);
  }
  cropY = Math.round(clamp(cropY, 0, scaledH - rh));
  // ponto fixo do zoom dos momentos-chave na metade: o mais perto do centro do rosto que
  // ainda deixa o cabelo e o queixo dentro no zoom máximo do momento (MOMENT_ZOOM). Antes era
  // o topo da cabeça: o cabelo ficava, mas o zoom empurrava o queixo para fora da metade.
  const inHalf = (v) => (v * scaledH - cropY) / rh;
  const Z = MOMENT_ZOOM;
  const hairTop = inHalf(fy - HEAD_ABOVE_MIN * fhh);
  const chinY = inHalf(fy + 0.55 * fhh);
  const hi = (hairTop * Z - 0.02) / (Z - 1); // cabelo ≥ 2% da metade
  const lo = (chinY * Z - 0.98) / (Z - 1); // queixo ≤ 98%
  const anchorY = +clamp(lo > hi ? hi : clamp(inHalf(fy), lo, hi), 0, 1).toFixed(3);
  // rosto que já enche a metade (pessoa inclinada para a câmera): o zoom do momento
  // empurraria o queixo para fora — nesse trecho a metade fica sem o zoom do momento
  const punchOk = lo <= hi + 1e-9;
  return { scaledW, scaledH, cropX, cropY, zoom: +zoom.toFixed(3), anchorY, punchOk };
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

// ─── Zoom no rosto do vídeo inteiro (tela cheia, "Automático (rosto)") ───

/** Folgas da tela cheia (fração da altura visível): acima da cabeça e abaixo do queixo. */
export const FULL_TOP_MARGIN = 0.05;
export const FULL_BOTTOM_MARGIN = 0.14;
/** Centro do rosto na tela cheia (fração da altura, de cima): olhos perto do terço de cima. */
export const FULL_FACE_Y = 0.42;
/** Topo do cabelo acima do centro do rosto na tela cheia (alturas de rosto). */
export const FULL_HEAD_ABOVE = 0.85;

/**
 * Zoom no rosto para o vídeo inteiro: o zoom escolhido vale ATÉ onde a cabeça e o queixo
 * cabem — considerando o vídeo todo (a pessoa se inclina para a câmera em alguns momentos) —,
 * com o rosto um pouco acima do meio. Antes o zoom era aplicado do tamanho pedido e
 * centralizava o centro do rosto (misturado com o movimento das mãos): com rosto grande ou
 * zoom alto, a cabeça saía do quadro. Mesma conta na prévia e no render. Puro.
 * @param {{x,y,h?,track?:Array<{t,x,y,h}>}|null} face rosto (centro 0–1, altura) e o rosto no tempo
 * @returns {{scaledW,scaledH,cropX,cropY,zoom:number}|null} null sem rosto (quem chama usa o padrão)
 */
export function fullFaceCrop(srcW, srcH, outW, outH, face, zoom = 1) {
  const fx0 = Number(face?.x);
  const fy = Number(face?.y);
  if (!face || face.y == null || !Number.isFinite(fy) || !Number.isFinite(fx0)) return null;
  const sw = Math.max(1, Number(srcW) || 1);
  const sh = Math.max(1, Number(srcH) || 1);
  const ow = Math.max(2, Number(outW) || 2);
  const oh = Math.max(2, Number(outH) || 2);
  const base = Math.max(ow / sw, oh / sh);
  const fh = Number(face.h) > 0 ? Number(face.h) : 0.15;
  // altura (na fonte) do topo da cabeça mais alto ao queixo mais baixo do vídeo
  const pts = (Array.isArray(face.track) ? face.track : []).filter((p) => p && Number.isFinite(Number(p.y)));
  const list = pts.length ? pts : [{ y: fy, h: fh }];
  const hOf = (p) => (Number(p.h) > 0 ? Number(p.h) : fh);
  const top = quantile(list.map((p) => Number(p.y) - FULL_HEAD_ABOVE * hOf(p)), 0.1);
  const bottom = quantile(list.map((p) => Number(p.y) + 0.55 * hOf(p)), 0.9);
  const v1 = Math.min(1, oh / (sh * base)); // fração da altura da fonte visível sem zoom
  let z = clamp(Number(zoom) || 1, 1, 2.5);
  const need = (bottom - top) / (1 - FULL_TOP_MARGIN - FULL_BOTTOM_MARGIN);
  if (need > 0) z = Math.min(z, Math.max(1, v1 / need));
  const vh = v1 / z;
  // vertical (fração da fonte): rosto a FULL_FACE_Y; a cabeça manda, depois o queixo
  const headMax = top - FULL_TOP_MARGIN * vh;
  let y0 = Math.min(fy - FULL_FACE_Y * vh, headMax);
  y0 = Math.max(y0, Math.min(bottom - (1 - FULL_BOTTOM_MARGIN) * vh, headMax));
  y0 = clamp(y0, 0, Math.max(0, 1 - vh));
  const s = base * z;
  const scaledW = Math.max(ow, Math.round(sw * s));
  const scaledH = Math.max(oh, Math.round(sh * s));
  const cropX = Math.round(clamp(clamp(fx0, 0, 1) * scaledW - ow / 2, 0, scaledW - ow));
  const cropY = Math.round(clamp(y0 * scaledH, 0, scaledH - oh));
  return { scaledW, scaledH, cropX, cropY, zoom: +z.toFixed(3) };
}
