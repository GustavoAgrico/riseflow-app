// Legenda em arquivo (SRT / VTT / TXT) — para subir no YouTube, Instagram, TikTok ou abrir
// no Premiere. Os cartões são os mesmos da legenda queimada (layoutCaption); o tempo vem
// já no vídeo final (o chamador passa `mapT` para cortes/velocidade).
import { layoutCaption } from './captionKeyword.js';

/**
 * Cartões da legenda: [{ start, end, text }] em ordem. Ignora palavras cortadas
 * (`removed`) e ocultas (`hidden`). `mapT(t)` converte o tempo (ex.: vídeo original →
 * vídeo final); devolver null tira a palavra (caiu num corte). Puro.
 */
export function captionCues(segments, { lines = 2, maxChars = 42, gap = 0, mapT = (t) => t } = {}) {
  const cues = [];
  for (const seg of segments || []) {
    const src = seg.words?.length ? seg.words : (String(seg.text || '').trim() ? [{ start: seg.start, end: seg.end, word: String(seg.text).trim() }] : []);
    const words = [];
    for (const w of src) {
      if (w.removed || w.hidden || !String(w.word ?? '').trim()) continue;
      if (mapT.cut?.((Number(w.start) + Number(w.end)) / 2)) continue; // a palavra caiu num corte
      const a = mapT(Number(w.start));
      const b = mapT(Number(w.end));
      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
      words.push({ start: a, end: Math.max(a + 0.05, b), word: String(w.word).trim() });
    }
    if (!words.length) continue;
    const segEnd = mapT(Number(seg.end));
    const cards = layoutCaption(words, { lines, maxChars, segEnd: Number.isFinite(segEnd) ? segEnd : undefined, gap });
    for (const c of cards) {
      const start = c.words[0].start;
      // o cartão não passa do fim da última palavra + 1 s (sem legenda parada no silêncio)
      const end = Math.max(start + 0.3, Math.min(c.end, c.words[c.words.length - 1].end + 1));
      const text = c.words.map((w) => (w.br ? `\n${w.word}` : w.word)).join(' ').replace(/ \n/g, '\n');
      cues.push({ start, end, text });
    }
  }
  cues.sort((x, y) => x.start - y.start);
  // sem sobreposição: cada cartão some quando o próximo aparece
  for (let i = 0; i + 1 < cues.length; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = Math.max(cues[i].start + 0.05, cues[i + 1].start);
  return cues;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(t, sep) {
  const ms = Math.max(0, Math.round(Number(t) * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** SubRip (.srt): o formato aceito em quase todo lugar. Puro. */
export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

/** WebVTT (.vtt): legenda da web (YouTube, players HTML5). Puro. */
export function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}

/** Texto simples com o tempo de cada legenda (para roteiro / descrição). Puro. */
export function toTxt(cues) {
  return cues.map((c) => `[${stamp(c.start, '.').slice(0, 8)}] ${c.text.replace(/\n/g, ' ')}`).join('\n');
}

/**
 * Tempo no vídeo final depois de tirar os trechos `skips` ([[a,b]…] ordenados, sem
 * sobreposição) e aplicar a velocidade geral. Um tempo dentro de um trecho tirado vai
 * para a emenda; `.cut(t)` diz se t caiu num trecho tirado. Puro.
 */
export function skipMapper(skips, speed = 1) {
  const k = Number(speed) > 0 ? Number(speed) : 1;
  const f = (t) => {
    let cut = 0;
    for (const [a, b] of skips) {
      if (t >= b) cut += b - a;
      else if (t > a) { cut += t - a; break; }
      else break;
    }
    return (t - cut) / k;
  };
  f.cut = (t) => skips.some(([a, b]) => t > a && t < b);
  return f;
}
