// Legendas adicionadas à mão na timeline (como o "+ Legenda" do CapCut): não dependem da
// fala, não mexem nos cortes e usam o mesmo estilo das legendas automáticas.
// Compartilhado pelo site (prévia) e pelo servidor (render) — a mesma conta nos dois.

/** Limpa a lista que veio do editor: texto, início e fim válidos (tempo original). */
export function cleanExtraCaptions(raw, max = 200) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    const text = String(c?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const start = Number(c?.start);
    const end = Number(c?.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.2) continue;
    out.push({ text, start: +start.toFixed(3), end: +Math.min(start + 60, end).toFixed(3) });
    if (out.length >= max) break;
  }
  return out;
}

/** Uma legenda extra como segmento de legenda: as palavras dividem o tempo por igual. */
export function extraCaptionSegment(c) {
  const parts = String(c.text || '').split(/\s+/).filter(Boolean);
  const step = (c.end - c.start) / Math.max(1, parts.length);
  const words = parts.map((word, i) => ({
    word,
    start: +(c.start + i * step).toFixed(3),
    end: +(c.start + (i + 1) * step).toFixed(3),
  }));
  return { start: c.start, end: c.end, text: parts.join(' '), words, extra: true };
}

/**
 * Junta as legendas extras às da fala. Onde há uma legenda extra, ela vale: as palavras
 * da fala que caem dentro dela não aparecem (nunca duas legendas uma por cima da outra).
 * `drop`: tira essas palavras (render) em vez de só marcá-las como removidas (prévia).
 */
export function mergeExtraCaptions(segments, extras, { drop = false } = {}) {
  const list = (extras || []).filter((c) => c && c.end > c.start && String(c.text || '').trim());
  if (!list.length) return segments || [];
  const covered = (w) => {
    const mid = (Number(w.start) + Number(w.end)) / 2;
    return list.some((c) => mid >= c.start && mid < c.end);
  };
  const speech = [];
  for (const s of segments || []) {
    if (!s.words?.length) {
      if (!covered(s)) speech.push(s);
      continue;
    }
    if (!s.words.some((w) => !w.removed && covered(w))) { speech.push(s); continue; }
    if (drop) {
      const words = s.words.filter((w) => !covered(w));
      if (words.length) speech.push({ ...s, start: words[0].start, end: Math.max(words[words.length - 1].end, words[0].start + 0.05), text: words.map((w) => w.word).join(' '), words });
      continue;
    }
    const words = s.words.map((w) => (!w.removed && covered(w) ? { ...w, removed: true, underExtra: true } : w));
    speech.push({ ...s, words });
  }
  return [...speech, ...list.map(extraCaptionSegment)].sort((a, b) => a.start - b.start);
}
