import React, { useState, useEffect } from 'react'
import { Target, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', pur:'#7C3AED' }
const inp = { width:'100%', boxSizing:'border-box', background:C.bg, border:`1px solid ${C.bd}`, borderRadius:8, padding:'9px 12px', color:C.tx, fontSize:13, outline:'none', fontFamily:'inherit' }
const lbl = { display:'block', fontSize:12, color:C.mut, fontWeight:600, margin:'14px 0 6px' }

export const NicheSetup = () => {
  const [niche, setNiche] = useState('')
  const [ideal, setIdeal] = useState('')
  const [disq, setDisq] = useState('')
  const [minScore, setMinScore] = useState(70)
  const [questions, setQuestions] = useState([''])
  const [toast, setToast] = useState('')

  // Carrega a configuração existente (incl. score mínimo) ao abrir
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('niche_config').select('*').eq('user_id', user.id).maybeSingle()
        if (!data) return
        setNiche(data.niche ?? ''); setIdeal(data.ideal_customer ?? ''); setDisq(data.disqualify_criteria ?? '')
        setMinScore(data.min_score ?? 70)
        if (Array.isArray(data.qualification_questions) && data.qualification_questions.length) setQuestions(data.qualification_questions)
      } catch (e) { console.warn('[Niche] load', e?.message ?? e) }
    })()
  }, [])

  const setQ = (i, v) => setQuestions(qs => qs.map((q, idx) => idx === i ? v : q))
  const addQ = () => setQuestions(qs => [...qs, ''])
  const rmQ = i => setQuestions(qs => qs.filter((_, idx) => idx !== i))

  const save = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('niche_config').upsert({
        user_id: user.id, niche, ideal_customer: ideal, disqualify_criteria: disq,
        min_score: Number(minScore) || 70,
        qualification_questions: questions.filter(q => q.trim()),
      }, { onConflict: 'user_id' })
      setToast('Nicho configurado!'); setTimeout(() => setToast(''), 2500)
    } catch (e) { console.warn('[Niche]', e?.message ?? e) }
  }

  return (
    <div style={{ background:C.card, border:`1px solid ${C.bd}`, borderRadius:16, padding:24, color:C.tx, fontFamily:'DM Sans,sans-serif' }}>
      <h3 style={{ margin:0, fontSize:17, fontWeight:800, display:'flex', alignItems:'center', gap:8 }}><Target size={18} color={C.pur} /> Qualificação de Leads</h3>
      <p style={{ margin:'4px 0 0', fontSize:13, color:C.mut }}>Configure seu nicho para a IA qualificar automaticamente</p>
      <label style={lbl}>Seu nicho/segmento</label>
      <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="Ex: Agência de marketing digital" style={inp} />
      <label style={lbl}>Descreva seu cliente ideal</label>
      <textarea value={ideal} onChange={e => setIdeal(e.target.value)} rows={3} placeholder="Ex: Empresas B2B com 10-500 funcionários que precisam de automação de marketing, faturamento acima de R$50k/mês, já investem em tráfego pago" style={{ ...inp, resize:'vertical' }} />
      <label style={lbl}>Critérios de desqualificação</label>
      <textarea value={disq} onChange={e => setDisq(e.target.value)} rows={3} placeholder="Ex: Pessoa física, sem orçamento definido, procurando apenas preço, empresa com menos de 1 ano" style={{ ...inp, resize:'vertical' }} />
      <label style={lbl}>Score mínimo para qualificar ({minScore})</label>
      <input type="range" min={0} max={100} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))} style={{ width:'100%', accentColor:C.pur }} />
      <p style={{ margin:'4px 0 0', fontSize:11, color:C.mut }}>Leads com score igual ou acima de {minScore} são marcados como qualificados.</p>
      <label style={lbl}>Perguntas de qualificação</label>
      {questions.map((q, i) => (
        <div key={i} style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input value={q} onChange={e => setQ(i, e.target.value)} placeholder="Ex: Qual seu faturamento mensal?" style={inp} />
          <button onClick={() => rmQ(i)} title="Remover" style={{ background:'none', border:`1px solid ${C.bd}`, borderRadius:8, color:C.mut, cursor:'pointer', padding:'0 12px', fontSize:16 }}>×</button>
        </div>
      ))}
      <button onClick={addQ} style={{ background:'none', border:'none', color:'#A78BFA', cursor:'pointer', fontSize:13, fontWeight:600, padding:0, margin:'2px 0 18px' }}>+ Adicionar pergunta</button>
      <button onClick={save} style={{ display:'block', width:'100%', background:C.pur, border:'none', borderRadius:10, padding:'11px', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Salvar configuração</button>
      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:C.pur, color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:300, display:'flex', alignItems:'center', gap:6 }}><Check size={14} /> {toast}</div>}
    </div>
  )
}
