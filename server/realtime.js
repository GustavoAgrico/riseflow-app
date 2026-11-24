// Avisa o frontend (Socket.io) que dados de vendas mudaram, para o painel de
// metas recalcular na hora. Só leva o userId da conta; o cliente refaz a leitura.
let io = null

const SALES_TABLES = new Set(['clients', 'sales_goals', 'products', 'pipeline_stages'])

function setIo(instance) { io = instance }

function emitSalesUpdate(userId, table) {
  if (io && userId && SALES_TABLES.has(table)) io.emit('sales_update', { userId, table })
}

// Nota interna nova numa conversa. O socket é global (todos os clientes
// recebem), então o evento NÃO leva o texto da nota: só ids. O cliente da conta
// certa (userId) relê a nota pelo proxy, que já filtra por tenant.
function emitConversationNote(userId, rows) {
  if (!io || !userId) return
  for (const r of Array.isArray(rows) ? rows : [rows]) {
    if (!r?.conversation_id) continue
    io.emit('conversation_note', {
      userId,
      conversationId: r.conversation_id,
      noteId: r.id || null,
      mentionIds: Array.isArray(r.mentions) ? r.mentions.map(m => m?.id).filter(Boolean) : [],
    })
  }
}

// Sala da conta: só os navegadores autenticados dessa conta (evento 'authenticate'
// em server/index.js) entram. Use para eventos com conteúdo, como os dos agentes.
const userRoom = (userId) => `user:${userId}`

function emitToUser(userId, event, payload) {
  if (io && userId) io.to(userRoom(userId)).emit(event, payload)
}

module.exports = { setIo, emitSalesUpdate, emitConversationNote, emitToUser, userRoom }
