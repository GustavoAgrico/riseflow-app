import { askJson, llmAvailable } from './llm.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('cortes');

/**
 * Escolha INTELIGENTE dos cortes curtos. Em vez de procurar pausas e frases soltas:
 *  1. a fala vira FRASES (pontuação/pausas) — um corte sempre começa no começo de uma
 *     frase e termina no fim de outra (nunca no meio de um raciocínio);
 *  2. a IA lê a transcrição inteira e escolhe trechos que fazem sentido SOZINHOS
 *     (ganchos, histórias, opiniões fortes, ensinamentos, conclusões), com uma nota de
 *     0–100 e o motivo, conforme o OBJETIVO (autoridade, educação, entretenimento,
 *     venda, engajamento);
 *  3. o resultado é conferido: duração dentro dos limites, contexto anterior/posterior
 *     (se a 1ª frase depende da anterior, ela entra; se a seguinte completa a ideia,
 *     também), sem sobreposição;
 *  4. sem IA (ou se ela falhar), uma análise por regras faz o mesmo trabalho.
 */

export const CLIP_GOALS = {
  auto: 'Equilibrado (o que tiver mais força)',
  autoridade: 'Autoridade (mostrar domínio do assunto)',
  educacao: 'Educação (ensinar algo prático)',
  entretenimento: 'Entretenimento (prender e divertir)',
  venda: 'Venda (desejo e chamada para ação)',
  engajamento: 'Engajamento (comentários e compartilhamentos)',
};
export const CLIP_TYPES = {
  gancho: 'Gancho',
  historia: 'História',
  opiniao: 'Opinião forte',
  ensinamento: 'Ensinamento',
  conclusao: 'Conclusão',
};

export const GOAL_HINT = {
  auto: 'o que tiver mais força para prender e entregar valor',
  autoridade: 'mostrar que a pessoa domina o assunto: opiniões firmes, visão própria, diagnósticos, experiência',
  educacao: 'ensinar algo prático e aplicável: passo a passo, dicas, explicações claras com começo, meio e fim',
  entretenimento: 'prender e divertir: histórias, situações curiosas, humor, reviravoltas',
  venda: 'gerar desejo e ação: dor do cliente, transformação, prova, chamada para ação',
  engajamento: 'provocar comentários e compartilhamentos: polêmica, opinião contrária, perguntas, identificação',
};
// Peso de cada tipo de trecho por objetivo (análise por regras).
const GOAL_WEIGHTS = {
  auto: { gancho: 1.2, historia: 1.1, opiniao: 1.1, ensinamento: 1.1, conclusao: 1 },
  autoridade: { gancho: 1, historia: 0.9, opiniao: 1.5, ensinamento: 1.25, conclusao: 1.15 },
  educacao: { gancho: 1, historia: 0.8, opiniao: 0.9, ensinamento: 1.6, conclusao: 1.2 },
  entretenimento: { gancho: 1.3, historia: 1.6, opiniao: 1.1, ensinamento: 0.8, conclusao: 0.9 },
  venda: { gancho: 1.2, historia: 1.1, opiniao: 1.1, ensinamento: 1, conclusao: 1.3 },
  engajamento: { gancho: 1.5, historia: 1.1, opiniao: 1.4, ensinamento: 0.9, conclusao: 0.9 },
};

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Palavras que ABREM dependendo do que veio antes (o corte começa "no meio").
export const CONTEXT_OPENERS = new Set(
  ('e mas porque porem entao ai dai pois logo assim portanto isso isto esse essa esses essas aquilo aquele aquela '
    + 'ele ela eles elas dele dela ou seja alem tambem depois antes inclusive senao tipo ne resultado conclusao').split(/\s+/),
);
// A frase seguinte continua a ideia (o corte não pode parar antes dela).
export const CONTINUES = new Set('porque pois entao senao mas que ou seja inclusive tipo'.split(/\s+/));
export const firstWord = (t) => (norm(t).match(/[a-z0-9]+/) || [''])[0];

/** Transcrição → frases [{ start, end, text }]: pontuação final ou pausa de 0,7 s+. */
export function toSentences(transcript, { maxWords = 40 } = {}) {
  const words = [];
  for (const seg of transcript?.segments || []) {
    const ws = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
    for (const w of ws) if (!w.removed && String(w.word ?? '').trim()) words.push({ start: Number(w.start), end: Number(w.end), word: String(w.word).trim() });
  }
  const out = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.word).join(' ') });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? next.start - w.end : 99;
    if (/[.!?…]["')]*$/.test(w.word) || gap >= 0.7 || (cur.length >= maxWords && /[,;:]$/.test(w.word)) || cur.length >= maxWords * 1.5) flush();
  });
  flush();
  return out.map((s, i) => ({ ...s, i }));
}

// ─── Análise por regras (sem IA) ───
const TYPE_PATTERNS = {
  gancho: /\?|\b(voce sabia|o segredo|ninguem (te )?(conta|fala)|pare de|o maior erro|presta atencao|olha so|imagina|e se eu te dissesse|a verdade e|o que (ninguem|poucos)|ja pensou)\b/,
  historia: /\b(quando eu|uma vez|um dia|aconteceu|eu estava|eu tinha|me lembro|lembro que|conheci|meu (pai|filho|cliente|amigo)|minha (mae|filha|cliente|esposa)|ha \d+ anos|naquele dia|foi quando|contei|me disse)\b/,
  opiniao: /\b(eu acho|na minha opiniao|eu acredito|o problema e|a verdade e|ninguem|todo mundo|sempre|nunca|discordo|nao concordo|isso e mentira|o erro|absurdo|eu defendo|o certo e|o errado e)\b/,
  ensinamento: /\b(dica|dicas|passo|passos|como fazer|como voce|voce precisa|voce deve|o primeiro|o segundo|o terceiro|primeiro|segundo|terceiro|aprenda|aprendi|regra|metodo|estrategia|tecnica|faca|evite|use)\b/,
  conclusao: /\b(entao|por isso|resumindo|no final|no fim|conclusao|o ponto e|a licao|moral da historia|ou seja|portanto|lembre[- ]se|e isso que)\b/,
};
const CTA = /\b(link|bio|comprar|compre|garanta|inscreva|inscricao|chama no|direct|agende|whatsapp|comenta|comente|compartilha|salva|segue)\b/;

export function typeScores(text) {
  const t = norm(text);
  const out = {};
  for (const [k, re] of Object.entries(TYPE_PATTERNS)) out[k] = (t.match(new RegExp(re.source, 'g')) || []).length;
  return out;
}

/**
 * Nota por regras de um trecho [a, b] de frases: força do começo (gancho), tipos de
 * conteúdo pesados pelo objetivo, ideia completa (não começa dependendo do anterior,
 * termina fechando a frase, a seguinte não continua o raciocínio), densidade.
 */
export function ruleScore(S, a, b, goal) {
  const span = S.slice(a, b + 1);
  const text = span.map((s) => s.text).join(' ');
  const dur = span[span.length - 1].end - span[0].start;
  const ts = typeScores(text);
  const head = typeScores(span[0].text);
  const W = GOAL_WEIGHTS[goal] || GOAL_WEIGHTS.auto;
  const reasons = [];
  let score = 0;
  // gancho: a 1ª frase prende?
  const hook = head.gancho > 0 || /\d/.test(span[0].text);
  if (hook) { score += 1.8 * W.gancho; reasons.push(/\?/.test(span[0].text) ? 'começa com uma pergunta que prende a atenção' : 'começa com um gancho forte'); }
  // tipos
  let best = 'ensinamento';
  let bestV = -1;
  for (const k of ['historia', 'opiniao', 'ensinamento', 'conclusao', 'gancho']) {
    const v = Math.min(3, ts[k]) * W[k];
    score += v * 1.1;
    if (v > bestV) { bestV = v; best = k; }
  }
  if (ts.historia) reasons.push('conta uma história');
  if (ts.opiniao) reasons.push('traz uma opinião firme');
  if (ts.ensinamento) reasons.push('ensina algo prático');
  // completude (não cortar no meio do raciocínio)
  const opensCold = CONTEXT_OPENERS.has(firstWord(span[0].text));
  const endsClosed = /[.!?…]["')]*$/.test(span[span.length - 1].text);
  const nextContinues = S[b + 1] && CONTINUES.has(firstWord(S[b + 1].text));
  if (opensCold) score -= 3; else reasons.push('a ideia começa do zero, sem depender do que veio antes');
  if (endsClosed && !nextContinues) { score += 1.6; if (ts.conclusao) reasons.push('fecha com uma conclusão clara'); else reasons.push('termina fechando a ideia'); }
  if (nextContinues) score -= 2;
  // história pela metade: a frase seguinte ainda é a mesma história
  if (ts.historia && S[b + 1] && typeScores(S[b + 1].text).historia) score -= 2.5;
  // venda: chamada para ação
  if (goal === 'venda' && CTA.test(norm(text))) { score += 2; reasons.push('tem chamada para ação'); }
  if (goal === 'engajamento' && /\?/.test(text)) score += 1;
  // densidade (fala com conteúdo)
  const tokens = norm(text).split(/[^a-z0-9]+/).filter((x) => x.length >= 5);
  score += Math.min(2, new Set(tokens).size / Math.max(1, dur) * 1.2);
  return { score, type: hook && bestV < 1.5 ? 'gancho' : best, reasons };
}

/** Escolha só por regras: todas as combinações de frases dentro dos limites. */
export function ruleClips(S, { min = 15, max = 50, count = 3, goal = 'auto' } = {}) {
  const cands = [];
  for (let a = 0; a < S.length; a++) {
    for (let b = a; b < S.length; b++) {
      const dur = S[b].end - S[a].start;
      if (dur > max) break;
      if (dur < min) continue;
      const r = ruleScore(S, a, b, goal);
      cands.push({ a, b, ...r });
    }
  }
  if (!cands.length && S.length) {
    // vídeo curto demais para o mínimo: o melhor trecho possível
    const b = S.length - 1;
    cands.push({ a: 0, b, ...ruleScore(S, 0, b, goal) });
  }
  const hi = Math.max(...cands.map((c) => c.score), 1);
  const lo = Math.min(...cands.map((c) => c.score), 0);
  const picked = pickNonOverlapping(cands.map((c) => ({ ...c, score: Math.round(45 + 50 * ((c.score - lo) / Math.max(1e-6, hi - lo))) })), count);
  return picked.map((c) => ({
    ...c,
    reason: capitalize(c.reasons.slice(0, 3).join('; ')) || 'Trecho com ideia completa',
    title: titleFrom(S[c.a].text),
  }));
}

function pickNonOverlapping(cands, count) {
  const out = [];
  for (const c of [...cands].sort((x, y) => y.score - x.score)) {
    if (out.some((o) => !(c.b < o.a || c.a > o.b))) continue;
    out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function titleFrom(text) {
  const t = String(text).replace(/[.!?…]+$/, '').split(/\s+/).slice(0, 9).join(' ');
  return capitalize(t).slice(0, 60);
}

// ─── IA ───
const INSTRUCTION = ({ min, max, count, goal }) => `Você é o editor-chefe de cortes de uma agência: transforma vídeos longos em cortes curtos (Reels, TikTok, Shorts) que valem a pena publicar.
Recebe a transcrição em FRASES numeradas: "S12 [83.4s–88.1s] texto".
Objetivo dos cortes: ${goal === 'auto' ? GOAL_HINT.auto : GOAL_HINT[goal]}.
Escolha os ${count + 3} MELHORES trechos. Cada corte:
- é um intervalo de frases seguidas (from → to) que faz sentido SOZINHO: quem nunca viu o vídeo entende do começo ao fim;
- começa no início de uma ideia (nunca numa frase que depende da anterior, como "e isso...", "mas aí...", "por isso ele...") e de preferência com uma frase que prende (pergunta, afirmação forte, número, promessa);
- termina quando a ideia fecha (conclusão, lição, desfecho) — nunca no meio de um raciocínio ou de uma lista;
- dura entre ${min} e ${max} segundos (use os tempos das frases);
- não se sobrepõe a outro corte.
Classifique cada um em "type": "gancho" | "historia" | "opiniao" | "ensinamento" | "conclusao".
Dê "score" de 0 a 100 (potencial de desempenho para o objetivo — seja exigente: só trechos realmente fortes passam de 80), um "title" curto e chamativo em português (até 8 palavras) e um "reason": 1 frase em português explicando por que este trecho foi escolhido (concreto: o que ele tem de forte).
Responda APENAS com JSON: {"clips":[{"from":0,"to":0,"type":"...","score":0,"title":"...","reason":"..."}]}`;

const sentenceLines = (S, a, b) => S.slice(a, b).map((s) => `S${s.i} [${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.text}`).join('\n');

/**
 * Ajusta um corte da IA às regras: índices válidos, duração dentro dos limites, contexto
 * anterior (a 1ª frase depende da anterior → entra) e posterior (a seguinte continua a
 * ideia → entra). Devolve null se não der para salvar.
 */
export function fixClip(S, c, { min, max }) {
  let a = Math.max(0, Math.min(S.length - 1, Math.round(Number(c.from))));
  let b = Math.max(a, Math.min(S.length - 1, Math.round(Number(c.to))));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const dur = () => S[b].end - S[a].start;
  // contexto anterior
  if (CONTEXT_OPENERS.has(firstWord(S[a].text)) && a > 0 && S[b].end - S[a - 1].start <= max) a--;
  // contexto posterior
  while (S[b + 1] && CONTINUES.has(firstWord(S[b + 1].text)) && S[b + 1].end - S[a].start <= max) b++;
  // curto demais: estende pelo fim (até fechar), depois pelo começo
  while (dur() < min && S[b + 1] && S[b + 1].end - S[a].start <= max) b++;
  while (dur() < min && a > 0 && S[b].end - S[a - 1].start <= max) a--;
  // longo demais: encurta pelo fim
  while (dur() > max && b > a) b--;
  if (dur() > max * 1.15 || dur() < Math.min(min, 4)) return null;
  return { ...c, a, b };
}

/**
 * Escolhe os cortes. → [{ start, end, title, score (0–100), type, typeLabel, reason, by }]
 * em ordem da MELHOR nota para a pior.
 */
export async function selectClips(transcript, meta, options = {}, cfg = null) {
  const min = options.clipMin ?? 15;
  const max = Math.max(min + 5, options.clipMax ?? 50);
  const count = options.clipsCount ?? 3;
  const goal = CLIP_GOALS[options.clipGoal] ? options.clipGoal : 'auto';
  const S = toSentences(transcript);
  if (!S.length) return [];
  let picked = null;
  let by = 'regras';
  if (cfg && llmAvailable(cfg)) {
    try {
      const all = [];
      const WIN = 220;
      for (let a = 0; a < S.length; a += WIN - 20) {
        const b = Math.min(S.length, a + WIN);
        const { data, provider } = await askJson(INSTRUCTION({ min, max, count, goal }), sentenceLines(S, a, b), cfg, { maxTokens: 2500 });
        by = `IA (${provider})`;
        for (const c of Array.isArray(data?.clips) ? data.clips : []) {
          const f = fixClip(S, c, { min, max });
          if (f) all.push({ ...f, score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 0))), type: CLIP_TYPES[c.type] ? c.type : 'ensinamento', title: String(c.title || '').trim().slice(0, 70) || titleFrom(S[f.a].text), reason: String(c.reason || '').trim().slice(0, 240) });
        }
        if (b >= S.length) break;
      }
      picked = pickNonOverlapping(all, count);
      if (!picked.length) picked = null;
    } catch (err) {
      log.warn(`IA não escolheu os cortes (${err.message}); usando a análise por regras`);
    }
  }
  if (!picked) {
    picked = ruleClips(S, { min, max, count, goal });
    by = 'regras';
  }
  log.info(`${picked.length} cortes escolhidos por ${by} (objetivo: ${goal})`);
  return picked
    .map((c) => ({
      start: S[c.a].start,
      end: S[c.b].end,
      title: c.title,
      score: c.score,
      type: c.type,
      typeLabel: CLIP_TYPES[c.type] || 'Trecho',
      reason: c.reason,
      by,
      goal,
    }))
    .sort((x, y) => y.score - x.score);
}
