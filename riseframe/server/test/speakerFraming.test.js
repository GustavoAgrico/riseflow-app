import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { analyzePeople, speakerShots, buildStepExpr, personRegion, splitVf } from '../src/pipeline/reframe.js';

/** Saída sintética do rastreador: duas pessoas (x 0,28 e 0,72), quem fala mexe a boca. */
function podcast(schedule, { duration = 20, fps = 5, missing = 0 } = {}) {
  const samples = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < duration * fps; i++) {
    const t = i / fps;
    const who = schedule.find(([a, b]) => t >= a && t < b)?.[2];
    const faces = [];
    [0.28, 0.72].forEach((x, k) => {
      if (rnd() < missing) return;
      const talking = who === k;
      faces.push({ x: x + (rnd() - 0.5) * 0.01, y: 0.4, w: 0.085, h: 0.15, act: talking ? 0.02 + rnd() * 0.05 : rnd() * 0.004 });
    });
    samples.push({ t, faces: faces.sort(() => rnd() - 0.5) });
  }
  return { inW: 1920, inH: 1080, duration, points: [{ t: 0, x: 0.5, y: 0.4, src: 'face' }], samples };
}

test('duas pessoas lado a lado: separa esquerda e direita, mesmo com rostos falhando', () => {
  const p = analyzePeople(podcast([[0, 20, 0]], { missing: 0.25 }));
  assert.equal(p.count, 2);
  assert.ok(Math.abs(p.people[0].x - 0.28) < 0.01 && Math.abs(p.people[1].x - 0.72) < 0.01);
  assert.ok(p.people[0].series.length > 50);
});

test('uma pessoa (ou um rosto pequeno no fundo) não vira podcast', () => {
  const one = { samples: Array.from({ length: 40 }, (_, i) => ({ t: i / 5, faces: [{ x: 0.5, y: 0.4, w: 0.2, h: 0.3, act: 0 }] })) };
  assert.equal(analyzePeople(one).count, 1);
  const bg = { samples: one.samples.map((s) => ({ ...s, faces: [...s.faces, { x: 0.9, y: 0.3, w: 0.04, h: 0.06, act: 0 }] })) };
  assert.equal(analyzePeople(bg).count, 1, 'rosto minúsculo ao fundo não conta');
  assert.equal(analyzePeople({ samples: [] }), null);
});

test('quem fala: as tomadas seguem a conversa e trocam quando a outra pessoa começa', () => {
  const plan = [[0, 6, 0], [6, 12, 1], [12, 16, 0], [16, 20, 1]];
  const { people } = analyzePeople(podcast(plan));
  const shots = speakerShots(people, 20);
  assert.deepEqual(shots.map((s) => s.who), [0, 1, 0, 1]);
  for (const [i, [a]] of plan.entries()) assert.ok(Math.abs(shots[i].start - a) <= 0.5, `troca em ${shots[i].start} (esperado ${a})`);
  assert.equal(shots.at(-1).end, 20);
});

test('quem fala: interjeições curtas ("aham") não fazem a câmera pular', () => {
  // a pessoa 1 fala 0,6 s no meio da fala da 0
  const { people } = analyzePeople(podcast([[0, 7, 0], [7, 7.6, 1], [7.6, 20, 0]]));
  const shots = speakerShots(people, 20);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].who, 0);
});

test('quem fala: tomadas têm duração mínima', () => {
  const plan = [];
  for (let t = 0; t < 20; t += 1.5) plan.push([t, t + 1.5, (t / 1.5) % 2]);
  const { people } = analyzePeople(podcast(plan));
  const shots = speakerShots(people, 20, { minShot: 3 });
  for (const s of shots.slice(0, -1)) assert.ok(s.end - s.start >= 3 - 1e-6, `tomada de ${s.end - s.start}s`);
});

test('expressão em degraus: valor fixo em cada tomada, com trava', () => {
  const e = buildStepExpr([{ t: 0, val: 100 }, { t: 6, val: 2400 }, { t: 12, val: 120 }], 0, 2333);
  assert.equal(e, 'if(lt(t,6),100,if(lt(t,12),2333,120))');
  assert.equal(buildStepExpr([{ t: 0, val: 50 }], 0, 10), '10');
});

test('tela dividida: cada metade recortada no rosto da pessoa, dentro do quadro', () => {
  const p = { x: 0.28, y: 0.4, w: 0.085, h: 0.15 };
  const r = personRegion(p, 1920, 1080, 1080 / 960);
  assert.ok(Math.abs(r.w / r.h - 1080 / 960) < 0.02);
  assert.ok(r.x >= 0 && r.x + r.w <= 1920 && r.y >= 0 && r.y + r.h <= 1080);
  assert.ok(Math.abs(r.x + r.w / 2 - 0.28 * 1920) < 2, 'rosto no centro horizontal');
  assert.ok(r.h < 1080 * 0.6, 'aproxima (cabeça e ombros), sem pegar a outra pessoa');
  // rosto na borda: o recorte para no limite do vídeo
  const edge = personRegion({ ...p, x: 0.02 }, 1920, 1080, 1080 / 960);
  assert.equal(edge.x, 0);
});

test('tela dividida: o filtro gera o quadro vertical com as duas pessoas', () => {
  const people = [{ x: 0.28, y: 0.4, w: 0.085, h: 0.15 }, { x: 0.72, y: 0.4, w: 0.085, h: 0.15 }];
  const vf = splitVf(people, 1920, 1080, { w: 1080, h: 1920 });
  assert.match(vf, /vstack=inputs=2/);
  assert.match(vf, /scale=1080:960/);
  const swapped = splitVf(people, 1920, 1080, { w: 1080, h: 1920 }, { swap: true });
  assert.notEqual(vf, swapped, 'trocar de lugar muda a ordem');
  assert.match(splitVf(people, 1920, 1080, { w: 1920, h: 1080 }), /hstack=inputs=2/);
  // roda de verdade no FFmpeg (fonte sintética 1920x1080)
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=10:duration=1', '-vf', vf, '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr.slice(-400));
  assert.match(r.stderr, /1080x1920/);
});
