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
  // Vídeo sem faixa de áudio (gravação de tela muda, por exemplo): não há fala para
  // transcrever — segue sem legendas em vez de falhar o job inteiro.
  if (meta && meta.hasAudio === false) {
    log.warn('vídeo sem áudio: pulando a transcrição');
    return { provider: 'none', language: 'unknown', text: '', segments: [], noAudio: true };
  }
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
