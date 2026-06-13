import React, { useState, useEffect } from 'react'
import { Flame, CloudSun, Snowflake, CheckCircle2, XCircle, Check, AlertTriangle, Lightbulb, Sparkles, RefreshCw } from 'lucide-react'
import { leadQualification } from '@/services/leadQualificationService'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#94A3B8', pur:'#7C3AED' }
const scoreColor = s => s <= 30 ? '#EF4444' : s <= 60 ? '#EAB308' : '#22C55E'
const TEMP = { hot:{ Icon:Flame, label:'Hot' }, warm:{ Icon:CloudSun, label:'Warm' }, cold:{ Icon:Snowflake, label:'Cold' } }
const ago = t => { const m = Math.max(1, Math.round((Date.now() - new Date(t)) / 60000)); return m < 60 ? `${m} minuto${m > 1 ? 's' : ''}` : `${Math.round(m / 60)}h` }

export const LeadScorePanel = ({ contactId, userId }) => {
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let on = true
    leadQualification.getLeadScore(contactId).then(s => on && setScore(s)).catch(() => {})
    return () => { on = false }
  }, [contactId])

  const run = async () => {
    setLoading(true); setError('')
    try { const r = await leadQualification.qualifyLead(userId, contactId); r.success ? setScore(r) : setError(r.error) }
    catch (e) { setError(e?.message ?? 'Erro ao qualificar') }
    setLoading(false)
  }

  const box = { background:C.card, border:`1px solid ${C.bd}`, borderRadius:12, padding:16, color:C.tx, fontFamily:'DM Sans,sans-serif', marginTop:14 }

  if (!score) return (
    <div style={box}>
      <p style={{ margin:'0 0 10px', fontSize:13, fontWeight:700 }}>Qualificação IA</p>
      <button onClick={run} disabled={loading} style={{ width:'100%', background:C.pur, border:'none', borderRadius:8, padding:'10px', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', opacity:loading ? .6 : 1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>{loading ? <><RefreshCw size={14} className="animate-spin" /> Analisando...</> : <><Sparkles size={14} /> Qualificar com IA</>}</button>
      {error && <p style={{ margin:'8px 0 0', fontSize:12, color:'#F87171' }}>{error}</p>}
    </div>
  )

  const sc = score.score ?? 0
  return (
    <div style={box}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
        <div style={{ width:60, height:60, borderRadius:'50%', border:`4px solid ${scoreColor(sc)}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, flexShrink:0 }}>{sc}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <span style={{ background:C.bd, borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:700, width:'fit-content', display:'inline-flex', alignItems:'center', gap:5 }}>{(() => { const tp = TEMP[score.temperature]; return tp ? <><tp.Icon size={12} /> {tp.label}</> : (score.temperature ?? '—') })()}</span>
          <span style={{ background:(score.qualified ? '#22C55E' : '#EF4444') + '22', color:score.qualified ? '#22C55E' : '#F87171', borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:700, display:'inline-flex', alignItems:'center', gap:5 }}>{score.qualified ? <><CheckCircle2 size={12} /> Qualificado</> : <><XCircle size={12} /> Não qualificado</>}</span>
        </div>
      </div>
      {(score.reasons ?? []).map((r, i) => <p key={i} style={{ margin:'0 0 6px', fontSize:12, display:'flex', alignItems:'flex-start', gap:6 }}><Check size={14} color="#22C55E" style={{ flexShrink:0, marginTop:1 }} />{r}</p>)}
      {(score.missing_info ?? []).map((r, i) => <p key={i} style={{ margin:'0 0 6px', fontSize:12, color:'#EAB308', display:'flex', alignItems:'flex-start', gap:6 }}><AlertTriangle size={14} style={{ flexShrink:0, marginTop:1 }} />{r}</p>)}
      {score.suggested_action && <div style={{ background:C.pur + '20', border:`1px solid ${C.pur}`, borderRadius:8, padding:'10px 12px', fontSize:12, margin:'10px 0', display:'flex', alignItems:'flex-start', gap:6 }}><Lightbulb size={14} style={{ flexShrink:0, marginTop:1 }} />{score.suggested_action}</div>}
      {score.summary && <p style={{ fontStyle:'italic', fontSize:12, color:C.mut, margin:'0 0 12px' }}>"{score.summary}"</p>}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:C.mut }}>Analisado há {ago(score.scored_at ?? Date.now())}</span>
        <button onClick={run} disabled={loading} style={{ background:'none', border:`1px solid ${C.bd}`, borderRadius:8, color:C.tx, cursor:'pointer', fontSize:12, padding:'5px 10px', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:5 }}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />{loading ? '' : 'Requalificar'}</button>
      </div>
    </div>
  )
}
