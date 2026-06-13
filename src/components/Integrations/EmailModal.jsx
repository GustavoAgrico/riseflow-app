import React, { useState } from 'react'
import { Loader2, Info, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { ModalBase } from './ModalBase'

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: '587' },
  { label: 'Outlook', host: 'smtp-mail.outlook.com', port: '587' },
  { label: 'SendGrid', host: 'smtp.sendgrid.net', port: '587' },
]

export const EmailModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const applyPreset = (preset) => {
    setHost(preset.host)
    setPort(preset.port)
  }

  const handleSave = async () => {
    if (!host.trim()) { setError('Insira o servidor SMTP'); return }
    if (!email.trim()) { setError('Insira o email'); return }
    if (!pass.trim()) { setError('Insira a senha/app password'); return }
    setSaving(true)
    setError('')
    try {
      const config = { host: host.trim(), port: port.trim(), email: email.trim() }
      await supabase.from('integrations').upsert(
        { user_id: user.id, type: 'email', status: 'connected', config, connected_at: new Date().toISOString() },
        { onConflict: 'user_id,type' }
      )
      onSuccess(config)
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar')
      setSaving(false)
    }
  }

  return (
    <ModalBase onClose={onClose} title="Email (SMTP)" icon={<Mail size={22} color="#F59E0B" />} iconBg="rgba(245,158,11,0.15)">
      {/* Quick presets */}
      <p className="text-xs text-slate-500 mb-2">Configuração rápida:</p>
      <div className="flex gap-2 mb-4">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="flex-1 py-1.5 rounded-lg text-xs glass text-slate-300 hover:text-white transition-all"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2">
          <label className="block text-xs text-slate-400 mb-1.5">Servidor SMTP</label>
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.gmail.com" className="input-field text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Porta</label>
          <input value={port} onChange={e => setPort(e.target.value)} placeholder="587" className="input-field text-sm" />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="voce@gmail.com" className="input-field text-sm" />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Senha / App Password</label>
        <input value={pass} onChange={e => setPass(e.target.value)} type="password" placeholder="••••••••••••" className="input-field text-sm" />
      </div>

      <div className="flex items-start gap-2 glass rounded-xl p-3 mb-3">
        <Info size={13} className="text-brand-orange shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Para Gmail, use uma <strong className="text-slate-300">App Password</strong> (não sua senha normal).
          Ative em: Conta Google → Segurança → Senhas de app.
        </p>
      </div>

      {error && <p className="text-xs text-red-400 mb-3 px-1">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Salvando...' : 'Salvar configuração'}
      </button>
    </ModalBase>
  )
}
