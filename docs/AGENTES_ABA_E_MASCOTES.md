# Aba de Agentes + Mascotes Riser — guia de implementação (RiseFlow)

> Arquivo feito para o **Claude Code** dentro do projeto RiseFlow.
> Peça: *"Leia docs/AGENTES_ABA_E_MASCOTES.md e implemente tudo, na ordem das etapas."*
> Complementa `docs/AGENTES_ARQUITETURA.md` (backend dos agentes, fases 1–12).

## 0. O que vai ser entregue

- **Dock lateral de agentes** (estilo aba do Grok): um trilho vertical à direita com os avatares dos agentes; clicar abre um painel de conversa de 380px.
- **6 mascotes "Riser"** em SVG puro, na identidade Rise (pico laranja + marca), cada um com um acessório da função:

| kind | Nome demo | Função | Gradiente | Acessório |
|---|---|---|---|---|
| `comercial` | Rizo | Assistente Comercial | #FFB347 → #FF5A1F | antena com chevron |
| `atendente` | Bia | Atendente WhatsApp | #A78BFA → #6D28D9 | headset |
| `prospector` | Pino | Prospecção | #5EEAD4 → #0F9488 | lupa |
| `agenda` | Tiki | Agenda/Reuniões | #FFE08A → #F0A10F | argolas de calendário + check |
| `metas` | Topo | Metas | #7AEBA8 → #15A34A | bandeira no pico |
| `analista` | Dado | Relatórios | #8CC0FF → #2563EB | óculos + barras |

- Status por agente (ponto colorido): `idle`, `thinking`, `working`, `waiting_approval`, `error`.
- **Cartões de aprovação** (Aprovar/Recusar) para ações de risco — ex.: enviar WhatsApp.
- Tempo real via Socket.io (`agent_status`, `agent_message`, `agent_approval_request`).
- **Modo demo automático**: se `isDemoMode` estiver ligado *ou* a rota `/api/agents` ainda não existir, o dock usa dados de demonstração. Assim a UI funciona hoje, antes do backend.
- Mobile: barra fixa inferior com os avatares; painel abre acima (70vh).
- Estado aberto/agente salvo em `localStorage` (`rf.agentDock.open`, `rf.agentDock.agent`), com try/catch.

Não usa nenhuma lib nova: só React, `lucide-react` (já instalado), `@services/api`, `@services/socket`, `useAuth` e `useIsMobile`.

## 1. Pré-requisitos a conferir no projeto

Antes de criar os arquivos, o Claude Code deve confirmar (e ajustar os imports se algo for diferente):

1. `src/services/api.js` exporta **default** uma instância axios cujo `baseURL` já termina em `/api` (por isso as rotas abaixo começam em `/agents`, sem `/api`).
2. `src/services/socket.js` exporta **default** o socket do Socket.io.
3. `@context/AuthContext` exporta `useAuth()` com `isDemoMode`.
4. `@hooks/useIsMobile` exporta `useIsMobile` (default ou named — ajustar o import do AgentDock).
5. Aliases `@components`, `@services`, `@context`, `@hooks` no `vite.config.js`.
6. Variáveis CSS globais: `--accent`, `--accent-2`, `--bg`, `--card`, `--border`, `--ink-1`…`--ink-4`, fonte DM Sans.

## 2. Arquivos novos

### 2.1 `src/services/agents.js`

```js
// Chamadas da aba de agentes. As rotas nascem nas fases 1 e 2 de docs/AGENTES_ARQUITETURA.md.
import api from '@services/api'

export const agentsApi = {
  list: () => api.get('/agents').then((r) => r.data),
  messages: (agentId) => api.get(`/agents/${agentId}/messages`).then((r) => r.data),
  send: (agentId, text) => api.post(`/agents/${agentId}/messages`, { text }).then((r) => r.data),
  approvals: (agentId) => api.get('/approvals', { params: { agent_id: agentId, status: 'pending' } }).then((r) => r.data),
  decide: (approvalId, decision) => api.post(`/approvals/${approvalId}/decision`, { decision }).then((r) => r.data),
}
```

### 2.2 `src/components/Agents/RiserAvatar.jsx`

```jsx
// Mascotes dos agentes do RiseFlow ("Risers"). Desenho original da Rise.
// Uso: <RiserAvatar kind="comercial" size={40} />
// kinds: comercial | atendente | prospector | agenda | metas | analista
import React, { useId } from 'react'

const GRADIENTS = {
  comercial: ['#FFB347', '#FF5A1F'],
  atendente: ['#A78BFA', '#6D28D9'],
  prospector: ['#5EEAD4', '#0F9488'],
  agenda: ['#FFE08A', '#F0A10F'],
  metas: ['#7AEBA8', '#15A34A'],
  analista: ['#8CC0FF', '#2563EB'],
}

export const RISER_KINDS = Object.keys(GRADIENTS)

const INK = '#1B1410'
const Eyes = ({ lx, rx, y, r = 7, glint = 2.4 }) => (
  <>
    <circle cx={lx} cy={y} r={r} fill={INK} />
    <circle cx={rx} cy={y} r={r} fill={INK} />
    <circle cx={lx + 2.4} cy={y - 2.6} r={glint} fill="#fff" />
    <circle cx={rx + 2.4} cy={y - 2.6} r={glint} fill="#fff" />
  </>
)
const Cheeks = ({ lx, rx, y, color = '#FF6F91', opacity = 0.35 }) => (
  <>
    <ellipse cx={lx} cy={y} rx="5" ry="3" fill={color} fillOpacity={opacity} />
    <ellipse cx={rx} cy={y} rx="5" ry="3" fill={color} fillOpacity={opacity} />
  </>
)
const RiseMark = ({ y }) => (
  <path d={`M45 ${y}L50 ${y - 5}L55 ${y}`} stroke="#fff" strokeOpacity="0.9" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" fill="none" />
)
const Shine = ({ d }) => (
  <path d={d} stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" fill="none" />
)

function Body({ kind, fill }) {
  switch (kind) {
    case 'atendente':
      return (
        <>
          <path d="M28 78L19 93L46 82Z" fill="#6D28D9" />
          <rect x="11" y="24" width="78" height="62" rx="28" fill={fill} />
          <Shine d="M20 44C21 34 28 29 37 29" />
          <path d="M17 48C17 26 32 15 50 15C68 15 83 26 83 48" stroke="#3B1A7A" strokeWidth="5" strokeLinecap="round" fill="none" />
          <rect x="9" y="42" width="11" height="18" rx="5" fill="#3B1A7A" />
          <rect x="80" y="42" width="11" height="18" rx="5" fill="#3B1A7A" />
          <path d="M14 59Q16 73 33 72" stroke="#3B1A7A" strokeWidth="3" strokeLinecap="round" fill="none" />
          <circle cx="35" cy="72" r="3.4" fill="#3B1A7A" />
          <Cheeks lx={28} rx={72} y={64} opacity={0.4} />
          <Eyes lx={38} rx={62} y={52} />
          <path d="M42 62Q50 63 58 62Q57 72 50 72Q43 72 42 62Z" fill={INK} />
          <path d="M46 69Q50 66 54 69Q52 71.5 50 71.5Q48 71.5 46 69Z" fill="#FF6F91" />
          <RiseMark y={82} />
        </>
      )
    case 'prospector':
      return (
        <>
          <path d="M50 12C73 12 88 28 88 49C88 71 64 85 50 95C36 85 12 71 12 49C12 28 27 12 50 12Z" fill={fill} />
          <Shine d="M21 42C23 30 31 22 42 20" />
          <Cheeks lx={27} rx={71} y={60} />
          <Eyes lx={39} rx={63} y={48} />
          <path d="M33 37Q38 34 43 36" stroke="#0B4F48" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="52" cy="62" rx="3.4" ry="4" fill={INK} />
          <RiseMark y={78} />
          <path d="M84 80L93 89" stroke="#0B4F48" strokeWidth="6" strokeLinecap="round" />
          <circle cx="78" cy="72" r="11" fill="#E6FFFB" fillOpacity="0.55" stroke="#0B4F48" strokeWidth="4.5" />
          <path d="M73 68Q75 65 78 65" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      )
    case 'agenda':
      return (
        <>
          <rect x="12" y="22" width="76" height="70" rx="20" fill={fill} />
          <path d="M12 42V39C12 29 20 22 30 22H70C80 22 88 29 88 39V42Z" fill="#E08E0B" />
          <rect x="28" y="12" width="9" height="19" rx="4.5" fill="#6B4A0A" />
          <rect x="63" y="12" width="9" height="19" rx="4.5" fill="#6B4A0A" />
          <RiseMark y={37} />
          <Cheeks lx={27} rx={73} y={69} color="#FF6F61" />
          <Eyes lx={38} rx={62} y={58} />
          <path d="M43 70Q50 76 57 70" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <circle cx="80" cy="82" r="8" fill="#16A34A" stroke="#FFF6DC" strokeWidth="2.5" />
          <path d="M76.5 82L79 84.6L83.8 79.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )
    case 'metas':
      return (
        <>
          <path d="M50 18V3" stroke="#0E6B32" strokeWidth="3" strokeLinecap="round" />
          <path d="M50 3L64 7.5L50 12Z" fill="#FF6A1F" />
          <path d="M50 16C55 16 58 19 61 24L91 74C95 82 90 92 80 92L20 92C10 92 5 82 9 74L39 24C42 19 45 16 50 16Z" fill={fill} />
          <path d="M41 32L47 22" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" fill="none" />
          <Cheeks lx={29} rx={71} y={70} />
          <Eyes lx={39} rx={61} y={59} />
          <path d="M32 49L44 52" stroke="#0E6B32" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M68 49L56 52" stroke="#0E6B32" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M41 69Q50 70 59 69Q57 78 50 78Q43 78 41 69Z" fill={INK} />
          <path d="M43 69.6Q50 70.4 57 69.6L56.4 72Q50 72.6 43.6 72Z" fill="#fff" />
          <RiseMark y={88} />
        </>
      )
    case 'analista':
      return (
        <>
          <rect x="29" y="9" width="8" height="20" rx="4" fill="#1D4ED8" />
          <rect x="46" y="3" width="8" height="26" rx="4" fill="#FF6A1F" />
          <rect x="63" y="14" width="8" height="15" rx="4" fill="#1D4ED8" />
          <rect x="8" y="24" width="84" height="66" rx="32" fill={fill} />
          <Shine d="M19 44C21 35 27 30 36 29" />
          <Cheeks lx={25} rx={75} y={66} />
          <circle cx="37" cy="54" r="11" fill="#fff" fillOpacity="0.22" stroke="#102A6B" strokeWidth="3" />
          <circle cx="63" cy="54" r="11" fill="#fff" fillOpacity="0.22" stroke="#102A6B" strokeWidth="3" />
          <path d="M48 53Q50 51 52 53" stroke="#102A6B" strokeWidth="3" strokeLinecap="round" fill="none" />
          <Eyes lx={37} rx={63} y={54} r={5.6} glint={2} />
          <path d="M44 72Q50 76 56 72" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <RiseMark y={85} />
        </>
      )
    default: // comercial
      return (
        <>
          <path d="M50 22V11" stroke="#E2531A" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M43.5 13.5L50 7L56.5 13.5" stroke="#FF8A3D" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="13" y="22" width="74" height="70" rx="25" fill={fill} />
          <Shine d="M22 44C22 33 28 27 38 27" />
          <Cheeks lx={27} rx={73} y={64} color="#FF3D6E" />
          <Eyes lx={37} rx={63} y={54} r={7.5} glint={2.6} />
          <path d="M41 65Q50 74 59 65" stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <RiseMark y={85} />
        </>
      )
  }
}

export function RiserAvatar({ kind = 'comercial', size = 40, label, shadow = true, style }) {
  const k = GRADIENTS[kind] ? kind : 'comercial'
  const gid = `riser-${k}-${useId().replace(/:/g, '')}`
  const [from, to] = GRADIENTS[k]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={style}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={gid} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {shadow && <ellipse cx="50" cy="95" rx="27" ry="3.6" fill="#000" fillOpacity="0.32" />}
      <Body kind={k} fill={`url(#${gid})`} />
    </svg>
  )
}

export default RiserAvatar
```

### 2.3 `src/components/Agents/agentsDemo.js`

```js
// Dados de demonstração da aba de agentes. Usados quando isDemoMode está ligado
// ou enquanto as rotas /api/agents ainda não existem (antes da fase 1).
export const DEMO_AGENTS = [
  { id: 'demo-comercial', kind: 'comercial', name: 'Rizo', role: 'Assistente Comercial', status: 'waiting_approval' },
  { id: 'demo-atendente', kind: 'atendente', name: 'Bia', role: 'Atendente', status: 'working' },
  { id: 'demo-prospector', kind: 'prospector', name: 'Pino', role: 'Prospecção', status: 'idle' },
  { id: 'demo-agenda', kind: 'agenda', name: 'Tiki', role: 'Agenda', status: 'idle' },
  { id: 'demo-metas', kind: 'metas', name: 'Topo', role: 'Metas', status: 'idle' },
  { id: 'demo-analista', kind: 'analista', name: 'Dado', role: 'Relatórios', status: 'thinking' },
]

export const DEMO_MESSAGES = {
  'demo-comercial': [
    { id: 'm1', author_kind: 'agent', content: 'Bom dia! Hoje você tem 3 tarefas atrasadas e 2 reuniões.\nLeads esfriando: Clínica Sorriso (6 dias sem contato) e Studio Fit (9 dias).' },
  ],
  'demo-atendente': [{ id: 'm1', author_kind: 'agent', content: 'Estou atendendo 4 conversas no WhatsApp.' }],
  'demo-prospector': [{ id: 'm1', author_kind: 'agent', content: 'Achei 28 academias em Curitiba; 11 têm nota acima de 70.' }],
  'demo-agenda': [{ id: 'm1', author_kind: 'agent', content: 'Próxima reunião: Studio Fit às 14h. A pauta está pronta.' }],
  'demo-metas': [{ id: 'm1', author_kind: 'agent', content: 'Para bater a meta você precisa vender um pouco por dia útil. Quer ver os negócios que fecham a diferença?' }],
  'demo-analista': [{ id: 'm1', author_kind: 'agent', content: 'Estou montando o relatório semanal.' }],
}

export const DEMO_APPROVALS = {
  'demo-comercial': [
    { id: 'a1', tool: 'send_whatsapp', summary: 'Enviar a proposta do plano Pro para Clínica Sorriso por WhatsApp.' },
  ],
}
```

### 2.4 `src/components/Agents/AgentDock.jsx`

```jsx
// Aba de agentes: faixa lateral direita, presente em todas as páginas do Layout.
// Mostra um mascote por agente; clicar abre o chat daquele agente com aprovações pendentes.
// Spec: docs/AGENTES_ABA_E_MASCOTES.md
import React, { useEffect, useMemo, useRef, useState } from 'react'
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
      .then((list) => { if (alive) { setAgents(list); setDemo(false) } })
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
      .then(([m, a]) => { setMessages(m); setApprovals(a) })
      .catch(() => setError('Não foi possível carregar a conversa. Tente de novo.'))
  }, [current?.id, demo])

  // Tempo real: status, mensagens e pedidos de aprovação vindos do worker.
  useEffect(() => {
    if (demo) return
    const onStatus = ({ agent_id, status }) =>
      setAgents((list) => list.map((a) => (a.id === agent_id ? { ...a, status } : a)))
    const onMessage = (msg) => { if (msg.agent_id === current?.id) setMessages((m) => [...m, msg]) }
    const onApproval = (ap) => { if (ap.agent_id === current?.id) setApprovals((l) => [...l, ap]) }
    socket.on('agent_status', onStatus)
    socket.on('agent_message', onMessage)
    socket.on('agent_approval_request', onApproval)
    return () => {
      socket.off('agent_status', onStatus)
      socket.off('agent_message', onMessage)
      socket.off('agent_approval_request', onApproval)
    }
  }, [demo, current?.id])

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [messages.length, approvals.length])

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
    const note = decision === 'approved' ? 'Aprovado. O agente vai executar e registrar no histórico.' : 'Recusado. O agente recebeu o motivo.'
    setMessages((m) => [...m, { id: `sys-${ap.id}`, author_kind: 'system', content: note }])
    if (demo) return
    try { await agentsApi.decide(ap.id, decision) }
    catch {
      setApprovals((l) => [ap, ...l])
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
      <a href="/agentes/novo" aria-label="Criar agente" style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: `1px dashed ${C.border}`, color: C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Plus size={18} /></a>
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
              <button type="button" onClick={() => decide(ap, 'approved')} style={{
                minHeight: 44, padding: '0 16px', border: 'none', borderRadius: 10, background: ORANGE, color: '#1A0B02',
                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}><Check size={16} /> Aprovar</button>
              <button type="button" onClick={() => decide(ap, 'denied')} style={{
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
```

## 3. Integração no layout

Em `src/components/Layout/Layout.jsx` (que já renderiza Sidebar + Topbar + main em linha flex), adicionar o dock **como último filho da linha flex**, depois da coluna principal:

```jsx
import { AgentDock } from '@components/Agents/AgentDock'

// ...dentro do return, na div flex que contém <Sidebar/> e a coluna principal:
<div style={{ display: 'flex', minHeight: '100vh' }}>
  <Sidebar />
  <div style={{ flex: 1, minWidth: 0 }}>
    <Topbar />
    <main>{children /* ou <Outlet /> */}</main>
  </div>
  <AgentDock />
</div>
```

- No desktop o dock é `position: sticky; height: 100vh` e ocupa só a largura do trilho (≈64px) quando fechado; aberto soma o painel de 380px.
- No mobile ele se posiciona `fixed` no rodapé. Se houver uma bottom-nav, somar a altura dela ao `bottom` do dock e dar `padding-bottom` extra ao `<main>`.
- Não renderizar o dock nas páginas públicas (login, landing): ele fica só dentro do Layout autenticado.

## 4. Rota "Criar agente"

O trilho tem um botão **+** que leva para `/agentes/novo`. Até a tela real existir (fase 3 da arquitetura), criar um placeholder:

```jsx
// src/pages/Agentes/NovoAgente.jsx
export default function NovoAgente() {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ color: 'var(--ink-1)' }}>Criar agente</h1>
      <p style={{ color: 'var(--ink-3)' }}>Em breve: escolha a função, o mascote e as permissões.</p>
    </div>
  )
}
```

E registrar a rota protegida no roteador (`/agentes/novo`).

## 5. Contrato com o backend

O dock já chama estas rotas. Enquanto não existirem, ele cai no demo sem erro na tela. Elas vêm das fases 1–2 de `docs/AGENTES_ARQUITETURA.md`:

| Método | Rota (Express, prefixo `/api`) | Resposta esperada |
|---|---|---|
| GET | `/agents` | `[{ id, kind, name, role, status }]` |
| GET | `/agents/:id/messages` | `[{ id, author_kind: 'agent'|'user', content, created_at }]` |
| POST | `/agents/:id/messages` body `{ text }` | a mensagem criada (o agente responde depois via Socket) |
| GET | `/approvals?agent_id=&status=pending` | `[{ id, tool, summary }]` |
| POST | `/approvals/:id/decision` body `{ decision: 'approve'|'reject' }` | `{ ok: true }` |

Eventos Socket.io (servidor → cliente, sala do `user_id`):

- `agent_status` → `{ agent_id, status }`
- `agent_message` → `{ agent_id, message: { id, author_kind, content } }`
- `agent_approval_request` → `{ agent_id, approval: { id, tool, summary } }`

Regras: todas as tabelas com RLS por `user_id`; `kind` precisa ser um dos 6 valores da tabela da seção 0 (outro valor cai no visual `comercial`). O SQL das tabelas é rodado manualmente no Supabase, como no restante do projeto.

## 6. Critérios de aceite

- [ ] O trilho mostra 6 avatares com ponto de status; leitores de tela anunciam `role="tablist"`/`role="tab"`.
- [ ] Clicar num avatar abre o painel "Conversa com <nome>"; clicar de novo ou no X fecha.
- [ ] No Rizo (demo) aparece o cartão "PEDE APROVAÇÃO"; Aprovar remove o cartão e mostra "Aprovado.". Se a API falhar, o cartão volta (rollback) e aparece um alerta.
- [ ] Digitar e enviar mostra a mensagem do usuário na hora; botão fica desabilitado com o campo vazio.
- [ ] Trocar de agente troca a conversa; recarregar a página mantém aberto/fechado e o agente escolhido.
- [ ] Sem backend (`/api/agents` 404) o dock funciona em demo, sem erro no console além do 404.
- [ ] Mobile (< 768px): barra inferior com avatares, painel acima com 70vh, nada sobrepõe o input.
- [ ] `npm run build` passa sem warnings novos.

## 7. Teste rápido sugerido (Vitest + Testing Library, se o projeto usar)

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentDock } from '@components/Agents/AgentDock'

vi.mock('@context/AuthContext', () => ({ useAuth: () => ({ isDemoMode: true }) }))
vi.mock('@hooks/useIsMobile', () => ({ useIsMobile: () => false, default: () => false }))
vi.mock('@services/socket', () => ({ default: { on: vi.fn(), off: vi.fn() } }))

test('abre o Rizo, aprova e envia mensagem', async () => {
  render(<AgentDock />)
  fireEvent.click((await screen.findAllByRole('tab'))[0])
  expect(screen.getByLabelText('Conversa com Rizo')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Aprovar'))
  await waitFor(() => expect(screen.getByText('Aprovado.')).toBeInTheDocument())
  fireEvent.change(document.querySelector('#agent-dock-input'), { target: { value: 'Quem eu ligo hoje?' } })
  fireEvent.submit(document.querySelector('#agent-dock-input').form)
  expect(await screen.findByText('Quem eu ligo hoje?')).toBeInTheDocument()
})
```

Esses mesmos cenários já foram validados fora do projeto (desktop em demo e mobile com fallback da API): 6 abas, painel abre, aprovação some com "Aprovado.", mensagem enviada aparece, troca para Pino, fechar e persistência funcionam.

## 8. Próximos passos (fora deste arquivo)

1. Backend fases 1–2 de `AGENTES_ARQUITETURA.md` (tabelas, fila, rotas e eventos acima) — o dock sai do demo sozinho.
2. Tela real de "Criar agente" (escolher `kind`, nome, permissões e política de aprovação).
3. Animações leves no avatar por status (piscar em `thinking`, pulso em `waiting_approval`), respeitando `prefers-reduced-motion`.

> Nota de licença: o OpenBot serviu só de referência de ideias. Nenhum código, prompt ou arte dele foi copiado; os mascotes Riser são desenho próprio da Rise.
