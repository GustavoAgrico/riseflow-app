import React, { useState } from 'react'
import { Search, ChevronDown, MessageSquare, Key, UserPlus, Clock, Mail, MousePointerClick, Image, Music, Sparkles, Tag, Hourglass, Timer, Headset, Bot, Brain, Lightbulb, Link, Save } from 'lucide-react'
import clsx from 'clsx'

export const PALETTE = [
  // ── GATILHOS (verde) — só um por funil (o builder usa o primeiro nó trigger) ──
  {
    category: 'Gatilhos',
    color: '#10B981',
    bg: 'bg-green-500/15',
    border: 'border-green-500/30',
    items: [
      { type: 'trigger', label: 'Palavra-chave',     Icon: Key,      sub: 'keyword' },
      { type: 'trigger', label: 'Primeiro contato',  Icon: UserPlus, sub: 'new_contact' },
      { type: 'trigger', label: 'Horário específico',Icon: Clock,    sub: 'schedule' },
      { type: 'trigger', label: 'Tag aplicada',      Icon: Tag,      sub: 'tag_applied' },
    ],
  },
  // ── AÇÕES (azul) — quantas quiser ──
  {
    category: 'Ações',
    color: '#3B82F6',
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
    items: [
      { type: 'message',     label: 'Enviar texto',          Icon: MessageSquare,     sub: 'text' },
      { type: 'message',     label: 'Enviar arquivo/imagem', Icon: Image,             sub: 'image' },
      { type: 'action',      label: 'Aguardar resposta',     Icon: Hourglass,         sub: 'wait' },
      { type: 'action',      label: 'Aplicar tag',           Icon: Tag,               sub: 'add_tag' },
      { type: 'action',      label: 'Transferir para humano',Icon: Headset,           sub: 'human' },
      { type: 'integration', label: 'Chamar webhook',        Icon: Link,              sub: 'webhook' },
    ],
  },
  // ── Avançado: blocos extras (preservados para não perder capacidade do engine) ──
  {
    category: 'Condições',
    color: '#06B6D4',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    items: [
      { type: 'condition', label: 'Se contém',         Icon: Search,   sub: 'contains' },
      { type: 'condition', label: 'Primeira vez',      Icon: Sparkles, sub: 'first_time' },
      { type: 'condition', label: 'Horário comercial', Icon: Clock,    sub: 'business_hours' },
      { type: 'condition', label: 'Tem tag',           Icon: Tag,      sub: 'has_tag' },
    ],
  },
  {
    category: 'Mensagens avançadas',
    color: '#FF6B35',
    bg: 'bg-brand-orange/15',
    border: 'border-brand-orange/30',
    items: [
      { type: 'message', label: 'Com botões',  Icon: MousePointerClick, sub: 'buttons' },
      { type: 'message', label: 'Enviar áudio',Icon: Music,             sub: 'audio' },
    ],
  },
  {
    category: 'IA Generativa',
    color: '#8B5CF6',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/30',
    items: [
      { type: 'ai', label: 'Chat OpenAI',    Icon: Bot, sub: 'openai'  },
      { type: 'ai', label: 'Chat Claude',    Icon: Brain, sub: 'claude'  },
      { type: 'ai', label: 'IA com Contexto',Icon: Lightbulb, sub: 'context' },
    ],
  },
  {
    category: 'Integrações',
    color: '#EC4899',
    bg: 'bg-pink-500/15',
    border: 'border-pink-500/30',
    items: [
      { type: 'action',      label: 'Delay (tempo fixo)', Icon: Timer, sub: 'delay' },
      { type: 'integration', label: 'Salvar no CRM',      Icon: Save,  sub: 'crm'   },
      { type: 'integration', label: 'Enviar email',       Icon: Mail,  sub: 'email' },
    ],
  },
]

export const NodePalette = ({ mobile, open, onClose, onPick } = {}) => {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})

  const onDragStart = (e, item) => {
    e.dataTransfer.setData('application/reactflow/type', item.type)
    e.dataTransfer.setData('application/reactflow/sub', item.sub)
    e.dataTransfer.setData('application/reactflow/label', item.label)
    e.dataTransfer.effectAllowed = 'move'
  }

  const filtered = search
    ? PALETTE.map(cat => ({
        ...cat,
        items: cat.items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())),
      })).filter(cat => cat.items.length > 0)
    : PALETTE

  if (mobile && !open) return null

  return (
    <>
      {mobile && open && <div onClick={onClose} className="fixed inset-0 bg-black/55 z-[69]" />}
      <div className={clsx('border-r border-dark-400 flex flex-col bg-dark-800 overflow-hidden',
        mobile ? 'fixed top-0 left-0 bottom-0 w-64 z-[70] shadow-2xl' : 'w-56 flex-shrink-0')}>
      <div className="px-3 py-3 border-b border-dark-400">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-white">Componentes</p>
          {mobile && <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none px-1">×</button>}
        </div>
        {mobile && <p className="text-[10px] text-slate-500 mb-2">Toque para adicionar ao canvas</p>}
        <div className="flex items-center gap-2 glass rounded-xl px-2.5 py-1.5">
          <Search size={11} className="text-slate-500 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="bg-transparent text-[11px] text-white placeholder-slate-600 outline-none flex-1"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-2">
        {filtered.map(cat => (
          <div key={cat.category} className="mb-1">
            <button
              onClick={() => setCollapsed(p => ({ ...p, [cat.category]: !p[cat.category] }))}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-dark-700 transition-colors"
            >
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{cat.category}</span>
              <ChevronDown
                size={11}
                className={clsx('text-slate-600 transition-transform', collapsed[cat.category] && '-rotate-90')}
              />
            </button>

            {!collapsed[cat.category] && cat.items.map(item => (
              <div
                key={`${item.type}-${item.sub}`}
                draggable
                onDragStart={e => onDragStart(e, item)}
                onClick={() => onPick?.(item)}
                className={clsx(
                  'mx-2 mb-1 px-2.5 py-2 rounded-xl cursor-pointer active:cursor-grabbing',
                  'flex items-center gap-2',
                  'border transition-all hover:scale-[1.02]',
                  cat.bg, cat.border,
                  'hover:brightness-110'
                )}
              >
                {item.Icon && <item.Icon size={16} className="text-white flex-shrink-0" style={{ color: cat.color }} />}
                <span className="text-[11px] text-white font-medium leading-tight">{item.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
    </>
  )
}
