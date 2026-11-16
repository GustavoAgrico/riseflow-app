import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

// .zip mínimo (um arquivo), como o do Deno
function makeZip(name, data, method = 8) {
  const body = method === 8 ? zlib.deflateRawSync(data) : data;
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const cdAt = local.length + n.length + body.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12);
  end.writeUInt32LE(cdAt, 16);
  return Buffer.concat([local, n, body, central, n, end]);
}

// O app de PC (Node 20, sem Deno) não tinha motor JavaScript para o yt-dlp: o YouTube
// bloqueava com "confirme que não é um robô". Agora o app baixa o Deno oficial, confere o
// SHA-256 e passa ao yt-dlp. Aqui a "release" é falsa (fetch simulado).
test('sem Deno nem Node 22: baixa o Deno, confere o SHA-256, descompacta e entrega ao yt-dlp', async (t) => {
  if (process.platform === 'win32') return t.skip('script de teste é shell');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-deno-'));
  process.env.DATA_DIR = dir;
  process.env.PATH = '/nonexistent';
  delete process.env.YTDLP_AUTO_DOWNLOAD;
  Object.defineProperty(process.versions, 'node', { value: '20.18.0', configurable: true });
  const fake = Buffer.from('#!/bin/sh\necho deno 2.9.9\n');
  const zip = makeZip('deno', fake);
  const sum = crypto.createHash('sha256').update(zip).digest('hex');
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    // o .sha256sum do Windows vem no formato do PowerShell; o do Linux/Mac, "hash  arquivo"
    const body = String(url).endsWith('.sha256sum') ? Buffer.from(`\r\nAlgorithm : SHA256\r\nHash      : ${sum.toUpperCase()}\r\nPath      : C:\\x\\deno.zip\r\n`) : zip;
    return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
  };
  const yt = await import('../src/pipeline/youtube.js');
  const args = await yt.resolveJsRuntime();
  const bin = path.join(dir, 'cache', 'bin', 'deno');
  assert.deepEqual(args, ['--js-runtimes', `deno:${bin}`]);
  assert.equal(fs.readFileSync(bin, 'utf8'), fake.toString());
  assert.ok(fs.statSync(bin).mode & 0o100, 'executável');
  assert.ok(seen.some((u) => /denoland\/deno\/releases\/latest\/download\/deno-.*\.zip$/.test(u)));
  assert.equal(yt.ytdlpStatus().js.ready, true);
  // guardado: não baixa de novo
  const n = seen.length;
  assert.deepEqual(await yt.resolveJsRuntime(), args);
  assert.equal(seen.length, n);

  // peças puras
  assert.deepEqual(yt.unzipOne(makeZip('pasta/deno.exe', Buffer.from('abc'), 0), 'deno.exe'), Buffer.from('abc'));
  assert.equal(yt.unzipOne(zip, 'outro'), null);
  assert.equal(yt.unzipOne(Buffer.from('não é zip'), 'deno'), null);
  assert.equal(yt.parseSha256(`${sum}  deno-x86_64-unknown-linux-gnu.zip\n`), sum);
  assert.equal(yt.parseSha256('nada'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
