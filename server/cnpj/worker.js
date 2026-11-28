// Thread que responde às buscas na base do CNPJ (SQLite é síncrono: aqui ele não
// trava o servidor). Reabre a base quando o importer troca o arquivo.
const fs = require('fs')
const { parentPort, workerData } = require('worker_threads')
process.removeAllListeners('warning') // "SQLite is experimental" (Node 22)
const { DatabaseSync } = require('node:sqlite')
const S = require('./search')

const FILE = workerData.file
let db = null
let ino = null

function open() {
  let st
  try { st = fs.statSync(FILE) } catch { if (db) { try { db.close() } catch {} db = null; ino = null } return null }
  if (db && st.ino === ino) return db
  if (db) { try { db.close() } catch {} }
  db = new DatabaseSync(FILE, { readOnly: true })
  db.exec('pragma cache_size = -16000')
  ino = st.ino
  return db
}

parentPort.on('message', ({ id, op, params }) => {
  try {
    const d = open()
    if (!d) return parentPort.postMessage({ id, result: op === 'status' ? { ready: false } : { error: 'Base de CNPJ ainda não importada.', notReady: true } })
    let result
    if (op === 'status') result = S.status(d)
    else if (op === 'search') result = S.search(d, params)
    else if (op === 'cnaes') result = S.findCnaes(d, params.q)
    else if (op === 'cidades') result = S.findCidades(d, params.q, params.uf)
    else throw new Error(`operação desconhecida: ${op}`)
    parentPort.postMessage({ id, result })
  } catch (e) {
    parentPort.postMessage({ id, error: e.message })
  }
})
