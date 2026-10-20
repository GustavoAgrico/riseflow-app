import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { cloudSave, onCloudReload } from './cloudSync.js';

/**
 * "Meus modelos": o jeito que a pessoa sempre edita (estilo da legenda, mídias como o
 * logo, textos, cor, efeitos e voz), salvo com um nome para aplicar em outros vídeos.
 * data/templates.json = { [userId]: [{ id, name, data, isDefault, createdAt, updatedAt }] }.
 */
const FILE = path.join(config.paths.data, 'templates.json');
let all = null;
onCloudReload('templates.json', () => { all = null; });

function load() {
  if (all) return all;
  try {
    all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  } catch {
    all = {};
  }
  return all;
}
function persist() {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all), { mode: 0o600 });
  cloudSave('templates.json');
}

const MAX_PER_USER = 30;
const MAX_BYTES = 256 * 1024;
// Só o que é "estilo" entra no modelo (nada da fala, cortes ou B-roll daquele vídeo).
const KEYS = ['cap', 'media', 'textLayers', 'colorLook', 'colorAdj', 'fx', 'voice', 'audioVolume', 'aspectSel', 'quality'];
const MEDIA_KEYS = ['key', 'mediaId', 'kind', 'filename', 'srcDuration', 'start', 'duration', 'mode', 'volume', 'scale', 'px', 'py', 'cx', 'cy', 'opacity',
  'animIn', 'animOut', 'blend', 'layer', 'fadeIn', 'fadeOut', 'offset', 'muted', 'bright', 'contrast', 'sat', 'flip', 'rot', 'crop', 'kf', 'whole'];

function cleanData(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of KEYS) if (d[k] !== undefined && d[k] !== null) out[k] = d[k];
  if (Array.isArray(out.media)) {
    out.media = out.media.slice(0, 40).filter((m) => m && typeof m.mediaId === 'string')
      .map((m) => Object.fromEntries(MEDIA_KEYS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])));
  } else delete out.media;
  if (out.textLayers && !Array.isArray(out.textLayers)) delete out.textLayers;
  if (JSON.stringify(out).length > MAX_BYTES) throw Object.assign(new Error('modelo grande demais'), { status: 400 });
  return out;
}

export function listTemplates(userId) {
  return (load()[userId] || []).slice().sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** IDs de mídia usados nos modelos (não deixam a mídia expirar). */
export function templateMediaIds() {
  const ids = new Set();
  for (const list of Object.values(load())) for (const t of list || []) for (const m of t.data?.media || []) if (m?.mediaId) ids.add(String(m.mediaId));
  return ids;
}

/** Cria ou atualiza (mesmo id ou mesmo nome) um modelo. */
export function saveTemplate(userId, { id, name, data, isDefault }) {
  load();
  const nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!nm) throw Object.assign(new Error('dê um nome ao modelo'), { status: 400 });
  const list = all[userId] || (all[userId] = []);
  const now = new Date().toISOString();
  let t = (id && list.find((x) => x.id === id)) || list.find((x) => x.name.toLowerCase() === nm.toLowerCase());
  if (!t) {
    if (list.length >= MAX_PER_USER) throw Object.assign(new Error(`limite de ${MAX_PER_USER} modelos — apague um para salvar outro`), { status: 400 });
    t = { id: crypto.randomUUID(), createdAt: now };
    list.push(t);
  }
  Object.assign(t, { name: nm, data: cleanData(data), updatedAt: now });
  if (isDefault !== undefined) {
    for (const x of list) x.isDefault = false;
    t.isDefault = Boolean(isDefault);
  } else t.isDefault = Boolean(t.isDefault);
  persist();
  return t;
}

export function setDefaultTemplate(userId, id) {
  const list = load()[userId] || [];
  for (const x of list) x.isDefault = Boolean(id) && x.id === id;
  persist();
  return listTemplates(userId);
}

export function deleteTemplate(userId, id) {
  const list = load()[userId] || [];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  persist();
  return true;
}
