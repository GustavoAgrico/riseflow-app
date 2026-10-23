import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSfxMix } from '../src/pipeline/sfx.js';

test('buildSfxMix: nenhum evento → null', () => {
  assert.equal(buildSfxMix([]), null);
  assert.equal(buildSfxMix(null), null);
  assert.equal(buildSfxMix([{ t: -1, type: 'pop' }, { t: 1, type: 'x' }]), null);
});

test('buildSfxMix: posiciona cada SFX no tempo certo e mixa mantendo o original', () => {
  const r = buildSfxMix([{ t: 1, type: 'pop' }, { t: 0.5, type: 'whoosh' }], { intensity: 'medio' });
  assert.ok(r);
  // ordenado por tempo: whoosh(0.5s) vira input 1, pop(1s) vira input 2
  assert.deepEqual(r.order, ['whoosh', 'pop']);
  // o whoosh começa 0,3 s antes do momento para "chegar" nele
  assert.ok(r.filter.includes('[1:a]adelay=200|200'), 'whoosh começa em 200ms');
  assert.ok(r.filter.includes('[2:a]adelay=1000|1000'), 'pop em 1000ms');
  // original + 2 eventos = 3 inputs no amix, sem normalizar (mantém volume original)
  assert.ok(r.filter.includes('amix=inputs=3:normalize=0'), 'amix com 3 entradas');
  assert.ok(r.filter.includes('alimiter'), 'limitador contra clipping');
  assert.ok(r.filter.endsWith('[aout]'), 'saída rotulada [aout]');
});

test('buildSfxMix: volume varia com a intensidade e respeita o teto de eventos', () => {
  const suave = buildSfxMix([{ t: 0, type: 'pop' }], { intensity: 'suave' });
  const forte = buildSfxMix([{ t: 0, type: 'pop' }], { intensity: 'forte' });
  assert.ok(suave.filter.includes('volume=0.18'), 'pop suave mais baixo');
  assert.ok(forte.filter.includes('volume=0.5'), 'pop forte mais alto');

  const many = Array.from({ length: 200 }, (_, i) => ({ t: i * 0.1, type: 'pop' }));
  const capped = buildSfxMix(many, { max: 80 });
  assert.ok(capped.order.length === 80, 'limita a quantidade de eventos');
});

test('teclas da legenda: uma faixa só (WAV) entra como mais uma entrada do mix', async () => {
  const { tickTrackWav } = await import('../src/pipeline/sfx.js');
  const wav = tickTrackWav([0.1, 0.12, 0.5], 1);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  // pico em 10 ms a partir de t
  const at = (t) => {
    let m = 0;
    for (let i = 0; i < 441; i++) m = Math.max(m, Math.abs(wav.readInt16LE(44 + (Math.round(t * 44100) + i) * 2)));
    return m;
  };
  assert.ok(at(0.1) > 2000 && at(0.5) > 2000, 'tem tecla nos tempos');
  assert.equal(at(0.3), 0, 'silêncio entre as teclas');
  const mix = buildSfxMix([{ t: 1, type: 'whoosh' }], { tickTrack: true });
  assert.deepEqual(mix.order, ['whoosh', 'ticks']);
  assert.match(mix.filter, /\[2:a\]aformat=channel_layouts=stereo,volume=[\d.]+\[ticks\]/);
  assert.match(mix.filter, /amix=inputs=3/);
  assert.ok(buildSfxMix([], { tickTrack: true }), 'só cliques também mixa');
});

test('teclas gravadas: carrega os WAVs de assets/sfx e usa no lugar do som sintético', async () => {
  const { tickTrackWav, loadKeySamples } = await import('../src/pipeline/sfx.js');
  const samples = await loadKeySamples();
  assert.ok(samples.length >= 4, 'tem as teclas do teclado empacotadas');
  assert.ok(samples.every((f) => f.length > 1000 && f.length < 44100 * 0.2), 'cada tecla é curtinha');
  const wav = tickTrackWav([0.2, 0.6], 1, { samples, gain: 0.6 });
  let pk = 0;
  for (let i = 0; i < 4410; i++) pk = Math.max(pk, Math.abs(wav.readInt16LE(44 + (Math.round(0.2 * 44100) + i) * 2)));
  assert.ok(pk > 32767 * 0.3, 'a tecla aparece com força');
});

test('buildSfxMix: biblioteca — riser começa antes do momento, tipos desconhecidos saem', () => {
  const r = buildSfxMix([{ t: 3, type: 'riser' }, { t: 2, type: 'shutter' }, { t: 1, type: 'nao-existe' }]);
  assert.deepEqual(r.order, ['riser', 'shutter']); // riser começa em 1,5 s, antes do shutter (2 s)
  assert.ok(r.filter.includes('[1:a]adelay=1500|1500'));
  assert.ok(r.filter.includes('[2:a]adelay=2000|2000'));
});

test('buildSfxMix: som da biblioteca online entra como arquivo, sem adiantamento', () => {
  const r = buildSfxMix([{ t: 1.5, type: 'online', file: '/tmp/x/som.mp3', volume: 0.5 }, { t: 0.5, type: 'pop' }]);
  assert.deepEqual(r.order, ['pop', 'file:/tmp/x/som.mp3']);
  assert.ok(r.filter.includes('[2:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=1500|1500'), 'arquivo no tempo exato');
  // tipo desconhecido sem arquivo continua fora
  assert.equal(buildSfxMix([{ t: 1, type: 'online' }]), null);
});

test('sfxOnline: só aceita prévias do Freesound', async () => {
  const { okSfxUrl } = await import('../src/pipeline/sfxOnline.js');
  assert.ok(okSfxUrl('https://cdn.freesound.org/previews/123/123456_789-hq.mp3'));
  assert.ok(okSfxUrl('https://freesound.org/data/previews/1/1_2-lq.mp3'));
  assert.ok(!okSfxUrl('https://evil.com/previews/1.mp3'));
  assert.ok(!okSfxUrl('https://cdn.freesound.org/previews/../../etc/passwd.mp3'.replace('..', '%2e%2e')));
  assert.ok(!okSfxUrl('http://cdn.freesound.org/previews/1/1.mp3'));
  assert.ok(!okSfxUrl('https://cdn.freesound.org.evil.com/previews/1/1.mp3'));
});
