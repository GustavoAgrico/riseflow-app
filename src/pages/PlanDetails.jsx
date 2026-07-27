import React from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Gem, Check } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { usePlan } from '@hooks/usePlan'
import { abacatePayService } from '@services/abacatePayService'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', pur:'#7C3AED', grn:'#059669' }

// Conteúdo descritivo de cada plano.
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

const maskCPF = v => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/,'$1.$2.$3-$4').replace(/-$/,'')
const maskPhone = v => { const d = v.replace(/\D/g,'').slice(0,11); if (d.length<=2) return d.length?`(${d}`:''; if (d.length<=7) return `(${d.slice(0,2)}) ${d.slice(2)}`; return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` }

export const PlanDetails = () => {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { plan: usage } = usePlan()
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState(null)
  const [showForm, setShowForm] = React.useState(false)
  const [cpf, setCpf] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const p = CATALOG[planId]
  if (!p) return <Navigate to="/plans" replace />

  const isCurrent = usage?.plan === planId
  const isFree = planId === 'free'

  const subscribe = async () => {
    setErr(null)
    setLoading(true)
    try {
      await abacatePayService.checkout(planId, user, { cpf, phone })
    } catch (e) {
      setErr(e.message || 'Erro ao iniciar checkout. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribeClick = () => {
    setErr(null)
    setShowForm(true)
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 24px', borderBottom:`1px solid ${C.bd}`, background:C.card }}>
        <button onClick={()=>navigate('/plans')} style={{ background:'none', border:`1px solid ${C.bd}`, borderRadius:8, padding:'8px 12px', color:C.tx, cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>← Voltar aos planos</button>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}><Gem size={18} color={C.pur} /> Plano {p.name}</span>
      </div>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'32px 24px' }}>
        <div style={{ background:C.card, borderRadius:16, padding:28, border:`1px solid ${p.hot?C.pur:C.bd}`, position:'relative' }}>
          {p.hot && <span style={{ position:'absolute', top:-11, right:24, background:C.pur, fontSize:10, fontWeight:700, padding:'4px 12px', borderRadius:6 }}>MAIS POPULAR</span>}
          <h1 style={{ margin:0, fontSize:28, fontWeight:800 }}>{p.name}</h1>
          <p style={{ margin:'8px 0 0', fontSize:14, color:C.mut }}>{p.tagline}</p>
          <div style={{ fontSize:36, fontWeight:800, margin:'20px 0', color:C.pur }}>{p.price}<span style={{ fontSize:15, color:C.mut, fontWeight:500 }}>{p.period}</span></div>

          <p style={{ fontSize:12, fontWeight:700, color:C.mut, textTransform:'uppercase', letterSpacing:'.05em', margin:'0 0 12px' }}>O que está incluído</p>
          <ul style={{ listStyle:'none', padding:0, margin:'0 0 22px', display:'flex', flexDirection:'column', gap:10 }}>
            {p.feats.map(f => <li key={f} style={{ fontSize:14, display:'flex', alignItems:'center', gap:10 }}><Check size={15} color={C.grn} style={{ flexShrink:0 }} />{f}</li>)}
          </ul>

          <div style={{ background:C.pur+'18', border:`1px solid ${C.pur}55`, borderRadius:10, padding:'12px 14px', marginBottom:24 }}>
            <p style={{ margin:0, fontSize:13, color:C.tx }}><strong>Ideal para:</strong> {p.ideal}</p>
          </div>

          {err && <div style={{ background:'#EF444422', border:'1px solid #EF4444', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#FCA5A5' }}>{err}</div>}

          {isCurrent
            ? <button disabled style={{ width:'100%', background:C.bd, border:'none', borderRadius:10, padding:'13px', color:C.mut, fontWeight:700, fontSize:15, cursor:'default', fontFamily:'inherit', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}><Check size={16} /> Este é o seu plano atual</button>
            : isFree
              ? <button disabled style={{ width:'100%', background:C.bd, border:'none', borderRadius:10, padding:'13px', color:C.mut, fontWeight:700, fontSize:15, cursor:'default', fontFamily:'inherit', opacity:.6 }}>Plano gratuito</button>
              : <button onClick={handleSubscribeClick} disabled={loading} style={{ width:'100%', background:loading ? C.bd : C.pur, border:'none', borderRadius:10, padding:'13px', color:'#fff', fontWeight:700, fontSize:15, cursor:loading?'default':'pointer', fontFamily:'inherit', opacity:loading?.8:1 }}>{loading ? 'Aguarde...' : `Assinar ${p.name} — ${p.price}${p.period}`}</button>}

          {/* Modal de dados para pagamento via PIX */}
          {showForm && (
            <div style={{ position:'fixed', inset:0, background:'#000b', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={() => !loading && setShowForm(false)}>
              <div style={{ background:C.card, border:`1px solid ${C.bd}`, borderRadius:16, padding:28, width:360, maxWidth:'90vw' }} onClick={e => e.stopPropagation()}>
                <p style={{ margin:'0 0 4px', fontWeight:800, fontSize:16, color:C.tx }}>Dados para pagamento</p>
                <p style={{ margin:'0 0 20px', fontSize:13, color:C.mut }}>Necessário para gerar o PIX via AbacatePay</p>

                <label style={{ display:'block', fontSize:11, color:C.mut, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>CPF</label>
                <input
                  value={cpf} onChange={e => setCpf(maskCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  style={{ width:'100%', boxSizing:'border-box', background:'#0F172A', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', color:C.tx, fontSize:14, outline:'none', fontFamily:'DM Sans,sans-serif', marginBottom:14 }}
                />

                <label style={{ display:'block', fontSize:11, color:C.mut, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>Telefone / WhatsApp</label>
                <input
                  value={phone} onChange={e => setPhone(maskPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  style={{ width:'100%', boxSizing:'border-box', background:'#0F172A', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', color:C.tx, fontSize:14, outline:'none', fontFamily:'DM Sans,sans-serif', marginBottom:20 }}
                />

                {err && <div style={{ background:'#EF444422', border:'1px solid #EF4444', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#FCA5A5' }}>{err}</div>}

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setShowForm(false)} disabled={loading} style={{ flex:1, background:'none', border:`1px solid ${C.bd}`, borderRadius:10, padding:'12px', color:C.mut, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancelar</button>
                  <button onClick={subscribe} disabled={loading || cpf.replace(/\D/g,'').length < 11 || phone.replace(/\D/g,'').length < 10}
                    style={{ flex:2, background:C.pur, border:'none', borderRadius:10, padding:'12px', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'DM Sans,sans-serif', opacity:(loading || cpf.replace(/\D/g,'').length < 11 || phone.replace(/\D/g,'').length < 10) ? .5 : 1 }}>
                    {loading ? 'Aguarde...' : 'Ir para pagamento →'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
