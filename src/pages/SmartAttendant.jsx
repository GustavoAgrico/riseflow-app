import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Trash2, Plus, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

const C = { bg:'#0F172A', card:'#1E293B', bd:'#334155', tx:'#F8FAFC', mut:'#64748B', pur:'#7C3AED' }
const DEFAULTS = {
  enabled:false, personality:'', company_name:'', business_hours:'08:00-18:00 Seg-Sex',
  custom_rules:'', no_answer_action:'transfer', response_delay:2, max_auto_messages:10,
  respond_outside_hours:false, respond_groups:false,
}
const TEMPLATES = [
  ['Vendedor', 'Você é um vendedor consultivo e simpático. Foque em entender a necessidade do cliente, apresentar benefícios e conduzir para a compra — sem ser insistente.'],
  ['Suporte', 'Você é um agente de suporte técnico paciente e didático. Resolva o problema do cliente passo a passo e confirme se a solução funcionou.'],
  ['Recepcionista', 'Você é uma recepcionista cordial. Entenda o que o cliente precisa e direcione-o para o setor certo, coletando nome e assunto.'],
]
const STATS_LOADING = [['Respondidas hoje','—'],['Resolvidas sem humano','—'],['Total com IA','—'],['Transferências','—']]

const S = {
  top:{ display:'flex',alignItems:'center',gap:14,padding:'16px 24px',borderBottom:`1px solid ${C.bd}`,background:C.card },
  card:{ background:C.card,border:`1px solid ${C.bd}`,borderRadius:14,padding:20,marginBottom:18 },
  h:{ fontSize:15,fontWeight:800,margin:'0 0 14px',display:'flex',alignItems:'center',gap:8 },
  lbl:{ fontSize:12,color:C.mut,fontWeight:600,display:'block',marginBottom:6,marginTop:14 },
  inp:{ background:C.bg,border:`1px solid ${C.bd}`,borderRadius:8,padding:'9px 12px',color:C.tx,fontSize:13,outline:'none',fontFamily:'inherit',width:'100%',boxSizing:'border-box' },
  btn:(bg=C.pur)=>({ background:bg,border:'none',borderRadius:8,padding:'9px 16px',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit' }),
  ghost:{ background:'none',border:`1px solid ${C.bd}`,borderRadius:8,padding:'8px 12px',color:C.tx,cursor:'pointer',fontFamily:'inherit',fontSize:13,textDecoration:'none' },
  badge:c=>({ background:c+'22',color:c,borderRadius:6,padding:'4px 10px',fontSize:12,fontWeight:700 }),
}
const Toggle = ({ on, onClick, big }) => (
  <button onClick={onClick} style={{ width:big?56:44,height:big?30:24,borderRadius:99,border:'none',cursor:'pointer',background:on?C.pur:C.bd,position:'relative',transition:'background .2s',flexShrink:0 }}>
    <span style={{ position:'absolute',top:3,left:on?(big?29:23):3,width:big?24:18,height:big?24:18,borderRadius:'50%',background:'#fff',transition:'left .2s' }} />
  </button>
)
const Row = ({ label, children }) => (
  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 0',borderTop:`1px solid ${C.bd}` }}>
    <span style={{ fontSize:13 }}>{label}</span>{children}
  </div>
)

export const SmartAttendant = () => {
  const { user, ownerUserId, isDemoMode } = useAuth()
  const [cfg, setCfg] = useState(DEFAULTS)
  const [faqs, setFaqs] = useState([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState(STATS_LOADING)
  const fileRef = useRef(null)
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!ownerUserId || isDemoMode) return
    ;(async () => {
      const todayIso = new Date(new Date().setHours(0,0,0,0)).toISOString()

      const [{ data: c }, { data: kb }, { count: aiTotal }, { count: xferTotal }] = await Promise.all([
        supabase.from('attendant_config').select('*').eq('user_id', ownerUserId).maybeSingle(),
        supabase.from('knowledge_base').select('id, question, answer').eq('user_id', ownerUserId),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', ownerUserId).eq('ai_auto_reply', true),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', ownerUserId).not('assigned_to', 'is', null).neq('assigned_to', ''),
      ])

      if (c) setCfg({ ...DEFAULTS, ...c })
      if (kb) setFaqs(kb)

      // Mensagens de saída hoje em conversas com IA
      let todayResponded = 0
      if (aiTotal > 0) {
        const { data: aiConvs } = await supabase.from('conversations').select('id').eq('user_id', ownerUserId).eq('ai_auto_reply', true)
        const ids = aiConvs?.map(r => r.id) || []
        if (ids.length) {
          const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true })
            .in('conversation_id', ids).eq('from_me', true).gte('created_at', todayIso)
          todayResponded = count || 0
        }
      }

      const resolved = Math.max(0, (aiTotal || 0) - (xferTotal || 0))
      const resolvedPct = aiTotal > 0 ? Math.round(resolved / aiTotal * 100) : 0

      setStats([
        ['Respondidas hoje', String(todayResponded)],
        ['Resolvidas sem humano', resolvedPct + '%'],
        ['Total com IA', String(aiTotal || 0)],
        ['Transferências', String(xferTotal || 0)],
      ])
    })()
  }, [ownerUserId, isDemoMode])

  const setFaq = (i, k, v) => setFaqs(p => p.map((f, j) => j === i ? { ...f, [k]: v } : f))
  const importCsv = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = String(reader.result).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        .map(l => { const i = l.indexOf(','); return i < 0 ? null : [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })
        .filter(Boolean).filter(([q]) => q.toLowerCase() !== 'pergunta')
      setFaqs(p => [...p, ...rows.map(([question, answer]) => ({ question, answer }))])
    }
    reader.readAsText(file); e.target.value = ''
  }

  const save = async () => {
    if (isDemoMode || !ownerUserId) { setStatus('Modo demo: salvar desativado.'); return }
    setSaving(true); setStatus('')
    try {
      const { id, created_at, ...rest } = cfg
      await supabase.from('attendant_config').upsert(
        { ...rest, user_id: ownerUserId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      await supabase.from('knowledge_base').delete().eq('user_id', ownerUserId)
      const clean = faqs.filter(f => f.question?.trim() && f.answer?.trim())
        .map(f => ({ user_id: ownerUserId, question: f.question.trim(), answer: f.answer.trim() }))
      if (clean.length) await supabase.from('knowledge_base').insert(clean)
      setStatus('✅ Configuração salva!')
    } catch (e) { console.error('[Attendant] save:', e.message); setStatus('❌ Erro ao salvar: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.tx, fontFamily:'DM Sans,sans-serif', paddingBottom:40 }}>
      <div style={S.top}>
        <Link to="/dashboard" style={S.ghost}>← Voltar</Link>
        <span style={{ fontSize:18, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8 }}>🤖 Atendimento Inteligente</span>
      </div>

      <div style={{ maxWidth:760, margin:'0 auto', padding:'24px 24px 0' }}>
        {/* 1 — Toggle principal */}
        <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>Atendimento IA</div>
            <div style={{ marginTop:8 }}>
              {cfg.enabled
                ? <span style={S.badge('#10B981')}>🟢 Ativo — respondendo automaticamente</span>
                : <span style={S.badge(C.mut)}>⚪ Desativado</span>}
            </div>
          </div>
          <Toggle big on={cfg.enabled} onClick={() => set('enabled', !cfg.enabled)} />
        </div>

        {/* 2 — Personalidade */}
        <div style={S.card}>
          <h3 style={S.h}><Bot size={16} color={C.pur} /> Personalidade do atendente</h3>
          <label style={S.lbl}>Prompt de personalidade</label>
          <textarea rows={5} value={cfg.personality} onChange={e => set('personality', e.target.value)} style={{ ...S.inp, resize:'vertical' }}
            placeholder="Ex: Você é a Ana, atendente da Loja XYZ. Seja simpática, use emojis e sempre ofereça ajuda." />
          <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
            {TEMPLATES.map(([name, txt]) => (
              <button key={name} onClick={() => set('personality', txt)} style={{ ...S.ghost, color:'#A78BFA' }}>{name}</button>
            ))}
          </div>
          <label style={S.lbl}>Nome da empresa</label>
          <input value={cfg.company_name} onChange={e => set('company_name', e.target.value)} style={S.inp} />
          <label style={S.lbl}>Horário de atendimento</label>
          <input value={cfg.business_hours} onChange={e => set('business_hours', e.target.value)} placeholder="08:00-18:00 Seg-Sex" style={S.inp} />
          <label style={S.lbl}>Regras customizadas</label>
          <textarea rows={3} value={cfg.custom_rules} onChange={e => set('custom_rules', e.target.value)} style={{ ...S.inp, resize:'vertical' }}
            placeholder="Ex: Nunca dê desconto acima de 10%. Sempre pergunte o email." />
        </div>

        {/* 3 — Base de conhecimento */}
        <div style={S.card}>
          <h3 style={S.h}>Base de Conhecimento <span style={S.badge(C.pur)}>{faqs.length}</span></h3>
          {faqs.map((f, i) => (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:10, alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <input value={f.question} onChange={e => setFaq(i, 'question', e.target.value)} placeholder="Pergunta" style={{ ...S.inp, marginBottom:6 }} />
                <textarea rows={2} value={f.answer} onChange={e => setFaq(i, 'answer', e.target.value)} placeholder="Resposta" style={{ ...S.inp, resize:'vertical' }} />
              </div>
              <button onClick={() => setFaqs(p => p.filter((_, j) => j !== i))} style={{ ...S.ghost, padding:9 }} title="Excluir"><Trash2 size={15} /></button>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:6 }}>
            <button onClick={() => setFaqs(p => [...p, { question:'', answer:'' }])} style={{ ...S.ghost, display:'inline-flex', alignItems:'center', gap:6 }}><Plus size={14} /> Adicionar pergunta</button>
            <button onClick={() => fileRef.current?.click()} style={{ ...S.ghost, display:'inline-flex', alignItems:'center', gap:6 }}><Upload size={14} /> Importar FAQ (CSV)</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display:'none' }} />
          </div>
        </div>

        {/* 4 — Comportamento */}
        <div style={S.card}>
          <h3 style={S.h}>Comportamento</h3>
          <label style={S.lbl}>Quando não souber responder</label>
          <select value={cfg.no_answer_action} onChange={e => set('no_answer_action', e.target.value)} style={S.inp}>
            <option value="transfer">Transferir para humano</option>
            <option value="rephrase">Pedir para reformular</option>
            <option value="check">Responder que vai verificar</option>
          </select>
          <label style={S.lbl}>Velocidade de resposta</label>
          <select value={cfg.response_delay} onChange={e => set('response_delay', Number(e.target.value))} style={S.inp}>
            <option value={0}>Instantânea (0s)</option>
            <option value={2}>Natural (2-5s)</option>
            <option value={7}>Lenta (5-10s)</option>
          </select>
          <label style={S.lbl}>Máximo de mensagens automáticas por conversa</label>
          <input type="number" min={1} value={cfg.max_auto_messages} onChange={e => set('max_auto_messages', Number(e.target.value))} style={S.inp} />
          <Row label="Responder fora do horário comercial"><Toggle on={cfg.respond_outside_hours} onClick={() => set('respond_outside_hours', !cfg.respond_outside_hours)} /></Row>
          <Row label="Responder em grupos"><Toggle on={cfg.respond_groups} onClick={() => set('respond_groups', !cfg.respond_groups)} /></Row>
        </div>

        {/* 5 — Estatísticas */}
        <div style={S.card}>
          <h3 style={S.h}>Estatísticas</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
            {stats.map(([label, val]) => (
              <div key={label} style={{ background:C.bg, border:`1px solid ${C.bd}`, borderRadius:10, padding:14 }}>
                <div style={{ fontSize:22, fontWeight:800, color:C.pur }}>{val}</div>
                <div style={{ fontSize:12, color:C.mut, marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <button onClick={save} disabled={saving} style={{ ...S.btn(), opacity:saving?.6:1 }}>{saving ? 'Salvando…' : 'Salvar configuração'}</button>
          {status && <span style={{ fontSize:13, color:C.mut }}>{status}</span>}
        </div>
      </div>
    </div>
  )
}
