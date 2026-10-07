// URL da API. Em produção com frontend e backend juntos (Render), deixe vazio
// (mesma origem → '/api'). Na Netlify (só frontend), defina VITE_API_URL com a
// URL do backend, ex.: https://riseframe-api.onrender.com  → vira '.../api'.
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';
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
/** Login com Google: envia o ID token (credential) do Google Identity Services. */
export const loginWithGoogle = (credential) => authPost('/auth/google', { credential });
/** Pede o e-mail de recuperação de senha (resposta sempre neutra). */
export const forgotPassword = (email) => authPost('/auth/forgot', { email });
/** Redefine a senha com o token recebido por e-mail. */
export const resetPassword = (token, password) => authPost('/auth/reset', { token, password });
export async function fetchMe() {
  const r = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
  if (!r.ok) throw new Error('sessão inválida');
  return (await r.json()).user;
}

// ─── Configurações do usuário ─────────────────────────────────────────
export async function getSettings() {
  const r = await fetch(`${BASE}/settings`, { headers: authHeaders() });
  if (!r.ok) throw new Error('não foi possível carregar as configurações');
  return r.json();
}
export async function saveSettings(patch) {
  const r = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}

// ─── Créditos ───────────────────────────────────────────────────────
async function billingCall(path, method = 'GET', body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}
export const getBilling = () => billingCall('/billing');
/** Gera o pagamento de um pacote (Pix/cartão): { packId, name, cpf, phone } → { url } do checkout. */
export const startCheckout = (info) => billingCall('/billing/checkout', 'POST', info);
/** Confere se o pagamento já caiu; devolve o saldo atualizado + { added }. */
export const syncBilling = () => billingCall('/billing/sync', 'POST');
/** Desliga a renovação automática (o plano vale até o fim do período já pago). */
export const cancelSubscription = () => billingCall('/billing/subscription/cancel', 'POST');
/** "Já paguei" do Pix pelo link do banco: { kind, itemId, phone, name } → status atualizado. */
export const claimPix = (info) => billingCall('/billing/pix/claim', 'POST', info);
// Admin: avisos de Pix para confirmar, liberação manual e lembretes.
export const adminClaims = () => billingCall('/billing/admin/claims');
export const adminApproveClaim = (id) => billingCall(`/billing/admin/claims/${encodeURIComponent(id)}/approve`, 'POST');
export const adminRejectClaim = (id) => billingCall(`/billing/admin/claims/${encodeURIComponent(id)}/reject`, 'POST');
export const adminGrant = (info) => billingCall('/billing/admin/grant', 'POST', info);
export const adminSendReminders = () => billingCall('/billing/admin/reminders', 'POST');

/** URL de arquivo servido pela API ("/api/...") respeitando a origem configurada. */
export const apiAsset = (u) => (u && u.startsWith('/api/') ? `${BASE}${u.slice(4)}` : u);

/** Informações públicas da página inicial: preços, teste grátis, limites e demonstração. */
export async function getPublicInfo() {
  const r = await fetch(`${BASE}/public/info`);
  if (!r.ok) throw new Error('falha ao carregar informações');
  return r.json();
}
// Admin: demonstração antes/depois da página inicial.
export const adminShowcase = () => billingCall('/admin/showcase');
export const adminSetShowcase = (jobId) => billingCall('/admin/showcase', 'POST', { jobId });
export const adminRemoveShowcase = () => billingCall('/admin/showcase', 'DELETE');
/** Baixa um arquivo protegido (admin) e salva com o nome dado. */
async function adminDownload(path, filename) {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erro ${r.status}`);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Backup das contas, planos e configurações (para mudar de servidor). */
export const adminDownloadBackup = () => adminDownload('/admin/backup', `riseframe-backup-${new Date().toISOString().slice(0, 10)}.zip`);

/** Baixa o pacote .zip da demo (para deixá-la permanente no site). */
export async function adminDownloadShowcase() {
  const r = await fetch(`${BASE}/admin/showcase/package`, { headers: authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erro ${r.status}`);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'riseframe-demo.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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

// Limite de tamanho do servidor (lido uma vez do /health).
let uploadLimit = null;
async function maxUploadBytes() {
  if (uploadLimit === null) {
    try {
      uploadLimit = Number((await getHealth()).capabilities?.maxUploadBytes) || 0;
    } catch {
      uploadLimit = 0;
    }
  }
  return uploadLimit;
}

function formatGB(bytes) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Envia o vídeo + opções. onProgress(0..1) reflete o upload. */
async function uploadTo(endpoint, file, options, onProgress) {
  const limit = await maxUploadBytes();
  if (limit && file.size > limit) {
    throw new Error(`o vídeo tem ${formatGB(file.size)} e o limite é ${formatGB(limit)}.`);
  }
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

/** Planeja o B-roll (momentos + candidatos com miniaturas) para o usuário revisar
 *  e trocar antes de renderizar. */
export async function fetchBrollPlan(sourceId, editedTranscript, options) {
  const r = await fetch(`${BASE}/broll/plan`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sourceId, editedTranscript, options }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data; // { source, moments: [{start,end,term,query,candidates:[{id,link,thumb,kind}]}] }
}

/** Sobe uma mídia própria (imagem/vídeo/música) para usar na timeline.
 *  Resolve com { id, kind, filename, durationSec }. */
export function uploadMedia(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/media`);
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
/** URL do vídeo ORIGINAL enviado (para o editor/timeline pré-visualizar). */
/** Job já processado — usado para reabrir a timeline a partir do histórico. */
export async function getJob(id) {
  const r = await fetch(`${BASE}/jobs/${id}`, { headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || (r.status === 404 ? 'o vídeo de origem não está mais disponível' : `erro ${r.status}`));
  return data;
}

export const sourceUrl = (id) => `${BASE}/jobs/${id}/source`;
// Quadro do vídeo com a cor EXATA do render (mesma cadeia de filtros do servidor).
export const colorFrameUrl = (id, t, look, a = {}) =>
  `${BASE}/jobs/${id}/color-frame?t=${Number(t || 0).toFixed(1)}&look=${encodeURIComponent(look || 'auto')}&b=${a.brightness || 0}&c=${a.contrast || 0}&s=${a.saturation || 0}&tp=${a.temperature || 0}`;
/** Tira de miniaturas da faixa de vídeo da timeline. */
export const filmstripUrl = (id) => `${BASE}/jobs/${id}/filmstrip`;
/** Picos de áudio (0..1) para desenhar a forma de onda. */
export async function getPeaks(id) {
  const r = await fetch(`${BASE}/jobs/${id}/peaks`);
  if (!r.ok) return [];
  const d = await r.json().catch(() => ({}));
  return Array.isArray(d.peaks) ? d.peaks : [];
}
