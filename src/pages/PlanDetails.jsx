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

export const PlanDetails = () => {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { plan: usage } = usePlan()
  const p = CATALOG[planId]
  if (!p) return <Navigate to="/plans" replace />

  const isCurrent = usage?.plan === planId
  const isFree = planId === 'free'
  const subscribe = () => abacatePayService.checkout(planId, user)

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

          {isCurrent
            ? <button disabled style={{ width:'100%', background:C.bd, border:'none', borderRadius:10, padding:'13px', color:C.mut, fontWeight:700, fontSize:15, cursor:'default', fontFamily:'inherit', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}><Check size={16} /> Este é o seu plano atual</button>
            : isFree
              ? <button disabled style={{ width:'100%', background:C.bd, border:'none', borderRadius:10, padding:'13px', color:C.mut, fontWeight:700, fontSize:15, cursor:'default', fontFamily:'inherit', opacity:.6 }}>Plano gratuito</button>
              : <button onClick={subscribe} style={{ width:'100%', background:C.pur, border:'none', borderRadius:10, padding:'13px', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>Assinar {p.name} — {p.price}{p.period}</button>}
        </div>
      </div>
    </div>
  )
}
