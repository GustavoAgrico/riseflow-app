import { Router } from 'express';
import { capabilities } from '../config.js';
import { lookNames } from '../pipeline/color.js';
import { NICHES } from '../pipeline/niche.js';
import { CAPTION_FONTS, CAPTION_ANIMATIONS } from '../pipeline/captions.js';

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
      { id: 'keyword', label: 'Palavra-chave (dinâmico)' },
    ],
    captionFonts: [
      { id: 'auto', label: 'Automática (por estilo)' },
      ...Object.entries(CAPTION_FONTS).map(([id, f]) => ({ id, label: f.label })),
    ],
    captionAnimations: Object.entries(CAPTION_ANIMATIONS).map(([id, label]) => ({ id, label })),
    captionColors: [
      { id: 'white', label: 'Branco', hex: '#FFFFFF' },
      { id: 'yellow', label: 'Amarelo', hex: '#FFE24B' },
      { id: 'orange', label: 'Laranja', hex: '#FF6B35' },
      { id: 'purple', label: 'Roxo', hex: '#9F67FF' },
      { id: 'green', label: 'Verde', hex: '#2ED47A' },
      { id: 'cyan', label: 'Ciano', hex: '#22D3EE' },
      { id: 'pink', label: 'Rosa', hex: '#FF5CA8' },
    ],
    videoMotions: [
      { id: 'none', label: 'Sem movimento' },
      { id: 'zoom-in', label: 'Zoom in (aproxima)' },
      { id: 'zoom-out', label: 'Zoom out (afasta)' },
      { id: 'ken-burns', label: 'Ken Burns (zoom + pan)' },
      { id: 'pulse', label: 'Pulse (respiração sutil)' },
    ],
    motionIntensities: [
      { id: 'suave', label: 'Suave' },
      { id: 'medio', label: 'Médio' },
      { id: 'forte', label: 'Forte' },
    ],
    niches: [
      { id: 'auto', label: 'Detectar automaticamente' },
      ...Object.entries(NICHES).map(([id, n]) => ({ id, label: n.label })),
    ],
    brollLayouts: [
      { id: 'fullscreen', label: 'Tela cheia' },
      { id: 'top', label: 'Apoio em cima' },
      { id: 'bottom', label: 'Apoio embaixo' },
    ],
    aspects: [
      { id: 'original', label: 'Manter original' },
      { id: '9:16', label: 'Vertical 9:16 (Reels/Shorts/TikTok)' },
      { id: '1:1', label: 'Quadrado 1:1' },
      { id: '16:9', label: 'Horizontal 16:9 (YouTube)' },
    ],
    defaults: {
      cutSilence: true,
      voiceEnhance: false,
      voiceIntensity: 'medio',
      autoClean: true,
      captions: true,
      captionTemplate: 'clean',
      captionColor: 'white',
      captionFont: 'auto',
      captionAnimation: 'auto',
      captionScale: 1,
      colorLook: 'auto',
      videoMotion: 'none',
      motionIntensity: 'medio',
      broll: false,
      niche: 'auto',
      brollLayout: 'fullscreen',
      aspect: 'original',
      reframeTrack: true,
      silenceNoiseDb: -30,
      silenceMinDuration: 0.4,
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
