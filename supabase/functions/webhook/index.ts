// Evolution API → Supabase: receptor de mensagens recebidas do WhatsApp (push em tempo real)
// + AUTO-RESPOSTA IA 24/7 (server-side, funciona com o app fechado).
//
// Deploy:
//   supabase functions deploy webhook --no-verify-jwt
// Secrets (Dashboard → Edge Functions → webhook → Secrets, ou `supabase secrets set`):
//   SB_URL, SB_SERVICE_KEY, DEFAULT_USER_ID
//   (opcional, fallback p/ enviar pela Evolution se a tabela settings não tiver):
//   EVOLUTION_URL, EVOLUTION_KEY, EVOLUTION_INSTANCE
// As chaves de IA (openai_key/anthropic_key) e o niche_config são lidos do banco
// pelo service role — não precisam virar secret.
// Apontar a Evolution para a função (Integrações → WhatsApp → Webhook, ou setWebhook):
//   https://<seu-projeto>.supabase.co/functions/v1/webhook
//
// O service role key ignora o RLS — NUNCA exponha essa key no frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runFlowForMessage, type FlowConv, type FlowDeps } from './flow.ts'

const supabase = createClient(
  Deno.env.get('SB_URL')!,
  Deno.env.get('SB_SERVICE_KEY')!,
)
const DEFAULT_USER_ID = Deno.env.get('DEFAULT_USER_ID') ?? ''

// Fallbacks do servidor WhatsApp interno (Baileys) — usados só se a linha em
// settings não tiver config própria. Aceita BAILEYS_* ou, por retrocompat, EVOLUTION_*.
const WA_URL_FALLBACK = Deno.env.get('BAILEYS_URL') ?? Deno.env.get('EVOLUTION_URL') ?? ''
const WA_KEY_FALLBACK = Deno.env.get('BAILEYS_KEY') ?? Deno.env.get('EVOLUTION_KEY') ?? 'riseflow-server-2024'

const MODEL_MAP: Record<string, string> = {
  'OpenAI GPT-4o-mini': 'gpt-4o-mini',
  'OpenAI GPT-4o': 'gpt-4o',
  'Claude Sonnet': 'claude-sonnet-4-20250514',
  'Claude Haiku': 'claude-haiku-4-5-20251001',
}

const extractText = (m: any): string => {
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
    (msg.stickerMessage ? '🎭 Sticker' : null) ??
    ''
  )
}
const toUnix = (ts: any): number =>
  typeof ts === 'number' ? ts : (ts && typeof ts === 'object' && 'low' in ts ? ts.low : Number(ts) || 0)

// CORS — permite o botão "Testar Webhook" do app (POST cross-origin do navegador)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
}

/* ─── IA: monta a "personalidade" do atendente a partir do nicho + contato ─── */
const buildSystemPrompt = (niche: any, contactName?: string): string => [
  'Você é um atendente de WhatsApp profissional, simpático e prestativo' +
    (niche?.niche ? ` de uma empresa do ramo de ${niche.niche}.` : '.'),
  niche?.ideal_customer ? `Perfil de cliente do negócio: ${niche.ideal_customer}.` : '',
  contactName ? `Nome do cliente: ${contactName}. Trate-o pelo nome quando fizer sentido.` : '',
  'Responda SEMPRE em português do Brasil, de forma natural, calorosa e objetiva (2 a 5 frases).',
  'Use o histórico para dar continuidade e personalizar a conversa.',
  'Nunca invente preços, prazos, links ou políticas que não foram informados; se não souber, ofereça encaminhar a um atendente humano.',
  'Não use rótulos como "Atendente:" nem aspas. Escreva apenas o texto que será enviado ao cliente.',
].filter(Boolean).join('\n')

/* ─── IA: chamadas individuais por provedor ─── */
const callOpenAI = async (provider: string, systemPrompt: string, history: { role: string; content: string }[], key: string): Promise<string> => {
  const model = MODEL_MAP[provider] ?? 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...history], temperature: 0.6, max_tokens: 350 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI HTTP ${res.status}`)
  return (data?.choices?.[0]?.message?.content ?? '').trim()
}

const callClaude = async (provider: string, systemPrompt: string, history: { role: string; content: string }[], key: string): Promise<string> => {
  const model = MODEL_MAP[provider] ?? 'claude-haiku-4-5-20251001'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, system: systemPrompt, messages: history, temperature: 0.6, max_tokens: 350 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `Anthropic HTTP ${res.status}`)
  return (data?.content?.[0]?.text ?? '').trim()
}

/* ─── IA com fallback automático: tenta o provedor pedido e, se falhar
   (quota/erro), cai no outro provedor configurado. Cenário: OpenAI sem
   créditos → responde com o Claude. Lança só se TODOS falharem. ─── */
const callAI = async (
  provider: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  keys: { openai_key?: string; anthropic_key?: string },
): Promise<string> => {
  const reqIsClaude = provider.startsWith('Claude')
  const attempts: { kind: string; run: () => Promise<string> }[] = []
  const addOpenAI = (p: string) => { if (keys.openai_key) attempts.push({ kind: 'openai', run: () => callOpenAI(p, systemPrompt, history, keys.openai_key!) }) }
  const addClaude = (p: string) => { if (keys.anthropic_key) attempts.push({ kind: 'claude', run: () => callClaude(p, systemPrompt, history, keys.anthropic_key!) }) }

  if (reqIsClaude) { addClaude(provider); addOpenAI('OpenAI GPT-4o-mini') }
  else { addOpenAI(provider.startsWith('OpenAI') ? provider : 'OpenAI GPT-4o-mini'); addClaude('Claude Sonnet') }

  if (attempts.length === 0) throw new Error('sem chave de IA configurada')

  let lastErr = 'IA indisponível'
  for (let i = 0; i < attempts.length; i++) {
    try {
      const text = await attempts[i].run()
      if (text) return text
      lastErr = 'resposta vazia'
    } catch (e) {
      lastErr = (e as Error).message
      console.warn(`[AI] ${attempts[i].kind} falhou: ${lastErr}${i < attempts.length - 1 ? ' — tentando fallback...' : ''}`)
    }
  }
  throw new Error(lastErr)
}

/* ─── Servidor WhatsApp interno (Baileys): envia texto ───────────────────
   A resolução do 9º dígito (Brasil) e a formatação do JID ficam no próprio
   servidor Baileys (via onWhatsApp). Aqui basta POST { number, text } + apikey.
   `cfg.instance` é ignorado (Baileys é instância única). Devolve o id externo. */
const sendBaileys = async (cfg: { url: string; key: string }, phone: string, text: string) => {
  const cleanPhone = String(phone).replace(/@.*$/, '').replace(/\D/g, '')
  let base = (cfg.url ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) base = 'https://' + base
  const endpoint = `${base}/send/text`
  const headers = { 'Content-Type': 'application/json', apikey: cfg.key }

  console.log(`[Baileys] POST ${endpoint} | number=${cleanPhone} | text="${text.slice(0, 50)}"`)
  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ number: cleanPhone, text }) })
  const raw = await res.text()
  console.log(`[Baileys] status=${res.status} body=${raw.slice(0, 300)}`)

  if (res.ok) {
    let data: any = {}
    try { data = JSON.parse(raw) } catch { /* ok */ }
    return data?.key?.id ?? data?.messageId ?? null
  }

  let msg = `Baileys HTTP ${res.status}`
  try { const j = JSON.parse(raw); msg = j?.error ?? j?.message ?? msg } catch { /* body não-JSON */ }
  throw new Error(`${msg} | resposta: ${raw.slice(0, 200)}`)
}

/* ─── Auto-resposta IA: gera e envia uma resposta para a conversa ───────────
   Lê chaves/nicho/Evolution do banco (service role). Grava o outbound em
   messages para aparecer no app + realtime. Falha de forma silenciosa. ── */
const autoReply = async (conv: { id: string; user_id: string; contact_phone: string; contact_name?: string }) => {
  try {
    const userId = conv.user_id
    const [{ data: settings }, { data: niche }, { data: hist }] = await Promise.all([
      supabase.from('settings').select('openai_key, anthropic_key, evolution_url, evolution_key, evolution_instance').eq('user_id', userId).maybeSingle(),
      supabase.from('niche_config').select('niche, ideal_customer, provider').eq('user_id', userId).maybeSingle(),
      supabase.from('messages').select('content, direction').eq('conversation_id', conv.id).order('created_at', { ascending: true }).limit(12),
    ])

    const keys = { openai_key: settings?.openai_key, anthropic_key: settings?.anthropic_key }
    const provider = niche?.provider ?? 'OpenAI GPT-4o-mini'
    // Basta UMA chave: o callAI faz fallback OpenAI↔Claude automaticamente.
    if (!keys.openai_key && !keys.anthropic_key) {
      console.warn('[AutoReply] nenhuma chave de IA configurada — pulei')
      return
    }

    const history = (hist ?? []).map((m: any) => ({ role: m.direction === 'outbound' ? 'assistant' : 'user', content: m.content }))
    const systemPrompt = buildSystemPrompt(niche, conv.contact_name)
    const reply = await callAI(provider, systemPrompt, history, keys)
    if (!reply) { console.warn('[AutoReply] IA devolveu vazio'); return }

    const wa = {
      url: settings?.evolution_url || WA_URL_FALLBACK,
      key: settings?.evolution_key || WA_KEY_FALLBACK,
    }
    const externalId = await sendBaileys(wa, conv.contact_phone, reply)
    console.log('[AutoReply] enviado para', conv.contact_phone, '| extId:', externalId)

    const now = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      user_id: userId,
      content: reply,
      direction: 'outbound',
      status: 'delivered',
      channel: 'whatsapp',
      external_id: externalId,
      created_at: now,
    })
    await supabase.from('conversations').update({ last_message: reply, last_message_at: now }).eq('id', conv.id)
  } catch (e) {
    console.error('[AutoReply] falhou:', (e as Error).message)
  }
}

/* ─── Monta as dependências do runner de flows para um usuário ──────────────
   Busca config (Evolution + chaves IA + nicho) uma vez e devolve closures de
   envio de texto e de resposta de IA usadas pelos nós do FlowBuilder. ────── */
const buildFlowDeps = async (userId: string): Promise<FlowDeps> => {
  const [{ data: settings }, { data: niche }] = await Promise.all([
    supabase.from('settings').select('openai_key, anthropic_key, evolution_url, evolution_key, evolution_instance').eq('user_id', userId).maybeSingle(),
    supabase.from('niche_config').select('niche, ideal_customer, provider').eq('user_id', userId).maybeSingle(),
  ])
  const keys = { openai_key: settings?.openai_key, anthropic_key: settings?.anthropic_key }
  const provider = niche?.provider ?? 'OpenAI GPT-4o-mini'
  const wa = {
    url: settings?.evolution_url || WA_URL_FALLBACK,
    key: settings?.evolution_key || WA_KEY_FALLBACK,
  }

  const sendText: FlowDeps['sendText'] = async (conv, text) => {
    if (!text) return
    const externalId = await sendBaileys(wa, conv.contact_phone, text)
    const now = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      user_id: conv.user_id,
      content: text,
      direction: 'outbound',
      status: 'delivered',
      channel: conv.contact_channel ?? 'whatsapp',
      external_id: externalId,
      created_at: now,
    })
    await supabase.from('conversations').update({ last_message: text, last_message_at: now }).eq('id', conv.id)
  }

  const aiReply: FlowDeps['aiReply'] = async (conv, node) => {
    const { data: hist } = await supabase.from('messages')
      .select('content, direction').eq('conversation_id', conv.id).order('created_at', { ascending: true }).limit(12)
    const history = (hist ?? []).map((m: any) => ({ role: m.direction === 'outbound' ? 'assistant' : 'user', content: m.content }))
    let systemPrompt = buildSystemPrompt(niche, conv.contact_name)
    const extra = node?.data?.systemPrompt ?? node?.data?.prompt
    if (extra) systemPrompt += `\n\nInstruções deste passo do fluxo: ${extra}`
    return await callAI(provider, systemPrompt, history, keys)
  }

  return { supabase, userId, sendText, aiReply }
}

/* Conta mensagens recebidas (inbound) de uma conversa — usado por gatilhos/condições "primeira vez". */
const countInbound = async (conversationId: string): Promise<number> => {
  const { count } = await supabase.from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
  return count ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  let body: any
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400, headers: CORS }) }

  const event = String(body?.event ?? '').toUpperCase().replace('.', '_')
  if (event !== 'MESSAGES_UPSERT') return new Response('ignored', { status: 200, headers: CORS })

  const messages = body?.data?.messages ?? (body?.data?.key ? [body.data] : [])

  // Conversas que receberam inbound → processadas 1x após o loop (flow ou IA).
  // Guarda a conversa normalizada + o texto da última mensagem recebida.
  const inbound = new Map<string, { conv: FlowConv; ai_auto_reply: boolean; lastText: string }>()

  for (const msg of messages) {
    if (msg?.key?.fromMe) continue // outbound já é tratado pelo frontend / é a própria auto-resposta
    const jid = msg?.key?.remoteJid ?? ''
    if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue

    const phone = jid.split('@')[0].replace(/\D/g, '')
    const content = extractText(msg)
    if (!content || phone.length < 10) continue

    const externalId = msg.key.id
    const ts = toUnix(msg.messageTimestamp)
    const createdAt = ts ? new Date(ts * 1000).toISOString() : new Date().toISOString()

    // Localiza a conversa existente (dá dono) ou abre uma nova com o DEFAULT_USER_ID
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, user_id, ai_auto_reply, contact_name, contact_channel, flow_id, flow_node_id, flow_vars')
      .eq('contact_phone', phone)
      .limit(1)
      .maybeSingle()

    let convRow = conv
    let convId = conv?.id
    let userId = conv?.user_id

    if (!convId) {
      if (!DEFAULT_USER_ID) continue // sem dono não dá para criar a conversa
      const { data: nc } = await supabase
        .from('conversations')
        .upsert({
          user_id: DEFAULT_USER_ID,
          contact_name: msg.pushName || `+${phone}`,
          contact_phone: phone,
          contact_channel: 'whatsapp',
          last_message: content,
          last_message_at: createdAt,
          unread_count: 1,
          status: 'active',
        }, { onConflict: 'user_id,contact_phone' })
        .select('id, user_id, ai_auto_reply, contact_name, contact_channel, flow_id, flow_node_id, flow_vars')
        .single()
      convRow = nc
      convId = nc?.id
      userId = nc?.user_id
      if (!convId) continue
    }

    // Grava a mensagem (idempotente por external_id)
    await supabase.from('messages').upsert({
      conversation_id: convId,
      user_id: userId,
      content,
      direction: 'inbound',
      status: 'delivered',
      channel: 'whatsapp',
      external_id: externalId,
      created_at: createdAt,
    }, { onConflict: 'external_id', ignoreDuplicates: true })

    // Atualiza preview e incrementa não-lidas (apenas em conversa já existente)
    await supabase.from('conversations')
      .update({ last_message: content, last_message_at: createdAt })
      .eq('id', convId)
    if (conv?.id) await supabase.rpc('increment_unread', { conv_id: convId })

    // Registra a conversa para processamento pós-loop (flow stateful → fallback IA).
    inbound.set(convId, {
      conv: {
        id: convId,
        user_id: userId!,
        contact_phone: phone,
        contact_name: convRow?.contact_name,
        contact_channel: convRow?.contact_channel ?? 'whatsapp',
        flow_id: convRow?.flow_id ?? null,
        flow_node_id: convRow?.flow_node_id ?? null,
        flow_vars: convRow?.flow_vars ?? {},
      },
      ai_auto_reply: !!convRow?.ai_auto_reply,
      lastText: content,
    })
  }

  // Processa cada conversa 1x (evita spam em rajada):
  //   1) tenta o flow do FlowBuilder (stateful — inicia/retoma a sequência);
  //   2) se nenhum flow tratou E a auto-resposta está ligada, cai na IA genérica.
  console.log(`[Webhook] ${inbound.size} conversa(s) com mensagem recebida para processar`)
  for (const { conv, ai_auto_reply, lastText } of inbound.values()) {
    try {
      const deps = await buildFlowDeps(conv.user_id)
      const inboundCount = await countInbound(conv.id)
      const handled = await runFlowForMessage(deps, conv, lastText, inboundCount)
      if (handled) {
        console.log('[Webhook] ✅ tratado por flow')
      } else if (ai_auto_reply) {
        console.log('[Webhook] sem flow → auto-resposta IA (ai_auto_reply ON)')
        await autoReply({ id: conv.id, user_id: conv.user_id, contact_phone: conv.contact_phone, contact_name: conv.contact_name })
      } else {
        console.log('[Webhook] sem flow e ai_auto_reply OFF → nada a responder')
      }
    } catch (e) {
      console.error('[Webhook] processamento da conversa falhou:', (e as Error).message)
    }
  }

  return new Response('OK', { status: 200, headers: CORS })
})
