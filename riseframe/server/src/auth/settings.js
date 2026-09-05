import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Configurações por usuário (chaves de integração etc.), salvas em
 * data/settings.json no formato { [userId]: { ...settings } }. Simples e sem
 * banco — cada usuário só enxerga/edita as próprias configurações.
 */
const FILE = path.join(config.paths.data, 'settings.json');

let all = null;

function load() {
  if (all) return all;
  try {
    all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!all || typeof all !== 'object') all = {};
  } catch {
    all = {};
  }
  return all;
}

function persist() {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
}

/** Sanitiza os campos aceitos. Só o que passa aqui é guardado. */
function clean(patch = {}) {
  const out = {};
  if ('pexelsKey' in patch) {
    const k = String(patch.pexelsKey || '').trim();
    out.pexelsKey = /^[A-Za-z0-9]{20,80}$/.test(k) ? k : '';
  }
  if ('anthropicKey' in patch) {
    const k = String(patch.anthropicKey || '').trim();
    out.anthropicKey = /^sk-ant-[A-Za-z0-9_-]{20,240}$/.test(k) ? k : '';
  }
  return out;
}

/** Retorna as configurações do usuário (objeto; {} se não houver). */
export function getSettings(userId) {
  return { pexelsKey: '', anthropicKey: '', ...(load()[userId] || {}) };
}

/** Mescla e salva as configurações do usuário; retorna o resultado. */
export function saveSettings(userId, patch) {
  load();
  all[userId] = { ...(all[userId] || {}), ...clean(patch) };
  persist();
  return getSettings(userId);
}
