import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { makeLogger } from '../logger.js';

const ffprobePath = ffprobeStatic.path;
const log = makeLogger('ffmpeg');

export { ffmpegPath, ffprobePath };

/** Converte "HH:MM:SS.ms" (saída do ffmpeg) em segundos. */
export function hmsToSeconds(hms) {
  const m = /(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(hms);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Executa o ffmpeg com os args dados.
 * @param {string[]} args
 * @param {object} [opts]
 * @param {number} [opts.totalDuration] duração total esperada (s) para calcular % de progresso
 * @param {(pct:number, timeSec:number)=>void} [opts.onProgress]
 * @param {string} [opts.label] rótulo para logs
 * @returns {Promise<{stderr:string}>}
 */
export function runFfmpeg(args, opts = {}) {
  const { totalDuration, onProgress, label = 'run', cwd } = opts;
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args], cwd ? { cwd } : undefined);
    let stderr = '';

    proc.stderr.on('data', (buf) => {
      const chunk = buf.toString();
      stderr += chunk;
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000); // cap memory
      if (onProgress && totalDuration) {
        // ffmpeg emite "time=HH:MM:SS.ms" ao longo do processamento
        const matches = chunk.match(/time=(\d+:\d\d:\d\d\.\d+)/g);
        if (matches && matches.length) {
          const t = hmsToSeconds(matches[matches.length - 1].slice(5));
          if (t != null) {
            const pct = Math.max(0, Math.min(1, t / totalDuration));
            onProgress(pct, t);
          }
        }
      }
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stderr });
      else {
        const tail = stderr.split('\n').slice(-12).join('\n');
        log.error(`ffmpeg[${label}] exit ${code}`);
        reject(new Error(`ffmpeg (${label}) falhou (code ${code}):\n${tail}`));
      }
    });
  });
}

/** ffprobe → objeto JSON completo (streams + format). */
export function probe(inputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      inputPath,
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (b) => (out += b.toString()));
    proc.stderr.on('data', (b) => (err += b.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe falhou: ${err.trim()}`));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`ffprobe JSON inválido: ${e.message}`));
      }
    });
  });
}

/** Metadados resumidos e úteis para o pipeline. */
export async function probeSummary(inputPath) {
  const info = await probe(inputPath);
  const v = (info.streams || []).find((s) => s.codec_type === 'video');
  const a = (info.streams || []).find((s) => s.codec_type === 'audio');
  const duration = Number(info.format?.duration) || Number(v?.duration) || 0;
  let fps = 30;
  if (v?.avg_frame_rate && v.avg_frame_rate !== '0/0') {
    const [n, d] = v.avg_frame_rate.split('/').map(Number);
    if (d) fps = n / d;
  }
  return {
    duration,
    hasAudio: Boolean(a),
    hasVideo: Boolean(v),
    width: v?.width || 0,
    height: v?.height || 0,
    fps: Math.round(fps * 1000) / 1000,
    videoCodec: v?.codec_name || null,
    audioCodec: a?.codec_name || null,
    sizeBytes: Number(info.format?.size) || 0,
    bitrate: Number(info.format?.bit_rate) || 0,
  };
}
