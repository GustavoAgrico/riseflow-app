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

// Palavras curtas comuns (pt/en) que NÃO devem ser tratadas como fragmento de
// gagueira mesmo sendo prefixo da palavra seguinte (ex.: "com computador").
const PROTECTED = new Set([
  'com', 'como', 'para', 'por', 'que', 'uma', 'um', 'dos', 'das', 'nos', 'nas',
  'meu', 'minha', 'seu', 'sua', 'foi', 'vou', 'vai', 'tem', 'ser', 'ver', 'dar',
  'mais', 'mas', 'sem', 'sob', 'sao', 'nao', 'sim', 'the', 'and', 'for', 'you', 'are',
]);

/**
 * Falso começo / gagueira parcial: `a` é uma tentativa abandonada de `b` quando é
 * prefixo dela (ex.: "trans" → "transformar", "com-" → "comprar"). Guardas para
 * não cortar palavras curtas legítimas (PROTECTED) nem casos ambíguos.
 */
function isStutterFragment(a, b) {
  if (a.length < 2 || a.length > 6 || PROTECTED.has(a)) return false; // fragmento curto
  if (a === b || !b.startsWith(a)) return false;
  return b.length >= a.length + 2; // a próxima é claramente mais longa
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

  // Sequência global de palavras mantidas (com norma não-vazia), por referência.
  const kept = () => {
    const out = [];
    for (const seg of segments) for (const w of seg.words) {
      if (w.removed) continue;
      const n = norm(w.word);
      if (n) out.push({ w, n });
    }
    return out;
  };

  if (removeRepeats) {
    // 0) Repetição com muleta no meio: "isso né isso" / "quero tipo quero" →
    // remove o marcador e a 1ª cópia, mantém a 2ª. Marcadores só são removidos
    // AQUI (entre palavras iguais), nunca soltos, para não mudar o tom da fala.
    const WEAK = new Set(['ne', 'ta', 'tipo', 'assim', 'sabe', 'entao', 'ai', 'olha', 'entendeu']);
    let list = kept();
    for (let i = 0; i + 2 < list.length; i++) {
      if (list[i].w.removed) continue;
      if (list[i].n === list[i + 2].n && WEAK.has(list[i + 1].n)) {
        list[i].w.removed = true;
        list[i + 1].w.removed = true;
        removedCount += 2;
      }
    }

    // 1) Falso começo / gagueira parcial: "trans transformar" → remove "trans".
    list = kept();
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].w.removed) continue;
      if (isStutterFragment(list[i].n, list[i + 1].n)) {
        list[i].w.removed = true;
        removedCount++;
      }
    }

    // 2) Repetição imediata de FRASE (1 a 3 palavras): "no banco no banco" →
    // remove a primeira ocorrência; "eu eu quero" → remove o primeiro "eu".
    // Trata n maior primeiro para pegar frases antes de palavras isoladas.
    for (let n = 3; n >= 1; n--) {
      list = kept();
      let i = 0;
      while (i + 2 * n <= list.length) {
        let equal = true;
        for (let k = 0; k < n; k++) {
          if (list[i + k].n !== list[i + n + k].n) { equal = false; break; }
        }
        if (equal) {
          for (let k = 0; k < n; k++) { list[i + k].w.removed = true; removedCount++; }
          i += n; // pula o bloco removido; a cópia mantida pode repetir de novo adiante
        } else {
          i++;
        }
      }
    }
  }

  return { ...transcript, segments, removedCount };
}
