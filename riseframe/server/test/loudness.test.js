import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLoudnorm, loudnessOk, secondPassAf, loudnessTarget, LOUDNESS_TARGETS } from '../src/pipeline/loudness.js';

const STDERR = `[Parsed_loudnorm_0 @ 0x1]
{
\t"input_i" : "-21.37",
\t"input_tp" : "-3.10",
\t"input_lra" : "6.20",
\t"input_thresh" : "-31.60",
\t"output_i" : "-14.02",
\t"output_tp" : "-1.00",
\t"output_lra" : "5.10",
\t"output_thresh" : "-24.20",
\t"normalization_type" : "dynamic",
\t"target_offset" : "0.02"
}`;

test('lê as medidas da 1ª passada do loudnorm', () => {
  assert.deepEqual(parseLoudnorm(STDERR), { I: -21.37, TP: -3.1, LRA: 6.2, thresh: -31.6, offset: 0.02 });
  assert.equal(parseLoudnorm('nada aqui'), null);
});

test('alvo padrão = redes (−14); off desliga', () => {
  assert.equal(loudnessTarget(undefined).I, -14);
  assert.equal(loudnessTarget('podcast').I, -16);
  assert.equal(loudnessTarget('off'), null);
});

test('não recodifica quando já está no alvo, nem em silêncio', () => {
  const t = LOUDNESS_TARGETS.social;
  assert.equal(loudnessOk({ I: -14.3, TP: -1.2 }, t), true);
  assert.equal(loudnessOk({ I: -21, TP: -3 }, t), false);
  assert.equal(loudnessOk({ I: -14, TP: 0.5 }, t), false); // estoura o pico
  assert.equal(loudnessOk({ I: -70, TP: -60 }, t), true);
});

test('2ª passada em modo linear com as medidas', () => {
  const af = secondPassAf(parseLoudnorm(STDERR), LOUDNESS_TARGETS.social);
  assert.match(af, /^loudnorm=I=-14:TP=-1:LRA=11:measured_I=-21.37:measured_TP=-3.1:measured_LRA=6.2:measured_thresh=-31.6:offset=0.02:linear=true/);
});
