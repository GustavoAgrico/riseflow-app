// Destino do vídeo exportado (como no Premiere): o lugar de salvar é escolhido ao clicar em
// Exportar e o arquivo é gravado sozinho quando fica pronto — sem clicar para baixar depois.
// App de PC: janela "Salvar como" do sistema. Navegador com acesso a arquivos (Chrome/Edge):
// showSaveFilePicker. Outros navegadores: o download começa sozinho ao terminar.

let pending = null;
const byJob = new Map();

const safeName = (s) => String(s || 'video').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video';

/** Pergunta onde salvar. → destino, ou null se a pessoa cancelou. */
export async function pickExportTarget({ name, ext }) {
  const file = `${safeName(name)}.${ext}`;
  if (window.electron?.chooseSavePath) {
    const path = await window.electron.chooseSavePath({ defaultName: file, ext });
    return path ? { kind: 'electron', path } : null;
  }
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: file,
        types: [ext === 'mp3' ? { description: 'Áudio MP3', accept: { 'audio/mpeg': ['.mp3'] } } : { description: 'Vídeo MP4', accept: { 'video/mp4': ['.mp4'] } }],
      });
      return { kind: 'fs', handle, name: handle.name };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      return { kind: 'auto' }; // sem permissão (ex.: dentro de um iframe): baixa sozinho no fim
    }
  }
  return { kind: 'auto' };
}

/** Guarda o destino escolhido até o render ser criado. */
export function setPendingExport(t) { pending = t || null; }
/** Liga o destino guardado ao render recém-criado. */
export function bindPendingExport(jobId) {
  if (pending && jobId) byJob.set(jobId, pending);
  pending = null;
}
/** Destino do render (uma vez só). */
export function takeExportTarget(jobId) {
  const t = byJob.get(jobId) || null;
  byJob.delete(jobId);
  return t;
}

/** Grava o arquivo pronto no destino. → { where } (texto para mostrar) ou erro. */
export async function saveToTarget(target, url) {
  let t = target;
  const abs = new URL(url, window.location.href).href;
  if (t.kind === 'electron') {
    const r = await window.electron.saveDownload({ url: abs, path: t.path });
    if (r === 'completed') return { where: t.path, path: t.path };
    if (r !== 'refused') throw new Error('não deu para salvar o arquivo');
    t = { kind: 'auto' }; // API fora do app (conta remota): baixa do jeito normal
  }
  if (t.kind === 'fs') {
    const res = await fetch(abs, { credentials: 'include' });
    if (!res.ok || !res.body) throw new Error('não deu para baixar o arquivo');
    const w = await t.handle.createWritable();
    await res.body.pipeTo(w);
    return { where: t.name };
  }
  const a = document.createElement('a');
  a.href = abs;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { where: 'Downloads' };
}
