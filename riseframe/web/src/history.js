// Histórico local dos vídeos processados neste navegador (sem servidor/BD).
// Alimenta o Dashboard (estatísticas + "Vídeos recentes") com dados REAIS do
// usuário, guardados só no dispositivo dele.
const KEY = 'riseframe_history';

export function listJobs() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? withSources(v) : [];
  } catch {
    return [];
  }
}

/**
 * Vídeos editados na timeline em versões antigas não guardavam o vídeo original
 * (sourceId) e ficavam sem "Continuar editando". Se o mesmo vídeo (mesmo nome) tem outro
 * projeto com o original guardado, reabre por ele. Puro.
 */
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
    const all = listJobs().filter((j) => j.id !== entry.id);
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
