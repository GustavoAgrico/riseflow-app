import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { analyzeWithClaude, analyzeWithOpenAI } from './analyzeLLM.js';

const log = makeLogger('analyze');

// Stopwords pt-BR + algumas en, para extração de temas/keywords por frequência.
const STOP = new Set(
  ('de a o que e do da em um para com nao não uma os no se na por mais as dos como mas ao ele das ' +
    'seu sua ou ser quando muito ha nos ja esta eu tambem so pelo pela ate isso ela entre era depois ' +
    'sem mesmo aos seus quem nas me esse eles voce vc vamos gente agora aqui hoje isso beleza entao ' +
    'então você cê pra pro tá né tipo assim coisa cara galera the a an and or of to in is it for on with this that you we they i ' +
    'porque como onde então cada toda todo todos todas mesmo ainda outra outro sobre')
    .split(/\s+/),
);

/** Mini-dicionário pt→EN para melhorar o acerto no Pexels (indexado em inglês). */
const PT_EN = {
  vídeo: 'video', video: 'video', câmera: 'camera', câmara: 'camera',
  cidade: 'city', natureza: 'nature', praia: 'beach', montanha: 'mountain',
  trabalho: 'work office', escritório: 'office', negócio: 'business', empresa: 'business',
  dinheiro: 'money', mercado: 'market', comida: 'food', cozinha: 'kitchen cooking',
  viagem: 'travel', carro: 'car driving', tecnologia: 'technology', computador: 'computer',
  celular: 'smartphone', internet: 'internet network', pessoas: 'people', equipe: 'team',
  reunião: 'meeting', treino: 'workout gym', academia: 'gym', saúde: 'health',
  música: 'music', dança: 'dance', esporte: 'sports', futebol: 'soccer',
  estudo: 'study', escola: 'school', livro: 'books reading', ciência: 'science',
  resultado: 'success growth', crescimento: 'growth chart', vendas: 'sales',
  cliente: 'customer', produto: 'product', marketing: 'marketing', social: 'social media',
  tempo: 'time clock', casa: 'home house', família: 'family', criança: 'children kids',
  sol: 'sun sunrise', chuva: 'rain', floresta: 'forest', rio: 'river',
  importante: 'important idea', ideia: 'idea lightbulb', foco: 'focus',
  atenção: 'attention', detalhe: 'detail closeup', diferença: 'contrast comparison',
  começar: 'start beginning', futuro: 'future innovation', mundo: 'world globe',
  digital: 'digital technology', dados: 'data analytics', gráfico: 'chart graph',
};

export function extractThemes(text, max = 6) {
  const freq = new Map();
  for (const raw of String(text).toLowerCase().split(/[^a-záàâãéêíóôõúüç0-9]+/i)) {
    const w = raw.trim();
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term, count]) => ({ term, count }));
}

/** Traduz/normaliza um termo pt para uma query de busca em inglês. */
export function translateQuery(term) {
  const t = String(term).toLowerCase().trim();
  return PT_EN[t] || t;
}

/** Palavra-chave mais saliente de um segmento (prioriza temas fortes presentes). */
function pickKeyword(seg, themeTerms) {
  const words = (seg.words?.length ? seg.words.map((w) => w.word) : String(seg.text || '').split(/\s+/))
    .map((w) => String(w).toLowerCase().replace(/[^a-záàâãéêíóôõúüç0-9]/gi, ''))
    .filter((w) => w.length >= 5 && !STOP.has(w));
  if (!words.length) return null;
  // 1) um tema forte que aparece no trecho
  const inTheme = words.find((w) => themeTerms.includes(w));
  if (inTheme) return inTheme;
  // 2) a palavra mais longa (heurística de saliência)
  return words.sort((a, b) => b.length - a.length)[0];
}

/**
 * Escolhe momentos de B-roll alinhados a cenas (segmentos), espaçados, sem
 * repetição consecutiva de query e sem cobrir a introdução.
 */
export function pickBrollMoments(segments, themes, duration, opts = {}) {
  const everySec = opts.brollEverySec ?? 7;
  const clipLen = opts.brollClipLen ?? 3.2;
  const skipIntro = opts.brollSkipIntro ?? 2;
  const maxCount = opts.brollMax ?? 6;
  const minGap = opts.brollMinGap ?? 4;
  const themeTerms = themes.map((t) => t.term);

  const moments = [];
  let nextAt = skipIntro;
  let lastQuery = null;
  for (const seg of segments || []) {
    if (seg.start < skipIntro || seg.start < nextAt) continue;
    const kw = pickKeyword(seg, themeTerms) || themeTerms[moments.length % (themeTerms.length || 1)];
    if (!kw) continue;
    const query = translateQuery(kw);
    if (query === lastQuery) continue; // evita B-roll repetido em sequência
    const end = Math.min(seg.start + clipLen, duration);
    if (end - seg.start < 1) continue;
    moments.push({ start: seg.start, end, query, term: kw });
    lastQuery = query;
    nextAt = seg.start + Math.max(everySec, minGap);
    if (moments.length >= maxCount) break;
  }
  return moments;
}

/**
 * @returns {Promise<{provider,themes:Array,brollMoments:Array}>}
 */
export async function analyze(transcript, meta, options) {
  const themes = extractThemes(transcript.text);

  // Camada por IA (opcional): melhora a relevância dos momentos/queries.
  // A chave da Anthropic do USUÁRIO (options.anthropicKey, vinda das Configurações)
  // tem prioridade; senão, cai para a config do servidor (.env).
  const anthropicKey = options.anthropicKey || (config.analyze.provider === 'anthropic' ? config.analyze.anthropicKey : '');
  const useOpenAI = !anthropicKey && config.analyze.provider === 'openai' && config.analyze.openaiKey;
  if (options.broll && (anthropicKey || useOpenAI)) {
    const provider = anthropicKey ? 'anthropic' : 'openai';
    try {
      const llm = anthropicKey
        ? await analyzeWithClaude(transcript, meta, options, { ...config.analyze, anthropicKey })
        : await analyzeWithOpenAI(transcript, meta, options, config.analyze);
      if (llm?.brollMoments?.length) {
        log.ok(`análise por IA (${provider}): ${llm.brollMoments.length} momentos`);
        return { provider, themes: llm.themes?.length ? llm.themes : themes, brollMoments: llm.brollMoments };
      }
    } catch (err) {
      log.warn(`análise por IA falhou (${err.message}); usando heurística`);
    }
  }

  const brollMoments = options.broll ? pickBrollMoments(transcript.segments, themes, meta.duration, options) : [];
  return { provider: 'heuristic', themes, brollMoments };
}
