import { Router } from 'express';
import { requireAuth } from './auth.js';
import { config } from '../config.js';
import { askJson, llmAvailable, llmConfig } from '../pipeline/llm.js';
import { makeLogger } from '../logger.js';
import { sanitizePromptSpec, fallbackPromptSpec, promptMotionSystem, promptMotionUser, PM_GOALS, PM_LOOKS, PM_PACES, PM_PALETTES } from '../../../shared/promptMotion.js';

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

// POST /api/motion/prompt { prompt, form, current?, change? } → { spec, source: 'ia'|'modelo', note? }
motionRouter.post('/motion/prompt', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim().slice(0, 1200);
  const change = String(req.body?.change || '').trim().slice(0, 600);
  const current = req.body?.current ? sanitizePromptSpec(req.body.current) : null;
  if (!prompt && !(current && change)) return res.status(400).json({ error: 'descreva a cena que você quer' });
  const form = cleanForm(req.body?.form);
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
    const { data } = await askJson(promptMotionSystem(), promptMotionUser(prompt || current?.title || '', form, current, change), cfg, { maxTokens: 4000, timeoutMs: 120_000 });
    let spec = sanitizePromptSpec(data);
    // duração do formulário manda (a IA às vezes ignora)
    if (spec && !change) spec = sanitizePromptSpec({ ...spec, duration: form.duration });
    if (!spec) throw new Error('a IA devolveu uma cena vazia');
    log.ok(`cena "${spec.title}" (${spec.duration}s, ${spec.elements.length} peças: ${[...new Set(spec.elements.map((e) => e.type))].join(', ')})`);
    return res.json({ spec, source: 'ia' });
  } catch (err) {
    log.warn(`IA do motion falhou (${err.message}) — usando o modelo`);
    const spec = fallback();
    return spec ? res.json({ spec, source: 'modelo', note: `A IA não respondeu (${err.message.slice(0, 120)}); montei pelo modelo.` }) : res.status(502).json({ error: err.message });
  }
});
