// App de PC: o navegador interno guarda as preferências (Brand Kit, modelos do assistente,
// login, ajustes do editor) por ENDEREÇO. Se o app abrir numa porta diferente (ex.: uma
// versão antiga ainda presa na porta de sempre depois de atualizar), parecia que tudo
// tinha sumido. Aqui as preferências ganham uma cópia num arquivo do computador
// (riseframe-data/../navegador.json) e voltam sozinhas quando faltarem.

// Rascunhos de edição (rf-edit:*) e envios em andamento são grandes/temporários: ficam de fora.
const SKIP = [/^rf-edit:/, /^rf-up:/];
const MAX_VALUE = 1024 * 1024; // um valor maior que isso (ex.: logo enorme) não entra
const MAX_TOTAL = 8 * 1024 * 1024;

const keep = (k) => /^(riseframe|rf)[_-]/.test(k) && !SKIP.some((re) => re.test(k));

/** Preferências que entram na cópia: { chave: valor }. Puro (recebe o storage). */
export function snapshotStorage(ls) {
  const out = {};
  let total = 0;
  if (!ls) return out;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !keep(k)) continue;
    const v = ls.getItem(k);
    if (typeof v !== 'string' || v.length > MAX_VALUE || total + v.length > MAX_TOTAL) continue;
    out[k] = v;
    total += v.length;
  }
  return out;
}

/** Devolve ao storage o que está na cópia e falta nele (nunca sobrescreve). Puro. → nº de chaves */
export function restoreStorage(ls, saved) {
  let n = 0;
  if (!ls || !saved || typeof saved !== 'object') return n;
  for (const [k, v] of Object.entries(saved)) {
    if (!keep(k) || typeof v !== 'string') continue;
    try {
      if (ls.getItem(k) === null) {
        ls.setItem(k, v);
        n++;
      }
    } catch {
      /* armazenamento cheio: segue */
    }
  }
  return n;
}

/** Liga a cópia (só no app de PC). Chame ANTES de montar o app. */
export function initDesktopStorage(win = typeof window !== 'undefined' ? window : null) {
  const bridge = win?.electron;
  if (!bridge?.storageLoad || !bridge?.storageSave) return;
  let ls = null;
  try {
    ls = win.localStorage;
  } catch {
    return;
  }
  try {
    const n = restoreStorage(ls, bridge.storageLoad());
    if (n) console.info(`[riseframe] ${n} preferência(s) restauradas da cópia do computador`);
  } catch {
    /* sem cópia: segue */
  }
  let last = '';
  const save = () => {
    try {
      const snap = JSON.stringify(snapshotStorage(ls));
      if (snap !== last) {
        last = snap;
        bridge.storageSave(snap);
      }
    } catch {
      /* tenta na próxima */
    }
  };
  save();
  win.setInterval(save, 10_000);
  win.addEventListener('beforeunload', save);
  win.addEventListener('visibilitychange', save);
}
