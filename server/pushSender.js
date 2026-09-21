const webpush = require('web-push')
const { supabase, isConfigured } = require('./supabaseClient')

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:noreply@riseflow.app',
} = process.env

let ready = false
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    const pub = VAPID_PUBLIC_KEY.replace(/=+$/, '')
    const priv = VAPID_PRIVATE_KEY.replace(/=+$/, '')
    webpush.setVapidDetails(VAPID_SUBJECT, pub, priv)
    ready = true
    console.log('[push] VAPID configurado — notificações push ativas')
  } catch (err) {
    console.warn('[push] VAPID inválido — push desativado:', err.message)
  }
} else {
  console.log('[push] VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY ausente — push desativado')
}

async function sendPush(userId, payload) {
  if (!ready || !isConfigured) return
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, keys_p256dh, keys_auth')
    .eq('user_id', userId)
  if (!subs?.length) return

  const body = JSON.stringify(payload)
  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      }, body)
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }
}

module.exports = { sendPush, ready }
