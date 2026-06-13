import React, { useState } from 'react'
import { X, GitBranch, MessageCircle, Instagram, Facebook, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  { value: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/30' },
  { value: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
]

export const NewFlowModal = ({ onClose, onCreated }) => {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Digite um nome para o fluxo'); return }
    setLoading(true)
    setError('')
    try {
      const { error: sbError } = await supabase.from('flows').insert({
        user_id: user.id,
        name: name.trim(),
        channel,
        welcome_message: welcomeMessage.trim() || null,
        status: 'active',
        triggers: 0,
        conversions: 0,
      })
      if (sbError) throw sbError
      onCreated()
    } catch (err) {
      setError(err.message || 'Erro ao criar fluxo. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md glass rounded-2xl border border-dark-300 shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-dark-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center">
              <GitBranch size={17} className="text-brand-orange" />
            </div>
            <div>
              <h2 className="font-display font-bold text-white text-base">Novo Fluxo</h2>
              <p className="text-xs text-slate-500">Crie um fluxo de automação</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-dark-500 text-slate-400 hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-brand-red/10 border border-brand-red/30 text-brand-red text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-2">Nome do fluxo *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
              placeholder="Ex: Boas-vindas WhatsApp"
              autoFocus
              maxLength={80}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-3">Canal *</label>
            <div className="grid grid-cols-3 gap-3">
              {CHANNELS.map(ch => {
                const Icon = ch.icon
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setChannel(ch.value)}
                    className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all ${
                      channel === ch.value
                        ? ch.bg + ' ' + ch.color
                        : 'glass text-slate-500 hover:text-slate-300 border-dark-400'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-medium">{ch.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">
              Mensagem de boas-vindas
              <span className="text-slate-600 ml-1">(opcional)</span>
            </label>
            <textarea
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              className="input-field resize-none"
              placeholder="Olá! Seja bem-vindo. Como posso te ajudar?"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-slate-600 mt-1 text-right">{welcomeMessage.length}/500</p>
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 justify-center"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary flex-1 justify-center disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={15} />}
              {loading ? 'Criando...' : 'Criar Fluxo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
