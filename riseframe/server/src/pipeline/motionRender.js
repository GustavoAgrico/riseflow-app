// Render das cenas do motion explicativo: cada quadro é desenhado em Canvas 2D (o mesmo
// código da prévia, shared/motionEngine.js) e vai direto para o FFmpeg (RGBA cru → H.264).
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { drawExplainer, EXPLAINER_FONTS } from '../../../shared/motionEngine.js';
import { ffmpegPath } from './ffmpeg.js';
import { elementFile } from './elements.js';
import { log } from '../logger.js';

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Anton-Regular.ttf'), EXPLAINER_FONTS.display);
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'S-garamond-400i.ttf'), EXPLAINER_FONTS.serif);
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'S-inter-700.ttf'), EXPLAINER_FONTS.sans);
  fontsReady = true;
}

/** Imagens (objetos 3D) usadas pela cena, já carregadas. */
async function sceneImages(scene) {
  const ids = new Set(['brain']);
  for (const b of scene.beats) if (b.data?.element) ids.add(b.data.element);
  const out = new Map();
  for (const id of ids) {
    const file = elementFile(id);
    if (file) out.set(id, await loadImage(file).catch(() => null));
  }
  return out;
}

/**
 * Renderiza uma cena num MP4 (sem som) do tamanho do vídeo.
 * @returns {Promise<string>} caminho do arquivo
 */
export async function renderExplainerScene(scene, { W, H, fps = 30 }, outFile, onProgress = () => {}) {
  registerFonts();
  const imgs = await sceneImages(scene);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const env = { W, H, image: (id) => imgs.get(id) || imgs.get('brain') || null };
  const frames = Math.max(1, Math.round((scene.end - scene.start) * fps));
  const ff = spawn(ffmpegPath, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
  let err = '';
  ff.stderr.on('data', (d) => { err += d; });
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`motion: ffmpeg saiu com ${code}: ${err.slice(0, 300)}`))));
  });
  for (let f = 0; f < frames; f += 1) {
    drawExplainer(ctx, scene, scene.start + f / fps, env);
    const buf = canvas.data();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 15 === 0) onProgress(f / frames);
  }
  ff.stdin.end();
  await done;
  log.ok(`motion explicativo: cena de ${(scene.end - scene.start).toFixed(1)} s (${scene.beats.map((b) => b.type).join(' → ')})`);
  return outFile;
}

/** Renderiza as cenas e devolve camadas de vídeo (por baixo das legendas) para a etapa de mídias. */
export async function explainerLayers(scenes, meta, work, onProgress = () => {}) {
  const out = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const sc = scenes[i];
    const file = path.join(work, `motion_${i}.mp4`);
    await renderExplainerScene(sc, { W: meta.width, H: meta.height, fps: Math.round(meta.fps || 30) }, file, (p) => onProgress((i + p) / scenes.length));
    out.push({ kind: 'video', file, start: sc.start, duration: +(sc.end - sc.start).toFixed(2), mode: 'cover', muted: true, volume: 0, layer: 30, animIn: 'none', animOut: 'none', opacity: 1 });
  }
  return out;
}
