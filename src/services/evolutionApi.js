// Camada de acesso à Evolution API — SEMPRE via backend proxy do RiseFlow (/api/*).
// O frontend NUNCA chama a Evolution diretamente; a apikey vive só no servidor.
// JWT, timeout e logout em 401 são tratados pelo cliente axios em api.js.
import { api } from '@/services/api'

// Conversas
export const getChats = () => api.get('/chats').then(r => r.data)

// Mensagens
export const getAllMessages = () => api.get('/messages').then(r => r.data)

export const getMessages = (remoteJid) =>
  api.get(`/messages/${encodeURIComponent(remoteJid)}`).then(r => r.data)

export const sendMessage = (number, text) =>
  api.post('/messages/send', { number, text }).then(r => r.data)

export const sendWhatsAppAudio = (number, audio) =>
  api.post('/messages/send-audio', { number, audio }).then(r => r.data)

// Contatos
export const findContacts = () => api.get('/contacts').then(r => r.data)

// Instância
export const getInstanceStatus = () => api.get('/instance/status').then(r => r.data)

export const connectInstance = () => api.get('/instance/connect').then(r => r.data)

export const disconnectInstance = () => api.delete('/instance/logout').then(r => r.data)

// opts opcional: { webhook_by_events, events }. Defaults definidos no servidor.
export const setWebhook = (url, opts = {}) =>
  api.post('/instance/webhook', { url, ...opts }).then(r => r.data)
