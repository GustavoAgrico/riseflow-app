import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { makeLogger } from '../logger.js';
import { config } from '../config.js';

const ffprobePath = ffprobeStatic.path;
const log = makeLogger('ffmpeg');

export { ffmpegPath, ffprobePath };

/**
 * Codificação de vídeo das etapas intermediárias: preset rápido + CRF baixo (o arquivo
 * é temporário; só o render final precisa comprimir bem). Cada etapa recodifica o
 * vídeo inteiro, então isto é o que mais pesa no tempo total de edição.
 */
export function x264Fast() {
  return ['-c:v', 'libx264', '-preset', config.encode.preset, '-crf', String(config.encode.crf)];
}

/**
 * Filtro que converte vídeo HDR (HLG do iPhone ou PQ/HDR10) para cor normal BT.709 8-bit,
 * como o celular/navegador mostram. null se o vídeo já é SDR.
 */
export function sdrVf(meta) {
  if (!meta?.hdr) return null;
  const tin = meta.colorTransfer;
  const pin = meta.colorPrimaries || 'bt2020';
  const min = meta.colorSpace === 'bt2020c' ? 'bt2020c' : 'bt2020nc';
  if (tin === 'arib-std-b67') {
    // HLG é compatível com SDR: a conversão direta de transferência/primárias fica fiel.
    return `zscale=tin=arib-std-b67:min=${min}:pin=${pin}:t=bt709:m=bt709:p=bt709:r=tv,format=yuv420p`;
  }
  // PQ (HDR10): precisa de tone mapping.
  return `zscale=tin=smpte2084:min=${min}:pin=${pin}:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`;
}

/** Codificação do render final (arquivo que o usuário baixa). */
export function x264Final() {
  return ['-c:v', 'libx264', '-preset', config.encode.finalPreset, '-crf', String(config.encode.finalCrf), '-profile:v', 'high', '-pix_fmt', 'yuv420p'];
}

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
  // Rotação (vídeo de celular gravado em pé costuma vir "deitado" + metadado de rotação).
  // O FFmpeg já gira ao decodificar, então as dimensões REAIS são as trocadas.
  const rotTag = Number(v?.tags?.rotate);
  const rotSide = (v?.side_data_list || []).map((d) => Number(d.rotation)).find((n) => Number.isFinite(n));
  const rotation = Number.isFinite(rotSide) ? rotSide : Number.isFinite(rotTag) ? rotTag : 0;
  const swap = Math.abs(rotation) % 180 === 90;
  const transfer = v?.color_transfer || '';
  return {
    duration,
    hasAudio: Boolean(a),
    hasVideo: Boolean(v),
    width: (swap ? v?.height : v?.width) || 0,
    height: (swap ? v?.width : v?.height) || 0,
    rotation,
    pixFmt: v?.pix_fmt || '',
    colorTransfer: transfer,
    colorPrimaries: v?.color_primaries || '',
    colorSpace: v?.color_space || '',
    // HDR: HLG (iPhone) ou PQ/HDR10. Precisa converter para cor normal (SDR BT.709),
    // senão sai lavado/escuro no vídeo final.
    hdr: transfer === 'arib-std-b67' || transfer === 'smpte2084',
    fps: Math.round(fps * 1000) / 1000,
    videoCodec: v?.codec_name || null,
    audioCodec: a?.codec_name || null,
    sizeBytes: Number(info.format?.size) || 0,
    bitrate: Number(info.format?.bit_rate) || 0,
  };
}
