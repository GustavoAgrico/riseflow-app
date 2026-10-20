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
// ("aham"/"uhum" ficam: são "sim" e têm sentido)
const FILLERS = new Set([
  'ha', 'han', 'ahn', 'ahnn', 'hum', 'humm', 'hmm', 'hm', 'ahm', 'ahmm',
  'uhm', 'uh', 'uhh', 'er', 'err', 'ehm', 'mmm',
]);
// Palavras de verdade que, sem acento, ficam iguais a uma muleta ("há" → "ha").
const REAL_WORDS = new Set(['há', 'hà', 'àh']);

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

// Formas da MESMA palavra que a transcrição escreve diferente de uma vez para outra
// ("pra"/"para", "tá"/"está", "cê"/"você", "3"/"três"): só para achar repetições.
const SAME_WORD = {
  pra: 'para', pro: 'para', pras: 'para', pros: 'para', ta: 'esta', tava: 'estava', tavam: 'estavam', to: 'estou',
  ce: 'voce', vc: 'voce', ces: 'voces', vcs: 'voces', oce: 'voce',
  um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', sete: '7', oito: '8',
  nove: '9', dez: '10', cem: '100', mil: '1000',
};
/** Palavra normalizada na forma canônica (compara repetições). */
export function canon(word) {
  const n = norm(word);
  return SAME_WORD[n] || n;
}

/** 3+ vezes o mesmo caractere → alongamento/hesitação (aaa, ééé, hmmm). */
function isElongated(n) {
  return /^([a-z])\1{2,}$/.test(n);
}

/** True se a palavra é uma muleta/hesitação (não uma palavra com significado). */
export function isFiller(word, aggressive = false) {
  const n = norm(word);
  if (!n) return false;
  const raw = String(word ?? '').toLowerCase().replace(/[^\p{L}]/gu, '');
  if (REAL_WORDS.has(raw)) return false; // "há dois anos" não é o "hã" de hesitação
  if (FILLERS.has(n) || isElongated(n)) return true;
  return aggressive && FILLERS_AGGRESSIVE.has(n);
}

// Palavras comuns (pt/en) que NUNCA são tratadas como fragmento de gagueira, mesmo
// sendo o começo da palavra seguinte: "se sentir", "no nosso", "de dentro", "ou outro",
// "do dobro", "com computador", "para parar"...
const PROTECTED = new Set([
  'a', 'o', 'e', 'as', 'os', 'ao', 'aos', 'de', 'da', 'do', 'das', 'dos', 'no', 'na', 'nos', 'nas',
  'em', 'um', 'uma', 'uns', 'umas', 'se', 'me', 'te', 'lhe', 'eu', 'tu', 'ele', 'ela', 'eles', 'elas',
  'nos', 'vos', 'ou', 'nem', 'mas', 'mais', 'que', 'com', 'sem', 'sob', 'por', 'pra', 'pro', 'para',
  'como', 'quem', 'qual', 'onde', 'quando', 'isso', 'isto', 'esse', 'essa', 'este', 'esta', 'aqui', 'ali',
  'la', 'ja', 'so', 'ate', 'bem', 'mal', 'sim', 'nao', 'tao', 'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa',
  'foi', 'vou', 'vai', 'tem', 'ter', 'ser', 'ver', 'dar', 'faz', 'fez', 'diz', 'ir', 'sou', 'sao', 'era',
  'pode', 'quer', 'cada', 'todo', 'toda', 'tudo', 'nada', 'muito', 'pouco', 'dia', 'ano', 'vez', 'bom', 'boa',
  'mao', 'fim', 'cor', 'mar', 'sol', 'paz', 'mes', 'casa', 'parte', 'tempo', 'forma', 'hoje', 'agora',
  'the', 'and', 'for', 'you', 'are', 'in', 'on', 'to', 'of', 'at', 'is', 'it', 'be', 'we', 'he', 'she',
]);

/**
 * Falso começo / gagueira parcial: `a` é uma tentativa abandonada de `b` quando é
 * prefixo dela (ex.: "trans" → "transformar", "com-" → "comprar"). Guardas para
 * não cortar palavras curtas legítimas (PROTECTED) nem casos ambíguos.
 */
function isStutterFragment(a, b, aggressive = false, { cutMark = false, gap = 0 } = {}) {
  if (a === b || !b.startsWith(a)) return false;
  // a transcrição marcou a palavra cortada ("super-", "trans…"): é tentativa abandonada
  if (cutMark) return a.length >= 2 && b.length > a.length;
  const maxLen = aggressive ? 7 : 6;
  if (a.length < 3 || a.length > maxLen || PROTECTED.has(a)) return false;
  // sem marca: só se a pessoa parou um instante antes de refazer a palavra (fala
  // corrida, como "pra preparar", não é gagueira)
  if (!(gap >= 0.1)) return false;
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
      if (n) out.push({ w, n, c: SAME_WORD[n] || n });
    }
    return out;
  };

  // Hesitação "é..." / "ah..." (com reticências) no começo de uma frase ou depois de
  // uma pausa: no corte forte é muleta ("É... então eu fui"), não o verbo.
  if (removeFillers && aggressive) {
    const list = kept();
    for (let i = 0; i < list.length; i++) {
      const raw = String(list[i].w.word ?? '').trim();
      if (!/^(é|eh|ah|ã|hã)(\.\.\.|…)$/i.test(raw)) continue;
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
      if (list[i].c === list[i + 2].c && midIsConnector(list[i + 1].n)) {
        list[i].w.removed = true;
        list[i + 1].w.removed = true;
        removedCount += 2;
      }
    }

    // 1) Falso começo / gagueira parcial: "trans transformar" → remove "trans".
    list = kept();
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].w.removed) continue;
      const raw = String(list[i].w.word ?? '').trim();
      const gap = Number(list[i + 1].w.start) - Number(list[i].w.end);
      if (isStutterFragment(list[i].n, list[i + 1].n, aggressive, { cutMark: /(-|…|\.\.\.)$/.test(raw), gap })) {
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
          if (list[i + k].c !== list[i + n + k].c) { equal = false; break; }
        }
        // Repetição de UMA palavra que é ênfase intencional → mantém as duas.
        if (equal && n === 1 && EMPHATIC.has(list[i].n)) equal = false;
        // Fim de frase no meio ("...é o dinheiro. Dinheiro é poder.") é estilo, não engasgo.
        if (equal && /[.!?;:]["')\]]*$/.test(String(list[i + n - 1].w.word ?? '').trim())) equal = false;
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
 * Frases refeitas. Para cada palavra i, procura adiante um recomeço j em que as palavras
 * voltam a se repetir (ao menos 2 iguais seguidas; 3 quando a tentativa é longa — até
 * 40 palavras / 25 s, uma frase inteira regravada). O trecho [i, j) é uma tentativa
 * abandonada se TODA palavra dele reaparece no recomeço (ou é um pedaço de palavra do
 * recomeço — "super-" → "supermercado" — ou uma muleta). Uma palavra nova no trecho
 * (ex.: "eu quero que você cresça, eu quero que você lucre") indica paralelismo de
 * propósito → fica (numa frase longa, ≥ 10 palavras, aceita 1 trocada a cada 10). E a
 * ÚLTIMA palavra da tentativa pode ser nova quando a pessoa
 * travou ali ("hoje eu vou falar… hoje eu vou mostrar": reticências, palavra cortada ou
 * pausa longa sem pontuação) — é onde o erro acontece. Marca e devolve quantas saíram.
 */
export function markRetakes(list) {
  let removed = 0;
  const C = (x) => x.c ?? x.n;
  const raw = (x) => String(x.w.word ?? '').trim();
  for (let i = 0; i < list.length; i++) {
    if (list[i].w.removed) continue;
    for (let j = i + 2; j < list.length - 1 && j - i <= 40; j++) {
      if (Number(list[j].w.start) - Number(list[i].w.start) > 25) break;
      if (C(list[j]) !== C(list[i]) || C(list[j + 1]) !== C(list[i + 1])) continue;
      const span = j - i;
      // tentativa longa: o recomeço precisa repetir 3 palavras (2 iguais por acaso é comum)
      if (span > 20 && !(list[j + 2] && list[i + 2] && C(list[j + 2]) === C(list[i + 2]))) continue;
      const redo = new Set();
      for (let k = j; k < Math.min(list.length, j + span + 4); k++) redo.add(C(list[k]));
      const covered = (x) => {
        if (redo.has(C(x)) || isFiller(x.w.word, true) || /-$/.test(raw(x))) return true;
        if (x.n.length < 2) return false;
        for (let k = j; k < Math.min(list.length, j + span + 4); k++) if (list[k].n.length > x.n.length && list[k].n.startsWith(x.n)) return true;
        return false;
      };
      // frase longa regravada quase igual: aceita 1 palavra trocada a cada 10, se o recomeço
      // repete as 3 primeiras ("…uma coisa muito simples" → "…uma coisa simples agora")
      const three = list[j + 2] && list[i + 2] && C(list[j + 2]) === C(list[i + 2]);
      const allow = span >= 10 && three ? Math.floor(span / 10) : 0;
      let miss = 0;
      let lastMiss = false;
      for (let k = i; k < j; k++) if (!covered(list[k])) { miss++; if (k === j - 1) lastMiss = true; }
      if (miss > allow && !(miss === allow + 1 && lastMiss)) continue;
      if (miss === allow + 1) {
        // só a última palavra é nova: vale se a pessoa travou ali
        const last = list[j - 1];
        const stuck = /(…|\.\.\.|-)$/.test(raw(last));
        const pause = Number(list[j].w.start) - Number(last.w.end);
        const bare = !/[.,!?;:]["')\]]*$/.test(raw(last));
        if (!(span >= 3 && (stuck || (pause >= 0.7 && bare)))) continue;
      }
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
