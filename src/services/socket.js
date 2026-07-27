// Conexão Socket.io com o backend proxy do RiseFlow.
// O servidor emite 'new_message' / 'new_chat' / 'connection_update' quando a
// Evolution dispara o webhook — substitui o polling por tempo real.
//
// Em dev o Socket.io roda no proxy (porta 3333). Em produção, defina
// VITE_SOCKET_URL com a URL pública do backend.
import { io } from 'socket.io-client'

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

socket.on('connect', () => console.log('[socket] conectado:', socket.id))
socket.on('disconnect', (reason) => console.log('[socket] desconectado:', reason))
socket.on('connect_error', (err) => console.warn('[socket] erro de conexão:', err.message))

export default socket
