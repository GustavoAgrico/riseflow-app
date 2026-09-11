/**
 * Inteligência de conteúdo (heurística, sem IA/chave):
 * - groupIntoPhrases: "análise de frases" — agrupa palavras em frases de legenda
 *   naturais (quebra em pontuação de fim de frase, pausas e limites de tamanho),
 *   em vez de blocos fixos de N palavras. Legenda mais legível e no ritmo da fala.
 * - classifyNarrative: "classificação narrativa" — marca cada frase com o papel na
 *   narrativa (gancho / desenvolvimento / clímax / CTA). Útil para dar destaque
 *   premium (ex.: gancho e CTA com ênfase) e para relatórios.
 */

/** minúsculas, sem acento — para casar palavras-chave. */
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Agrupa palavras {start,end,word} em frases de legenda. Quebra quando:
 * termina em pontuação de fim de frase (. ! ? …), atinge o máximo de palavras ou
 * de duração, ou há uma pausa relevante até a próxima palavra.
 * @param {Array<{start:number,end:number,word:string}>} words
 * @returns {Array<{start,end,text,words}>}
 */
export function groupIntoPhrases(words, opts = {}) {
  const maxWords = opts.maxWords ?? 6;
  const maxDur = opts.maxDur ?? 3.0;
  const pauseGap = opts.pauseGap ?? 0.45;
  const list = (words || []).filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end));
  const segments = [];
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    segments.push({
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim(),
      words: bucket,
    });
    bucket = [];
  };
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    bucket.push(w);
    const endsSentence = /[.!?…]["')\]]?$/.test(String(w.word || '').trim());
    const dur = w.end - bucket[0].start;
    const next = list[i + 1];
    const gap = next ? next.start - w.end : Infinity;
    if (endsSentence || bucket.length >= maxWords || dur >= maxDur || gap >= pauseGap) flush();
  }
  flush();
  return segments;
}

// Palavras que sinalizam CHAMADA PARA AÇÃO (CTA) — normalizadas (sem acento).
const CTA = new Set([
  'segue', 'siga', 'seguir', 'comenta', 'comente', 'comentario', 'comentarios',
  'clica', 'clique', 'clicar', 'link', 'bio', 'salva', 'salve', 'salvar',
  'compartilha', 'compartilhe', 'compartilhar', 'inscreve', 'inscreva', 'inscrever',
  'ativa', 'ative', 'curte', 'curta', 'curtir', 'acompanha', 'acompanhe',
  'arrasta', 'arraste', 'chama', 'chame', 'manda', 'whatsapp', 'dm', 'direct',
  'baixa', 'baixe', 'baixar', 'assina', 'assine', 'cadastra', 'cadastre', 'aproveita', 'aproveite',
]);

// Palavras de ÊNFASE — ajudam a achar o clímax/ponto-chave.
const EMPHASIS = new Set([
  'nunca', 'sempre', 'segredo', 'verdade', 'ninguem', 'ninguém', 'todo', 'todos',
  'importante', 'atencao', 'jamais', 'unico', 'melhor', 'pior', 'maior', 'grande',
  'muito', 'principal', 'chave', 'erro', 'errado', 'certo', 'precisa', 'garantido',
]);

/** Pontua a "força" de uma frase (ênfase + números/% + palavras longas). */
function emphasisScore(seg) {
  const words = seg.words?.length ? seg.words.map((w) => w.word) : String(seg.text || '').split(/\s+/);
  let score = 0;
  for (const raw of words) {
    const n = norm(raw).replace(/[^a-z0-9%]/g, '');
    if (!n) continue;
    if (EMPHASIS.has(n)) score += 2;
    if (/\d/.test(n) || n.includes('%')) score += 2; // números prendem atenção
    if (n.length >= 8) score += 1;
  }
  return score;
}

/**
 * Classifica cada frase no papel narrativo: 'hook' (gancho/abertura),
 * 'cta' (chamada para ação), 'climax' (ponto-chave) ou 'body' (desenvolvimento).
 * @param {Array<{start,end,text,words}>} segments
 * @param {number} duration duração total (s)
 * @returns {{roles:string[], summary:object, hasHook:boolean, hasCta:boolean, climaxIndex:number}}
 */
export function classifyNarrative(segments, duration) {
  const segs = segments || [];
  const dur = duration || (segs.length ? segs[segs.length - 1].end : 0) || 1;
  const roles = new Array(segs.length).fill('body');
  const hookLimit = Math.max(2.5, dur * 0.12);

  const hasCtaWords = (seg) => {
    const words = seg.words?.length ? seg.words.map((w) => w.word) : String(seg.text || '').split(/\s+/);
    return words.some((w) => CTA.has(norm(w).replace(/[^a-z0-9]/g, '')));
  };

  // 1) Gancho: abertura (primeira frase sempre; e as que começam antes do limite).
  segs.forEach((s, i) => { if (i === 0 || s.start < hookLimit) roles[i] = 'hook'; });

  // 2) CTA: frases com palavra de chamada para ação (normalmente perto do fim).
  segs.forEach((s, i) => { if (roles[i] !== 'hook' && hasCtaWords(s)) roles[i] = 'cta'; });

  // 3) Clímax: a frase de maior ênfase na metade final (que não seja gancho/CTA).
  let climaxIndex = -1;
  let best = 0;
  segs.forEach((s, i) => {
    if (roles[i] !== 'body') return;
    if (s.start < dur * 0.45) return; // clímax tende a vir depois do desenvolvimento
    const sc = emphasisScore(s);
    if (sc > best) { best = sc; climaxIndex = i; }
  });
  if (climaxIndex >= 0 && best >= 2) roles[climaxIndex] = 'climax';

  const summary = roles.reduce((a, r) => ((a[r] = (a[r] || 0) + 1), a), {});
  return {
    roles,
    summary,
    hasHook: roles.includes('hook'),
    hasCta: roles.includes('cta'),
    climaxIndex,
  };
}
