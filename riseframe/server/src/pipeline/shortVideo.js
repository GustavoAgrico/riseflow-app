import { toSentences, ruleScore, typeScores, CONTEXT_OPENERS, CONTINUES, firstWord, GOAL_HINT, CLIP_GOALS, titleFrom } from './clipSelect.js';
import { askJson, llmAvailable } from './llm.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('curto');

/**
 * Edição inteligente de vídeo LONGO → UM vídeo CURTO (diferente dos "cortes", que tiram
 * vários trechos soltos): como um editor faria, lê a fala inteira e monta um único vídeo
 * de ~N segundos que conta a ideia principal do começo ao fim — abre com um gancho, entrega
 * o principal sem buracos de lógica e fecha com a conclusão — pulando apresentação,
 * repetição, enrolação e digressões. O resultado são as frases que ficam; o resto vira
 * palavras removidas (o mesmo corte preciso da limpeza de fala), e no editor o usuário vê
 * tudo riscado e pode devolver qualquer trecho.
 */
export const SHORT_TARGETS = [30, 45, 60, 90, 120];

const SMALL_TALK = /\b(oi|ola|fala (galera|pessoal)|e ai (galera|pessoal)|bom dia|boa tarde|boa noite|tudo bem|sejam bem[- ]vindos?|bem[- ]vindos?|neste video|nesse video|no video de hoje|hoje eu vou|se inscreve|deixa (o )?seu like|ativa (o )?sininho|ate o proximo|ate a proxima|um beijo|um abraco|tchau|era isso|valeu (galera|pessoal|gente))\b/;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const durOf = (S, p) => S[p.b].end - S[p.a].start;
const total = (S, parts) => parts.reduce((t, p) => t + durOf(S, p), 0);

/**
 * A frase depende da anterior ("e isso...", "ele...", "resultado:")? Uma conclusão que se
 * sustenta sozinha ("Então a lição é: ...") não depende.
 */
const dependsOnPrev = (text) => CONTEXT_OPENERS.has(firstWord(text)) && typeScores(text).conclusao < 2;

/** Frases → "ideias": a frase que depende da anterior ou continua o raciocínio vai junto. Puro. */
export function ideaBlocks(S, { maxDur = 25 } = {}) {
  const blocks = [];
  let a = 0;
  for (let i = 1; i <= S.length; i++) {
    const joins = i < S.length && (dependsOnPrev(S[i].text) || (CONTINUES.has(firstWord(S[i].text)) && typeScores(S[i].text).conclusao < 2)) && S[i].end - S[a].start <= maxDur;
    if (!joins) {
      blocks.push({ a, b: i - 1 });
      a = i;
    }
  }
  return blocks;
}

/** Nota de uma ideia para o vídeo curto (densidade: nota por raiz da duração). Puro. */
function blockValue(S, bl, goal) {
  const r = ruleScore(S, bl.a, bl.b, goal);
  const text = norm(S.slice(bl.a, bl.b + 1).map((s) => s.text).join(' '));
  let v = r.score / Math.sqrt(Math.max(3, durOf(S, bl)));
  if (SMALL_TALK.test(text)) v -= 10; // apresentação, despedida e pedido de inscrição não entram
  return { v, hook: r.type === 'gancho' || typeScores(S[bl.a].text).gancho > 0, end: typeScores(text).conclusao > 0 };
}

/** Escolha só por regras (sem IA): as ideias mais fortes até a duração, em ordem. Puro. */
export function ruleStory(S, { target = 60, goal = 'auto' } = {}) {
  const hi = target * 1.1;
  const blocks = ideaBlocks(S).map((bl) => ({ ...bl, ...blockValue(S, bl, goal), dur: durOf(S, bl) }));
  const picked = [];
  let sum = 0;
  const add = (bl) => {
    picked.push(bl);
    sum += bl.dur;
  };
  // gancho: a ideia com gancho mais forte (se couber)
  const hook = blocks.filter((b) => b.hook && b.dur <= target * 0.45).sort((x, y) => y.v - x.v)[0];
  if (hook) add(hook);
  // fechamento: a melhor conclusão da 2ª metade
  const half = S[Math.floor(S.length / 2)]?.start ?? 0;
  const close = blocks.filter((b) => b.end && S[b.a].start >= half && b !== hook && b.dur <= target * 0.4).sort((x, y) => y.v - x.v)[0];
  if (close && sum + close.dur <= hi) add(close);
  for (const bl of [...blocks].sort((x, y) => y.v - x.v)) {
    if (picked.includes(bl) || bl.v <= 0) continue;
    if (sum + bl.dur <= hi) add(bl);
    if (sum >= target * 0.92) break;
  }
  if (!picked.length && blocks.length) add([...blocks].sort((x, y) => y.v - x.v)[0]);
  return picked.sort((x, y) => x.a - y.a).map(({ a, b }) => ({ a, b, role: 'desenvolvimento', essential: false }));
}

/**
 * Confere as partes (da IA ou das regras): índices válidos, ordem, sem sobreposição,
 * contexto (frase que depende da anterior puxa a anterior) e duração dentro do alvo
 * (tira as partes menos essenciais do meio; completa com as melhores ideias). Puro.
 */
export function fixStory(S, parts, { target = 60, goal = 'auto' } = {}) {
  const lo = target * 0.75;
  const hi = target * 1.2;
  let ps = (parts || [])
    .map((p) => {
      const a = Math.max(0, Math.min(S.length - 1, Math.round(Number(p.from ?? p.a))));
      const b = Math.max(a, Math.min(S.length - 1, Math.round(Number(p.to ?? p.b))));
      return Number.isFinite(a) && Number.isFinite(b) ? { a, b, role: ['gancho', 'desenvolvimento', 'conclusao'].includes(p.role) ? p.role : 'desenvolvimento', essential: p.essential === true } : null;
    })
    .filter(Boolean)
    .sort((x, y) => x.a - y.a);
  // junta sobreposições / partes coladas
  const merged = [];
  for (const p of ps) {
    const last = merged[merged.length - 1];
    if (last && p.a <= last.b + 1) {
      last.b = Math.max(last.b, p.b);
      last.essential = last.essential || p.essential;
    } else merged.push({ ...p });
  }
  ps = merged;
  // contexto: começa dependendo da anterior → a anterior entra (se couber)
  for (const p of ps) {
    if (p.a > 0 && dependsOnPrev(S[p.a].text) && total(S, ps) + (S[p.a].start - S[p.a - 1].start) <= hi) p.a--;
  }
  // longo demais: tira do meio as partes não essenciais mais fracas; depois encurta a maior
  const value = (p) => blockValue(S, p, goal).v;
  while (total(S, ps) > hi && ps.length > 1) {
    const cands = ps.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.essential && i > 0 && i < ps.length - 1);
    const pool = cands.length ? cands : ps.map((p, i) => ({ p, i })).filter(({ p }) => !p.essential);
    if (!pool.length) break;
    pool.sort((x, y) => value(x.p) - value(y.p));
    ps.splice(pool[0].i, 1);
  }
  while (total(S, ps) > hi) {
    const big = [...ps].sort((x, y) => durOf(S, y) - durOf(S, x))[0];
    if (!big || big.b <= big.a) break;
    big.b--;
  }
  // curto demais: completa com as melhores ideias que ainda não estão
  if (total(S, ps) < lo) {
    const used = (bl) => ps.some((p) => !(bl.b < p.a || bl.a > p.b));
    const extra = ideaBlocks(S).filter((bl) => !used(bl)).map((bl) => ({ ...bl, v: value(bl) })).sort((x, y) => y.v - x.v);
    for (const bl of extra) {
      if (total(S, ps) >= lo) break;
      if (bl.v > 0 && total(S, ps) + durOf(S, bl) <= hi) ps.push({ a: bl.a, b: bl.b, role: 'desenvolvimento', essential: false });
    }
    ps.sort((x, y) => x.a - y.a);
  }
  return ps;
}

const INSTRUCTION = ({ target, lo, hi, goal }) => `Você é um editor de vídeo profissional. Recebe a transcrição de um vídeo LONGO em FRASES numeradas: "S12 [83.4s–88.1s] texto".
Monte UM ÚNICO vídeo curto (Reels, TikTok, Shorts) de cerca de ${target} segundos — a soma das frases escolhidas entre ${lo} e ${hi} s — que conte a ideia principal do vídeo do começo ao fim, como um bom editor faria:
- escolha trechos de frases seguidas (from → to); pode pular partes inteiras (repetições, enrolação, digressões, exemplos fracos, frases refeitas);
- os trechos ficam na ORDEM em que aparecem no vídeo;
- o 1º trecho prende a atenção (pergunta, promessa, afirmação forte, número) e já entra no assunto — sem "oi pessoal", apresentação, "nesse vídeo eu vou" ou pedido de inscrição;
- o meio entrega o principal (o argumento, os passos, a história) sem buracos de lógica: nada de "isso", "ele", "como eu falei" sem a frase que explica;
- o último trecho fecha a ideia (conclusão, lição ou chamada para ação);
- nunca corte uma frase no meio.
Objetivo do vídeo: ${GOAL_HINT[goal] || GOAL_HINT.auto}.
Marque "essential": true nos trechos sem os quais o vídeo perde o sentido.
Responda APENAS com JSON: {"title":"título curto e chamativo (até 8 palavras)","summary":"1 frase: o que o vídeo curto conta","parts":[{"from":0,"to":0,"role":"gancho|desenvolvimento|conclusao","essential":true}]}`;

/** Vídeo muito longo: manda à IA só as frases das melhores ideias (mais começo e fim). */
function sentencesForLLM(S, target, goal, max = 380) {
  if (S.length <= max) return S;
  const keep = new Set();
  for (let i = 0; i < Math.min(12, S.length); i++) keep.add(i);
  for (let i = Math.max(0, S.length - 12); i < S.length; i++) keep.add(i);
  const blocks = ideaBlocks(S).map((bl) => ({ ...bl, v: blockValue(S, bl, goal).v })).sort((x, y) => y.v - x.v);
  for (const bl of blocks) {
    if (keep.size >= max) break;
    for (let i = bl.a; i <= bl.b; i++) keep.add(i);
  }
  return S.filter((s) => keep.has(s.i));
}

/**
 * Escolhe o que fica no vídeo curto. → { parts:[{start,end,a,b,role}], seconds, title,
 * summary, by } ou null se o vídeo já é curto (nada a resumir).
 */
export async function selectStory(transcript, meta, options = {}, cfg = null) {
  const target = Math.max(15, Math.min(600, Number(options.shortTarget) || 60));
  const goal = CLIP_GOALS[options.clipGoal] ? options.clipGoal : 'auto';
  const S = toSentences(transcript);
  if (!S.length) return null;
  const speech = S[S.length - 1].end - S[0].start;
  if (speech <= target * 1.15) {
    log.info(`fala de ${speech.toFixed(0)}s já cabe em ${target}s; nada a resumir`);
    return null;
  }
  let parts = null;
  let by = 'regras';
  let title = '';
  let summary = '';
  if (cfg && llmAvailable(cfg)) {
    try {
      const lines = sentencesForLLM(S, target, goal).map((s) => `S${s.i} [${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.text}`).join('\n');
      const { data, provider } = await askJson(INSTRUCTION({ target, lo: Math.round(target * 0.8), hi: Math.round(target * 1.15), goal }), lines, cfg, { maxTokens: 1500, timeoutMs: 120_000 });
      if (Array.isArray(data?.parts) && data.parts.length) {
        parts = fixStory(S, data.parts, { target, goal });
        by = `IA (${provider})`;
        title = String(data.title || '').trim().slice(0, 70);
        summary = String(data.summary || '').trim().slice(0, 240);
      }
    } catch (err) {
      log.warn(`IA não montou o vídeo curto (${err.message}); usando a análise por regras`);
    }
  }
  if (!parts?.length) {
    parts = fixStory(S, ruleStory(S, { target, goal }), { target, goal });
    by = 'regras';
  }
  if (!parts.length) return null;
  const out = parts.map((p) => ({ a: p.a, b: p.b, start: S[p.a].start, end: S[p.b].end, role: p.role }));
  const seconds = Math.round(out.reduce((t, p) => t + (p.end - p.start), 0));
  log.ok(`vídeo curto: ${out.length} trechos, ~${seconds}s de ${Math.round(speech)}s de fala (${by})`);
  return { parts: out, seconds, target, title: title || titleFrom(S[out[0].a].text), summary, by, goal };
}

/**
 * Marca como removidas as palavras fora dos trechos escolhidos (o corte preciso de
 * palavras faz o resto). As que já estavam removidas continuam. Puro.
 */
export function markStory(transcript, parts) {
  const inside = (w) => {
    const mid = (Number(w.start) + Number(w.end)) / 2;
    return parts.some((p) => mid >= p.start - 0.02 && mid <= p.end + 0.02);
  };
  return {
    ...transcript,
    segments: (transcript?.segments || []).map((seg) => {
      const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
      return { ...seg, words: words.map((w) => (w.removed || inside(w) ? w : { ...w, removed: true })) };
    }),
  };
}
