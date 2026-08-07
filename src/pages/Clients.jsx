import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@components/Layout/Layout'
import {
  Search, Plus, MessageCircle, Phone, Mail, Tag,
  Trash2, Users, Loader2, X, ChevronRight, Pencil, Download,
  CheckSquare, Square, FileDown, AlertTriangle, UserX
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { api } from '@services/api'
import { socket } from '@services/socket'
import { useAuth } from '@context/AuthContext'
import { logger } from '@services/activityLogger'
import { MOCK_CLIENTS } from '@constants/config'
import clsx from 'clsx'

const LEAD_STATUS_OPTIONS = ['Prospect', 'Lead Quente', 'Cliente', 'VIP', 'Inativo']
const CHANNEL_OPTIONS = ['whatsapp', 'instagram', 'facebook', 'telegram', 'email', 'indicação']

const tagColors = {
  'Lead Quente': 'bg-brand-orange/15 text-brand-orange',
  'Prospect': 'bg-brand-blue/15 text-brand-blue',
  'Cliente': 'bg-brand-green/15 text-brand-green',
  'Inativo': 'bg-slate-500/15 text-slate-400',
  'VIP': 'bg-yellow-500/15 text-yellow-400',
}

const channelMeta = {
  whatsapp:   { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'WhatsApp' },
  instagram:  { bg: 'bg-pink-500/10',   text: 'text-pink-400',   label: 'Instagram' },
  facebook:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Facebook' },
  telegram:   { bg: 'bg-sky-500/10',    text: 'text-sky-400',    label: 'Telegram' },
  email:      { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'E-mail' },
  'indicação':{ bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Indicação' },
}

const initials = (name = '') =>
  name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?'

// ── Client Form Modal ─────────────────────────────────────────────────────────
const ClientFormModal = ({ userId, initial, onClose, onSaved }) => {
  const isEdit = !!initial
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    tag: initial?.tag ?? 'Prospect',
    channel: initial?.channel ?? 'whatsapp',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setLoading(true)
    setError('')
    try {
      const row = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tag: form.tag,
        channel: form.channel,
        status: 'active',
      }
      if (isEdit) {
        const { error: sbErr } = await supabase.from('clients').update(row).eq('id', initial.id)
        if (sbErr) throw sbErr
      } else {
        const { error: sbErr } = await supabase.from('clients').insert({ ...row, user_id: userId })
        if (sbErr) throw sbErr
      }
      onSaved()
    } catch (err) {
      setError(err.message || 'Erro ao salvar cliente')
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
      <div className="w-full max-w-lg glass rounded-2xl border border-dark-300 shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-dark-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center">
              <Users size={17} className="text-brand-orange" />
            </div>
            <div>
              <h2 className="font-display font-bold text-white text-base">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <p className="text-xs text-slate-500">{isEdit ? 'Atualize as informações' : 'Preencha os dados do lead'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-dark-500 text-slate-400 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Nome completo *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="input-field"
              placeholder="Ex: João da Silva"
              autoFocus
            />
          </div>

          {/* Telefone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Telefone</label>
              <input
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="input-field"
                placeholder="+55 11 99999-9999"
                type="tel"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">E-mail</label>
              <input
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className="input-field"
                placeholder="contato@email.com"
                type="email"
              />
            </div>
          </div>

          {/* Status do Lead */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Status do Lead</label>
            <div className="grid grid-cols-5 gap-2">
              {LEAD_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('tag', opt)}
                  className={clsx(
                    'py-2 px-1 rounded-xl border text-xs font-medium transition-all text-center',
                    form.tag === opt
                      ? clsx(tagColors[opt] || 'bg-brand-orange/15 text-brand-orange', 'border-transparent')
                      : 'glass text-slate-500 border-dark-400 hover:text-slate-300'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Canal */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Canal de origem</label>
            <div className="grid grid-cols-3 gap-2">
              {CHANNEL_OPTIONS.map(ch => {
                const meta = channelMeta[ch]
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => set('channel', ch)}
                    className={clsx(
                      'py-2 px-2 rounded-xl border text-xs font-medium transition-all',
                      form.channel === ch
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

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center" disabled={loading}>
              Cancelar
            </button>
            <button type="submit" disabled={loading || !form.name.trim()} className="btn-primary flex-1 justify-center disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Adicionar cliente'}
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
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)

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

  // Tempo real: novo lead do Meta Lead Ads → atualiza a lista + avisa.
  useEffect(() => {
    if (isDemoMode) return
    const onNewLead = (lead) => {
      fetchClients()
      setImportResult({ ok: true, msg: `Novo lead${lead?.niche ? ` · ${lead.niche}` : ''}: ${lead?.name || 'recebido'} 🎯` })
      setTimeout(() => setImportResult(null), 6000)
    }
    socket.on('new_lead', onNewLead)
    return () => socket.off('new_lead', onNewLead)
  }, [fetchClients, isDemoMode])

  const handleDelete = async (clientId) => {
    if (isDemoMode) return
    setDeleting(clientId)
    await supabase.from('clients').delete().eq('id', clientId)
    logger.log(user?.id, 'contact_deleted', { category: 'contacts', description: 'Contato excluído: ' + (clients.find(c => c.id === clientId)?.name || clientId) })
    setClients(prev => prev.filter(c => c.id !== clientId))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(clientId); return n })
    if (selected?.id === clientId) setSelected(null)
    setDeleting(null)
  }

  // ── Seleção múltipla ──────────────────────────────────────────────────────
  const toggleOne = (id) => setSelectedIds(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const clearSelection = () => setSelectedIds(new Set())

  // ── Excluir em massa ──────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (isDemoMode || selectedIds.size === 0) return
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const { error } = await supabase.from('clients').delete().in('id', ids).eq('user_id', user.id)
    if (!error) {
      logger.log(user?.id, 'contacts_bulk_deleted', { category: 'contacts', description: `${ids.length} contato(s) excluído(s) em massa` })
      const idSet = new Set(ids)
      setClients(prev => prev.filter(c => !idSet.has(c.id)))
      if (selected && idSet.has(selected.id)) setSelected(null)
      clearSelection()
    }
    setBulkDeleting(false)
    setConfirmBulk(false)
  }

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const exportCsv = (rows) => {
    if (!rows.length) return
    const cols = ['name', 'phone', 'email', 'channel', 'tag', 'status', 'created_at']
    const header = ['Nome', 'Telefone', 'Email', 'Canal', 'Tag', 'Status', 'Criado em']
    const esc = (v) => {
      const s = v == null ? '' : String(v)
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [header.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))]
    const csv = '﻿' + lines.join('\r\n') // BOM p/ acentos no Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes-riseflow-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleImportWhatsApp = async () => {
    if (isDemoMode || importing) return
    setImporting(true)
    setImportResult(null)
    try {
      // 1. Busca contatos do WA server via backend (requer JWT — api interceptor adiciona)
      const { data: waContacts } = await api.get('/contacts')
      if (!waContacts.length) {
        setImportResult({ ok: false, msg: 'Nenhum contato disponível no WhatsApp ainda.' })
        return
      }
      // 2. Insere na tabela clients (sem duplicatas por phone)
      const { data: existing } = await supabase.from('clients').select('phone').eq('user_id', user.id)
      const existingPhones = new Set((existing || []).map(c => c.phone).filter(Boolean))
      const toInsert = waContacts
        .filter(c => c.name && c.phone && !existingPhones.has(c.phone))
        .map(c => ({ name: c.name, phone: c.phone, channel: 'whatsapp', tag: 'Prospect', status: 'active', user_id: user.id }))
      if (!toInsert.length) {
        setImportResult({ ok: true, msg: `${waContacts.length} contatos já estão importados.` })
      } else {
        const { error } = await supabase.from('clients').insert(toInsert)
        if (error) throw error
        setImportResult({ ok: true, msg: `${toInsert.length} contato${toInsert.length !== 1 ? 's' : ''} importado${toInsert.length !== 1 ? 's' : ''} do WhatsApp!` })
        fetchClients()
      }
    } catch (e) {
      setImportResult({ ok: false, msg: e.message })
    } finally {
      setImporting(false)
    }
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  )

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
  const toggleAll = () => setSelectedIds(prev => {
    const n = new Set(prev)
    if (allFilteredSelected) filtered.forEach(c => n.delete(c.id))
    else filtered.forEach(c => n.add(c.id))
    return n
  })
  const selectedClients = clients.filter(c => selectedIds.has(c.id))

  // "Sem nome": o nome não tem nenhuma letra (só número/símbolos) — típico de
  // contato importado do WhatsApp que ainda não recebeu nome via contacts.update.
  const isUnnamed = (c) => !/\p{L}/u.test(c.name || '')
  const unnamedFiltered = filtered.filter(isUnnamed)
  const selectUnnamed = () => setSelectedIds(prev => {
    const n = new Set(prev)
    unnamedFiltered.forEach(c => n.add(c.id))
    return n
  })

  return (
    <Layout
      title="Clientes CRM"
      subtitle={`${clients.length} cliente${clients.length !== 1 ? 's' : ''} cadastrado${clients.length !== 1 ? 's' : ''}`}
    >
      {formOpen && !isDemoMode && (
        <ClientFormModal
          userId={user?.id}
          initial={editTarget}
          onClose={() => { setFormOpen(false); setEditTarget(null) }}
          onSaved={() => { setFormOpen(false); setEditTarget(null); fetchClients() }}
        />
      )}

      {/* Confirmação de exclusão em massa */}
      {confirmBulk && !isDemoMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && !bulkDeleting && setConfirmBulk(false)}
        >
          <div className="w-full max-w-sm glass rounded-2xl border border-dark-300 shadow-2xl animate-slide-up p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-white text-base">Excluir {selectedIds.size} cliente{selectedIds.size !== 1 ? 's' : ''}?</h3>
                <p className="text-xs text-slate-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulk(false)} disabled={bulkDeleting} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 justify-center flex items-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {bulkDeleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
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
            {!isDemoMode && unnamedFiltered.length > 0 && (
              <button
                onClick={selectUnnamed}
                className="btn-secondary flex items-center gap-1.5"
                title="Selecionar contatos sem nome (só número) — importados do WhatsApp"
              >
                <UserX size={14} />
                Sem nome ({unnamedFiltered.length})
              </button>
            )}
            <button
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              className={clsx('btn-secondary flex items-center gap-1.5', filtered.length === 0 && 'opacity-50 cursor-not-allowed')}
              title="Exportar clientes (CSV)"
            >
              <FileDown size={14} />
              Exportar
            </button>
            <button
              onClick={handleImportWhatsApp}
              disabled={isDemoMode || importing}
              className={clsx('btn-secondary flex items-center gap-1.5', (isDemoMode || importing) && 'opacity-50 cursor-not-allowed')}
              title="Importar contatos do WhatsApp"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {importing ? 'Importando...' : 'WhatsApp'}
            </button>
            <button
              onClick={() => { if (!isDemoMode) { setEditTarget(null); setFormOpen(true) } }}
              className={clsx('btn-primary', isDemoMode && 'opacity-50 cursor-not-allowed')}
              title={isDemoMode ? 'Indisponível no modo demo' : 'Adicionar cliente'}
            >
              <Plus size={14} />Novo
            </button>
            {importResult && (
              <div className={clsx('text-xs px-2 py-1 rounded', importResult.ok ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10')}>
                {importResult.msg}
              </div>
            )}
          </div>

          {/* Barra de ações em massa */}
          {selectedIds.size > 0 && !isDemoMode && (
            <div className="px-4 py-2.5 flex items-center gap-3 bg-brand-orange/10 border-b border-brand-orange/20 animate-fade-in">
              <span className="text-sm font-semibold text-brand-orange">
                {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => exportCsv(selectedClients)}
                className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
              >
                <FileDown size={13} /> Exportar
              </button>
              <button
                onClick={() => setConfirmBulk(true)}
                className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
              >
                <Trash2 size={13} /> Excluir
              </button>
              <button
                onClick={clearSelection}
                className="p-1.5 rounded-lg hover:bg-dark-500 text-slate-400 hover:text-white transition-colors"
                title="Limpar seleção"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Table Header */}
          <div className="px-4 py-2 grid grid-cols-5 text-xs text-slate-500 uppercase tracking-wider border-b border-dark-400">
            <span className="col-span-2 flex items-center gap-3">
              {!isDemoMode && (
                <button
                  onClick={toggleAll}
                  className="text-slate-400 hover:text-brand-orange transition-colors"
                  title={allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                >
                  {allFilteredSelected ? <CheckSquare size={16} className="text-brand-orange" /> : <Square size={16} />}
                </button>
              )}
              Cliente
            </span>
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
                  <button onClick={() => { setEditTarget(null); setFormOpen(true) }} className="text-xs text-brand-orange hover:underline">
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
                      selected?.id === c.id && 'bg-dark-500 border-l-2 border-brand-orange',
                      selectedIds.has(c.id) && 'bg-brand-orange/5'
                    )}
                  >
                    <div className="col-span-2 flex items-center gap-3">
                      {!isDemoMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleOne(c.id) }}
                          className="text-slate-500 hover:text-brand-orange transition-colors flex-shrink-0"
                          title={selectedIds.has(c.id) ? 'Desmarcar' : 'Selecionar'}
                        >
                          {selectedIds.has(c.id)
                            ? <CheckSquare size={16} className="text-brand-orange" />
                            : <Square size={16} />}
                        </button>
                      )}
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
                {selected.tag ?? '—'}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              {selected.phone && (
                <div className="glass rounded-xl p-3 flex items-center gap-3">
                  <Phone size={14} className="text-brand-orange flex-shrink-0" />
                  <span className="text-sm text-slate-300 truncate">{selected.phone}</span>
                </div>
              )}
              {selected.email && (
                <div className="glass rounded-xl p-3 flex items-center gap-3">
                  <Mail size={14} className="text-purple-400 flex-shrink-0" />
                  <span className="text-sm text-slate-300 truncate">{selected.email}</span>
                </div>
              )}
              <div className="glass rounded-xl p-3 flex items-center gap-3">
                <MessageCircle size={14} className="text-brand-blue flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Canal de origem</p>
                  <p className="text-sm text-slate-300">{channelMeta[selected.channel]?.label ?? selected.channel ?? '—'}</p>
                </div>
              </div>
              <div className="glass rounded-xl p-3 flex items-center gap-3">
                <Tag size={14} className="text-brand-green flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Status do lead</p>
                  <p className="text-sm text-slate-300">{selected.tag ?? '—'}</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              {selected.created_at
                ? `Adicionado em ${new Date(selected.created_at).toLocaleDateString('pt-BR')}`
                : ''}
            </p>

            <div className="mt-auto space-y-2">
              <button
                onClick={() => navigate('/chat', { state: { contact: selected } })}
                className="btn-primary w-full justify-center"
              >
                <MessageCircle size={14} /> Enviar Mensagem
              </button>
              {!isDemoMode && (
                <button
                  onClick={() => { setEditTarget(selected); setFormOpen(true) }}
                  className="btn-secondary w-full justify-center"
                >
                  <Pencil size={14} /> Editar informações
                </button>
              )}
              {selected.phone && (
                <a
                  href={`https://wa.me/${selected.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full justify-center"
                >
                  <Phone size={14} /> Abrir no WhatsApp
                </a>
              )}
              {!isDemoMode && (
                <button
                  onClick={() => handleDelete(selected.id)}
                  disabled={deleting === selected.id}
                  className="btn-secondary w-full justify-center text-red-400 border-red-500/30 hover:bg-red-500/10 disabled:opacity-50"
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
