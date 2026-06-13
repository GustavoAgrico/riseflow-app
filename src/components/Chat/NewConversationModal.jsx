import React, { useState } from 'react'
import { X, Loader2, MessageCircle, Instagram, Facebook, Send } from 'lucide-react'

const CHANNELS = [
  { id: 'whatsapp',  label: 'WhatsApp',  Icon: MessageCircle },
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook',  label: 'Facebook',  Icon: Facebook },
  { id: 'telegram',  label: 'Telegram',  Icon: Send },
]

export const NewConversationModal = ({ onClose, onCreate }) => {
  const [name, setName]               = useState('')
  const [phone, setPhone]             = useState('')
  const [channel, setChannel]         = useState('whatsapp')
  const [firstMessage, setFirstMessage] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  const handleCreate = async () => {
    if (!name.trim())  { setError('Informe o nome do contato'); return }
    const clean = phone.replace(/\D/g, '')
    if (clean.length < 10) { setError('Telefone inválido — inclua código do país + DDD'); return }
    setLoading(true)
    setError('')
    try {
      await onCreate({
        contactName: name.trim(),
        contactPhone: clean,
        contactChannel: channel,
        initialMessage: firstMessage.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message ?? 'Erro ao criar conversa')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="glass rounded-2xl p-6 w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-orange/15 flex items-center justify-center"><MessageCircle size={18} className="text-brand-orange" /></div>
            <h3 className="font-display font-bold text-brand-orange">Nova Conversa</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Channel selector */}
        <p className="text-xs text-slate-500 mb-2">Canal de comunicação</p>
        <div className="flex gap-2 mb-5">
          {CHANNELS.map(c => (
            <button
              key={c.id}
              onClick={() => setChannel(c.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all border ${
                channel === c.id
                  ? 'text-white border-brand-orange/50 bg-brand-orange/15'
                  : 'text-slate-400 border-transparent glass hover:text-white'
              }`}
            >
              <c.Icon size={16} />
              <span className="hidden sm:inline">{c.label}</span>
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Nome do contato</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: João Silva"
              className="input-field w-full text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Telefone <span className="text-slate-600">(com código do país + DDD)</span>
            </label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="5511999999999"
              className="input-field w-full text-sm font-mono"
            />
            <p className="text-[10px] text-slate-600 mt-1">Ex: 55 (Brasil) + 11 (SP) + número</p>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Mensagem inicial <span className="text-slate-600">(opcional)</span>
            </label>
            <textarea
              value={firstMessage}
              onChange={e => setFirstMessage(e.target.value)}
              placeholder="Olá! Como posso ajudar?"
              rows={2}
              className="input-field w-full text-sm resize-none"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-3 px-1">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 glass rounded-xl text-sm text-slate-300 hover:text-white transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Criando...' : 'Iniciar conversa'}
          </button>
        </div>
      </div>
    </div>
  )
}
