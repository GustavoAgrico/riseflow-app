import React, { useState } from 'react'
import { ExternalLink, Loader2, Send } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { connectTelegram, telegramErrorMessage } from '@services/telegramService'
import { ModalBase, Steps } from './ModalBase'

export const TelegramModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth()
  const [botToken, setBotToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!botToken.trim()) { setError('Insira o Bot Token'); return }
    if (!botToken.includes(':')) { setError('Token inválido — deve conter ":"'); return }
    setSaving(true)
    setError('')
    try {
      // O proxy valida o token no Telegram (getMe), sobe o bot e persiste a
      // integração — só chega em onSuccess se o bot estiver de pé de verdade.
      const { bot } = await connectTelegram(user.id, botToken.trim())
      onSuccess({ username: bot?.username, name: bot?.name })
    } catch (err) {
      setError('Falha ao conectar: ' + telegramErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <ModalBase onClose={onClose} title="Telegram" icon={<Send size={22} color="#2AABEE" />} iconBg="rgba(42,171,238,0.15)">
      <Steps items={[
        'Abra o Telegram e pesquise por @BotFather',
        'Envie /newbot e escolha um nome para o bot',
        'O BotFather vai gerar um token de acesso',
        'Cole o token abaixo',
      ]} />

      <button
        onClick={() => window.open('https://t.me/botfather', '_blank')}
        className="w-full py-2 rounded-xl glass text-sm text-slate-300 hover:text-white flex items-center justify-center gap-2 mb-4 transition-all"
      >
        <ExternalLink size={13} /> Abrir BotFather no Telegram
      </button>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Bot Token</label>
        <input
          value={botToken}
          onChange={e => setBotToken(e.target.value)}
          placeholder="1234567890:ABCDefGhIJKlmNoPQRsTUVwxyZ"
          className="input-field font-mono text-xs"
          autoFocus
        />
        <p className="text-[10px] text-slate-600 mt-1">Formato: 123456789:AABBxxx...</p>
      </div>

      {error && <p className="text-xs text-red-400 mb-3 px-1">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Conectando...' : 'Conectar Telegram'}
      </button>
    </ModalBase>
  )
}
