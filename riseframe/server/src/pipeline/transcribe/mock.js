import { detectSilences } from '../silence.js';

// Pool de palavras (pt-BR) só para preencher legendas de demonstração de forma legível.
const POOL = [
  'então', 'a', 'gente', 'vai', 'ver', 'agora', 'como', 'funciona', 'isso',
  'aqui', 'no', 'vídeo', 'de', 'hoje', 'e', 'o', 'que', 'você', 'precisa',
  'saber', 'sobre', 'o', 'assunto', 'vamos', 'começar', 'pela', 'parte',
  'mais', 'importante', 'presta', 'atenção', 'nesse', 'detalhe', 'porque',
  'faz', 'toda', 'diferença', 'no', 'resultado', 'final', 'beleza',
];

/**
 * Deriva regiões de fala (o inverso dos silêncios) e distribui palavras
 * placeholder sincronizadas com essas regiões. Serve para validar o pipeline
 * de legendas de ponta a ponta sem depender de um serviço de ASR real.
 */
export async function transcribeMock(input, meta) {
  const silences = await detectSilences(input, { noiseDb: -30, minSilence: 0.35 });

  // Constrói regiões de fala a partir dos gaps entre silêncios.
  const speech = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start - cursor > 0.25) speech.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (meta.duration - cursor > 0.25) speech.push({ start: cursor, end: meta.duration });
  // Sem áudio / sem silêncios detectados: trata o vídeo inteiro como fala.
  if (!speech.length) speech.push({ start: 0, end: meta.duration || 1 });

  let poolIdx = 0;
  const segments = [];
  for (const region of speech) {
    const dur = region.end - region.start;
    const nWords = Math.max(1, Math.round(dur / 0.36));
    const step = dur / nWords;
    const words = [];
    for (let i = 0; i < nWords; i++) {
      words.push({
        start: region.start + i * step,
        end: region.start + (i + 1) * step,
        word: POOL[poolIdx % POOL.length],
      });
      poolIdx++;
    }
    // Agrupa palavras em legendas de até ~4 tokens.
    for (let i = 0; i < words.length; i += 4) {
      const chunk = words.slice(i, i + 4);
      segments.push({
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        text: chunk.map((w) => w.word).join(' '),
        words: chunk,
      });
    }
  }

  return {
    provider: 'mock',
    language: 'pt',
    text: segments.map((s) => s.text).join(' '),
    segments,
  };
}
