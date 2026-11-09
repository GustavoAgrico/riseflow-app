// "Um" e "uma" na legenda: os serviços de transcrição (Whisper, Deepgram com smart_format)
// escrevem "1" mesmo quando a pessoa usou o artigo ("1 dia eu percebi", "foi 1 vez só").
// Aqui o "1" sozinho volta a ser "um"/"uma", e só fica como número quando a fala é mesmo
// sobre o número ("número 1", "de 1 a 10", "1 milhão", "R$ 1", "1, 2, 3", "1 contra 1").

const plain = (w) => String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%$]/g, '');
const isDigitWord = (w) => /^\d/.test(String(w || '').trim()) || /^r\$/i.test(String(w || '').trim());

// Antes do "1": a fala está contando/numerando ("número 1", "passo 1", "nota 1").
const NUM_BEFORE = new Set(['numero', 'n', 'nota', 'top', 'passo', 'capitulo', 'fase', 'etapa', 'nivel', 'versao', 'item',
  'pagina', 'aula', 'episodio', 'temporada', 'modulo', 'nr', 'r$', 'us$', 'x', 'contra', 'placar']);
// Conta só com outro número antes: "2 mais 1", "3 vezes 1" (e não "mais 1 vez").
const NUM_OP = new Set(['mais', 'menos', 'vezes', 'dividido']);
// Depois do "1": grandeza ou unidade numérica ("1 milhão", "1 real", "1%", "1 ponto 5").
const NUM_AFTER = new Set(['mil', 'milhao', 'milhoes', 'bilhao', 'bilhoes', 'trilhao', 'real', 'reais', 'dolar', 'dolares', 'euro', 'euros', 'centavo', 'centavos',
  'porcento', 'por', '%', 'k', 'ponto', 'virgula', 'x', 'contra', 'kg', 'km', 'g', 'ml', 'mb', 'gb', 'cm', 'mm']);

// Palavras masculinas terminadas em "a" e femininas que não terminam em "a".
const MASC = new Set(['dia', 'problema', 'sistema', 'programa', 'tema', 'mapa', 'planeta', 'clima', 'idioma', 'cinema', 'esquema', 'poema', 'telefonema',
  'dilema', 'drama', 'prisma', 'pijama', 'sofa', 'cara', 'papa', 'diagrama', 'teorema', 'enigma', 'carisma', 'trauma', 'aroma', 'lema', 'fantasma', 'cometa', 'guarda']);
const FEM = new Set(['vez', 'mulher', 'mae', 'noite', 'tarde', 'parte', 'fase', 'chance', 'classe', 'frase', 'base', 'ponte', 'sorte', 'morte', 'fonte', 'mente',
  'lei', 'cor', 'dor', 'flor', 'rede', 'serie', 'fe', 'nuvem', 'ordem', 'gente', 'febre', 'nave', 'chave', 'neve', 'arte', 'carne', 'sede', 'torre', 'tese', 'crise',
  'analise', 'vertente', 'equipe', 'cliente', 'estudante', 'pele', 'rede', 'tribo', 'foto', 'moto', 'radio', 'libido']);
// Adjetivos que vêm antes do nome: decidem o gênero quando têm gênero; os neutros passam a vez.
const ADJ_FEM = new Set(['boa', 'nova', 'outra', 'certa', 'unica', 'pequena', 'velha', 'mesma', 'baita', 'otima', 'pessima', 'verdadeira', 'primeira', 'ultima', 'bela', 'linda', 'tremenda']);
const ADJ_MASC = new Set(['bom', 'novo', 'outro', 'certo', 'unico', 'pequeno', 'velho', 'mesmo', 'otimo', 'pessimo', 'verdadeiro', 'primeiro', 'ultimo', 'belo', 'lindo', 'tremendo']);
const ADJ_NEUTRAL = new Set(['grande', 'enorme', 'simples', 'excelente', 'incrivel', 'forte', 'leve', 'facil', 'dificil', 'importante', 'principal', 'super', 'mega', 'puta']);

/** Gênero do nome (ou do adjetivo antes dele): 'f' ou 'm'. Na dúvida, masculino. */
export function genderOf(words, i) {
  for (let k = i; k < Math.min(words.length, i + 3); k += 1) {
    const n = plain(words[k]);
    if (!n) continue;
    if (ADJ_FEM.has(n)) return 'f';
    if (ADJ_MASC.has(n)) return 'm';
    if (ADJ_NEUTRAL.has(n)) continue;
    if (MASC.has(n)) return 'm';
    if (FEM.has(n)) return 'f';
    if (/(cao|sao|dade|gem|tude|ise|ez)$/.test(n)) return 'f';
    if (/a$/.test(n) || /as$/.test(n)) return 'f';
    return 'm';
  }
  return 'm';
}

/** O "1" na posição i é número de verdade (não o artigo "um"/"uma")? */
export function isRealNumber(words, i) {
  const prev = plain(words[i - 1]);
  const next = plain(words[i + 1]);
  const next2 = plain(words[i + 2]);
  if (isDigitWord(words[i - 1]) || isDigitWord(words[i + 1])) return true; // "1 2 3", "R$ 1", "1 1000"
  if (/[,;]$/.test(String(words[i] || '').trim()) && isDigitWord(words[i + 1])) return true;
  if (NUM_BEFORE.has(prev)) return true;
  if (NUM_OP.has(prev) && isDigitWord(words[i - 2])) return true;
  if (NUM_AFTER.has(next)) return true;
  if (next === 'cento' || (next === 'por' && next2 === 'cento')) return true;
  // "de 1 a 10", "1 ou 2", "1 e meio", "entre 1 e 3"
  if (['a', 'ate', 'ou', 'e'].includes(next) && (isDigitWord(words[i + 2]) || ['dois', 'duas', 'tres', 'meio', 'meia'].includes(next2))) return true;
  if (prev === 'de' && next === 'a') return true;
  return false;
}

/**
 * Troca o "1" do artigo por "um"/"uma" nas palavras (mantém pontuação e maiúscula no
 * começo de frase). Puro: devolve uma lista nova.
 * @param {string[]} words
 */
export function fixOneArticle(words) {
  return words.map((w, i) => {
    const m = /^(["“(]?)1([.,!?;:…"”)]*)$/.exec(String(w || '').trim());
    if (!m || isRealNumber(words, i)) return w;
    const word = genderOf(words, i + 1) === 'f' ? 'uma' : 'um';
    const prev = String(words[i - 1] || '').trim();
    const start = !prev || /[.!?…]["”)]?$/.test(prev);
    return `${m[1]}${start ? word[0].toUpperCase() + word.slice(1) : word}${m[2]}`;
  });
}

// ─── Porcentagem ──────────────────────────────────────────────────────────────────────
// A transcrição escreve "oitenta e um por cento" como "81 por 100" ou "81 por cento" (às
// vezes ainda com um "1" solto antes: "1 81", sobra do "e um"). Na legenda tem de ser "81%".
const NUMBER_RE = /^(\d+(?:[.,]\d+)?)$/;
const TAIL_RE = /^(?:100|cento)([.,!?;:…"”)]*)$/i;

/**
 * Junta "N por 100" / "N por cento" / "N porcento" / "N %" numa palavra só ("N%"), com o
 * tempo do começo do número ao fim da última palavra; e tira o "1" solto antes de um número
 * terminado em 1 ("1 81" → "81"), juntando o tempo dele ao do número. Puro.
 * @param {Array<{word:string,start:number,end:number,removed?:boolean}>} words
 */
export function mergePercentWords(words) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const t = String(w.word ?? '').trim();
    const n1 = String(words[i + 1]?.word ?? '').trim();
    // "1" solto antes de 21, 31, … 91 (o "e um" da dezena virou dois números)
    if (t === '1' && /^[2-9]1(?:[.,]\d+)?[.,!?;:…%]*$/.test(n1) && Number(words[i + 1].start) - Number(w.end) < 0.6) {
      words[i + 1] = { ...words[i + 1], start: w.start };
      continue;
    }
    const num = NUMBER_RE.exec(t);
    if (num) {
      const p1 = plain(n1);
      const n2 = String(words[i + 2]?.word ?? '').trim();
      let take = 0;
      let tail = '';
      if (p1 === 'por' && TAIL_RE.test(n2)) { take = 2; tail = TAIL_RE.exec(n2)[1]; }
      else if (p1 === 'porcento') { take = 1; tail = /([.,!?;:…"”)]*)$/.exec(n1)[1]; }
      else if (/^%([.,!?;:…"”)]*)$/.test(n1)) { take = 1; tail = n1.slice(1); }
      if (take) {
        const last = words[i + take];
        const all = words.slice(i, i + take + 1);
        const merged = { ...w, word: `${num[1]}%${tail}`, end: last.end };
        // só fica riscada se a pessoa (ou a limpeza) riscou as três palavras
        if (all.every((x) => x.removed)) merged.removed = true;
        else delete merged.removed;
        out.push(merged);
        i += take;
        continue;
      }
    }
    out.push(w);
  }
  return out;
}

/** Aplica a junção da porcentagem em cada frase (só em português). */
export function fixPercents(t) {
  if (!t || !Array.isArray(t.segments) || !isPortuguese(t.language)) return t;
  let changed = false;
  const segments = t.segments.map((sg) => {
    if (!Array.isArray(sg.words) || sg.words.length < 2) return sg;
    const words = mergePercentWords(sg.words.map((w) => ({ ...w })));
    if (words.length === sg.words.length && words.every((w, i) => w.word === sg.words[i].word)) return sg;
    changed = true;
    return { ...sg, words, ...(typeof sg.text === 'string' ? { text: words.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim() } : {}) };
  });
  if (!changed) return t;
  return { ...t, segments, ...(typeof t.text === 'string' ? { text: segments.map((sg) => sg.text ?? (sg.words || []).map((w) => w.word).join(' ')).join(' ') } : {}) };
}

const isPortuguese = (lang) => /^(pt|portuguese|portugu[eê]s)/i.test(String(lang || '').trim());

/**
 * Aplica a troca na transcrição inteira (palavras de cada frase, texto da frase e texto
 * geral), só em português. Os tempos e o resto das palavras não mudam.
 */
export function fixArticleNumerals(t) {
  if (!t || !Array.isArray(t.segments) || !isPortuguese(t.language)) return t;
  // contexto corre por todas as frases (o "1" pode ser a última palavra de uma frase)
  const flat = t.segments.flatMap((sg) => (sg.words || []).map((w) => w.word));
  const fixed = fixOneArticle(flat);
  let k = 0;
  let changed = false;
  const segments = t.segments.map((sg) => {
    if (!Array.isArray(sg.words) || !sg.words.length) return sg;
    let segChanged = false;
    const words = sg.words.map((w) => {
      const nw = fixed[k];
      k += 1;
      if (nw === w.word) return w;
      segChanged = true;
      return { ...w, word: nw };
    });
    if (!segChanged) return sg;
    changed = true;
    return { ...sg, words, ...(typeof sg.text === 'string' ? { text: words.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim() } : {}) };
  });
  if (!changed) return t;
  return { ...t, segments, ...(typeof t.text === 'string' ? { text: segments.map((sg) => sg.text ?? (sg.words || []).map((w) => w.word).join(' ')).join(' ') } : {}) };
}
