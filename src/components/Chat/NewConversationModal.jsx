import React, { useState } from 'react'
import { X, Loader2, MessageCircle, Instagram, Facebook, Send } from 'lucide-react'

// Cada canal define o rótulo/placeholder do identificador, o prefixo que o
// backend usa para rotear (channelOf) e a validação mínima. O identificador
// final é `prefix + dígitos` — é ele que faz o envio ir pra Evolution (WA),
// Meta (fb/ig) ou grammY (tg). Sem o prefixo, tudo cai no WhatsApp.
const CHANNELS = [
  {
    id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, prefix: '', minDigits: 10,
    idLabel: 'Telefone', idHint: '(com código do país + DDD)',
    placeholder: '5511999999999',
    help: 'Ex: 55 (Brasil) + 11 (SP) + número',
  },
  {
    id: 'instagram', label: 'Instagram', Icon: Instagram, prefix: 'ig', minDigits: 5,
    idLabel: 'ID do Instagram', idHint: '(IGSID numérico)',
    placeholder: '17841400000000000',
    help: 'Instagram-scoped ID do contato. Só é possível responder dentro da janela de 24h após ele te escrever.',
  },
  {
    id: 'facebook', label: 'Facebook', Icon: Facebook, prefix: 'fb', minDigits: 5,
    idLabel: 'PSID do Facebook', idHint: '(Page-scoped ID)',
    placeholder: '6240000000000000',
    help: 'Page-scoped ID do contato na sua página. Só é possível responder dentro da janela de 24h após ele te escrever.',
  },
  {
    id: 'telegram', label: 'Telegram', Icon: Send, prefix: 'tg', minDigits: 5,
    idLabel: 'Chat ID', idHint: '(numérico)',
    placeholder: '123456789',
    help: 'Chat ID numérico do contato. O bot só consegue iniciar depois que o contato já interagiu com ele.',
  },
]

export const NewConversationModal = ({ onClose, onCreate, onGoToIntegrations, availableChannels, initialName = '', initialPhone = '' }) => {
  // Um canal está disponível se conectado em Integrações. Sem a prop, libera
  // todos (compat.). Só é possível iniciar conversa por canais conectados —
  // caso contrário o envio falharia silenciosamente no backend.
  const isAvail = (id) => !availableChannels || availableChannels.includes(id)
  const firstAvail = CHANNELS.find(c => isAvail(c.id))?.id ?? 'whatsapp'

  const [name, setName]               = useState(initialName)
  const [phone, setPhone]             = useState(initialPhone)
  const [channel, setChannel]         = useState(firstAvail)
  const [firstMessage, setFirstMessage] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  const cfg = CHANNELS.find(c => c.id === channel) ?? CHANNELS[0]
  const channelAvail = isAvail(channel)

  const handleCreate = async () => {
    if (!channelAvail) {
      setError(`${cfg.label} não está conectado. Conecte em Integrações para usar este canal.`)
      return
    }
    if (!name.trim())  { setError('Informe o nome do contato'); return }
    // Telegram aceita chat_id negativo (grupos); os demais são só dígitos.
    const neg = channel === 'telegram' && phone.trim().startsWith('-')
    const digits = phone.replace(/\D/g, '')
    if (digits.length < cfg.minDigits) {
      setError(`${cfg.idLabel} inválido — informe um valor válido`)
      return
    }
    // Identificador roteável: prefixo do canal + dígitos (channelOf no backend).
    const identifier = cfg.prefix + (neg ? '-' : '') + digits
    setLoading(true)
    setError('')
    try {
      await onCreate({
        contactName: name.trim(),
        contactPhone: identifier,
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
      <div className="glass-solid rounded-2xl p-6 w-full max-w-md animate-fade-in">

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

        {/* Channel selector — só canais conectados são selecionáveis */}
        <p className="text-xs text-slate-500 mb-2">Canal de comunicação</p>
        <div className="flex gap-2 mb-3">
          {CHANNELS.map(c => {
            const avail = isAvail(c.id)
            return (
              <button
                key={c.id}
                onClick={() => { if (!avail) return; setChannel(c.id); setPhone(''); setError('') }}
                disabled={!avail}
                title={avail ? c.label : `${c.label} não conectado — conecte em Integrações`}
                className={`flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all border ${
                  channel === c.id
                    ? 'text-white border-brand-orange/50 bg-brand-orange/15'
                    : avail
                      ? 'text-slate-400 border-transparent glass hover:text-white'
                      : 'text-slate-600 border-transparent glass opacity-40 cursor-not-allowed'
                }`}
              >
                <c.Icon size={16} />
                <span className="hidden sm:inline">{c.label}</span>
              </button>
            )
          })}
        </div>

        {/* Aviso quando o canal selecionado não está conectado */}
        {!channelAvail && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs text-amber-300">
              {cfg.label} não está conectado. Conecte-o em Integrações para iniciar conversas por este canal.
            </p>
            {onGoToIntegrations && (
              <button
                onClick={onGoToIntegrations}
                className="mt-2 text-xs font-medium text-brand-orange hover:underline"
              >
                Ir para Integrações →
              </button>
            )}
          </div>
        )}
        {channelAvail && <div className="mb-2" />}

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
              {cfg.idLabel} <span className="text-slate-600">{cfg.idHint}</span>
            </label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={cfg.placeholder}
              className="input-field w-full text-sm font-mono"
              inputMode={channel === 'whatsapp' ? 'tel' : 'numeric'}
            />
            <p className="text-[10px] text-slate-600 mt-1">{cfg.help}</p>
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
            disabled={loading || !channelAvail}
            className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Criando...' : 'Iniciar conversa'}
          </button>
        </div>
      </div>
    </div>
  )
}
