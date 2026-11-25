// Projetos — implantação / pós-venda com checklist. Tabela projects (supabase/projects.sql).
// Regras e cálculos em src/lib/projects.js. Modo demo: dados locais, nada vai ao banco.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, X, Check, Trash2, CalendarClock, AlertTriangle, FolderKanban, CheckCircle2, Eye, Loader2,
  ArrowRight, ExternalLink, Users, ListChecks, Pencil,
} from 'lucide-react'
import { Layout } from '@components/Layout/Layout'
import { CountUp, Segmented } from '@components/motion'
import { useUndoToast } from '@components/UndoToast'
import { supabase } from '@/lib/supabase'
import api from '@services/api'
import { useAuth } from '@context/AuthContext'
import { useQueryAction } from '@hooks/useQueryAction'
import {
  STATUSES, statusOf, makeSteps, localDay, progress, nextStep, isLate, daysLeft, toggleStep, addStep, removeStep,
  renameStep, completionOffer, statusPatch, filterProjects, sortProjects, summary, validateNew,
} from '@lib/projects'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED', org: '#FF6B35', red: '#EF4444', green: '#22C55E' }
const F = "'DM Sans', sans-serif"
const inp = { background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontSize: 13, fontFamily: F, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const lbl = { fontSize: 11, color: C.mut, fontWeight: 600, display: 'block', marginBottom: 4 }
const ini = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Sem prazo')
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDay(d) }
const AVATAR = ['#FF6B35', '#7C3AED', '#3B82F6', '#22C55E', '#EAB308', '#EC4899']
const avatarColor = (name) => AVATAR[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length]

const demoSteps = (titles, doneCount) => makeSteps(titles).map((s, i) => (i < doneCount ? { ...s, done: true, done_at: new Date().toISOString() } : s))
const DEMO = [
  { id: 'dp1', name: 'Implantação CRM + WhatsApp', client_name: 'Clínica Vida', status: 'active', due_date: plusDays(9), lead_name: 'Você', team: ['Você', 'Bia'], steps: demoSteps(undefined, 3), notes: '' },
  { id: 'dp2', name: 'Bot de agendamento', client_name: 'Auto Center Sul', status: 'active', due_date: plusDays(-3), lead_name: 'Bia', team: ['Bia'], steps: demoSteps(['Mapear horários', 'Fluxo de confirmação', 'Teste com 10 clientes', 'Publicar'], 1), notes: '' },
  { id: 'dp3', name: 'Migração de contatos', client_name: 'TechInova', status: 'review', due_date: plusDays(2), lead_name: 'Você', team: ['Você'], steps: demoSteps(['Exportar planilha', 'Limpar duplicados', 'Importar no CRM'], 3), notes: '' },
  { id: 'dp4', name: 'Campanha de reativação', client_name: 'Loja Sol', status: 'planning', due_date: plusDays(21), lead_name: 'Pino', team: ['Pino', 'Você'], steps: demoSteps(undefined, 0), notes: '' },
  { id: 'dp5', name: 'Treinamento do time comercial', client_name: 'BestPay', status: 'done', due_date: plusDays(-10), lead_name: 'Você', team: ['Você'], completed_at: new Date().toISOString(), steps: demoSteps(['Agenda com o time', 'Aula ao vivo', 'Material gravado'], 3), notes: '' },
]

// Anel de progresso; o traço anima quando o valor muda.
function Ring({ pct, color, size = 46 }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(pct)); return () => cancelAnimationFrame(t) }, [pct])
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% concluído`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--ink-1)" fontSize="11" fontWeight="800" fontFamily={F}>{pct}%</text>
    </svg>
  )
}

const Avatars = ({ names = [], max = 3 }) => (
  <span style={{ display: 'inline-flex' }}>
    {names.slice(0, max).map((n, i) => (
      <span key={n} title={n} style={{ width: 24, height: 24, borderRadius: '50%', marginLeft: i ? -7 : 0, border: '2px solid var(--card)', background: avatarColor(n), color: '#fff', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{ini(n)}</span>
    ))}
    {names.length > max && <span style={{ marginLeft: 4, fontSize: 11, color: C.mut, alignSelf: 'center' }}>+{names.length - max}</span>}
  </span>
)

function ProjectCard({ p, onOpen, today }) {
  const st = statusOf(p.status)
  const pr = progress(p)
  const nx = nextStep(p)
  const late = isLate(p, today)
  const left = daysLeft(p, today)
  return (
    <button onClick={() => onOpen(p)} className="rf-lift" aria-label={`Abrir projeto ${p.name}`}
      style={{ textAlign: 'left', background: C.card, border: `1px solid ${late ? C.red + '55' : C.bd}`, borderRadius: 16, padding: 16, cursor: 'pointer', fontFamily: F, color: C.tx, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 110% -20%, ${st.color}22, transparent 60%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: st.color + '1c', border: `1px solid ${st.color}44`, borderRadius: 20, padding: '2px 9px' }}>{st.label}</span>
        {late && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.red, background: C.red + '18', borderRadius: 20, padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Atrasado</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Ring pct={pr.pct} color={st.color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client_name || 'Interno'}</p>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.mut, display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
        <ListChecks size={13} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: C.tx }}>{pr.done}/{pr.total}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.status === 'done' ? '· concluído' : nx ? `· Próximo: ${nx.title}` : pr.total ? '· tudo feito' : '· sem passos'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: late ? C.red : C.mut, fontWeight: late ? 700 : 500 }}>
          <CalendarClock size={13} /> {fmtDate(p.due_date)}
          {p.status !== 'done' && left != null && <span style={{ color: late ? C.red : C.mut }}>· {left < 0 ? `${-left}d atrás` : left === 0 ? 'hoje' : `${left}d`}</span>}
        </span>
        <Avatars names={p.team?.length ? p.team : (p.lead_name ? [p.lead_name] : [])} />
      </div>
    </button>
  )
}

function ClientField({ clients, value, onChange }) {
  const [q, setQ] = useState(value?.client_name || '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const list = q.trim() ? clients.filter(c => (c.name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input value={q} placeholder="Buscar cliente ou deixar em branco (interno)" style={inp}
        onChange={e => { setQ(e.target.value); onChange({ client_id: null, client_name: e.target.value }); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && list.length > 0 && (
        <div className="rf-pop" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: 'var(--panel)', border: `1px solid ${C.bd}`, borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.35)', overflow: 'hidden' }}>
          {list.map(c => (
            <button key={c.id} type="button" onClick={() => { onChange({ client_id: c.id, client_name: c.name }); setQ(c.name); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: `1px solid ${C.bd}`, color: C.tx, fontSize: 13, cursor: 'pointer', fontFamily: F }}>{c.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({ step, onToggle, onRemove, onRename, index }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(step.title)
  const [pop, setPop] = useState(false)
  const commit = () => { setEditing(false); if (text.trim() && text.trim() !== step.title) onRename(text); else setText(step.title) }
  return (
    <li className="rf-step" style={{ '--i': index, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, background: step.done ? 'rgba(34,197,94,0.06)' : 'transparent', transition: 'background .25s ease' }}>
      <button onClick={() => { if (!step.done) { setPop(true); setTimeout(() => setPop(false), 400) } onToggle() }}
        role="checkbox" aria-checked={step.done} aria-label={step.title} className={pop ? 'rf-check-pop' : undefined}
        style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', border: `2px solid ${step.done ? C.green : 'var(--ink-3)'}`, background: step.done ? C.green : 'transparent', transition: 'background .2s ease, border-color .2s ease' }}>
        {step.done && <Check size={14} color="#fff" strokeWidth={3} />}
      </button>
      {editing ? (
        <input autoFocus value={text} onChange={e => setText(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(step.title); setEditing(false) } }}
          style={{ ...inp, padding: '5px 8px' }} />
      ) : (
        <span onDoubleClick={() => setEditing(true)} style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: step.done ? C.mut : C.tx, textDecoration: step.done ? 'line-through' : 'none', textDecorationColor: 'var(--ink-3)', transition: 'color .25s ease' }}>{step.title}</span>
      )}
      {!editing && <button onClick={() => setEditing(true)} aria-label={`Renomear ${step.title}`} title="Renomear" style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'flex', padding: 2 }}><Pencil size={13} /></button>}
      <button onClick={onRemove} aria-label={`Remover ${step.title}`} title="Remover passo" style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'flex', padding: 2 }}><X size={15} /></button>
    </li>
  )
}

function Drawer({ p, onClose, onPatch, onDelete, leadOptions, showToast }) {
  const [newStep, setNewStep] = useState('')
  const [name, setName] = useState(p.name)
  const [notes, setNotes] = useState(p.notes || '')
  useEffect(() => { setName(p.name); setNotes(p.notes || '') }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pr = progress(p)
  const st = statusOf(p.status)
  const offer = completionOffer(p)
  const steps = Array.isArray(p.steps) ? p.steps : []
  const team = p.team || []
  const people = [...new Set([...(p.lead_name ? [p.lead_name] : []), ...leadOptions])]

  const toggle = (id) => onPatch(p, toggleStep(p, id))
  const remove = (step) => {
    const before = steps
    onPatch(p, { steps: removeStep(p, step.id) })
    showToast('Passo removido.', () => onPatch({ ...p, steps: removeStep(p, step.id) }, { steps: before }))
  }
  const add = () => { if (!newStep.trim()) return; onPatch(p, { steps: addStep(p, newStep) }); setNewStep('') }
  const setStatus = (s) => onPatch(p, statusPatch(p, s))
  const toggleMember = (n) => {
    if (n === p.lead_name) return
    onPatch(p, { team: team.includes(n) ? team.filter(x => x !== n) : [...team, n] })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 998, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,12,0.5)', backdropFilter: 'blur(3px)' }} />
      <aside role="dialog" aria-modal="true" aria-label={`Projeto ${p.name}`} className="rf-drawer"
        style={{ position: 'relative', width: 480, maxWidth: '100%', height: '100%', overflowY: 'auto', background: 'var(--panel)', borderLeft: `1px solid ${C.bd}`, boxShadow: '-20px 0 60px rgba(0,0,0,0.35)', fontFamily: F, color: C.tx, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${C.bd}`, position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input value={name} onChange={e => setName(e.target.value)} aria-label="Nome do projeto"
              onBlur={() => { if (name.trim() && name.trim() !== p.name) onPatch(p, { name: name.trim() }); else setName(p.name) }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: '1px solid transparent', borderRadius: 8, color: C.tx, fontSize: 18, fontWeight: 800, fontFamily: F, padding: '4px 6px', margin: '-4px -6px', outline: 'none' }} />
            <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'flex' }}><X size={19} /></button>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.mut, display: 'flex', alignItems: 'center', gap: 6 }}>
            {p.client_id ? (
              <Link to={`/crm?abrir=${p.client_id}`} style={{ color: C.org, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{p.client_name} <ExternalLink size={12} /></Link>
            ) : <span>{p.client_name || 'Projeto interno'}</span>}
          </div>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 18 }}>
          <Segmented label="Status do projeto" options={STATUSES.map(s => [s.id, s.label])} value={p.status} onChange={setStatus} accent={st.color} size="sm" style={{ width: '100%', justifyContent: 'space-between' }} />

          {offer && (
            <div className="rf-pop" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)' }}>
              <CheckCircle2 size={18} color={C.green} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13 }}>Todos os passos feitos!</span>
              <button onClick={() => setStatus(offer)} style={{ background: C.green, border: 'none', color: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {offer === 'review' ? 'Mandar para revisão' : 'Concluir projeto'} <ArrowRight size={13} />
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Prazo</label>
              <input type="date" value={p.due_date || ''} onChange={e => onPatch(p, { due_date: e.target.value || null })} style={inp} />
            </div>
            <div>
              <label style={lbl}>Responsável</label>
              <select value={p.lead_name || ''} onChange={e => onPatch(p, { lead_name: e.target.value, team: team.includes(e.target.value) ? team : [e.target.value, ...team] })} style={{ ...inp, appearance: 'none' }}>
                {people.map(n => <option key={n} value={n} style={{ background: 'var(--card)' }}>{n}</option>)}
              </select>
            </div>
          </div>

          {people.length > 1 && (
            <div>
              <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}><Users size={12} /> Equipe</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {people.map(n => {
                  const on = team.includes(n) || n === p.lead_name
                  const locked = n === p.lead_name
                  return (
                    <button key={n} onClick={() => toggleMember(n)} disabled={locked} aria-pressed={on} title={locked ? 'Responsável não sai da equipe' : undefined} className="rf-press"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', borderRadius: 20, border: `1px solid ${on ? avatarColor(n) + '88' : C.bd}`, background: on ? avatarColor(n) + '1c' : 'transparent', color: on ? C.tx : C.mut, fontSize: 12, fontWeight: 600, cursor: locked ? 'default' : 'pointer', fontFamily: F }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? avatarColor(n) : 'var(--border)', color: '#fff', fontSize: 8.5, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{ini(n)}</span>
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Checklist</span>
              <span style={{ fontSize: 12, color: C.mut }}><b style={{ color: C.tx }}>{pr.done}</b> de {pr.total} · {pr.pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--bg)', overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${pr.pct}%`, borderRadius: 99, background: `linear-gradient(90deg, ${st.color}, ${C.green})`, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
              {steps.map((s, i) => (
                <StepRow key={s.id} step={s} index={i} onToggle={() => toggle(s.id)} onRemove={() => remove(s)} onRename={(t) => onPatch(p, { steps: renameStep(p, s.id, t) })} />
              ))}
            </ul>
            {steps.length === 0 && <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: C.mut }}>Nenhum passo ainda. Adicione o primeiro abaixo.</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={newStep} onChange={e => setNewStep(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Novo passo…" aria-label="Novo passo" maxLength={160} style={inp} />
              <button onClick={add} disabled={!newStep.trim()} className="rf-press" style={{ background: C.pur, border: 'none', color: '#fff', borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: newStep.trim() ? 'pointer' : 'not-allowed', opacity: newStep.trim() ? 1 : 0.5, fontFamily: F }}>Adicionar</button>
            </div>
          </div>

          <div>
            <label style={lbl}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== (p.notes || '')) onPatch(p, { notes }) }}
              placeholder="Combinados, acessos pendentes, contatos do cliente…" rows={4} style={{ ...inp, resize: 'vertical' }} />
          </div>

          <button onClick={() => onDelete(p)} style={{ justifySelf: 'start', background: 'none', border: `1px solid ${C.red}55`, color: C.red, borderRadius: 9, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={14} /> Excluir projeto
          </button>
        </div>
      </aside>
    </div>
  )
}

export function Projects() {
  const { user, ownerUserId, isDemoMode } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [clients, setClients] = useState([])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const { toastEl, showToast } = useUndoToast()
  const today = localDay()
  const me = user?.user_metadata?.full_name || (isDemoMode ? 'Você' : 'Eu')
  const leadOptions = useMemo(() => [...new Set([me, ...members])], [me, members])

  const load = useCallback(async () => {
    if (isDemoMode) { setRows(DEMO); setMembers(['Bia', 'Pino']); setLoading(false); return }
    if (!ownerUserId) return
    const { data, error } = await supabase.from('projects').select('*').eq('user_id', ownerUserId).order('due_date', { ascending: true, nullsFirst: false })
    if (error) {
      const msg = `${error.code || ''} ${error.message || ''}`
      if (/42P01|PGRST205|does not exist|schema cache/i.test(msg)) setMissingTable(true)
      else showToast('Não foi possível carregar os projetos.')
    } else setRows(data || [])
    setLoading(false)
    const [{ data: cli }, team] = await Promise.all([
      supabase.from('clients').select('id,name').eq('user_id', ownerUserId).order('name', { ascending: true }),
      api.get('/clients/team-members', { params: { owner: ownerUserId } }).then(r => r.data).catch(() => []),
    ])
    setClients(cli || [])
    setMembers((team || []).map(m => m.name).filter(Boolean))
  }, [ownerUserId, isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const openNew = () => { setForm({ name: '', client_id: null, client_name: '', due_date: plusDays(30), lead_name: me, template: true }); setModal(true) }
  useQueryAction('novo', openNew, !loading)
  useQueryAction('abrir', (id) => setOpenId(id), !loading)

  const sum = useMemo(() => summary(rows, today), [rows, today])
  const visible = useMemo(() => sortProjects(filterProjects(rows, { status, query }), today), [rows, status, query, today])
  const open = rows.find(r => r.id === openId) || null

  // Atualização otimista; em erro volta ao estado anterior.
  const patch = useCallback(async (p, fields) => {
    setRows(list => list.map(r => (r.id === p.id ? { ...r, ...fields } : r)))
    if (isDemoMode) return
    const { error } = await supabase.from('projects').update(fields).eq('id', p.id)
    if (error) { setRows(list => list.map(r => (r.id === p.id ? p : r))); showToast('Não foi possível salvar. Tente de novo.') }
  }, [isDemoMode, showToast])

  const create = async () => {
    const err = validateNew(form)
    if (err) { showToast(err); return }
    if (busy) return
    const row = {
      name: form.name.trim(), client_id: form.client_id || null, client_name: form.client_name?.trim() || null,
      due_date: form.due_date, lead_name: form.lead_name || me, team: [form.lead_name || me],
      status: 'planning', steps: form.template ? makeSteps() : [], notes: '',
    }
    if (isDemoMode) {
      const p = { ...row, id: `dp${Date.now()}` }
      setRows(l => [p, ...l]); setModal(false); setOpenId(p.id); return
    }
    setBusy(true)
    const { data, error } = await supabase.from('projects').insert({ ...row, user_id: ownerUserId }).select().single()
    setBusy(false)
    if (error) { showToast(/42P01|PGRST205|does not exist/i.test(`${error.code} ${error.message}`) ? 'Rode supabase/projects.sql no Supabase primeiro.' : 'Não foi possível criar o projeto.'); return }
    setRows(l => [data, ...l]); setModal(false); setOpenId(data.id)
  }

  const del = async (p) => {
    if (!window.confirm(`Excluir o projeto "${p.name}"? O checklist e as notas serão apagados.`)) return
    setOpenId(null)
    setRows(l => l.filter(r => r.id !== p.id))
    if (isDemoMode) { showToast('Projeto excluído (modo demo).'); return }
    const { error } = await supabase.from('projects').delete().eq('id', p.id)
    if (error) { setRows(l => [p, ...l]); showToast('Não foi possível excluir.') } else showToast('Projeto excluído.')
  }

  const filterOpts = [['all', `Todos ${sum.all}`], ...STATUSES.map(s => [s.id, `${s.label} ${sum.counts[s.id] || 0}`])]
  const kpis = [
    { label: 'Em aberto', value: sum.open, color: '#3B82F6', Icon: FolderKanban },
    { label: 'Em revisão', value: sum.counts.review || 0, color: '#EAB308', Icon: Eye },
    { label: 'Atrasados', value: sum.late, color: C.red, Icon: AlertTriangle },
    { label: 'Concluídos no mês', value: sum.doneThisMonth, color: C.green, Icon: CheckCircle2 },
  ]

  return (
    <Layout title="Projetos" subtitle="Implantação e pós-venda com checklist">
      {isDemoMode && (
        <div style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.27)', color: '#EAB308', borderRadius: 14, padding: '12px 16px', fontSize: 13, marginBottom: 16, fontFamily: F }}>
          Modo demo — os projetos abaixo são exemplo. Crie uma conta para gerenciar de verdade.
        </div>
      )}

      {missingTable ? (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 24, fontFamily: F, color: C.tx, maxWidth: 620 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Falta criar a tabela de projetos</h3>
          <p style={{ margin: 0, fontSize: 13.5, color: C.mut, lineHeight: 1.6 }}>
            No Supabase, abra <b style={{ color: C.tx }}>SQL Editor → New query</b>, cole o conteúdo de <code>supabase/projects.sql</code> e clique em <b style={{ color: C.tx }}>Run</b>. Depois recarregue esta página.
          </p>
        </div>
      ) : (
        <>
          <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12, marginBottom: 16 }}>
            {kpis.map(k => (
              <div key={k.label} className="rf-lift" style={{ background: C.card, border: `1px solid ${C.bd}`, borderLeft: `3px solid ${k.color}`, borderRadius: 14, padding: 16, fontFamily: F }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mut, fontSize: 12 }}><k.Icon size={14} color={k.color} /> {k.label}</div>
                <p style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, color: C.tx, fontVariantNumeric: 'tabular-nums' }}><CountUp value={k.value} /></p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Segmented label="Filtrar por status" options={filterOpts} value={status} onChange={setStatus} />
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.mut }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Projeto, cliente ou responsável" aria-label="Buscar projetos" style={{ ...inp, paddingLeft: 30 }} />
            </div>
            <button onClick={openNew} className="rf-press" style={{ marginLeft: 'auto', background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Novo projeto</button>
          </div>

          {loading ? (
            <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 28, textAlign: 'center', color: C.mut, fontFamily: F }}>Carregando…</div>
          ) : visible.length === 0 ? (
            <div style={{ background: C.card, border: `1px dashed ${C.bd}`, borderRadius: 16, padding: 36, textAlign: 'center', fontFamily: F }}>
              <FolderKanban size={30} color={C.mut} />
              <p style={{ margin: '10px 0 4px', fontSize: 15, fontWeight: 700, color: C.tx }}>{rows.length ? 'Nenhum projeto neste filtro' : 'Nenhum projeto ainda'}</p>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: C.mut }}>Organize a implantação de cada cliente com um checklist de passos.</p>
              {!rows.length && <button onClick={openNew} className="rf-press" style={{ background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: F, padding: '9px 16px', cursor: 'pointer' }}>Criar o primeiro projeto</button>}
            </div>
          ) : (
            <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 14 }}>
              {visible.map(p => <ProjectCard key={p.id} p={p} today={today} onOpen={(x) => setOpenId(x.id)} />)}
            </div>
          )}
        </>
      )}

      {open && <Drawer p={open} onClose={() => setOpenId(null)} onPatch={patch} onDelete={del} leadOptions={leadOptions} showToast={showToast} />}

      {modal && form && (
        <div className="rf-scrim" onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-label="Novo projeto" className="rf-pop" onClick={e => e.stopPropagation()}
            style={{ background: 'var(--panel)', border: `1px solid ${C.bd}`, borderRadius: 16, padding: 20, width: 480, maxWidth: '100%', display: 'grid', gap: 12, fontFamily: F, color: C.tx }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Novo projeto</h3>
              <button onClick={() => setModal(false)} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mut, display: 'flex' }}><X size={18} /></button>
            </div>
            <div>
              <label style={lbl}>Nome do projeto *</label>
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex.: Implantação CRM + WhatsApp" maxLength={120} style={inp} />
            </div>
            <div>
              <label style={lbl}>Cliente</label>
              <ClientField clients={clients} value={form} onChange={(c) => setForm(f => ({ ...f, ...c }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Prazo *</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Responsável</label>
                <select value={form.lead_name} onChange={e => setForm(f => ({ ...f, lead_name: e.target.value }))} style={{ ...inp, appearance: 'none' }}>
                  {leadOptions.map(n => <option key={n} value={n} style={{ background: 'var(--card)' }}>{n}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.template} onChange={e => setForm(f => ({ ...f, template: e.target.checked }))} style={{ marginTop: 2 }} />
              <span>Começar com o checklist padrão<br /><span style={{ fontSize: 11.5, color: C.mut }}>Início, acessos, configuração, treinamento e entrada no ar — dá para editar depois.</span></span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 9, color: C.tx, fontSize: 14, fontFamily: F, padding: '9px 16px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={create} disabled={busy} className="rf-press" style={{ background: C.pur, border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: F, padding: '9px 18px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy && <Loader2 size={14} className="animate-spin" />}Criar projeto
              </button>
            </div>
          </div>
        </div>
      )}

      {toastEl}
    </Layout>
  )
}

export default Projects
