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
 * Seleciona o provedor de transcrição conforme a config. Em caso de falha de um
 * provedor real (chave inválida, rede), cai para o mock para não travar o job —
 * o pipeline continua e o problema é reportado no relatório.
 * @returns {Promise<{provider,language,text,segments}>}
 */
export async function transcribe(input, work, meta) {
  const provider = config.transcribe.provider;
  const cfg = config.transcribe;
  try {
    switch (provider) {
      case 'openai':
        if (!cfg.openaiKey) throw new Error('OPENAI_API_KEY ausente');
        return await transcribeOpenAI(input, work, meta, cfg);
      case 'deepgram':
        if (!cfg.deepgramKey) throw new Error('DEEPGRAM_API_KEY ausente');
        return await transcribeDeepgram(input, work, meta, cfg);
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
