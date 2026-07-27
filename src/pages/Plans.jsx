import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gem, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { usageService } from '@services/usageService'
import { StripeService } from '@services/stripeService'
import { checkoutService } from '@services/checkoutService'
import { logger } from '@services/activityLogger'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', pur:'#7C3AED', grn:'#059669', red:'#EF4444' }
const stripe = new StripeService(supabase)

const CATALOG = [
  {
    id:'free', name:'Grátis', price:'R$0',
    feats:['20 mensagens · válido por 2 dias','1 atendente','1 flow','100 contatos'],
    integrations:'WhatsApp',
  },
  {
    id:'starter', name:'Starter', price:'R$67',
    feats:['1.000 mensagens/mês','1 atendente','3 flows','500 contatos'],
    integrations:'WhatsApp + Telegram',
  },
  {
    id:'pro', name:'Pro', price:'R$197',
    feats:['10.000 mensagens/mês','5 atendentes','Flows ilimitados','5.000 contatos'],
    integrations:'WhatsApp + Telegram + Email',
    hot:true,
  },
  {
    id:'enterprise', name:'Enterprise', price:'Sob consulta',
    feats:['Mensagens ilimitadas','Atendentes ilimitados','Tudo ilimitado','Suporte dedicado'],
    integrations:'Todos os canais (+ Instagram, Facebook, IA)',
  },
]

const S = {
  btn:(bg=C.pur)=>({ background:bg,border:'none',borderRadius:8,padding:'10px 16px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',width:'100%' }),
  ghost:{ background:'none',border:`1px solid ${C.bd}`,borderRadius:8,padding:'8px 12px',color:C.tx,cursor:'pointer',fontFamily:'inherit',fontSize:13,textDecoration:'none' },
}

export const Plans = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [usage, setUsage] = useState(null)
  const [toast, setToast] = useState(null)
  const flash = (text, ok = true, ms = 4000) => { setToast({ text, ok }); setTimeout(() => setToast(null), ms) }

  useEffect(() => {
    if (!user?.id) return
    const run = async () => {
      const result = await checkoutService.handleReturn(user)
      if (result.status === 'success') flash(`Plano ${result.plan} ativado com sucesso!`)
      if (result.status === 'canceled') flash('Pagamento cancelado.', false)
      try { setUsage(await usageService.getUsage(user.id)) } catch {}
    }
    run()
  }, [user])

  const current = usage?.plan ?? 'free'
  const subscribe = (planId) => { logger.log(user?.id, 'plan_upgraded', { category: 'billing', description: 'Plano alterado para ' + (CATALOG.find(p => p.id === planId)?.name || planId) }); navigate(`/plans/${planId}`) }
  const portal = async () => {
    try { await stripe.getPortalUrl(user?.id) }
    catch (e) { flash('Erro ao abrir o portal.', false); console.error(e) }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 24px', borderBottom:`1px solid ${C.bd}`, background:C.card }}>
        <a href="/dashboard" style={S.ghost}>← Voltar</a>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}><Gem size={18} color={C.pur} /> Planos</span>
        {usage && <span style={{ background:C.pur+'22', color:C.pur, borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700 }}>Plano atual: {current}</span>}
        {current !== 'free' && <button onClick={portal} style={{ ...S.ghost, marginLeft:'auto', cursor:'pointer' }}>Gerenciar assinatura</button>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, padding:24 }}>
        {CATALOG.map(p => {
          const isCurrent = p.id === current
          return (
            <div key={p.id} style={{ background:C.card, borderRadius:14, padding:20, border:`1px solid ${p.hot?C.pur:C.bd}`, position:'relative' }}>
              {p.hot && <span style={{ position:'absolute', top:-10, right:16, background:C.pur, fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:6 }}>POPULAR</span>}
              <div style={{ fontWeight:800, fontSize:16 }}>{p.name}</div>
              <div style={{ fontSize:24, fontWeight:800, margin:'6px 0 14px', color:C.pur }}>{p.price}{p.id!=='enterprise'&&p.id!=='free' && <span style={{ fontSize:12, color:C.mut, fontWeight:500 }}>/mês</span>}</div>
              <ul style={{ listStyle:'none', padding:0, margin:'0 0 12px', display:'flex', flexDirection:'column', gap:8 }}>
                {p.feats.map(f => <li key={f} style={{ fontSize:13, color:C.mut, display:'flex', alignItems:'center', gap:6 }}><Check size={13} color={C.grn} /> {f}</li>)}
              </ul>
              {p.integrations && (
                <div style={{ background:'#0F172A', borderRadius:8, padding:'8px 10px', marginBottom:14 }}>
                  <p style={{ fontSize:10, color:C.mut, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Integrações</p>
                  <p style={{ fontSize:12, color:'#F8FAFC', fontWeight:600, margin:0 }}>{p.integrations}</p>
                </div>
              )}
              {isCurrent
                ? <button disabled style={{ ...S.btn(C.bd), cursor:'default', opacity:.7 }}>Plano atual</button>
                : p.id === 'free'
                  ? <button disabled style={{ ...S.btn(C.bd), cursor:'default', opacity:.5 }}>Grátis</button>
                  : <button onClick={()=>subscribe(p.id)} style={S.btn()}>Ver plano →</button>}
            </div>
          )
        })}
      </div>

      {toast && <div style={{ position:'fixed', top:24, right:24, background:toast.ok?C.grn:C.red, color:'#fff', padding:'12px 20px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:60, boxShadow:'0 8px 24px rgba(0,0,0,.4)' }}>{toast.text}</div>}
    </div>
  )
}
