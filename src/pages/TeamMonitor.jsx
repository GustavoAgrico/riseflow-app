import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, MessageSquare, Clock, Inbox, ChevronDown, ChevronUp, Eye, Phone, Bot, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'
import { Layout } from '@components/Layout/Layout'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED', org: '#FF6B35' }

const ST = {
  online:  { l: 'Online',  c: '#22C55E' },
  ausente: { l: 'Ausente', c: '#EAB308' },
  offline: { l: 'Offline', c: '#94A3B8' },
}
const ini = (n = '') => n.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
const isOpen = (s) => !['closed', 'resolved', 'done', 'finished', 'encerrada'].includes(String(s || '').toLowerCase())
const rel = (d) => {
  if (!d) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000))
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}

const DEMO_MEMBERS = [
  { id: 'd1', name: 'Ana Paula Silva', role: 'Supervisor', status: 'online' },
  { id: 'd2', name: 'Carlos Eduardo', role: 'Atendente', status: 'online' },
  { id: 'd3', name: 'Mariana Oliveira', role: 'Atendente', status: 'ausente' },
  { id: 'd4', name: 'João Pedro', role: 'Atendente', status: 'offline' },
]
const now = Date.now()
const DEMO_CONVS = [
  { id: 'c1', contact_name: 'Loja TechInova', assigned_to: 'Ana Paula Silva', unread_count: 2, status: 'active', last_message_at: new Date(now - 3 * 60000).toISOString(), ai_auto_reply: false },
  { id: 'c2', contact_name: 'Bruno Martins', assigned_to: 'Ana Paula Silva', unread_count: 0, status: 'active', last_message_at: new Date(now - 40 * 60000).toISOString(), ai_auto_reply: true },
  { id: 'c3', contact_name: 'BestPay', assigned_to: 'Carlos Eduardo', unread_count: 5, status: 'active', last_message_at: new Date(now - 1 * 60000).toISOString(), ai_auto_reply: false },
  { id: 'c4', contact_name: 'MktPro', assigned_to: 'Carlos Eduardo', unread_count: 0, status: 'active', last_message_at: new Date(now - 12 * 60000).toISOString(), ai_auto_reply: false },
  { id: 'c5', contact_name: 'StorePrime', assigned_to: 'Mariana Oliveira', unread_count: 1, status: 'active', last_message_at: new Date(now - 90 * 60000).toISOString(), ai_auto_reply: true },
  { id: 'c6', contact_name: 'Novo Lead 1', assigned_to: null, unread_count: 3, status: 'active', last_message_at: new Date(now - 6 * 60000).toISOString(), ai_auto_reply: false },
  { id: 'c7', contact_name: 'Novo Lead 2', assigned_to: null, unread_count: 1, status: 'active', last_message_at: new Date(now - 22 * 60000).toISOString(), ai_auto_reply: false },
]
const DEMO_FEED = [
  { id: 'f1', type: 'message', agent: 'Carlos Eduardo', contact: 'BestPay', text: 'Boa tarde! Como posso ajudar?', at: new Date(now - 1 * 60000).toISOString() },
  { id: 'f2', type: 'message', agent: 'Ana Paula Silva', contact: 'Loja TechInova', text: 'Proposta enviada com sucesso!', at: new Date(now - 3 * 60000).toISOString() },
  { id: 'f3', type: 'transfer', agent: 'Mariana Oliveira', contact: 'StorePrime', text: 'Transferiu para Carlos Eduardo', at: new Date(now - 8 * 60000).toISOString() },
  { id: 'f4', type: 'ai', agent: 'IA', contact: 'Bruno Martins', text: 'Resposta automática enviada', at: new Date(now - 15 * 60000).toISOString() },
  { id: 'f5', type: 'message', agent: 'Carlos Eduardo', contact: 'MktPro', text: 'Perfeito, vou verificar e retorno!', at: new Date(now - 20 * 60000).toISOString() },
]

const KpiCard = ({ Icon, label, value, color, sub }) => (
  <div style={{ flex: 1, minWidth: 140, background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: '14px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: (color || C.pur) + '22', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={17} color={color || C.pur} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        <div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>{label}</div>
      </div>
    </div>
    {sub && <div style={{ fontSize: 11, color: C.mut, marginTop: 8, borderTop: `1px solid ${C.bd}`, paddingTop: 8 }}>{sub}</div>}
  </div>
)

export const TeamMonitor = () => {
  const navigate = useNavigate()
  const { ownerUserId, isDemoMode, loading: authLoading } = useAuth()
  const [members, setMembers] = useState([])
  const [convs, setConvs] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const [expanded, setExpanded] = useState(new Set())

  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const load = useCallback(async () => {
    if (isDemoMode) { setMembers(DEMO_MEMBERS); setConvs(DEMO_CONVS); setMessages([]); setLoading(false); setUpdatedAt(new Date()); return }
    if (!ownerUserId) return
    const [{ data: m }, { data: c }, { data: msgs }] = await Promise.all([
      supabase.from('team_members').select('id,name,role,status').eq('user_id', ownerUserId).order('created_at', { ascending: true }),
      supabase.from('conversations').select('id,contact_name,contact_phone,assigned_to,unread_count,status,last_message_at,ai_auto_reply').eq('user_id', ownerUserId),
      supabase.from('messages').select('id,contact_phone,content,direction,sender_name,created_at').eq('user_id', ownerUserId).order('created_at', { ascending: false }).limit(20),
    ])
    setMembers(m ?? [])
    setConvs(c ?? [])
    setMessages(msgs ?? [])
    setUpdatedAt(new Date())
    setPulse(true); setTimeout(() => setPulse(false), 900)
    setLoading(false)
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

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])

  const openConvs = useMemo(() => convs.filter(c => isOpen(c.status)), [convs])

  const byAgent = useMemo(() => {
    const map = new Map()
    for (const c of openConvs) {
      const key = c.assigned_to || null
      if (!key) continue
      const cur = map.get(key) || { count: 0, waiting: 0, lastAt: null, convs: [] }
      cur.count += 1
      cur.waiting += Number(c.unread_count) || 0
      if (!cur.lastAt || new Date(c.last_message_at) > new Date(cur.lastAt)) cur.lastAt = c.last_message_at
      cur.convs.push(c)
      map.set(key, cur)
    }
    return map
  }, [openConvs])

  const unassigned = useMemo(
    () => openConvs.filter(c => !c.assigned_to).sort((a, b) => new Date(a.last_message_at || 0) - new Date(b.last_message_at || 0)),
    [openConvs],
  )

  const rows = useMemo(() => {
    const rank = { online: 0, ausente: 1, offline: 2 }
    return members
      .map(m => ({ ...m, ...(byAgent.get(m.name) || { count: 0, waiting: 0, lastAt: null, convs: [] }) }))
      .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || b.count - a.count)
  }, [members, byAgent])

  const kpis = useMemo(() => {
    const aiCount = openConvs.filter(c => c.ai_auto_reply).length
    return {
      online: members.filter(m => m.status === 'online').length,
      active: openConvs.filter(c => c.assigned_to).length,
      waiting: openConvs.reduce((a, c) => a + (Number(c.unread_count) || 0), 0),
      unassigned: unassigned.length,
      aiCount,
    }
  }, [members, openConvs, unassigned])

  const feed = useMemo(() => {
    if (isDemoMode) return DEMO_FEED
    const isOut = (d) => d === 'outbound' || d === 'sent'
    return messages.slice(0, 15).map(m => ({
      id: m.id,
      type: 'message',
      agent: isOut(m.direction) ? (m.sender_name || 'Atendente') : null,
      contact: m.contact_phone,
      text: (m.content || '').slice(0, 80),
      direction: m.direction,
      at: m.created_at,
    }))
  }, [isDemoMode, messages])

  const hhmmss = clock.toLocaleTimeString('pt-BR')

  return (
    <Layout title="Monitor do time" subtitle={`${members.length} atendentes · ${kpis.active} conversas ativas`}>
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.mut }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', boxShadow: pulse ? '0 0 0 6px #22C55E33' : 'none', transition: 'box-shadow .5s' }} />
          {isDemoMode ? 'demo' : 'ao vivo'} · atualizado {updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '.5px' }}>{hhmmss}</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: C.mut, padding: 60, fontSize: 14 }}>Carregando monitor…</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <KpiCard Icon={UserCheck} label="Online" value={kpis.online} color="#22C55E" sub={`${members.length} total na equipe`} />
            <KpiCard Icon={MessageSquare} label="Conversas ativas" value={kpis.active} color={C.pur} />
            <KpiCard Icon={Clock} label="Aguardando resposta" value={kpis.waiting} color={C.org} />
            <KpiCard Icon={Inbox} label="Não atribuídas" value={kpis.unassigned} color="#3B82F6" />
            <KpiCard Icon={Bot} label="IA ativa" value={kpis.aiCount} color="#8B5CF6" sub="conversas com auto-reply" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
            {/* Coluna esquerda: Atendentes */}
            <div>
              <p className="rf-section-title" style={{ marginBottom: 12 }}>Atendentes</p>
              {rows.length === 0 ? (
                <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 24, color: C.mut, fontSize: 13, textAlign: 'center' }}>
                  Nenhum membro na equipe. Adicione em <strong style={{ color: C.pur, cursor: 'pointer' }} onClick={() => navigate('/teams')}>Equipes</strong>.
                </div>
              ) : rows.map(m => {
                const s = ST[m.status] || ST.offline
                const isExpanded = expanded.has(m.id)
                const agentConvs = (m.convs || []).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
                return (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden', transition: 'box-shadow .2s', boxShadow: isExpanded ? '0 4px 20px -8px rgba(0,0,0,0.4)' : 'none' }}>
                    <div
                      onClick={() => m.count > 0 && toggleExpand(m.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: m.count > 0 ? 'pointer' : 'default' }}
                    >
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${C.pur}, #4F46E5)`, color: '#fff', fontWeight: 700, fontSize: 14, display: 'grid', placeItems: 'center' }}>{ini(m.name)}</div>
                        <span title={s.l} style={{ position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: '50%', background: s.c, border: `2.5px solid ${C.card}` }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                        <p style={{ margin: 0, fontSize: 11.5, color: s.c, fontWeight: 600 }}>
                          {s.l}<span style={{ color: C.mut, fontWeight: 400 }}> · {m.role || 'Atendente'}</span>
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{m.count}</div>
                          <div style={{ fontSize: 10, color: C.mut }}>ativas</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: m.waiting > 0 ? C.org : C.tx, fontVariantNumeric: 'tabular-nums' }}>{m.waiting}</div>
                          <div style={{ fontSize: 10, color: C.mut }}>aguard.</div>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 11, color: C.mut }}>
                          <Clock size={12} style={{ marginBottom: 2 }} />
                          <div>{rel(m.lastAt)}</div>
                        </div>
                        {m.count > 0 && (isExpanded ? <ChevronUp size={16} color={C.mut} /> : <ChevronDown size={16} color={C.mut} />)}
                      </div>
                    </div>

                    {isExpanded && agentConvs.length > 0 && (
                      <div style={{ borderTop: `1px solid ${C.bd}`, background: C.bg }}>
                        {agentConvs.map((c, i) => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 60px', borderTop: i ? `1px solid ${C.bd}` : 'none' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.pur + '22', color: C.pur, fontWeight: 700, fontSize: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ini(c.contact_name || '?')}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || c.contact_phone || 'Sem nome'}</p>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                                <span style={{ fontSize: 11, color: C.mut }}>há {rel(c.last_message_at)}</span>
                                {c.ai_auto_reply && <span style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', background: '#8B5CF622', borderRadius: 999, padding: '1px 7px' }}>IA</span>}
                              </div>
                            </div>
                            {c.unread_count > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.org, background: C.org + '22', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{c.unread_count}</span>}
                            <button onClick={(e) => { e.stopPropagation(); navigate('/chat') }} title="Espiar conversa" style={{ background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 6, color: C.mut, cursor: 'pointer', padding: '4px 6px', display: 'inline-flex' }}><Eye size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Coluna direita: Fila + Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Fila não atribuída */}
              <div>
                <p className="rf-section-title" style={{ marginBottom: 12 }}>
                  Fila não atribuída
                  {unassigned.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', background: 'rgba(59,130,246,0.15)', borderRadius: 999, padding: '2px 9px', marginLeft: 8 }}>{unassigned.length}</span>}
                </p>
                <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, overflow: 'hidden' }}>
                  {unassigned.length === 0 ? (
                    <div style={{ padding: 20, color: C.mut, fontSize: 13, textAlign: 'center' }}>Tudo atribuído</div>
                  ) : unassigned.slice(0, 8).map((c, i) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.bd}` : 'none' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontWeight: 700, fontSize: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ini(c.contact_name || '?')}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || c.contact_phone || 'Sem nome'}</p>
                        <p style={{ margin: 0, fontSize: 11, color: C.mut }}>aguardando {rel(c.last_message_at)}</p>
                      </div>
                      {c.unread_count > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: C.org, background: C.org + '22', borderRadius: 999, padding: '2px 7px', flexShrink: 0 }}>{c.unread_count}</span>}
                    </div>
                  ))}
                </div>
                {unassigned.length > 0 && (
                  <button onClick={() => navigate('/chat')} style={{ marginTop: 8, width: '100%', background: C.pur, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    Atender <ArrowRight size={14} />
                  </button>
                )}
              </div>

              {/* Feed de atividade ao vivo */}
              <div>
                <p className="rf-section-title" style={{ marginBottom: 12 }}>Atividade recente</p>
                <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, overflow: 'hidden', maxHeight: 380, overflowY: 'auto' }}>
                  {feed.length === 0 ? (
                    <div style={{ padding: 20, color: C.mut, fontSize: 13, textAlign: 'center' }}>Nenhuma atividade ainda</div>
                  ) : feed.map((f, i) => {
                    const isOut = f.direction === 'outbound' || f.direction === 'sent'
                    return (
                      <div key={f.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.bd}` : 'none', fontSize: 12 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.type === 'ai' ? '#8B5CF6' : f.type === 'transfer' ? '#3B82F6' : isOut ? '#22C55E' : C.org, flexShrink: 0, marginTop: 6 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: C.tx }}>{f.agent || 'Contato'}</span>
                            <span style={{ color: C.mut }}>→</span>
                            <span style={{ fontWeight: 600, color: C.pur }}>{f.contact}</span>
                            <span style={{ color: C.mut, marginLeft: 'auto', fontSize: 11, flexShrink: 0 }}>{rel(f.at)}</span>
                          </div>
                          <p style={{ margin: '2px 0 0', color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.text}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Responsivo: em telas pequenas empilha colunas */}
          <style>{`
            @media (max-width: 900px) {
              .rf-section-title { font-size: 14px !important; }
              div[style*="grid-template-columns: minmax(0, 2fr)"] {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </>
      )}
    </Layout>
  )
}

export default TeamMonitor
