import { Router } from 'express';
import { capabilities } from '../config.js';
import { lookNames } from '../pipeline/color.js';

export const optionsRouter = Router();

/** Catálogo de escolhas para a UI montar os controles. */
optionsRouter.get('/options', (_req, res) => {
  res.json({
    capabilities: capabilities(),
    colorLooks: lookNames().map((id) => ({ id, label: LABELS.color[id] || id })),
    captionTemplates: [
      { id: 'clean', label: 'Clássico (limpo)' },
      { id: 'pop', label: 'Pop (palavra a palavra)' },
      { id: 'hormozi', label: 'Impacto (bold)' },
      { id: 'box', label: 'Caixa (destaque)' },
      { id: 'neon', label: 'Neon (glow)' },
      { id: 'bounce', label: 'Bounce' },
    ],
    captionColors: [
      { id: 'white', label: 'Branco', hex: '#FFFFFF' },
      { id: 'yellow', label: 'Amarelo', hex: '#FFE24B' },
      { id: 'orange', label: 'Laranja', hex: '#FF6B35' },
      { id: 'purple', label: 'Roxo', hex: '#9F67FF' },
      { id: 'green', label: 'Verde', hex: '#2ED47A' },
      { id: 'cyan', label: 'Ciano', hex: '#22D3EE' },
      { id: 'pink', label: 'Rosa', hex: '#FF5CA8' },
    ],
    aspects: [
      { id: 'original', label: 'Manter original' },
      { id: '9:16', label: 'Vertical 9:16 (Reels/Shorts/TikTok)' },
      { id: '1:1', label: 'Quadrado 1:1' },
      { id: '16:9', label: 'Horizontal 16:9 (YouTube)' },
    ],
    defaults: {
      cutSilence: true,
      captions: true,
      captionTemplate: 'clean',
      captionColor: 'white',
      colorLook: 'auto',
      broll: false,
      aspect: 'original',
      reframeTrack: true,
      silenceNoiseDb: -30,
      silenceMinDuration: 0.5,
    },
  });
});

const LABELS = {
  color: {
    auto: 'Automático (IA) ✨',
    none: 'Sem ajuste',
    clean: 'Limpo (correção técnica)',
    'teal-orange': 'Teal & Orange (cinematográfico)',
    warm: 'Quente',
    cold: 'Frio',
    vibrant: 'Vibrante',
    moody: 'Dramático (moody)',
  },
};
