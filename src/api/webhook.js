/**
 * Webhook handler for Evolution API → Supabase
 *
 * Deploy this as a Supabase Edge Function or standalone Node.js server.
 * Configure the Evolution API webhook URL to point to this endpoint.
 *
 * Evolution API webhook setup (via evolutionApi.js setWebhook):
 *   POST /evolution/webhook/set/test
 *   { url: "https://your-server.com/api/webhook", events: ["MESSAGES_UPSERT"] }
 *
 * Supabase Edge Function: supabase/functions/webhook/index.ts
 */

import { createClient } from '@supabase/supabase-js'
import { FlowEngine } from '../services/flowEngine.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role to bypass RLS
)

export const handler = async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { event, data } = body

  if (event === 'MESSAGES_UPSERT' && data?.messages?.length) {
    for (const msg of data.messages) {
      if (msg.key?.fromMe) continue // outbound handled by frontend
      if (!msg.key?.remoteJid || msg.key.remoteJid.includes('@g.us')) continue

      const jid        = msg.key.remoteJid
      const phone      = jid.split('@')[0]
      const pushName   = msg.pushName ?? ''
      const content    = extractText(msg)
      const externalId = msg.key.id

      if (!content) continue

      // Find or create conversation (user_id must be set via your mapping)
      // Here we use the instance name to find the owner — adapt to your setup
      const { data: existingConvs } = await supabase
        .from('conversations')
        .select('id, user_id')
        .eq('contact_phone', phone)
        .limit(1)

      let convId, userId

      if (existingConvs?.length) {
        convId = existingConvs[0].id
        userId = existingConvs[0].user_id
      } else {
        // Create new conversation — set user_id from your instance→user mapping
        // For single-user setups, hardcode or look up from a settings table
        const { data: newConv } = await supabase
          .from('conversations')
          .upsert({
            user_id: process.env.DEFAULT_USER_ID,
            contact_name: pushName || `+${phone}`,
            contact_phone: phone,
            contact_channel: 'whatsapp',
            last_message: content,
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          }, { onConflict: 'user_id,contact_phone' })
          .select()
          .single()

        if (!newConv) continue
        convId = newConv.id
        userId = newConv.user_id
      }

      // Insert message (upsert by external_id to avoid duplicates)
      await supabase
        .from('messages')
        .upsert({
          conversation_id: convId,
          user_id: userId,
          content,
          direction: 'inbound',
          status: 'delivered',
          channel: 'whatsapp',
          external_id: externalId,
          created_at: msg.messageTimestamp
            ? new Date(msg.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        }, { onConflict: 'external_id' })

      // Update conversation preview
      await supabase
        .from('conversations')
        .update({
          last_message: content,
          last_message_at: new Date().toISOString(),
          unread_count: supabase.rpc('increment_unread', { conv_id: convId }),
        })
        .eq('id', convId)

      // ── Trigger FlowEngine against all active flows for this user ──────
      try {
        const engine = new FlowEngine(userId, { supabaseClient: supabase })
        await engine.loadFlows()

        if (engine.flows.length > 0) {
          const message      = { content }
          const conversation = {
            id:              convId,
            contact_name:    pushName || `+${phone}`,
            contact_phone:   phone,
            contact_channel: 'whatsapp',
          }
          await engine.processIncomingMessage(message, conversation)
        }
      } catch (e) {
        console.error('[Webhook] FlowEngine error:', e.message)
      }
    }
  }

  return new Response('OK', { status: 200 })
}

function extractText(m) {
  const msg = m?.message
  if (!msg) return ''
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    (msg.imageMessage ? '📷 Imagem' : null) ??
    (msg.audioMessage ? '🎵 Áudio' : null) ??
    (msg.videoMessage ? '🎬 Vídeo' : null) ??
    (msg.documentMessage ? '📄 Documento' : null) ??
    ''
  )
}
