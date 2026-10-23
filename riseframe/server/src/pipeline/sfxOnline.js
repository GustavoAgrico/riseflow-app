// Biblioteca online de efeitos sonoros (como a do CapCut): busca no Freesound, só sons de
// licença CC0 (domínio público — dá para usar sem dar crédito). A chave (FREESOUND_API_KEY)
// fica só no servidor; o app de PC busca pela conta do site.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeLogger } from '../logger.js';

const log = makeLogger('sfx-online');

export const freesoundKey = () => process.env.FREESOUND_API_KEY || '';
/** Só as prévias do Freesound (o servidor nunca baixa outro endereço). */
export const okSfxUrl = (u) => typeof u === 'string' && /^https:\/\/(cdn\.)?freesound\.org\/(data\/)?previews\/[\w/.-]+\.mp3$/.test(u);

/** Busca sons CC0 de até 20 s. → [{ id, name, dur, preview, tags }] */
export async function searchFreesound(query, { page = 1, key = freesoundKey() } = {}) {
  if (!key) throw new Error('biblioteca online de sons desligada (falta a chave do Freesound no servidor)');
  const q = String(query || '').trim().slice(0, 80) || 'whoosh';
  const u = new URL('https://freesound.org/apiv2/search/text/');
  u.searchParams.set('query', q);
  u.searchParams.set('filter', 'license:"Creative Commons 0" duration:[0 TO 20]');
  u.searchParams.set('fields', 'id,name,duration,previews,tags');
  u.searchParams.set('page_size', '24');
  u.searchParams.set('page', String(Math.max(1, Math.min(20, Number(page) || 1))));
  u.searchParams.set('token', key);
  const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Freesound respondeu ${r.status}`);
  const data = await r.json();
  return (data.results || []).map((x) => ({
    id: x.id,
    name: String(x.name || '').replace(/\.(wav|mp3|aif+|flac|ogg)$/i, '').slice(0, 80),
    dur: +Number(x.duration || 0).toFixed(2),
    preview: x.previews?.['preview-hq-mp3'] || x.previews?.['preview-lq-mp3'] || '',
    tags: (x.tags || []).slice(0, 6),
  })).filter((x) => okSfxUrl(x.preview));
}

/** Arquivo local do som (baixado uma vez para o cache). null se o endereço não vale. */
export async function onlineSfxFile(url, cacheDir) {
  if (!okSfxUrl(url)) return null;
  const dir = path.join(cacheDir, 'sfx-online');
  const file = path.join(dir, `${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}.mp3`);
  try {
    await fs.access(file);
    return file;
  } catch { /* ainda não baixado */ }
  await fs.mkdir(dir, { recursive: true });
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`não deu para baixar o som (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('som grande demais');
  await fs.writeFile(file, buf);
  log.ok(`som da biblioteca online: ${path.basename(url)}`);
  return file;
}
