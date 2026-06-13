import React, { useState } from 'react'
import { ExternalLink, Loader2, Instagram } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { ModalBase, Steps } from './ModalBase'

export const InstagramModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth()
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!accessToken.trim()) { setError('Insira o Access Token'); return }
    setSaving(true)
    setError('')
    try {
      const config = { access_token: accessToken.trim() }
      await supabase.from('integrations').upsert(
        { user_id: user.id, type: 'instagram', status: 'connected', config, connected_at: new Date().toISOString() },
        { onConflict: 'user_id,type' }
      )
      onSuccess(config)
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar')
      setSaving(false)
    }
  }

  return (
    <ModalBase onClose={onClose} title="Instagram DM" icon={<Instagram size={22} color="#E1306C" />} iconBg="rgba(225,48,108,0.15)">
      <Steps items={[
        'Acesse o Meta Business Manager',
        'Vá em Configurações → Acesso à API do Instagram',
        'Gere um Access Token de longa duração',
        'Cole o token abaixo e salve',
      ]} />

      <button
        onClick={() => window.open('https://business.facebook.com', '_blank')}
        className="w-full py-2 rounded-xl glass text-sm text-slate-300 hover:text-white flex items-center justify-center gap-2 mb-4 transition-all"
      >
        <ExternalLink size={13} /> Abrir Meta Business Manager
      </button>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Access Token</label>
        <input
          value={accessToken}
          onChange={e => setAccessToken(e.target.value)}
          placeholder="EAAxxxxxx..."
          className="input-field font-mono text-xs"
          autoFocus
        />
      </div>

      {error && <p className="text-xs text-red-400 mb-3 px-1">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Conectando...' : 'Conectar Instagram'}
      </button>
    </ModalBase>
  )
}
