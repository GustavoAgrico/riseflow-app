// Monitor do time — pensado primeiro para o gestor no celular:
// ver quem está bem ou mal agora e CHAMAR a pessoa (recado na tela dela, WhatsApp ou e-mail).
// Nota de desempenho e motivos em src/lib/teamPerf.js; recado via POST /api/team/nudge.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserCheck, Clock, Inbox, ChevronDown, ChevronUp, Eye, Bot, ArrowRight, Megaphone, AlertTriangle, Trophy,
  Send, MessageCircle, Mail, X, Loader2, Radio, Users, Activity,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import api from '@services/api'
import socket from '@services/socket'
import { useAuth } from '@context/AuthContext'
import { Layout } from '@components/Layout/Layout'
import { CountUp } from '@components/motion'
import { Donut } from '@components/Pipeline/Charts'
import { useUndoToast } from '@components/UndoToast'
import { memberStats, needsAttention, nudgeTemplates, sentTodayByName, winsByName, fmtWait, LEVELS } from '@lib/teamPerf'

const F = "'DM Sans', sans-serif"
const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED', org: '#FF6B35', green: '#22C55E', red: '#EF4444', yellow: '#EAB308' }
const ST = { online: { l: 'Online', c: '#22C55E' }, ausente: { l: 'Ausente', c: '#EAB308' }, offline: { l: 'Offline', c: '#94A3B8' } }
const ini = (n = '') => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
const isOpen = (s) => !['closed', 'resolved', 'done', 'finished', 'encerrada'].includes(String(s || '').toLowerCase())
const rel = (d) => {
  if (!d) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000))
  if (m < 1) return 'agora'; if (m < 60) return `${m}min`; if (m < 1440) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}
const brlShort = (n) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(n).toLocaleString('pt-BR')}`)

const now0 = Date.now()
const t = (min) => new Date(now0 - min * 60000).toISOString()
const DEMO_MEMBERS = [
  { id: 'd1', name: 'Ana Paula Silva', role: 'Supervisor', status: 'online', email: 'ana@exemplo.com' },
  { id: 'd2', name: 'Carlos Eduardo', role: 'Atendente', status: 'online', email: 'carlos@exemplo.com' },
  { id: 'd3', name: 'Mariana Oliveira', role: 'Atendente', status: 'ausente', email: 'mariana@exemplo.com' },
  { id: 'd4', name: 'João Pedro', role: 'Atendente', status: 'offline', email: '' },
]
const DEMO_CONVS = [
  { id: 'c1', contact_name: 'Loja TechInova', assigned_to: 'Ana Paula Silva', unread_count: 0, status: 'active', last_message_at: t(3), ai_auto_reply: false },
  { id: 'c2', contact_name: 'Bruno Martins', assigned_to: 'Ana Paula Silva', unread_count: 0, status: 'active', last_message_at: t(40), ai_auto_reply: true },
  { id: 'c3', contact_name: 'BestPay', assigned_to: 'Carlos Eduardo', unread_count: 2, status: 'active', last_message_at: t(6), ai_auto_reply: false },
  { id: 'c4', contact_name: 'MktPro', assigned_to: 'Carlos Eduardo', unread_count: 0, status: 'active', last_message_at: t(12), ai_auto_reply: false },
  { id: 'c5', contact_name: 'StorePrime', assigned_to: 'Mariana Oliveira', unread_count: 3, status: 'active', last_message_at: t(95), ai_auto_reply: false },
  { id: 'c8', contact_name: 'Clínica Vida', assigned_to: 'Mariana Oliveira', unread_count: 1, status: 'active', last_message_at: t(52), ai_auto_reply: false },
  { id: 'c9', contact_name: 'Auto Center', assigned_to: 'João Pedro', unread_count: 2, status: 'active', last_message_at: t(130), ai_auto_reply: false },
  { id: 'c6', contact_name: 'Novo Lead 1', assigned_to: null, unread_count: 3, status: 'active', last_message_at: t(6), ai_auto_reply: false },
  { id: 'c7', contact_name: 'Novo Lead 2', assigned_to: null, unread_count: 1, status: 'active', last_message_at: t(22), ai_auto_reply: false },
]
const DEMO_SENT = { 'Ana Paula Silva': 14, 'Carlos Eduardo': 8, 'Mariana Oliveira': 0, 'João Pedro': 0 }
const DEMO_WINS = { 'Ana Paula Silva': { count: 2, value: 12400 }, 'Carlos Eduardo': { count: 1, value: 3200 } }
const DEMO_FEED = [
  { id: 'f1', agent: 'Carlos Eduardo', contact: 'BestPay', text: 'Boa tarde! Como posso ajudar?', at: t(1), kind: 'out' },
  { id: 'f2', agent: 'Ana Paula Silva', contact: 'Loja TechInova', text: 'Proposta enviada com sucesso!', at: t(3), kind: 'out' },
  { id: 'f4', agent: 'IA', contact: 'Bruno Martins', text: 'Resposta automática enviada', at: t(15), kind: 'ai' },
  { id: 'f5', agent: null, contact: 'StorePrime', text: 'Alguém pode me responder?', at: t(20), kind: 'in' },
]

function ScoreRing({ score, color, size = 54 }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r
  const [shown, setShown] = useState(0)
  useEffect(() => { const id = requestAnimationFrame(() => setShown(score)); return () => cancelAnimationFrame(id) }, [score])
  return (
    <svg width={size} height={size} role="img" aria-label={`Nota ${score}`} style={{ flexShrink: 0, filter: `drop-shadow(0 0 8px ${color}55)` }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - shown / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--ink-1)" fontSize="15" fontWeight="800" fontFamily={F}>{score}</text>
    </svg>
  )
}

function Avatar({ name, status, size = 44 }) {
  const s = ST[status] || ST.offline
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: 14, background: `linear-gradient(135deg, ${C.pur}, #4F46E5)`, color: '#fff', fontWeight: 800, fontSize: size / 3, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px rgba(124,58,237,.35)' }}>{ini(name)}</div>
      <span title={s.l} className={status === 'online' ? 'rf-live-dot' : undefined} style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: '50%', background: s.c, border: '2.5px solid var(--card)', '--c': s.c }} />
    </div>
  )
}

// Folha "Chamar": recados prontos, texto livre, e três jeitos de entregar.
function NudgeSheet({ row, onClose, onSend, sending, mobile }) {
  const templates = nudgeTemplates(row)
  const [text, setText] = useState(templates[0] || '')
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`
  const mail = row.email ? `mailto:${row.email}?subject=${encodeURIComponent('Recado do gestor')}&body=${encodeURIComponent(text)}` : null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,12,.6)', backdropFilter: 'blur(4px)' }} />
      <div role="dialog" aria-modal="true" aria-label={`Chamar ${row.name}`} className={mobile ? 'rf-bubble-up' : 'rf-pop'}
        style={{ position: 'relative', width: mobile ? '100%' : 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--panel)', color: C.tx, fontFamily: F,
          border: `1px solid ${C.bd}`, borderRadius: mobile ? '22px 22px 0 0' : 20, padding: '14px 18px calc(18px + env(safe-area-inset-bottom))', boxShadow: '0 -20px 60px rgba(0,0,0,.45)' }}>
        {mobile && <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border)', margin: '0 auto 12px' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={row.name} status={row.status} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Chamar {row.name.split(' ')[0]}</div>
            <div style={{ fontSize: 12, color: C.mut }}>{(ST[row.status] || ST.offline).l} · nota {row.score} · {LEVELS[row.level].label}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', display: 'flex' }}><X size={19} /></button>
        </div>
        <p style={{ margin: '14px 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: .5, color: C.mut, textTransform: 'uppercase' }}>Recados prontos</p>
        <div style={{ display: 'grid', gap: 6 }}>
          {templates.map(tp => (
            <button key={tp} onClick={() => setText(tp)} className="rf-press" style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontSize: 13, lineHeight: 1.4, color: C.tx, background: text === tp ? 'rgba(255,107,53,.12)' : 'var(--bg)', border: `1px solid ${text === tp ? 'rgba(255,107,53,.55)' : C.bd}` }}>{tp}</button>
          ))}
        </div>
        <label htmlFor="nudge-text" style={{ display: 'block', margin: '12px 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: .5, color: C.mut, textTransform: 'uppercase' }}>Ou escreva</label>
        <textarea id="nudge-text" value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={400}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'var(--bg)', border: `1px solid ${C.bd}`, borderRadius: 12, color: C.tx, fontFamily: F, fontSize: 14, padding: 11, outline: 'none' }} />
        <button onClick={() => onSend(text)} disabled={!text.trim() || sending} className="rf-press"
          style={{ width: '100%', marginTop: 12, minHeight: 48, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#FF9A2E,#FF6A1F)', color: '#1A0B02', fontWeight: 800, fontSize: 15, cursor: text.trim() ? 'pointer' : 'not-allowed', opacity: text.trim() ? 1 : .5, fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Enviar na tela dela
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: mail ? '1fr 1fr' : '1fr', gap: 8, marginTop: 8 }}>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="rf-press" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #22C55E66', background: '#22C55E14', color: '#22C55E', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, textDecoration: 'none' }}><MessageCircle size={16} /> WhatsApp</a>
          {mail && <a href={mail} className="rf-press" style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${C.bd}`, color: C.tx, fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, textDecoration: 'none' }}><Mail size={16} /> E-mail</a>}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.mut, lineHeight: 1.45 }}>"Enviar na tela dela" aparece na hora se estiver no RiseFlow; se não, fica no sino. No WhatsApp você escolhe o contato da pessoa.</p>
      </div>
    </div>
  )
}

function MemberCard({ row, onCall, expanded, onToggle, onOpenChat }) {
  const lv = LEVELS[row.level]
  const s = ST[row.status] || ST.offline
  return (
    <article className="rf-lift" style={{ position: 'relative', overflow: 'hidden', background: C.card, border: `1px solid ${row.level === 'critico' ? C.red + '66' : row.level === 'atencao' ? C.yellow + '55' : C.bd}`, borderRadius: 18, fontFamily: F, color: C.tx }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 100% 0%, ${lv.color}1c, transparent 55%)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 10px' }}>
        <Avatar name={row.name} status={row.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</p>
          <p style={{ margin: '1px 0 0', fontSize: 12, color: s.c, fontWeight: 700 }}>{s.l}<span style={{ color: C.mut, fontWeight: 500 }}> · {row.role || 'Atendente'}</span></p>
          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 800, color: lv.color, background: lv.color + '1a', border: `1px solid ${lv.color}55`, borderRadius: 20, padding: '1px 8px' }}>{lv.label}</span>
        </div>
        <ScoreRing score={row.score} color={lv.color} />
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '0 14px' }}>
        {[
          ['Ativas', row.active, C.tx],
          ['Esperando', row.waiting, row.waiting ? C.org : C.tx],
          ['Hoje', row.sent, C.tx],
          ['Vendas', row.wonCount, row.wonCount ? C.green : C.tx],
        ].map(([l, v, col]) => (
          <div key={l} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 10, padding: '7px 2px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}><CountUp value={v} /></div>
            <div style={{ fontSize: 10, color: C.mut }}>{l}</div>
          </div>
        ))}
      </div>
      {row.reasons.length > 0 && (
        <div style={{ position: 'relative', display: 'flex', gap: 5, flexWrap: 'wrap', padding: '10px 14px 0' }}>
          {row.reasons.slice(0, 3).map(r => {
            const col = r.tone === 'bad' ? C.red : r.tone === 'warn' ? C.yellow : C.green
            return <span key={r.text} style={{ fontSize: 11, fontWeight: 600, color: col, background: col + '14', borderRadius: 20, padding: '2px 8px' }}>{r.text}</span>
          })}
        </div>
      )}
      <div style={{ position: 'relative', display: 'flex', gap: 8, padding: 14 }}>
        <button onClick={() => onCall(row)} className="rf-press" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: 'none', background: row.level === 'critico' || row.level === 'atencao' ? 'linear-gradient(135deg,#FF9A2E,#FF6A1F)' : 'rgba(255,107,53,.12)', color: row.level === 'critico' || row.level === 'atencao' ? '#1A0B02' : '#FF8A3D', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Megaphone size={15} /> Chamar
        </button>
        {row.active > 0 && (
          <button onClick={onToggle} aria-expanded={expanded} className="rf-press" style={{ minHeight: 42, padding: '0 12px', borderRadius: 12, border: `1px solid ${C.bd}`, background: 'transparent', color: C.tx, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 5 }}>
            Conversas {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>
      {expanded && (
        <div style={{ position: 'relative', borderTop: `1px solid ${C.bd}`, background: C.bg }}>
          {[...row.convs].sort((a, b) => (Number(b.unread_count) || 0) - (Number(a.unread_count) || 0) || new Date(a.last_message_at || 0) - new Date(b.last_message_at || 0)).map((c, i) => (
            <div key={c.id} className="rf-feed-in" style={{ animationDelay: `${i * 40}ms`, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.bd}` : 'none' }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: C.pur + '22', color: C.pur, fontWeight: 800, fontSize: 10.5, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ini(c.contact_name || '?')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || c.contact_phone || 'Sem nome'}</p>
                <span style={{ fontSize: 11, color: Number(c.unread_count) > 0 ? C.org : C.mut }}>{Number(c.unread_count) > 0 ? `esperando há ${rel(c.last_message_at)}` : `última msg há ${rel(c.last_message_at)}`}</span>
                {c.ai_auto_reply && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#8B5CF6' }}>IA</span>}
              </div>
              {Number(c.unread_count) > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.org, background: C.org + '22', borderRadius: 999, padding: '2px 8px' }}>{c.unread_count}</span>}
              <button onClick={() => onOpenChat(c)} aria-label={`Espiar conversa com ${c.contact_name || 'contato'}`} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.bd}`, background: 'transparent', color: C.mut, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Eye size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export const TeamMonitor = () => {
  const navigate = useNavigate()
  const { ownerUserId, isDemoMode, loading: authLoading, user } = useAuth()
  const [members, setMembers] = useState([])
  const [convs, setConvs] = useState([])
  const [messages, setMessages] = useState([])
  const [wonRows, setWonRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [clock, setClock] = useState(() => new Date())
  const [expanded, setExpanded] = useState(() => new Set())
  const [calling, setCalling] = useState(null)
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState('equipe') // celular: equipe | fila | atividade
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const { toastEl, showToast } = useUndoToast()

  useEffect(() => {
    const on = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const load = useCallback(async () => {
    if (isDemoMode) { setMembers(DEMO_MEMBERS); setConvs(DEMO_CONVS); setLoading(false); setUpdatedAt(new Date()); return }
    if (!ownerUserId) return
    const d = new Date()
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
    const [{ data: m }, { data: c }, { data: msgs }, { data: won }] = await Promise.all([
      supabase.from('team_members').select('id,name,role,status,email').eq('user_id', ownerUserId).order('created_at', { ascending: true }),
      supabase.from('conversations').select('id,contact_name,contact_phone,assigned_to,unread_count,status,last_message_at,ai_auto_reply').eq('user_id', ownerUserId),
      supabase.from('messages').select('id,contact_phone,content,direction,sender_name,created_at').eq('user_id', ownerUserId).gte('created_at', dayStart).order('created_at', { ascending: false }).limit(2000),
      supabase.from('clients').select('assigned_to,value').eq('user_id', ownerUserId).gte('won_at', monthStart),
    ])
    setMembers(m ?? []); setConvs(c ?? []); setMessages(msgs ?? []); setWonRows(won ?? [])
    setUpdatedAt(new Date()); setLoading(false)
  }, [ownerUserId, isDemoMode])

  useEffect(() => {
    if (authLoading) return
    load()
    if (isDemoMode || !ownerUserId) return
    let deb
    const bump = () => { clearTimeout(deb); deb = setTimeout(load, 600) }
    const ch = supabase.channel('team_monitor_' + ownerUserId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${ownerUserId}` }, () => bump())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${ownerUserId}` }, () => bump())
      .subscribe()
    const iv = setInterval(load, 20000)
    return () => { clearTimeout(deb); clearInterval(iv); try { supabase.removeChannel(ch) } catch {} }
  }, [authLoading, ownerUserId, isDemoMode, load])

  useEffect(() => {
    if (isDemoMode) return
    const onStatus = ({ memberId, status }) => setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, status } : m)))
    socket.on('team_status', onStatus)
    return () => socket.off('team_status', onStatus)
  }, [isDemoMode])

  useEffect(() => { const id = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(id) }, [])

  const openConvs = useMemo(() => convs.filter(c => isOpen(c.status)), [convs])
  const sent = useMemo(() => (isDemoMode ? DEMO_SENT : sentTodayByName(messages)), [isDemoMode, messages])
  const wins = useMemo(() => (isDemoMode ? DEMO_WINS : winsByName(wonRows)), [isDemoMode, wonRows])
  const rows = useMemo(() => {
    const rank = { online: 0, ausente: 1, offline: 2 }
    return members.map(m => ({ ...m, ...memberStats(m, { convs, sentToday: sent, wins }) }))
      .sort((a, b) => b.score - a.score || (rank[a.status] ?? 3) - (rank[b.status] ?? 3))
  }, [members, convs, sent, wins, clock.getMinutes()]) // eslint-disable-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => needsAttention(rows), [rows])
  const unassigned = useMemo(() => openConvs.filter(c => !c.assigned_to).sort((a, b) => new Date(a.last_message_at || 0) - new Date(b.last_message_at || 0)), [openConvs])

  const k = useMemo(() => {
    const waitingConvs = openConvs.filter(c => Number(c.unread_count) > 0)
    const maxWait = waitingConvs.reduce((a, c) => Math.max(a, Math.round((Date.now() - new Date(c.last_message_at || Date.now()).getTime()) / 60000)), 0)
    return {
      online: members.filter(m => m.status === 'online').length,
      ausente: members.filter(m => m.status === 'ausente').length,
      offline: members.filter(m => (m.status || 'offline') === 'offline').length,
      waiting: waitingConvs.length, maxWait, unassigned: unassigned.length,
      ai: openConvs.filter(c => c.ai_auto_reply).length,
      avg: rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0,
      sentToday: Object.values(sent).reduce((a, n) => a + n, 0),
      wonMonth: Object.values(wins).reduce((a, w) => a + w.value, 0),
    }
  }, [members, openConvs, unassigned, rows, sent, wins])

  const feed = useMemo(() => {
    if (isDemoMode) return DEMO_FEED
    const isOut = (d) => ['outbound', 'sent', 'out'].includes(String(d || '').toLowerCase())
    return messages.slice(0, 20).map(m => ({ id: m.id, agent: isOut(m.direction) ? (m.sender_name || 'Atendente') : null, contact: m.contact_phone, text: (m.content || '').slice(0, 90), at: m.created_at, kind: isOut(m.direction) ? 'out' : 'in' }))
  }, [isDemoMode, messages])

  const sendNudge = async (text) => {
    if (!calling) return
    if (isDemoMode) { setCalling(null); showToast(`Recado enviado para ${calling.name.split(' ')[0]} (modo demo).`); return }
    setSending(true)
    try {
      const from = user?.user_metadata?.full_name || 'Gestor'
      const { data } = await api.post('/team/nudge', { memberId: calling.id, message: text, from })
      setCalling(null)
      showToast(`Recado enviado para ${data.member.split(' ')[0]} — ${data.delivered === 'agora' ? 'aparece na tela agora' : 'vai ver ao entrar'}.`)
    } catch (e) { showToast(e?.response?.data?.error || 'Não foi possível enviar o recado.') }
    setSending(false)
  }
  const openChat = (c) => navigate('/chat', { state: { contact: { phone: c.contact_phone, name: c.contact_name } } })
  const toggle = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const statusDonut = [
    { label: 'Online', value: k.online, color: ST.online.c },
    { label: 'Ausente', value: k.ausente, color: ST.ausente.c },
    { label: 'Offline', value: k.offline, color: ST.offline.c },
  ]

  const queueEl = (
    <section>
      <h3 className="rf-section-title" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Inbox size={16} color="#3B82F6" /> Sem responsável
        {unassigned.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', background: 'rgba(59,130,246,0.15)', borderRadius: 999, padding: '2px 9px' }}>{unassigned.length}</span>}
      </h3>
      <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden' }}>
        {unassigned.length === 0 ? (
          <div style={{ padding: 20, color: C.green, fontSize: 13, textAlign: 'center', fontFamily: F }}>Tudo com responsável ✓</div>
        ) : unassigned.slice(0, 10).map((c, i) => (
          <button key={c.id} onClick={() => openChat(c)} className="rf-feed-in" style={{ animationDelay: `${i * 40}ms`, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', border: 'none', borderTop: i ? `1px solid ${C.bd}` : 'none', background: 'transparent', color: C.tx, cursor: 'pointer', fontFamily: F }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontWeight: 800, fontSize: 11, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ini(c.contact_name || '?')}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || c.contact_phone || 'Sem nome'}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: C.org }}>esperando há {rel(c.last_message_at)}</p>
            </div>
            {Number(c.unread_count) > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.org, background: C.org + '22', borderRadius: 999, padding: '2px 8px' }}>{c.unread_count}</span>}
            <ArrowRight size={15} color={C.mut} />
          </button>
        ))}
      </div>
    </section>
  )
  const feedEl = (
    <section>
      <h3 className="rf-section-title" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={16} color={C.green} /> Atividade agora</h3>
      <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden', maxHeight: mobile ? 'none' : 420, overflowY: 'auto' }}>
        {feed.length === 0 ? <div style={{ padding: 20, color: C.mut, fontSize: 13, textAlign: 'center', fontFamily: F }}>Nenhuma atividade hoje ainda</div>
          : feed.map((f, i) => {
            const col = f.kind === 'ai' ? '#8B5CF6' : f.kind === 'out' ? C.green : C.org
            return (
              <div key={f.id} className="rf-feed-in" style={{ animationDelay: `${i * 35}ms`, display: 'flex', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.bd}` : 'none', fontSize: 12.5, fontFamily: F, color: C.tx }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, boxShadow: `0 0 8px ${col}`, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.agent || f.contact}</b>
                    {f.agent && <span style={{ color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {f.contact}</span>}
                    <span style={{ color: C.mut, marginLeft: 'auto', fontSize: 11, flexShrink: 0 }}>{rel(f.at)}</span>
                  </div>
                  <p style={{ margin: '2px 0 0', color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.text}</p>
                </div>
              </div>
            )
          })}
      </div>
    </section>
  )
  const teamEl = (
    <section>
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 className="rf-section-title" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, color: C.red }}><AlertTriangle size={16} /> Precisa de atenção agora</h3>
          <div className={mobile ? 'rf-swipe' : undefined} style={mobile ? { display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -4px', padding: '0 4px 4px' } : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {alerts.map((r, i) => {
              const lv = LEVELS[r.level]
              return (
                <div key={r.id} className="rf-feed-in" style={{ animationDelay: `${i * 70}ms`, display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, border: `1px solid ${lv.color}66`, background: `linear-gradient(135deg, ${lv.color}1f, transparent 70%), var(--card)`, fontFamily: F, color: C.tx }}>
                  <Avatar name={r.name} status={r.status} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: lv.color, fontWeight: 700 }}>{r.reasons[0]?.text || lv.label}</div>
                  </div>
                  <button onClick={() => setCalling(r)} className="rf-press" style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF9A2E,#FF6A1F)', color: '#1A0B02', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Megaphone size={14} /> Chamar
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <h3 className="rf-section-title" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={16} color={C.yellow} /> Desempenho de hoje</h3>
      {rows.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 24, color: C.mut, fontSize: 13, textAlign: 'center', fontFamily: F }}>
          Nenhuma pessoa na equipe. Adicione em <strong style={{ color: C.pur, cursor: 'pointer' }} onClick={() => navigate('/teams')}>Equipes</strong>.
        </div>
      ) : (
        <div className="rf-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,300px),1fr))', gap: 12 }}>
          {rows.map(r => <MemberCard key={r.id} row={r} onCall={setCalling} expanded={expanded.has(r.id)} onToggle={() => toggle(r.id)} onOpenChat={openChat} />)}
        </div>
      )}
    </section>
  )

  return (
    <Layout title="Monitor do time" subtitle={`${members.length} pessoas · ${k.online} online agora`}>
      {loading ? (
        <div style={{ textAlign: 'center', color: C.mut, padding: 60, fontSize: 14 }}>Carregando monitor…</div>
      ) : (
        <>
          {/* Visão rápida da equipe */}
          <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: mobile ? 14 : 18, marginBottom: 16, fontFamily: F, color: C.tx, border: '1px solid rgba(124,58,237,.3)', background: 'radial-gradient(ellipse at 0% 0%, rgba(124,58,237,.18), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(255,107,53,.14), transparent 60%), var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Users size={18} color="#A78BFA" />
              <span style={{ fontWeight: 800, fontSize: 15 }}>Equipe agora</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.mut }}>
                <span className="rf-live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, '--c': C.green }} />
                {isDemoMode ? 'demo' : 'ao vivo'} <b style={{ color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}><Donut data={statusDonut} size={mobile ? 96 : 110} thickness={13} center={k.online} sub="online" /></div>
              <div className="rf-cards" style={{ flex: '2 1 300px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,130px),1fr))', gap: 8 }}>
                {[
                  [Clock, 'Esperando', k.waiting, k.maxWait ? `maior espera ${fmtWait(k.maxWait)}` : 'ninguém esperando', k.waiting ? C.org : C.green],
                  [Inbox, 'Sem responsável', k.unassigned, k.unassigned ? 'distribua agora' : 'tudo distribuído', k.unassigned ? '#3B82F6' : C.green],
                  [UserCheck, 'Nota média', k.avg, `${k.sentToday} respostas hoje`, LEVELS[k.avg >= 80 ? 'otimo' : k.avg >= 60 ? 'bom' : k.avg >= 40 ? 'atencao' : 'critico'].color],
                  [Bot, 'Com IA', k.ai, k.wonMonth ? `${brlShort(k.wonMonth)} vendidos no mês` : 'conversas no automático', '#8B5CF6'],
                ].map(([Icon, label, val, hint, col]) => (
                  <div key={label} style={{ background: 'rgba(0,0,0,.16)', border: `1px solid ${C.bd}`, borderRadius: 14, padding: '10px 12px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.mut }}><Icon size={13} color={col} /> {label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: col, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}><CountUp value={val} /></div>
                    <div style={{ fontSize: 10.5, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {mobile ? (
            <>
              {/* Celular: abas grandes para o dedo */}
              <div role="tablist" aria-label="Seções do monitor" style={{ position: 'sticky', top: 64, zIndex: 5, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, padding: 4, borderRadius: 14, background: 'color-mix(in srgb, var(--panel) 92%, transparent)', border: `1px solid ${C.bd}`, backdropFilter: 'blur(8px)', marginBottom: 14 }}>
                {[['equipe', 'Equipe', alerts.length], ['fila', 'Sem dono', unassigned.length], ['atividade', 'Atividade', 0]].map(([id, label, n]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                    style={{ minHeight: 42, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: F, fontSize: 13, fontWeight: 800, background: tab === id ? C.pur : 'transparent', color: tab === id ? '#fff' : C.mut, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background .25s ease' }}>
                    {label}{n > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: id === 'equipe' ? C.red : '#3B82F6', color: '#fff', fontSize: 10.5, display: 'grid', placeItems: 'center', padding: '0 4px' }}>{n}</span>}
                  </button>
                ))}
              </div>
              <div key={tab} className="rf-feed-in">{tab === 'equipe' ? teamEl : tab === 'fila' ? queueEl : feedEl}</div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 20, alignItems: 'start' }}>
              {teamEl}
              <div style={{ display: 'grid', gap: 20 }}>{queueEl}{feedEl}</div>
            </div>
          )}
        </>
      )}
      {calling && <NudgeSheet row={calling} mobile={mobile} sending={sending} onClose={() => setCalling(null)} onSend={sendNudge} />}
      {toastEl}
      {updatedAt && <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}><Radio aria-hidden="true" /> atualizado {updatedAt.toLocaleTimeString('pt-BR')}</span>}
    </Layout>
  )
}

export default TeamMonitor
