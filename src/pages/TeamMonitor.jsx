// Monitor do time — visão ÚNICA e AO VIVO do que a equipe está fazendo.
// Para o dono/Supervisor/Admin acompanhar, por atendente: presença (online),
// conversas ativas, fila aguardando resposta e última atividade — mais a fila
// de conversas NÃO atribuídas (backlog). Escopo por ownerUserId → o time inteiro
// (ver RLS ETAPA 2). Atualiza em tempo real (realtime do Supabase em conversations
// + presença via socket 'team_status') com refetch periódico de segurança.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, MessageSquare, Clock, Inbox, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'

const C = { bg: 'var(--bg)', panel: 'var(--panel)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', pur: '#7C3AED' }
const F = "'DM Sans', system-ui, sans-serif"

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
  if (m < 60) return `há ${m}min`
  if (m < 1440) return `há ${Math.round(m / 60)}h`
  return `há ${Math.round(m / 1440)}d`
}

// Amostra para o modo demo (somente leitura).
const DEMO_MEMBERS = [
  { id: 'd1', name: 'Ana Paula Silva', role: 'Supervisor', status: 'online' },
  { id: 'd2', name: 'Carlos Eduardo', role: 'Atendente', status: 'online' },
  { id: 'd3', name: 'Mariana Oliveira', role: 'Atendente', status: 'ausente' },
  { id: 'd4', name: 'João Pedro', role: 'Atendente', status: 'offline' },
]
const now = Date.now()
const DEMO_CONVS = [
  { id: 'c1', contact_name: 'Loja TechInova', assigned_to: 'Ana Paula Silva', unread_count: 2, status: 'active', last_message_at: new Date(now - 3 * 60000).toISOString() },
  { id: 'c2', contact_name: 'Bruno Martins', assigned_to: 'Ana Paula Silva', unread_count: 0, status: 'active', last_message_at: new Date(now - 40 * 60000).toISOString() },
  { id: 'c3', contact_name: 'BestPay', assigned_to: 'Carlos Eduardo', unread_count: 5, status: 'active', last_message_at: new Date(now - 1 * 60000).toISOString() },
  { id: 'c4', contact_name: 'MktPro', assigned_to: 'Carlos Eduardo', unread_count: 0, status: 'active', last_message_at: new Date(now - 12 * 60000).toISOString() },
  { id: 'c5', contact_name: 'StorePrime', assigned_to: 'Mariana Oliveira', unread_count: 1, status: 'active', last_message_at: new Date(now - 90 * 60000).toISOString() },
  { id: 'c6', contact_name: 'Novo Lead 1', assigned_to: null, unread_count: 3, status: 'active', last_message_at: new Date(now - 6 * 60000).toISOString() },
  { id: 'c7', contact_name: 'Novo Lead 2', assigned_to: null, unread_count: 1, status: 'active', last_message_at: new Date(now - 22 * 60000).toISOString() },
]

const KpiCard = ({ Icon, label, value, color }) => (
  <div style={{ flex: 1, minWidth: 150, background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: '14px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: (color || C.pur) + '22', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={17} color={color || C.pur} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  </div>
)

export const TeamMonitor = () => {
  const navigate = useNavigate()
  const { ownerUserId, isDemoMode, loading: authLoading } = useAuth()
  const [members, setMembers] = useState([])
  const [convs, setConvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [clock, setClock] = useState(() => new Date())

  const load = useCallback(async () => {
    if (isDemoMode) { setMembers(DEMO_MEMBERS); setConvs(DEMO_CONVS); setLoading(false); setUpdatedAt(new Date()); return }
    if (!ownerUserId) return
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('team_members').select('id,name,role,status').eq('user_id', ownerUserId).order('created_at', { ascending: true }),
      supabase.from('conversations').select('id,contact_name,contact_phone,assigned_to,unread_count,status,last_message_at').eq('user_id', ownerUserId),
    ])
    setMembers(m ?? [])
    setConvs(c ?? [])
    setUpdatedAt(new Date())
    setPulse(true); setTimeout(() => setPulse(false), 900)
    setLoading(false)
  }, [ownerUserId, isDemoMode])

  // Carga inicial + realtime (conversations) + refetch periódico (rede de segurança).
  useEffect(() => {
    if (authLoading) return
    load()
    if (isDemoMode || !ownerUserId) return
    let deb
    const bump = () => { clearTimeout(deb); deb = setTimeout(load, 600) }
    const ch = supabase.channel('team_monitor_' + ownerUserId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${ownerUserId}` }, () => bump())
      .subscribe()
    const iv = setInterval(load, 20000)
    return () => { clearTimeout(deb); clearInterval(iv); try { supabase.removeChannel(ch) } catch {} }
  }, [authLoading, ownerUserId, isDemoMode, load])

  // Presença ao vivo dos membros (mesmo evento que a tela Equipe usa).
  useEffect(() => {
    if (isDemoMode) return
    const onStatus = ({ memberId, status }) => setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, status } : m)))
    socket.on('team_status', onStatus)
    return () => socket.off('team_status', onStatus)
  }, [isDemoMode])

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])

  // Agrega conversas por atendente (só as abertas contam como "ativas").
  const openConvs = useMemo(() => convs.filter(c => isOpen(c.status)), [convs])
  const byAgent = useMemo(() => {
    const map = new Map()
    for (const c of openConvs) {
      const key = c.assigned_to || null
      if (!key) continue
      const cur = map.get(key) || { count: 0, waiting: 0, lastAt: null }
      cur.count += 1
      cur.waiting += Number(c.unread_count) || 0
      if (!cur.lastAt || new Date(c.last_message_at) > new Date(cur.lastAt)) cur.lastAt = c.last_message_at
      map.set(key, cur)
    }
    return map
  }, [openConvs])

  const unassigned = useMemo(
    () => openConvs.filter(c => !c.assigned_to).sort((a, b) => new Date(a.last_message_at || 0) - new Date(b.last_message_at || 0)),
    [openConvs],
  )

  // Ordena: online primeiro, depois quem tem mais conversas ativas.
  const rows = useMemo(() => {
    const rank = { online: 0, ausente: 1, offline: 2 }
    return members
      .map(m => ({ ...m, ...(byAgent.get(m.name) || { count: 0, waiting: 0, lastAt: null }) }))
      .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || b.count - a.count)
  }, [members, byAgent])

  const kpis = useMemo(() => ({
    online: members.filter(m => m.status === 'online').length,
    active: openConvs.filter(c => c.assigned_to).length,
    waiting: openConvs.reduce((a, c) => a + (Number(c.unread_count) || 0), 0),
    unassigned: unassigned.length,
  }), [members, openConvs, unassigned])

  const hhmmss = clock.toLocaleTimeString('pt-BR')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.tx, fontFamily: F, display: 'flex', flexDirection: 'column' }}>
      {/* Cabeçalho */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderBottom: `1px solid ${C.bd}`, background: C.panel, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard')} title="Voltar" style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, cursor: 'pointer', padding: '7px 10px', display: 'inline-flex' }}><ArrowLeft size={18} /></button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.3px' }}>Monitor do time</h1>
          <p style={{ margin: 0, fontSize: 12, color: C.mut }}>{members.length} atendentes · {kpis.active} conversas ativas</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.mut }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', boxShadow: pulse ? '0 0 0 6px #22C55E33' : '0 0 0 0 #22C55E00', transition: 'box-shadow .5s' }} />
            {isDemoMode ? 'demo' : 'ao vivo'} · atualizado {updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '.5px' }}>{hhmmss}</span>
        </div>
      </header>

      {loading ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: C.mut }}>Carregando monitor…</div>
      ) : (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <KpiCard Icon={UserCheck} label="Atendentes online" value={kpis.online} color="#22C55E" />
            <KpiCard Icon={MessageSquare} label="Conversas ativas" value={kpis.active} color={C.pur} />
            <KpiCard Icon={Clock} label="Aguardando resposta" value={kpis.waiting} color="#FF6B35" />
            <KpiCard Icon={Inbox} label="Não atribuídas" value={kpis.unassigned} color="#3B82F6" />
          </div>

          <div className="rf-monitor-grid" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
            {/* Atendentes */}
            <section>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>Atendentes</h2>
              {rows.length === 0 ? (
                <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 24, color: C.mut, fontSize: 13, textAlign: 'center' }}>
                  Nenhum membro na equipe ainda. Adicione membros em <strong style={{ color: C.pur }}>Equipes</strong>.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {rows.map(m => {
                    const s = ST[m.status] || ST.offline
                    return (
                      <div key={m.id} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${C.pur}, #4F46E5)`, color: '#fff', fontWeight: 700, fontSize: 14, display: 'grid', placeItems: 'center' }}>{ini(m.name)}</div>
                            <span title={s.l} style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%', background: s.c, border: `2px solid ${C.card}` }} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                            <p style={{ margin: 0, fontSize: 11.5, color: s.c, fontWeight: 600 }}>{s.l}<span style={{ color: C.mut, fontWeight: 400 }}> · {m.role || 'Atendente'}</span></p>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ background: C.bg, borderRadius: 9, padding: '8px 10px' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{m.count}</div>
                            <div style={{ fontSize: 10.5, color: C.mut }}>ativas</div>
                          </div>
                          <div style={{ background: C.bg, borderRadius: 9, padding: '8px 10px' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: m.waiting > 0 ? '#FF6B35' : C.tx, fontVariantNumeric: 'tabular-nums' }}>{m.waiting}</div>
                            <div style={{ fontSize: 10.5, color: C.mut }}>aguardando</div>
                          </div>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.mut, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={12} /> última atividade {rel(m.lastAt)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Fila não atribuída */}
            <section>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                Fila não atribuída
                {unassigned.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', background: 'rgba(59,130,246,0.15)', borderRadius: 999, padding: '2px 9px' }}>{unassigned.length}</span>}
              </h2>
              <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, overflow: 'hidden' }}>
                {unassigned.length === 0 ? (
                  <div style={{ padding: 24, color: C.mut, fontSize: 13, textAlign: 'center' }}>Tudo atribuído. 🎉</div>
                ) : unassigned.slice(0, 12).map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${C.bd}` : 'none' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontWeight: 700, fontSize: 11, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ini(c.contact_name || '?')}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || c.contact_phone || 'Sem nome'}</p>
                      <p style={{ margin: 0, fontSize: 11, color: C.mut }}>aguardando {rel(c.last_message_at)}</p>
                    </div>
                    {c.unread_count > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#FF6B35', background: 'rgba(255,107,53,0.15)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{c.unread_count}</span>}
                  </div>
                ))}
              </div>
              {unassigned.length > 0 && (
                <button onClick={() => navigate('/chat')} style={{ marginTop: 10, width: '100%', background: C.pur, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F, padding: '10px', cursor: 'pointer' }}>
                  Abrir Chat para atender
                </button>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamMonitor
