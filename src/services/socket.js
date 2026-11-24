// Conexão Socket.io com o backend proxy do RiseFlow.
// O servidor emite 'new_message' / 'new_chat' / 'connection_update' quando a
// Evolution dispara o webhook — substitui o polling por tempo real.
//
// Em dev o Socket.io roda no proxy (porta 3333). Em produção, defina
// VITE_SOCKET_URL com a URL pública do backend.
import { io } from 'socket.io-client'
import { getProxyToken } from '@/lib/supabase'

// Produção: sem VITE_SOCKET_URL conecta same-origin (o Express serve frontend
// e Socket.io na mesma porta — ver Dockerfile). Dev: proxy roda em :3333.
const URL = import.meta.env.VITE_SOCKET_URL
  || (import.meta.env.DEV ? 'http://localhost:3333' : undefined)

export const socket = io(URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
})

// Entra na sala da conta no servidor (eventos com conteúdo, como os dos agentes, só chegam
// a quem se autenticou). Sem sessão (tela de login), o token falha e nada acontece.
export async function authenticateSocket() {
  try {
    const token = await getProxyToken()
    if (token) socket.emit('authenticate', { token })
  } catch { /* sem sessão */ }
}

socket.on('connect', () => { console.log('[socket] conectado:', socket.id); authenticateSocket() })
socket.on('disconnect', (reason) => console.log('[socket] desconectado:', reason))
socket.on('connect_error', (err) => console.warn('[socket] erro de conexão:', err.message))
socket.onAny((event, ...args) => console.log('[socket:recv]', event, JSON.stringify(args).slice(0, 120)))

export default socket
