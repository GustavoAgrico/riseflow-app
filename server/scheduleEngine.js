// Motor de agendamentos server-side.
// Verifica agendamentos vencidos a cada minuto para TODOS os usuários.
// Substitui o dispatch client-side (setInterval no browser) da página Schedules.
const { supabase, isConfigured } = require('./supabaseClient')
const { baileys } = require('./baileysClient')

const POLL_INTERVAL_MS = 60_000

const pad = n => String(n).padStart(2, '0')
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function nextDate(dateStr, freq) {
  const d = new Date(dateStr + 'T00:00:00')
  if      (freq === 'diario')  d.setDate(d.getDate() + 1)
  else if (freq === 'semanal') d.setDate(d.getDate() + 7)
  else if (freq === 'mensal')  d.setMonth(d.getMonth() + 1)
  else if (freq === 'segsex')  { do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6) }
  else                         d.setDate(d.getDate() + 1)
  return dstr(d)
}

function substitute(template, ctx) {
  return String(template ?? '')
    .replace(/\{+nome\}+/gi,     ctx.name    || 'Cliente')
    .replace(/\{+empresa\}+/gi,  ctx.company || '')
    .replace(/\{+telefone\}+/gi, ctx.phone   || '')
}

async function canSend(userId) {
  try {
    const { data } = await supabase.from('usage')
      .select('messages_sent, messages_limit, plan, created_at')
      .eq('user_id', userId).maybeSingle()
    if (!data) return true
    if (data.messages_limit === -1) return true
    if (data.plan === 'free') {
      const exp = new Date(data.created_at)
      exp.setDate(exp.getDate() + 2)
      if (new Date() > exp) return false
    }
    return data.messages_sent < data.messages_limit
  } catch { return true }
}

async function incrementUsage(userId) {
  try {
    const { data } = await supabase.from('usage').select('messages_sent').eq('user_id', userId).maybeSingle()
    if (data) await supabase.from('usage').update({ messages_sent: (data.messages_sent ?? 0) + 1 }).eq('user_id', userId)
  } catch {}
}

async function tick() {
  if (!isConfigured) return
  try {
    const now = new Date()
    const todayStr = dstr(now)
    const hour = now.getHours()

    // Busca todos os agendamentos pendentes cuja data já passou ou é hoje
    const { data: rows } = await supabase
      .from('schedules')
      .select('*')
      .eq('status', 'agendado')
      .lte('send_date', todayStr)

    if (!rows?.length) return

    for (const r of rows) {
      // Verifica se o horário chegou
      const dt = new Date(`${r.send_date}T${r.send_time || '00:00'}:00`)
      if (isNaN(dt) || dt > now) continue

      // Horário comercial (8h–18h)
      if (r.business_hours && (hour < 8 || hour >= 18)) continue

      // Verifica limite do plano
      if (!(await canSend(r.user_id))) continue

      // Busca nome da empresa do contato (melhor esforço)
      const { data: contact } = await supabase
        .from('clients')
        .select('name, company')
        .eq('user_id', r.user_id)
        .ilike('phone', `%${String(r.phone ?? '').replace(/\D/g, '')}%`)
        .maybeSingle()

      const ctx = { name: r.name || contact?.name || 'Cliente', phone: r.phone || '', company: contact?.company || '' }
      const text = substitute(r.msg, ctx)

      try {
        await baileys.post('/send/text', { number: String(r.phone).replace(/\D/g, ''), text })
        await incrementUsage(r.user_id)

        const nowIso = now.toISOString()
        if (r.type === 'recorrente') {
          const nd = nextDate(r.send_date, r.freq)
          const ended = r.end_date && nd > r.end_date
          await supabase.from('schedules').update(
            ended
              ? { status: 'enviado', last_sent_at: nowIso }
              : { send_date: nd, last_sent_at: nowIso }
          ).eq('id', r.id)
        } else {
          await supabase.from('schedules').update({ status: 'enviado', last_sent_at: nowIso }).eq('id', r.id)
        }
        console.log(`[schedule] enviado para ${r.phone} (user ${r.user_id})`)
      } catch (e) {
        await supabase.from('schedules').update({ status: 'falhou' }).eq('id', r.id)
        console.error(`[schedule] falha ao enviar para ${r.phone}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[schedule] erro no tick:', e.message)
  }
}

function start() {
  if (!isConfigured) {
    console.warn('[schedule] Supabase não configurado — motor de agendamentos desativado')
    return
  }
  tick()
  setInterval(tick, POLL_INTERVAL_MS)
  console.log('[schedule] motor iniciado — verifica a cada 60s')
}

module.exports = { start }
