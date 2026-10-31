import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYoutubeUrl, friendlyYtError, titleToFilename } from '../src/pipeline/youtube.js';

test('link do YouTube: aceita vídeo, Shorts, live, youtu.be e embed (url canônica)', () => {
  const id = 'dQw4w9WgXcQ';
  const canon = `https://www.youtube.com/watch?v=${id}`;
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PL123&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${id}`,
    `youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/shorts/${id}?feature=share`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `  https://music.youtube.com/watch?v=${id}  `,
  ]) assert.deepEqual(parseYoutubeUrl(u), { id, url: canon }, u);
});

test('link do YouTube: recusa o que não é vídeo do YouTube', () => {
  for (const u of [
    '', 'abc', 'https://vimeo.com/123456', 'https://www.youtube.com/', 'https://www.youtube.com/@canal',
    'https://www.youtube.com/playlist?list=PL123', 'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=curto',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ;rm', 'file:///etc/passwd', 'javascript:alert(1)',
  ]) assert.equal(parseYoutubeUrl(u), null, u);
});

test('erros do yt-dlp viram mensagens claras', () => {
  assert.match(friendlyYtError('ERROR: [youtube] x: Sign in to confirm you’re not a bot'), /bloqueou/);
  assert.match(friendlyYtError('ERROR: [youtube] x: Private video. Sign in if you\'ve been granted access'), /privado/);
  assert.match(friendlyYtError('ERROR: [youtube] x: Video unavailable'), /indisponível/);
  assert.match(friendlyYtError('ERROR: [youtube] x: algo estranho'), /algo estranho/);
});

test('título do vídeo vira nome de arquivo seguro', () => {
  assert.equal(titleToFilename('Podcast #12: "IA" / negócios?'), 'Podcast #12 IA negócios.mp4');
  assert.equal(titleToFilename(''), 'Vídeo do YouTube.mp4');
});
