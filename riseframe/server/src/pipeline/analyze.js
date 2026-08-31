import { config } from '../config.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('analyze');

// Stopwords pt-BR + algumas en, para extração de temas por frequência.
const STOP = new Set(
  ('de a o que e do da em um para com nao não uma os no se na por mais as dos como mas ao ele das ' +
    'seu sua ou ser quando muito ha nos ja esta eu tambem so pelo pela ate isso ela entre era depois ' +
    'sem mesmo aos seus quem nas me esse eles voce vc vamos gente agora aqui hoje isso beleza entao ' +
    'the a an and or of to in is it for on with this that you we they i')
    .split(/\s+/),
);

function extractThemes(text, max = 6) {
  const freq = new Map();
  for (const raw of text.toLowerCase().split(/[^a-záàâãéêíóôõúüç0-9]+/i)) {
    const w = raw.trim();
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term, count]) => ({ term, count }));
}

/** Escolhe momentos de B-roll distribuídos, cada um com uma palavra-chave. */
function pickBrollMoments(segments, themes, duration, everySec = 8) {
  if (!segments.length || !themes.length) return [];
  const moments = [];
  let nextAt = everySec;
  for (const seg of segments) {
    if (seg.start >= nextAt) {
      // Palavra-chave: um tema presente no trecho, senão o tema mais forte.
      const inSeg = themes.find((t) => seg.text.toLowerCase().includes(t.term));
      const theme = inSeg || themes[moments.length % themes.length];
      moments.push({
        start: seg.start,
        end: Math.min(seg.start + 3.5, duration),
        query: theme.term,
      });
      nextAt = seg.start + everySec;
    }
  }
  return moments;
}

/**
 * @returns {Promise<{provider,themes:Array,brollMoments:Array}>}
 */
export async function analyze(transcript, meta, options) {
  const themes = extractThemes(transcript.text);
  const everySec = options.brollEverySec ?? 8;
  const brollMoments = options.broll
    ? pickBrollMoments(transcript.segments, themes, meta.duration, everySec)
    : [];

  // Provedores LLM são opt-in; a heurística já entrega temas + momentos.
  if (config.analyze.provider !== 'heuristic') {
    log.info(`provedor "${config.analyze.provider}" configurado (heurística usada como base)`);
  }

  return {
    provider: 'heuristic',
    themes,
    brollMoments,
  };
}
