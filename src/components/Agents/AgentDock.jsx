// Aba de agentes: faixa lateral direita, presente em todas as páginas do Layout.
// Mostra um mascote por agente; clicar abre o chat daquele agente com aprovações pendentes.
// Spec: docs/AGENTES_ABA_E_MASCOTES.md
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, ArrowUp, X, Check, Lightbulb, MoreHorizontal } from 'lucide-react'
import { RiserAvatar } from './RiserAvatar'
import { CoachBubble, CoachPanel, AgentTips, coachPrefs, SuggestionList, PromptChips, suggestionPrefs } from './Coach'
import { useCoachData } from '@hooks/useCoachData'
import { buildTips, pickTip, dayHeadline } from '@lib/coach'
import { agentsForPage, orderAgents, helloTip } from '@lib/agentPages'
import { useApp } from '@context/AppContext'
import { DEMO_AGENTS, DEMO_MESSAGES, DEMO_APPROVALS, DEMO_SUGGESTIONS, demoReply } from './agentsDemo'
import { agentsApi, promptsFor } from '@services/agents'
import socket, { authenticateSocket } from '@services/socket'
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

// floating: versão flutuante para telas sem o Layout comum (Chat, CRM, IA Central…).
export function AgentDock({ floating = false } = {}) {
  const { isDemoMode } = useAuth()
  const { setDockMounted } = useApp()
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
  const inputRef = useRef(null)

  // ── Dicas dos agentes (src/lib/coach.js) ──
  const { pathname } = useLocation()
  const snapshot = useCoachData()
  const [mode, setMode] = useState('chat') // painel aberto: 'chat' (conversa) | 'coach' (Seu dia)
  const [bubble, setBubble] = useState(null) // dica mostrada no balão
  const [paused, setPaused] = useState(() => coachPrefs.paused())
  const btnRefs = useRef({})
  const lastBubbleAt = useRef(0)
  const tips = useMemo(() => (snapshot ? buildTips(snapshot, { path: pathname }) : []), [snapshot, pathname])
  const agentFor = useCallback((kind) => agents.find((a) => a.kind === kind) || null, [agents])
  const urgent = tips.filter((t) => t.kind === 'acao' && t.priority >= 50)
  // Ações sugeridas pelos agentes (só rodam com "Aprovar e fazer").
  const [suggestions, setSuggestions] = useState([])
  const [sugState, setSugState] = useState({}) // id → 'running' | { ok, text }
  const pagePrompts = useMemo(() => promptsFor(pathname), [pathname])
  const actionCount = (kind) => urgent.filter((t) => t.agent === kind).length
  // Agentes da função desta tela: sobem no trilho com destaque e se apresentam.
  const pageKinds = useMemo(() => agentsForPage(pathname), [pathname])
  const [showAll, setShowAll] = useState(false)

  // O trilho fixo (Layout) avisa que existe; sem ele, o App mostra a versão flutuante.
  useEffect(() => {
    if (floating) return undefined
    setDockMounted((c) => c + 1)
    return () => setDockMounted((c) => c - 1)
  }, [floating, setDockMounted])

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
    () => agents.find((a) => a.id === selected) || agents.find((a) => a.kind === agentsForPage(pathname)[0]) || agents[0] || null,
    [agents, selected, pathname],
  )
  const currentAgent = current

  // Mensagens e aprovações do agente aberto.
  useEffect(() => {
    if (!current) return
    setError('')
    if (demo) {
      setMessages(DEMO_MESSAGES[current.id] || [])
      setApprovals(DEMO_APPROVALS[current.id] || [])
      return
    }
    // Aprovações chegam na fase 2: enquanto a rota não existir, a lista fica vazia.
    Promise.all([agentsApi.messages(current.id), agentsApi.approvals(current.id).catch(() => [])])
      .then(([m, a]) => { setMessages(Array.isArray(m) ? m : []); setApprovals(Array.isArray(a) ? a : []) })
      .catch(() => setError('Não foi possível carregar a conversa. Tente de novo.'))
  }, [current?.id, demo])

  // Os agentes acompanham a aba aberta: o servidor guarda a tela atual para o prompt.
  useEffect(() => {
    if (demo || !agents.length) return
    const t = setTimeout(() => { agentsApi.setContext(pathname).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [pathname, demo, agents.length])

  const loadSuggestions = useCallback(() => {
    const hidden = suggestionPrefs.dismissed()
    const onPage = (x) => (x.pages || []).some((pg) => pathname === pg || pathname.startsWith(pg + '/'))
    if (demo) {
      setSuggestions(DEMO_SUGGESTIONS.filter((x) => !hidden.includes(x.id)).map((x) => ({ ...x, on_page: onPage(x) })).sort((a, b) => Number(b.on_page) - Number(a.on_page)))
      return
    }
    agentsApi.suggestions(pathname).then((list) => setSuggestions(Array.isArray(list) ? list.filter((x) => !hidden.includes(x.id)) : [])).catch(() => {})
  }, [demo, pathname])
  useEffect(() => {
    if (!agents.length) return
    const t = setTimeout(loadSuggestions, 900)
    return () => clearTimeout(t)
  }, [agents.length, loadSuggestions])

  // Com agentes reais, garante que este navegador está na sala da conta no servidor.
  useEffect(() => { if (!demo) authenticateSocket() }, [demo])

  // Tempo real (contrato da seção 5): status, mensagens e pedidos de aprovação vindos do worker.
  useEffect(() => {
    if (demo) return
    const onStatus = ({ agent_id, status }) =>
      setAgents((list) => list.map((a) => (a.id === agent_id ? { ...a, status } : a)))
    const onMessage = ({ agent_id, message }) => {
      if (agent_id === current?.id && message) setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]))
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
    setBubble(null)
    if (open && mode === 'chat' && current?.id === id) { setOpen(false); writeLS(OPEN_KEY, false); return }
    setMode('chat'); setSelected(id); writeLS(SEL_KEY, id); setOpen(true); writeLS(OPEN_KEY, true)
  }
  const openCoach = () => {
    setBubble(null)
    if (open && mode === 'coach') { setOpen(false); return }
    setMode('coach'); setOpen(true)
  }
  // "Perguntar a …" no Seu dia: abre a conversa com o agente e deixa o pedido pronto para enviar.
  const askAbout = (agent, tip) => {
    setMode('chat'); setSelected(agent.id); writeLS(SEL_KEY, agent.id); setOpen(true)
    setText(`Me ajude com isto: ${tip.title}. ${tip.text}`)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Ao trocar de tela, um mascote fala uma dica (no máximo a cada 30 s; nunca com o painel aberto).
  useEffect(() => {
    if (paused || open || !agents.length || (!tips.length && !pageKinds.length)) return
    const t = setTimeout(() => {
      if (Date.now() - lastBubbleAt.current < 30000) return
      const seen = coachPrefs.seen()
      // 1) algo urgente do agente desta tela; 2) ele se apresenta (1x por dia por tela); 3) dica geral.
      const urgentMine = tips.find((x) => !seen.includes(x.id) && x.priority >= 80 && pageKinds.includes(x.agent))
      const owner = pageKinds.map((k) => agentFor(k)).find(Boolean)
      const hello = owner ? helloTip(owner, pathname, pagePrompts) : null
      const tip = urgentMine || (hello && !seen.includes(hello.id) ? hello : null) || pickTip(tips, { seen, path: pathname })
      if (!tip) return
      coachPrefs.markSeen(tip.id)
      lastBubbleAt.current = Date.now()
      setBubble(tip)
    }, 2500)
    return () => clearTimeout(t)
  }, [pathname, tips.length, paused, open, agents.length, pageKinds.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const approveSuggestion = async (sg) => {
    setSugState((m) => ({ ...m, [sg.id]: 'running' }))
    const finish = (ok, text) => {
      setSugState((m) => ({ ...m, [sg.id]: { ok, text } }))
      if (ok) setTimeout(() => { setSuggestions((l) => l.filter((x) => x.id !== sg.id)); loadSuggestions() }, 2600)
    }
    if (demo) { setTimeout(() => finish(true, 'Feito (modo exemplo). Na sua conta, a ação roda de verdade e fica registrada na conversa do agente.'), 700); return }
    try {
      const r = await agentsApi.runSuggestion(sg.id)
      finish(r.ok, r.ok ? `Feito: ${r.done} de ${r.total}.${r.error ? ` Um item falhou: ${r.error}` : ''}` : `Não deu certo: ${r.error || 'tente de novo'}`)
    } catch (e) { finish(false, e?.response?.data?.error || 'Não foi possível executar agora.') }
  }
  const askSuggestion = (sg) => {
    const a = agentFor(sg.agent_kind) || agents[0]
    if (!a) return
    setMode('chat'); setSelected(a.id); writeLS(SEL_KEY, a.id); setOpen(true)
    setText(sg.prompt || sg.title)
    setTimeout(() => inputRef.current?.focus(), 50)
  }
  const dismissSuggestion = (sg) => { suggestionPrefs.dismiss(sg.id); setSuggestions((l) => l.filter((x) => x.id !== sg.id)) }

  const nextTip = () => {
    const tip = pickTip(tips.filter((t) => t.id !== bubble?.id), { seen: coachPrefs.seen(), path: pathname })
    if (tip) { coachPrefs.markSeen(tip.id); setBubble(tip) } else setBubble(null)
  }
  const pauseTips = () => { coachPrefs.pause(); setPaused(true); setBubble(null) }
  // Atalho do balão: abre a conversa com o agente que falou e já envia a pergunta.
  const promptFromBubble = (tip, prompt) => {
    const a = agentFor(tip.agent) || current
    if (!a) return
    setBubble(null); setMode('chat'); setSelected(a.id); writeLS(SEL_KEY, a.id); setOpen(true); writeLS(OPEN_KEY, true)
    if (a.id !== current?.id) setMessages([])
    send(null, prompt, a)
  }
  const togglePause = () => { if (paused) { coachPrefs.resume(); setPaused(false) } else pauseTips() }
  const close = () => { setOpen(false); writeLS(OPEN_KEY, false) }

  // Esc fecha a conversa (o painel fica por cima da página).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); writeLS(OPEN_KEY, false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = async (e, preset, target) => {
    e?.preventDefault?.()
    const body = String(preset ?? text).trim()
    const current = target || currentAgent
    if (!body || !current || sending) return
    setText('')
    setMessages((m) => [...m, { id: `local-${Date.now()}`, author_kind: 'user', content: body }])
    if (demo) {
      // Sem backend de agentes: responde com honestidade e aponta a tela que faz o pedido.
      const agent = current
      setTimeout(() => setMessages((m) => [...m, demoReply(agent, body)]), 500)
      return
    }
    setSending(true)
    const agentId = current.id
    const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      await agentsApi.send(agentId, body, key, { path: pathname })
      waitForReply(agentId)
    } catch { setError('A mensagem não foi enviada. Verifique a conexão e tente de novo.') }
    finally { setSending(false) }
  }

  // Reserva do socket: se a resposta não chegar em tempo real, relê a conversa por até 2 min.
  const waitForReply = (agentId) => {
    let tries = 0
    const poll = setInterval(async () => {
      tries += 1
      try {
        const list = await agentsApi.messages(agentId)
        const last = Array.isArray(list) ? list[list.length - 1] : null
        if (last && last.author_kind !== 'user') {
          clearInterval(poll)
          setMessages((m) => (m.some((x) => x.id === last.id) ? m : list))
        }
      } catch { /* tenta de novo */ }
      if (tries >= 40) clearInterval(poll)
    }, 3000)
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

  const ordered = orderAgents(agents, pathname)
  const mine = ordered.filter((a) => pageKinds.includes(a.kind))
  // Flutuante: só os agentes da função desta tela (ou os 2 primeiros); "⋯" mostra todos.
  const railAgents = floating && !showAll ? (mine.length ? mine : ordered.slice(0, 2)) : ordered
  const vertical = floating || !isMobile
  const avatarSize = floating ? 36 : 40
  const rail = (
    <div role="tablist" aria-label="Agentes" aria-orientation={vertical ? 'vertical' : 'horizontal'}
      style={floating ? {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 6px',
        background: 'color-mix(in srgb, var(--card) 92%, transparent)', backdropFilter: 'blur(10px)',
        border: `1px solid ${C.border}`, borderRadius: 22, boxShadow: '0 18px 40px rgba(0,0,0,.4)', maxHeight: '80vh', overflowY: 'auto',
      } : {
        display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: 10,
        padding: isMobile ? '8px 10px' : '14px 0', width: isMobile ? '100%' : 64, overflowX: isMobile ? 'auto' : 'visible',
        background: C.panel, borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
        borderTop: isMobile ? `1px solid ${C.border}` : 'none', boxSizing: 'border-box', flexShrink: 0,
      }}>
      <button type="button" onClick={openCoach} aria-label="Seu dia: tarefas, dicas e desempenho" title="Seu dia"
        className="rf-press"
        style={{
          position: 'relative', width: 44, height: 44, flexShrink: 0, borderRadius: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open && mode === 'coach' ? ORANGE : 'rgba(255,107,53,0.12)', color: open && mode === 'coach' ? '#1A0B02' : '#FF8A3D',
          border: '1px solid rgba(255,107,53,0.45)', boxShadow: '0 6px 18px rgba(255,107,53,0.18)',
        }}>
        <Lightbulb size={19} />
        {urgent.length + suggestions.length > 0 && (
          <span className="rf-tip-badge" aria-hidden="true" style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9, background: '#FF6B35', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid var(--card)', boxSizing: 'border-box' }}>
            {urgent.length + suggestions.length}
          </span>
        )}
      </button>
      <span aria-hidden="true" style={{ width: vertical ? 28 : 1, height: vertical ? 1 : 28, background: C.border, flexShrink: 0 }} />
      {railAgents.map((a, i) => {
        const here = pageKinds.includes(a.kind)
        const active = open && mode === 'chat' && current?.id === a.id
        const s = STATUS[a.status] || STATUS.idle
        const speaking = bubble && !open && agentFor(bubble.agent)?.id === a.id
        const motion = speaking ? 'talk'
          : a.status === 'thinking' || a.status === 'working' ? 'think'
            : a.status === 'waiting_approval' ? 'alert' : 'idle'
        const count = actionCount(a.kind)
        return (
          <button key={a.id} type="button" role="tab" aria-selected={active}
            ref={(el) => { btnRefs.current[a.id] = el }} className="rf-riser-btn"
            aria-label={`${a.name}, ${a.role}, ${s.label}${here ? ', cuida desta tela' : ''}${count ? `, ${count} dica(s) para hoje` : ''}`}
            title={`${a.name} · ${here ? 'cuida desta tela' : s.label}`}
            onClick={() => pick(a.id)}
            style={{
              position: 'relative', width: avatarSize + 10, height: avatarSize + 10, flexShrink: 0, borderRadius: 14, padding: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'rgba(255,107,53,0.16)' : here ? 'rgba(255,107,53,0.07)' : 'transparent',
              border: `1px solid ${active ? 'rgba(255,107,53,0.6)' : here ? 'rgba(255,107,53,0.35)' : 'transparent'}`,
              boxShadow: here && !active ? '0 0 16px rgba(255,107,53,0.22)' : 'none',
              opacity: here || active || !pageKinds.length ? 1 : 0.62, transition: 'opacity .25s ease, box-shadow .25s ease',
            }}>
            <RiserAvatar kind={a.kind} size={avatarSize} motion={motion} delay={i * 0.55} />
            <span aria-hidden="true" style={{
              position: 'absolute', right: 3, bottom: 3, width: 11, height: 11, borderRadius: '50%',
              background: s.dot, border: '2px solid var(--card)',
            }} />
            {count > 0 && (
              <span aria-hidden="true" className="rf-tip-badge" style={{ position: 'absolute', top: 0, left: 0, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, background: '#FF6B35', color: '#fff', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid var(--card)', boxSizing: 'border-box', animationDelay: `${i * 0.3}s` }}>{count}</span>
            )}
          </button>
        )
      })}
      {floating && ordered.length > railAgents.length && (
        <button type="button" onClick={() => setShowAll(true)} aria-label="Mostrar todos os agentes" title="Todos os agentes"
          style={{ width: 40, height: 32, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <MoreHorizontal size={16} />
        </button>
      )}
      {!floating && <Link to="/agentes/novo" aria-label="Criar agente" title="Criar agente" style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: `1px dashed ${C.border}`, color: C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Plus size={18} /></Link>}
    </div>
  )

  const coachPanel = open && mode === 'coach' && (
    <CoachPanel tips={tips} headline={snapshot ? dayHeadline(snapshot) : 'Carregando…'} agentFor={agentFor} mobile={isMobile}
      onClose={close} onGo={close} paused={paused} onTogglePause={togglePause} onAsk={askAbout}
      topSlot={<SuggestionList items={suggestions} agentFor={agentFor} states={sugState} onApprove={approveSuggestion} onAsk={askSuggestion} onDismiss={dismissSuggestion} />} />
  )
  const panel = coachPanel || (open && current && (
    <section aria-label={`Conversa com ${current.name}`} style={{
      width: isMobile ? '100%' : 380, height: isMobile ? '70vh' : '100%', display: 'flex', flexDirection: 'column',
      background: C.panel, borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
      borderTop: isMobile ? `1px solid ${C.border}` : 'none', fontFamily: F, color: C.text, boxSizing: 'border-box',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <RiserAvatar kind={current.kind} size={48} label={current.name} motion={sending || current.status === 'thinking' ? 'think' : 'idle'} />
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

      {demo && (
        <p style={{ margin: 0, padding: '8px 16px', fontSize: 12, lineHeight: 1.45, color: C.muted, background: 'rgba(255,107,53,0.08)', borderBottom: `1px solid ${C.border}` }}>
          Modo exemplo: os agentes ainda não executam tarefas sozinhos. Eles indicam a tela que faz o pedido.
        </p>
      )}
      <AgentTips tips={tips.filter((t) => t.agent === current.kind).map((t) => (t.cta?.to?.split('?')[0] === pathname ? { ...t, cta: null } : t))} onGo={close} />
      {suggestions.some((x) => x.agent_kind === current.kind) && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, maxHeight: '38%', overflowY: 'auto' }}>
          <SuggestionList items={suggestions.filter((x) => x.agent_kind === current.kind).slice(0, 2)} agentFor={agentFor} states={sugState} onApprove={approveSuggestion} onAsk={(sg) => setText(sg.prompt || sg.title)} onDismiss={dismissSuggestion} compact />
        </div>
      )}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m) => (
          <div key={m.id} style={{
            alignSelf: m.author_kind === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', whiteSpace: 'pre-line',
            lineHeight: 1.5, fontSize: 14, padding: m.author_kind === 'system' ? 0 : '10px 13px',
            borderRadius: m.author_kind === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
            background: m.author_kind === 'user' ? 'rgba(255,107,53,0.16)' : m.author_kind === 'system' ? 'transparent' : 'var(--bg)',
            border: m.author_kind === 'agent' ? `1px solid ${C.border}` : 'none',
            color: m.author_kind === 'system' ? '#22C55E' : C.text,
          }}>
            {m.content}
            {m.link && (
              <Link to={m.link.to} style={{
                display: 'inline-flex', alignItems: 'center', marginTop: 10, minHeight: 36, padding: '0 12px', borderRadius: 10,
                background: ORANGE, color: '#1A0B02', fontWeight: 700, fontSize: 13, textDecoration: 'none',
              }}>{m.link.label} →</Link>
            )}
          </div>
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

      <PromptChips prompts={pagePrompts} onPick={(p) => send(null, p)} />
      <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '12px 16px 16px', borderTop: `1px solid ${C.border}` }}>
        <label htmlFor="agent-dock-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Mensagem para {current.name}
        </label>
        <input id="agent-dock-input" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Peça algo a ${current.name}…`}
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
  ))

  // Balão de dica: aponta para o mascote que está falando.
  const bubbleAgent = bubble ? agentFor(bubble.agent) || agents[0] : null
  const anchorY = (() => {
    const el = bubbleAgent && btnRefs.current[bubbleAgent.id]
    if (!el) return 120
    const r = el.getBoundingClientRect()
    return r.top + r.height / 2
  })()
  const bubbleEl = bubble && !open && (
    <CoachBubble tip={bubble.cta?.to?.split('?')[0] === pathname ? { ...bubble, cta: null } : bubble} agent={bubbleAgent} mobile={isMobile} anchorY={anchorY}
      onClose={() => setBubble(null)} onNext={nextTip} onPause={pauseTips} onGo={() => setBubble(null)} onPrompt={promptFromBubble}
      hasNext={tips.some((t) => t.id !== bubble.id && !coachPrefs.seen().includes(t.id))} />
  )

  if (floating) {
    // Telas sem o Layout comum: pílula flutuante na lateral direita; a conversa abre por cima.
    return (
      <>
        {panel && (
          <div style={isMobile
            ? { position: 'fixed', left: 0, right: 0, bottom: 0, height: '78vh', zIndex: 60, boxShadow: '0 -20px 50px rgba(0,0,0,.5)' }
            : { position: 'fixed', top: 0, right: 76, height: '100vh', zIndex: 60, boxShadow: '-24px 0 48px -24px rgba(0,0,0,0.55)' }}>{panel}</div>
        )}
        <aside aria-label="Agentes" style={{ position: 'fixed', right: isMobile ? 6 : 12, top: '50%', transform: 'translateY(-50%)', zIndex: 61 }}>
          {rail}
        </aside>
        {bubbleEl}
      </>
    )
  }
  if (isMobile) {
    return (
      <>
        {bubbleEl}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, display: 'flex', flexDirection: 'column' }}>
          {panel}
          {rail}
        </div>
      </>
    )
  }
  // Desktop: só o trilho ocupa espaço no layout; a conversa abre por cima da página, ao lado
  // do trilho, para não espremer o conteúdo (gráficos e grades do Dashboard).
  return (
    <aside aria-label="Agentes" style={{ display: 'flex', height: '100vh', position: 'sticky', top: 0, flexShrink: 0, zIndex: 40 }}>
      {panel && (
        <div style={{
          position: 'fixed', top: 0, right: 64, height: '100vh', zIndex: 40,
          boxShadow: '-24px 0 48px -24px rgba(0,0,0,0.55)',
        }}>{panel}</div>
      )}
      {rail}
      {bubbleEl}
    </aside>
  )
}

export default AgentDock
