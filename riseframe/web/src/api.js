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
/** Confirma o e-mail da conta com o código de 6 dígitos / pede outro código. */
export async function verifyAccount(code) {
  const r = await fetch(`${BASE}/auth/verify`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ code }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}
export async function resendVerify() {
  const r = await fetch(`${BASE}/auth/verify/resend`, { method: 'POST', headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}
export const login = (email, password) => authPost('/auth/login', { email, password });
/** Entrar pelo navegador (app de PC/Mac): pede o código, pergunta se já liberou e libera. */
export const deviceStart = () => authPost('/auth/device/start', {});
export const devicePoll = (code) => authPost('/auth/device/poll', { code });
export async function deviceApprove(code, { auto = false } = {}) {
  const r = await fetch(`${BASE}/auth/device/approve`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ code, auto }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `erro ${r.status}`), { needsConfirm: Boolean(data.needsConfirm) });
  return data;
}
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
/** "Já paguei" do Pix pelo link do banco: { kind, itemId, phone, name, email } → status atualizado. */
export const claimPix = (info) => billingCall('/billing/pix/claim', 'POST', info);
/** Confere nome, e-mail e WhatsApp do pagamento (campo a campo). */
export const checkContact = (info) => billingCall('/billing/contact/check', 'POST', info);
/** Manda / confere o código de confirmação do e-mail. */
export const sendContactCode = (email) => billingCall('/billing/contact/code', 'POST', { email });
export const verifyContactCode = (email, code) => billingCall('/billing/contact/verify', 'POST', { email, code });
/** Admin: manda um e-mail de teste para os e-mails de admin. */
export const adminTestEmail = () => billingCall('/settings/email/test', 'POST');
// Admin: avisos de Pix para confirmar, liberação manual e lembretes.
export const adminClaims = () => billingCall('/billing/admin/claims');
export const adminApproveClaim = (id) => billingCall(`/billing/admin/claims/${encodeURIComponent(id)}/approve`, 'POST');
export const adminResendNotice = (id) => billingCall(`/billing/admin/claims/${encodeURIComponent(id)}/notify`, 'POST');
export const adminRejectClaim = (id) => billingCall(`/billing/admin/claims/${encodeURIComponent(id)}/reject`, 'POST');
export const adminGrant = (info) => billingCall('/billing/admin/grant', 'POST', info);
export const adminSendReminders = () => billingCall('/billing/admin/reminders', 'POST');
/** Admin: tabela de clientes (plano, vencimento, pagamentos, contato). */
export const adminCustomers = () => billingCall('/billing/admin/customers');
/** Pix copia e cola + QR Code com o valor do plano/recarga, gerado no servidor. */
export const getPixQr = (kind, itemId) => billingCall('/billing/pix/qr', 'POST', { kind, itemId });
/** Admin: sobe agora contas/planos/configurações para o Supabase e mostra o resultado. */
export const adminCloudSync = () => billingCall('/settings/cloud/sync', 'POST');

/** URL de arquivo servido pela API ("/api/...") respeitando a origem configurada. */
export const apiAsset = (u) => (u && u.startsWith('/api/') ? `${BASE}${u.slice(4)}` : u);

/** Informações públicas da página inicial: preços, teste grátis, limites e demonstração. */
export async function getPublicInfo() {
  const r = await fetch(`${BASE}/public/info`);
  if (!r.ok) throw new Error('falha ao carregar informações');
  return r.json();
}
/** Instaladores do app de PC/Mac mais novos (GitHub Releases), por sistema. */
export async function getDownloads() {
  const r = await fetch(`${BASE}/public/download`);
  if (!r.ok) throw new Error('falha ao carregar os downloads');
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

// ─── Upload retomável (em partes) ─────────────────────────────────────
// O vídeo sobe em partes de 8 MB. Se a conexão cair, tenta de novo sozinho (com espera
// crescente) e continua de onde parou; se desistir, um novo "Tentar de novo" com o mesmo
// arquivo retoma do ponto salvo (o id do envio fica guardado no navegador).
const CHUNK = 8 * 1024 ** 2;
const upKey = (file) => `rf-up:${file.name}:${file.size}:${file.lastModified}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function putChunk(id, blob, offset, onChunkProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${BASE}/uploads/${id}`);
    const t = getToken();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Offset', String(offset));
    xhr.upload.onprogress = (e) => e.lengthComputable && onChunkProgress(e.loaded);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* resposta vazia */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.received);
      else if (xhr.status === 409 && Number.isFinite(data.received)) resolve(data.received); // já estava lá
      else {
        const err = new Error(data.error || `erro ${xhr.status}`);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(Object.assign(new Error('a conexão caiu durante o envio'), { network: true }));
    xhr.send(blob);
  });
}

async function chunkedUpload(file, onProgress, mode) {
  const key = upKey(file);
  let id = null;
  let received = 0;
  try {
    id = localStorage.getItem(key);
  } catch {
    id = null;
  }
  if (id) {
    const r = await fetch(`${BASE}/uploads/${id}`, { headers: authHeaders() }).catch(() => null);
    if (r?.ok) received = Number((await r.json()).received) || 0;
    else id = null;
  }
  if (!id) {
    const r = await fetch(`${BASE}/uploads`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: file.name, size: file.size, mode }),
    });
    if (r.status === 404) return null; // servidor antigo: envio de uma vez
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
    id = data.id;
    try {
      localStorage.setItem(key, id);
    } catch {
      /* sem armazenamento: só não retoma entre tentativas */
    }
  }
  let fails = 0;
  while (received < file.size) {
    const end = Math.min(file.size, received + CHUNK);
    try {
      received = await putChunk(id, file.slice(received, end), received, (n) => onProgress?.((received + n) / file.size));
      fails = 0;
      onProgress?.(received / file.size);
    } catch (err) {
      if (err.status === 404) {
        try { localStorage.removeItem(key); } catch { /* ignora */ }
        throw new Error('o envio expirou no servidor — tente de novo');
      }
      if (err.status && err.status < 500 && err.status !== 408 && err.status !== 429) throw err;
      fails += 1;
      if (fails > 8) throw new Error('a conexão caiu e não voltou. Clique em tentar de novo: o envio continua de onde parou.');
      await wait(Math.min(30000, 1000 * 2 ** (fails - 1)));
      // confirma onde o servidor parou antes de mandar de novo
      const r = await fetch(`${BASE}/uploads/${id}`, { headers: authHeaders() }).catch(() => null);
      if (r?.ok) received = Number((await r.json()).received) || received;
    }
  }
  return { id, key };
}

/** Envia o vídeo + opções. onProgress(0..1) reflete o upload. */
async function uploadTo(endpoint, file, options, onProgress) {
  const limit = await maxUploadBytes();
  if (limit && file.size > limit) {
    throw new Error(`o vídeo tem ${formatGB(file.size)} e o limite é ${formatGB(limit)}.`);
  }
  // Retomável (em partes); se o servidor não tiver, cai no envio de uma vez.
  const up = await chunkedUpload(file, onProgress, endpoint === '/transcribe' ? 'transcribe' : endpoint === '/clips' ? 'clips' : 'auto');
  if (up) {
    const r = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uploadId: up.id, options: JSON.stringify(options) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
    try { localStorage.removeItem(up.key); } catch { /* ignora */ }
    return data;
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

/** Abre um clipe pronto na timeline: o servidor recorta o trecho do vídeo original. */
export async function editClip(jobId, index) {
  const r = await fetch(`${BASE}/jobs/${jobId}/clips/${index}/edit`, { method: 'POST', headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}

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
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Leva o código (PLAN_REQUIRED, PAYMENT_REQUIRED…) e os recursos travados para o
    // editor oferecer a saída certa sem perder a timeline.
    const err = new Error(data.error || `erro ${r.status}`);
    err.status = r.status;
    err.code = data.code || null;
    err.locked = Array.isArray(data.locked) ? data.locked : [];
    throw err;
  }
  return data;
}

/** Assina o SSE de progresso de um job. Retorna uma função para cancelar. */
export function subscribeJob(id, onUpdate) {
  // Se a conexão cair (internet, servidor reiniciando), reconecta sozinho: o job volta
  // para a fila no servidor e a tela continua acompanhando — nunca fica parada.
  let es = null;
  let stopped = false;
  let finished = false;
  let tries = 0;
  let timer = null;
  const connect = () => {
    if (stopped || finished) return;
    es = new EventSource(`${BASE}/jobs/${id}/events`);
    es.onmessage = (ev) => {
      tries = 0;
      try {
        const u = JSON.parse(ev.data);
        if (u.status === 'done' || u.status === 'error') {
          finished = true;
          es.close();
        }
        onUpdate(u);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      if (stopped || finished) return;
      tries += 1;
      timer = setTimeout(async () => {
        // o job ainda existe? (404 depois de muitas tentativas = perdido de vez)
        try {
          const j = await getJob(id);
          if (j.status === 'done' || j.status === 'error') {
            finished = true;
            onUpdate(j);
            return;
          }
          onUpdate(j);
        } catch (err) {
          if (tries > 40) {
            finished = true;
            onUpdate({ id, status: 'error', error: `perdemos o contato com o servidor (${err.message})` });
            return;
          }
        }
        connect();
      }, Math.min(15000, 1000 * 2 ** Math.min(tries, 4)));
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    es?.close();
  };
}

/**
 * Cortes precisos da prévia (os mesmos do vídeo final): pausas que não passam por cima de
 * voz e palavras removidas cortadas no vale do som. → { pauses, removed }
 */
export async function preciseCuts(id, body, signal) {
  const r = await fetch(`${BASE}/jobs/${id}/precise-cuts`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}

/** Transcreve só o trecho [start, end] do vídeo do editor. → { provider, segments } */
export async function transcribeRange(id, start, end) {
  const r = await fetch(`${BASE}/jobs/${id}/transcribe-range`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ start, end }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}

// ─── Fontes próprias (legendas) ───
export function authFetch(url, init = {}) {
  return fetch(url, { ...init, headers: authHeaders(init.headers || {}) });
}
export const customFontFileUrl = (id) => `${BASE}/custom-fonts/${id}/file`;
export async function listCustomFontsApi() {
  const r = await authFetch(`${BASE}/custom-fonts`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `erro ${r.status}`);
  return d.fonts || [];
}
export async function uploadCustomFontApi(file) {
  const form = new FormData();
  form.append('file', file);
  const r = await authFetch(`${BASE}/custom-fonts`, { method: 'POST', body: form });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `erro ${r.status}`);
  return d;
}
export async function deleteCustomFontApi(id) {
  const r = await authFetch(`${BASE}/custom-fonts/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`erro ${r.status}`);
}

export const downloadUrl = (id) => `${BASE}/jobs/${id}/download`;
export const previewUrl = (id) => `${BASE}/jobs/${id}/preview`;
/** URL do vídeo ORIGINAL enviado (para o editor/timeline pré-visualizar). */
/** Job já processado — usado para reabrir a timeline a partir do histórico. */
/** Pausar / cancelar / retomar um vídeo da fila (só quem enviou). */
export async function controlJob(id, action) {
  const r = await fetch(`${BASE}/jobs/${id}/${action}`, { method: 'POST', headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}

/** Os vídeos desta conta na fila, processando ou recém-terminados. */
export async function getMyQueue(hours = 0) {
  const r = await fetch(`${BASE}/queue/mine${hours ? `?hours=${hours}` : ''}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`erro ${r.status}`);
  return r.json(); // { jobs, othersAhead }
}

export async function getJob(id) {
  const r = await fetch(`${BASE}/jobs/${id}`, { headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || (r.status === 404 ? 'o vídeo de origem não está mais disponível' : `erro ${r.status}`));
  return data;
}

export const sourceUrl = (id) => `${BASE}/jobs/${id}/source`;
// Quadro do vídeo com a cor EXATA do render (mesma cadeia de filtros do servidor).
/** Capa gerada junto com o vídeo (resultado). */
export const coverDownloadUrl = (id) => `${BASE}/jobs/${id}/cover.jpg`;
/** Legenda do vídeo final em arquivo: 'srt' | 'vtt' | 'txt'. */
export const captionsDownloadUrl = (id, fmt = 'srt') => `${BASE}/jobs/${id}/captions.${fmt}`;
/** Capa (JPG): quadro do vídeo original no segundo `t`, no formato final, com o título. */
export const coverUrl = (id, { t = 0, text = '', style = 'box', color = 'FF6B35', pos = 'center', aspect = 'original', quality = 'original', fx = 0.5, full = false } = {}) =>
  `${BASE}/jobs/${id}/cover?${new URLSearchParams({ t: Number(t || 0).toFixed(1), text, style, color, pos, aspect, quality, fx: Number(fx).toFixed(2), ...(full ? { full: '1' } : {}) })}`;
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

/** Prévia da voz (8 s a partir de `start`) com o tratamento/modificador escolhido.
 *  Resolve com uma URL local (blob) do áudio. */
export async function previewVoice(sourceId, start, options) {
  const r = await fetch(`${BASE}/voice/preview`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sourceId, start, options }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `erro ${r.status}`);
  }
  return URL.createObjectURL(await r.blob());
}

/** Busca B-roll para um termo escolhido (troca a imagem de um momento por outra busca). */
export async function searchBroll(query, source, orientation) {
  const r = await fetch(`${BASE}/broll/search`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, source, orientation }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data; // { source, query, candidates }
}

// ── Projetos salvos na conta (a cada 30 s) e arquivos do projeto como no CapCut ──
async function jsonReq(method, url, body) {
  const r = await fetch(url, { method, headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `erro ${r.status}`), { status: r.status });
  return data;
}
export const saveProject = (id, state, meta) => jsonReq('PUT', `${BASE}/projects/${id}`, { state, meta });
export const loadProject = (id) => jsonReq('GET', `${BASE}/projects/${id}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
export const listProjects = () => jsonReq('GET', `${BASE}/projects`).then((d) => d.projects || []);
export const deleteProject = (id) => jsonReq('DELETE', `${BASE}/projects/${id}`);

/** Caminho do arquivo no computador (só no app de PC; no site, ''). */
export const localPathOf = (file) => {
  try {
    return (typeof window !== 'undefined' && window.electron?.getPathForFile?.(file)) || '';
  } catch {
    return '';
  }
};
/** Mídia do projeto: no app de PC aponta para o arquivo original; no site, envia uma cópia. */
export async function addProjectMedia(file, onProgress) {
  const p = localPathOf(file);
  if (p) {
    try {
      return await jsonReq('POST', `${BASE}/media/link`, { path: p });
    } catch {
      /* servidor sem modo PC: envia a cópia */
    }
  }
  return uploadMedia(file, onProgress);
}
export const mediaFileUrl = (id, v = '') => `${BASE}/media/${id}/file${v ? `?v=${v}` : ''}`;
/** Vídeo que o navegador toca (H.264 leve quando o original é HEVC/ProRes/10 bits/HDR…). */
export const mediaPreviewUrl = (id, v = '') => `${BASE}/media/${id}/preview${v ? `?v=${v}` : ''}`;
export const mediaStatus = (id) => jsonReq('GET', `${BASE}/media/${id}/status`);
/** Biblioteca: tudo o que a conta já enviou (fica guardado para reusar). */
export const getMediaLibrary = () => jsonReq('GET', `${BASE}/media/library`).then((d) => d.media || []);
export const removeLibraryMedia = (id) => jsonReq('DELETE', `${BASE}/media/library/${encodeURIComponent(id)}`);
/** Timeline em branco: os clipes (mídias da conta, na ordem) viram o vídeo do editor. */
export const createSequence = (body) => jsonReq('POST', `${BASE}/sequence`, body);
/** Timeline em branco: abre o editor na hora (sem clipes, sem cobrar). */
export const createBlankTimeline = (body = {}) => jsonReq('POST', `${BASE}/sequence/blank`, body);
/** Meus modelos (estilo da legenda, mídias, textos, cor…). */
export const listTemplatesApi = () => jsonReq('GET', `${BASE}/templates`).then((d) => d.templates || []);
export const saveTemplateApi = (t) => jsonReq('POST', `${BASE}/templates`, t);
export const deleteTemplateApi = (id) => jsonReq('DELETE', `${BASE}/templates/${encodeURIComponent(id)}`).then((d) => d.templates || []);
export const defaultTemplateApi = (id, off = false) => jsonReq('POST', `${BASE}/templates/${encodeURIComponent(id)}/default`, { off }).then((d) => d.templates || []);
export const sourceStatus = (id) => jsonReq('GET', `${BASE}/jobs/${id}/source/status`);

/** Localizar o arquivo de novo (mesmo id): caminho no app de PC, senão envia o arquivo. */
async function relink(url, file) {
  const p = localPathOf(file);
  if (p) {
    try {
      return await jsonReq('POST', url, { path: p });
    } catch (e) {
      if (e.status && e.status !== 400) throw e;
    }
  }
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(url, { method: 'POST', headers: authHeaders(), body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `erro ${r.status}`);
  return data;
}
export const relinkMedia = (id, file) => relink(`${BASE}/media/${id}/relink`, file);
export const relinkSource = (id, file) => relink(`${BASE}/jobs/${id}/source/relink`, file);

export const sfxUrl = (type) => `${BASE}/sfx/${type}`;
