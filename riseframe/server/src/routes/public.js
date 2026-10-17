import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { queue } from '../queue.js';
import { requireAuth } from './auth.js';
import { billingStatus } from '../auth/billing.js';
import { zipFiles } from '../zip.js';
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

// ── Download do app de PC/Mac ──
// Os instaladores ficam no GitHub Releases (tag riseframe-vX). Para cada sistema, o mais
// novo que JÁ tem o arquivo (o build de cada sistema termina em horários diferentes).
const DOWNLOAD_REPO = process.env.DOWNLOAD_REPO || 'GustavoAgrico/riseflow-app';
const RELEASES_URL = `https://github.com/${DOWNLOAD_REPO}/releases`;
export const PLATFORM_ASSETS = {
  win: /^Riseframe-Setup-[\d.]+\.exe$/i,
  winPortable: /^Riseframe-Portatil-[\d.]+\.exe$/i,
  macArm: /^Riseframe-[\d.]+-arm64\.dmg$/i,
  macIntel: /^Riseframe-[\d.]+-x64\.dmg$/i,
};
const DOWNLOAD_TTL_MS = 10 * 60_000;
let downloadCache = { at: 0, data: null };

/** Escolhe, por sistema, o instalador mais novo da lista de releases do GitHub. */
export function pickDownloads(releases) {
  const platforms = {};
  for (const rel of releases || []) {
    if (rel.draft || rel.prerelease || !/^riseframe-v/.test(rel.tag_name || '')) continue;
    const version = String(rel.tag_name).replace(/^riseframe-v/, '');
    for (const [id, re] of Object.entries(PLATFORM_ASSETS)) {
      if (platforms[id]) continue;
      const a = (rel.assets || []).find((x) => re.test(x.name) && x.state !== 'uploading');
      if (a) platforms[id] = { url: a.browser_download_url, name: a.name, size: a.size || 0, version, date: rel.published_at || '' };
    }
  }
  return platforms;
}

async function loadDownloads() {
  if (downloadCache.data && Date.now() - downloadCache.at < DOWNLOAD_TTL_MS) return downloadCache.data;
  try {
    const r = await fetch(`https://api.github.com/repos/${DOWNLOAD_REPO}/releases?per_page=20`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'riseframe' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    const platforms = pickDownloads(await r.json());
    downloadCache = { at: Date.now(), data: { platforms, releasesUrl: RELEASES_URL } };
  } catch (err) {
    // Sem GitHub agora: usa o último resultado bom (ou só a página de releases).
    if (!downloadCache.data) return { platforms: {}, releasesUrl: RELEASES_URL, error: err.message };
    downloadCache.at = Date.now() - DOWNLOAD_TTL_MS + 60_000;
  }
  return downloadCache.data;
}

// GET /api/public/download → { platforms: { win, winPortable, macArm, macIntel }, releasesUrl }
publicRouter.get('/public/download', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await loadDownloads());
});

// GET /api/public/download/:platform → redireciona para o instalador mais novo (link fixo).
publicRouter.get('/public/download/:platform', async (req, res) => {
  const d = await loadDownloads();
  res.redirect(302, d.platforms[req.params.platform]?.url || d.releasesUrl);
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

// Backup das contas, planos/créditos e configurações (para mudar de servidor).
// Contém dados pessoais e chaves dos usuários: só admin, e guarde o arquivo com cuidado.
publicRouter.get('/admin/backup', requireAuth, requireAdmin, (_req, res) => {
  const names = ['users.json', 'billing.json', 'settings.json'];
  const files = names
    .map((n) => path.join(config.paths.data, n))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ name: `riseframe-data/${path.basename(f)}`, data: fs.readFileSync(f) }));
  if (!files.length) return res.status(404).json({ error: 'nada para salvar ainda' });
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="riseframe-backup-${stamp}.zip"`).type('application/zip').send(zipFiles(files));
});

publicRouter.delete('/admin/showcase', requireAuth, requireAdmin, (_req, res) => {
  removeShowcase();
  res.json(showcaseStatus());
});
