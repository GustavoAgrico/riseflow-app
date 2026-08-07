import React, { useState } from 'react'
import { ExternalLink, Loader2, MessageCircle, Copy, Check } from 'lucide-react'
import { connectWhatsAppCloud, whatsappCloudErrorMessage } from '@services/whatsappCloudService'
import { ModalBase, Steps, HelpAccordion } from './ModalBase'

// Integração oficial: o usuário cola Phone Number ID + Access Token (e WABA ID
// opcional) do painel WhatsApp do app Meta. O webhook é configurado no painel da
// Meta apontando para a URL mostrada abaixo (mesma origem do app).
export const WhatsAppCloudModal = ({ onClose, onSuccess }) => {
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [token, setToken] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const webhookUrl = `${window.location.origin}/api/webhook/whatsapp`

  const copyWebhook = () => {
    navigator.clipboard?.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const handleSave = async () => {
    if (!phoneNumberId.trim() || !token.trim()) {
      setError('Phone Number ID e Access Token são obrigatórios')
      return
    }
    setSaving(true)
    setError('')
    try {
      // O proxy valida as credenciais na Graph (GET /<phoneNumberId>) e só
      // retorna sucesso se o número/token forem reais — então onSuccess.
      const r = await connectWhatsAppCloud(phoneNumberId.trim(), token.trim(), wabaId.trim() || undefined)
      onSuccess({
        phone_number_id: phoneNumberId.trim(),
        display_number: r.displayNumber,
        verified_name: r.verifiedName,
      })
    } catch (err) {
      setError('Falha ao conectar: ' + whatsappCloudErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <ModalBase
      onClose={onClose}
      title="WhatsApp API Oficial (Cloud)"
      icon={<MessageCircle size={22} color="#25D366" />}
      iconBg="rgba(37,211,102,0.15)"
    >
      <HelpAccordion
        title="Onde pego esses dados na Meta?"
        steps={[
          'Acesse developers.facebook.com → seu App → produto WhatsApp → API Setup',
          'Copie o "Phone number ID" e o "WhatsApp Business Account ID" (WABA)',
          'Gere um Access Token (temporário para teste; permanente via System User para produção)',
          'Em Configuration → Webhook, cole a URL de callback mostrada abaixo',
          'Defina o Verify Token igual ao WHATSAPP_VERIFY_TOKEN configurado no servidor',
          'Assine o campo "messages"',
        ]}
        links={[
          { label: 'Abrir Meta for Developers', url: 'https://developers.facebook.com/apps' },
          { label: 'Documentação WhatsApp Cloud API', url: 'https://developers.facebook.com/docs/whatsapp/cloud-api' },
        ]}
      />

      <Steps items={[
        'Adicione o produto WhatsApp ao seu app Meta',
        'Configure o webhook com a URL abaixo e assine "messages"',
        'Cole o Phone Number ID e o Access Token',
        'Conecte — validamos as credenciais na hora',
      ]} />

      {/* Webhook URL para colar no painel da Meta */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-1.5">URL de callback do webhook</label>
        <div className="flex items-center gap-2">
          <input
            value={webhookUrl}
            readOnly
            className="input-field font-mono text-xs flex-1"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={copyWebhook}
            className="p-2 glass rounded-xl hover:border-white/20 transition-colors"
            title="Copiar URL"
          >
            {copied ? <Check size={14} className="text-brand-green" /> : <Copy size={14} className="text-slate-400" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Cole no painel da Meta e assine o campo "messages".</p>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Phone Number ID</label>
        <input
          value={phoneNumberId}
          onChange={e => setPhoneNumberId(e.target.value)}
          placeholder="1234567890"
          className="input-field font-mono text-xs"
          autoFocus
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">Access Token</label>
        <input
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="EAAG... (token do app WhatsApp)"
          className="input-field font-mono text-xs"
          type="password"
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">WhatsApp Business Account ID (opcional)</label>
        <input
          value={wabaId}
          onChange={e => setWabaId(e.target.value)}
          placeholder="1234567890 (WABA ID)"
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
        {saving ? 'Validando e conectando...' : 'Conectar WhatsApp Oficial'}
      </button>
    </ModalBase>
  )
}
