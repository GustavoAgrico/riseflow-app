import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckSquare, Square, Clock, Phone, DollarSign,
  MessageCircle, Calendar, ArrowRight, Flame, Snowflake, Send,
} from 'lucide-react'
import { Layout } from '@components/Layout/Layout'
import { useAuth } from '@context/AuthContext'
import { useTodayData } from '@hooks/useTodayData'
import { useIsMobile } from '@hooks/useIsMobile'
import { supabase } from '@/lib/supabase'

const C = { bg: 'var(--bg)', card: 'var(--card)', bd: 'var(--border)', tx: 'var(--ink-1)', mut: 'var(--ink-3)', dim: 'var(--ink-4)', pur: '#7C3AED', org: '#FF6B35', ok: '#10B981', warn: '#EAB308', danger: '#EF4444' }

const ini = n => (n || '').split(' ').slice(0, 2).map(w => w?.[0] || '').join('').toUpperCase()
const rel = t => { if (!t) return ''; const m = Math.max(1, Math.round((Date.now() - new Date(t)) / 60000)); return m < 60 ? `${m}min` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d` }

const SectionTitle = ({ icon: Icon, title, count, color = C.org }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
    <div style={{ width: 32, height: 32, borderRadius: 10, background: color + '18', display: 'grid', placeItems: 'center' }}>
      <Icon size={16} color={color} />
    </div>
    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.tx, margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{title}</h3>
    {count > 0 && <span style={{ fontSize: 12, fontWeight: 700, color, background: color + '14', borderRadius: 20, padding: '2px 10px' }}>{count}</span>}
  </div>
)

const EmptyBlock = ({ text }) => (
  <p style={{ fontSize: 13, color: C.dim, margin: 0, padding: '20px 0', textAlign: 'center' }}>{text}</p>
)

const TaskRow = ({ task, onToggle }) => {
  const overdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10)
  const clientName = task.clients?.name || ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.bd}`, cursor: 'pointer' }} onClick={() => onToggle(task)}>
      <div style={{ flexShrink: 0, color: task.done ? C.ok : C.dim }}>
        {task.done ? <CheckSquare size={18} /> : <Square size={18} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.tx, margin: 0, textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.5 : 1 }}>{task.title}</p>
        {clientName && <p style={{ fontSize: 11, color: C.mut, margin: 0 }}>{clientName}</p>}
      </div>
      {task.due_date && (
        <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? C.danger : C.dim, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Clock size={12} />
          {task.due_date.slice(8, 10)}/{task.due_date.slice(5, 7)}
        </span>
      )}
    </div>
  )
}

const LeadCard = ({ lead, navigate, color }) => (
  <div
    onClick={() => navigate('/crm')}
    style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', minWidth: 180, flex: '0 0 auto', transition: 'border-color .15s' }}
    onMouseEnter={e => e.currentTarget.style.borderColor = color}
    onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: color + '18', color, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{ini(lead.name)}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.tx, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</p>
        {lead.company && <p style={{ fontSize: 11, color: C.mut, margin: 0 }}>{lead.company}</p>}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.mut }}>
      {lead.value > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><DollarSign size={11} /> R${Number(lead.value).toLocaleString('pt-BR')}</span>}
      {lead.updated_at && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {rel(lead.updated_at)}</span>}
    </div>
    {lead.tags?.length > 0 && (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
        {lead.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, background: color + '14', color, borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{t}</span>)}
      </div>
    )}
  </div>
)

const ConversationRow = ({ conv, navigate }) => (
  <div onClick={() => navigate('/chat')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.bd}`, cursor: 'pointer' }}>
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#3B82F618', color: '#3B82F6', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{ini(conv.contact_name)}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: C.tx, margin: 0 }}>{conv.contact_name || conv.contact_phone}</p>
      <p style={{ fontSize: 11, color: C.mut, margin: 0 }}>{rel(conv.last_message_at)} atrás</p>
    </div>
    <span style={{ background: C.danger + '22', color: C.danger, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{conv.unread_count}</span>
  </div>
)

const ScheduleRow = ({ sched }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.bd}` }}>
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.pur + '18', color: C.pur, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Send size={14} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: C.tx, margin: 0 }}>{sched.name || sched.phone}</p>
      <p style={{ fontSize: 11, color: C.mut, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sched.msg?.slice(0, 60)}</p>
    </div>
    <span style={{ fontSize: 12, fontWeight: 600, color: C.pur, flexShrink: 0 }}>{sched.send_time}</span>
  </div>
)

export const Today = () => {
  const { user, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { overdueTasks, todayTasks, coldLeads, hotLeads, todaySchedules, recentConversations, loading, refetch } = useTodayData()

  const toggleTask = async (task) => {
    if (isDemoMode) return
    await supabase.from('crm_tasks').update({ done: !task.done }).eq('id', task.id)
    refetch()
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }
  const firstName = user?.user_metadata?.name?.split(' ')[0] || user?.email?.split('@')[0] || ''

  const urgentCount = overdueTasks.length + recentConversations.length
  const totalPending = overdueTasks.length + todayTasks.length

  if (loading) {
    return (
      <Layout title="Hoje">
        <div className="space-y-6 animate-pulse">
          <div className="h-20 glass rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-48 glass rounded-2xl" />)}
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Hoje">
      {/* Header */}
      <div style={{
        background: 'var(--hero-bg)', border: '1px solid var(--hero-border)',
        borderRadius: 20, padding: isMobile ? '20px 18px' : '28px 32px', marginBottom: 24,
        boxShadow: 'var(--hero-shadow)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 90% 20%, ${C.org}12 0%, transparent 55%)` }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--hero-eyebrow)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: 'var(--hero-ink-1)', margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-.02em' }}>
          {greeting()}, {firstName}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--hero-ink-3)', marginTop: 6 }}>
          {urgentCount > 0
            ? `Você tem ${urgentCount} item${urgentCount > 1 ? 's' : ''} que precisa${urgentCount > 1 ? 'm' : ''} de atenção.`
            : totalPending > 0
              ? `${totalPending} tarefa${totalPending > 1 ? 's' : ''} pendente${totalPending > 1 ? 's' : ''} para hoje.`
              : 'Tudo em dia! Nenhuma pendência urgente.'
          }
        </p>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

        {/* Tarefas atrasadas */}
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 0' }}>
            <SectionTitle icon={AlertTriangle} title="Atrasadas" count={overdueTasks.length} color={C.danger} />
          </div>
          {overdueTasks.length === 0
            ? <div style={{ padding: '0 18px 18px' }}><EmptyBlock text="Nenhuma tarefa atrasada" /></div>
            : overdueTasks.slice(0, 6).map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} />)
          }
          {overdueTasks.length > 6 && (
            <div style={{ padding: '10px 18px', textAlign: 'center' }}>
              <button onClick={() => navigate('/crm')} style={{ background: 'none', border: 'none', color: C.org, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Ver todas ({overdueTasks.length}) <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Tarefas de hoje */}
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 0' }}>
            <SectionTitle icon={CheckSquare} title="Tarefas de hoje" count={todayTasks.length} color={C.ok} />
          </div>
          {todayTasks.length === 0
            ? <div style={{ padding: '0 18px 18px' }}><EmptyBlock text="Nenhuma tarefa para hoje" /></div>
            : todayTasks.slice(0, 6).map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} />)
          }
          {todayTasks.length > 6 && (
            <div style={{ padding: '10px 18px', textAlign: 'center' }}>
              <button onClick={() => navigate('/crm')} style={{ background: 'none', border: 'none', color: C.org, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Ver todas ({todayTasks.length}) <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Mensagens não lidas */}
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 0' }}>
            <SectionTitle icon={MessageCircle} title="Não lidas" count={recentConversations.length} color="#3B82F6" />
          </div>
          {recentConversations.length === 0
            ? <div style={{ padding: '0 18px 18px' }}><EmptyBlock text="Nenhuma conversa não lida" /></div>
            : recentConversations.map(c => <ConversationRow key={c.id} conv={c} navigate={navigate} />)
          }
        </div>

        {/* Agenda do dia */}
        <div style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 0' }}>
            <SectionTitle icon={Calendar} title="Agenda do dia" count={todaySchedules.length} color={C.pur} />
          </div>
          {todaySchedules.length === 0
            ? <div style={{ padding: '0 18px 18px' }}><EmptyBlock text="Nenhum envio agendado para hoje" /></div>
            : todaySchedules.map(s => <ScheduleRow key={s.id} sched={s} />)
          }
        </div>
      </div>

      {/* Leads section */}
      {(hotLeads.length > 0 || coldLeads.length > 0) && (
        <div style={{ marginTop: 24 }}>
          {hotLeads.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionTitle icon={Flame} title="Leads quentes" count={hotLeads.length} color={C.org} />
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                {hotLeads.map(l => <LeadCard key={l.id} lead={l} navigate={navigate} color={C.org} />)}
              </div>
            </div>
          )}
          {coldLeads.length > 0 && (
            <div>
              <SectionTitle icon={Snowflake} title="Leads esfriando" count={coldLeads.length} color="#38BDF8" />
              <p style={{ fontSize: 12, color: C.dim, marginTop: -10, marginBottom: 12 }}>Sem interação há mais de 3 dias</p>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                {coldLeads.map(l => <LeadCard key={l.id} lead={l} navigate={navigate} color="#38BDF8" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
