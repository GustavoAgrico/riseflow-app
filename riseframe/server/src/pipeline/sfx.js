import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('sfx');

// Volume de cada tipo de efeito por intensidade (0..1). "medio" é o padrão.
const LEVELS = {
  suave: { pop: 0.18, whoosh: 0.4, tick: 0.45 },
  medio: { pop: 0.32, whoosh: 0.6, tick: 0.7 },
  forte: { pop: 0.5, whoosh: 0.85, tick: 1 },
};

/**
 * Faixa com os cliques das palavras (legenda Premium): um "tic" curto e seco (~1,9 kHz,
 * some em ~40 ms) em cada tempo. Gerada aqui mesmo como WAV — muitos cliques viram UMA
 * entrada no mix, em vez de uma por clique. Exportada para teste.
 * @returns {Buffer} WAV mono 16 bits
 */
export function tickTrackWav(times, durationSec, { rate = 44100, gain = 0.28 } = {}) {
  const total = Math.max(1, Math.ceil((durationSec + 0.1) * rate));
  const pcm = new Float32Array(total);
  const len = Math.round(0.045 * rate);
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  let last = -Infinity;
  for (const t of [...times].sort((a, b) => a - b)) {
    if (!Number.isFinite(t) || t < 0 || t - last < 0.09) continue; // cliques colados viram um só
    last = t;
    const i0 = Math.round(t * rate);
    for (let n = 0; n < len && i0 + n < total; n++) {
      const x = n / rate;
      const env = Math.exp(-x / 0.007) * (1 - Math.exp(-x / 0.0004));
      const v = 0.6 * Math.sin(2 * Math.PI * 1850 * x) + 0.22 * Math.sin(2 * Math.PI * 3700 * x) + 0.25 * noise() * Math.exp(-x / 0.0025);
      pcm[i0 + n] += gain * env * v;
    }
  }
  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  return buf;
}

/** Gera os SFX base sinteticamente com o FFmpeg — sem assets externos. */
async function synthSfx(work, types) {
  const pop = path.join(work, 'sfx_pop.wav');
  const whoosh = path.join(work, 'sfx_whoosh.wav');
  if (types.includes('pop')) {
    // Pop: blip curto (clique suave).
    await runFfmpeg(
      ['-f', 'lavfi', '-i', 'sine=frequency=1000:duration=0.06:sample_rate=44100',
        '-af', 'afade=t=out:st=0.008:d=0.05,volume=0.8', '-ac', '2', '-y', pop],
      { label: 'sfx-pop' },
    );
  }
  if (!types.includes('whoosh')) return { pop, whoosh };
  // Whoosh: ruído marrom (grave, macio) com subida longa e queda rápida, passando de
  // um lado para o outro no estéreo e com um pouco de ar — soa como "passagem", não chiado.
  await runFfmpeg(
    ['-f', 'lavfi', '-i', 'anoisesrc=d=0.65:c=brown:a=0.9:r=44100',
      '-af', [
        'highpass=f=120', 'lowpass=f=2600', 'equalizer=f=900:t=q:w=1:g=4',
        'afade=t=in:st=0:d=0.42:curve=qsin', 'afade=t=out:st=0.42:d=0.23:curve=exp',
        'aecho=0.8:0.6:35:0.25', 'volume=1.6',
        'aformat=channel_layouts=stereo', 'apulsator=hz=1.3:amount=0.7',
      ].join(','),
      '-ac', '2', '-y', whoosh],
    { label: 'sfx-whoosh' },
  );
  return { pop, whoosh };
}

/**
 * Monta o filter_complex que mixa os SFX no áudio original nos tempos dos eventos.
 * Puro/exportado para teste. Retorna { filter, order } onde `order` são os tipos
 * de SFX na ordem dos inputs extras (input 0 = vídeo original).
 * @param {Array<{t:number,type:'pop'|'whoosh'}>} events
 */
export function buildSfxMix(events, opts = {}) {
  const vol = LEVELS[opts.intensity] || LEVELS.medio;
  const list = (events || [])
    .filter((e) => e && Number.isFinite(e.t) && e.t >= 0 && (e.type === 'pop' || e.type === 'whoosh'))
    .sort((a, b) => a.t - b.t)
    .slice(0, opts.max ?? 80);
  // Os cliques (tick) chegam prontos numa faixa só (opts.tickTrack), como mais uma entrada.
  if (!list.length && !opts.tickTrack) return null;

  const parts = [];
  const order = [];
  list.forEach((e, i) => {
    const ms = Math.round(e.t * 1000);
    const idx = i + 1; // input 0 é o vídeo original
    parts.push(`[${idx}:a]adelay=${ms}|${ms},volume=${vol[e.type]}[e${i}]`);
    order.push(e.type);
  });
  const labels = list.map((_, i) => `[e${i}]`);
  if (opts.tickTrack) {
    parts.push(`[${list.length + 1}:a]aformat=channel_layouts=stereo,volume=${vol.tick}[ticks]`);
    labels.push('[ticks]');
    order.push('ticks');
  }
  // normalize=0 mantém o áudio original no volume; SFX somam por cima; limiter evita clip.
  parts.push(`[0:a]${labels.join('')}amix=inputs=${labels.length + 1}:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout]`);
  return { filter: parts.join(';'), order };
}

/**
 * Aplica os efeitos sonoros ao vídeo (mantém o vídeo, remixa só o áudio).
 * @param {Array<{t:number,type:'pop'|'whoosh'}>} events tempos (na timeline final)
 * @returns {Promise<{output:string, applied:boolean, count:number}>}
 */
export async function applySoundEffects(input, work, meta, events, options, onProgress) {
  if (!meta.hasAudio) {
    log.info('sem áudio; pulando efeitos sonoros');
    return { output: input, applied: false, count: 0 };
  }
  const ticks = (events || []).filter((e) => e?.type === 'tick').map((e) => e.t);
  let tickPath = null;
  if (ticks.length) {
    tickPath = path.join(work, 'sfx_ticks.wav');
    await fs.writeFile(tickPath, tickTrackWav(ticks, meta.duration || Math.max(...ticks) + 1));
  }
  const mix = buildSfxMix(events, { intensity: options.sfxIntensity, tickTrack: !!tickPath });
  if (!mix) return { output: input, applied: false, count: 0 };

  const { pop, whoosh } = await synthSfx(work, mix.order);
  const output = path.join(work, 'sfx.mp4');
  const args = ['-i', input];
  for (const type of mix.order) args.push('-i', type === 'ticks' ? tickPath : type === 'pop' ? pop : whoosh);
  args.push(
    '-filter_complex', mix.filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', output,
  );

  await runFfmpeg(args, { label: 'sfx', totalDuration: meta.duration, onProgress });
  const count = mix.order.filter((t) => t !== 'ticks').length + ticks.length;
  log.ok(`efeitos sonoros mixados (${count}: ${mix.order.filter((t) => t === 'pop').length} pops, ${mix.order.filter((t) => t === 'whoosh').length} whooshes, ${ticks.length} cliques)`);
  return { output, applied: true, count };
}
