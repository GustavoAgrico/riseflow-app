// Avisa o frontend (Socket.io) que dados de vendas mudaram, para o painel de
// metas recalcular na hora. Só leva o userId da conta; o cliente refaz a leitura.
let io = null

const SALES_TABLES = new Set(['clients', 'sales_goals', 'products', 'pipeline_stages'])

function setIo(instance) { io = instance }

function emitSalesUpdate(userId, table) {
  if (io && userId && SALES_TABLES.has(table)) io.emit('sales_update', { userId, table })
}

module.exports = { setIo, emitSalesUpdate }
