import { Router } from 'express';
import { requireAuth } from './auth.js';
import { config } from '../config.js';
import { askClaude, askJson, llmAvailable, llmConfig, parseJsonLoose } from '../pipeline/llm.js';
import { makeLogger } from '../logger.js';
import { resolveMedia, removeFromLibrary } from '../mediaStore.js';
import { directMotion } from '../pipeline/motionDirector.js';
import { listRefs, addRef, removeRef, loadGuide, learnGuide, guideText } from '../pipeline/motionRefs.js';
import { SFX_LIBRARY } from '../pipeline/sfx.js';
import { sanitizePromptSpec, fallbackPromptSpec, promptMotionSystem, promptMotionUser, promptMotionReviewSystem, reviewTimes, drawPromptMotion, PM_GOALS, PM_LOOKS, PM_PACES, PM_PALETTES } from '../../../shared/promptMotion.js';

// Motion por PROMPT: a pessoa descreve a cena e preenche o formulário (objetivo, estilo,
// cores, ritmo, duração); a IA devolve o ROTEIRO da cena (JSON, vocabulário fechado —
// shared/promptMotion.js), que a prévia e o render desenham iguais. Também ajusta um roteiro
// pronto ("deixa mais rápido", "troca o gráfico por um contador").
export const motionRouter = Router();
const log = makeLogger('motion-prompt');

const bearer = (req) => {
  const h = String(req.get('authorization') || '');
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

/** Formulário com só os valores conhecidos. Puro. */
export function cleanForm(raw = {}) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  const colors = f.colors && typeof f.colors === 'object'
    ? Object.fromEntries(['bg', 'bg2', 'text', 'accent', 'accent2', 'muted'].map((k) => [k, hex(f.colors[k])]).filter(([, v]) => v))
    : null;
  return {
    ...(Object.hasOwn(PM_GOALS, f.goal) ? { goal: f.goal } : {}),
    ...(Object.hasOwn(PM_LOOKS, f.look) ? { look: f.look } : {}),
    ...(Object.hasOwn(PM_PACES, f.pace) ? { pace: f.pace } : {}),
    ...(Object.hasOwn(PM_PALETTES, f.palette) ? { palette: f.palette } : {}),
    ...(colors && Object.keys(colors).length ? { colors } : {}),
    duration: Math.min(12, Math.max(2, Number(f.duration) || 5)),
    aspect: ['9:16', '16:9', '1:1', '4:5'].includes(f.aspect) ? f.aspect : '9:16',
    creativity: ['baixa', 'media', 'alta'].includes(f.creativity) ? f.creativity : 'media',
    ...(typeof f.brand === 'string' && f.brand.trim() ? { brand: f.brand.trim().slice(0, 60) } : {}),
  };
}

/** Quadros da cena em PNG (base64) para o Claude olhar. */
async function renderFrames(spec, aspect) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { registerFonts } = await import('../pipeline/motionRender.js');
  registerFonts();
  const [aw, ah] = { '16:9': [16, 9], '1:1': [1, 1], '4:5': [4, 5] }[aspect] || [9, 16];
  const H = aw > ah ? 432 : 768;
  const W = Math.round((H * aw) / ah);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  return reviewTimes(spec).map((t) => {
    drawPromptMotion(ctx, spec, t, { W, H });
    return { t, data: canvas.toBuffer('image/png').toString('base64') };
  });
}

/**
 * Revisão visual: o Claude (Opus 5.5) olha quadros renderizados da cena e corrige o que está
 * ruim (texto cortado, sobreposição, contraste…). Só com a chave do Claude (imagens).
 * → { spec, note } (a cena original quando não há o que corrigir ou a revisão falha)
 */
export async function reviewSpec(spec, form, cfg, ask = askClaude) {
  const frames = await renderFrames(spec, form.aspect);
  const content = [
    ...frames.flatMap((f) => [
      { type: 'text', text: `Quadro em ${f.t.toFixed(2)} s:` },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: f.data } },
    ]),
    { type: 'text', text: `Roteiro atual:\n${JSON.stringify(spec)}\n\nRevise e responda só com o JSON.` },
  ];
  const text = await ask(promptMotionReviewSystem(), content, cfg, { maxTokens: 24000, task: 'review' });
  const data = parseJsonLoose(text);
  const fixed = sanitizePromptSpec({ ...data, duration: spec.duration });
  const note = typeof data?.review === 'string' ? data.review.trim().slice(0, 200) : '';
  return fixed ? { spec: fixed, note } : { spec, note: '' };
}

/** IA para esta pessoa: chave do servidor; no app de PC sem chave, a IA da conta do site. */
function cfgFor(req) {
  let cfg = llmConfig({});
  if (!llmAvailable(cfg) && config.account.server && bearer(req)) cfg = { ...cfg, remoteServer: config.account.server, remoteToken: bearer(req) };
  return cfg;
}

const cleanSegments = (raw) => (Array.isArray(raw) ? raw : []).slice(0, 4000).map((s) => ({
  start: Number(s?.start) || 0,
  end: Number(s?.end) || 0,
  words: (Array.isArray(s?.words) ? s.words : []).slice(0, 400).map((w) => ({ word: String(w?.word ?? '').slice(0, 40), start: Number(w?.start) || 0, end: Number(w?.end) || 0, ...(w?.removed ? { removed: true } : {}) })),
}));

// POST /api/motion/auto { segments, duration, amount, aspect, palette? } → { scenes, sfx, source, notes }
// Motion premium AUTOMÁTICO: o Claude lê a fala e cria as cenas (sem prompt).
motionRouter.post('/motion/auto', requireAuth, async (req, res) => {
  const segments = cleanSegments(req.body?.segments);
  const duration = Math.max(1, Math.min(4 * 3600, Number(req.body?.duration) || 0));
  if (!segments.length) return res.status(400).json({ error: 'sem transcrição para ler' });
  const form = cleanForm({ aspect: req.body?.aspect, colors: req.body?.palette });
  try {
    const guide = await loadGuide(req.user?.id);
    const r = await directMotion({
      segments, duration, amount: req.body?.amount === 'muitos' ? 'muitos' : 'chave', aspect: form.aspect,
      guide, palette: form.colors || null, available: new Set(Object.keys(SFX_LIBRARY)),
    }, cfgFor(req));
    res.json({ ...r, ...(guide ? { guide: true } : {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Referências de motion (a pasta que ensina o estilo ao Claude)
motionRouter.get('/motion/references', requireAuth, async (req, res) => {
  try {
    const r = await listRefs(req.user?.id);
    res.json({ files: r.files, guide: r.guide, folder: r.dir, canLearn: Boolean(llmConfig({}).anthropicKey) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
motionRouter.post('/motion/references', requireAuth, async (req, res) => {
  const id = typeof req.body?.mediaId === 'string' ? req.body.mediaId : '';
  const media = resolveMedia(id);
  if (!media || (media.ownerId && String(media.ownerId) !== String(req.user?.id))) return res.status(404).json({ error: 'arquivo não encontrado — envie de novo' });
  try {
    const name = await addRef(req.user?.id, media.path, media.originalname || `ref${Date.now()}${media.kind === 'image' ? '.png' : '.mp4'}`);
    removeFromLibrary(id, req.user?.id ?? null);
    res.json({ name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
motionRouter.delete('/motion/references/:name', requireAuth, async (req, res) => {
  const ok = await removeRef(req.user?.id, req.params.name);
  res.status(ok ? 200 : 400).json(ok ? { ok: true } : { error: 'arquivo inválido' });
});
motionRouter.post('/motion/references/learn', requireAuth, async (req, res) => {
  const cfg = llmConfig({});
  if (!cfg.anthropicKey) return res.status(501).json({ error: 'aprender com as referências precisa da chave do Claude (ANTHROPIC_API_KEY): o Claude olha os quadros' });
  try {
    const guide = await learnGuide(req.user?.id, cfg);
    res.json({ guide });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/motion/prompt { prompt, form, current?, change?, speech? } → { spec, source: 'ia'|'modelo', note?, review? }
motionRouter.post('/motion/prompt', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim().slice(0, 1200);
  const change = String(req.body?.change || '').trim().slice(0, 600);
  const current = req.body?.current ? sanitizePromptSpec(req.body.current) : null;
  if (!prompt && !(current && change)) return res.status(400).json({ error: 'descreva a cena que você quer' });
  const form = cleanForm(req.body?.form);
  const speech = String(req.body?.speech || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  // sem a IA (ou se ela falhar), a cena montada pelo modelo — a pessoa sempre recebe algo
  const fallback = () => (current && change ? current : fallbackPromptSpec(prompt, form));
  let cfg = llmConfig({});
  // app de PC sem chave própria: a IA da conta do site, com o login de quem pediu
  if (!llmAvailable(cfg) && config.account.server && bearer(req)) cfg = { ...cfg, remoteServer: config.account.server, remoteToken: bearer(req) };
  if (!llmAvailable(cfg)) {
    const spec = fallback();
    return spec ? res.json({ spec, source: 'modelo', note: 'IA indisponível: montei pelo modelo. Ligue a IA (chave do Claude ou conta do site) para cenas sob medida.' }) : res.status(422).json({ error: 'não deu para montar a cena' });
  }
  try {
    const guide = await loadGuide(req.user?.id);
    const system = guide ? `${promptMotionSystem()}\n\n${guideText(guide)}` : promptMotionSystem();
    const { data } = await askJson(system, promptMotionUser(prompt || current?.title || '', form, current, change, speech), cfg, { maxTokens: 24000, timeoutMs: 300_000, task: 'motion' });
    let spec = sanitizePromptSpec(data);
    // duração do formulário manda (a IA às vezes ignora)
    if (spec && !change) spec = sanitizePromptSpec({ ...spec, duration: form.duration });
    if (!spec) throw new Error('a IA devolveu uma cena vazia');
    log.ok(`cena "${spec.title}" (${spec.duration}s, ${spec.elements.length} peças: ${[...new Set(spec.elements.map((e) => e.type))].join(', ')})`);
    // revisão visual (Claude com imagens): olha a cena renderizada e corrige o que ficou ruim
    let review = '';
    if (cfg.anthropicKey && req.body?.review !== false) {
      try {
        const r = await reviewSpec(spec, form, cfg);
        spec = r.spec;
        review = r.note;
        if (review) log.info(`revisão visual: ${review}`);
      } catch (err) {
        log.warn(`revisão visual falhou (${err.message}) — fica a cena sem revisão`);
      }
    }
    return res.json({ spec, source: 'ia', ...(review ? { review } : {}) });
  } catch (err) {
    log.warn(`IA do motion falhou (${err.message}) — usando o modelo`);
    const spec = fallback();
    return spec ? res.json({ spec, source: 'modelo', note: `A IA não respondeu (${err.message.slice(0, 120)}); montei pelo modelo.` }) : res.status(502).json({ error: err.message });
  }
});
