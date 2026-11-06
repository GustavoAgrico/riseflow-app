import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markEditNotes, applyEditNotes, normWord } from '../src/pipeline/editNotes.js';
import { parseSceneScores, sceneStats, cameraStats, closestCurve } from '../src/pipeline/refAnalyze.js';
import { parseOptions } from '../src/routes/jobs.js';
import {
  QUESTIONS, activeQuestions, suggestFor, completeAnswers, planFlow, profileToOptions, synthesizeReferences, applyLearning, LEARNING_PRESETS,
} from '../../shared/editFlow.js';

// transcrição com uma palavra a cada 0,4 s
function tr(...sentences) {
  let t = 0;
  return {
    segments: sentences.map((s) => {
      const words = s.split(' ').map((w) => {
        const x = { start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), word: w };
        t += 0.4;
        return x;
      });
      return { start: words[0].start, end: words[words.length - 1].end, text: s, words };
    }),
  };
}
const removed = (t) => t.segments.flatMap((s) => s.words).filter((w) => w.removed).map((w) => w.word);

test('nota falada: o trecho entre abertura e fechamento sai e o texto vai para o relatório', () => {
  const src = tr('Oi pessoal hoje vamos falar', 'Nota de edição, usa o take anterior, fim da nota.', 'E aí começou');
  const { transcript, notes } = markEditNotes(src);
  assert.deepEqual(removed(transcript), ['Nota', 'de', 'edição,', 'usa', 'o', 'take', 'anterior,', 'fim', 'da', 'nota.']);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'usa o take anterior');
  assert.equal(notes[0].closed, true);
  // não muta a original
  assert.equal(removed(src).length, 0);
});

test('nota falada: aceita "nota da edição" e frases próprias, atravessando frases', () => {
  const a = markEditNotes(tr('nota da edicao corta', 'essa parte fim da nota', 'segue'));
  assert.equal(a.notes[0].text, 'corta essa parte');
  assert.equal(removed(a.transcript).includes('segue'), false);
  const b = markEditNotes(tr('ok editor tira o zoom aqui pronto editor e seguimos'), { open: 'ok editor', close: 'pronto editor' });
  assert.equal(b.notes[0].text, 'tira o zoom aqui');
  assert.deepEqual(removed(b.transcript), ['ok', 'editor', 'tira', 'o', 'zoom', 'aqui', 'pronto', 'editor']);
});

test('nota falada sem fechamento vai só até o fim da frase; duas notas seguidas', () => {
  const r = markEditNotes(tr('nota de edição usa esse take', 'aqui a fala continua normal', 'nota de edição outra coisa fim da nota', 'fim'));
  assert.equal(r.notes.length, 2);
  assert.equal(r.notes[0].closed, false);
  assert.equal(r.notes[0].text, 'usa esse take');
  assert.equal(removed(r.transcript).includes('continua'), false);
  assert.equal(r.notes[1].text, 'outra coisa');
});

test('nota falada: desligada não mexe; normWord tira acento e pontuação', () => {
  const src = tr('nota de edição x fim da nota');
  assert.equal(applyEditNotes(src, {}).transcript, src);
  assert.equal(normWord('Edição,'), 'edicao');
});

test('parseOptions: notas faladas validadas', () => {
  const o = parseOptions({ editNotes: true, editNoteOpen: '  ok   editor ', editNoteClose: 'x' });
  assert.equal(o.editNotes, true);
  assert.equal(o.editNoteOpen, 'ok editor');
  assert.equal(o.editNoteClose, 'fim da nota'); // curta demais → padrão
  assert.equal(parseOptions({}).editNotes, false);
});

test('referência: cortes de cena e atividade a partir do metadata=print', () => {
  const lines = [];
  for (let i = 0; i < 150; i++) {
    const t = i / 15;
    const score = i === 45 || i === 90 ? 0.8 : 0.01;
    lines.push(`frame:${i} pts:${i} pts_time:${t}`, `lavfi.scene_score=${score}`);
  }
  const s = sceneStats(parseSceneScores(lines.join('\n')), 10);
  assert.deepEqual(s.cuts, [3, 6]);
  assert.equal(s.shots, 3);
  assert.equal(s.avgShot, 3.33);
  assert.equal(s.cutsPerMin, 12);
  assert.equal(s.activity, 0.01);
});

test('referência: câmera acha punch (rápido) e aproximação lenta, e a curva', () => {
  const fps = 15;
  const samples = [];
  for (let i = 0; i < 150; i++) {
    let s = 1;
    if (i >= 15 && i < 18) s = Math.exp(Math.log(1.15) / 3); // punch de 15% em 0,2 s
    if (i >= 60 && i < 90) s = Math.exp(Math.log(1.1) / 30); // 10% em 2 s
    samples.push({ t: i / fps, s, tx: 0, ty: 0, ok: true });
  }
  const c = cameraStats(samples, fps);
  assert.equal(c.available, true);
  assert.equal(c.punches, 1);
  assert.equal(c.pushes, 1);
  assert.ok(Math.abs(c.punchZoom - 0.15) < 0.005);
  assert.equal(c.curve, 'linear');
  assert.equal(cameraStats([{ s: 1, ok: false }], fps).available, false);
  // progresso que chega rápido e assenta = curva suave na chegada
  assert.equal(closestCurve([0.49, 0.78, 0.94, 1]), 'out');
});

test('entrevista: sugestões dependem do tipo de vídeo; câmera parada esconde a força', () => {
  assert.equal(suggestFor('cutPace', { videoType: 'reels' }), 'apertado');
  assert.equal(suggestFor('cutPace', { videoType: 'podcast' }), 'respirado');
  assert.equal(activeQuestions({ camera: 'parada' }).some((q) => q.id === 'cameraStrength'), false);
  assert.equal(activeQuestions({ camera: 'enfases' }).some((q) => q.id === 'cameraStrength'), true);
  const a = completeAnswers({});
  for (const q of activeQuestions(a)) assert.ok(q.options.some((o) => o.id === a[q.id]), q.id);
  assert.equal(QUESTIONS[0].id, 'review'); // a primeira decisão é sempre onde revisa
});

test('plano: adapta as 8 etapas às respostas', () => {
  const ids = (a) => planFlow(a).map((s) => s.id);
  assert.deepEqual(ids({ videoType: 'apresentador', motion: 'enfases', broll: 'sim', camera: 'enfases', sound: 'sutil' }),
    ['iniciar', 'preparar', 'cortes', 'motion-mapa', 'assets', 'motion-render', 'camera', 'sfx', 'render']);
  // sem animação pula mapa/motion; sem B-roll, assets; câmera parada e sem som pulam as suas
  assert.deepEqual(ids({ videoType: 'podcast', motion: 'nenhuma', broll: 'nao', camera: 'parada', sound: 'nenhum' }), ['iniciar', 'preparar', 'cortes', 'render']);
  // reels junta o mapa no motion
  assert.equal(ids({ videoType: 'reels', motion: 'gancho' }).includes('motion-mapa'), false);
  // quem revisa na timeline aprova os cortes; assistindo, só o render
  assert.equal(planFlow({ review: 'timeline' }).find((s) => s.id === 'cortes').review, true);
  assert.equal(planFlow({ review: 'pronto' }).find((s) => s.id === 'cortes').review, false);
});

test('perfil → opções do pipeline (válidas no parseOptions)', () => {
  const o = profileToOptions({ answers: { videoType: 'reels', cutPace: 'apertado', hesitations: 'cortar', notes: 'sim', motion: 'muita', broll: 'sim', camera: 'dinamica', cameraStrength: 'forte', sound: 'forte', faceFollow: 'nao' } });
  assert.equal(o.cutStrength, 'forte');
  assert.equal(o.autoClean, true);
  assert.equal(o.editNotes, true);
  assert.equal(o.kinetic, true);
  assert.equal(o.kineticAmount, 'muitos');
  assert.equal(o.videoMotion, 'dynamic');
  assert.equal(o.transition, 'zoomin');
  assert.equal(o.transitionAt, 'cuts');
  assert.equal(o.reframeTrack, false);
  assert.equal(o.sfxIntensity, 'forte');
  const p = parseOptions(o);
  for (const k of ['cutStrength', 'autoClean', 'editNotes', 'kinetic', 'kineticAmount', 'broll', 'videoMotion', 'motionIntensity', 'transition', 'transitionAt', 'soundEffects', 'sfxIntensity']) {
    assert.deepEqual(p[k], o[k], k);
  }
  const calm = profileToOptions({ answers: { motion: 'nenhuma', camera: 'parada', sound: 'nenhum', cutPace: 'respirado' } });
  assert.equal(calm.kinetic, false);
  assert.equal(calm.videoMotion, 'none');
  assert.equal(calm.soundEffects, false);
  assert.equal(calm.cutBreaths, false);
  assert.deepEqual(profileToOptions(null), {});
});

test('referências → sugestão de perfil com número e origem', () => {
  const m = (avgShot, activity, punchesPerMin, pushesPerMin, punchZoom) => ({ metrics: { duration: 20, avgShot, activity, camera: { available: true, punchesPerMin, pushesPerMin, movingFraction: 0.4, punchZoom } } });
  const s = synthesizeReferences([m(1.5, 0.03, 4, 0, 0.18), m(1.8, 0.04, 3, 0.2, 0.2), m(2.5, 0.02, 2, 0, 0.16)]);
  assert.equal(s.suggest.cutPace, 'apertado');
  assert.equal(s.suggest.camera, 'enfases');
  assert.equal(s.suggest.cameraStrength, 'forte');
  assert.equal(s.suggest.motion, 'gancho');
  assert.ok(s.rules.every((r) => /medido nas refs 1, 2, 3/.test(r.origin)), JSON.stringify(s.rules));
  assert.ok(s.sentences.length >= 2 && s.sentences.length <= 5);
  // sem câmera medida: não sugere câmera
  const noCam = synthesizeReferences([{ metrics: { duration: 10, avgShot: 6, activity: 0.001, camera: { available: false } } }]);
  assert.equal(noCam.suggest.camera, undefined);
  assert.equal(noCam.suggest.cutPace, 'respirado');
  assert.deepEqual(synthesizeReferences([]).rules, []);
});

test('caderno: aplicar um ajuste muda o perfil e registra a origem; no limite não muda', () => {
  const profile = { answers: { camera: 'enfases', cameraStrength: 'medio' }, rules: [] };
  const zoomSofter = LEARNING_PRESETS.find((p) => p.id === 'zoom-softer');
  const r = applyLearning(profile, { id: 'l1', preset: zoomSofter.id, status: 'aberto' }, new Date(2026, 2, 12));
  assert.equal(r.changed, true);
  assert.equal(r.profile.answers.cameraStrength, 'suave');
  assert.equal(r.learning.status, 'aplicado');
  assert.match(r.profile.rules[0].origin, /pedido em 12\/03/);
  const again = applyLearning(r.profile, { id: 'l2', preset: zoomSofter.id, status: 'aberto' });
  assert.equal(again.changed, false);
  assert.equal(again.profile.answers.cameraStrength, 'suave');
});
