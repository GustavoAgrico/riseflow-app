// Canal WhatsApp Cloud API (oficial da Meta) — fala com o proxy do backend
// (server/routes/whatsappCloud.js). O token nunca fica no frontend depois de
// conectado; envio/recebimento acontecem no servidor via Graph API + webhook.
// O userId é derivado do JWT no backend — não é enviado pelo frontend.
import api from '@/services/api'

// Valida phoneNumberId+token na Graph e persiste a integração.
export const connectWhatsAppCloud = (phoneNumberId, token, wabaId) =>
  api.post('/whatsapp-cloud/connect', { phoneNumberId, token, wabaId }).then((r) => r.data)

export const disconnectWhatsAppCloud = () =>
  api.post('/whatsapp-cloud/disconnect', {}).then((r) => r.data)

export const getWhatsAppCloudStatus = () =>
  api.get('/whatsapp-cloud/status').then((r) => r.data)

export const whatsappCloudErrorMessage = (err) =>
  err?.response?.data?.error || err?.message || 'Erro desconhecido'
