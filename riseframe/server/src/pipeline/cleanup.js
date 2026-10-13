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

// Muletas extras removidas só no modo agressivo ("forte"): sons de hesitação
// puros (não conectivos com sentido). Conectivos como "tipo"/"né"/"então" só são
// cortados quando REPETIDOS (ver removeRepeats), nunca isolados — preserva o tom.
const FILLERS_AGGRESSIVE = new Set([
  'eh', 'ehh', 'ehhh', 'ah', 'ahh', 'ahhh', 'oh', 'ohh', 'humhum', 'anram',
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
export function isFiller(word, aggressive = false) {
  const n = norm(word);
  if (!n) return false;
  if (FILLERS.has(n) || isElongated(n)) return true;
  return aggressive && FILLERS_AGGRESSIVE.has(n);
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
function isStutterFragment(a, b, aggressive = false) {
  const maxLen = aggressive ? 7 : 6;
  if (a.length < 2 || a.length > maxLen || PROTECTED.has(a)) return false; // fragmento curto
  if (a === b || !b.startsWith(a)) return false;
  return b.length >= a.length + (aggressive ? 1 : 2); // a próxima é claramente mais longa
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
  const aggressive = opts.aggressive === true;
  let removedCount = 0;

  const segments = (transcript?.segments || []).map((seg) => {
    const src = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    const words = src.map((w) => ({ ...w }));
    if (removeFillers) {
      for (const w of words) {
        if (!w.removed && isFiller(w.word, aggressive)) {
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

  // Hesitação "é..." / "ah..." (com reticências) no começo de uma frase ou depois de
  // uma pausa: no corte forte é muleta ("É... então eu fui"), não o verbo.
  if (removeFillers && aggressive) {
    const list = kept();
    for (let i = 0; i < list.length; i++) {
      const raw = String(list[i].w.word ?? '').trim();
      if (!/^(é|e|eh|ah|ã|hã|o|ó)(\.\.\.|…)$/i.test(raw)) continue;
      const prev = list[i - 1];
      const afterPause = !prev || ENDS_CLAUSE.test(String(prev.w.word)) || Number(list[i].w.start) - Number(prev.w.end) >= 0.3;
      if (afterPause) {
        list[i].w.removed = true;
        removedCount++;
      }
    }
  }

  if (removeRepeats) {
    // 0) Repetição com muleta no meio: "isso né isso" / "quero tipo quero" →
    // remove o marcador e a 1ª cópia, mantém a 2ª. Marcadores só são removidos
    // AQUI (entre palavras iguais), nunca soltos, para não mudar o tom da fala.
    const WEAK = new Set(['ne', 'ta', 'tipo', 'assim', 'sabe', 'entao', 'ai', 'olha', 'entendeu']);
    // Palavras repetidas DE PROPÓSITO (ênfase) — não são engasgo: "muito muito
    // bom", "não não", "nunca nunca". Mantém as duas para não perder o sentido.
    const EMPHATIC = new Set([
      'muito', 'muita', 'nao', 'sim', 'nunca', 'sempre', 'bem', 'mal', 'tao', 'mais', 'menos',
      'agora', 'ja', 'mesmo', 'super', 'mega', 'grande', 'forte', 'rapido', 'devagar', 'calma',
      'cada', 'todo', 'toda', 'bom', 'boa', 'ruim', 'lindo', 'linda', 'enorme', 'demais',
    ]);
    // Conector no meio de uma repetição (engasgo): muleta fraca, hesitação, ou —
    // no modo forte — palavra bem curta (ex.: "quero é quero", "vou ah vou").
    const midIsConnector = (n) => WEAK.has(n) || isFiller(n, aggressive) || (aggressive && n.length <= 2);
    let list = kept();
    for (let i = 0; i + 2 < list.length; i++) {
      if (list[i].w.removed) continue;
      if (list[i].n === list[i + 2].n && midIsConnector(list[i + 1].n)) {
        list[i].w.removed = true;
        list[i + 1].w.removed = true;
        removedCount += 2;
      }
    }

    // 1) Falso começo / gagueira parcial: "trans transformar" → remove "trans".
    list = kept();
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].w.removed) continue;
      if (isStutterFragment(list[i].n, list[i + 1].n, aggressive)) {
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
        // Repetição de UMA palavra que é ênfase intencional → mantém as duas.
        if (equal && n === 1 && EMPHATIC.has(list[i].n)) equal = false;
        if (equal) {
          for (let k = 0; k < n; k++) { list[i + k].w.removed = true; removedCount++; }
          i += n; // pula o bloco removido; a cópia mantida pode repetir de novo adiante
        } else {
          i++;
        }
      }
    }

    // 3) Frase REFEITA (retomada): a pessoa começa, erra ou trava, e fala de novo
    // ("hoje eu vou mostrar três... hoje eu vou te mostrar as três dicas") → sai a
    // tentativa abandonada inteira, fica a versão final.
    removedCount += markRetakes(kept());
    // 4) Correção explícita: "custa 50, digo, 60 reais" → sai "50, digo,".
    if (aggressive) removedCount += markCorrections(kept());
  }

  return { ...transcript, segments, removedCount };
}

/** Pontuação de fim de frase/oração na palavra crua ("vendas." "assim,"). */
const ENDS_CLAUSE = /[.,!?;:…]["')\]]*$/;

/**
 * Frases refeitas. Para cada palavra i, procura adiante (até 20 palavras / 12 s) um
 * recomeço j em que as palavras voltam a se repetir (ao menos 2 iguais seguidas). O
 * trecho [i, j) é uma tentativa abandonada se TODA palavra dele reaparece no recomeço
 * (ou é um pedaço de palavra do recomeço — "super-" → "supermercado" — ou uma muleta).
 * Uma palavra nova no trecho (ex.: "eu quero que você cresça, eu quero que você lucre")
 * indica paralelismo de propósito → fica. Marca e devolve quantas palavras saíram.
 */
export function markRetakes(list) {
  let removed = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].w.removed) continue;
    for (let j = i + 2; j < list.length - 1 && j - i <= 20; j++) {
      if (Number(list[j].w.start) - Number(list[i].w.start) > 12) break;
      if (list[j].n !== list[i].n || list[j + 1].n !== list[i + 1].n) continue;
      const span = j - i;
      const redo = new Set();
      for (let k = j; k < Math.min(list.length, j + span + 4); k++) redo.add(list[k].n);
      const covered = (x) => {
        if (redo.has(x.n) || isFiller(x.w.word, true) || /-$/.test(String(x.w.word))) return true;
        if (x.n.length < 2) return false;
        for (const r of redo) if (r.length > x.n.length && r.startsWith(x.n)) return true;
        return false;
      };
      let ok = true;
      for (let k = i; k < j && ok; k++) ok = covered(list[k]);
      if (!ok) continue;
      for (let k = i; k < j; k++) {
        if (!list[k].w.removed) {
          list[k].w.removed = true;
          removed++;
        }
      }
      i = j - 1;
      break;
    }
  }
  return removed;
}

// "digo", "ou melhor", "perdão", "desculpa" logo depois de um erro, seguidos da versão certa.
const CORRECTION_MARKERS = [['digo'], ['ou', 'melhor'], ['perdao'], ['desculpa'], ['desculpe']];

/**
 * Correção explícita (só no corte forte): "no dia 15, digo, no dia 16" → sai
 * "no dia 15, digo,". O trecho errado começa na palavra (até 5 antes do marcador) que
 * se repete logo depois dele; sem essa repetição não mexe (o marcador pode ter outro
 * sentido: "desculpa a demora"). Devolve quantas palavras saíram.
 */
export function markCorrections(list) {
  let removed = 0;
  for (let m = 1; m < list.length; m++) {
    const marker = CORRECTION_MARKERS.find((mk) => mk.every((t, k) => list[m + k]?.n === t));
    if (!marker) continue;
    const after = m + marker.length;
    if (after >= list.length) continue;
    // o marcador vem logo depois de uma vírgula/pausa (é uma interrupção, não parte da frase)
    const prev = list[m - 1];
    const pause = Number(list[m].w.start) - Number(prev.w.end);
    if (!ENDS_CLAUSE.test(String(prev.w.word)) && !(pause >= 0.2)) continue;
    let p = -1;
    for (let k = m - 1; k >= Math.max(0, m - 5); k--) {
      if (list[k].n === list[after].n) { p = k; break; }
    }
    // número trocado por número: "50, digo, 60"
    if (p < 0 && /^\d+$/.test(prev.n) && /^\d+$/.test(list[after].n)) p = m - 1;
    if (p < 0) continue;
    for (let k = p; k < after; k++) {
      if (!list[k].w.removed) {
        list[k].w.removed = true;
        removed++;
      }
    }
    m = after;
  }
  return removed;
}

// ── Marcações de som que a transcrição escreve no lugar da fala ──
const TAG_OPEN = /^[[(*♪]/;
const TAG_CLOSE = /[\])*♪][.,!?]*$/;
// tosse, pigarro, espirro, fungada, estalo, respiração, suspiro (pt/en)
const NOISE_WORDS = /toss|cough|pigarr|throat|garganta|espirr|sneez|fung|sniff|estal|click|respir|breath|suspir|sigh|inspir/i;

/**
 * Marcações como "(tosse)", "[pigarro]", "*limpa a garganta*", "[Música]", "(risos)":
 * não são fala. As de tosse/pigarro/estalo viram palavras REMOVIDAS (o som sai do vídeo,
 * e o editor mostra riscado — dá para voltar); as outras (música, risos, aplausos) só
 * saem do texto, sem cortar nada. Devolve uma NOVA transcrição.
 */
export function markNoiseTags(transcript) {
  if (!transcript?.segments?.length) return transcript;
  let changed = false;
  const segments = transcript.segments.map((seg) => {
    if (!seg.words?.length) return seg;
    const words = [];
    for (let i = 0; i < seg.words.length; i++) {
      const w = seg.words[i];
      const raw = String(w.word ?? '').trim();
      if (!TAG_OPEN.test(raw)) {
        words.push(w);
        continue;
      }
      // a marcação pode ter várias palavras: "[limpa" "a" "garganta]"
      let j = i;
      while (j < seg.words.length && j - i < 5 && !TAG_CLOSE.test(String(seg.words[j].word ?? '').trim())) j++;
      if (j >= seg.words.length || j - i >= 5) {
        words.push(w);
        continue;
      }
      const group = seg.words.slice(i, j + 1);
      const text = group.map((g) => String(g.word ?? '').trim()).join(' ');
      changed = true;
      if (NOISE_WORDS.test(text)) {
        words.push({ start: group[0].start, end: group[group.length - 1].end, word: text, removed: true, noise: true });
      }
      i = j;
    }
    if (words.length === seg.words.length) return seg;
    return { ...seg, words, text: words.filter((w) => !w.noise).map((w) => w.word).join(' ') };
  }).filter((seg) => !seg.words || seg.words.length);
  return changed ? { ...transcript, segments } : transcript;
}
