import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tmpDir } from '../testkit/tmp.js';

// "YouTube bloqueou o download (pediu login)": em vez de desistir na 1ª, o app tenta de
// novo com outros clientes do YouTube. O yt-dlp aqui é um script falso que só responde ao
// 2º jeito.
test('YouTube pede login: tenta com outros clientes e baixa; outro erro não repete', async (t) => {
  if (process.platform === 'win32') return t.skip('script de teste é shell');
  const dir = tmpDir('rf-ytbot-');
  const calls = path.join(dir, 'calls.log');
  const bin = path.join(dir, 'yt-dlp');
  fs.writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$*" in *--version*) echo 2099.01.01; exit 0;; esac
case "$*" in *PRIVADO*) echo "ERROR: [youtube] x: Private video. Sign in if you've been granted access" >&2; exit 1;; esac
case "$*" in
  *player_client=tv,web_safari,mweb*) ;;
  *) echo "ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication." >&2; exit 1;;
esac
case "$*" in *--dump-single-json*) echo '{"id":"x","title":"Meu vídeo","duration":12}'; exit 0;; esac
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
printf 'video' > "$(echo "$out" | sed 's/%(ext)s/mp4/')"
`, { mode: 0o755 });
  process.env.DATA_DIR = dir;
  process.env.YTDLP_BIN = bin;
  process.env.YTDLP_AUTO_DOWNLOAD = '0';
  process.env.PATH = `/nonexistent:/bin:/usr/bin`;
  const yt = await import('../src/pipeline/youtube.js');
  const out = path.join(dir, 'up', 'v.mp4');
  const r = await yt.downloadYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ', out);
  assert.equal(r.title, 'Meu vídeo');
  assert.equal(fs.readFileSync(out, 'utf8'), 'video');
  const log = fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l && !l.includes('--version'));
  assert.ok(!log[0].includes('player_client'), '1ª tentativa: normal');
  assert.ok(log.some((l) => l.includes('player_client=tv,web_safari,mweb') && l.includes('--dump-single-json')));
  assert.ok(log.at(-1).includes('player_client=tv,web_safari,mweb') && log.at(-1).includes('-o '), 'o download usa o mesmo jeito que funcionou');

  // erro que não é bloqueio (vídeo privado): uma tentativa só, com a mensagem certa
  fs.writeFileSync(calls, '');
  await assert.rejects(() => yt.downloadYoutube('https://www.youtube.com/watch?v=PRIVADO0000', path.join(dir, 'up', 'p.mp4')), /privado/);
  assert.equal(fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean).length, 1);

  assert.equal(yt.isBotBlock('ERROR: Sign in to confirm you’re not a bot'), true);
  assert.equal(yt.isBotBlock('ERROR: Video unavailable'), false);
  assert.match(yt.friendlyYtError('Sign in to confirm you’re not a bot'), /a partir do servidor/);
  fs.rmSync(dir, { recursive: true, force: true });
});
