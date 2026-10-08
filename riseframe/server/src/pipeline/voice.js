import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runFfmpeg, audioStageOutput } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('voice');

// Modelo de IA de redução de ruído para fala (RNNoise), usado pelo filtro arnndn.
const MODEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'models', 'voz.rnnn');
const MODEL_NAME = 'voz.rnnn'; // copiado para a pasta do job (caminho sem drive/espaço no filtro)

/** Remoção de ruído: off | suave | medio | forte | ia (rede neural treinada em fala). */
export const VOICE_NOISE = {
  off: 'Não remover',
  suave: 'Suave',
  medio: 'Médio',
  forte: 'Forte',
  ia: 'IA (forte, para fala) ✨',
};

/** Tratamento da voz (equalização + dinâmica). */
export const VOICE_PRESETS = {
  natural: 'Natural (só limpa e equilibra)',
  podcast: 'Podcast (encorpada e presente)',
  clara: 'Clara (mais brilho e definição)',
  locutor: 'Locutor (grave e marcante)',
  suave: 'Suave (quente, menos estridente)',
};

/** Modificadores de voz (efeitos). */
export const VOICE_EFFECTS = {
  none: 'Nenhum',
  robo: 'Robô',
  telefone: 'Telefone',
  radio: 'Rádio antigo',
  megafone: 'Megafone',
  eco: 'Eco',
  estudio: 'Sala / estúdio (reverb curto)',
  catedral: 'Catedral (reverb grande)',
  esquilo: 'Esquilo (fina e rápida)',
  monstro: 'Monstro (grossa)',
};

const NOISE_AF = {
  suave: ['afftdn=nr=8:nf=-30'],
  medio: ['afftdn=nr=13:nf=-25'],
  forte: ['afftdn=nr=20:nf=-22', 'adeclick'],
  ia: [`arnndn=m=${MODEL_NAME}:mix=0.9`, 'afftdn=nr=6:nf=-30'],
};

const eq = (f, g, w = 1) => `equalizer=f=${f}:t=q:w=${w}:g=${g}`;
const PRESET_AF = {
  natural: [eq(3000, 2), 'acompressor=threshold=-18dB:ratio=3:attack=5:release=120'],
  podcast: ['bass=g=3:f=120', eq(350, -2), eq(3500, 3), 'acompressor=threshold=-20dB:ratio=4:attack=5:release=100:makeup=2'],
  clara: ['highpass=f=110', eq(300, -3), eq(4500, 4), 'treble=g=3:f=10000', 'acompressor=threshold=-18dB:ratio=3:attack=5:release=120'],
  locutor: ['bass=g=5:f=100', eq(250, -1), eq(2500, 2), 'acompressor=threshold=-24dB:ratio=6:attack=3:release=150:makeup=3'],
  suave: [eq(200, 2), eq(4000, -3), 'treble=g=-2:f=8000', 'acompressor=threshold=-18dB:ratio=2.5:attack=8:release=150'],
};

const EFFECT_AF = {
  robo: ["afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75", 'aecho=0.8:0.7:6:0.4'],
  telefone: ['highpass=f=300', 'lowpass=f=3400', eq(1500, 4), 'acompressor=threshold=-20dB:ratio=4'],
  radio: ['highpass=f=400', 'lowpass=f=3500', eq(1000, 5), 'acrusher=bits=10:mode=log:aa=1'],
  megafone: ['highpass=f=500', 'lowpass=f=4000', 'volume=9dB', 'asoftclip=type=atan', eq(2000, 4)],
  eco: ['aecho=0.8:0.6:220:0.35'],
  estudio: ['aecho=0.8:0.75:35|55|85|120:0.32|0.24|0.17|0.12'],
  catedral: ['aecho=0.8:0.85:250|500|800|1100|1500:0.45|0.35|0.27|0.2|0.14'],
  esquilo: ['rubberband=pitch=1.6:formant=shifted'],
  monstro: ['rubberband=pitch=0.62:formant=shifted', 'bass=g=4:f=110'],
};

/** Opções de voz já normalizadas (aceita o legado voiceIntensity). */
export function voiceSettings(o = {}) {
  const enhance = o.voiceEnhance === true;
  const noise = VOICE_NOISE[o.voiceNoise] ? o.voiceNoise : ['suave', 'medio', 'forte'].includes(o.voiceIntensity) ? o.voiceIntensity : 'medio';
  return {
    enhance,
    noise: enhance ? noise : 'off',
    preset: enhance && PRESET_AF[o.voicePreset] ? o.voicePreset : 'natural',
    deEss: enhance && o.voiceDeEss !== false,
    effect: EFFECT_AF[o.voiceEffect] ? o.voiceEffect : 'none',
    pitch: Math.max(-8, Math.min(8, Math.round(Number(o.voicePitch) || 0))),
  };
}

/** Há algo a fazer na voz? (tratamento, efeito ou tom) */
export function voiceActive(o = {}, part = 'all') {
  const v = voiceSettings(o);
  const fx = v.effect !== 'none' || v.pitch !== 0;
  return part === 'clean' ? v.enhance : part === 'fx' ? fx : v.enhance || fx;
}

/**
 * Cadeia de filtros da voz, na ordem: limpeza (graves de fundo + ruído) → tratamento
 * (equalização + compressão) → chiado do "S" → tom → efeito → volume final padronizado
 * (-14 LUFS, o das redes sociais). `part`: 'clean' (só limpeza/tratamento — roda antes da
 * transcrição e ajuda a IA a entender a fala), 'fx' (só tom/efeito — roda depois, para
 * não atrapalhar a transcrição) ou 'all' (prévia).
 * @returns {{ af: string, model: boolean }} `model` = precisa do modelo de IA na pasta
 */
export function voiceChain(o = {}, part = 'all') {
  const v = voiceSettings(o);
  const f = [];
  if (v.enhance && part !== 'fx') {
    f.push('highpass=f=80');
    if (v.noise !== 'off') f.push(...NOISE_AF[v.noise]);
    f.push(...PRESET_AF[v.preset]);
    if (v.deEss) f.push('deesser=i=0.45:m=0.5:f=0.5');
  }
  // Tom: muda a altura sem acelerar a fala e sem "voz de esquilo" (formantes preservados).
  if (part !== 'clean') {
    if (v.pitch !== 0) f.push(`rubberband=pitch=${(2 ** (v.pitch / 12)).toFixed(4)}:formant=preserved`);
    if (v.effect !== 'none') f.push(...EFFECT_AF[v.effect]);
  }
  if (f.length) f.push('loudnorm=I=-14:TP=-1.5:LRA=11');
  return { af: f.join(','), model: v.enhance && v.noise === 'ia' && part !== 'fx' };
}

/** Compatível com a versão anterior (testes/legado): só o tratamento padrão. */
export function voiceAf(intensity = 'medio') {
  return voiceChain({ voiceEnhance: true, voiceIntensity: intensity }).af;
}

/** Copia o modelo de IA para a pasta de trabalho (o filtro o lê pelo nome, relativo). */
async function prepareModel(work) {
  await fs.copyFile(MODEL, path.join(work, MODEL_NAME));
}

/**
 * Aplica o tratamento/modificadores de voz ao áudio (vídeo copiado, sem re-encode).
 * Sem áudio ou nada a fazer → no-op.
 * @returns {Promise<{output:string, applied:boolean}>}
 */
export async function enhanceVoice(input, work, meta, options, onProgress, part = 'clean') {
  if (!meta.hasAudio) {
    log.info('sem áudio; pulando o tratamento de voz');
    return { output: input, applied: false };
  }
  const { af, model } = voiceChain(options, part);
  if (!af) return { output: input, applied: false };
  if (model) await prepareModel(work);
  const { output, muxArgs } = audioStageOutput(work, part === 'fx' ? 'voicefx' : 'voice', meta);
  const args = ['-i', input, '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '160k', ...muxArgs, '-y', output];

  await runFfmpeg(args, { label: 'voice', totalDuration: meta.duration, onProgress, cwd: work });
  const v = voiceSettings(options);
  log.ok(part === 'fx'
    ? `modificador de voz aplicado (efeito: ${v.effect}, tom: ${v.pitch})`
    : `voz tratada (ruído: ${v.noise}, tratamento: ${v.preset}, chiado do S: ${v.deEss ? 'sim' : 'não'})`);
  return { output, applied: true };
}

/**
 * Prévia curta da voz com as opções (para ouvir antes de renderizar): `seconds` a partir
 * de `start`, só o áudio (m4a). Grava em `outPath`.
 */
export async function previewVoice(input, work, outPath, options, start = 0, seconds = 8) {
  const { af, model } = voiceChain(options);
  if (model) await prepareModel(work);
  const args = ['-ss', String(Math.max(0, start)), '-t', String(Math.min(15, Math.max(2, seconds))), '-i', input, '-vn'];
  if (af) args.push('-af', af);
  args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outPath);
  await runFfmpeg(args, { label: 'voice-preview', cwd: work });
  return outPath;
}
