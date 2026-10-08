import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { envelopeFrom, fitPausesToAudio, wordGapRanges } from '../src/pipeline/cutRefine.js';
import { speedFilters, finalRender } from '../src/pipeline/render.js';
import { runFfmpeg, probeSummary } from '../src/pipeline/ffmpeg.js';

function env(duration, parts, base = -90) {
  const db = new Float32Array(Math.round(duration / 0.01)).fill(base);
  for (const [s, e, v] of parts) for (let i = Math.round(s / 0.01); i < Math.round(e / 0.01); i++) db[i] = v;
  return envelopeFrom(db);
}

test('respiração entre as frases sai junto com a pausa (e fica com o limiar comum)', () => {
  // fala até 1.0 · inspiração (-40 dB, 32 dB abaixo da voz) colada na próxima frase (1.45 → 1.85)
  const e = env(4, [[0.2, 1.0, -8], [1.45, 1.85, -40], [1.85, 3.0, -8]]);
  const pause = [{ start: 1.02, end: 1.83 }];
  const [comum] = fitPausesToAudio(pause, e);
  const [resp] = fitPausesToAudio(pause, e, { breaths: true, maxShift: 0.2, tail: 0.03, preroll: 0.04 });
  // limiar comum: a respiração conta como som → o corte para antes dela
  assert.ok(comum.end <= 1.5, `comum termina em ${comum.end}`);
  // com corte de respirações: o corte vai até perto da próxima palavra
  assert.ok(resp.end >= 1.75, `respiração cortada até ${resp.end}`);
  assert.ok(resp.end <= 1.85, 'não invade a próxima palavra');
});

test('vãos entre palavras viram faixas de corte (início, meio e fim)', () => {
  const t = { segments: [{ words: [
    { start: 0.5, end: 1.0, word: 'a' }, { start: 1.1, end: 1.5, word: 'b' },
    { start: 2.0, end: 2.4, word: 'c', removed: true }, { start: 2.6, end: 3.0, word: 'd' },
  ] }] };
  const g = wordGapRanges(t, { minGap: 0.3, duration: 4 });
  assert.deepEqual(g.map((r) => [r.start, r.end]), [[0, 0.5], [1.5, 2.6], [3.0, 4]]);
});

test('velocidade: filtros só quando diferente de 1×, com fps mantido e voz sem mudar o tom', () => {
  assert.equal(speedFilters(1, 30), null);
  assert.equal(speedFilters(undefined, 30), null);
  const f = speedFilters(1.25, 29.97);
  assert.equal(f.vf, 'setpts=PTS/1.25,fps=29.97');
  assert.equal(f.af, 'atempo=1.25');
  assert.equal(speedFilters(5, 30).k, 2); // limite
});

test('render final em 1,5× encurta o vídeo e o áudio na mesma proporção', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-speed-'));
  const src = path.join(dir, 'in.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', src], { label: 'teste' });
  const meta = await probeSummary(src);
  const r = await finalRender(src, dir, 'out', meta, { aspect: 'original', speed: 1.5 }, () => {});
  const out = await probeSummary(r.output);
  assert.ok(Math.abs(out.duration - 2) < 0.15, `duração ${out.duration} (esperado ~2s)`);
  assert.ok(out.hasAudio);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('áudio real: a inspiração antes da frase é cortada só com "remover respirações"', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-breath-'));
  const wav = path.join(dir, 'fala.wav');
  // "fala" (tom alto) 0–1 s · silêncio · "respiração" (ruído baixo, ~30 dB abaixo) 1.4–1.85 s · "fala" 1.85–3 s
  await runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3:sample_rate=16000', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.03:duration=3:sample_rate=16000:seed=42',
    '-filter_complex', "[0:a]volume='if(lt(t,1)+gte(t,1.85),0.9,0)':eval=frame[s];[1:a]volume='if(between(t,1.4,1.85),1,0)':eval=frame[n];[s][n]amix=inputs=2:normalize=0[a]",
    '-map', '[a]', '-y', wav], { label: 'teste' });
  const transcript = { segments: [{ words: [{ start: 0.05, end: 1.0, word: 'oi' }, { start: 1.87, end: 2.9, word: 'tudo' }] }] };
  const { preciseRemovals } = await import('../src/pipeline/cutRefine.js');
  const pauses = wordGapRanges(transcript, { minGap: 0.3, duration: 3 }).filter((r) => r.start > 0.5 && r.end < 2.95);
  const sum = (rs) => rs.reduce((a, r) => a + (r.end - r.start), 0);
  const comum = await preciseRemovals(wav, { pauses, transcript });
  const resp = await preciseRemovals(wav, { pauses, transcript, breaths: true });
  const fimResp = Math.max(...resp.pauses.map((r) => r.end));
  assert.ok(fimResp >= 1.72, `o corte vai até perto da próxima palavra (${fimResp})`);
  assert.ok(sum(resp.pauses) > sum(comum.pauses) + 0.2, `corta mais (${sum(resp.pauses).toFixed(2)}s vs ${sum(comum.pauses).toFixed(2)}s)`);
  fs.rmSync(dir, { recursive: true, force: true });
});
