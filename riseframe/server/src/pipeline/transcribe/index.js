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
      throw new Error(`não foi possível transcrever a fala agora (${provider}). Tente de novo em instantes.`);
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
