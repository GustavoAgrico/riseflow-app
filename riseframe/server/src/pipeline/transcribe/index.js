import { config } from '../../config.js';
import { makeLogger } from '../../logger.js';
import { transcribeMock } from './mock.js';
import {
  transcribeOpenAI,
  transcribeDeepgram,
  transcribeAssemblyAI,
  transcribeWhisperLocal,
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
  try {
    switch (provider) {
      case 'openai':
        if (!cfg.openaiKey) throw new Error('OPENAI_API_KEY ausente');
        return await transcribeOpenAI(input, work, meta, cfg);
      case 'deepgram':
        if (!cfg.deepgramKey) throw new Error('DEEPGRAM_API_KEY ausente');
        return await transcribeDeepgram(input, work, meta, cfg, onProgress);
      case 'assemblyai':
        if (!cfg.assemblyaiKey) throw new Error('ASSEMBLYAI_API_KEY ausente');
        return await transcribeAssemblyAI(input, work, meta, cfg);
      case 'whisper-local':
        return await transcribeWhisperLocal(input, work, meta, cfg);
      case 'mock':
      default:
        return await transcribeMock(input, meta);
    }
  } catch (err) {
    if (['deepgram', 'openai', 'assemblyai'].includes(provider)) {
      log.error(`provedor "${provider}" falhou: ${err.message}`);
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

/** Mensagem clara para o usuário a partir do erro do provedor (chave, saldo, rede...). */
export function transcribeErrorMessage(provider, err) {
  const name = { deepgram: 'Deepgram', openai: 'OpenAI', assemblyai: 'AssemblyAI' }[provider] || provider;
  const msg = String(err?.message || err || '');
  const status = Number((/\b(401|402|403|429)\b/.exec(msg) || [])[1]);
  if (/ausente/i.test(msg)) return `falta a chave da ${name}. Configure a chave e tente de novo.`;
  if (status === 401 || status === 403) return `a chave da ${name} foi recusada (inválida ou apagada). Confira a chave configurada.`;
  if (status === 402) return `a conta da ${name} está sem saldo/créditos.`;
  if (status === 429) return `a ${name} limitou as requisições agora. Tente de novo em instantes.`;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|network/i.test(msg)) {
    return `sem conexão com a ${name}. Verifique a internet e tente de novo.`;
  }
  return `não foi possível transcrever a fala agora (${name}). Tente de novo em instantes.`;
}
