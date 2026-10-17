import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDownloads } from '../src/routes/public.js';

const rel = (tag, names, extra = {}) => ({ tag_name: tag, published_at: '2026-10-01', assets: names.map((name) => ({ name, size: 100, browser_download_url: `https://x/${tag}/${name}` })), ...extra });

test('download: para cada sistema, o instalador mais novo que já existe', () => {
  const p = pickDownloads([
    // build mais novo ainda sem os instaladores de Mac (terminam depois)
    rel('riseframe-v0.142.0', ['Riseframe-Setup-0.142.0.exe', 'Riseframe-Portatil-0.142.0.exe', 'riseframe-site-hostinger.zip']),
    rel('riseframe-v0.141.0', ['Riseframe-Setup-0.141.0.exe', 'Riseframe-0.141.0-arm64.dmg', 'Riseframe-0.141.0-x64.dmg']),
    rel('riseframe-v0.150.0', ['Riseframe-Setup-0.150.0.exe'], { draft: true }),
    rel('outro-v9', ['Riseframe-Setup-9.0.0.exe']),
  ]);
  assert.equal(p.win.version, '0.142.0');
  assert.equal(p.winPortable.name, 'Riseframe-Portatil-0.142.0.exe');
  assert.equal(p.macArm.version, '0.141.0');
  assert.equal(p.macIntel.url, 'https://x/riseframe-v0.141.0/Riseframe-0.141.0-x64.dmg');
  assert.deepEqual(pickDownloads([]), {});
});
