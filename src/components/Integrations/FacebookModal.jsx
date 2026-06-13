import React, { useState } from 'react'
import { ExternalLink, Loader2, Facebook } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { ModalBase, Steps } from './ModalBase'

export const FacebookModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth()
  const [pageToken, setPageToken] = useState('')
  const [pageId, setPageId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!pageToken.trim()) { setError('Insira o Page Access Token'); return }
    if (!pageId.trim()) { setError('Insira o Page ID'); return }
    setSaving(true)
    setError('')
    try {
      const config = { page_token: pageToken.trim(), page_id: pageId.trim() }
      await supabase.from('integrations').upsert(
        { user_id: user.id, type: 'facebook', status: 'connected', config, connected_at: new Date().toISOString() },
        { onConflict: 'user_id,type' }
      )
      onSuccess(config)
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar')
      setSaving(false)
    }
  }

  return (
    <ModalBase onClose={onClose} title="Facebook Messenger" icon={<Facebook size={22} color="#1877F2" />} iconBg="rgba(24,119,242,0.15)">
      <Steps items={[
        'Acesse o Meta for Developers',
        'Crie um App ou acesse um existente',
        'Vá em Messenger → Configurações → Tokens de acesso',
        'Gere o Page Access Token e copie o Page ID',
      ]} />

      <button
        onClick={() => window.open('https://developers.facebook.com', '_blank')}
        className="w-full py-2 rounded-xl glass text-sm text-slate-300 hover:text-white flex items-center justify-center gap-2 mb-4 transition-all"
      >
        <ExternalLink size={13} /> Abrir Meta Developers
      </button>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Page Access Token</label>
        <input
          value={pageToken}
          onChange={e => setPageToken(e.target.value)}
          placeholder="EAAxxxxxx..."
          className="input-field font-mono text-xs"
          autoFocus
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Page ID</label>
        <input
          value={pageId}
          onChange={e => setPageId(e.target.value)}
          placeholder="123456789012345"
          className="input-field font-mono text-xs"
        />
      </div>

      {error && <p className="text-xs text-red-400 mb-3 px-1">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Conectando...' : 'Conectar Facebook'}
      </button>
    </ModalBase>
  )
}
