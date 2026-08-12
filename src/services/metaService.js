// Canais Meta (Facebook Messenger + Instagram DM) — fala com o proxy
// (server/routes/meta.js). O Page Access Token fica no servidor; o frontend
// só intermedia o OAuth (popup) ou o token colado manualmente.
import api from '@/services/api'

// URL do diálogo OAuth da Meta (state assinado no servidor).
export const getMetaOauthUrl = (userId) =>
  api.get('/meta/oauth/url', { params: { userId } }).then((r) => r.data)

// Conecta uma página a um canal ('facebook' | 'instagram').
export const connectMeta = (userId, channel, pageToken, page = {}) =>
  api.post('/meta/connect', {
    userId, channel, pageToken,
    pageId: page.id, pageName: page.name,
  }).then((r) => r.data)

export const disconnectMeta = (userId, channel) =>
  api.post('/meta/disconnect', { userId, channel }).then((r) => r.data)

export const getMetaStatus = (userId, channel) =>
  api.get('/meta/status', { params: { userId, channel } }).then((r) => r.data)

export const metaErrorMessage = (err) =>
  err?.response?.data?.error || err?.message || 'Erro desconhecido'

// Total de seguidores do perfil (a Meta não expõe a lista, só o número).
// Retorna { channel, count, username, mediaCount? }.
export const getMetaFollowers = (userId, channel) =>
  api.get('/meta/followers', { params: { userId, channel } }).then((r) => r.data)

// Puxa o histórico do Direct/Messenger para conversations/messages.
// Retorna { ok, conversations, messages }.
export const syncMetaConversations = (userId, channel) =>
  api.post('/meta/sync-conversations', { userId, channel }).then((r) => r.data)

/* Abre o popup de login da Meta e resolve com { pages } (via postMessage do
   callback) ou rejeita com o erro retornado.
   O popup é aberto IMEDIATAMENTE (contexto de gesto do usuário) com about:blank
   e só depois navegado para a URL OAuth — evita bloqueio de popup nos browsers
   quando o servidor leva 30-60 s para acordar (Render free tier). */
export const runMetaOauth = async (userId) => {
  const popup = window.open('about:blank', 'meta_oauth', 'width=640,height=760')
  if (!popup) throw new Error('Popup bloqueado pelo navegador. Permita popups para este site e tente novamente.')

  try {
    const { url } = await getMetaOauthUrl(userId)
    popup.location.href = url
  } catch (err) {
    popup.close()
    throw err
  }

  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      if (ev.data?.type !== 'meta_oauth') return
      window.removeEventListener('message', onMsg)
      clearInterval(watch)
      if (ev.data.error) reject(new Error(ev.data.error))
      else resolve({ pages: ev.data.pages || [] })
    }
    window.addEventListener('message', onMsg)
    // Usuário fechou o popup sem concluir.
    const watch = setInterval(() => {
      if (popup.closed) {
        clearInterval(watch)
        window.removeEventListener('message', onMsg)
        reject(new Error('Login cancelado.'))
      }
    }, 700)
  })
}
