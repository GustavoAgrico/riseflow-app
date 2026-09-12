import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, DollarSign, Target, ArrowLeft, Trash2, MonitorPlay, User, Plus, Square, CheckSquare, X, ChevronUp, ChevronDown, Layers } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { LeadScorePanel } from '@components/LeadScorePanel'
import { NotesPanel } from '@components/NotesPanel'
import { logger } from '@services/activityLogger'
import { useIsMobile } from '@hooks/useIsMobile'
import { DEFAULT_STAGES, useStages, saveStages, newStageKey } from '@hooks/useStages'
import { computeSalesMetrics, brl } from '@lib/metrics'

// Etapas do funil agora são dinâmicas (por conta) — ver @hooks/useStages.
// stageAt(stages, key) resolve a etapa de um lead com fallback seguro.
const stageAt = (stages, key) => (stages || DEFAULT_STAGES).find(s => s.key === key) || (stages || DEFAULT_STAGES)[0] || DEFAULT_STAGES[0]

/* Paleta padrão (tema escuro) — mesma do Funil para manter consistência entre as páginas */
const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED' }

const S = {
  input: { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: `1px solid ${C.bd}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans,sans-serif', color: C.tx, background: C.card },
  label: { display: 'block', fontSize: 11, color: C.mut, marginBottom: 4, fontWeight: 600 },
  select: { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.bd}`, background: C.card, color: C.tx, fontSize: 13, outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' },
  opt: { background: C.card, color: C.tx },
  btn: (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }),
  card: { background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '10px 12px', cursor: 'grab', marginBottom: 8 },
}

const initContacts = [
  { id: '1', name: 'Ana Lima',      phone: '5511987654321', email: 'ana@techinova.com',    company: 'TechInova',  value: 8500,  stage: 'lead',   tags: ['VIP'],          lastMsg: 'Oi, tenho interesse!',               time: '2h'  },
  { id: '2', name: 'Bruno Martins', phone: '5511912345678', email: 'bruno@logfast.com',    company: 'LogFast',    value: 3200,  stage: 'qual',   tags: ['Interessado'],  lastMsg: 'Quando podemos conversar?',          time: '1d'  },
  { id: '3', name: 'Carla Souza',   phone: '5511998877665', email: 'carla@bestpay.com',    company: 'BestPay',    value: 15000, stage: 'prop',   tags: ['VIP', 'Hot'],   lastMsg: 'Aguardando proposta',                time: '3h'  },
  { id: '4', name: 'Diego Costa',   phone: '5511955443322', email: 'diego@mktpro.com',     company: 'MktPro',     value: 2500,  stage: 'neg',    tags: ['Interessado'],  lastMsg: 'Preciso de um desconto',             time: '30m' },
  { id: '5', name: 'Elena Rocha',   phone: '5511933221100', email: 'elena@storeprime.com', company: 'StorePrime', value: 6800,  stage: 'closed', tags: ['VIP', 'Pago'],  lastMsg: 'Contrato assinado!',                 time: '2d'  },
  { id: '6', name: 'Felipe Santos', phone: '5511977665544', email: 'f.santos@agtech.com',  company: 'AgTech',     value: 1200,  stage: 'lost',   tags: ['Frio'],         lastMsg: 'Não tenho interesse no momento.',    time: '5d'  },
  { id: '7', name: 'Gia Fernandes', phone: '5511944332211', email: 'gia@criamais.com',     company: 'CriaMais',   value: 4500,  stage: 'lead',   tags: ['Hot'],          lastMsg: 'Vi seu anúncio, quero saber mais!',  time: '1h'  },
  { id: '8', name: 'Hugo Alves',    phone: '5511966554433', email: 'hugo@construmax.com',  company: 'ConstruMax', value: 9900,  stage: 'qual',   tags: ['VIP'],          lastMsg: 'Pode me enviar os detalhes?',        time: '4h'  },
]

const ini = n => n.split(' ').slice(0, 2).map(w => w[0]).join('')

/* tempo relativo curto para o card ("2h", "3d") */
const rel = t => { if (!t) return 'agora'; const m = Math.max(1, Math.round((Date.now() - new Date(t)) / 60000)); return m < 60 ? `${m}min` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d` }
/* linha da tabela clients -> formato do card do CRM */
const mapRow = r => ({ id: r.id, name: r.name || '', phone: r.phone || '', email: r.email || '', company: r.company || '', value: Number(r.value) || 0, stage: r.stage || 'lead', tags: r.tags || [], lastMsg: r.last_message || '', time: rel(r.created_at), assignedTo: r.assigned_to || '' })

const ContactCard = ({ contact, onDragStart, onClick, onDelete, stages }) => {
  const [hov, setHov] = useState(false)
  const st = stageAt(stages, contact.stage)
  return (
    <div draggable onDragStart={e => onDragStart(e, contact.id)} onClick={() => onClick(contact)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...S.card, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: st.color + '22', color: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{ini(contact.name)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.tx, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</p>
          <p style={{ fontSize: 11, color: C.mut, margin: 0 }}>{contact.company}</p>
        </div>
        {!hov && contact.assignedTo && (
          <div title={'Responsável: ' + contact.assignedTo} style={{ width: 22, height: 22, borderRadius: '50%', background: '#33415A', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{ini(contact.assignedTo)}</div>
        )}
        {hov && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(contact) }}
            title="Excluir lead"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171', padding: 2, display: 'flex', flexShrink: 0 }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 7, fontSize: 11, color: C.mut }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {contact.phone.slice(-9)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><DollarSign size={12} /> R${contact.value.toLocaleString('pt-BR')}</span>
      </div>
      {contact.tags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 7 }}>
        {contact.tags.map(t => <span key={t} style={{ fontSize: 10, background: st.color + '18', color: st.color, borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{t}</span>)}
      </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.mut, gap: 8 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.lastMsg}</span>
        <span style={{ flexShrink: 0 }}>há {contact.time}</span>
      </div>
    </div>
  )
}

// Tarefas/atividades por lead (tabela crm_tasks). Escopo por conta via RLS.
const TasksPanel = ({ clientId, userId }) => {
  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    if (!clientId || !userId) return
    const { data } = await supabase.from('crm_tasks').select('*').eq('client_id', clientId).order('done', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    setTasks(data || [])
  }, [clientId, userId])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('crm_tasks').insert({ user_id: userId, client_id: clientId, title: title.trim(), due_date: due || null }).select().single()
    setBusy(false)
    if (error) { alert('Erro ao criar tarefa:\n' + error.message + '\n\n(Rode supabase/crm_tasks.sql se ainda não rodou.)'); return }
    setTasks(t => [...t, data]); setTitle(''); setDue('')
  }
  const toggle = async (t) => { setTasks(x => x.map(i => i.id === t.id ? { ...i, done: !i.done } : i)); await supabase.from('crm_tasks').update({ done: !t.done }).eq('id', t.id) }
  const del = async (t) => { setTasks(x => x.filter(i => i.id !== t.id)); await supabase.from('crm_tasks').delete().eq('id', t.id) }

  const pend = tasks.filter(t => !t.done).length
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Tarefas {pend > 0 && <span style={{ color: C.pur }}>({pend})</span>}</p>
      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        {tasks.length === 0 && <p style={{ fontSize: 12, color: C.mut, margin: 0 }}>Nenhuma tarefa ainda.</p>}
        {tasks.map(t => {
          const overdue = !t.done && t.due_date && t.due_date < today
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, borderRadius: 8, padding: '7px 9px' }}>
              <button onClick={() => toggle(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.done ? '#059669' : C.mut, padding: 0, display: 'flex', flexShrink: 0 }}>
                {t.done ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, color: t.done ? C.mut : C.tx, textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                {t.due_date && <p style={{ margin: 0, fontSize: 10, color: overdue ? '#F87171' : C.mut, fontWeight: overdue ? 700 : 400 }}>{overdue ? 'venceu ' : 'vence '}{new Date(t.due_date + 'T00:00').toLocaleDateString('pt-BR')}</p>}
              </div>
              <button onClick={() => del(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171', padding: 0, display: 'flex', flexShrink: 0 }}><Trash2 size={13} /></button>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nova tarefa..." style={{ ...S.input, flex: 1 }} />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...S.input, width: 130, flexShrink: 0 }} />
        <button onClick={add} disabled={busy || !title.trim()} style={{ ...S.btn(C.pur), padding: '7px 10px', opacity: (busy || !title.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center' }}><Plus size={15} /></button>
      </div>
    </div>
  )
}

const DetailPanel = ({ contact, onClose, onStageChange, onToggleTag, onDelete, onAssign, members = [], stages = DEFAULT_STAGES, userId, mobile }) => {
  const st = stageAt(stages, contact.stage)
  const navigate = useNavigate()
  const [msgs, setMsgs] = useState(null)

  useEffect(() => {
    if (!userId || !contact.phone) { setMsgs([]); return }
    const phone = String(contact.phone).replace(/\D/g, '').slice(-10)
    ;(async () => {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', userId)
        .ilike('contact_phone', `%${phone}%`)
        .limit(1)
      if (!convs?.length) { setMsgs([]); return }
      const { data: rows } = await supabase
        .from('messages')
        .select('id, body, text, from_me, created_at, timestamp')
        .eq('conversation_id', convs[0].id)
        .order('created_at', { ascending: true })
        .limit(50)
      setMsgs(rows || [])
    })()
  }, [userId, contact.phone])

  return (
    <div style={{ width: mobile ? '100%' : 320, flexShrink: 0, borderLeft: `1px solid ${C.bd}`, background: C.card, display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', ...(mobile ? { position: 'fixed', inset: 0, zIndex: 60 } : {}) }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: st.color + '22', color: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{ini(contact.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.tx, margin: 0 }}>{contact.name}</p>
          <p style={{ fontSize: 12, color: C.mut, margin: 0 }}>{contact.company}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: C.mut, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Informações</p>
        {[[Phone, contact.phone], [Mail, contact.email], [DollarSign, `R$ ${contact.value.toLocaleString('pt-BR')}`]].map(([Ic, val]) => (
          <p key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.tx, marginBottom: 6 }}><Ic size={14} color={C.mut} /><span>{val}</span></p>
        ))}
        <LeadScorePanel contactId={contact.id} userId={userId} />
        <div style={{ marginBottom: 14, marginTop: 14 }}>
          <label style={S.label}>Etapa</label>
          <select value={contact.stage} onChange={e => onStageChange(contact.id, e.target.value)} style={S.select}>
            {stages.map(s => <option key={s.key} value={s.key} style={S.opt}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Responsável</label>
          <select value={contact.assignedTo || ''} onChange={e => onAssign(contact.id, e.target.value)} style={S.select}>
            <option value="" style={S.opt}>Sem responsável</option>
            {members.map(m => <option key={m.id} value={m.name} style={S.opt}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TAGS_OPT.map(t => { const on = (contact.tags || []).includes(t); return (
              <button key={t} onClick={() => onToggleTag(contact.id, t)} style={{ fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 9px', borderRadius: 6, background: on ? '#7C3AED25' : C.bg, color: on ? '#A78BFA' : C.mut, border: `1px solid ${on ? '#7C3AED66' : C.bd}`, fontFamily: 'inherit' }}>{on ? '✓ ' : '+ '}{t}</button>
            )})}
          </div>
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Histórico de conversas</p>
        <div style={{ background: C.bg, borderRadius: 8, padding: 10, marginBottom: 14, maxHeight: 200, overflowY: 'auto' }}>
          {msgs === null && (
            <p style={{ fontSize: 12, color: C.mut, textAlign: 'center', margin: '8px 0' }}>Carregando…</p>
          )}
          {msgs?.length === 0 && (
            <p style={{ fontSize: 12, color: C.mut, textAlign: 'center', margin: '8px 0' }}>Nenhuma mensagem encontrada</p>
          )}
          {msgs?.map((m, i) => {
            const d = m.created_at ? new Date(m.created_at) : m.timestamp ? new Date(m.timestamp * 1000) : null
            const time = d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
            return (
              <div key={m.id || i} style={{ display: 'flex', justifyContent: m.from_me ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{ maxWidth: '80%', background: m.from_me ? st.color : C.bd, color: m.from_me ? '#fff' : C.tx, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
                  <p style={{ margin: 0 }}>{m.body || m.text || ''}</p>
                  {time && <p style={{ margin: 0, fontSize: 10, opacity: .6, textAlign: 'right' }}>{time}</p>}
                </div>
              </div>
            )
          })}
        </div>
        <TasksPanel clientId={contact.id} userId={userId} />
        <NotesPanel contactId={contact.id} userId={userId} />
        <button onClick={() => navigate('/chat')} style={{ ...S.btn('#7C3AED'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginTop: 14 }}>Abrir conversa</button>
        <button
          onClick={() => onDelete(contact)}
          style={{ ...S.btn('#EF444420', '#F87171'), width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid #EF444440' }}
        >
          <Trash2 size={13} /> Excluir lead
        </button>
      </div>
    </div>
  )
}

const TAGS_OPT = ['VIP', 'Interessado', 'Hot', 'Frio', 'Pago']

// Editor de etapas do funil (por conta). Salva na tabela pipeline_stages.
const KIND_OPT = [['open', 'Aberta'], ['won', 'Ganho'], ['lost', 'Perdido']]
const StageEditor = ({ stages, onClose, onSaved, ownerUserId, isDemoMode }) => {
  const [list, setList] = useState(() => stages.map(s => ({ ...s })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const prevKeys = stages.map(s => s.key)

  const upd = (i, k, v) => setList(l => l.map((s, j) => j === i ? { ...s, [k]: v } : s))
  const move = (i, d) => setList(l => { const j = i + d; if (j < 0 || j >= l.length) return l; const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c })
  const add = () => setList(l => [...l, { key: newStageKey(), label: 'Nova etapa', color: '#7C3AED', kind: 'open', probability: 20 }])
  const remove = (i) => setList(l => l.length > 1 ? l.filter((_, j) => j !== i) : l)

  const save = async () => {
    if (isDemoMode) { setErr('Modo demo: crie uma conta para editar as etapas.'); return }
    if (!list.some(s => (s.label || '').trim())) { setErr('Defina ao menos uma etapa.'); return }
    setBusy(true); setErr('')
    try {
      await saveStages(ownerUserId, list, prevKeys)
      onSaved && await onSaved()
      onClose()
    } catch (e) { setErr('Erro ao salvar: ' + (e?.message || e) + '  (Rode supabase/pipeline_stages.sql se ainda não rodou.)'); setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 22, width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'DM Sans,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.tx }}>Editar etapas do funil</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mut }}><X size={18} /></button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: C.mut }}>Renomeie, reordene, mude a cor e a probabilidade (usada na previsão). Marque a etapa de <b style={{ color: C.tx }}>Ganho</b> e a de <b style={{ color: C.tx }}>Perdido</b>. Ao remover uma etapa com leads, eles vão para a primeira.</p>

        <div style={{ display: 'grid', gap: 8 }}>
          {list.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 40px 110px 78px 30px', gap: 8, alignItems: 'center', background: C.bg, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: C.mut, opacity: i === 0 ? 0.3 : 1, padding: 0, display: 'flex' }}><ChevronUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === list.length - 1} style={{ background: 'none', border: 'none', cursor: i === list.length - 1 ? 'default' : 'pointer', color: C.mut, opacity: i === list.length - 1 ? 0.3 : 1, padding: 0, display: 'flex' }}><ChevronDown size={14} /></button>
              </div>
              <input value={s.label} onChange={e => upd(i, 'label', e.target.value)} placeholder="Nome da etapa" style={{ ...S.input }} />
              <input type="color" value={s.color} onChange={e => upd(i, 'color', e.target.value)} title="Cor" style={{ width: 40, height: 34, padding: 2, background: C.card, border: `1px solid ${C.bd}`, borderRadius: 8, cursor: 'pointer' }} />
              <select value={s.kind} onChange={e => upd(i, 'kind', e.target.value)} style={{ ...S.select }}>
                {KIND_OPT.map(([v, l]) => <option key={v} value={v} style={S.opt}>{l}</option>)}
              </select>
              <input type="number" min="0" max="100" value={s.probability} onChange={e => upd(i, 'probability', e.target.value)} title="Probabilidade %" style={{ ...S.input }} />
              <button onClick={() => remove(i)} disabled={list.length <= 1} title="Remover" style={{ background: 'none', border: 'none', cursor: list.length <= 1 ? 'default' : 'pointer', color: '#F87171', opacity: list.length <= 1 ? 0.3 : 1, padding: 0, display: 'flex', justifyContent: 'center' }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <button onClick={add} style={{ ...S.btn('transparent', C.tx), border: `1px dashed ${C.bd}`, marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Adicionar etapa</button>

        {err && <p style={{ fontSize: 12.5, color: '#F87171', marginTop: 12 }}>{err}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...S.btn('transparent', C.tx), border: `1px solid ${C.bd}`, padding: '9px 16px' }}>Cancelar</button>
          <button onClick={save} disabled={busy} style={{ ...S.btn(C.pur), padding: '9px 18px', opacity: busy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{busy ? 'Salvando…' : 'Salvar etapas'}</button>
        </div>
      </div>
    </div>
  )
}

const NewContactModal = ({ onSave, onClose, stages = DEFAULT_STAGES }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', value: '', stage: stages[0]?.key || 'lead', tags: [] })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggleTag = t => set('tags', form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000066', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 24, width: 420, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'DM Sans,sans-serif' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.tx, margin: 0 }}>Novo Contato</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: C.mut }}>×</button>
        </div>
        {[['name','text','Nome *'],['phone','tel','Telefone'],['email','email','Email'],['company','text','Empresa']].map(([k, type, lbl]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={S.label}>{lbl}</label>
            <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} style={S.input} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}><label style={S.label}>Valor (R$)</label><input type="number" value={form.value} onChange={e => set('value', e.target.value)} style={S.input} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>Etapa</label><select value={form.stage} onChange={e => set('stage', e.target.value)} style={S.select}>{stages.map(s => <option key={s.key} value={s.key} style={S.opt}>{s.label}</option>)}</select></div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TAGS_OPT.map(t => { const on = form.tags.includes(t); return (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: on ? '#7C3AED25' : C.bg, color: on ? '#A78BFA' : C.mut, border: `1px solid ${on ? '#7C3AED66' : C.bd}` }}>
                <input type="checkbox" checked={on} onChange={() => toggleTag(t)} style={{ accentColor: '#7C3AED', width: 12 }} />{t}
              </label>
            )})}
          </div>
        </div>
        <button onClick={() => { if (!form.name.trim()) return; onSave(form); onClose() }} style={{ ...S.btn('#7C3AED'), width: '100%' }}>Salvar</button>
      </div>
    </div>
  )
}

export function CRM() {
  const navigate = useNavigate()
  const { user, ownerUserId, isDemoMode } = useAuth()
  const { stages, reload: reloadStages } = useStages()
  const [stagesOpen, setStagesOpen] = useState(false)
  const [navHov, setNavHov] = useState(false)
  const [contacts, setContacts] = useState([])
  const [selected, setSelected] = useState(null)
  const isMobile = useIsMobile()
  const [modal, setModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [members, setMembers] = useState([])
  const [dragOver, setDragOver] = useState(null)

  /* Membros da equipe (para atribuir responsável e filtrar). */
  useEffect(() => {
    if (isDemoMode || !ownerUserId) return
    ;(async () => {
      const { data } = await supabase.from('team_members').select('id,name').eq('user_id', ownerUserId).order('name', { ascending: true })
      setMembers(data || [])
    })()
  }, [ownerUserId, isDemoMode])

  /* Carrega contatos reais da tabela clients (no modo demo, usa o mock local). */
  useEffect(() => {
    let on = true
    ;(async () => {
      if (isDemoMode) { setContacts(initContacts); return }
      if (!ownerUserId) return
      try {
        const { data, error } = await supabase.from('clients').select('*').eq('user_id', ownerUserId).order('created_at', { ascending: false })
        if (error) throw error
        if (on) { setContacts((data || []).map(mapRow)); console.log(`[CRM] ${(data || []).length} contatos carregados`) }
      } catch (e) { console.warn('[CRM] erro ao carregar contatos:', e?.message ?? e); if (on) setContacts([]) }
    })()
    return () => { on = false }
  }, [ownerUserId, isDemoMode])

  const allTags = [...new Set(contacts.flatMap(c => c.tags))]
  const filtered = contacts.filter(c =>
    (c.name + c.company).toLowerCase().includes(search.toLowerCase()) &&
    (!filterTag || c.tags.includes(filterTag)) &&
    (!filterOwner || (filterOwner === '__none__' ? !c.assignedTo : c.assignedTo === filterOwner))
  )

  /* Atribui responsável — otimista + persiste em clients.assigned_to. */
  const assignOwner = async (id, name) => {
    setContacts(p => p.map(c => c.id === id ? { ...c, assignedTo: name } : c))
    if (selected?.id === id) setSelected(p => ({ ...p, assignedTo: name }))
    if (isDemoMode) return
    try { await supabase.from('clients').update({ assigned_to: name || null }).eq('id', id) }
    catch (e) { console.warn('[CRM] erro ao atribuir responsável:', e?.message ?? e) }
  }

  /* Move etapa (drag/select) — atualização otimista + persiste em clients. */
  const moveContact = async (id, stage) => {
    setContacts(p => p.map(c => c.id === id ? { ...c, stage } : c))
    if (selected?.id === id) setSelected(p => ({ ...p, stage }))
    logger.log(user?.id, 'stage_changed', { category: 'crm', description: (contacts.find(c => c.id === id)?.name || 'Contato') + ' movido para ' + (stageAt(stages, stage).label || stage) })
    if (isDemoMode) return
    try { await supabase.from('clients').update({ stage }).eq('id', id) }
    catch (e) { console.warn('[CRM] erro ao mover contato:', e?.message ?? e) }
  }

  /* Adiciona/remove tag de um contato — otimista + persiste + loga. */
  const toggleTag = async (id, tag) => {
    const cur = contacts.find(c => c.id === id)?.tags || []
    const has = cur.includes(tag)
    const tags = has ? cur.filter(t => t !== tag) : [...cur, tag]
    setContacts(p => p.map(c => c.id === id ? { ...c, tags } : c))
    if (selected?.id === id) setSelected(p => ({ ...p, tags }))
    const nm = contacts.find(c => c.id === id)?.name || 'contato'
    logger.log(user?.id, has ? 'tag_removed' : 'tag_added', { category: 'crm', description: `${has ? 'Tag removida' : 'Tag adicionada'} "${tag}" em ${nm}` })
    if (isDemoMode) return
    try { await supabase.from('clients').update({ tags }).eq('id', id) }
    catch (e) { console.warn('[CRM] erro ao atualizar tags:', e?.message ?? e) }
  }

  /* Exclui contato — remove de clients + estado local + loga. */
  const deleteContact = async (contact) => {
    if (!window.confirm(`Excluir "${contact.name}" do pipeline?\n\nEsta ação não pode ser desfeita.`)) return
    setContacts(p => p.filter(c => c.id !== contact.id))
    if (selected?.id === contact.id) setSelected(null)
    logger.log(user?.id, 'contact_deleted', { category: 'crm', description: 'Lead excluído: ' + contact.name })
    if (isDemoMode) return
    try {
      const { error } = await supabase.from('clients').delete().eq('id', contact.id)
      if (error) throw error
      console.log('[CRM] Lead excluído:', contact.id)
    } catch (e) {
      console.warn('[CRM] erro ao excluir contato:', e?.message ?? e)
      setContacts(p => [contact, ...p]) // reverte
      alert('Erro ao excluir o lead: ' + (e?.message ?? e))
    }
  }

  /* Cria contato — grava em clients para sincronizar com o Funil. */
  const addContact = async (form) => {
    const base = { name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, company: form.company.trim() || null, value: Number(form.value) || 0, stage: form.stage, tags: form.tags }
    logger.log(user?.id, 'contact_created', { category: 'contacts', description: 'Contato criado: ' + base.name })
    if (isDemoMode) { setContacts(p => [{ ...base, id: String(Date.now()), lastMsg: 'Contato criado', time: 'agora' }, ...p]); return }
    try {
      const { data, error } = await supabase.from('clients').insert({ user_id: ownerUserId, status: 'active', ...base }).select().single()
      if (error) throw error
      setContacts(p => [mapRow(data), ...p])
      console.log('[CRM] Contato criado e sincronizado')
    } catch (e) { console.warn('[CRM] erro ao criar contato:', e?.message ?? e); alert('Erro ao salvar contato. Rode supabase/clients_crm.sql se ainda não rodou.') }
  }

  // ── Métricas do funil — fonte única (src/lib/metrics), mesmas regras do Dashboard/Funil ──
  // Calculadas sobre `filtered` (busca/tag/responsável) — os KPIs refletem a visão atual.
  const m = computeSalesMetrics(filtered, stages)
  const byStage = new Map(m.byStage.map(s => [s.key, s]))
  const stageSum = key => byStage.get(key)?.value ?? 0
  const kpis = [
    { label: 'No funil', value: brl(m.pipeline), color: C.pur, hint: `${m.open} em aberto` },
    { label: 'Previsão ponderada', value: brl(m.weightedForecast), color: '#059669', hint: 'por probabilidade de etapa' },
    { label: 'Conversão', value: `${Math.round(m.convRate)}%`, color: '#2563EB', hint: `${m.won} ganhos / ${m.lost} perdidos` },
    { label: 'Negócios', value: String(m.total), color: '#D97706', hint: 'total exibido' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.tx, fontFamily: 'DM Sans,sans-serif' }}>
      <div style={{ minHeight: 56, background: C.card, borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', flexWrap: 'wrap', padding: '8px 20px', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/dashboard')} onMouseEnter={() => setNavHov(true)} onMouseLeave={() => setNavHov(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: navHov ? C.tx : C.mut, padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}><ArrowLeft size={18} /></button>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.tx, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Target size={18} color={C.pur} /> CRM Pipeline</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contato ou empresa..." style={{ ...S.input, flex: 1, minWidth: 140, height: 34 }} />
        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...S.select, width: 130, height: 34 }}>
          <option value="" style={S.opt}>Todas as tags</option>
          {allTags.map(t => <option key={t} value={t} style={S.opt}>{t}</option>)}
        </select>
        {members.length > 0 && (
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={{ ...S.select, width: 150, height: 34 }}>
            <option value="" style={S.opt}>Todos responsáveis</option>
            <option value="__none__" style={S.opt}>Sem responsável</option>
            {members.map(m => <option key={m.id} value={m.name} style={S.opt}>{m.name}</option>)}
          </select>
        )}
        <button onClick={() => setStagesOpen(true)} title="Editar etapas do funil"
          style={{ ...S.btn('transparent', C.tx), border: `1px solid ${C.bd}`, marginLeft: 'auto', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Layers size={15} /> Editar etapas
        </button>
        <button onClick={() => window.open('/crm/board', '_blank', 'noopener')} title="Abrir o pipeline ao vivo em outra aba (modo apresentação)"
          style={{ ...S.btn('transparent', C.tx), border: `1px solid ${C.bd}`, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <MonitorPlay size={15} /> Painel ao vivo
        </button>
        <button onClick={() => setModal(true)} style={{ ...S.btn('#7C3AED'), whiteSpace: 'nowrap' }}>+ Novo Contato</button>
      </div>
      {isDemoMode && (
        <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: '#EAB30810', border: '1px solid #EAB30844', borderRadius: 10, color: '#EAB308', fontSize: 13, flexShrink: 0 }}>
          Modo demo — os contatos abaixo são apenas exemplo. Crie uma conta para gerenciar seu CRM de verdade.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, padding: '12px 20px 0', flexShrink: 0, overflowX: 'auto' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ flex: '1 1 0', minWidth: 150, background: C.card, border: `1px solid ${C.bd}`, borderLeft: `3px solid ${k.color}`, borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontSize: 11, color: C.mut }}>{k.label}</p>
            <p style={{ margin: '3px 0 1px', fontSize: 19, fontWeight: 800, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
            <p style={{ margin: 0, fontSize: 10, color: k.color, fontWeight: 600 }}>{k.hint}</p>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, padding: '16px 20px', overflowX: isMobile ? 'hidden' : 'auto', overflowY: isMobile ? 'auto' : 'visible', alignItems: isMobile ? 'stretch' : 'flex-start' }}>
          {stages.map(stage => {
            const cols = filtered.filter(c => c.stage === stage.key)
            const over = dragOver === stage.key
            return (
              <div key={stage.key}
                onDragOver={e => { e.preventDefault(); setDragOver(stage.key) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { const id = e.dataTransfer.getData('cid'); if (id) moveContact(id, stage.key); setDragOver(null) }}
                style={{ minWidth: isMobile ? 0 : 240, width: isMobile ? '100%' : undefined, flexShrink: 0 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, flex: 1 }}>{stage.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, background: stage.color + '18', borderRadius: 10, padding: '1px 8px' }}>{cols.length}</span>
                  </div>
                  {stageSum(stage.key) > 0 && <p style={{ margin: '4px 0 0 16px', fontSize: 11, fontWeight: 700, color: C.mut, fontVariantNumeric: 'tabular-nums' }}>{brl(stageSum(stage.key))}</p>}
                </div>
                <div style={{ minHeight: 60, borderRadius: 12, border: over ? '2px dashed #2563EB66' : '2px dashed transparent', background: over ? '#2563EB06' : 'transparent', padding: over ? 4 : 0, transition: 'all .15s' }}>
                  {cols.map(c => (
                    <ContactCard key={c.id} contact={c} onClick={setSelected} stages={stages}
                      onDragStart={(e, id) => e.dataTransfer.setData('cid', id)}
                      onDelete={deleteContact} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {selected && <DetailPanel key={selected.id} contact={selected} onClose={() => setSelected(null)} onStageChange={moveContact} onToggleTag={toggleTag} onDelete={deleteContact} onAssign={assignOwner} members={members} stages={stages} userId={ownerUserId} mobile={isMobile} />}
      </div>
      {modal && <NewContactModal onSave={addContact} onClose={() => setModal(false)} stages={stages} />}
      {stagesOpen && <StageEditor stages={stages} ownerUserId={ownerUserId} isDemoMode={isDemoMode} onClose={() => setStagesOpen(false)} onSaved={reloadStages} />}
    </div>
  )
}
