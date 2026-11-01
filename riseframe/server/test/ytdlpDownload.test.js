import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Sem yt-dlp no sistema (como no app de PC): o servidor baixa o executável oficial,
// confere o SHA-256 e passa a usar. Aqui a "release" é falsa (fetch simulado).
test('sem yt-dlp instalado: baixa o executável, confere o SHA-256 e usa', async (t) => {
  if (process.platform === 'win32') return t.skip('script de teste é shell');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-ytdlp-'));
  process.env.DATA_DIR = dir;
  process.env.PATH = '/nonexistent';
  process.env.PYTHON_BIN = '/nonexistent/python';
  delete process.env.YTDLP_BIN;
  const fake = Buffer.from('#!/bin/sh\necho 2099.01.01\n');
  const asset = process.platform === 'darwin' ? 'yt-dlp_macos' : process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  const sum = crypto.createHash('sha256').update(fake).digest('hex');
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    const body = String(url).endsWith('SHA2-256SUMS') ? Buffer.from(`deadbeef  outro\n${sum}  ${asset}\n`) : fake;
    return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
  };
  const yt = await import('../src/pipeline/youtube.js');
  assert.equal(yt.ytdlpAvailableNow(), true); // responde na hora, enquanto procura
  const tool = await yt.resolveYtDlp();
  assert.ok(tool, 'achou o yt-dlp');
  assert.equal(tool.bin, path.join(dir, 'cache', 'bin', 'yt-dlp'));
  assert.ok(seen.some((u) => u.endsWith(`/${asset}`)));
  assert.equal(yt.ytdlpStatus().ready, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
