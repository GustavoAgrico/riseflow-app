import { Router } from 'express';
import { capabilities } from '../config.js';
import { lookNames } from '../pipeline/color.js';

export const optionsRouter = Router();

/** Catálogo de escolhas para a UI montar os controles. */
optionsRouter.get('/options', (_req, res) => {
  res.json({
    capabilities: capabilities(),
    colorLooks: lookNames().map((id) => ({ id, label: LABELS.color[id] || id })),
    captionModes: [
      { id: 'karaoke', label: 'Frase (destaque palavra-a-palavra)' },
      { id: 'word', label: 'Uma palavra por vez (pop)' },
    ],
    captionPresets: [
      { id: 'laranja', label: 'Laranja (#FF6B35)' },
      { id: 'roxo', label: 'Roxo (#7C3AED)' },
      { id: 'branco', label: 'Branco/Amarelo' },
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
      captionMode: 'karaoke',
      captionPreset: 'laranja',
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
