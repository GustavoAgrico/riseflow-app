// Cliente Axios pré-configurado para o servidor WhatsApp interno (Baileys).
// A API key vive APENAS aqui (lida do .env) e nunca é exposta ao frontend.
// Substitui o antigo evolutionClient.js — o frontend não muda (continua falando
// só com este proxy via JWT).
const axios = require('axios')

const { BAILEYS_URL, BAILEYS_KEY } = process.env

if (!BAILEYS_URL || BAILEYS_URL.includes('localhost')) {
  console.warn(
    '[baileysClient] BAILEYS_URL aponta para localhost — em produção configure a URL pública do riseflow-wa no Render.'
  )
}
if (!BAILEYS_KEY) {
  console.warn('[baileysClient] BAILEYS_KEY não definida — autenticação vai falhar.')
}

const baileys = axios.create({
  baseURL: BAILEYS_URL || 'http://localhost:3334',
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
    apikey: BAILEYS_KEY || '',
  },
})

// Intercepta erros de conexão (ECONNREFUSED, ENOTFOUND) e retorna mensagem legível
baileys.interceptors.response.use(
  r => r,
  err => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
      const cfg = err.config?.baseURL || BAILEYS_URL
      console.error(`[baileysClient] Servidor WhatsApp inacessível em ${cfg} — verifique BAILEYS_URL no .env`)
      err.message = `Servidor WhatsApp inacessível (${cfg}). Configure BAILEYS_URL corretamente.`
    }
    return Promise.reject(err)
  }
)

module.exports = { baileys }
