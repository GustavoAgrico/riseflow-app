import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { nanoid } from 'nanoid';
import { config } from './config.js';

/**
 * Fontes PRÓPRIAS do usuário (ex.: uma fonte comprada/licenciada, como a Coolvetica):
 * ele envia o .ttf/.otf/.woff e a fonte aparece na lista das legendas. Cada arquivo ganha
 * um nome de família ÚNICO ("RFU <id>") — o libass e o navegador pegam exatamente aquele
 * arquivo (sem confundir com uma fonte do sistema de mesmo nome). O nome que o usuário vê
 * é o da própria fonte ("Coolvetica Regular Italic").
 */
const MAX_BYTES = 20 * 1024 ** 2;
const dirOf = (userId) => path.join(config.paths.data, 'fonts', String(userId).replace(/[^A-Za-z0-9_-]/g, '_'));
const indexOf = (userId) => path.join(dirOf(userId), 'index.json');
const validId = (id) => /^[A-Za-z0-9_-]{8,24}$/.test(String(id || ''));
export const customFamily = (id) => `RFU ${id}`;

function readIndex(userId) {
  try {
    const v = JSON.parse(fs.readFileSync(indexOf(userId), 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeIndex(userId, list) {
  fs.mkdirSync(dirOf(userId), { recursive: true });
  fs.writeFileSync(indexOf(userId), JSON.stringify(list));
}

/** WOFF 1.0 → tabelas; TTF/OTF → tabelas. Lança erro em formato desconhecido. */
export function readTables(buf) {
  const sig = buf.toString('ascii', 0, 4);
  const tables = [];
  if (sig === 'wOFF') {
    const n = buf.readUInt16BE(12);
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20;
      const off = buf.readUInt32BE(o + 4);
      const comp = buf.readUInt32BE(o + 8);
      const orig = buf.readUInt32BE(o + 12);
      const raw = buf.subarray(off, off + comp);
      tables.push({ tag: buf.toString('ascii', o, o + 4), data: comp < orig ? zlib.inflateSync(raw) : Buffer.from(raw) });
    }
    return { flavor: buf.readUInt32BE(4), tables };
  }
  const flavor = buf.readUInt32BE(0);
  if (!(flavor === 0x00010000 || sig === 'OTTO' || sig === 'true')) {
    throw new Error(sig === 'wOF2' ? 'WOFF2 não é aceito — envie o .ttf ou .otf da fonte' : 'arquivo não é uma fonte .ttf/.otf/.woff');
  }
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const off = buf.readUInt32BE(o + 8);
    const len = buf.readUInt32BE(o + 12);
    if (off + len > buf.length) throw new Error('fonte corrompida');
    tables.push({ tag: buf.toString('ascii', o, o + 4), data: Buffer.from(buf.subarray(off, off + len)) });
  }
  return { flavor, tables };
}

/** Nomes da fonte (tabela name): família, estilo e nome completo. */
export function fontNames(tables) {
  const nm = tables.find((t) => t.tag === 'name')?.data;
  const names = {};
  if (!nm) return names;
  const count = nm.readUInt16BE(2);
  const so = nm.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    if (o + 12 > nm.length) break;
    const pid = nm.readUInt16BE(o);
    const id = nm.readUInt16BE(o + 6);
    const len = nm.readUInt16BE(o + 8);
    const raw = nm.subarray(so + nm.readUInt16BE(o + 10), so + nm.readUInt16BE(o + 10) + len);
    if (pid === 3 || pid === 0) {
      let s = '';
      for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k));
      if (!names[id]) names[id] = s;
    } else if (pid === 1 && !names[id]) names[id] = raw.toString('latin1');
  }
  return names;
}

/** Monta o arquivo de novo com a família trocada (e marcado como "Regular"). */
export function renameFont({ flavor, tables }, family) {
  const ps = family.replace(/[^A-Za-z0-9]/g, '');
  const recs = [[1, family], [2, 'Regular'], [3, ps], [4, family], [6, ps]];
  const strs = recs.map(([, s]) => {
    const x = Buffer.alloc(s.length * 2);
    for (let i = 0; i < s.length; i++) x.writeUInt16BE(s.charCodeAt(i), i * 2);
    return x;
  });
  const hdr = Buffer.alloc(6 + 12 * recs.length);
  hdr.writeUInt16BE(0, 0);
  hdr.writeUInt16BE(recs.length, 2);
  hdr.writeUInt16BE(hdr.length, 4);
  let so = 0;
  recs.forEach(([id], i) => {
    const o = 6 + i * 12;
    hdr.writeUInt16BE(3, o);
    hdr.writeUInt16BE(1, o + 2);
    hdr.writeUInt16BE(0x409, o + 4);
    hdr.writeUInt16BE(id, o + 6);
    hdr.writeUInt16BE(strs[i].length, o + 8);
    hdr.writeUInt16BE(so, o + 10);
    so += strs[i].length;
  });
  const list = tables.filter((t) => t.tag !== 'DSIG').map((t) => ({ ...t }));
  const name = list.find((t) => t.tag === 'name');
  if (name) name.data = Buffer.concat([hdr, ...strs]);
  else list.push({ tag: 'name', data: Buffer.concat([hdr, ...strs]) });
  const os2 = list.find((t) => t.tag === 'OS/2')?.data;
  if (os2 && os2.length >= 64) {
    os2.writeUInt16BE(400, 4);
    os2.writeUInt16BE(0x40, 62);
  }
  const head = list.find((t) => t.tag === 'head')?.data;
  if (head && head.length >= 46) head.writeUInt16BE(0, 44);
  const sum = (b) => {
    let s = 0;
    const p = Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
    for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0;
    return s;
  };
  list.sort((a, c) => (a.tag < c.tag ? -1 : 1));
  const n = list.length;
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  const sr = (1 << es) * 16;
  const dir = Buffer.alloc(12 + 16 * n);
  dir.writeUInt32BE(flavor, 0);
  dir.writeUInt16BE(n, 4);
  dir.writeUInt16BE(sr, 6);
  dir.writeUInt16BE(es, 8);
  dir.writeUInt16BE(n * 16 - sr, 10);
  let off = dir.length;
  const bodies = [];
  list.forEach((t, i) => {
    const o = 12 + i * 16;
    dir.write(t.tag, o, 'ascii');
    dir.writeUInt32BE(sum(t.data), o + 4);
    dir.writeUInt32BE(off, o + 8);
    dir.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    bodies.push(t.data, Buffer.alloc(pad));
    off += t.data.length + pad;
  });
  return Buffer.concat([dir, ...bodies]);
}

/** Salva a fonte enviada. → { id, name } */
export function saveCustomFont(userId, buf, originalname = '') {
  if (!buf?.length || buf.length > MAX_BYTES) throw new Error('fonte vazia ou grande demais (máx. 20 MB)');
  const parsed = readTables(buf);
  for (const need of ['cmap', 'hmtx', 'hhea', 'head']) {
    if (!parsed.tables.some((t) => t.tag === need)) throw new Error(`fonte incompleta (sem a tabela ${need})`);
  }
  const names = fontNames(parsed.tables);
  const list = readIndex(userId);
  if (list.length >= 40) throw new Error('limite de 40 fontes próprias — apague alguma antes');
  const id = nanoid(12);
  const ext = parsed.flavor === 0x4f54544f ? '.otf' : '.ttf'; // 'OTTO' = CFF
  const file = `${id}${ext}`;
  fs.mkdirSync(dirOf(userId), { recursive: true });
  fs.writeFileSync(path.join(dirOf(userId), file), renameFont(parsed, customFamily(id)));
  const label = (names[4] || [names[1], names[2]].filter(Boolean).join(' ') || path.parse(originalname).name || 'Minha fonte').slice(0, 60);
  list.push({ id, name: label, file, at: Date.now() });
  writeIndex(userId, list);
  return { id, name: label };
}

export const listCustomFonts = (userId) => readIndex(userId).map(({ id, name }) => ({ id, name, family: customFamily(id) }));

/** Fonte própria → { family, path } (ou null se não existe / não é deste usuário). */
export function resolveCustomFont(userId, id) {
  if (!validId(id)) return null;
  const f = readIndex(userId).find((x) => x.id === id);
  if (!f) return null;
  const p = path.join(dirOf(userId), f.file);
  return fs.existsSync(p) ? { family: customFamily(id), path: p, name: f.name } : null;
}

export function deleteCustomFont(userId, id) {
  const list = readIndex(userId);
  const f = list.find((x) => x.id === id);
  if (!f) return false;
  fs.rmSync(path.join(dirOf(userId), f.file), { force: true });
  writeIndex(userId, list.filter((x) => x.id !== id));
  return true;
}
