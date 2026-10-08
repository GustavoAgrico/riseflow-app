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

// Cores de ênfase/destaque aceitas (mesmos ids da paleta da legenda).
export const EMPHASIS_COLORS = ['white', 'yellow', 'orange', 'purple', 'green', 'cyan', 'pink', 'red'];

/** Ênfase manual de uma palavra (cor própria e/ou maior), já validada. */
export function emphasisOf(w) {
  const out = {};
  if (EMPHASIS_COLORS.includes(w?.emColor)) out.emColor = w.emColor;
  if (w?.emBig === true) out.emBig = true;
  return out;
}
