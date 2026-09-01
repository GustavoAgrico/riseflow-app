/**
 * Limpeza automática da fala: marca para remoção muletas/hesitações ("é...", "hã",
 * "hmm", vogais alongadas) e gagueiras (repetição imediata da mesma palavra).
 * Trabalha sobre a transcrição (palavras com timing) — as palavras marcadas com
 * `removed: true` viram faixas de corte na timeline (ver pipeline/index.js).
 *
 * Conservador de propósito: NÃO inclui conectivos que carregam sentido
 * ("então", "tipo", "aí", "né", "olha") para não alterar o significado da fala.
 */

// Muletas / sons de hesitação (pt-BR + algumas en), já normalizados (sem acento).
const FILLERS = new Set([
  'ha', 'han', 'ahn', 'ahnn', 'hum', 'humm', 'hmm', 'hm', 'ahm', 'ahmm',
  'uhm', 'uh', 'uhh', 'er', 'err', 'ehm', 'mmm', 'ahan', 'anham', 'uhum', 'aham',
]);

/** minúsculas, sem acentos, sem pontuação/espaços. */
function norm(word) {
  return String(word ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** 3+ vezes o mesmo caractere → alongamento/hesitação (aaa, ééé, hmmm). */
function isElongated(n) {
  return /^([a-z])\1{2,}$/.test(n);
}

/** True se a palavra é uma muleta/hesitação (não uma palavra com significado). */
export function isFiller(word) {
  const n = norm(word);
  if (!n) return false;
  return FILLERS.has(n) || isElongated(n);
}

/**
 * Marca palavras a remover na transcrição (retorna uma NOVA transcrição; não muta a
 * original). Preserva marcações `removed` já existentes (ex.: edição manual do cliente).
 * @param {object} transcript {segments:[{start,end,text,words:[{start,end,word,removed?}]}]}
 * @param {object} opts {fillers?:boolean=true, repeats?:boolean=true}
 * @returns {{segments:Array, removedCount:number}}
 */
export function markFillers(transcript, opts = {}) {
  const removeFillers = opts.fillers !== false;
  const removeRepeats = opts.repeats !== false;
  let removedCount = 0;

  const segments = (transcript?.segments || []).map((seg) => {
    const src = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    const words = src.map((w) => ({ ...w }));
    if (removeFillers) {
      for (const w of words) {
        if (!w.removed && isFiller(w.word)) {
          w.removed = true;
          removedCount++;
        }
      }
    }
    return { ...seg, words };
  });

  // Gagueira: percorre a sequência global de palavras ainda mantidas; ao encontrar
  // duas iguais em sequência, remove a ANTERIOR e mantém a última (a "boa").
  if (removeRepeats) {
    const flat = [];
    for (const seg of segments) for (const w of seg.words) flat.push(w);
    let prevKept = null;
    for (const w of flat) {
      if (w.removed) continue;
      const n = norm(w.word);
      if (!n) continue;
      if (prevKept && norm(prevKept.word) === n) {
        prevKept.removed = true;
        removedCount++;
      }
      prevKept = w;
    }
  }

  return { ...transcript, segments, removedCount };
}
