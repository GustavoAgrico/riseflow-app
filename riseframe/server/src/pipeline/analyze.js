import { config } from '../config.js';
import { makeLogger } from '../logger.js';
import { analyzeWithClaude, analyzeWithOpenAI } from './analyzeLLM.js';
import { resolveNiche, NICHES } from './niche.js';

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
  trabalho: 'work office', escritório: 'office', negócio: 'business', negócios: 'business',
  empresa: 'business company', empresário: 'entrepreneur', empreendedor: 'entrepreneur',
  empreendedorismo: 'entrepreneurship',
  dinheiro: 'money cash', mercado: 'market', comida: 'food', cozinha: 'kitchen cooking',
  viagem: 'travel', carro: 'car driving', tecnologia: 'technology', computador: 'computer laptop',
  celular: 'smartphone', internet: 'internet network', pessoas: 'people', pessoa: 'person',
  equipe: 'team teamwork', time: 'team', reunião: 'meeting', treino: 'workout gym',
  academia: 'gym fitness', saúde: 'health wellness', médico: 'doctor medical', hospital: 'hospital',
  música: 'music', dança: 'dance', esporte: 'sports', futebol: 'soccer',
  estudo: 'study', estudar: 'studying', escola: 'school classroom', faculdade: 'university',
  livro: 'books reading', livros: 'books', leitura: 'reading', ciência: 'science laboratory',
  resultado: 'success growth', resultados: 'success results', crescimento: 'growth chart',
  vendas: 'sales', venda: 'sales selling', comprar: 'shopping', compras: 'shopping',
  cliente: 'customer', clientes: 'customers', produto: 'product', produtos: 'products',
  marketing: 'marketing', social: 'social media', vida: 'lifestyle life', sucesso: 'success winner',
  tempo: 'time clock', casa: 'home house', família: 'family', criança: 'children kids',
  crianças: 'children kids', filho: 'child family', amor: 'love couple', felicidade: 'happiness smile',
  sol: 'sun sunrise', chuva: 'rain', floresta: 'forest', rio: 'river', mar: 'ocean sea',
  céu: 'sky clouds', paisagem: 'landscape scenery', flor: 'flowers', animal: 'animals wildlife',
  importante: 'important idea', ideia: 'idea lightbulb', ideias: 'ideas brainstorming', foco: 'focus',
  atenção: 'attention focus', detalhe: 'detail closeup', diferença: 'contrast comparison',
  começar: 'start beginning', início: 'beginning start', futuro: 'future innovation',
  mundo: 'world globe', digital: 'digital technology', dados: 'data analytics',
  gráfico: 'chart graph', gráficos: 'charts graphs', números: 'numbers statistics',
  investimento: 'investment finance', investir: 'investing finance', banco: 'bank finance',
  finanças: 'finance money', economia: 'economy finance', renda: 'income money',
  liderança: 'leadership leader', líder: 'leader', motivação: 'motivation inspiration',
  mente: 'mindset brain', mentalidade: 'mindset', disciplina: 'discipline focus',
  hábito: 'habit routine', hábitos: 'habits routine', rotina: 'routine morning',
  meta: 'goal target', metas: 'goals target', objetivo: 'goal target', sonho: 'dream aspiration',
  projeto: 'project planning', plano: 'plan strategy', estratégia: 'strategy planning',
  processo: 'process workflow', comunicação: 'communication speaking',
  palco: 'stage speaker', apresentação: 'presentation speaker', público: 'audience crowd',
  celebração: 'celebration success', conquista: 'achievement success', vitória: 'victory winning',
  problema: 'problem challenge', solução: 'solution idea', mudança: 'change transformation',
  transformação: 'transformation change', energia: 'energy power', poder: 'power strength',
  força: 'strength power', trabalhar: 'working office',
  vender: 'selling sales', crescer: 'growth rising', ganhar: 'winning earning',
  aprender: 'learning study', ensinar: 'teaching mentor', mentor: 'mentor coaching',
  coach: 'coaching mentor', negociar: 'negotiation deal', contrato: 'contract deal signing',
  tráfego: 'city traffic', estrada: 'road highway', avião: 'airplane travel',
  relógio: 'clock time', calendário: 'calendar schedule',
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

/** O termo tem tradução conhecida para inglês? (garante query relevante no Pexels) */
export function isTranslatable(term) {
  return Object.prototype.hasOwnProperty.call(PT_EN, String(term).toLowerCase().trim());
}

/**
 * Palavra-chave mais saliente de um segmento. Prioriza termos TRADUZÍVEIS (o Pexels
 * é indexado em inglês) para não buscar por palavra em português — o que traz
 * imagens aleatórias. Ordem: tema forte traduzível > palavra traduzível > tema
 * forte presente > palavra mais longa.
 */
function pickKeyword(seg, themeTerms) {
  const words = (seg.words?.length ? seg.words.map((w) => w.word) : String(seg.text || '').split(/\s+/))
    .map((w) => String(w).toLowerCase().replace(/[^a-záàâãéêíóôõúüç0-9]/gi, ''))
    .filter((w) => w.length >= 4 && !STOP.has(w));
  if (!words.length) return null;
  // 1) tema forte presente no trecho E traduzível
  const themeHit = words.find((w) => themeTerms.includes(w) && isTranslatable(w));
  if (themeHit) return themeHit;
  // 2) qualquer palavra traduzível do trecho (mais longa primeiro = mais específica)
  const translatable = words.filter(isTranslatable).sort((a, b) => b.length - a.length);
  if (translatable.length) return translatable[0];
  // 3) tema forte presente (mesmo sem tradução — o chamador decide o fallback)
  const inTheme = words.find((w) => themeTerms.includes(w));
  if (inTheme) return inTheme;
  // 4) a palavra mais longa (última opção)
  return words.sort((a, b) => b.length - a.length)[0];
}

/**
 * Frase de busca EM PORTUGUÊS a partir do que está sendo dito no trecho. Para o
 * Google Imagens (não indexado só em inglês e ótimo em pt) usamos o contexto real
 * da fala em vez de traduzir/limitar a um dicionário. Prioriza temas fortes e
 * junta até `max` palavras de conteúdo para dar contexto (ex.: "disciplina foco").
 * Puro/exportado para teste.
 */
export function pickPhrasePt(seg, themeTerms = [], max = 2) {
  const words = (seg.words?.length ? seg.words.map((w) => w.word) : String(seg.text || '').split(/\s+/))
    .map((w) => String(w).toLowerCase().replace(/[^a-záàâãéêíóôõúüç0-9]/gi, ''))
    .filter((w) => w.length >= 4 && !STOP.has(w));
  if (!words.length) return null;
  // Mantém 1ª aparição de cada palavra e ranqueia: tema forte primeiro, depois a
  // mais longa (mais específica). Preserva a ordem de fala no empate para soar natural.
  const seen = new Set();
  const uniq = words.filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
  const ranked = uniq
    .map((w, i) => ({ w, i, theme: themeTerms.includes(w) ? 1 : 0 }))
    .sort((a, b) => b.theme - a.theme || b.w.length - a.w.length || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i) // reordena pela fala
    .map((x) => x.w);
  return ranked.join(' ') || null;
}

/** Rótulo curto e limpo do nicho em pt (sem "/" nem vírgulas) para usar como query. */
function nicheLabelPt(niche) {
  if (!niche?.label) return null;
  return niche.label.split(/[/,]/)[0].trim() || null;
}

/**
 * Escolhe momentos de B-roll alinhados a cenas (segmentos), espaçados, sem
 * repetição consecutiva de query e sem cobrir a introdução.
 *
 * A query respeita a FONTE de imagens:
 *  • pexels (padrão): termos EM INGLÊS (banco indexado em inglês), via dicionário
 *    pt→en + nicho; trechos sem tradução caem no nicho ou são pulados.
 *  • google: termos EM PORTUGUÊS com o contexto real da fala (mais preciso e sem a
 *    limitação do dicionário); só cai no nicho quando não há palavra de conteúdo.
 */
export function pickBrollMoments(segments, themes, duration, opts = {}) {
  const everySec = opts.brollEverySec ?? 7;
  const clipLen = opts.brollClipLen ?? 3.2;
  const skipIntro = opts.brollSkipIntro ?? 2;
  const maxCount = opts.brollMax ?? 6;
  const minGap = opts.brollMinGap ?? 4;
  const themeTerms = themes.map((t) => t.term);

  const source = opts.imageSource === 'google' ? 'google' : 'pexels';
  const moments = [];
  let nextAt = skipIntro;
  let lastQuery = null;
  for (const seg of segments || []) {
    if (seg.start < skipIntro || seg.start < nextAt) continue;
    const niche = opts.niche; // {core, fallback, label} | null — casa o B-roll com o tema
    let query;
    let kw;
    if (source === 'google') {
      // Google Imagens: contexto real da fala em pt (sem dicionário/tradução).
      const phrase = pickPhrasePt(seg, themeTerms, 2);
      kw = phrase;
      if (phrase) query = phrase;
      else if (nicheLabelPt(niche)) query = nicheLabelPt(niche);
      else continue; // sem contexto e sem nicho → melhor pular
    } else {
      // Pexels: banco indexado em inglês → traduz e casa com o nicho (inglês).
      kw = pickKeyword(seg, themeTerms) || themeTerms[moments.length % (themeTerms.length || 1)];
      if (kw && isTranslatable(kw)) {
        query = (niche ? `${niche.core} ${translateQuery(kw)}` : translateQuery(kw)).trim();
      } else if (niche) {
        query = niche.fallback; // sem tradução: usa o tema do nicho (não manda pt cru)
      } else {
        continue; // sem tradução e sem nicho: pula (melhor menos B-roll do que imagem errada)
      }
    }
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
  // Nicho do vídeo: escolha do usuário (options.niche) ou detecção pela fala. Faz o
  // B-roll casar com o tema (liderança, médico, mentor...).
  const niche = resolveNiche(options.niche, transcript.text);
  if (niche) log.info(`nicho do vídeo: ${niche.id}${options.niche && options.niche !== 'auto' ? ' (definido)' : ' (detectado)'}`);

  // Camada por IA (opcional): melhora a relevância dos momentos/queries.
  // A chave da Anthropic do USUÁRIO (options.anthropicKey, vinda das Configurações)
  // tem prioridade; senão, cai para a config do servidor (.env).
  // Basta ter a chave (do usuário ou do servidor) para ligar o B-roll por IA —
  // não precisa também setar ANALYZE_PROVIDER.
  const anthropicKey = options.anthropicKey || config.analyze.anthropicKey;
  const useOpenAI = !anthropicKey && config.analyze.provider === 'openai' && config.analyze.openaiKey;
  if (options.broll && (anthropicKey || useOpenAI)) {
    const provider = anthropicKey ? 'anthropic' : 'openai';
    try {
      const nicheLabel = niche ? NICHES[niche.id]?.label : null;
      const imageSource = options.imageSource === 'google' ? 'google' : 'pexels';
      const llm = anthropicKey
        ? await analyzeWithClaude(transcript, meta, options, { ...config.analyze, anthropicKey, niche: nicheLabel, imageSource })
        : await analyzeWithOpenAI(transcript, meta, options, { ...config.analyze, niche: nicheLabel, imageSource });
      if (llm?.brollMoments?.length) {
        log.ok(`análise por IA (${provider}): ${llm.brollMoments.length} momentos${niche ? ` · nicho ${niche.id}` : ''}`);
        return { provider, themes: llm.themes?.length ? llm.themes : themes, brollMoments: llm.brollMoments, niche: niche?.id || null };
      }
    } catch (err) {
      log.warn(`análise por IA falhou (${err.message}); usando heurística`);
    }
  }

  const brollMoments = options.broll ? pickBrollMoments(transcript.segments, themes, meta.duration, { ...options, niche }) : [];
  return { provider: 'heuristic', themes, brollMoments, niche: niche?.id || null };
}
