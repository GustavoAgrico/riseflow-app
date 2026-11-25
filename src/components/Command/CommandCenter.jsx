// Central de comandos: paleta de busca (Ctrl+K ou /), menu Criar (N), ajuda de atalhos (?)
// e navegação por "G + letra". Montada uma vez pelo Layout; o estado fica em AppContext.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, CornerDownLeft, Keyboard, UserPlus, CalendarPlus, FileText, Receipt, GitBranch, ContactRound,
  LayoutDashboard, Users, Plug, Zap, MessageSquare, BarChart3, PieChart, Settings, Filter, Megaphone,
  Calendar, CalendarCheck, UserCog, ClipboardList, Crown, Bot, Sparkles, PhoneCall, Activity, TrendingUp, Target, ArrowRight,
} from 'lucide-react'
import api from '@services/api'
import { useApp } from '@context/AppContext'
import { useAuth } from '@context/AuthContext'
import { NAV_GROUPS } from '@constants/config'
import { buildSections, createItems, pageItems, GO_KEYS, isTypingTarget } from '@lib/commandSearch'

const ICONS = {
  UserPlus, CalendarPlus, FileText, Receipt, GitBranch, LayoutDashboard, Users, ContactRound, Plug, Zap, MessageSquare,
  BarChart3, PieChart, Settings, Filter, Megaphone, Calendar, CalendarCheck, UserCog, ClipboardList, Crown, Bot,
  Sparkles, PhoneCall, Activity, TrendingUp, Target, Search,
}
const F = "'DM Sans', sans-serif"
const GO_WINDOW_MS = 1200

// Contatos ficam em memória por 2 min: abrir a paleta várias vezes não refaz a consulta.
let contactCache = { owner: null, at: 0, list: [] }
async function loadContacts(owner) {
  if (contactCache.owner === owner && Date.now() - contactCache.at < 120000) return contactCache.list
  const { data } = await api.get('/clients', { params: { owner } })
  const list = (data || []).map(r => ({ id: r.id, name: r.name, company: r.company, email: r.email, phone: r.phone }))
  contactCache = { owner, at: Date.now(), list }
  return list
}

const Kbd = ({ children }) => (
  <kbd style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, minWidth: 20, textAlign: 'center', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-2, var(--ink-1))' }}>{children}</kbd>
)

const SHORTCUTS = [
  ['Buscar em tudo', ['Ctrl', 'K'], ['/']],
  ['Criar (contato, reunião, cobrança…)', ['N']],
  ['Esta ajuda', ['?']],
  ['Ir para Dashboard', ['G', 'D']], ['Ir para Hoje', ['G', 'H']], ['Ir para Chat', ['G', 'M']],
  ['Ir para CRM', ['G', 'C']], ['Ir para Clientes', ['G', 'L']], ['Ir para Funil', ['G', 'F']],
  ['Ir para Agenda', ['G', 'A']], ['Ir para Cobranças', ['G', 'B']], ['Ir para Relatórios', ['G', 'R']],
  ['Ir para Configurações', ['G', 'S']],
  ['Fechar janela', ['Esc']],
]

function Overlay({ onClose, children, label, width = 620 }) {
  return (
    <div className="rf-scrim" onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5,5,12,0.55)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 16px' }}>
      <div role="dialog" aria-modal="true" aria-label={label} className="rf-pop" onMouseDown={e => e.stopPropagation()}
        style={{ width, maxWidth: '100%', maxHeight: '72vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.45)', overflow: 'hidden', fontFamily: F, color: 'var(--ink-1)' }}>
        {children}
      </div>
    </div>
  )
}

function Palette({ mode, onClose, onRun }) {
  const { ownerUserId, isDemoMode, canAccess } = useAuth()
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    if (mode !== 'search' || isDemoMode || !ownerUserId) return
    let on = true
    setLoadingContacts(true)
    loadContacts(ownerUserId).then(l => { if (on) setContacts(l) }).catch(() => {}).finally(() => { if (on) setLoadingContacts(false) })
    return () => { on = false }
  }, [mode, ownerUserId, isDemoMode])

  const pages = useMemo(() => pageItems(NAV_GROUPS, canAccess), [canAccess])
  const creates = useMemo(() => createItems(canAccess), [canAccess])
  const sections = useMemo(() => buildSections({ query, mode, pages, creates, contacts }), [query, mode, pages, creates, contacts])
  const flat = useMemo(() => sections.flatMap(s => s.items), [sections])

  useEffect(() => { setActive(0) }, [query, mode])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (flat.length ? (a + 1) % flat.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (flat.length ? (a - 1 + flat.length) % flat.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) onRun(flat[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let idx = -1
  return (
    <Overlay onClose={onClose} label={mode === 'create' ? 'Criar' : 'Buscar'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <Search size={17} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
          placeholder={mode === 'create' ? 'O que você quer criar?' : 'Buscar contatos, páginas e ações…'}
          aria-label="Buscar" aria-controls="rf-cmd-list" aria-activedescendant={flat[active] ? `rf-cmd-${active}` : undefined}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-1)', fontSize: 15, fontFamily: F }} />
        <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}><X size={17} /></button>
      </div>

      <div id="rf-cmd-list" role="listbox" ref={listRef} style={{ overflowY: 'auto', padding: 8 }}>
        {flat.length === 0 && (
          <p style={{ margin: 0, padding: '28px 12px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
            {loadingContacts ? 'Carregando contatos…' : `Nada encontrado para "${query}".`}
          </p>
        )}
        {sections.map(s => (
          <div key={s.id} style={{ marginBottom: 6 }}>
            <p style={{ margin: 0, padding: '8px 10px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-3)' }}>{s.title}</p>
            {s.items.map(item => {
              idx += 1
              const i = idx
              const on = i === active
              const Icon = item.kind === 'contact' ? ContactRound : (ICONS[item.icon] || ArrowRight)
              return (
                <div key={item.id} id={`rf-cmd-${i}`} data-idx={i} role="option" aria-selected={on}
                  onMouseMove={() => setActive(i)} onClick={() => onRun(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', background: on ? 'rgba(255,107,53,0.12)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 #FF6B35' : 'none' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: item.kind === 'create' ? 'rgba(124,58,237,0.16)' : 'var(--card)', color: item.kind === 'create' ? '#A78BFA' : on ? '#FF6B35' : 'var(--ink-3)' }}>
                    <Icon size={15} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                    {item.hint && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.hint}</span>}
                  </span>
                  {on && <CornerDownLeft size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Kbd>Enter</Kbd> abrir</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Kbd>Esc</Kbd> fechar</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Kbd>?</Kbd> atalhos</span>
      </div>
    </Overlay>
  )
}

function ShortcutsHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Overlay onClose={onClose} label="Atalhos de teclado" width={520}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <Keyboard size={17} style={{ color: '#FF6B35' }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1 }}>Atalhos de teclado</h2>
        <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}><X size={17} /></button>
      </div>
      <div style={{ overflowY: 'auto', padding: '8px 18px 16px' }}>
        {SHORTCUTS.map(([label, ...combos]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ flex: 1 }}>{label}</span>
            {combos.map((keys, ci) => (
              <span key={ci} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {ci > 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)', margin: '0 2px' }}>ou</span>}
                {keys.map((k, ki) => (
                  <React.Fragment key={k}>
                    {ki > 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{keys[0] === 'G' ? 'depois' : '+'}</span>}
                    <Kbd>{k}</Kbd>
                  </React.Fragment>
                ))}
              </span>
            ))}
          </div>
        ))}
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-3)' }}>Os atalhos de uma tecla não funcionam enquanto você digita em um campo.</p>
      </div>
    </Overlay>
  )
}

export function CommandCenter() {
  const { command, setCommand, setNewFlowModalOpen } = useApp()
  const { canAccess } = useAuth()
  const navigate = useNavigate()
  const goPending = useRef(0)

  useEffect(() => {
    const onKey = (e) => {
      const key = e.key?.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault()
        setCommand(c => (c === 'search' ? null : 'search'))
        return
      }
      if (command || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]')) return

      if (goPending.current && Date.now() - goPending.current < GO_WINDOW_MS) {
        goPending.current = 0
        const path = GO_KEYS[key]
        if (path && canAccess(path)) { e.preventDefault(); navigate(path) }
        return
      }
      if (e.key === '/') { e.preventDefault(); setCommand('search') }
      else if (e.key === '?') { e.preventDefault(); setCommand('help') }
      else if (key === 'n' && !e.shiftKey) { e.preventDefault(); setCommand('create') }
      else if (key === 'g' && !e.shiftKey) { goPending.current = Date.now() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [command, setCommand, canAccess, navigate])

  const close = () => setCommand(null)
  const run = (item) => {
    close()
    if (item.path) navigate(item.path)
    if (item.action === 'new-flow') setNewFlowModalOpen(true)
  }

  if (command === 'help') return <ShortcutsHelp onClose={close} />
  if (command === 'search' || command === 'create') return <Palette key={command} mode={command} onClose={close} onRun={run} />
  return null
}

export default CommandCenter
