import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_COSTS } from '../../shared/credits.js';

// Versão do app (bate com web/src/version.js). Mostrada no boot e em /api/health
// para confirmar rapidamente que o servidor está rodando o código novo.
export const APP_VERSION = 'v48';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// riseframe/server/src → riseframe/
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');

function bool(v, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function json(v, def) {
  if (!v) return def;
  try {
    return JSON.parse(v);
  } catch {
    console.warn(`[config] JSON inválido ignorado: ${v}`);
    return def;
  }
}
function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  root: ROOT,
  port: num(process.env.PORT, 4000),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  paths: {
    data: DATA,
    uploads: path.join(DATA, 'uploads'),
    outputs: path.join(DATA, 'outputs'),
    work: path.join(DATA, 'work'),
    jobs: path.join(DATA, 'jobs'),
    cache: path.join(DATA, 'cache'),
  },

  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 512) * 1024 * 1024,
  outputTtlHours: num(process.env.OUTPUT_TTL_HOURS, 24),
  apiToken: process.env.API_TOKEN || '',

  transcribe: {
    provider: process.env.TRANSCRIBE_PROVIDER || 'whisper-local',
    openaiKey: process.env.OPENAI_API_KEY || '',
    deepgramKey: process.env.DEEPGRAM_API_KEY || '',
    // Idioma fixo opcional para a Deepgram (ex.: 'pt'). Vazio = detecta sozinho.
    deepgramLanguage: process.env.DEEPGRAM_LANGUAGE || '',
    assemblyaiKey: process.env.ASSEMBLYAI_API_KEY || '',
    whisperModel: process.env.WHISPER_MODEL || 'base',
    // Timeout do whisper-local (ms). 0/ausente = automático (escala com a duração).
    // Em máquinas pequenas, evita que um processo travado/OOM prenda o job.
    timeoutMs: num(process.env.TRANSCRIBE_TIMEOUT_MS, 0),
    // Definido em runtime pelo autoteste de inicialização (null = ainda não checado).
    whisperReady: null,
  },

  analyze: {
    provider: process.env.ANALYZE_PROVIDER || 'heuristic',
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    // Necessário quando a chave é de ORGANIZAÇÃO (não amarrada a um workspace):
    // a Anthropic exige o cabeçalho anthropic-workspace-id. Chave de workspace dispensa.
    anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID || '',
    openaiKey: process.env.OPENAI_API_KEY || '',
    // Haiku por padrão: barato e rápido, suficiente para escolher B-roll e limpar
    // fala. Troque por claude-sonnet-5/opus se quiser mais capricho (mais caro).
    model: process.env.ANALYZE_MODEL || 'claude-haiku-4-5-20251001',
    openaiModel: process.env.ANALYZE_OPENAI_MODEL || 'gpt-4o-mini',
  },

  broll: {
    pexelsKey: process.env.PEXELS_API_KEY || '',
    // Imagens do Google via Programmable Search (Custom Search JSON API). Precisa de
    // chave de API + ID do mecanismo de busca (CSE). Grátis: 100 buscas/dia.
    // ⚠️ imagens da web costumam ter direitos autorais — por padrão filtramos só
    // Creative Commons (GOOGLE_IMAGES_UNRESTRICTED=1 libera todas, por sua conta e risco).
    googleImagesKey: process.env.GOOGLE_CSE_KEY || '',
    googleImagesCx: process.env.GOOGLE_CSE_ID || '',
    googleImagesUnrestricted: bool(process.env.GOOGLE_IMAGES_UNRESTRICTED, false),
  },

  auth: {
    // Login com Google: Client ID (Web) do Google Cloud. Vazio = botão escondido.
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    // Envio de e-mail (recuperação de senha) via SMTP. Sem isso, recuperação fica off.
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: num(process.env.SMTP_PORT, 587),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    },
    // URL pública do app (para montar o link de recuperação). Ex.: https://riseframe.onrender.com
    appUrl: process.env.APP_URL || '',
  },

  // Planos mensais + recarga avulsa via AbacatePay (Pix/cartão). Os limites (créditos e
  // recursos por plano) valem sempre; só quem está em ADMIN_EMAILS é ilimitado. Sem
  // ABACATE_PAY_API_KEY ninguém consegue assinar ainda. BILLING_MODE=off desliga os
  // limites para todos (app desktop / uso local).
  billing: {
    mode: String(process.env.BILLING_MODE || 'on').toLowerCase() === 'off' ? 'off' : 'on',
    abacateKey: process.env.ABACATE_PAY_API_KEY || '',
    webhookSecret: process.env.ABACATE_WEBHOOK_SECRET || '',
    // Créditos de teste para cada conta nova (usam os recursos de quem não tem plano).
    signupCredits: num(process.env.BILLING_SIGNUP_CREDITS, 60),
    // Custo de cada recurso. Sobrescreva com CREDIT_COSTS='{"video":20,"image":5}'.
    costs: { ...DEFAULT_COSTS, ...json(process.env.CREDIT_COSTS, {}) },
    periodDays: num(process.env.BILLING_PERIOD_DAYS, 30),
    // Recursos de quem não tem plano ativo (o vídeo básico é sempre liberado).
    freeFeatures: json(process.env.BILLING_FREE_FEATURES, []),
    // Planos mensais: créditos renovam a cada período e não acumulam. `features` usa os
    // ids de shared/credits.js (captionStyle, image, ai, clips). Sobrescreva com BILLING_PLANS.
    plans: json(process.env.BILLING_PLANS, [
      { id: 'basico', name: 'Básico', priceCents: 2990, credits: 300, features: [] },
      { id: 'pro', name: 'Pro', priceCents: 8990, credits: 1000, features: ['captionStyle', 'image', 'ai'], popular: true },
      { id: 'premium', name: 'Premium', priceCents: 24790, credits: 3000, features: ['captionStyle', 'image', 'ai', 'clips'] },
    ]),
    // Recarga avulsa (não expira; mais cara por crédito que os planos). Sobrescreva com CREDIT_PACKS.
    packs: json(process.env.CREDIT_PACKS, [
      { id: 'recarga-100', name: 'Recarga 100', credits: 100, priceCents: 1490 },
      { id: 'recarga-300', name: 'Recarga 300', credits: 300, priceCents: 3990 },
      { id: 'recarga-1000', name: 'Recarga 1000', credits: 1000, priceCents: 11990 },
    ]),
    // Métodos da AbacatePay (PIX, CARD). Se ela recusar a lista, o checkout tenta só PIX.
    methods: (process.env.BILLING_METHODS || 'PIX,CARD')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    adminEmails: (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },

  debug: bool(process.env.DEBUG, false),
};

/** Recursos externos disponíveis, para o frontend saber o que oferecer. */
export function capabilities() {
  const p = config.transcribe.provider;
  let transcribeReady;
  if (p === 'mock') transcribeReady = true;
  else if (p === 'whisper-local') transcribeReady = config.transcribe.whisperReady !== false;
  else
    transcribeReady = Boolean(
      config.transcribe.openaiKey || config.transcribe.deepgramKey || config.transcribe.assemblyaiKey,
    );
  return {
    transcribeProvider: p,
    transcribeReady,
    // Sinaliza degradação para mock (whisper indisponível → jobs caem para mock).
    transcribeFallbackToMock: p === 'whisper-local' && config.transcribe.whisperReady === false,
    analyzeProvider: config.analyze.provider,
    version: APP_VERSION,
    brollReady: Boolean(config.broll.pexelsKey),
    // Openverse (Creative Commons) não exige chave — sempre disponível.
    openverseReady: true,
    // Imagens do Google (Custom Search) disponíveis?
    googleImagesReady: Boolean(config.broll.googleImagesKey && config.broll.googleImagesCx),
    // Login com Google só aparece se o Client ID estiver configurado.
    googleReady: Boolean(config.auth.googleClientId),
    googleClientId: config.auth.googleClientId,
    // Recuperação de senha só aparece se houver SMTP configurado.
    emailReady: Boolean(config.auth.smtp.host && config.auth.smtp.user && config.auth.smtp.pass),
    billingEnabled: Boolean(config.billing.abacateKey),
  };
}
