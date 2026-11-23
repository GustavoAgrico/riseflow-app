// Diretor de motion AUTOMÁTICO (sem prompt): o Claude Opus 5.5 lê a transcrição com os
// tempos, escolhe os momentos que ganham com motion (números, listas, contraste, conceito,
// gancho, chamada final) e cria cada cena premium com o vocabulário do motion
// (shared/promptMotion.js), sincronizada com a fala; depois revisa olhando quadros
// renderizados. Segue o guia de estilo aprendido das referências da pessoa (motionRefs.js).
// Sem IA: cai no motion "Premium" desenhado pelas regras (explainerPlan).

import { askClaude, askText, llmAvailable, parseJsonLoose } from './llm.js';
import { makeLogger } from '../logger.js';
import {
  sanitizePromptSpec, promptMotionSystem, promptMotionSfx, drawPromptMotion, PM_PALETTES,
} from '../../../shared/promptMotion.js';
import { explainerPlan } from '../../../shared/motionEngine.js';
import { guideText } from './motionRefs.js';

const log = makeLogger('motion-director');

/** Frases com os tempos ("[12.30–15.80] texto"), quebrando em pausa ou pontuação. Puro. */
export function speechLines(segments, maxLines = 500) {
  const words = (segments || []).flatMap((s) => s.words || [])
    .filter((w) => !w.removed && Number.isFinite(Number(w.start)) && String(w.word || '').trim());
  const lines = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push(`[${Number(cur[0].start).toFixed(2)}–${Number(cur[cur.length - 1].end).toFixed(2)}] ${cur.map((w) => String(w.word).trim()).join(' ')}`);
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? Number(next.start) - Number(w.end) : 1;
    if (/[.!?…]$/.test(String(w.word).trim()) || gap > 0.6 || cur.length >= 14) flush();
  });
  flush();
  return lines.slice(0, maxLines);
}

/** Quantas cenas: momentos-chave ≈ 1 a cada 30 s; "quase o vídeo todo" ≈ 1 a cada 14 s. Puro. */
export function sceneCount(duration, amount = 'chave') {
  const d = Math.max(0, Number(duration) || 0);
  if (amount === 'muitos') return Math.max(2, Math.min(10, Math.round(d / 14)));
  return Math.max(1, Math.min(5, Math.round(d / 30)));
}

export function directorSystem(guide = null) {
  return `${promptMotionSystem()}

DIRETOR DE MOTION (modo automático)
Você é o diretor de motion de um vídeo falado (Reels/Shorts/TikTok). Você recebe a TRANSCRIÇÃO com os tempos de cada frase e decide, sozinho, onde entram cenas de motion graphics premium — o usuário não escreve nada.
- Escolha os momentos que mais ganham com motion: números e resultados, listas/passos, comparação antes×depois, o conceito central, promessa forte, o gancho do começo e a chamada final. Não coloque cena em fala sem conteúdo visual.
- Cada cena cobre a tela (no lugar da pessoa) por 3–7 s ENQUANTO ela fala aquele trecho; "start"/"end" no tempo do vídeo, alinhados ao começo e ao fim de frases. Entre cenas, pelo menos 3 s de pessoa.
- A cena ilustra exatamente o que é dito ali, com as palavras e os números DITOS (texto curto, não transcreva a frase inteira). Cada peça entra no instante em que a palavra é falada: "at" = tempo da palavra − "start" da cena.
- Identidade visual: TODAS as cenas do vídeo com a mesma paleta, fontes e linguagem de movimento (é um vídeo só). Varie as peças entre as cenas.
- Use as receitas de motion premium acima em todas as cenas.
${guide ? `\n${guideText(guide)}\n` : ''}
Responda só com JSON: {"scenes":[{"start":s,"end":s,"why":"o que a cena mostra e por quê","spec":{roteiro da cena, "duration" = end − start}}]}`;
}

export function directorUser({ lines, duration, count, aspect = '9:16', palette = null }) {
  return [
    `Vídeo de ${Number(duration).toFixed(1)} s, formato ${aspect}. Crie ${count} cena(s) de motion (pode ser 1 a menos se não houver momentos bons).`,
    palette ? `Paleta da marca (use): ${JSON.stringify(palette)}` : '',
    '\nTRANSCRIÇÃO:',
    ...lines,
    '\nResponda só com o JSON.',
  ].filter(Boolean).join('\n');
}

/**
 * Cenas válidas: roteiro aprovado pela validação, dentro do vídeo, 2–9 s, sem sobrepor (pelo
 * menos 1,5 s entre elas), em ordem. Puro.
 */
export function cleanDirectorScenes(data, duration) {
  const D = Number(duration) || 0;
  const raw = Array.isArray(data?.scenes) ? data.scenes : [];
  const out = [];
  for (const sc of raw.slice(0, 14)) {
    let start = Number(sc?.start);
    let end = Number(sc?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(0, start);
    end = Math.min(D || end, end);
    if (end - start < 2) continue;
    if (end - start > 9) end = start + 9;
    const spec = sanitizePromptSpec({ ...(sc.spec || {}), duration: +(end - start).toFixed(2) });
    if (!spec) continue;
    out.push({ start: +start.toFixed(2), end: +(start + spec.duration).toFixed(2), style: 'prompt', spec, beats: [], why: String(sc.why || '').slice(0, 200) });
  }
  out.sort((a, b) => a.start - b.start);
  const kept = [];
  for (const sc of out) if (!kept.length || sc.start >= kept[kept.length - 1].end + 1.5) kept.push(sc);
  return kept;
}

/** Quadros (PNG base64) de uma cena para a revisão. */
async function sceneFrames(spec, aspect, times = [0.3, 0.65, 0.97]) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { registerFonts } = await import('./motionRender.js');
  registerFonts();
  const [aw, ah] = { '16:9': [16, 9], '1:1': [1, 1], '4:5': [4, 5] }[aspect] || [9, 16];
  const H = aw > ah ? 360 : 640;
  const W = Math.round((H * aw) / ah);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  return times.map((f) => {
    const t = +(spec.duration * f).toFixed(2);
    drawPromptMotion(ctx, spec, t, { W, H });
    return { t, data: c.toBuffer('image/png').toString('base64') };
  });
}

/**
 * Revisão visual em lotes de 3 cenas: o Claude vê quadros de cada cena e devolve as
 * corrigidas. Quem falhar fica como está.
 */
export async function reviewScenes(scenes, { aspect, guide = null }, cfg, ask = askClaude) {
  const out = scenes.slice();
  const notes = [];
  for (let b = 0; b < scenes.length; b += 3) {
    const batch = scenes.slice(b, b + 3);
    try {
      const content = [];
      for (let i = 0; i < batch.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const frames = await sceneFrames(batch[i].spec, aspect);
        content.push({ type: 'text', text: `CENA ${b + i} (${batch[i].start}–${batch[i].end} s): ${batch[i].why || ''}\nRoteiro: ${JSON.stringify(batch[i].spec)}` });
        for (const f of frames) content.push({ type: 'text', text: `Cena ${b + i}, quadro em ${f.t.toFixed(2)} s:` }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: f.data } });
      }
      content.push({ type: 'text', text: 'Revise cada cena olhando os quadros (texto cortado/fora da área segura, sobreposição, contraste, tela vazia, acabamento premium). Responda só com JSON: {"scenes":[{"index":n,"spec":{roteiro corrigido completo},"review":"o que ajustou ou sem ajustes"}]}' });
      const sys = `${directorSystem(guide)}\n\nAgora você REVISA as cenas que criou, como diretor de arte exigente.`;
      // eslint-disable-next-line no-await-in-loop
      const data = parseJsonLoose(await ask(sys, content, cfg, { maxTokens: 32000, task: 'review' }));
      for (const r of Array.isArray(data?.scenes) ? data.scenes : []) {
        const i = Number(r?.index);
        if (!Number.isInteger(i) || i < b || i >= b + batch.length) continue;
        const spec = sanitizePromptSpec({ ...(r.spec || {}), duration: out[i].spec.duration });
        if (spec) out[i] = { ...out[i], spec };
        if (r.review && !/^sem ajustes/i.test(String(r.review))) notes.push(`cena ${i + 1}: ${String(r.review).slice(0, 160)}`);
      }
    } catch (err) {
      log.warn(`revisão das cenas ${b + 1}–${b + batch.length} falhou (${err.message})`);
    }
  }
  return { scenes: out, notes };
}

/**
 * Motion premium automático para o vídeo inteiro.
 * @returns {Promise<{scenes:object[], sfx:object[], source:'ia'|'regras', notes:string[]}>}
 */
export async function directMotion({ segments, duration, amount = 'chave', aspect = '9:16', guide = null, palette = null, available = null }, cfg, { ask = null, review = true } = {}) {
  const lines = speechLines(segments);
  const count = sceneCount(duration, amount);
  const rules = () => {
    const plan = explainerPlan({ segments, dur: duration, amount, style: 'premium' });
    return { scenes: plan.scenes, sfx: plan.sfx, source: 'regras', notes: [] };
  };
  if (!lines.length) return { scenes: [], sfx: [], source: 'regras', notes: ['sem fala para ler'] };
  if (!llmAvailable(cfg)) return rules();
  const pal = palette || guide?.palette || null;
  try {
    const sys = directorSystem(guide);
    const user = directorUser({ lines, duration, count, aspect, palette: pal });
    const text = ask
      ? await ask(sys, user, cfg, { maxTokens: 64000, task: 'motion' })
      : (await askText(sys, user, cfg, { maxTokens: 64000, timeoutMs: 600_000, task: 'motion' })).text;
    let scenes = cleanDirectorScenes(parseJsonLoose(text), duration);
    if (!scenes.length) throw new Error('o Claude não devolveu cenas utilizáveis');
    let notes = [];
    if (review && cfg.anthropicKey) {
      const r = await reviewScenes(scenes, { aspect, guide }, cfg, ask || askClaude);
      scenes = r.scenes;
      notes = r.notes;
    }
    const sfx = scenes.flatMap((sc) => promptMotionSfx(sc.spec, sc.start, available));
    log.ok(`${scenes.length} cena(s) de motion premium: ${scenes.map((s) => `${s.start}s "${s.spec.title}"`).join(', ')}`);
    return { scenes, sfx, source: 'ia', notes };
  } catch (err) {
    log.warn(`diretor de motion falhou (${err.message}) — usando o motion Premium por regras`);
    return { ...rules(), notes: [`IA indisponível agora (${String(err.message).slice(0, 120)})`] };
  }
}

export { PM_PALETTES };
