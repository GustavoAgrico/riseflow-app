// Histórico local dos vídeos processados neste navegador (sem servidor/BD).
// Alimenta o Dashboard (estatísticas + "Vídeos recentes") com dados REAIS do
// usuário, guardados só no dispositivo dele.
const KEY = 'riseframe_history';

export function listJobs(withDrafts = false) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    // rascunhos = vídeos abertos no editor e ainda não exportados (não entram nas estatísticas)
    return Array.isArray(v) ? withSources((withDrafts ? v : v.filter((j) => !j.draft)).map((j) => ({ ...j, title: fixMojibake(j.title) }))) : [];
  } catch {
    return [];
  }
}

/**
 * Vídeos editados na timeline em versões antigas não guardavam o vídeo original
 * (sourceId) e ficavam sem "Continuar editando". Se o mesmo vídeo (mesmo nome) tem outro
 * projeto com o original guardado, reabre por ele. Puro.
 */
/** Nomes antigos gravados com acento quebrado ("CrianÃ§a") → "Criança". Puro. */
export function fixMojibake(name) {
  const s = String(name || '');
  if (!/[\u0080-\u00ff]/.test(s) || /[^\u0000-\u00ff]/.test(s)) return s;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

export function withSources(list) {
  return list.map((j) => {
    if (j.sourceId || j.mode === 'clips') return j;
    const twin = list.find((o) => o !== j && o.sourceId && o.mode !== 'clips' && o.title === j.title);
    return twin ? { ...j, sourceId: twin.sourceId } : j;
  });
}

export function recordJob(entry) {
  if (!entry?.id) return;
  try {
    // exportou: o rascunho do mesmo vídeo sai (vira o projeto editado)
    const all = listJobs(true).filter((j) => j.id !== entry.id && !(j.draft && !entry.draft && j.sourceId && j.sourceId === entry.sourceId));
    all.unshift({ at: Date.now(), ...entry });
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 60)));
  } catch {
    /* ignora (modo privado, etc.) */
  }
}

export function clearJobs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
