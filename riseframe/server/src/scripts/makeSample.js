import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config.js';

/**
 * Gera um clipe de teste vertical (720x1280, 12s) com trechos de "fala"
 * (tom audível) intercalados com silêncios — para exercitar o corte de pausas,
 * a transcrição mock e as legendas.
 */
const out = process.argv[2] || path.join(config.paths.uploads, 'sample.mp4');
fs.mkdirSync(path.dirname(out), { recursive: true });

// Áudio: tom ligado por 1.6s, desligado por 1.0s, repetindo (ciclo 2.6s).
const speechGate = "volume='if(lt(mod(t,2.6),1.6),0.7,0)':eval=frame";

const args = [
  '-hide_banner', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=12',
  '-f', 'lavfi', '-i', 'sine=frequency=320:duration=12',
  '-filter_complex', `[1:a]${speechGate}[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-shortest', out,
];

const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
proc.on('close', (code) => {
  if (code === 0) console.log(`\n✓ clipe de teste gerado: ${out}`);
  else {
    console.error(`\n✗ falha ao gerar (code ${code})`);
    process.exit(1);
  }
});
