// Página de funis (/flows-novo): lista os funis do usuário em cards e abre o editor.
import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, Workflow, Circle } from 'lucide-react'
import { flowsService } from '@services/flowsService'
import FlowEditor from './FlowEditor'

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '—' }
}

/* ── Card de um funil ── */
function FlowCard({ flow, onEdit, onDelete }) {
  const active = flow.status === 'active'
  const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0
  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-3 hover:border-brand-orange/40 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow size={16} className="text-brand-orange flex-shrink-0" />
          <p className="font-semibold text-white text-sm truncate">{flow.name}</p>
        </div>
        <span className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
          active ? 'bg-green-500/15 text-green-400' : 'bg-dark-600 text-slate-400'}`}>
          <Circle size={7} fill="currentColor" /> {active ? 'Ativo' : 'Pausado'}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span>{nodeCount} {nodeCount === 1 ? 'nó' : 'nós'}</span>
        <span>·</span>
        <span>Criado em {fmtDate(flow.created_at)}</span>
      </div>

      <div className="flex gap-2 mt-1">
        <button onClick={() => onEdit(flow.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 glass rounded-lg text-xs text-slate-300 hover:text-white transition-all">
          <Pencil size={12} /> Editar
        </button>
        <button onClick={() => onDelete(flow)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

/* ── Lista de funis ── */
function FlowsList({ onNew, onEdit }) {
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    flowsService.getFlows()
      .then((data) => { setFlows(data); setError('') })
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (flow) => {
    if (!window.confirm(`Excluir o funil "${flow.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await flowsService.deleteFlow(flow.id)
      setFlows((prev) => prev.filter((f) => f.id !== flow.id))
    } catch (e) {
      window.alert('Erro ao excluir:\n' + (e?.message ?? e))
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-white text-xl">Funis</h1>
            <p className="text-xs text-slate-500 mt-0.5">Automatize conversas com gatilhos e ações</p>
          </div>
          <button onClick={onNew} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Novo Funil
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="text-brand-orange animate-spin" />
          </div>
        ) : error ? (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-sm text-red-400 mb-1">Erro ao carregar funis</p>
            <p className="text-xs text-slate-500 whitespace-pre-wrap">{error}</p>
            <button onClick={load} className="mt-3 btn-primary text-xs">Tentar de novo</button>
          </div>
        ) : flows.length === 0 ? (
          <div className="glass rounded-2xl px-10 py-16 text-center max-w-md mx-auto">
            <div className="flex justify-center mb-3"><Workflow size={40} className="text-brand-orange" /></div>
            <p className="font-display font-bold text-white text-sm mb-1">Nenhum funil ainda</p>
            <p className="text-slate-500 text-xs leading-relaxed mb-4">
              Crie seu primeiro funil para automatizar o atendimento no WhatsApp
            </p>
            <button onClick={onNew} className="btn-primary text-xs mx-auto"><Plus size={13} /> Criar funil</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {flows.map((flow) => (
              <FlowCard key={flow.id} flow={flow} onEdit={onEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Orquestração: alterna entre lista e editor ── */
export default function Flows() {
  const [view, setView] = useState('list')   // 'list' | 'editor'
  const [editingId, setEditingId] = useState(null)

  const openNew = () => { setEditingId(null); setView('editor') }
  const openEdit = (id) => { setEditingId(id); setView('editor') }
  const backToList = () => { setView('list'); setEditingId(null) }

  if (view === 'editor') {
    // key força remontagem (e recarga) ao trocar de funil.
    return <FlowEditor key={editingId ?? 'new'} flowId={editingId} onBack={backToList} />
  }
  return <FlowsList onNew={openNew} onEdit={openEdit} />
}
