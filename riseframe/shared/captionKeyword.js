import { CAPTION_COLOR_LIST, isCaptionColor } from './captionStyle.js';

// Palavra-chave de uma frase de legenda — usada no render (servidor) e na prévia (web),
// para os dois destacarem sempre a mesma palavra.

// Stopwords (PT + EN): palavras funcionais que nunca devem ser destacadas.
const STOPWORDS = new Set([
  // português
  'a', 'o', 'e', 'é', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'pro', 'com', 'sem', 'que', 'se', 'não',
  'sim', 'mais', 'mas', 'ou', 'como', 'quando', 'onde', 'quem', 'qual', 'quais', 'isso', 'isto',
  'esse', 'essa', 'este', 'esta', 'aquele', 'aquela', 'ele', 'ela', 'eles', 'elas', 'eu', 'tu',
  'você', 'vocês', 'nós', 'meu', 'minha', 'seu', 'sua', 'ao', 'aos', 'à', 'às', 'já', 'ainda',
  'muito', 'muita', 'pouco', 'tão', 'ser', 'ter', 'estar', 'foi', 'era', 'são', 'vai', 'vou',
  'tem', 'tinha', 'está', 'até', 'também', 'só', 'lá', 'aqui', 'ali', 'então', 'porque',
  // inglês
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'without',
  'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'you', 'i',
  'we', 'they', 'he', 'she', 'my', 'your', 'so', 'if', 'as', 'not', 'no', 'yes', 'do', 'does',
]);

/**
 * Escolhe a palavra-chave de um conjunto de palavras ({word}) — a palavra de conteúdo
 * mais "forte": não-stopword, ≥4 letras, priorizando a mais longa. -1 quando não há.
 */
export function pickKeyword(words) {
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < words.length; i++) {
    const clean = String(words[i].word).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (clean.length < 4 || STOPWORDS.has(clean)) continue;
    if (clean.length > bestLen) {
      bestLen = clean.length;
      best = i;
    }
  }
  return best;
}

// Cores de ênfase/destaque aceitas: as da paleta da legenda (ou "#RRGGBB").
export const EMPHASIS_COLORS = CAPTION_COLOR_LIST.map((c) => c.id);

/** Ênfase manual de uma palavra (cor própria e/ou maior), já validada. */
export function emphasisOf(w) {
  const out = {};
  if (isCaptionColor(w?.emColor)) out.emColor = w.emColor;
  if (w?.emBig === true) out.emBig = true;
  return out;
}

/**
 * Premium: divide a frase em blocos de até 4 palavras e acha, em cada um, onde começa a
 * parte GRANDE (a palavra com ênfase manual ou a palavra-chave, até o fim do bloco).
 * Sem palavra-chave, a última palavra fica grande, mas sem brilho.
 * @returns {Array<{words:Array, big:number, glow:boolean, end:number}>}
 */
export function premiumChunks(words, segEnd, max = 4) {
  const n = Math.ceil(words.length / max);
  const out = [];
  for (let c = 0; c < n; c++) {
    const a = Math.round((c * words.length) / n);
    const b = Math.round(((c + 1) * words.length) / n);
    const chunk = words.slice(a, b);
    if (!chunk.length) continue;
    const manual = chunk.findIndex((wd) => wd.emColor || wd.emBig);
    const kw = manual >= 0 ? manual : pickKeyword(chunk);
    out.push({ words: chunk, big: kw >= 0 ? kw : chunk.length - 1, glow: kw >= 0 });
  }
  out.forEach((ch, i) => {
    const last = ch.words[ch.words.length - 1];
    ch.end = i + 1 < out.length ? out[i + 1].words[0].start : Math.max(last.end, Number(segEnd) || 0);
  });
  return out;
}

/**
 * Quebra as palavras de uma frase em "cartões" de legenda: cada cartão tem no máximo
 * `lines` linhas (1 ou 2) com até `maxChars` caracteres cada — a quebra é sempre entre
 * palavras. A palavra que começa uma linha nova ganha `br: true`. Uma palavra maior que
 * o limite fica sozinha na linha. Usado no render e na prévia (mesmo resultado).
 * @returns {Array<{words:Array, end:number}>} `end` = quando o próximo cartão começa
 */
export function layoutCaption(words, { lines = 2, maxChars = 24, segEnd, gap = 0 } = {}) {
  const L = lines === 1 ? 1 : 2;
  const M = Math.max(6, Math.round(maxChars) || 24);
  const cards = [];
  let card = [];
  let line = 1;
  let len = 0;
  for (const w of words) {
    const n = String(w.word ?? '').length;
    if (!card.length) {
      card.push({ ...w, br: false });
      len = n;
      continue;
    }
    if (len + 1 + n <= M) {
      card.push({ ...w, br: false });
      len += 1 + n;
    } else if (line < L) {
      card.push({ ...w, br: true });
      line += 1;
      len = n;
    } else {
      cards.push(card);
      card = [{ ...w, br: false }];
      line = 1;
      len = n;
    }
  }
  if (card.length) cards.push(card);
  const g = Math.max(0, Number(gap) || 0);
  return cards.map((ws, i) => {
    const last = ws[ws.length - 1];
    if (i + 1 >= cards.length) {
      // com intervalo, o fim da frase já vem ajustado (timeSegments): não estica até o fim da palavra
      if (g > 0 && Number(segEnd) > 0) return { words: ws, end: Math.max((last.start ?? 0) + 0.05, Number(segEnd)) };
      return { words: ws, end: Math.max(last.end ?? 0, Number(segEnd) || 0) };
    }
    const next = cards[i + 1][0].start;
    // intervalo entre legendas: o cartão some um pouco antes do próximo (nunca antes da última palavra começar)
    return { words: ws, end: g > 0 ? Math.max(last.start + 0.05, next - g) : next };
  });
}

/**
 * "Remover pontuação" (como no Premiere): tira vírgulas, pontos, aspas, reticências…
 * Mantém o que faz parte da palavra (apóstrofo, hífen de "bem-vindo", 10,5, 3.000).
 */
export function stripPunct(word) {
  return String(word ?? '')
    .replace(/(\d)([.,])(?=\d)/g, (_, d, p) => d + (p === ',' ? '\u0001' : '\u0002'))
    .replace(/[.,!?;:…"“”«»„()[\]{}¡¿*]/g, '')
    .replace(/^[-–—'’]+|[-–—'’]+$/g, '')
    .replace(/\u0001/g, ',')
    .replace(/\u0002/g, '.')
    .trim();
}

/** Opções de tempo da legenda (iguais no render e na prévia). */
export function captionTiming(o = {}) {
  return {
    minDur: Math.min(5, Math.max(0, Number(o.captionMinDuration) || 0)),
    gap: Math.min(0.5, Math.max(0, Number(o.captionGap) || 0)),
    noPunct: o.captionNoPunct === true,
  };
}

/**
 * Duração mínima e intervalo entre legendas: cada frase fica na tela pelo menos `minDur`
 * segundos (avançando na pausa seguinte) e termina `gap` segundos antes da próxima.
 * `alive(seg)` diz se a frase aparece (frases sem palavras não contam).
 */
export function timeSegments(segments, { minDur = 0, gap = 0 } = {}, alive = () => true) {
  if (!(minDur > 0) && !(gap > 0)) return segments;
  const live = segments.map((s, i) => (alive(s) ? i : -1)).filter((i) => i >= 0);
  const out = segments.slice();
  live.forEach((i, k) => {
    const s = segments[i];
    const start = Number(s.start) || 0;
    const end0 = Number(s.end) || start;
    let end = Math.max(end0, start + minDur);
    const nx = k + 1 < live.length ? segments[live[k + 1]] : null;
    if (nx) end = Math.min(end, Number(nx.start) - gap);
    end = Math.max(end, Math.min(end0, start + 0.1));
    if (end !== end0) out[i] = { ...s, end: +end.toFixed(3) };
  });
  return out;
}

/**
 * Quantos caracteres cabem numa linha quando o limite é automático: largura útil do
 * quadro ÷ largura média de uma letra (fonte em maiúsculas é mais larga).
 */
export function autoMaxChars(frameW, fontPx, upper, widthFrac = 0.86) {
  const avail = frameW * widthFrac;
  return Math.max(8, Math.floor(avail / (fontPx * (upper ? 0.66 : 0.56))));
}
