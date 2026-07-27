// Canal Email (SMTP) — fala com o proxy do backend (server/routes/email.js).
// O navegador nunca abre conexão SMTP direto; tudo passa pelo servidor.
import api from '@/services/api'

// Valida credenciais SMTP (verify, sem enviar). Lança em caso de falha.
export const testSmtp = (creds) => api.post('/email/test', creds).then((r) => r.data)

// Envia um email usando a config salva do usuário no backend.
export const sendEmail = (payload) => api.post('/email/send', payload).then((r) => r.data)

// Extrai uma mensagem de erro legível das respostas do proxy/axios.
export const emailErrorMessage = (err) =>
  err?.response?.data?.error || err?.message || 'Erro desconhecido'
