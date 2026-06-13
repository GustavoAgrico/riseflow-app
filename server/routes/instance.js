// Rotas de gerenciamento da instância (status, conexão/QR, logout, webhook).
// Proxy do servidor WhatsApp interno (Baileys). Mantém o MESMO formato de resposta
// que o frontend já esperava da Evolution, para não exigir mudanças na UI.
const { Router } = require('express')
const { baileys } = require('../baileysClient')

const router = Router()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const INSTANCE = 'riseflow'

// Converte o { status, phone, name } do Baileys no shape de fetchInstances da Evolution
// que o frontend (parseStatus / WhatsAppManagePanel) sabe ler.
const toEvolutionShape = (s) => {
  const open = s?.status === 'connected'
  return [{
    instance: {
      instanceName: INSTANCE,
      state: open ? 'open' : 'close',
      status: open ? 'open' : 'close',
      profileName: s?.name || 'WhatsApp',
      owner: s?.phone ? `${s.phone}@s.whatsapp.net` : '',
      wuid: s?.phone || '',
    },
  }]
}

// GET /api/instance/status → estado da conexão.
router.get('/status', async (req, res, next) => {
  try {
    const { data } = await baileys.get('/status')
    res.json(toEvolutionShape(data))
  } catch (err) {
    next(err)
  }
})

// GET /api/instance/connect → retorna o QR Code (como imagem base64) para parear.
// Mapeia o /qr do Baileys para { base64 } — o que o extractQR do frontend espera.
router.get('/connect', async (req, res, next) => {
  try {
    let { data } = await baileys.get('/qr')
    if (data?.status === 'connected') {
      return res.json({ instance: { state: 'open' }, connected: true })
    }

    let img = data?.qrImage
    // Após um logout o socket fica fechado e não há QR até reconectar.
    // Dispara o reconnect e aguarda alguns segundos o QR aparecer.
    if (!img) {
      await baileys.post('/reconnect').catch(() => {})
      for (let i = 0; i < 8 && !img; i++) {
        await sleep(1000)
        const r = await baileys.get('/qr')
        if (r.data?.status === 'connected') {
          return res.json({ instance: { state: 'open' }, connected: true })
        }
        img = r.data?.qrImage
      }
    }

    res.json({ base64: img || null })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/instance/logout → desconecta (apaga a sessão no servidor Baileys).
router.delete('/logout', async (req, res, next) => {
  try {
    const { data } = await baileys.post('/logout')
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/instance/webhook → no-op.
// No modelo Baileys o webhook é fixo no próprio servidor (WEBHOOK_URL no .env do
// whatsapp-server, apontando para a Edge Function do Supabase). Não há nada para
// configurar remotamente; respondemos OK para a UI de Configurações não quebrar.
router.post('/webhook', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook gerenciado pelo servidor Baileys (WEBHOOK_URL no .env do whatsapp-server).',
  })
})

module.exports = router
