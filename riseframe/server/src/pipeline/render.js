import path from 'node:path';
import fs from 'node:fs/promises';
import { runFfmpeg, x264Fast, x264Final } from './ffmpeg.js';
import { faceCropGeometry } from './broll.js';
import { smartReframeVf, TARGETS } from './reframe.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('render');

const RESIZE = { original: null, ...TARGETS };

/** O vídeo já está na proporção do formato pedido? */
export function matchesAspect(meta, target) {
  return Boolean(target && meta?.width && meta?.height && Math.abs(meta.width / meta.height - target.w / target.h) < 0.01);
}

/**
 * Filtro que leva o vídeo ao formato pedido, conforme o enquadramento escolhido:
 *  - 'auto'   segue o rosto/sujeito (tracking); sem tracking, recorte central;
 *  - 'manual' recorte fixo no ponto escolhido pelo usuário (personFocusX/Y, já
 *             considerando o zoom do reenquadramento, se houve);
 *  - 'fit'    vídeo INTEIRO, sem cortar nada, com fundo desfocado (estilo Reels).
 * @returns {Promise<{vf:string, reframe:object}>}
 */
export async function aspectVf(input, meta, target, options = {}, trackInput = input) {
  const mode = ['manual', 'fit'].includes(options.reframeMode) ? options.reframeMode : 'auto';
  const { w: W, h: H } = target;
  if (mode === 'fit') {
    return {
      vf: `split[rfa][rfb];[rfa]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:2,eq=brightness=-0.06[rfbg];` +
        `[rfb]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[rffg];[rfbg][rffg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p`,
      reframe: { tracked: false, axis: null, source: 'fit' },
    };
  }
  if (mode === 'manual' && Number.isFinite(Number(options.personFocusX))) {
    let focus = { x: Number(options.personFocusX), y: Number.isFinite(Number(options.personFocusY)) ? Number(options.personFocusY) : 0.4 };
    // Se o vídeo já foi ampliado no ponto (reenquadramento), o ponto mudou de lugar.
    const zoom = Math.min(3, Math.max(1, Number(options.personZoom) || 1));
    if (zoom > 1.001) {
      const z = faceCropGeometry(meta.width, meta.height, meta.width, meta.height, focus, zoom);
      focus = { x: (focus.x * z.scaledW - z.cropX) / meta.width, y: (focus.y * z.scaledH - z.cropY) / meta.height };
    }
    const g = faceCropGeometry(meta.width, meta.height, W, H, focus, 1);
    return {
      vf: `scale=${g.scaledW}:${g.scaledH}:flags=bicubic,crop=${W}:${H}:${g.cropX}:${g.cropY},setsar=1,format=yuv420p`,
      reframe: { tracked: false, axis: null, source: 'manual' },
    };
  }
  if (options.reframeTrack !== false) {
    const smart = await smartReframeVf(input, meta, target, trackInput);
    if (smart) return smart;
  }
  return {
    vf: [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, 'setsar=1', 'format=yuv420p'].join(','),
    reframe: { tracked: false, axis: null, source: 'center' },
  };
}

/**
 * Passa o vídeo para o formato de saída ANTES das legendas: assim a legenda é desenhada
 * já no quadro final (9:16, 1:1…) e nunca sai cortada nas laterais.
 * @returns {Promise<{output:string, applied:boolean, reframe:object|null}>}
 */
export async function convertAspect(input, work, meta, options, trackInput, onProgress) {
  const target = RESIZE[options.aspect || 'original'];
  if (!target || matchesAspect(meta, target)) return { output: input, applied: false, reframe: null };
  const { vf, reframe } = await aspectVf(input, meta, target, options, trackInput || input);
  const output = path.join(work, 'aspect.mp4');
  const args = ['-i', input, '-vf', vf, ...x264Fast()];
  if (meta.hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', '-y', output);
  await runFfmpeg(args, { label: 'formato', totalDuration: meta.duration, onProgress });
  log.ok(`formato ${options.aspect} (${reframe.source}${reframe.tracked ? ', tracking' : ''})`);
  return { output, applied: true, reframe };
}

/**
 * Render final: normaliza para o formato de saída escolhido e gera um MP4 web-ready
 * (yuv420p + faststart). Quando o formato exige reframe e `reframeTrack` está ligado,
 * segue o sujeito (rosto/movimento) com crop dinâmica; senão, crop central.
 * `options.colorVf` (opcional) é aplicado antes, na mesma passada — evita recodificar
 * o vídeo inteiro só para a cor.
 * @returns {Promise<{output:string, aspect:string, sizeBytes:number, reframe:object|null}>}
 */
/**
 * Filtros de velocidade (k× mais rápido/lento): vídeo com `setpts` (mantendo o fps) e
 * áudio com `atempo` (sem mudar o tom). Null quando a velocidade é normal. Puro.
 */
export function speedFilters(speed, fps) {
  const k = Number(speed);
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 0.01) return null;
  const f = Math.max(0.5, Math.min(2, k));
  const rate = Number(fps) > 0 ? Math.round(Number(fps) * 1000) / 1000 : 30;
  return { k: f, vf: `setpts=PTS/${f},fps=${rate}`, af: `atempo=${f}` };
}

export async function finalRender(input, outputsDir, jobId, meta, options, onProgress) {
  const aspect = options.aspect || 'original';
  const target = RESIZE[aspect];
  const output = path.join(outputsDir, `${jobId}.mp4`);

  let vf;
  let reframe = options.reframe || null;
  if (target && matchesAspect(meta, target)) {
    // Já está no formato (convertido antes das legendas): só a resolução final.
    vf = `scale=${target.w}:${target.h}:flags=bicubic,setsar=1,format=yuv420p`;
  } else if (target) {
    // Vídeo que não passou pela etapa de formato: converte aqui mesmo.
    ({ vf, reframe } = await aspectVf(input, meta, target, options, options.trackInput || input));
  } else {
    vf = 'format=yuv420p';
  }

  if (options.colorVf) vf = `${options.colorVf},${vf}`;
  // Velocidade: no mesmo passe do render final (legendas, sons e cortes já estão no
  // vídeo, então tudo acelera junto e continua sincronizado). A voz mantém o tom.
  const speed = speedFilters(options.speed, meta.fps);
  if (speed) vf = `${vf},${speed.vf}`;
  const args = ['-i', input, '-vf', vf, ...x264Final()];
  if (meta.hasAudio) {
    if (speed) args.push('-af', speed.af);
    args.push('-c:a', 'aac', '-b:a', '192k');
  }
  args.push('-movflags', '+faststart', '-y', output);

  await runFfmpeg(args, { label: 'render', totalDuration: meta.duration / (speed ? speed.k : 1), onProgress });

  const stat = await fs.stat(output);
  log.ok(`render final: ${path.basename(output)} (${(stat.size / 1e6).toFixed(1)} MB, ${aspect}${reframe?.tracked ? ', tracking' : ''})`);
  return { output, aspect, sizeBytes: stat.size, reframe };
}
