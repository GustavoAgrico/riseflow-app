import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { config } from './config.js';
import { makeLogger } from './logger.js';

const log = makeLogger('demo');

/** Caminho do vídeo de exemplo (gerado sob demanda, servido por GET /api/sample). */
export const DEMO_PATH = path.join(config.paths.uploads, '_demo.mp4');
const TMP_PATH = path.join(config.paths.uploads, '_demo.tmp.mp4');

let inFlight = null; // memoiza a geração em andamento (evita corrida/duplicação)

function generate() {
  return new Promise((resolve) => {
    // Gera num arquivo temporário e só renomeia ao concluir → nunca serve parcial.
    const gate = "volume='if(lt(mod(t,3.4),2.2),0.55,0)':eval=frame";
    const move = "overlay=x='150+(0.5+0.5*sin(2*PI*t/8))*900':y=290";
    const args = [
      '-hide_banner', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=24:d=30',
      '-f', 'lavfi', '-i', 'color=c=white:s=140x140:r=24:d=30',
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=30',
      '-filter_complex', `[0][1]${move}[v];[2]${gate}[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-movflags', '+faststart', '-shortest', TMP_PATH,
    ];
    const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          fs.renameSync(TMP_PATH, DEMO_PATH);
          log.ok('vídeo de exemplo pronto (GET /api/sample)');
          return resolve(DEMO_PATH);
        } catch (e) {
          log.warn(`falha ao finalizar o exemplo: ${e.message}`);
        }
      } else {
        log.warn(`falha ao gerar o vídeo de exemplo (code ${code})`);
      }
      fs.rm(TMP_PATH, { force: true }, () => {});
      resolve(null);
    });
    proc.on('error', () => resolve(null));
  });
}

/** Garante que o clipe de demonstração (~30s) exista; devolve o caminho ou null. */
export function ensureDemoSample() {
  if (fs.existsSync(DEMO_PATH) && fs.statSync(DEMO_PATH).size > 1000) return Promise.resolve(DEMO_PATH);
  if (!inFlight) inFlight = generate().finally(() => { inFlight = null; });
  return inFlight;
}
