// Fachada da base local do CNPJ para as rotas: uma worker thread, fila simples,
// tempo-limite por consulta. Caminho: CNPJ_DB_PATH ou /home/ubuntu/cnpj-data/cnpj.db
// (pasta irmã do app). Sem base importada, status() devolve { ready: false }.
const path = require('path')
const { Worker } = require('worker_threads')

const FILE = process.env.CNPJ_DB_PATH || path.join(__dirname, '..', '..', '..', 'cnpj-data', 'cnpj.db')
const TIMEOUT_MS = 20_000

let worker = null
let seq = 0
const pending = new Map()

function start() {
  if (worker) return worker
  worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: { file: FILE }, resourceLimits: { maxOldGenerationSizeMb: 96 } })
  worker.on('message', ({ id, result, error }) => {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    clearTimeout(p.timer)
    if (error) p.reject(new Error(error)); else p.resolve(result)
  })
  const reset = (err) => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err || new Error('busca reiniciada')) }
    pending.clear()
    worker = null
  }
  worker.on('error', (e) => { console.error('[cnpj] worker:', e.message); reset(e) })
  worker.on('exit', () => reset())
  worker.unref()
  return worker
}

function call(op, params = {}) {
  const w = start()
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(Object.assign(new Error('A busca demorou demais. Escolha uma cidade ou um setor mais específico.'), { status: 504 }))
      // Consulta travada: recomeça a thread para não acumular.
      try { w.terminate() } catch {}
    }, TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    w.postMessage({ id, op, params })
  })
}

module.exports = {
  FILE,
  status: () => call('status'),
  search: (params) => call('search', params),
  cnaes: (q) => call('cnaes', { q }),
  cidades: (q, uf) => call('cidades', { q, uf }),
}
