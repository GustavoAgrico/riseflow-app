// Cifragem simétrica de segredos em repouso (tokens de canal em integrations.config).
// AES-256-GCM (autenticado). A chave vem de TOKEN_ENC_KEY no .env (32 bytes,
// em 64 hex ou base64). Gere com:  openssl rand -hex 32
//
// Retrocompatível e opt-in:
//   - decryptSecret devolve valores SEM o prefixo "enc:v1:" como estão (tokens
//     legados em texto puro continuam funcionando sem migração de dados);
//   - se TOKEN_ENC_KEY não estiver definida, encryptSecret vira no-op (grava em
//     texto puro e avisa 1x) — nada quebra em dev / antes de configurar a chave.
// Rollout: subir o código → definir TOKEN_ENC_KEY no Render → reconectar os
// canais (ou os tokens já salvos seguem em texto puro, lidos normalmente).
const crypto = require('crypto')

const PREFIX = 'enc:v1:'
let cachedKey // undefined = ainda não resolvida; null = ausente
let warnedMissing = false

function getKey() {
  if (cachedKey !== undefined) return cachedKey
  const raw = (process.env.TOKEN_ENC_KEY || '').trim()
  if (!raw) { cachedKey = null; return null }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error('[crypto] TOKEN_ENC_KEY inválida: precisa de 32 bytes (64 hex ou base64 de 32 bytes).')
  }
  cachedKey = buf
  return cachedKey
}

// Texto puro → "enc:v1:<base64(iv|tag|ciphertext)>". Sem chave: devolve como está.
function encryptSecret(plain) {
  if (plain == null || plain === '') return plain
  const key = getKey()
  if (!key) {
    if (!warnedMissing) {
      console.warn('[crypto] TOKEN_ENC_KEY ausente — tokens gravados em TEXTO PURO. Defina TOKEN_ENC_KEY para cifrar em repouso.')
      warnedMissing = true
    }
    return plain
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

// "enc:v1:..." → texto puro. Valores sem o prefixo (legado) passam direto.
// Retorna null se estiver cifrado mas não for possível decifrar (chave errada/ausente).
function decryptSecret(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value
  const key = getKey()
  if (!key) {
    console.warn('[crypto] valor cifrado encontrado mas TOKEN_ENC_KEY ausente — impossível decifrar.')
    return null
  }
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch (e) {
    console.warn('[crypto] falha ao decifrar token:', e.message)
    return null
  }
}

module.exports = { encryptSecret, decryptSecret }
