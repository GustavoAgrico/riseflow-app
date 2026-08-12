// Teste dos writers de `direction` do servidor Express.
// Chama os dois writers REAIS (inbox.saveIncomingMessage e
// flowEngine.saveSentMessage) contra o Supabase, confere o direction gravado
// e apaga as linhas de teste. Não precisa de Baileys/Telegram conectado.
//
// Uso (a partir da pasta server/):
//   node test-direction-writers.js [USER_UUID_OPCIONAL]
// Se não passar o UUID, usa DEFAULT_USER_ID do .env ou o dono da 1ª conversa.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const { supabase, isConfigured } = require('./supabaseClient')
const inbox = require('./inbox')
const flowEngine = require('./flowEngine')

const IN_PHONE = '5599000000001'   // caminho recebido (inbox)
const OUT_PHONE = '5599000000002'  // caminho enviado (flowEngine)
const OUT_JID = `${OUT_PHONE}@s.whatsapp.net`

;(async () => {
  if (!isConfigured) {
    console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em server/.env')
    process.exit(1)
  }

  // user_id válido (FK para auth.users): arg > DEFAULT_USER_ID > dono da 1ª conversa
  let userId = process.argv[2] || process.env.DEFAULT_USER_ID
  if (!userId) {
    const { data } = await supabase.from('conversations').select('user_id').limit(1)
    userId = data?.[0]?.user_id
  }
  if (!userId) {
    console.error('❌ Sem user_id. Rode: node test-direction-writers.js <USER_UUID>')
    process.exit(1)
  }
  console.log('user_id de teste:', userId)

  // 1) writer de RECEBIDAS
  await inbox.saveIncomingMessage({ userId, phone: IN_PHONE, name: 'Teste Inbound', text: 'teste inbound', channel: 'test' })
  // 2) writer de ENVIADAS
  await flowEngine.saveSentMessage({ userId, jid: OUT_JID, contact: { name: 'Teste Outbound' }, pushName: '' }, 'teste outbound')

  // Confere
  const { data: rows } = await supabase
    .from('messages')
    .select('contact_phone, direction, content, created_at')
    .in('contact_phone', [IN_PHONE, OUT_PHONE])
    .order('created_at', { ascending: false })

  const inMsg = (rows || []).find(r => r.contact_phone === IN_PHONE)
  const outMsg = (rows || []).find(r => r.contact_phone === OUT_PHONE)
  const okIn = inMsg?.direction === 'inbound'
  const okOut = outMsg?.direction === 'outbound'

  console.log('\nResultado:')
  console.log(`  inbox.saveIncomingMessage → direction = ${inMsg?.direction ?? '(não gravou)'}  ${okIn ? '✅' : '❌ esperado inbound'}`)
  console.log(`  flowEngine.saveSentMessage → direction = ${outMsg?.direction ?? '(não gravou)'}  ${okOut ? '✅' : '❌ esperado outbound'}`)

  // Limpeza (mensagens antes das conversas por causa da FK)
  await supabase.from('messages').delete().in('contact_phone', [IN_PHONE, OUT_PHONE])
  await supabase.from('conversations').delete().in('contact_phone', [IN_PHONE, OUT_PHONE])
  console.log('\n🧹 Linhas de teste removidas.')

  process.exit(okIn && okOut ? 0 : 1)
})().catch(e => { console.error('Erro no teste:', e?.message ?? e); process.exit(1) })
