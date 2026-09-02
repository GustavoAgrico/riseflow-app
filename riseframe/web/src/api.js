const BASE = '/api';
const TOKEN_KEY = 'riseframe_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignora */
  }
}
function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}

// ─── Autenticação ─────────────────────────────────────────────────────
async function authPost(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}
export const register = (email, password, name) => authPost('/auth/register', { email, password, name });
export const login = (email, password) => authPost('/auth/login', { email, password });
export async function fetchMe() {
  const r = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
  if (!r.ok) throw new Error('sessão inválida');
  return (await r.json()).user;
}

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

/** Envia o vídeo + opções. onProgress(0..1) reflete o upload. */
function uploadTo(endpoint, file, options, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('options', JSON.stringify(options));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${endpoint}`);
    const t = getToken();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
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

/** Pipeline automático completo. onProgress(0..1) reflete o upload. */
export function createJob(file, options, onProgress) {
  return uploadTo('/jobs', file, options, onProgress);
}

/** Só transcreve (para o editor de transcrição); o upload fica salvo no servidor. */
export function transcribe(file, options, onProgress) {
  return uploadTo('/transcribe', file, options, onProgress);
}

/** Gera vários clipes curtos a partir de um vídeo longo. */
export function generateClips(file, options, onProgress) {
  return uploadTo('/clips', file, options, onProgress);
}

export const clipPreviewUrl = (id, i) => `${BASE}/jobs/${id}/clips/${i}/preview`;
export const clipDownloadUrl = (id, i) => `${BASE}/jobs/${id}/clips/${i}/download`;

/** Baixa o vídeo de exemplo (modo demo) como um File pronto para usar. */
export async function sampleFile() {
  const r = await fetch(`${BASE}/sample`);
  if (!r.ok) throw new Error('exemplo indisponível');
  const blob = await r.blob();
  return new File([blob], 'exemplo.mp4', { type: 'video/mp4' });
}

/** Aplica a transcrição editada ao vídeo já enviado e roda o restante do pipeline. */
export async function renderEdited(sourceId, editedTranscript, options) {
  const r = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sourceId, editedTranscript, options }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
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
