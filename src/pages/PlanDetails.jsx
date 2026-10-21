import React from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Gem, Check, ArrowRight, Loader2, Clock } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { usePlan } from '@hooks/usePlan'
import { api } from '@services/api'

const C = { bg:'var(--bg)', card:'var(--card)', bd:'var(--border)', tx:'var(--ink-1)', mut:'var(--ink-3)', acc:'#FF6B35', grad:'linear-gradient(135deg,#FF6B35,#E55100)', grn:'#059669', red:'#EF4444' }

const CATALOG = {
  free: { name:'Grátis', price:'R$0', period:'', tagline:'Para experimentar o RiseFlow sem compromisso.',
    feats:['50 mensagens/mês','1 atendente','1 flow','100 contatos'],
    ideal:'Para quem está começando e quer testar a automação de atendimento.' },
  starter: { name:'Starter', price:'R$67', period:'/mês', tagline:'Para pequenos negócios que querem automatizar o WhatsApp.',
    feats:['1.000 mensagens/mês','1 atendente','3 flows','500 contatos','Suporte por e-mail'],
    ideal:'Autônomos e pequenas equipes com volume moderado de conversas.' },
  pro: { name:'Pro', price:'R$197', period:'/mês', tagline:'Para times que vendem em escala com inteligência artificial.', hot:true,
    feats:['10.000 mensagens/mês','5 atendentes','Flows ilimitados','5.000 contatos','Inteligência Artificial','Qualificação de leads com IA'],
    ideal:'Negócios em crescimento que precisam de IA e múltiplos atendentes.' },
  enterprise: { name:'Enterprise', price:'R$497', period:'/mês', tagline:'Para operações grandes com necessidades dedicadas.',
    feats:['Mensagens ilimitadas','Atendentes ilimitados','Tudo ilimitado','API dedicada','Suporte prioritário'],
    ideal:'Empresas com alto volume e requisitos de suporte e API dedicados.' },
}

const maskPhone = (raw) => {
  const n = raw.replace(/\D/g, '').slice(0, 11)
  if (n.length <= 2) return n.length ? `(${n}` : ''
  if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`
  if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
}

const inputStyle = (hasErr) => ({
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg)',
  border: `1px solid ${hasErr ? C.red : C.bd}`,
  borderRadius: 8, padding: '11px 13px',
  color: C.tx, fontSize: 15, outline: 'none',
  fontFamily: 'DM Sans,sans-serif',
  transition: 'border-color .15s',
})

export const PlanDetails = () => {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { plan: usage } = usePlan()

  const [phone, setPhone] = React.useState('')
  const [phoneErr, setPhoneErr] = React.useState(null)
  const [apiErr, setApiErr] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [request, setRequest] = React.useState(null)

  React.useEffect(() => {
    api.get('/access-requests/mine').then(({ data }) => setRequest(data)).catch(() => {})
  }, [])

  const p = CATALOG[planId]
  if (!p) return <Navigate to="/plans" replace />

  const isCurrent = usage?.plan === planId
  const isFree = planId === 'free'
  const isPending = request?.status === 'pending' && request?.plan_id === planId

  const handleRequest = async () => {
    const digits = phone.replace(/\D/g, '').length
    if (digits > 0 && digits < 10) { setPhoneErr('Digite um telefone válido (com DDD)'); return }
    setPhoneErr(null)
    setApiErr(null)
    setLoading(true)
    try {
      const { data } = await api.post('/access-requests', {
        planId,
        name: user?.user_metadata?.full_name || '',
        phone,
      })
      if (data?.status === 'approved') { window.location.href = '/dashboard'; return }
      setRequest({ status: 'pending', plan_id: planId })
    } catch (e) {
      // A resposta pode ter se perdido (timeout/deploy) com o pedido já gravado.
      const { data: mine } = await api.get('/access-requests/mine').catch(() => ({}))
      if (mine?.status === 'pending' && mine.plan_id === planId) setRequest(mine)
      else setApiErr(e.response?.data?.error || 'Não foi possível enviar a solicitação. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 24px', borderBottom:`1px solid ${C.bd}`, background:C.card }}>
        <button onClick={() => navigate('/plans')} style={{ background:'none', border:`1px solid ${C.bd}`, borderRadius:8, padding:'8px 12px', color:C.tx, cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>← Voltar aos planos</button>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}><Gem size={18} color={C.acc} /> Plano {p.name}</span>
      </div>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'32px 24px' }}>
        <div style={{ background:C.card, borderRadius:16, padding:28, border:`1px solid ${p.hot ? C.acc : C.bd}`, position:'relative' }}>
          {p.hot && <span style={{ position:'absolute', top:-11, right:24, background:'linear-gradient(135deg,#FF6B35,#7C3AED)', fontSize:10, fontWeight:700, padding:'4px 12px', borderRadius:6 }}>MAIS POPULAR</span>}

          <h1 style={{ margin:0, fontSize:28, fontWeight:800 }}>{p.name}</h1>
          <p style={{ margin:'8px 0 0', fontSize:14, color:C.mut }}>{p.tagline}</p>
          <div style={{ fontSize:36, fontWeight:800, margin:'20px 0', color:C.acc }}>
            {p.price}<span style={{ fontSize:15, color:C.mut, fontWeight:500 }}>{p.period}</span>
          </div>

          <p style={{ fontSize:12, fontWeight:700, color:C.mut, textTransform:'uppercase', letterSpacing:'.05em', margin:'0 0 12px' }}>O que está incluído</p>
          <ul style={{ listStyle:'none', padding:0, margin:'0 0 22px', display:'flex', flexDirection:'column', gap:10 }}>
            {p.feats.map(f => (
              <li key={f} style={{ fontSize:14, display:'flex', alignItems:'center', gap:10 }}>
                <Check size={15} color={C.grn} style={{ flexShrink:0 }} />{f}
              </li>
            ))}
          </ul>

          <div style={{ background:C.acc+'18', border:`1px solid ${C.acc}55`, borderRadius:10, padding:'12px 14px', marginBottom:24 }}>
            <p style={{ margin:0, fontSize:13, color:C.tx }}><strong>Ideal para:</strong> {p.ideal}</p>
          </div>

          {isCurrent ? (
            <button disabled style={{ width:'100%', background:C.bd, border:'none', borderRadius:10, padding:'13px', color:C.mut, fontWeight:700, fontSize:15, cursor:'default', fontFamily:'inherit', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <Check size={16} /> Este é o seu plano atual
            </button>
          ) : isFree ? (
            <button disabled style={{ width:'100%', background:C.bd, border:'none', borderRadius:10, padding:'13px', color:C.mut, fontWeight:700, fontSize:15, cursor:'default', fontFamily:'inherit', opacity:.6 }}>
              Plano gratuito
            </button>
          ) : (
            <div>
              <div style={{ borderTop:`1px solid ${C.bd}`, margin:'0 0 20px' }} />
              {isPending ? (
                <div style={{ background:'#F59E0B18', border:'1px solid #F59E0B66', borderRadius:10, padding:'16px', display:'flex', gap:12, alignItems:'flex-start' }}>
                  <Clock size={20} color="#F59E0B" style={{ flexShrink:0, marginTop:2 }} />
                  <div>
                    <p style={{ margin:0, fontSize:15, fontWeight:700 }}>Solicitação enviada</p>
                    <p style={{ margin:'6px 0 0', fontSize:13, color:C.mut, lineHeight:1.5 }}>
                      Recebemos seu pedido do plano {p.name} ({p.price}{p.period}). Você recebe um e-mail assim que o acesso for liberado.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontSize:13, fontWeight:700, color:C.mut, margin:'0 0 14px', textTransform:'uppercase', letterSpacing:'.04em' }}>
                    Solicitar acesso
                  </p>
                  <p style={{ fontSize:12, color:C.mut, margin:'-8px 0 16px', lineHeight:1.5 }}>
                    Nossa equipe analisa o pedido e libera o plano para sua conta. Deixe um WhatsApp se quiser que a gente fale com você.
                  </p>

                  <div style={{ marginBottom:20 }}>
                    <label style={{ display:'block', fontSize:12, color:phoneErr ? C.red : C.mut, fontWeight:600, marginBottom:5 }}>WhatsApp (opcional)</label>
                    <input
                      value={phone}
                      onChange={e => { setPhone(maskPhone(e.target.value)); setPhoneErr(null) }}
                      placeholder="(11) 99999-9999"
                      inputMode="numeric"
                      style={inputStyle(phoneErr)}
                    />
                    {phoneErr && <p style={{ margin:'4px 0 0', fontSize:12, color:C.red }}>{phoneErr}</p>}
                  </div>

                  {apiErr && (
                    <div style={{ background:'#EF444422', border:`1px solid ${C.red}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#FCA5A5' }}>
                      {apiErr}
                    </div>
                  )}

                  <button
                    onClick={handleRequest}
                    disabled={loading}
                    style={{ width:'100%', background:loading ? C.bd : C.grad, boxShadow: loading ? 'none' : '0 8px 20px -8px rgba(255,107,53,0.6)', border:'none', borderRadius:10, padding:'14px', color:'#fff', fontWeight:700, fontSize:15, cursor: loading ? 'default' : 'pointer', fontFamily:'DM Sans,sans-serif', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, transition:'background .15s' }}
                  >
                    {loading
                      ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite' }} /> Enviando solicitação…</>
                      : <><ArrowRight size={16} /> Solicitar acesso — {p.price}{p.period}</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  )
}
