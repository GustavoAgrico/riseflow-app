import { Router } from 'express';
import { config } from '../config.js';
import { queue } from '../queue.js';
import { requireAuth } from './auth.js';
import { billingStatus } from '../auth/billing.js';
import { buildShowcase, removeShowcase, showcaseFile, showcaseInfo, showcaseStatus, showcaseZip } from '../showcase.js';

// Informações PÚBLICAS para a página inicial (sem login): preços, teste grátis, limites,
// demonstração antes/depois e contato. Nada aqui é segredo.
export const publicRouter = Router();

publicRouter.get('/public/info', (_req, res) => {
  const b = config.billing;
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    freeEdits: b.mode === 'off' ? 0 : b.freeEdits,
    periodDays: b.periodDays,
    payment: b.payment,
    plans: b.plans.map(({ id, name, priceCents, credits, features, popular }) => ({ id, name, priceCents, credits, features, popular: Boolean(popular) })),
    costs: b.costs,
    retentionHours: config.outputTtlHours || 0,
    maxUploadBytes: config.maxUploadBytes || 0,
    formats: ['MP4', 'MOV', 'MKV', 'WEBM', 'AVI', 'M4V'],
    supportEmail: process.env.SUPPORT_EMAIL || '',
    supportWhatsapp: process.env.SUPPORT_WHATSAPP || '',
    showcase: showcaseInfo(),
  });
});

publicRouter.get('/showcase/:name', (req, res) => {
  const file = showcaseFile(req.params.name);
  if (!file) return res.status(404).json({ error: 'demonstração não encontrada' });
  res.set('Cache-Control', 'public, max-age=300');
  res.type(file.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4').sendFile(file);
});

function requireAdmin(req, res, next) {
  if (!billingStatus(req.user).admin) return res.status(403).json({ error: 'só para administradores' });
  next();
}

publicRouter.get('/admin/showcase', requireAuth, requireAdmin, (_req, res) => res.json(showcaseStatus()));

// { jobId } → usa esse vídeo editado como demonstração da página inicial.
publicRouter.post('/admin/showcase', requireAuth, requireAdmin, (req, res) => {
  try {
    res.status(202).json(buildShowcase(queue.get(String(req.body?.jobId || ''))));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Pacote .zip da demo (para colocar no projeto em web/public/demo e ficar permanente).
publicRouter.get('/admin/showcase/package', requireAuth, requireAdmin, (_req, res) => {
  try {
    const zip = showcaseZip();
    res.set('Content-Disposition', 'attachment; filename="riseframe-demo.zip"').type('application/zip').send(zip);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

publicRouter.delete('/admin/showcase', requireAuth, requireAdmin, (_req, res) => {
  removeShowcase();
  res.json(showcaseStatus());
});
