import { test } from 'node:test';
import assert from 'node:assert/strict';

const seg = (words) => ({ start: words[0][0], end: words[words.length - 1][1], text: words.map((w) => w[2]).join(' '), words: words.map(([start, end, word]) => ({ start, end, word })) });

test('fala da montagem: recorta e desloca as palavras de um trecho', async () => {
  const { sliceSegments } = await import('../src/pipeline/seqTranscript.js');
  const src = [seg([[1, 1.5, 'oi'], [1.6, 2, 'tudo'], [5, 5.5, 'bem']])];
  const out = sliceSegments(src, 1.5, 6, 10); // o trecho 1,5–6 s entra em 10 s → desloca +10
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].words.map((w) => [w.start, w.end, w.word]), [[11.6, 12, 'tudo'], [15, 15.5, 'bem']]);
  assert.equal(out[0].start, 11.6);
  assert.equal(out[0].text, 'tudo bem');
});

test('fala da montagem: reaproveita o vídeo que já estava e não transcreve o clipe novo ("só colocar")', async () => {
  const { sequenceTranscript } = await import('../src/pipeline/seqTranscript.js');
  const job = {
    sequence: {
      transcribeNew: false,
      clips: [
        { kind: 'video', mediaId: 'novo_sem_fala', in: 0, out: 4 }, // clipe novo: 0–4 s
        { kind: 'video', sourceId: 'antigo', in: 2, out: 6, words: [seg([[1, 1.5, 'fora'], [2.5, 3, 'dentro'], [5, 5.4, 'também']])] }, // entra em 4 s
      ],
    },
  };
  const r = await sequenceTranscript(job, '/nao/existe.mp4', '/tmp', { duration: 8, hasAudio: true });
  assert.equal(r.reused, 1);
  assert.deepEqual(r.untranscribed, [[0, 4]]);
  assert.deepEqual(r.segments.flatMap((s) => s.words.map((w) => [w.start, w.word])), [[4.5, 'dentro'], [7, 'também']]);
});
