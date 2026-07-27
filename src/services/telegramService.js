// Canal Telegram (Bot API) — fala com o proxy do backend (server/routes/telegram.js).
// O token do bot nunca fica no frontend depois de conectado; o envio/recebimento
// acontece todo no servidor (grammY).
import api from '@/services/api'

// Valida o token no Telegram (getMe), sobe o bot e persiste a integração.
export const connectTelegram = (userId, token) =>
  api.post('/telegram/connect', { userId, token }).then((r) => r.data)

// Para o bot e marca a integração como desconectada.
export const disconnectTelegram = (userId) =>
  api.post('/telegram/disconnect', { userId }).then((r) => r.data)

// Estado do bot em memória no servidor.
export const getTelegramStatus = (userId) =>
  api.get('/telegram/status', { params: { userId } }).then((r) => r.data)

export const telegramErrorMessage = (err) =>
  err?.response?.data?.error || err?.message || 'Erro desconhecido'
