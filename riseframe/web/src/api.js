const BASE = '/api';

export async function getHealth() {
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error('API indisponível');
  return r.json();
}

export async function getOptions() {
  const r = await fetch(`${BASE}/options`);
  if (!r.ok) throw new Error('falha ao carregar opções');
  return r.json();
}

export async function listJobs() {
  const r = await fetch(`${BASE}/jobs`);
  if (!r.ok) throw new Error('falha ao listar jobs');
  return r.json();
}

/** Envia o vídeo + opções. onProgress(0..1) reflete o upload. */
export function createJob(file, options, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('options', JSON.stringify(options));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/jobs`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `erro ${xhr.status}`));
      } catch {
        reject(new Error(`resposta inválida (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('falha de rede no upload'));
    xhr.send(form);
  });
}

/** Assina o SSE de progresso de um job. Retorna uma função para cancelar. */
export function subscribeJob(id, onUpdate) {
  const es = new EventSource(`${BASE}/jobs/${id}/events`);
  es.onmessage = (ev) => {
    try {
      onUpdate(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => es.close();
  return () => es.close();
}

export const downloadUrl = (id) => `${BASE}/jobs/${id}/download`;
export const previewUrl = (id) => `${BASE}/jobs/${id}/preview`;
