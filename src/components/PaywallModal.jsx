import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { usePlan } from '@hooks/usePlan'

const C = { overlay:'rgba(0,0,0,.7)', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', red:'#EF4444', pur:'#7C3AED' }

export const PaywallModal = ({ isOpen, onClose, used, limit }) => {
  const navigate = useNavigate()
  const { plan } = usePlan()
  if (!isOpen) return null
  // Props têm prioridade; senão caem para o registro de usage do hook.
  const usedN = used ?? plan?.messages_sent ?? 0
  const limitN = limit ?? plan?.messages_limit ?? 50

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:C.overlay, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.card, border:`1px solid ${C.bd}`, borderRadius:16, padding:28, width:380, maxWidth:'92vw', color:C.tx, fontFamily:'DM Sans,sans-serif', position:'relative', textAlign:'center' }}>
        <button onClick={onClose} aria-label="Fechar" style={{ position:'absolute', top:14, right:14, background:'none', border:'none', color:C.mut, fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        <div style={{ display:'flex', justifyContent:'center' }}><Lock size={42} color={C.pur} /></div>
        <h2 style={{ margin:'10px 0 8px', fontSize:19, fontWeight:800 }}>Limite de mensagens atingido</h2>
        <p style={{ color:C.mut, fontSize:13, margin:'0 0 18px' }}>Você usou {usedN} de {limitN} mensagens do plano {plan?.plan ?? 'gratuito'}.</p>
        <div style={{ background:'#0F172A', borderRadius:8, height:10, overflow:'hidden', marginBottom:22 }}>
          <div style={{ width:'100%', height:'100%', background:C.red }} />
        </div>
        <button onClick={()=>navigate('/plans/starter')} style={{ width:'100%', background:C.pur, color:'#fff', border:'none', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>Ver plano Starter — R$67/mês</button>
        <button onClick={()=>navigate('/plans/pro')} style={{ width:'100%', background:'#fff', color:'#0F172A', border:'none', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:14 }}>Ver plano Pro — R$197/mês</button>
        <button onClick={()=>{ window.location.href = '/plans' }} style={{ background:'none', border:'none', color:C.mut, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Ver todos os planos →</button>
      </div>
    </div>
  )
}
