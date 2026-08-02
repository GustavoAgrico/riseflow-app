// Motor de campanhas server-side.
// Roda no processo Express — verifica campanhas agendadas a cada minuto e retoma
// campanhas que estavam enviando quando o servidor foi reiniciado.
const { supabase, isConfigured } = require('./supabaseClient')
const { baileys } = require('./baileysClient')
const { sendMailForUser } = require('./emailClient')

const POLL_INTERVAL_MS = 60_000   // verifica campanhas a cada 60s
const MAX_PARALLEL    = 3          // máx. de campanhas enviando simultaneamente

// Campanhas atualmente em execução neste processo (campaignId → intervalId)
const _running = new Map()

// Substitui variáveis na mensagem com dados do destinatário
function sub(template, ctx) {
  return (template ?? '')
    .replace(/\{+nome\}+/gi,      ctx.contact_name    ?? 'Cliente')
    .replace(/\{+telefone\}+/gi,  ctx.phone           ?? '')
    .replace(/\{+email\}+/gi,     ctx.email           ?? '')
    .replace(/\{+empresa\}+/gi,   ctx.contact_company ?? '')
    .replace(/\{+data_hoje\}+/gi, new Date().toLocaleDateString('pt-BR'))
}

// Verifica se o usuário ainda pode enviar (respeita limite do plano)
async function canSend(userId) {
  try {
    const { data } = await supabase.from('usage').select('messages_sent, messages_limit, plan, created_at').eq('user_id', userId).maybeSingle()
    if (!data) return true
    if (data.messages_limit === -1) return true
    // Trial gratuito: 2 dias
    if (data.plan === 'free') {
      const created = new Date(data.created_at)
      created.setDate(created.getDate() + 2)
      if (new Date() > created) return false
    }
    return data.messages_sent < data.messages_limit
  } catch { return true }
}

async function incrementUsage(userId) {
  try {
    const { data } = await supabase.from('usage').select('messages_sent').eq('user_id', userId).maybeSingle()
    if (data) await supabase.from('usage').update({ messages_sent: (data.messages_sent ?? 0) + 1 }).eq('user_id', userId)
  } catch { /* não bloqueia o envio */ }
}

// Envia uma única campanha, mensagem por mensagem, no intervalo configurado
async function runCampaign(campaign) {
  const campId = campaign.id
  if (_running.has(campId)) return  // já está rodando neste processo

  const { data: msgs } = await supabase
    .from('campaign_messages')
    .select('*')
    .eq('campaign_id', campId)
    .eq('status', 'pending')
    .order('id')

  if (!msgs?.length) {
    await supabase.from('campaigns').update({ status: 'done' }).eq('id', campId)
    return
  }

  await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campId)

  const isEmail = campaign.channel === 'email'
  let i = 0

  const intervalId = setInterval(async () => {
    if (i >= msgs.length) {
      clearInterval(intervalId)
      _running.delete(campId)
      await supabase.from('campaigns').update({ status: 'done' }).eq('id', campId)
      console.log(`[campaign] ${campId} concluída (${msgs.length} mensagens)`)
      return
    }

    // Verifica limite do plano a cada mensagem
    if (!isEmail && !(await canSend(campaign.user_id))) {
      clearInterval(intervalId)
      _running.delete(campId)
      await supabase.from('campaigns').update({ status: 'paused_limit' }).eq('id', campId)
      console.log(`[campaign] ${campId} pausada — limite do plano atingido`)
      return
    }

    const m = msgs[i++]
    const text = sub(campaign.message, m)
    let ok = false, errMsg = null

    try {
      if (isEmail) {
        await sendMailForUser(campaign.user_id, {
          to: m.email,
          subject: sub(campaign.subject, m) || campaign.name,
          text,
        })
      } else {
        await baileys.post('/send/text', { number: m.phone, text })
      }
      ok = true
    } catch (e) {
      errMsg = e?.response?.data?.error || e?.message || 'Erro desconhecido'
    }

    await supabase.from('campaign_messages').update({
      status:  ok ? 'sent' : 'failed',
      error:   errMsg,
      sent_at: ok ? new Date().toISOString() : null,
    }).eq('id', m.id)

    await supabase.from('campaigns').update({ sent: i }).eq('id', campId)

    if (ok && !isEmail) await incrementUsage(campaign.user_id)
  }, (campaign.interval_seconds ?? 3) * 1000)

  _running.set(campId, intervalId)
  console.log(`[campaign] iniciando ${campId} — ${msgs.length} mensagens, canal: ${campaign.channel ?? 'whatsapp'}`)
}

// Verifica e dispara campanhas pendentes / agendadas
async function tick() {
  if (!isConfigured) return
  if (_running.size >= MAX_PARALLEL) return

  try {
    const now = new Date().toISOString()

    // 1. Campanhas agendadas cuja hora chegou
    const { data: scheduled } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)

    // 2. Campanhas que estavam enviando quando o servidor reiniciou
    const { data: sending } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'sending')

    const due = [...(scheduled ?? []), ...(sending ?? [])]
      .filter(c => !_running.has(c.id))
      .slice(0, MAX_PARALLEL - _running.size)

    for (const camp of due) {
      runCampaign(camp).catch(e => {
        console.error(`[campaign] erro ao iniciar ${camp.id}:`, e.message)
        _running.delete(camp.id)
      })
    }
  } catch (e) {
    console.error('[campaign] erro no tick:', e.message)
  }
}

// Para uma campanha em execução (chamado pela rota pause)
async function pauseCampaign(campaignId) {
  const id = _running.get(campaignId)
  if (id) { clearInterval(id); _running.delete(campaignId) }
  await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaignId)
}

// Inicia o motor — chamado uma vez no startup do Express
function start() {
  if (!isConfigured) {
    console.warn('[campaign] Supabase não configurado — motor de campanhas desativado')
    return
  }
  // Primeiro tick imediato (retoma campanhas interrompidas no restart)
  tick()
  setInterval(tick, POLL_INTERVAL_MS)
  console.log('[campaign] motor iniciado — verifica a cada 60s')
}

module.exports = { start, pauseCampaign, runCampaign }
