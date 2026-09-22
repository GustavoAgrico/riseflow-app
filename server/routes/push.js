const express = require('express')
const { supabase, isConfigured } = require('../supabaseClient')

const router = express.Router()

router.post('/subscribe', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  const { subscription } = req.body
  if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription obrigatória' })

  const userId = req.user.sub
  await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    keys_p256dh: subscription.keys?.p256dh,
    keys_auth: subscription.keys?.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  res.json({ ok: true })
})

router.post('/unsubscribe', async (req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'Supabase não configurado' })
  const { endpoint } = req.body
  if (!endpoint) return res.status(400).json({ error: 'endpoint obrigatório' })

  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', req.user.sub)
  res.json({ ok: true })
})

module.exports = router
