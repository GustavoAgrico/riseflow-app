import { Router } from 'express';
import { getSettings, saveSettings } from '../auth/settings.js';
import { requireAuth } from './auth.js';
import { config } from '../config.js';

export const settingsRouter = Router();

/** Monta a resposta: settings do usuário + status das integrações. */
function payload(userId) {
  const s = getSettings(userId);
  const serverAnthropic = config.analyze.provider === 'anthropic' && Boolean(config.analyze.anthropicKey);
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
  const { pexelsKey, anthropicKey } = req.body || {};
  const patch = {};
  if (pexelsKey !== undefined) patch.pexelsKey = pexelsKey;
  if (anthropicKey !== undefined) patch.anthropicKey = anthropicKey;
  saveSettings(req.user.id, patch);
  res.json(payload(req.user.id));
});
