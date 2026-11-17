// Teste da ligação por IA sem passar pelo CRM nem pelo banco.
//   node server/scripts/test-ai-call.js +55DDDNUMERO
// Liga para o número, acompanha a conversa e imprime resultado, resumo e transcrição.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const el = require('../elevenlabs')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!el.isConfigured()) {
    console.error('Faltam variáveis no server/.env: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID')
    process.exit(1)
  }
  const toNumber = el.toE164(process.argv[2])
  if (!toNumber) {
    console.error('Uso: node scripts/test-ai-call.js +55DDDNUMERO')
    process.exit(1)
  }
  const allowed = el.testNumbers()
  if (allowed.length && !allowed.includes(toNumber)) {
    console.error(`Modo teste: ${toNumber} não está em AI_CALLS_TEST_NUMBERS.`)
    process.exit(1)
  }

  console.log(`Ligando para ${toNumber}…`)
  const call = await el.startOutboundCall({
    toNumber,
    dynamicVariables: {
      lead_name: 'Teste',
      lead_company: 'Empresa de Teste',
      business_name: process.env.AI_CALLS_BUSINESS_NAME || 'nossa empresa',
      niche: 'teste do RiseFlow',
      ideal_customer: 'empresa que atende clientes pelo WhatsApp',
      questions: 'Quantos atendimentos por dia vocês fazem? | Quem decide a compra? | Qual o prazo para resolver isso?',
    },
  })
  console.log(`Conversa ${call.conversationId} · Twilio ${call.callSid}`)

  let last = ''
  const deadline = Date.now() + 10 * 60000
  let conv = null
  while (Date.now() < deadline) {
    await sleep(5000)
    conv = await el.getConversation(call.conversationId)
    if (conv.status !== last) { console.log(`status: ${conv.status}`); last = conv.status }
    if (conv.status === 'done' || conv.status === 'failed') break
  }

  const r = el.mapConversation(conv || {})
  console.log('\n— Resultado —')
  console.log(`chamada: ${r.call_result || '—'} · duração: ${r.duration_secs ?? '—'}s · custo: ${r.cost_usd != null ? 'US$ ' + r.cost_usd : '—'}`)
  if (r.error) console.log(`erro: ${r.error}`)
  if (r.summary) console.log(`resumo: ${r.summary}`)
  console.log('\n— Transcrição —')
  for (const t of r.transcript) console.log(`${t.role === 'agent' ? 'IA' : 'Lead'}: ${t.message}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
