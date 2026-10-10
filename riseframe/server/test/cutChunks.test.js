import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { planCutChunks, remuxByKeepSegments, snapKeep, keptDuration, remapTime } from '../src/pipeline/timeline.js';
import { runFfmpeg, ffmpegPath, ffprobePath } from '../src/pipeline/ffmpeg.js';

test('blocos do corte: janelas curtas, trechos longos partidos sem fade interno', () => {
  const keep = [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 150 }, { start: 151, end: 152 }];
  const chunks = planCutChunks(keep, 30, { maxSpan: 60 });
  for (const c of chunks) assert.ok(c.end - c.start <= 60 + 1e-6, `bloco ${c.start}→${c.end}`);
  const segs = chunks.flatMap((c) => c.segs);
  assert.equal(keptDuration(segs).toFixed(4), keptDuration(keep).toFixed(4), 'nenhum tempo perdido');
  // o trecho 6→150 virou pedaços; só as pontas verdadeiras têm micro-fade
  const longos = segs.filter((s) => s.start >= 6 && s.end <= 150);
  assert.ok(longos.length >= 3);
  assert.equal(longos[0].fadeIn, true);
  assert.equal(longos.at(-1).fadeOut, true);
  assert.ok(longos.slice(1).every((s) => !s.fadeIn) && longos.slice(0, -1).every((s) => !s.fadeOut));
  // máximo de trechos por bloco
  const muitos = Array.from({ length: 100 }, (_, i) => ({ start: i * 0.5, end: i * 0.5 + 0.3 }));
  assert.ok(planCutChunks(muitos, 30, { maxSegs: 40 }).every((c) => c.segs.length <= 40));
});

/** Instantes (s) em que o vídeo pisca branco e em que o áudio apita. */
function flashesAndBeeps(file) {
  const v = spawnSync(ffmpegPath, ['-v', 'error', '-i', file, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stdout;
  const frames = [...v.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => ({ t: Number(m[1]), y: Number(m[2]) }));
  const flashes = [];
  frames.forEach((f, i) => { if (f.y > 128 && !(frames[i - 1]?.y > 128)) flashes.push(f.t); });
  const a = spawnSync(ffmpegPath, ['-v', 'info', '-i', file, '-vn', '-af', 'silencedetect=n=-30dB:d=0.02', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const beeps = [...a.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return { flashes, beeps, frames: frames.length };
}

test('corte em blocos: frames exatos e som/imagem em sincronia em todas as emendas', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cutchunks-'));
  const src = path.join(dir, 'src.mp4');
  // A cada 1 s (em t = k + 0.5): 0.1 s de tela branca e um apito no MESMO instante.
  await runFfmpeg([
    '-f', 'lavfi', '-i', 'color=black:s=160x120:r=30:d=20',
    '-f', 'lavfi', '-i', 'sine=f=1000:r=48000:d=20',
    '-filter_complex', "[0:v]drawbox=c=white:t=fill:enable='between(mod(t,1),0.5,0.599)'[v];[1:a]volume=enable='lt(mod(t,1),0.5)+gte(mod(t,1),0.6)':volume=0[a]",
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '90', '-c:a', 'aac', '-y', src,
  ]);
  // Trechos mantidos (no grid de frames) espalhados; blocos pequenos para forçar várias emendas.
  const keep = snapKeep([
    { start: 0.2, end: 1.9 }, { start: 2.3, end: 4.1 }, { start: 5.2, end: 5.9 }, { start: 7.1, end: 11.8 },
    { start: 12.4, end: 13.7 }, { start: 15.0, end: 19.8 },
  ], 30);
  const meta = { hasAudio: true, fps: 30, duration: 20 };
  const r = await remuxByKeepSegments(src, dir, meta, keep, () => {}, 'cut', { maxSpan: 3 });

  const out = flashesAndBeeps(r.output);
  assert.equal(out.frames, Math.round(keptDuration(keep) * 30), 'número exato de frames');
  // Cada piscada inteira que ficou no corte cai onde o remap das legendas diz.
  const esperado = [];
  for (let k = 0; k < 20; k++) {
    const t = k + 0.5;
    if (keep.some((s) => s.start <= t && t + 0.1 <= s.end)) esperado.push(remapTime(t, keep));
  }
  assert.ok(esperado.length >= 10);
  for (const t of esperado) {
    const f = out.flashes.find((x) => Math.abs(x - t) < 0.06);
    const b = out.beeps.find((x) => Math.abs(x - t) < 0.06);
    assert.ok(f != null, `piscada em ${t.toFixed(3)} (achadas: ${out.flashes.map((x) => x.toFixed(3))})`);
    assert.ok(b != null, `apito em ${t.toFixed(3)} (achados: ${out.beeps.map((x) => x.toFixed(3))})`);
    assert.ok(Math.abs(f - b) <= 0.035, `som e imagem juntos em ${t.toFixed(3)}: imagem ${f}, som ${b}`);
  }
  // duração do áudio ≈ do vídeo
  const dur = (sel) => Number(spawnSync(ffprobePath, ['-v', 'error', '-select_streams', sel, '-show_entries', 'stream=duration', '-of', 'csv=p=0', r.output], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(dur('a:0') - dur('v:0')) < 0.05, `áudio ${dur('a:0')} × vídeo ${dur('v:0')}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
