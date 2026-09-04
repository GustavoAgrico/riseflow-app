// Histórico local dos vídeos processados neste navegador (sem servidor/BD).
// Alimenta o Dashboard (estatísticas + "Vídeos recentes") com dados REAIS do
// usuário, guardados só no dispositivo dele.
const KEY = 'riseframe_history';

export function listJobs() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
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
