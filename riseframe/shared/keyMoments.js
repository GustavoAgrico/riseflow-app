// Momentos-chave do vídeo para os efeitos (zoom "punch-in" + whoosh).
// Compartilhado pelo servidor (render) e pelo site (timeline/prévia): os dois
// escolhem exatamente os mesmos momentos.
//
// Em vez de aplicar o efeito o tempo todo (ou em toda frase alternada), só marca
// os pontos que merecem ênfase: começo de ideia depois de uma pausa, números,
// perguntas/exclamações, palavras fortes e o gancho do início — com um espaço
// mínimo entre eles para não cansar.

const STRONG = /(?<!\p{L})(nunca|sempre|todos|nada|ningu[eé]m|agora|segredo|erro|errado|verdade|problema|importante|aten[cç][aã]o|cuidado|dinheiro|gr[aá]tis|melhor|pior|maior|menor|r[aá]pido|f[aá]cil|imposs[ií]vel|incr[ií]vel|resultado|resultados|primeiro|[uú]nico|jamais|olha|pare)(?!\p{L})/iu;

function wordsOf(seg) {
  const ws = seg?.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text || '' }];
  return ws.filter((w) => !w.removed && String(w.word ?? '').trim());
}

/** Nota de "ênfase" de uma frase (0 = comum). Exportado para teste. */
export function emphasisScore(seg, prevEnd, index) {
  const words = wordsOf(seg);
  if (!words.length) return 0;
  const text = words.map((w) => String(w.word)).join(' ');
  let s = 0;
  if (Number.isFinite(prevEnd) && seg.start - prevEnd >= 0.45) s += 2; // ideia nova depois de pausa
  if (/\d/.test(text)) s += 2; // número / dado
  if (/[!?]/.test(text)) s += 2; // pergunta / exclamação
  if (STRONG.test(text)) s += 2; // palavra de impacto
  if (words.some((w) => String(w.word).replace(/[^\p{L}]/gu, '').length >= 9)) s += 1; // palavra longa
  if (index === 0) s += 1; // gancho do início
  if (words.length <= 2) s -= 1; // fragmento muito curto
  return s;
}

/**
 * Escolhe os momentos-chave. Devolve [{ start, end }] em segundos, ordenados.
 * @param {Array<{start:number,end:number,words?:Array}>} segments frases
 * @param {number} dur duração do vídeo
 * @param {{minGap?:number, maxLen?:number, minLen?:number, minScore?:number}} [opts]
 */
export function keyZoomMoments(segments, dur, opts = {}) {
  const minGap = opts.minGap ?? 5; // segundos mínimos entre dois zooms
  const maxLen = opts.maxLen ?? 2.2; // duração máxima de cada zoom
  const minLen = opts.minLen ?? 0.8;
  const minScore = opts.minScore ?? 2;
  const total = Number(dur) || 0;

  const segs = (segments || [])
    .filter((s) => Number.isFinite(Number(s.start)) && wordsOf(s).length)
    .map((s) => ({ ...s, start: Number(s.start), end: Number(s.end) || Number(s.start) + 0.5 }))
    .sort((a, b) => a.start - b.start);
  if (!segs.length) return [];

  const scored = segs.map((s, i) => ({ seg: s, score: emphasisScore(s, i > 0 ? segs[i - 1].end : NaN, i) }));

  const out = [];
  let last = -Infinity;
  for (const { seg, score } of scored) {
    if (score < minScore) continue;
    if (seg.start - last < minGap) continue;
    const start = seg.start;
    const end = Math.min(total || Infinity, Math.max(start + minLen, Math.min(seg.end, start + maxLen)));
    if (end - start < 0.3) continue;
    out.push({ start: +start.toFixed(2), end: +end.toFixed(2) });
    last = start;
  }

  // Vídeo sem nenhuma frase "forte": ainda assim marca a de maior ênfase.
  if (!out.length && segs.length >= 2) {
    const best = scored.slice(1).sort((a, b) => b.score - a.score)[0] || scored[0];
    const start = best.seg.start;
    out.push({ start: +start.toFixed(2), end: +Math.min(total || Infinity, Math.max(start + minLen, Math.min(best.seg.end, start + maxLen))).toFixed(2) });
  }
  return out;
}
