import { makeLogger } from '../logger.js';

const log = makeLogger('translate');

/** Idiomas de legenda oferecidos. '' = manter o idioma original da fala. */
export const CAPTION_LANGUAGES = {
  '': 'Original (idioma da fala)',
  en: 'Inglês',
  es: 'Espanhol',
  fr: 'Francês',
  it: 'Italiano',
  de: 'Alemão',
  pt: 'Português',
};

const LANGUAGE_NAMES = { en: 'English', es: 'Spanish', fr: 'French', it: 'Italian', de: 'German', pt: 'Brazilian Portuguese' };

/** Segmentos por chamada ao LLM — mantém a resposta curta e o JSON confiável. */
const CHUNK = 100;

const INSTRUCTION = (lang) =>
  `You translate video captions into ${LANGUAGE_NAMES[lang]}. You receive a JSON array of caption lines.
Translate each line naturally, as spoken language, keeping it short enough to read on screen. Keep names, brands and numbers.
Return EXACTLY one translated line per input line, in the same order.
Respond ONLY with JSON: {"t":["...", "..."]}`;

/** Palavras visíveis do segmento (as marcadas como removidas não entram na legenda). */
function liveWords(seg) {
  const words = seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }];
  return words.filter((w) => !w.removed && String(w.word ?? '').trim());
}

/**
 * Dá tempos às palavras do texto traduzido dentro da janela do segmento original.
 * A tradução não tem tempo por palavra, então cada palavra recebe uma fatia
 * proporcional ao seu tamanho — a frase continua começando e terminando junto da fala.
 */
export function retimeSegment(seg, text) {
  const live = liveWords(seg);
  const start = live.length ? live[0].start : seg.start;
  const end = live.length ? Math.max(live[live.length - 1].end, start + 0.05) : seg.end;
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ...seg, text: '', words: [] };
  const weights = tokens.map((t) => t.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  const words = tokens.map((word, i) => {
    const d = ((end - start) * weights[i]) / total;
    const w = { start: t, end: i === tokens.length - 1 ? end : t + d, word };
    t += d;
    return w;
  });
  return { ...seg, start, end, text: tokens.join(' '), words };
}

function parseLines(text, expected) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('resposta não-JSON');
    data = JSON.parse(m[0]);
  }
  const lines = Array.isArray(data.t) ? data.t : [];
  if (lines.length !== expected) throw new Error(`tradução com ${lines.length} linhas, esperado ${expected}`);
  return lines.map((l) => String(l ?? ''));
}

/**
 * Traduz a transcrição (já sincronizada com a timeline final) para `lang` via Claude.
 * Devolve uma NOVA transcrição no mesmo formato, pronta para burnCaptions.
 * Lança erro quando não há chave ou a resposta não serve — quem chama mantém o original.
 */
export async function translateTranscript(transcript, lang, cfg) {
  if (!LANGUAGE_NAMES[lang]) throw new Error(`idioma não suportado: ${lang}`);
  const remote = !cfg.anthropicKey && cfg.remoteServer && cfg.remoteToken;
  if (!cfg.anthropicKey && !remote) throw new Error('tradução de legendas precisa da chave da Anthropic');
  const segments = (transcript.segments || []).filter((s) => liveWords(s).length);
  if (!segments.length) return { ...transcript, segments: [], language: lang };

  const { default: Anthropic } = remote ? { default: null } : await import('@anthropic-ai/sdk');
  const client = remote ? null : new Anthropic({
    apiKey: cfg.anthropicKey,
    ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': cfg.anthropicWorkspaceId } } : {}),
  });
  const model = cfg.model || 'claude-opus-5';

  const out = [];
  for (let i = 0; i < segments.length; i += CHUNK) {
    const chunk = segments.slice(i, i + CHUNK);
    const lines = chunk.map((s) => liveWords(s).map((w) => String(w.word).trim()).join(' '));
    let text;
    if (remote) {
      // App de PC sem chave: a IA da conta do site traduz (só o texto vai)
      const { askRemoteText } = await import('./llm.js');
      text = await askRemoteText(INSTRUCTION(lang), JSON.stringify(lines), cfg, { maxTokens: 4000, json: true });
    } else {
      const response = await client.messages.create({
        model,
        max_tokens: 4000,
        system: INSTRUCTION(lang),
        messages: [{ role: 'user', content: JSON.stringify(lines) }],
      });
      text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    }
    const translated = parseLines(text, chunk.length);
    chunk.forEach((seg, j) => out.push(retimeSegment(seg, translated[j])));
  }
  log.info(`Claude (${model}) traduziu ${out.length} segmentos para ${lang}`);
  return { ...transcript, segments: out.filter((s) => s.words.length), language: lang };
}
