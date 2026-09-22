import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useApp } from '@context/AppContext'
import { Layout } from '@components/Layout/Layout'
import { ChevronLeft, ChevronRight, Calendar, Clock, CheckSquare, FileText, MessageSquare, Download, Link2, Bell, BellOff, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { SkeletonCards } from '@components/ui/Skeleton'
import { downloadICS } from '@utils/icalUtils'
import { usePushNotifications } from '@hooks/usePushNotifications'
import api from '@services/api'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-4)', pur: '#7C3AED', org: '#FF6B35' }

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const pad = n => String(n).padStart(2, '0')
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isToday = d => dkey(d) === dkey(new Date())

const TYPE_COLORS = {
  schedule: { bg: '#3B82F6', label: 'Agendamento', icon: MessageSquare },
  task: { bg: '#22C55E', label: 'Tarefa', icon: CheckSquare },
  proposal: { bg: '#7C3AED', label: 'Proposta', icon: FileText },
}

const btnStyle = { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: `1px solid var(--border)`, background: 'transparent', color: 'var(--ink-1)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }

const DEMO_EVENTS = (() => {
  const today = new Date()
  const d = (off) => { const x = new Date(today); x.setDate(x.getDate() + off); return dkey(x) }
  return [
    { id: 1, type: 'schedule', title: 'Mensagem para Ana', date: d(0), time: '09:00' },
    { id: 2, type: 'task', title: 'Follow-up Carlos', date: d(0), time: '14:00' },
    { id: 3, type: 'proposal', title: 'Proposta website', date: d(1), time: null },
    { id: 4, type: 'schedule', title: 'Lembrete pagamento', date: d(3), time: '10:30' },
    { id: 5, type: 'task', title: 'Ligar para Marina', date: d(-1), time: '16:00' },
    { id: 6, type: 'schedule', title: 'Broadcast WhatsApp', date: d(5), time: '08:00' },
    { id: 7, type: 'proposal', title: 'Orçamento social media', date: d(-3), time: null },
    { id: 8, type: 'task', title: 'Reunião equipe', date: d(7), time: '15:00' },
  ]
})()

export const Agenda = () => {
  const { ownerUserId, isDemoMode } = useAuth()
  const { addToast } = useApp()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState(null)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [calToken, setCalToken] = useState(null)
  const [copied, setCopied] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)
  const push = usePushNotifications()

  useEffect(() => {
    if (isDemoMode) { setEvents(DEMO_EVENTS); setLoading(false); return }
    if (!ownerUserId) return
    ;(async () => {
      setLoading(true)
      const [{ data: scheds }, { data: tasks }, { data: props }] = await Promise.all([
        supabase.from('schedules').select('id, name, send_date, send_time, status').eq('user_id', ownerUserId).neq('status', 'cancelado'),
        supabase.from('crm_tasks').select('id, title, due_date, done').eq('user_id', ownerUserId).eq('done', false).not('due_date', 'is', null),
        supabase.from('proposals').select('id, title, valid_until, status').eq('user_id', ownerUserId),
      ])
      const all = []
      ;(scheds ?? []).forEach(s => all.push({ id: 's' + s.id, type: 'schedule', title: s.name || 'Agendamento', date: s.send_date, time: s.send_time }))
      ;(tasks ?? []).forEach(t => all.push({ id: 't' + t.id, type: 'task', title: t.title || 'Tarefa', date: t.due_date?.split('T')[0], time: t.due_date?.split('T')[1]?.substring(0, 5) || null }))
      ;(props ?? []).forEach(p => p.valid_until && all.push({ id: 'p' + p.id, type: 'proposal', title: p.title || 'Proposta', date: p.valid_until, time: null }))
      setEvents(all)
      setLoading(false)
    })()
  }, [ownerUserId, isDemoMode])

  const fetchCalToken = useCallback(async () => {
    if (isDemoMode) return
    setTokenLoading(true)
    try {
      const { data } = await api.post('/api/calendar/token')
      setCalToken(data.token)
    } catch { /* ignore */ }
    setTokenLoading(false)
  }, [isDemoMode])

  const regenerateToken = useCallback(async () => {
    if (isDemoMode) return
    setTokenLoading(true)
    try {
      const { data } = await api.post('/api/calendar/token/regenerate')
      setCalToken(data.token)
      addToast?.({ title: 'URL renovada', type: 'system' })
    } catch { /* ignore */ }
    setTokenLoading(false)
  }, [isDemoMode, addToast])

  const calFeedUrl = calToken
    ? `${window.location.origin}/api/calendar/feed/${calToken}.ics`
    : null

  const copyFeedUrl = useCallback(() => {
    if (!calFeedUrl) return
    navigator.clipboard.writeText(calFeedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [calFeedUrl])

  const handleTogglePush = useCallback(async () => {
    if (push.subscribed) {
      await push.unsubscribe()
      addToast?.({ title: 'Notificações desativadas', type: 'system' })
    } else {
      const ok = await push.subscribe()
      if (ok) addToast?.({ title: 'Notificações ativadas!', message: 'Você receberá lembretes 15min antes dos eventos.', type: 'system' })
    }
  }, [push, addToast])

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const goToday = () => { const n = new Date(); setMonth(n.getMonth()); setYear(n.getFullYear()); setSelectedDay(dkey(n)) }

  const grid = useMemo(() => {
    const first = new Date(year, month, 1)
    const startDow = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    return cells
  }, [month, year])

  const byDate = useMemo(() => {
    const map = {}
    events.forEach(e => { if (!e.date) return; (map[e.date] ??= []).push(e) })
    return map
  }, [events])

  const dayEvents = selectedDay ? (byDate[selectedDay] ?? []) : []

  return (
    <Layout title="Agenda" subtitle="Calendário unificado">
      {/* Toolbar de sincronização */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => downloadICS(events)} style={btnStyle}>
            <Download size={13} /> Exportar .ics
          </button>
          <button onClick={() => { setShowSyncPanel(p => !p); if (!calToken && !isDemoMode) fetchCalToken() }} style={{ ...btnStyle, background: showSyncPanel ? C.org + '18' : 'transparent', borderColor: showSyncPanel ? C.org : C.bd }}>
            <Link2 size={13} color={showSyncPanel ? C.org : undefined} /> Sincronizar
          </button>
        </div>
        <button onClick={goToday} style={{ background: C.org, border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Hoje</button>
      </div>

      {/* Painel de sincronização expandido */}
      {showSyncPanel && (
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <p className="rf-section-title" style={{ marginBottom: 16 }}>Sincronização e Notificações</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* iCal subscription */}
            <div style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: '#3B82F618', display: 'grid', placeItems: 'center' }}>
                  <Calendar size={16} color="#3B82F6" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Assinar calendário</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.mut }}>Google Calendar, Apple, Outlook</p>
                </div>
              </div>
              {isDemoMode ? (
                <p style={{ fontSize: 12, color: C.mut }}>Disponível com conta ativa. Faça login para gerar o link.</p>
              ) : calToken ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, background: 'var(--surface-1)', border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '7px 10px', fontSize: 11, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {calFeedUrl}
                    </div>
                    <button onClick={copyFeedUrl} style={{ ...btnStyle, padding: '6px 10px', minWidth: 0 }}>
                      {copied ? <Check size={13} color="#22C55E" /> : <Copy size={13} />}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calFeedUrl)}`} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle, textDecoration: 'none', fontSize: 11 }}>
                      <ExternalLink size={11} /> Google Calendar
                    </a>
                    <button onClick={regenerateToken} disabled={tokenLoading} style={{ ...btnStyle, fontSize: 11, opacity: tokenLoading ? 0.5 : 1 }}>
                      <RefreshCw size={11} /> Renovar URL
                    </button>
                  </div>
                  <p style={{ fontSize: 10, color: C.mut, margin: 0 }}>Cole essa URL no seu app de calendário para receber eventos automaticamente.</p>
                </div>
              ) : (
                <button onClick={fetchCalToken} disabled={tokenLoading} style={{ ...btnStyle, opacity: tokenLoading ? 0.5 : 1 }}>
                  {tokenLoading ? 'Gerando...' : 'Gerar link de assinatura'}
                </button>
              )}
            </div>

            {/* Push notifications */}
            <div style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: C.org + '18', display: 'grid', placeItems: 'center' }}>
                  <Bell size={16} color={C.org} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Notificações push</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.mut }}>Lembretes no navegador e celular</p>
                </div>
              </div>
              {!push.supported ? (
                <p style={{ fontSize: 12, color: C.mut }}>Navegador não suporta notificações push{!import.meta.env.VITE_VAPID_PUBLIC_KEY && ' (VAPID não configurado)'}.</p>
              ) : push.permission === 'denied' ? (
                <p style={{ fontSize: 12, color: '#EF4444' }}>Notificações bloqueadas. Altere nas configurações do navegador.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={handleTogglePush} disabled={push.loading} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: push.subscribed ? 'var(--surface-1)' : `linear-gradient(135deg, ${C.org}, ${C.pur})`,
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: push.loading ? 0.5 : 1,
                  }}>
                    {push.subscribed ? <><BellOff size={13} /> Desativar notificações</> : <><Bell size={13} /> Ativar notificações</>}
                  </button>
                  {push.subscribed && (
                    <p style={{ fontSize: 11, color: '#22C55E', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Ativo — você receberá lembretes 15min antes dos eventos
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Download .ics */}
            <div style={{ background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: '#22C55E18', display: 'grid', placeItems: 'center' }}>
                  <Download size={16} color="#22C55E" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Exportar arquivo .ics</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.mut }}>Importar manualmente no calendário</p>
                </div>
              </div>
              <button onClick={() => downloadICS(events)} style={btnStyle}>
                <Download size={13} /> Baixar {events.length} evento{events.length !== 1 && 's'}
              </button>
              <p style={{ fontSize: 10, color: C.mut, margin: '8px 0 0' }}>Inclui agendamentos, tarefas e propostas.</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Calendário */}
          <div style={{ flex: 2, minWidth: 340 }}>
            <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20 }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 8 }}>
                <button onClick={prev} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: C.tx, display: 'flex' }}><ChevronLeft size={16} /></button>
                <span style={{ fontSize: 16, fontWeight: 800, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
                <button onClick={next} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: C.tx, display: 'flex' }}><ChevronRight size={16} /></button>
              </div>

              {/* Weekday headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: C.mut, fontWeight: 700, padding: 6 }}>{w}</div>)}
              </div>

              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {grid.map((day, i) => {
                  if (!day) return <div key={`e${i}`} style={{ minHeight: 72 }} />
                  const key = dkey(day)
                  const evts = byDate[key] ?? []
                  const today = isToday(day)
                  const selected = selectedDay === key
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      style={{
                        minHeight: 72, borderRadius: 8, padding: 6, cursor: 'pointer',
                        border: selected ? `2px solid ${C.org}` : `1px solid ${C.bd}`,
                        background: today ? C.org + '12' : selected ? C.card : 'transparent',
                        transition: 'all .15s',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: today ? 800 : 500, color: today ? C.org : C.tx, marginBottom: 4 }}>{day.getDate()}</div>
                      {evts.slice(0, 3).map(e => {
                        const tc = TYPE_COLORS[e.type] || TYPE_COLORS.task
                        return (
                          <div key={e.id} style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: tc.bg, borderRadius: 4, padding: '1px 5px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.title}
                          </div>
                        )
                      })}
                      {evts.length > 3 && <div style={{ fontSize: 9, color: C.mut, fontWeight: 600 }}>+{evts.length - 3}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Painel lateral — eventos do dia */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 20, position: 'sticky', top: 80 }}>
              <p className="rf-section-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={16} color={C.org} />
                {selectedDay ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Selecione um dia'}
              </p>

              {!selectedDay ? (
                <p style={{ fontSize: 13, color: C.mut }}>Clique em um dia do calendário para ver os eventos.</p>
              ) : dayEvents.length === 0 ? (
                <p style={{ fontSize: 13, color: C.mut }}>Nenhum evento neste dia.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayEvents.sort((a, b) => (a.time ?? '23:59').localeCompare(b.time ?? '23:59')).map(e => {
                    const tc = TYPE_COLORS[e.type] || TYPE_COLORS.task
                    const Icon = tc.icon
                    return (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, background: C.bg, border: `1px solid ${C.bd}` }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: tc.bg + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={14} color={tc.bg} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: tc.bg, textTransform: 'uppercase' }}>{tc.label}</span>
                            {e.time && <span style={{ fontSize: 11, color: C.mut, display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {e.time}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
