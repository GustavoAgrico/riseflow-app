import { Router } from 'express';
import { getSettings, saveSettings } from '../auth/settings.js';
import { requireAuth } from './auth.js';
import { config, capabilities } from '../config.js';
import { cloudStatus, cloudSyncNow } from '../cloudSync.js';

export const settingsRouter = Router();

/** Monta a resposta: settings do usuário + status das integrações. */
const isAdmin = (email) => config.billing.adminEmails.includes(String(email || '').toLowerCase());

function payload(userId, email) {
  const s = getSettings(userId);
  // O pipeline usa a chave da Anthropic do servidor sempre que ela existe (B-roll e limpeza de fala).
  const serverAnthropic = Boolean(config.analyze.anthropicKey);
  return {
    settings: { pexelsKey: s.pexelsKey || '', anthropicKey: s.anthropicKey || '' },
    status: {
      // Pexels ativo se o usuário tem chave OU o servidor tem chave no .env.
      broll: Boolean(s.pexelsKey || config.broll.pexelsKey),
      brollFromServer: Boolean(config.broll.pexelsKey),
      // Análise por IA ativa se o usuário tem chave da Anthropic OU o servidor tem.
      ai: Boolean(s.anthropicKey || serverAnthropic),
      aiFromServer: serverAnthropic,
      transcribeProvider: config.transcribe.provider,
      transcribeReady: capabilities().transcribeReady,
      whisperReady: config.transcribe.whisperReady,
      // Openverse (Creative Commons) não exige chave: o B-roll sempre tem uma fonte.
      openverse: true,
      // Cópia das contas/planos no Supabase (servidor sem disco permanente).
      cloud: isAdmin(email) ? cloudStatus() : { enabled: cloudStatus().enabled, ok: cloudStatus().ok },
    },
  };
}

// GET /api/settings → configurações do usuário logado + status
settingsRouter.get('/settings', requireAuth, (req, res) => {
  res.json(payload(req.user.id, req.user.email));
});

// PUT /api/settings → salva (merge) as configurações do usuário
settingsRouter.put('/settings', requireAuth, (req, res) => {
  const { pexelsKey, anthropicKey } = req.body || {};
  const patch = {};
  if (pexelsKey !== undefined) patch.pexelsKey = pexelsKey;
  if (anthropicKey !== undefined) patch.anthropicKey = anthropicKey;
  saveSettings(req.user.id, patch);
  res.json(payload(req.user.id, req.user.email));
});

// POST /api/settings/cloud/sync (admin) → sobe tudo para o Supabase agora e mostra o resultado
settingsRouter.post('/settings/cloud/sync', requireAuth, async (req, res) => {
  if (!isAdmin(req.user.email)) return res.status(403).json({ error: 'só o administrador' });
  try {
    res.json(await cloudSyncNow());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
