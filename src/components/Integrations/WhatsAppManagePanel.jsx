import React, { useState, useEffect } from 'react'
import { X, Wifi, WifiOff, BarChart2, Settings, Activity, Loader2, Save, MessageCircle, Copy, Check, Send } from 'lucide-react'
import { getInstanceStatus, getAllMessages, setWebhook } from '@/services/evolutionApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import clsx from 'clsx'

/* URL padrão do webhook = Edge Function do próprio projeto Supabase.
   Extrai o project ref de VITE_SUPABASE_URL (https://<ref>.supabase.co). */
const SUPA_REF = (() => {
  try { return import.meta.env.VITE_SUPABASE_URL?.replace('https://', '').split('.')[0] || '' }
  catch { return '' }
})()
const DEFAULT_WEBHOOK = SUPA_REF ? `https://${SUPA_REF}.supabase.co/functions/v1/webhook` : ''

const STATUS = {
  unset:    { dot: 'bg-slate-500',   text: 'text-slate-400',   label: 'Não configurado' },
  untested: { dot: 'bg-yellow-400',  text: 'text-yellow-400',  label: 'Não testado' },
  ok:       { dot: 'bg-brand-green', text: 'text-brand-green', label: 'Conectado' },
  fail:     { dot: 'bg-red-500',     text: 'text-red-400',     label: 'Desconectado' },
}

const TABS = [
  { id: 'status', label: 'Status', icon: Activity },
  { id: 'config', label: 'Configurações', icon: Settings },
  { id: 'stats', label: 'Estatísticas', icon: BarChart2 },
]

const Toggle = ({ checked, onChange, label, description }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
    <div>
      <p className="text-sm text-white font-medium">{label}</p>
      {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative w-10 h-5 rounded-full transition-colors shrink-0 mt-0.5',
        checked ? 'bg-brand-green' : 'bg-dark-500'
      )}
    >
      <span className={clsx(
        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0'
      )} />
    </button>
  </div>
)

const formatPhone = (jid = '') => {
  const n = jid.split('@')[0]
  if (!n) return ''
  if (n.length === 13) return `+${n.slice(0,2)} (${n.slice(2,4)}) ${n.slice(4,9)}-${n.slice(9)}`
  if (n.length === 12) return `+${n.slice(0,2)} (${n.slice(2,4)}) ${n.slice(4,8)}-${n.slice(8)}`
  return `+${n}`
}

const todayStart = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export const WhatsAppManagePanel = ({ open, onClose, isDemoMode, connectedNumber }) => {
  const { user } = useAuth()
  const [tab, setTab] = useState('status')
  const [instanceInfo, setInstanceInfo] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [autoReply, setAutoReply] = useState(false)
  const [businessHours, setBusinessHours] = useState(false)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')
  const [offMessage, setOffMessage] = useState('')
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK)
  const [webhookStatus, setWebhookStatus] = useState('untested')
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [stats, setStats] = useState({ sent: 0, received: 0, total: 0 })
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('status')
    loadStatus()
    loadConfigFromDb()
  }, [open])

  useEffect(() => {
    if (open && tab === 'stats') loadStats()
  }, [tab, open])

  const loadStatus = async () => {
    setLoadingStatus(true)
    if (isDemoMode) {
      setInstanceInfo({
        name: 'jrzimmermann92',
        number: '+55 11 99774-0712',
        status: 'open',
        uptime: '3 dias, 4h',
      })
      setLoadingStatus(false)
      return
    }
    try {
      const data = await getInstanceStatus()
      const instances = Array.isArray(data) ? data : []
      const inst = instances[0]
      const owner = inst?.instance?.owner ?? inst?.owner ?? null
      setInstanceInfo({
        name: inst?.instance?.profileName ?? inst?.name ?? 'WhatsApp',
        number: owner ? formatPhone(owner) : connectedNumber ?? null,
        status: inst?.instance?.status ?? inst?.state ?? 'unknown',
        uptime: null,
      })
    } catch {
      setInstanceInfo(null)
    } finally {
      setLoadingStatus(false)
    }
  }

  const loadConfigFromDb = async () => {
    if (!user || isDemoMode) return
    try {
      const { data } = await supabase
        .from('integrations')
        .select('config')
        .eq('user_id', user.id)
        .eq('type', 'whatsapp')
        .single()
      if (data?.config) {
        setAutoReply(data.config.auto_reply ?? false)
        setBusinessHours(data.config.business_hours ?? false)
        setStartTime(data.config.start_time ?? '08:00')
        setEndTime(data.config.end_time ?? '18:00')
        setOffMessage(data.config.off_message ?? '')
        setWebhookUrl(data.config.webhook_url || DEFAULT_WEBHOOK)
        setWebhookStatus('untested')
      }
    } catch {
      // row may not exist yet
    }
  }

  const loadStats = async () => {
    setLoadingStats(true)
    if (isDemoMode) {
      setStats({ sent: 347, received: 512, total: 859 })
      setLoadingStats(false)
      return
    }
    try {
      const messages = await getAllMessages()
      const arr = Array.isArray(messages) ? messages : []
      const start = todayStart()
      const todayMsgs = arr.filter(m => {
        const ts = m.messageTimestamp
        const unix = typeof ts === 'object' && ts !== null && 'low' in ts ? ts.low : (typeof ts === 'number' ? ts : 0)
        return unix >= start
      })
      const sent = todayMsgs.filter(m => m.key?.fromMe).length
      const received = todayMsgs.filter(m => !m.key?.fromMe).length
      setStats({ sent, received, total: arr.length })
    } catch {
      setStats({ sent: 0, received: 0, total: 0 })
    } finally {
      setLoadingStats(false)
    }
  }

  const handleSaveConfig = async () => {
    if (isDemoMode || !user) return
    setSavingConfig(true)
    try {
      await supabase.from('integrations').upsert({
        user_id: user.id,
        type: 'whatsapp',
        status: 'connected',
        config: {
          auto_reply: autoReply,
          business_hours: businessHours,
          start_time: startTime,
          end_time: endTime,
          off_message: offMessage,
          webhook_url: webhookUrl,
        },
      }, { onConflict: 'user_id,type' })
      if (webhookUrl.trim()) {
        await setWebhook(webhookUrl.trim()).catch(() => {})
      }
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2500)
    } catch {
      // fail silently
    } finally {
      setSavingConfig(false)
    }
  }

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard indisponível */ }
  }

  const handleTestWebhook = async () => {
    const url = webhookUrl.trim()
    if (!url) return
    setTesting(true); setTestMsg('')
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', data: { message: 'Teste de conexão RiseFlow', timestamp: new Date().toISOString() } }),
      })
      if (r.ok) { setWebhookStatus('ok'); setTestMsg('✅ Webhook funcionando!') }
      else { setWebhookStatus('fail'); setTestMsg(`❌ Erro: status ${r.status}`) }
    } catch (e) {
      setWebhookStatus('fail'); setTestMsg(`❌ Não foi possível conectar: ${e?.message ?? e}`)
    } finally {
      setTesting(false)
      setTimeout(() => setTestMsg(''), 5000)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-md relative animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center"><MessageCircle size={18} className="text-green-400" /></div>
            <div>
              <h2 className="font-display font-bold text-white text-sm">WhatsApp Business</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                <span className="text-xs text-brand-green">Conectado</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'text-brand-orange border-b-2 border-brand-orange'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="p-5 min-h-[260px]">

          {/* Status Tab */}
          {tab === 'status' && (
            <div>
              {loadingStatus ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="text-brand-green animate-spin" />
                </div>
              ) : instanceInfo ? (
                <div className="space-y-4">
                  <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                        <MessageCircle size={24} className="text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">{instanceInfo.name}</p>
                        {instanceInfo.number && (
                          <p className="text-xs text-slate-400 font-mono">{instanceInfo.number}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {instanceInfo.status === 'open' ? (
                        <>
                          <Wifi size={14} className="text-brand-green" />
                          <span className="text-sm text-brand-green font-medium">Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff size={14} className="text-slate-500" />
                          <span className="text-sm text-slate-500">Desconectado</span>
                        </>
                      )}
                      {instanceInfo.uptime && (
                        <span className="ml-auto text-xs text-slate-500">há {instanceInfo.uptime}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-500 mb-1">Instância</p>
                      <p className="text-sm font-mono text-white">test</p>
                    </div>
                    <div className="glass rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-500 mb-1">Protocolo</p>
                      <p className="text-sm font-mono text-white">Baileys</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
                  Não foi possível carregar o status
                </div>
              )}
            </div>
          )}

          {/* Config Tab */}
          {tab === 'config' && (
            <div>
              <Toggle
                checked={autoReply}
                onChange={setAutoReply}
                label="Resposta automática"
                description="Responde mensagens automaticamente fora do horário"
              />
              <Toggle
                checked={businessHours}
                onChange={setBusinessHours}
                label="Horário comercial"
                description="Ativa restrição de horário para envio de mensagens"
              />

              {businessHours && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Início</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="input-field text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Fim</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className="input-field text-sm"
                    />
                  </div>
                </div>
              )}

              {autoReply && (
                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1.5">Mensagem fora do horário</label>
                  <textarea
                    value={offMessage}
                    onChange={e => setOffMessage(e.target.value)}
                    rows={3}
                    placeholder="Olá! Estamos fora do horário de atendimento..."
                    className="input-field text-sm resize-none"
                    disabled={isDemoMode}
                  />
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-white/5">
                <label className="block text-xs text-slate-400 mb-1.5">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    placeholder="https://seu-projeto.supabase.co/functions/v1/webhook"
                    className="input-field text-sm flex-1"
                    disabled={isDemoMode}
                  />
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    disabled={!webhookUrl.trim()}
                    title="Copiar URL"
                    className="btn-secondary px-3 shrink-0 disabled:opacity-50"
                  >
                    {copied ? <Check size={14} className="text-brand-green" /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Indicador de status */}
                {(() => {
                  const st = STATUS[!webhookUrl.trim() ? 'unset' : webhookStatus]
                  return (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={clsx('w-1.5 h-1.5 rounded-full', st.dot)} />
                      <span className={clsx('text-[11px] font-medium', st.text)}>{st.label}</span>
                      {copied && <span className="text-[11px] text-brand-green ml-2">✅ Copiado!</span>}
                    </div>
                  )
                })()}

                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  O servidor WhatsApp (Baileys) já envia os eventos para esta URL automaticamente
                  (definida em <code>WEBHOOK_URL</code> no .env do servidor). Use o botão "Testar"
                  para validar a Edge Function do Supabase.
                </p>

                {testMsg && <p className="text-[11px] mt-2 text-slate-300">{testMsg}</p>}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig || isDemoMode}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {configSaved ? 'Salvo!' : savingConfig ? 'Salvando...' : 'Salvar configurações'}
                </button>
                <button
                  onClick={handleTestWebhook}
                  disabled={testing || isDemoMode || !webhookUrl.trim()}
                  title="Enviar um POST de teste para a URL"
                  className="btn-secondary flex items-center justify-center gap-2 px-4 shrink-0 disabled:opacity-50"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Testar
                </button>
              </div>
            </div>
          )}

          {/* Stats Tab */}
          {tab === 'stats' && (
            <div>
              {loadingStats ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="text-brand-blue animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-4">Hoje</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass rounded-xl p-4 text-center">
                      <p className="text-2xl font-display font-bold text-brand-green mb-1">{stats.sent}</p>
                      <p className="text-xs text-slate-400">Enviadas</p>
                    </div>
                    <div className="glass rounded-xl p-4 text-center">
                      <p className="text-2xl font-display font-bold text-brand-blue mb-1">{stats.received}</p>
                      <p className="text-xs text-slate-400">Recebidas</p>
                    </div>
                  </div>
                  <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-display font-bold text-brand-orange mb-1">{stats.total.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">Total armazenado na instância</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
