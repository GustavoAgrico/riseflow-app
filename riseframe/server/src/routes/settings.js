import { Router } from 'express';
import { getSettings, saveSettings } from '../auth/settings.js';
import { requireAuth } from './auth.js';
import { config } from '../config.js';

export const settingsRouter = Router();

/** Monta a resposta: settings do usuário + status das integrações. */
function payload(userId) {
  const s = getSettings(userId);
  return {
    settings: { pexelsKey: s.pexelsKey || '' },
    status: {
      // Pexels ativo se o usuário tem chave OU o servidor tem chave no .env.
      broll: Boolean(s.pexelsKey || config.broll.pexelsKey),
      brollFromServer: Boolean(config.broll.pexelsKey),
      transcribeProvider: config.transcribe.provider,
      whisperReady: config.transcribe.whisperReady,
    },
  };
}

// GET /api/settings → configurações do usuário logado + status
settingsRouter.get('/settings', requireAuth, (req, res) => {
  res.json(payload(req.user.id));
});

// PUT /api/settings → salva (merge) as configurações do usuário
settingsRouter.put('/settings', requireAuth, (req, res) => {
  const { pexelsKey } = req.body || {};
  saveSettings(req.user.id, { pexelsKey });
  res.json(payload(req.user.id));
});
