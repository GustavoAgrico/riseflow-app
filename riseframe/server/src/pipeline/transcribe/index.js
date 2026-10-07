import { config } from '../../config.js';
import { makeLogger } from '../../logger.js';
import { transcribeMock } from './mock.js';
import {
  transcribeOpenAI,
  transcribeDeepgram,
  transcribeAssemblyAI,
  transcribeWhisperLocal,
  transcribeGroq,
} from './providers.js';

const log = makeLogger('transcribe');

/**
 * Seleciona o provedor de transcrição conforme a config. Provedores de API (Deepgram,
 * OpenAI, AssemblyAI) que falham derrubam o job — o cliente recebe o erro e os
 * créditos voltam, em vez de um vídeo com legendas de exemplo. Só o whisper-local
 * (uso local/dev) ainda cai para o mock.
 * @returns {Promise<{provider,language,text,segments}>}
 */
export async function transcribe(input, work, meta, onProgress) {
  const provider = config.transcribe.provider;
  const cfg = config.transcribe;
  // Vídeo sem faixa de áudio (gravação de tela muda, por exemplo): não há fala para
  // transcrever — segue sem legendas em vez de falhar o job inteiro.
  if (meta && meta.hasAudio === false) {
    log.warn('vídeo sem áudio: pulando a transcrição');
    return { provider: 'none', language: 'unknown', text: '', segments: [], noAudio: true };
  }
  try {
    return await runProvider(provider, input, work, meta, cfg, onProgress);
  } catch (err) {
    if (API_PROVIDERS.includes(provider)) {
      log.error(`provedor "${provider}" falhou: ${err.message}`);
      const accountProblem = isAccountProblem(err);
      if (accountProblem) {
        cfg.keyCheck = { provider, ok: false, error: transcribeErrorMessage(provider, err), at: new Date().toISOString() };
        alertAdmins(provider, err);
      }
      // Outro provedor de API configurado? Usa ele em vez de falhar o vídeo do cliente.
      for (const alt of API_PROVIDERS) {
        if (alt === provider || !keyOf(alt, cfg)) continue;
        try {
          log.warn(`tentando a transcrição pela ${alt} no lugar da ${provider}`);
          const t = await runProvider(alt, input, work, meta, cfg, onProgress);
          t.fallbackFrom = provider;
          return t;
        } catch (e2) {
          log.error(`alternativa "${alt}" também falhou: ${e2.message}`);
        }
      }
      // Problema na NOSSA conta (chave/saldo): o cliente não precisa ver detalhes técnicos.
      if (accountProblem) throw new Error('a transcrição automática está indisponível agora. Já avisamos o suporte — tente de novo mais tarde (seus créditos voltaram).');
      throw new Error(transcribeErrorMessage(provider, err));
    }
    if (provider !== 'mock') {
      log.warn(`provedor "${provider}" falhou (${err.message}); usando mock`);
      const t = await transcribeMock(input, meta);
      t.fallbackFrom = provider;
      t.fallbackReason = err.message;
      return t;
    }
    throw err;
  }
}

// Ordem das alternativas: a mais barata primeiro.
const API_PROVIDERS = ['deepgram', 'groq', 'assemblyai', 'openai'];
const keyOf = (p, cfg) => ({ deepgram: cfg.deepgramKey, groq: cfg.groqKey, assemblyai: cfg.assemblyaiKey, openai: cfg.openaiKey })[p] || '';

async function runProvider(provider, input, work, meta, cfg, onProgress) {
  switch (provider) {
    case 'openai':
      if (!cfg.openaiKey) throw new Error('OPENAI_API_KEY ausente');
      return transcribeOpenAI(input, work, meta, cfg);
    case 'deepgram':
      if (!cfg.deepgramKey) throw new Error('DEEPGRAM_API_KEY ausente');
      return transcribeDeepgram(input, work, meta, cfg, onProgress);
    case 'assemblyai':
      if (!cfg.assemblyaiKey) throw new Error('ASSEMBLYAI_API_KEY ausente');
      return transcribeAssemblyAI(input, work, meta, cfg);
    case 'groq':
      if (!cfg.groqKey) throw new Error('GROQ_API_KEY ausente');
      return transcribeGroq(input, work, meta, cfg, onProgress);
    case 'whisper-local':
      return transcribeWhisperLocal(input, work, meta, cfg);
    case 'mock':
    default:
      return transcribeMock(input, meta);
  }
}

/** Chave recusada, sem saldo ou ausente — problema da conta do provedor, não do vídeo. */
function isAccountProblem(err) {
  const msg = String(err?.message || err || '');
  return /ausente/i.test(msg) || /\b(401|402|403)\b/.test(msg);
}

// Avisa o dono (e-mail/WhatsApp de admin) no máximo 1 vez a cada 6 h por provedor.
const lastAlert = new Map();
function alertAdmins(provider, err) {
  const now = Date.now();
  if (now - (lastAlert.get(provider) || 0) < 6 * 3600 * 1000) return;
  lastAlert.set(provider, now);
  const name = { deepgram: 'Deepgram', openai: 'OpenAI', assemblyai: 'AssemblyAI', groq: 'Groq' }[provider] || provider;
  const envName = { deepgram: 'DEEPGRAM_API_KEY', openai: 'OPENAI_API_KEY', assemblyai: 'ASSEMBLYAI_API_KEY', groq: 'GROQ_API_KEY' }[provider];
  const why = transcribeErrorMessage(provider, err);
  import('../../auth/notify.js')
    .then(({ notifyAdmins, emailHtml }) => notifyAdmins({
      subject: `Riseframe: transcrição parada — ${name}`,
      text: `A transcrição dos clientes falhou: ${why} Crie uma chave nova no painel da ${name} e troque ${envName} no Environment do Render.`,
      html: emailHtml(`Transcrição parada (${name})`, [
        `Os vídeos dos clientes não estão sendo legendados: ${why}`,
        `Crie uma chave nova no painel da ${name} e troque a variável ${envName} no Render (Environment → Save, rebuild and deploy).`,
        'Os créditos e edições grátis dos vídeos que falharam já foram devolvidos.',
      ]),
    }))
    .catch((e) => log.warn(`aviso de transcrição ao admin falhou: ${e.message}`));
}

/**
 * Testa a chave do provedor ao ligar o servidor (sem gastar nada) e guarda o resultado
 * em config.transcribe.keyCheck — aparece em Conta → Status do servidor.
 */
export async function checkTranscribeKey() {
  const cfg = config.transcribe;
  const p = cfg.provider;
  const probe = {
    deepgram: cfg.deepgramKey && { url: 'https://api.deepgram.com/v1/projects', headers: { Authorization: `Token ${cfg.deepgramKey}` } },
    groq: cfg.groqKey && { url: 'https://api.groq.com/openai/v1/models', headers: { Authorization: `Bearer ${cfg.groqKey}` } },
  }[p];
  if (!probe) return null;
  const name = { deepgram: 'Deepgram', groq: 'Groq' }[p];
  try {
    const r = await fetch(probe.url, { headers: probe.headers, signal: AbortSignal.timeout(15_000) });
    const ok = r.ok;
    cfg.keyCheck = { provider: p, ok, error: ok ? null : transcribeErrorMessage(p, new Error(`HTTP ${r.status}`)), at: new Date().toISOString() };
    if (ok) log.ok(`chave da ${name} aceita`);
    else {
      log.error(`chave da ${name} recusada (HTTP ${r.status})`);
      if (r.status === 401 || r.status === 403 || r.status === 402) alertAdmins(p, new Error(`HTTP ${r.status}`));
    }
  } catch (err) {
    log.warn(`não consegui testar a chave da ${name}: ${err.message}`);
  }
  return cfg.keyCheck || null;
}

/** Mensagem clara para o usuário a partir do erro do provedor (chave, saldo, rede...). */
export function transcribeErrorMessage(provider, err) {
  const name = { deepgram: 'Deepgram', openai: 'OpenAI', assemblyai: 'AssemblyAI', groq: 'Groq' }[provider] || provider;
  const msg = String(err?.message || err || '');
  const status = Number((/\b(401|402|403|429)\b/.exec(msg) || [])[1]);
  if (/ausente/i.test(msg)) return `falta a chave da ${name}. Configure a chave e tente de novo.`;
  if (status === 401 || status === 403) return `a chave da ${name} foi recusada (inválida ou apagada). Confira a chave configurada.`;
  if (status === 402) return `a conta da ${name} está sem saldo/créditos.`;
  if (status === 429) return `a ${name} limitou as requisições agora. Tente de novo em instantes.`;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|network/i.test(msg)) {
    return `sem conexão com a ${name}. Verifique a internet e tente de novo.`;
  }
  if (/ffmpeg \(extract-audio\)/.test(msg)) {
    return 'não consegui ler o áudio deste vídeo. Tente exportar o vídeo de novo (MP4) e enviar outra vez.';
  }
  if (/\b400\b/.test(msg) && /corrupt|unsupported|failed to process audio/i.test(msg)) {
    return `a ${name} não conseguiu ler o áudio deste vídeo. Tente exportar o vídeo de novo (MP4) e enviar outra vez.`;
  }
  if (/sem resposta em/i.test(msg)) {
    return `a ${name} demorou demais para responder (internet lenta ou vídeo muito longo). Tente de novo.`;
  }
  // Caso desconhecido: mostra um resumo do erro real para dar para diagnosticar.
  const detail = msg.replace(/\s+/g, ' ').replace(/Token\s+\S+/gi, 'Token ***').trim().slice(0, 180);
  return `não foi possível transcrever a fala agora (${name}). Tente de novo em instantes.${detail ? ` Detalhe: ${detail}` : ''}`;
}
