import React, { useState } from 'react'
import { ExternalLink, Loader2, Eye, EyeOff, Bot, Brain } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { ModalBase, HelpAccordion } from './ModalBase'
import clsx from 'clsx'

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    Icon: Bot,
    color: '#10a37f',
    placeholder: 'sk-proj-...',
    link: 'https://platform.openai.com/api-keys',
    linkLabel: 'Abrir OpenAI Platform',
    hint: 'Gere uma chave em: platform.openai.com → API Keys',
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    Icon: Brain,
    color: '#8B5CF6',
    placeholder: 'sk-ant-api03-...',
    link: 'https://console.anthropic.com',
    linkLabel: 'Abrir Anthropic Console',
    hint: 'Gere uma chave em: console.anthropic.com → API Keys',
  },
]

export const AIModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth()
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const current = PROVIDERS.find(p => p.id === provider)

  const handleProviderChange = (id) => {
    setProvider(id)
    setApiKey('')
    setError('')
  }

  const handleSave = async () => {
    if (!apiKey.trim()) { setError('Insira a API Key'); return }
    if (apiKey.trim().length < 20) { setError('API Key inválida — muito curta'); return }
    setSaving(true)
    setError('')
    try {
      const config = { provider, api_key: apiKey.trim() }
      // Grava em 'integrations' (card da página) E em 'settings' (de onde o aiService,
      // o smartAttendant e o webhook realmente leem as chaves). Sem isso, "Conectar IA"
      // aqui não ativava a IA — a chave caía numa tabela que ninguém lia.
      const keyColumn = provider === 'claude' ? 'anthropic_key' : 'openai_key'
      const [r1, r2] = await Promise.all([
        supabase.from('integrations').upsert(
          { user_id: user.id, type: 'ai', status: 'connected', config, connected_at: new Date().toISOString() },
          { onConflict: 'user_id,type' }
        ),
        supabase.from('settings').upsert(
          { user_id: user.id, [keyColumn]: apiKey.trim(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ),
      ])
      if (r1.error) throw new Error(r1.error.message)
      if (r2.error) throw new Error(r2.error.message)
      onSuccess(config)
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar')
      setSaving(false)
    }
  }

  return (
    <ModalBase onClose={onClose} title="Inteligência Artificial" icon={<Bot size={22} color="#8B5CF6" />} iconBg="rgba(139,92,246,0.15)">
      <HelpAccordion
        title="Como obter uma API Key de IA?"
        steps={[
          'OpenAI: acesse platform.openai.com e crie uma conta (tem plano gratuito com créditos iniciais)',
          'OpenAI: vá em API Keys → "Create new secret key" → copie a chave que começa com sk-proj-...',
          'Claude (Anthropic): acesse console.anthropic.com e crie uma conta',
          'Claude: vá em API Keys → "Create Key" → copie a chave que começa com sk-ant-api03-...',
          'Cole a chave no campo abaixo — ela fica armazenada de forma segura e só é usada na sua conta',
          'Atenção: a chave da API é diferente da senha da sua conta — não as confunda',
        ]}
        links={[
          { label: 'OpenAI API Keys', url: 'https://platform.openai.com/api-keys' },
          { label: 'Anthropic Console', url: 'https://console.anthropic.com' },
        ]}
      />
      {/* Provider tabs */}
      <div className="flex gap-2 mb-5">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => handleProviderChange(p.id)}
            className={clsx(
              'flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all border',
              provider === p.id
                ? 'text-white border-brand-orange/50 bg-brand-orange/15'
                : 'text-slate-400 border-transparent glass hover:text-white'
            )}
          >
            <p.Icon size={15} /> {p.label}
          </button>
        ))}
      </div>

      {/* Hint */}
      <p className="text-xs text-slate-500 mb-3">{current.hint}</p>

      {/* External link */}
      <button
        onClick={() => window.open(current.link, '_blank')}
        className="w-full py-2 rounded-xl glass text-sm text-slate-300 hover:text-white flex items-center justify-center gap-2 mb-4 transition-all"
      >
        <ExternalLink size={13} /> {current.linkLabel}
      </button>

      {/* API Key field */}
      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">API Key</label>
        <div className="relative">
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            type={showKey ? 'text' : 'password'}
            placeholder={current.placeholder}
            className="input-field font-mono text-xs pr-10 w-full"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1">
          A chave é armazenada com segurança e usada apenas por você.
        </p>
      </div>

      {error && <p className="text-xs text-red-400 mb-3 px-1">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? 'Salvando...' : `Conectar ${current.label}`}
      </button>
    </ModalBase>
  )
}
