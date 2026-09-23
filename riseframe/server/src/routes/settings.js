import { Router } from 'express';
import { getSettings, saveSettings } from '../auth/settings.js';
import { requireAuth } from './auth.js';
import { config, capabilities } from '../config.js';

export const settingsRouter = Router();

/** Monta a resposta: settings do usuário + status das integrações. */
function payload(userId) {
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
