// Cliente Axios pré-configurado para o servidor WhatsApp interno (Baileys).
// A API key vive APENAS aqui (lida do .env) e nunca é exposta ao frontend.
// Substitui o antigo evolutionClient.js — o frontend não muda (continua falando
// só com este proxy via JWT).
const axios = require('axios')

const { BAILEYS_URL, BAILEYS_KEY } = process.env

if (!BAILEYS_URL || !BAILEYS_KEY) {
  console.warn(
    '[baileysClient] Variáveis BAILEYS_URL/BAILEYS_KEY ausentes no .env — as chamadas vão falhar.'
  )
}

const baileys = axios.create({
  baseURL: BAILEYS_URL,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
    apikey: BAILEYS_KEY,
  },
})

module.exports = { baileys }
