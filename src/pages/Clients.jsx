import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@components/Layout/Layout'
import {
  Search, Plus, MessageCircle, Phone, Mail, Tag,
  Trash2, Users, Loader2, X, ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { logger } from '@services/activityLogger'
import { MOCK_CLIENTS } from '@constants/config'
import clsx from 'clsx'

const TAG_OPTIONS = ['Lead Quente', 'Prospect', 'Cliente', 'VIP', 'Inativo']
const CHANNEL_OPTIONS = ['whatsapp', 'instagram', 'facebook', 'telegram']

const tagColors = {
  'Lead Quente': 'bg-brand-orange/15 text-brand-orange',
  'Prospect': 'bg-brand-blue/15 text-brand-blue',
  'Cliente': 'bg-brand-green/15 text-brand-green',
  'Inativo': 'bg-slate-500/15 text-slate-400',
  'VIP': 'bg-yellow-500/15 text-yellow-400',
}

const channelMeta = {
  whatsapp: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'WhatsApp' },
  instagram: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Instagram' },
  facebook: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Facebook' },
  telegram: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'Telegram' },
}

const initials = (name = '') =>
  name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?'

// ── Add Client Modal ──────────────────────────────────────────────────────────
const AddClientModal = ({ userId, onClose, onAdded }) => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const [tag, setTag] = useState('Prospect')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setLoading(true)
    setError('')
    try {
      const { error: sbErr } = await supabase.from('clients').insert({
        user_id: userId,
        name: name.trim(),
        phone: phone.trim() || null,
        channel,
        tag,
        status: 'active',
      })
      if (sbErr) throw sbErr
      onAdded()
    } catch (err) {
      setError(err.message || 'Erro ao adicionar cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md glass rounded-2xl border border-dark-300 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-dark-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center">
              <Users size={17} className="text-brand-orange" />
            </div>
            <div>
              <h2 className="font-display font-bold text-white text-base">Novo Cliente</h2>
              <p className="text-xs text-slate-500">Adicione ao CRM</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-dark-500 text-slate-400 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-brand-red/10 border border-brand-red/30 text-brand-red text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Nome completo *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
              placeholder="Nome do cliente"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Telefone</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input-field"
              placeholder="+55 11 99999-9999"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-3">Canal de contato</label>
            <div className="grid grid-cols-4 gap-2">
              {CHANNEL_OPTIONS.map(ch => {
                const meta = channelMeta[ch]
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    className={clsx(
                      'py-2 px-1 rounded-xl border text-xs font-medium transition-all',
                      channel === ch
                        ? `${meta.bg} ${meta.text} border-transparent`
                        : 'glass text-slate-500 border-dark-400 hover:text-slate-300'
                    )}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Tag</label>
            <select
              value={tag}
              onChange={e => setTag(e.target.value)}
              className="input-field"
            >
              {TAG_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center" disabled={loading}>
              Cancelar
            </button>
            <button type="submit" disabled={loading || !name.trim()} className="btn-primary flex-1 justify-center disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {loading ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export const Clients = () => {
  const navigate = useNavigate()
  const { user, isDemoMode } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const fetchClients = useCallback(async () => {
    if (isDemoMode) {
      setClients(MOCK_CLIENTS.map(c => ({
        ...c,
        last_message: c.lastMessage,
        created_at: new Date().toISOString(),
      })))
      setLoading(false)
      return
    }
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) setClients(data ?? [])
    setLoading(false)
  }, [user, isDemoMode])

  useEffect(() => { fetchClients() }, [fetchClients])

  const handleDelete = async (clientId) => {
    if (isDemoMode) return
    setDeleting(clientId)
    await supabase.from('clients').delete().eq('id', clientId)
    logger.log(user?.id, 'contact_deleted', { category: 'contacts', description: 'Contato excluído: ' + (clients.find(c => c.id === clientId)?.name || clientId) })
    setClients(prev => prev.filter(c => c.id !== clientId))
    if (selected?.id === clientId) setSelected(null)
    setDeleting(null)
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  )

  return (
    <Layout
      title="Clientes CRM"
      subtitle={`${clients.length} cliente${clients.length !== 1 ? 's' : ''} cadastrado${clients.length !== 1 ? 's' : ''}`}
    >
      {addOpen && !isDemoMode && (
        <AddClientModal
          userId={user?.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); fetchClients() }}
        />
      )}

      <div className="flex gap-4 h-[calc(100vh-10rem)]">
        {/* List */}
        <div className="flex-1 flex flex-col glass rounded-2xl overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-dark-400 flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 glass rounded-xl px-3 py-2">
              <Search size={14} className="text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="bg-transparent text-sm text-white placeholder-slate-500 outline-none flex-1"
              />
            </div>
            <button
              onClick={() => !isDemoMode && setAddOpen(true)}
              className={clsx('btn-primary', isDemoMode && 'opacity-50 cursor-not-allowed')}
              title={isDemoMode ? 'Indisponível no modo demo' : 'Adicionar cliente'}
            >
              <Plus size={14} />Novo
            </button>
          </div>

          {/* Table Header */}
          <div className="px-4 py-2 grid grid-cols-5 text-xs text-slate-500 uppercase tracking-wider border-b border-dark-400">
            <span className="col-span-2">Cliente</span>
            <span>Canal</span>
            <span>Status</span>
            <span>Tag</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={20} className="text-brand-orange animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                <Users size={30} className="text-slate-600" />
                <p className="text-sm text-slate-500">
                  {search ? 'Nenhum resultado para a busca' : 'Nenhum cliente ainda'}
                </p>
                {!search && !isDemoMode && (
                  <button onClick={() => setAddOpen(true)} className="text-xs text-brand-orange hover:underline">
                    Adicionar primeiro cliente
                  </button>
                )}
              </div>
            ) : (
              filtered.map(c => {
                const ch = channelMeta[c.channel]
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={clsx(
                      'px-4 py-3 grid grid-cols-5 items-center hover:bg-dark-500 transition-colors cursor-pointer border-b border-dark-400/50 group',
                      selected?.id === c.id && 'bg-dark-500 border-l-2 border-brand-orange'
                    )}
                  >
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-orange/20 to-brand-blue/20 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white group-hover:text-brand-orange transition-colors">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.phone ?? '—'}</p>
                      </div>
                    </div>
                    <span className={clsx('badge text-xs w-fit', ch?.bg, ch?.text)}>{ch?.label}</span>
                    <div className="flex items-center gap-1.5">
                      <div className={clsx(
                        'w-1.5 h-1.5 rounded-full',
                        c.status === 'active' ? 'bg-brand-green' :
                        c.status === 'pending' ? 'bg-brand-yellow' : 'bg-slate-500'
                      )} />
                      <span className="text-xs text-slate-400">
                        {c.status === 'active' ? 'Ativo' : c.status === 'pending' ? 'Pendente' : 'Fechado'}
                      </span>
                    </div>
                    <span className={clsx('badge text-xs w-fit', tagColors[c.tag] || 'bg-slate-500/15 text-slate-400')}>
                      {c.tag}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selected ? (
          <div className="w-80 glass rounded-2xl p-5 flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Detalhes</span>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-dark-500 rounded-lg transition-colors">
                <ChevronRight size={15} className="text-slate-400" />
              </button>
            </div>

            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-blue flex items-center justify-center text-2xl font-bold text-white mx-auto mb-3">
                {initials(selected.name)}
              </div>
              <h3 className="font-display font-bold text-white text-lg">{selected.name}</h3>
              <span className={clsx('badge mt-2', tagColors[selected.tag] || 'bg-slate-500/15 text-slate-400')}>
                {selected.tag}
              </span>
            </div>

            <div className="space-y-3 mb-5">
              {selected.phone && (
                <div className="glass rounded-xl p-3 flex items-center gap-3">
                  <Phone size={14} className="text-brand-orange" />
                  <span className="text-sm text-slate-300">{selected.phone}</span>
                </div>
              )}
              <div className="glass rounded-xl p-3 flex items-center gap-3">
                <MessageCircle size={14} className="text-brand-blue" />
                <span className="text-sm text-slate-300">
                  {channelMeta[selected.channel]?.label ?? selected.channel}
                </span>
              </div>
              {selected.last_message && (
                <div className="glass rounded-xl p-3 flex items-center gap-3">
                  <Mail size={14} className="text-brand-green" />
                  <span className="text-sm text-slate-400 truncate">{selected.last_message}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 mb-3">
              {selected.created_at
                ? `Adicionado em ${new Date(selected.created_at).toLocaleDateString('pt-BR')}`
                : selected.lastMessage ?? ''}
            </p>

            <div className="mt-auto space-y-2">
              <button
                onClick={() => navigate('/chat', { state: { contact: selected } })}
                className="btn-primary w-full justify-center"
              >
                <MessageCircle size={14} /> Enviar Mensagem
              </button>
              {selected.phone && (
                <a
                  href={`tel:${selected.phone.replace(/\D/g, '')}`}
                  className="btn-secondary w-full justify-center"
                >
                  <Phone size={14} /> Ligar
                </a>
              )}
              {!isDemoMode && (
                <button
                  onClick={() => handleDelete(selected.id)}
                  disabled={deleting === selected.id}
                  className="btn-secondary w-full justify-center text-brand-red border-brand-red/30 hover:bg-brand-red/10 disabled:opacity-50"
                >
                  {deleting === selected.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />
                  }
                  Remover cliente
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-80 glass rounded-2xl flex items-center justify-center text-center p-6">
            <div>
              <Users className="mx-auto mb-3 text-slate-500" size={32} />
              <p className="text-slate-400 text-sm">Selecione um cliente para ver os detalhes</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
