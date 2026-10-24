import { keyAt, cleanKeys } from '../../shared/transform.js';

/**
 * Pedaços da faixa V1 (cada um com Transformar/Recortar próprios), como os clipes do
 * Premiere: o vídeo se separa nos começos dos clipes da montagem, na navalha e em cada
 * trecho cortado (pausa, erro, Delete). Antes só a navalha separava, e o ajuste de "um
 * trecho" num vídeo sem navalha ia para o vídeo inteiro. Puro.
 * @param clips [{ start, end }] clipes da montagem
 * @param splits tempos da navalha
 * @param gaps [[a, b]] trechos cortados
 * @returns [{ a, b, va, vb, clip }] — a/b: limites; va/vb: a parte que aparece
 */
export function v1PiecesOf(clips, splits, gaps, dur) {
  if (!clips?.length) return [];
  const pg = [];
  for (const [a0, b0] of [...(gaps || [])].sort((x, y) => x[0] - y[0])) {
    const last = pg[pg.length - 1];
    if (last && a0 <= last[1] + 0.01) last[1] = Math.max(last[1], b0); else pg.push([a0, b0]);
  }
  const pts = [...new Set([0, dur, ...clips.map((c) => c.start), ...(splits || []), ...pg.flat()].map((x) => +(+x).toFixed(3)))]
    .filter((x) => x >= 0 && x <= dur).sort((a, b) => a - b);
  const out = [];
  // o trecho cortado entre dois pedaços fica com o pedaço SEGUINTE (o do começo do vídeo, com
  // o primeiro; o do fim, com o último): o pedaço cobre tudo e nenhum quadro fica sem dono
  let carry = null;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a0 = pts[k];
    const b = pts[k + 1];
    if (b - a0 < 0.05) { if (carry == null) carry = a0; continue; }
    let va = a0;
    let vb = b;
    for (const [g0, g1] of pg) if (g0 <= va + 0.01 && g1 > va) va = g1;
    for (let gi = pg.length - 1; gi >= 0; gi--) { const [g0, g1] = pg[gi]; if (g1 >= vb - 0.01 && g0 < vb) vb = g0; }
    if (vb - va < 0.03) { if (carry == null) carry = a0; continue; } // pedaço inteiro cortado
    const a = carry ?? a0;
    carry = null;
    const clip = clips.find((c) => va >= c.start - 0.01 && va < c.end - 0.01) || clips[0];
    out.push({ a, b, va, vb, clip });
  }
  if (carry != null && out.length) out[out.length - 1].b = dur;
  return out;
}

/**
 * Quadros-chave do vídeo principal com o Transformar de UM pedaço [a, b] trocado por `ks`
 * (os quadros do pedaço; vazio = o pedaço sem quadros próprios). Os outros pedaços não
 * mudam: os valores das bordas vêm dos quadros de ANTES (antes vinham só do que sobrava e o
 * pedaço seguinte, nunca ajustado, herdava o valor deste — o resto do vídeo saía
 * deslocado), e a troca na borda é seca (Manter): sem o quadro "misturado" no fim de cada
 * pedaço. G = ~1 quadro. Puro.
 */
export function pieceKeys(keys, a, b, ks0, dur, G = 0.034) {
  const near = (t, x) => Math.abs(t - x) < 0.006;
  const pick = (k) => ({ scale: k.scale, x: k.x, y: k.y, rot: k.rot });
  const list = (keys || []).filter((k) => k.t < a - G - 0.006 || k.t > b + 0.006);
  const ks = [...(ks0 || [])].sort((x, y) => x.t - y.t);
  if (ks.length) {
    if (a - G > 0.001) list.push({ t: a - G, ...keyAt(keys, a - G), hold: true });
    list.push({ t: a, ...pick(ks[0]) });
    list.push(...ks.filter((k) => k.t > a + 0.006 && k.t < b - G - 0.006));
    list.push({ t: b - G, ...pick(ks[ks.length - 1]), hold: true });
    if (b < dur - 0.001) list.push((keys || []).find((k) => near(k.t, b)) || { t: b, ...keyAt(keys, b) });
  }
  return cleanKeys(list);
}
