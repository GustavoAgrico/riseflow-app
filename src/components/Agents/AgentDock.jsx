// Aba de agentes: faixa lateral direita, presente em todas as páginas do Layout.
// Mostra um mascote por agente; clicar abre o chat daquele agente com aprovações pendentes.
// Spec: docs/AGENTES_ABA_E_MASCOTES.md
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowUp, X, Check } from 'lucide-react'
import { RiserAvatar } from './RiserAvatar'
import { DEMO_AGENTS, DEMO_MESSAGES, DEMO_APPROVALS } from './agentsDemo'
import { agentsApi } from '@services/agents'
import socket from '@services/socket'
import { useAuth } from '@context/AuthContext'
import { useIsMobile } from '@hooks/useIsMobile'

const F = 'DM Sans, sans-serif'
const C = {
  bg: 'var(--bg)', panel: 'var(--card)', border: 'var(--border)', text: 'var(--ink-1)',
  muted: 'var(--ink-3)', dim: 'var(--ink-4)', accent: 'var(--accent, #FF6B35)',
}
const ORANGE = 'linear-gradient(135deg,#FF9A2E,#FF6A1F)'

const STATUS = {
  idle: { label: 'livre', dot: '#64748B' },
  thinking: { label: 'pensando', dot: '#53BDEB' },
  working: { label: 'trabalhando', dot: '#22C55E' },
  waiting_approval: { label: 'esperando aprovação', dot: '#FF6B35' },
  error: { label: 'com erro', dot: '#EF4444' },
}

const OPEN_KEY = 'rf.agentDock.open'
const SEL_KEY = 'rf.agentDock.agent'
const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } }
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem storage */ } }

// Fora de /api o servidor devolve o index.html; só uma lista de agentes de verdade tira do demo.
const isAgentList = (v) => Array.isArray(v) && v.every((a) => a && a.id && a.name)

export function AgentDock() {
  const { isDemoMode } = useAuth()
  const isMobile = useIsMobile()
  const [agents, setAgents] = useState([])
  const [demo, setDemo] = useState(isDemoMode)
  const [open, setOpen] = useState(() => readLS(OPEN_KEY, false))
  const [selected, setSelected] = useState(() => readLS(SEL_KEY, null))
  const [messages, setMessages] = useState([])
  const [approvals, setApprovals] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  // Carrega os agentes; sem API (antes da fase 1) ou em modo demo, usa os dados de exemplo.
  useEffect(() => {
    let alive = true
    if (isDemoMode) { setAgents(DEMO_AGENTS); setDemo(true); return }
    agentsApi.list()
      .then((list) => {
        if (!alive) return
        if (isAgentList(list) && list.length) { setAgents(list); setDemo(false) }
        else { setAgents(DEMO_AGENTS); setDemo(true) }
      })
      .catch(() => { if (alive) { setAgents(DEMO_AGENTS); setDemo(true) } })
    return () => { alive = false }
  }, [isDemoMode])

  const current = useMemo(
    () => agents.find((a) => a.id === selected) || agents[0] || null,
    [agents, selected],
  )

  // Mensagens e aprovações do agente aberto.
  useEffect(() => {
    if (!current) return
    setError('')
    if (demo) {
      setMessages(DEMO_MESSAGES[current.id] || [])
      setApprovals(DEMO_APPROVALS[current.id] || [])
      return
    }
    Promise.all([agentsApi.messages(current.id), agentsApi.approvals(current.id)])
      .then(([m, a]) => { setMessages(Array.isArray(m) ? m : []); setApprovals(Array.isArray(a) ? a : []) })
      .catch(() => setError('Não foi possível carregar a conversa. Tente de novo.'))
  }, [current?.id, demo])

  // Tempo real (contrato da seção 5): status, mensagens e pedidos de aprovação vindos do worker.
  useEffect(() => {
    if (demo) return
    const onStatus = ({ agent_id, status }) =>
      setAgents((list) => list.map((a) => (a.id === agent_id ? { ...a, status } : a)))
    const onMessage = ({ agent_id, message }) => {
      if (agent_id === current?.id && message) setMessages((m) => [...m, message])
    }
    const onApproval = ({ agent_id, approval }) => {
      if (agent_id === current?.id && approval) setApprovals((l) => [...l, approval])
    }
    socket.on('agent_status', onStatus)
    socket.on('agent_message', onMessage)
    socket.on('agent_approval_request', onApproval)
    return () => {
      socket.off('agent_status', onStatus)
      socket.off('agent_message', onMessage)
      socket.off('agent_approval_request', onApproval)
    }
  }, [demo, current?.id])

  useEffect(() => { listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight }) }, [messages.length, approvals.length])

  const pick = (id) => {
    if (open && current?.id === id) { setOpen(false); writeLS(OPEN_KEY, false); return }
    setSelected(id); writeLS(SEL_KEY, id); setOpen(true); writeLS(OPEN_KEY, true)
  }
  const close = () => { setOpen(false); writeLS(OPEN_KEY, false) }

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || !current || sending) return
    setText('')
    setMessages((m) => [...m, { id: `local-${Date.now()}`, author_kind: 'user', content: body }])
    if (demo) return
    setSending(true)
    try { await agentsApi.send(current.id, body) }
    catch { setError('A mensagem não foi enviada. Verifique a conexão e tente de novo.') }
    finally { setSending(false) }
  }

  const decide = async (ap, decision) => {
    setApprovals((l) => l.filter((x) => x.id !== ap.id))
    const note = decision === 'approve' ? 'Aprovado. O agente vai executar e registrar no histórico.' : 'Recusado. O agente recebeu o motivo.'
    setMessages((m) => [...m, { id: `sys-${ap.id}`, author_kind: 'system', content: note }])
    if (demo) return
    try { await agentsApi.decide(ap.id, decision) }
    catch {
      setApprovals((l) => [ap, ...l])
      setMessages((m) => m.filter((x) => x.id !== `sys-${ap.id}`))
      setError('A decisão não foi registrada. Tente de novo.')
    }
  }

  if (!agents.length) return null
  const st = STATUS[current?.status] || STATUS.idle

  const rail = (
    <div role="tablist" aria-label="Agentes" aria-orientation={isMobile ? 'horizontal' : 'vertical'}
      style={{
        display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: 10,
        padding: isMobile ? '8px 10px' : '14px 0', width: isMobile ? '100%' : 64, overflowX: isMobile ? 'auto' : 'visible',
        background: C.panel, borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
        borderTop: isMobile ? `1px solid ${C.border}` : 'none', boxSizing: 'border-box', flexShrink: 0,
      }}>
      {agents.map((a) => {
        const active = open && current?.id === a.id
        const s = STATUS[a.status] || STATUS.idle
        return (
          <button key={a.id} type="button" role="tab" aria-selected={active}
            aria-label={`${a.name}, ${a.role}, ${s.label}`} title={`${a.name} · ${s.label}`}
            onClick={() => pick(a.id)}
            style={{
              position: 'relative', width: 50, height: 50, flexShrink: 0, borderRadius: 14, padding: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'rgba(255,107,53,0.16)' : 'transparent',
              border: `1px solid ${active ? 'rgba(255,107,53,0.6)' : 'transparent'}`,
            }}>
            <RiserAvatar kind={a.kind} size={40} />
            <span aria-hidden="true" style={{
              position: 'absolute', right: 3, bottom: 3, width: 11, height: 11, borderRadius: '50%',
              background: s.dot, border: '2px solid var(--card)',
            }} />
          </button>
        )
      })}
      <Link to="/agentes/novo" aria-label="Criar agente" title="Criar agente" style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: `1px dashed ${C.border}`, color: C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Plus size={18} /></Link>
    </div>
  )

  const panel = open && current && (
    <section aria-label={`Conversa com ${current.name}`} style={{
      width: isMobile ? '100%' : 380, height: isMobile ? '70vh' : '100%', display: 'flex', flexDirection: 'column',
      background: C.panel, borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
      borderTop: isMobile ? `1px solid ${C.border}` : 'none', fontFamily: F, color: C.text, boxSizing: 'border-box',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <RiserAvatar kind={current.kind} size={48} label={current.name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{current.name}</div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {current.role} · <span style={{ color: st.dot }}>{st.label}</span>{demo && ' · exemplo'}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Fechar aba do agente" style={{
          width: 40, height: 40, borderRadius: 10, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer',
        }}><X size={18} /></button>
      </header>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m) => (
          <div key={m.id} style={{
            alignSelf: m.author_kind === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', whiteSpace: 'pre-line',
            lineHeight: 1.5, fontSize: 14, padding: m.author_kind === 'system' ? 0 : '10px 13px',
            borderRadius: m.author_kind === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
            background: m.author_kind === 'user' ? 'rgba(255,107,53,0.16)' : m.author_kind === 'system' ? 'transparent' : 'var(--bg)',
            border: m.author_kind === 'agent' ? `1px solid ${C.border}` : 'none',
            color: m.author_kind === 'system' ? '#22C55E' : C.text,
          }}>{m.content}</div>
        ))}

        {approvals.map((ap) => (
          <div key={ap.id} style={{
            border: '1px solid rgba(255,107,53,0.5)', background: 'rgba(255,107,53,0.08)', borderRadius: 14, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.accent }}>PEDE APROVAÇÃO</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{ap.summary}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => decide(ap, 'approve')} style={{
                minHeight: 44, padding: '0 16px', border: 'none', borderRadius: 10, background: ORANGE, color: '#1A0B02',
                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}><Check size={16} /> Aprovar</button>
              <button type="button" onClick={() => decide(ap, 'reject')} style={{
                minHeight: 44, padding: '0 16px', borderRadius: 10, background: 'transparent', color: C.text,
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}>Recusar</button>
            </div>
          </div>
        ))}
        {error && <div role="alert" style={{ color: '#EF4444', fontSize: 13 }}>{error}</div>}
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '12px 16px 16px', borderTop: `1px solid ${C.border}` }}>
        <label htmlFor="agent-dock-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Mensagem para {current.name}
        </label>
        <input id="agent-dock-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Peça algo a ${current.name}…`}
          style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: '0 14px', borderRadius: 12, border: `1px solid ${C.border}`,
            background: 'var(--bg)', color: C.text, fontFamily: F, fontSize: 14, outline: 'none',
          }} />
        <button type="submit" aria-label="Enviar mensagem" disabled={sending || !text.trim()} style={{
          width: 44, height: 44, borderRadius: 12, border: 'none', background: ORANGE, color: '#1A0B02',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: sending || !text.trim() ? 0.5 : 1,
        }}><ArrowUp size={18} /></button>
      </form>
    </section>
  )

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, display: 'flex', flexDirection: 'column' }}>
        {panel}
        {rail}
      </div>
    )
  }
  return (
    <aside aria-label="Agentes" style={{ display: 'flex', height: '100vh', position: 'sticky', top: 0, flexShrink: 0 }}>
      {panel}
      {rail}
    </aside>
  )
}

export default AgentDock
