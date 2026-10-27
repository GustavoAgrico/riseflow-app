// Sons e motions automáticos nos momentos certos (como os "auto SFX" do Opus/CapCut).
// Compartilhado pelo editor (que põe os itens na faixa SFX / TEXTO, editáveis) e pelos
// testes. Tudo vira item normal da timeline: a prévia e o vídeo final usam o mesmo.
//
// Onde entra som:
// - na palavra que dispara o assunto (dinheiro, conquista, alerta, pergunta, número,
//   palavra forte) — no INÍCIO da palavra, não da frase;
// - na ideia nova depois de uma pausa (deslizar), no gancho do começo (impacto);
// - nas entradas de B-roll, transições, zooms e textos que já estão na timeline.
// Qual som: cada assunto tem a sua família (dinheiro → compra/cupom, conquista →
// conquista/subiu de nível, alerta → alerta/erro...), no estilo escolhido
// (Cinema, Arcade, Cristal...), alternando as variações para não repetir o mesmo som.

import { emphasisScore } from './keyMoments.js';

export const SFX_STYLES = { cinematic: 'Cinema', arcade: 'Arcade', glass: 'Cristal', scifi: 'Sci-fi', dreamy: 'Sonho', rubber: 'Borracha' };

const W = (re) => new RegExp(`(?<!\\p{L})(?:${re})(?!\\p{L})`, 'iu');
const KINDS = [
  ['money', W('r\\$|reais|d[oó]lar(?:es)?|dinheiro|grana|lucro|lucrar|faturar|faturamento|faturei|vend[ae]r?|vendas|vendi|comprar?|compra|compras|comprei|pagar|paguei|pre[cç]o|desconto|cupom|gr[aá]tis|barato|investir|investimento|renda|sal[aá]rio|milh[aã]o|milh[oõ]es|mil\\s+reais|pix')],
  ['win', W('consegui|conseguiu|conquist\\p{L}*|resultado|resultados|venci|vencer|ganhei|ganhou|ganhar|sucesso|meta|bati|aprovad[oa]|recorde|top|perfeito|incr[ií]vel|funcionou|deu certo|virei|transformou')],
  ['alert', W('erro|erros|errado|errada|cuidado|aten[cç][aã]o|problema|problemas|perigo|nunca|pare|evite|n[aã]o fa[cç]a|golpe|falha|falhou|alerta|proibido|risco')],
];
const STRONG = W('sempre|todos|nada|ningu[eé]m|agora|segredo|verdade|importante|melhor|pior|maior|menor|r[aá]pido|f[aá]cil|imposs[ií]vel|primeiro|[uú]nico|jamais|olha|simples|exatamente|absurdo');
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'que', 'em', 'no', 'na', 'um', 'uma', 'por', 'pra', 'para', 'com', 'é', 'eu', 'se', 'mais', 'só']);

const clean = (w) => String(w?.word ?? '').trim();
const bare = (w) => clean(w).replace(/[^\p{L}\p{N}$%]/gu, '');
function wordsOf(seg) {
  const ws = seg?.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text || '' }];
  return ws.filter((w) => !w.removed && clean(w)).map((w) => ({ ...w, start: Number(w.start), end: Number(w.end) })).filter((w) => Number.isFinite(w.start));
}

/** Assunto de uma frase e a palavra que o dispara: { kind, word, index } ou null. */
export function momentOf(words) {
  const text = words.map(clean).join(' ');
  for (const [kind, re] of KINDS) {
    if (!re.test(text)) continue;
    // a palavra exata (ou a primeira das duas, em "não faça", "mil reais")
    const i = words.findIndex((w, k) => re.test(clean(w)) || (k + 1 < words.length && re.test(`${clean(w)} ${clean(words[k + 1])}`) && !re.test(clean(words[k + 1]))));
    if (i >= 0) return { kind, word: words[i], index: i };
  }
  const n = words.findIndex((w) => /\d/.test(clean(w)));
  if (n >= 0) return { kind: 'number', word: words[n], index: n };
  if (/\?/.test(text)) return { kind: 'question', word: words[0], index: 0 };
  const s = words.findIndex((w) => STRONG.test(clean(w)));
  if (s >= 0) return { kind: 'strong', word: words[s], index: s };
  return null;
}

// Família de sons de cada assunto: arquivos do pacote (assets/sfx/pack) e, se o pacote
// não estiver, os sons sintetizados equivalentes.
const FAMILY = {
  money: { pack: ['dinheiro/purchase', 'dinheiro/coupon', 'dinheiro/add-to-cart'], synth: ['cash', 'coin'] },
  win: { pack: ['conquista/achievement', 'conquista/level-up', 'notificacao/success', 'conquista/reward'], synth: ['success', 'bling'] },
  alert: { pack: ['notificacao/warning', 'notificacao/error'], synth: ['error', 'fail'] },
  question: { pack: ['notificacao/notification', 'notificacao/mention'], synth: ['ding', 'notify'] },
  number: { pack: ['conquista/badge', 'conquista/checkpoint', 'conquista/streak'], synth: ['bling', 'pop'] },
  strong: { pack: ['transicao/snap'], synth: ['pop', 'impact'] },
  idea: { pack: ['transicao/swipe'], synth: ['swoosh', 'whoosh'] },
  hook: { pack: [], synth: ['impact', 'boom'] },
  broll: { pack: [], synth: ['whoosh', 'swoosh'] },
  transition: { pack: [], synth: ['swoosh', 'whoosh'] },
  zoom: { pack: ['transicao/swipe'], synth: ['whoosh'] },
  text: { pack: ['transicao/drop', 'interface/open'], synth: ['pop', 'bubble'] },
};
const PRIORITY = { hook: 6, money: 5, win: 5, alert: 5, broll: 4, transition: 4, number: 4, question: 3, text: 3, zoom: 2, strong: 2, idea: 1 };
export const SFX_WHY = { hook: 'gancho do começo', money: 'fala de dinheiro', win: 'conquista/resultado', alert: 'alerta/erro', number: 'número em destaque', question: 'pergunta', strong: 'palavra forte', idea: 'ideia nova depois de pausa', broll: 'entrada do B-roll', transition: 'transição', zoom: 'zoom', text: 'texto aparecendo' };

const packId = (rel, style) => `p-${`${rel}-${style}`.replace(/\//g, '-')}`;

/** Escolhe o som de um assunto entre os disponíveis, alternando as variações (n = vez). */
export function sfxFor(kind, style, available, n = 0) {
  const fam = FAMILY[kind] || FAMILY.strong;
  const has = (id) => !available || available.has(id);
  const st = Object.hasOwn(SFX_STYLES, style) ? style : 'cinematic';
  const opts = [...fam.pack.map((rel) => packId(rel, st)).filter(has), ...fam.synth.filter(has)];
  if (!opts.length) return null;
  // no pacote, alterna só entre os arquivos (o sintetizado é a reserva)
  const packOnes = opts.filter((id) => id.startsWith('p-'));
  const pool = packOnes.length ? packOnes : opts;
  return pool[n % pool.length];
}

/**
 * Sugere os efeitos sonoros. Tempos no tempo original do vídeo (o mesmo da timeline).
 * @param {object} p
 * @param {Array} p.segments frases com palavras ({start,end,word,removed})
 * @param {number} p.dur duração
 * @param {Set<string>} [p.available] ids de som que existem (catálogo)
 * @param {string} [p.style] estilo do pacote (SFX_STYLES)
 * @param {{broll?:number[],transition?:number[],zoom?:number[],text?:number[]}} [p.events] instantes do que já está na timeline
 * @param {Array<{t:number}>} [p.existing] sons já postos (não põe outro colado)
 * @param {number} [p.minGap] espaço mínimo entre dois sons (s)
 * @param {number} [p.every] no máximo um som a cada `every` segundos, em média
 * @returns {Array<{t:number,type:string,why:string,kind:string}>}
 */
export function suggestSfx({ segments, dur, available = null, style = 'cinematic', events = {}, existing = [], minGap = 1.1, every = 2.6 } = {}) {
  const total = Number(dur) || 0;
  const segs = (segments || []).map((s) => ({ ...s, ws: wordsOf(s) })).filter((s) => s.ws.length).sort((a, b) => a.ws[0].start - b.ws[0].start);
  const cand = [];
  let prevEnd = NaN;
  segs.forEach((s, i) => {
    const first = s.ws[0];
    const m = momentOf(s.ws);
    if (i === 0) cand.push({ t: first.start, kind: 'hook' });
    if (m) cand.push({ t: m.word.start, kind: m.kind });
    else if (Number.isFinite(prevEnd) && first.start - prevEnd >= 0.6) cand.push({ t: first.start, kind: 'idea' });
    prevEnd = s.ws[s.ws.length - 1].end;
  });
  for (const k of ['broll', 'transition', 'zoom', 'text']) for (const t of events[k] || []) if (Number.isFinite(Number(t))) cand.push({ t: Number(t), kind: k });

  const taken = (existing || []).map((x) => Number(x.t)).filter(Number.isFinite);
  const max = Math.max(1, Math.ceil((total || 30) / every));
  const picked = [];
  const sorted = cand
    .filter((c) => c.t >= 0 && (!total || c.t < total - 0.05))
    .sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.t - b.t);
  for (const c of sorted) {
    if (picked.length >= max) break;
    if (taken.some((t) => Math.abs(t - c.t) < 0.4)) continue;
    if (picked.some((p) => Math.abs(p.t - c.t) < minGap)) continue;
    picked.push(c);
  }
  picked.sort((a, b) => a.t - b.t);
  const n = {};
  const out = [];
  for (const p of picked) {
    const type = sfxFor(p.kind, style, available, (n[p.kind] = (n[p.kind] ?? -1) + 1));
    if (type) out.push({ t: +p.t.toFixed(3), type, kind: p.kind, why: SFX_WHY[p.kind] });
  }
  return out;
}

// ── Motions nos momentos-chave: textos animados (o render já faz igual à prévia) ──
export const MOTION_LOOKS = {
  money: { font: 'archivo', size: 0.085, color: '#22C55E', box: 'outline', boxColor: '#03180B', animIn: 'zoom', animOut: 'fade' },
  win: { font: 'anton', size: 0.08, color: '#FACC15', box: 'outline', boxColor: '#000000', animIn: 'pop', animOut: 'zoom' },
  alert: { font: 'bebas', size: 0.08, color: '#FFFFFF', box: 'box', boxColor: '#DC2626', animIn: 'pop', animOut: 'fade' },
  number: { font: 'archivo', size: 0.09, color: '#FF6B35', box: 'outline', boxColor: '#FFFFFF', animIn: 'zoom', animOut: 'fade' },
  question: { font: 'montserrat', size: 0.052, color: '#111111', box: 'box', boxColor: '#FFFFFF', animIn: 'slide-up', animOut: 'fade' },
  strong: { font: 'anton', size: 0.078, color: '#FFFFFF', box: 'outline', boxColor: '#000000', animIn: 'pop', animOut: 'zoom' },
};

/** Texto curto do motion de uma frase (ou '' se não rende um bom destaque). */
export function motionText(words, m) {
  const up = (s) => s.toLocaleUpperCase('pt-BR');
  const i = m.index;
  if (m.kind === 'number' || (m.kind === 'money' && words.some((w) => /\d/.test(clean(w))))) {
    const k = words.findIndex((w) => /\d/.test(clean(w)));
    const parts = [];
    if (k > 0 && /^r\$$/i.test(bare(words[k - 1]))) parts.push('R$');
    parts.push(clean(words[k]).replace(/[^\p{N}.,%$]/gu, ''));
    const next = words[k + 1];
    if (next && bare(next).length >= 3 && !STOP.has(bare(next).toLowerCase())) parts.push(bare(next));
    else if (next && /^(mil|milh(ão|ões)|reais|%)$/i.test(bare(next))) parts.push(bare(next));
    return up(parts.join(' ').trim());
  }
  if (m.kind === 'question') {
    if (words.length > 6) return '';
    return up(words.map(clean).join(' ').replace(/\s+([?!])/g, '$1'));
  }
  const w = bare(words[i]);
  if (!w) return '';
  // "não faça" / "deu certo": leva a palavra seguinte junto
  const two = i + 1 < words.length && /^(n[aã]o|deu|mil)$/i.test(w) ? `${w} ${bare(words[i + 1])}` : w;
  return up(two) + (m.kind === 'alert' || m.kind === 'win' ? '!' : '');
}

/**
 * Sugere motions (textos animados) nos momentos-chave.
 * @returns {Array<{text,start,end,x,y,font,size,color,box,boxColor,animIn,animOut,kind}>}
 */
export function suggestMotions({ segments, dur, existing = [], minGap = 5, y = 0.2, max = 10 } = {}) {
  const total = Number(dur) || 0;
  const segs = (segments || []).map((s) => ({ ...s, ws: wordsOf(s) })).filter((s) => s.ws.length).sort((a, b) => a.ws[0].start - b.ws[0].start);
  const cand = [];
  segs.forEach((s, i) => {
    const m = momentOf(s.ws);
    if (!m) return;
    const text = motionText(s.ws, m);
    if (!text || text.length > 28) return;
    const score = emphasisScore({ ...s, words: s.ws, start: s.ws[0].start }, i > 0 ? segs[i - 1].ws[segs[i - 1].ws.length - 1].end : NaN, i)
      + (m.kind === 'money' || m.kind === 'win' || m.kind === 'alert' ? 2 : m.kind === 'number' ? 1 : 0);
    const start = Math.max(0, m.word.start - 0.05);
    const segEnd = s.ws[s.ws.length - 1].end;
    const end = Math.min(total || Infinity, Math.max(start + 1.3, Math.min(segEnd + 0.2, start + 2.4)));
    cand.push({ score, start, end, text, kind: m.kind });
  });
  const busy = (existing || []).filter((l) => Number.isFinite(Number(l.start)));
  const picked = [];
  const limit = Math.min(max, Math.max(1, Math.floor((total || 30) / minGap)));
  for (const c of [...cand].sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (picked.length >= limit) break;
    if (c.score < 2) continue;
    if (picked.some((p) => Math.abs(p.start - c.start) < minGap)) continue;
    if (busy.some((l) => c.start < Number(l.end) && c.end > Number(l.start))) continue;
    picked.push(c);
  }
  return picked.sort((a, b) => a.start - b.start).map((c) => ({
    text: c.text, start: +c.start.toFixed(2), end: +c.end.toFixed(2), x: 0.5, y, kind: c.kind, ...MOTION_LOOKS[c.kind],
  }));
}
