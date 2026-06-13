import React, { useState, useEffect, useCallback } from 'react'
import { Layout } from '@components/Layout/Layout'
import { Plus, Play, Pause, Trash2, GitBranch, Loader2, Zap, Hand, Target, RefreshCw, LifeBuoy, ShoppingCart, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { useApp } from '@context/AppContext'
import { MOCK_FLOWS } from '@constants/config'
import clsx from 'clsx'

const templates = [
  { id: 1, name: 'Boas-vindas', Icon: Hand, desc: 'Mensagem automática para novos contatos', category: 'Engajamento' },
  { id: 2, name: 'Qualificação de Lead', Icon: Target, desc: 'Perguntas para qualificar potenciais clientes', category: 'Vendas' },
  { id: 3, name: 'Follow-up Automático', Icon: RefreshCw, desc: 'Acompanhe contatos sem resposta', category: 'Relacionamento' },
  { id: 4, name: 'Suporte 24/7', Icon: LifeBuoy, desc: 'Respostas automáticas fora do horário', category: 'Suporte' },
  { id: 5, name: 'Carrinho Abandonado', Icon: ShoppingCart, desc: 'Recupere vendas perdidas automaticamente', category: 'E-commerce' },
  { id: 6, name: 'Pesquisa de Satisfação', Icon: Star, desc: 'Colete feedback dos seus clientes', category: 'Pós-venda' },
]

const EmptyFlows = ({ onNew, isDemoMode }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
    <div className="w-16 h-16 rounded-2xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center">
      <GitBranch size={28} className="text-brand-orange" />
    </div>
    <div>
      <h3 className="font-display font-semibold text-white mb-2">Nenhum fluxo criado</h3>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
        Crie seu primeiro fluxo de automação para começar a responder mensagens automaticamente.
      </p>
    </div>
    {!isDemoMode && (
      <button onClick={onNew} className="btn-primary">
        <Plus size={15} /> Criar primeiro fluxo
      </button>
    )}
  </div>
)

export const Automation = () => {
  const { user, isDemoMode } = useAuth()
  const { setNewFlowModalOpen, flowsVersion } = useApp()
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const fetchFlows = useCallback(async () => {
    if (isDemoMode) {
      setFlows(MOCK_FLOWS.map(f => ({ ...f })))
      setLoading(false)
      return
    }
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('flows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!error) setFlows(data ?? [])
    setLoading(false)
  }, [user, isDemoMode, flowsVersion])

  useEffect(() => { fetchFlows() }, [fetchFlows])

  const toggleFlow = async (flow) => {
    if (isDemoMode) {
      setFlows(prev => prev.map(f =>
        f.id === flow.id ? { ...f, status: f.status === 'active' ? 'paused' : 'active' } : f
      ))
      return
    }
    setTogglingId(flow.id)
    const newStatus = flow.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('flows').update({ status: newStatus }).eq('id', flow.id)
    if (!error) setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, status: newStatus } : f))
    setTogglingId(null)
  }

  const deleteFlow = async (flowId) => {
    if (isDemoMode) return
    setDeletingId(flowId)
    const { error } = await supabase.from('flows').delete().eq('id', flowId)
    if (!error) setFlows(prev => prev.filter(f => f.id !== flowId))
    setDeletingId(null)
  }

  const openNew = () => { if (!isDemoMode) setNewFlowModalOpen(true) }

  return (
    <Layout title="Automação" subtitle="Gerencie seus fluxos automáticos">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flows List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-white">Meus Fluxos</h2>
            <button
              onClick={openNew}
              className={clsx('btn-primary', isDemoMode && 'opacity-50 cursor-not-allowed')}
              title={isDemoMode ? 'Indisponível no modo demo' : ''}
            >
              <Plus size={14} />Novo Fluxo
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={24} className="text-brand-orange animate-spin" />
            </div>
          ) : flows.length === 0 ? (
            <div className="glass rounded-2xl">
              <EmptyFlows onNew={openNew} isDemoMode={isDemoMode} />
            </div>
          ) : (
            flows.map(flow => {
              const rate = flow.triggers > 0
                ? ((flow.conversions / flow.triggers) * 100).toFixed(1)
                : '0.0'
              return (
                <div key={flow.id} className="glass rounded-2xl p-5 hover:border-white/15 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        flow.status === 'active' ? 'bg-brand-green/15' : 'bg-slate-500/15'
                      )}>
                        <GitBranch size={18} className={flow.status === 'active' ? 'text-brand-green' : 'text-slate-400'} />
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-white">{flow.name}</h3>
                        <span className={clsx(
                          'text-xs capitalize',
                          flow.channel === 'whatsapp' ? 'text-green-400' :
                          flow.channel === 'instagram' ? 'text-pink-400' : 'text-blue-400'
                        )}>
                          {flow.channel.charAt(0).toUpperCase() + flow.channel.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleFlow(flow)}
                        disabled={togglingId === flow.id}
                        className={clsx(
                          'p-2 rounded-xl transition-colors disabled:opacity-50',
                          flow.status === 'active'
                            ? 'bg-brand-yellow/15 hover:bg-brand-yellow/25'
                            : 'bg-brand-green/15 hover:bg-brand-green/25'
                        )}
                        title={flow.status === 'active' ? 'Pausar fluxo' : 'Ativar fluxo'}
                      >
                        {togglingId === flow.id
                          ? <Loader2 size={13} className="animate-spin text-slate-400" />
                          : flow.status === 'active'
                            ? <Pause size={13} className="text-brand-yellow" />
                            : <Play size={13} className="text-brand-green" />
                        }
                      </button>
                      {!isDemoMode && (
                        <button
                          onClick={() => deleteFlow(flow.id)}
                          disabled={deletingId === flow.id}
                          className="p-2 glass rounded-xl hover:border-brand-red/30 transition-colors disabled:opacity-50"
                          title="Excluir fluxo"
                        >
                          {deletingId === flow.id
                            ? <Loader2 size={13} className="animate-spin text-slate-400" />
                            : <Trash2 size={13} className="text-slate-400 hover:text-brand-red" />
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="glass rounded-xl p-3 text-center">
                      <p className="text-lg font-display font-bold text-white">
                        {(flow.triggers ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-400">Acionamentos</p>
                    </div>
                    <div className="glass rounded-xl p-3 text-center">
                      <p className="text-lg font-display font-bold text-white">
                        {(flow.conversions ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-400">Conversões</p>
                    </div>
                    <div className="glass rounded-xl p-3 text-center">
                      <p className={clsx(
                        'text-lg font-display font-bold',
                        parseFloat(rate) > 60 ? 'text-brand-green' :
                        parseFloat(rate) > 0 ? 'text-brand-yellow' : 'text-slate-400'
                      )}>
                        {rate}%
                      </p>
                      <p className="text-xs text-slate-400">Taxa Conv.</p>
                    </div>
                  </div>

                  <div className="h-1.5 bg-dark-400 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-700',
                        parseFloat(rate) > 60
                          ? 'bg-gradient-to-r from-brand-orange to-brand-green'
                          : 'bg-brand-yellow'
                      )}
                      style={{ width: `${Math.min(parseFloat(rate), 100)}%` }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Templates */}
        <div>
          <h2 className="font-display font-semibold text-white mb-4">Templates Prontos</h2>
          <div className="space-y-3">
            {templates.map(t => (
              <div
                key={t.id}
                onClick={openNew}
                className={clsx(
                  'glass rounded-xl p-4 hover:border-brand-orange/30 transition-all group',
                  isDemoMode ? 'cursor-default opacity-60' : 'cursor-pointer'
                )}
              >
                <div className="flex items-start gap-3">
                  <t.Icon size={20} className="text-brand-orange" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white group-hover:text-brand-orange transition-colors">{t.name}</h4>
                      <span className="text-[10px] text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-full">
                        {t.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
