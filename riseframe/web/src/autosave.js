/**
 * Salvamento automático do editor (no navegador): cada projeto (pelo id da fonte) guarda
 * a última versão das edições. Se a página fechar, o navegador travar ou o render falhar,
 * ao abrir o projeto de novo o editor oferece recuperar. Sets e Maps viram listas.
 */
const PREFIX = 'rf-edit:';
const MAX_PROJECTS = 6;

const replacer = (_k, v) => (v instanceof Set ? { __set: [...v] } : v instanceof Map ? { __map: [...v] } : v);
const reviver = (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v.__set ? new Set(v.__set) : v.__map ? new Map(v.__map) : v) : v);

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAutosave(id) {
  const ls = storage();
  if (!ls || !id) return null;
  try {
    const raw = ls.getItem(PREFIX + id);
    return raw ? JSON.parse(raw, reviver) : null;
  } catch {
    return null;
  }
}

/** Remove os projetos mais antigos (o navegador guarda pouco: ~5 MB no total). */
function prune(ls, keep) {
  const items = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(PREFIX) && k !== keep) {
      try {
        items.push({ k, at: JSON.parse(ls.getItem(k)).at || 0 });
      } catch {
        items.push({ k, at: 0 });
      }
    }
  }
  items.sort((a, b) => b.at - a.at).slice(MAX_PROJECTS - 1).forEach((it) => ls.removeItem(it.k));
  return items.length;
}

export function saveAutosave(id, state, extra = {}) {
  const ls = storage();
  if (!ls || !id) return false;
  const key = PREFIX + id;
  const data = JSON.stringify({ at: Date.now(), ...extra, state }, replacer);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      ls.setItem(key, data);
      if (attempt === 0) prune(ls, key);
      return true;
    } catch {
      // cheio: apaga os outros projetos e tenta de novo
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX) && k !== key) ls.removeItem(k);
      }
    }
  }
  return false;
}

/** Marca a versão salva como já enviada para gerar (não oferece recuperar à toa). */
export function markAutosaveSubmitted(id) {
  const saved = loadAutosave(id);
  if (saved) saveAutosave(id, saved.state, { at: saved.at, submitted: true });
}

export function clearAutosave(id) {
  const ls = storage();
  try {
    ls?.removeItem(PREFIX + id);
  } catch {
    /* sem armazenamento */
  }
}

/** Estado do editor → JSON puro (Sets e Maps viram listas) e volta — para salvar na conta. */
export const packState = (state) => JSON.parse(JSON.stringify(state, replacer));
export const unpackState = (obj) => (obj ? JSON.parse(JSON.stringify(obj), reviver) : obj);
