import React, { useState, useEffect, useCallback } from 'react'
import { Layout } from '@components/Layout/Layout'
import { useAuth } from '@context/AuthContext'
import { supabase } from '@/lib/supabase'
import { getInstanceStatus, disconnectInstance } from '@/services/evolutionApi'
import { disconnectTelegram } from '@services/telegramService'
import { disconnectMeta } from '@services/metaService'
import { disconnectWhatsAppCloud } from '@services/whatsappCloudService'
import { WhatsAppModal } from '@components/Integrations/WhatsAppModal'
import { WhatsAppManagePanel } from '@components/Integrations/WhatsAppManagePanel'
import { InstagramModal } from '@components/Integrations/InstagramModal'
import { FacebookModal } from '@components/Integrations/FacebookModal'
import { TelegramModal } from '@components/Integrations/TelegramModal'
import { WhatsAppCloudModal } from '@components/Integrations/WhatsAppCloudModal'
import { EmailModal } from '@components/Integrations/EmailModal'
import { AIModal } from '@components/Integrations/AIModal'
import { CheckCircle, XCircle, Plug, Settings, Loader2, RefreshCw, Wifi, AlertTriangle, Mail, Lock } from 'lucide-react'
import { sendEmail, emailErrorMessage } from '@services/emailService'
import { BrandIcon } from '@components/Integrations/BrandIcons'
import { usePlan } from '@hooks/usePlan'
import clsx from 'clsx'

/* ─── Quais integrações cada plano pode conectar ───────────────────────── */
const INTEGRATION_ACCESS = {
  free:       ['whatsapp', 'whatsapp_cloud'],
  starter:    ['whatsapp', 'whatsapp_cloud', 'telegram'],
  pro:        ['whatsapp', 'whatsapp_cloud', 'telegram', 'email'],
  enterprise: ['whatsapp', 'whatsapp_cloud', 'instagram', 'facebook', 'telegram', 'email', 'ai'],
}

const REQUIRED_PLAN = {
  instagram: 'enterprise',
  facebook:  'enterprise',
  ai:        'enterprise',
  email:     'pro',
  telegram:  'pro',
}

const PLAN_LABEL = { free: 'Grátis', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' }

/* ─── Card definitions ─────────────────────────────────────────────────── */
const CARDS = [
  {
    id: 'whatsapp', name: 'WhatsApp Business', category: 'Mensageria',
    color: '#25D366', bg: 'from-green-500/20 to-green-600/5',
    description: 'Automatize mensagens, respostas e fluxos no WhatsApp Business API via Evolution API',
  },
  {
    id: 'whatsapp_cloud', name: 'WhatsApp API Oficial', category: 'Mensageria',
    color: '#128C7E', bg: 'from-emerald-500/20 to-emerald-600/5',
    description: 'API oficial da Meta (Cloud API) — sem servidor sempre-ligado, via webhook. Número dedicado + verificação de negócio.',
  },
  {
    id: 'instagram', name: 'Instagram DM', category: 'Redes Sociais',
    color: '#E1306C', bg: 'from-pink-500/20 to-pink-600/5',
    description: 'Conecte sua conta profissional e responda DMs no Chat, com funis e IA',
  },
  {
    id: 'facebook', name: 'Facebook Messenger', category: 'Redes Sociais',
    color: '#1877F2', bg: 'from-blue-500/20 to-blue-600/5',
    description: 'Conecte sua página e responda o Messenger no Chat, com funis e IA',
  },
  {
    id: 'telegram', name: 'Telegram', category: 'Mensageria',
    color: '#2AABEE', bg: 'from-sky-500/20 to-sky-600/5',
    description: 'Conecte um bot (via @BotFather) e receba/responda conversas no Chat, com funis e IA',
  },
  {
    id: 'email', name: 'Email (SMTP)', category: 'Email',
    color: '#F59E0B', bg: 'from-yellow-500/20 to-yellow-600/5',
    description: 'Envie emails transacionais e sequências automáticas',
  },
  {
    id: 'ai', name: 'OpenAI / Claude IA', category: 'Inteligência Artificial',
    color: '#8B5CF6', bg: 'from-purple-500/20 to-purple-600/5',
    description: 'Respostas inteligentes e automatizadas com modelos de IA avançados',
  },
]

const formatPhone = (jid = '') => {
  const n = String(jid).split('@')[0]
  if (!n) return ''
  if (n.length === 13) return `+${n.slice(0,2)} (${n.slice(2,4)}) ${n.slice(4,9)}-${n.slice(9)}`
  if (n.length === 12) return `+${n.slice(0,2)} (${n.slice(2,4)}) ${n.slice(4,8)}-${n.slice(8)}`
  return `+${n}`
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export const Integrations = () => {
  const { user, isDemoMode } = useAuth()
  const { plan: usage } = usePlan()

  const currentPlan = isDemoMode ? 'pro' : (usage?.plan ?? 'free')
  const allowedIntegrations = INTEGRATION_ACCESS[currentPlan] ?? INTEGRATION_ACCESS.free
  const canAccess = (id) => allowedIntegrations.includes(id)

  const [activeModal, setActiveModal] = useState(null) // null | 'whatsapp' | 'instagram' | ...
  const [manageWA, setManageWA] = useState(false)
  const [integrations, setIntegrations] = useState({}) // { [type]: { status, config } }
  const [waChecking, setWaChecking] = useState(false)
  const [disconnecting, setDisconnecting] = useState(null) // type being disconnected
  const [confirmDisc, setConfirmDisc] = useState(null)    // type awaiting confirmation
  const [emailTesting, setEmailTesting] = useState(false) // enviando email de teste
  const [monthlyMessages, setMonthlyMessages] = useState(0) // mensagens no mês corrente (real)

  /* ── Load from Supabase ── */
  const loadIntegrations = useCallback(async () => {
    if (!user || isDemoMode) return
    const { data } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
    if (data) {
      const map = {}
      data.forEach(row => { map[row.type] = row })
      setIntegrations(map)
    }
  }, [user, isDemoMode])

  /* ── Check WhatsApp live status from Evolution API ── */
  const checkWhatsApp = useCallback(async () => {
    if (!user || isDemoMode) return
    setWaChecking(true)
    try {
      const data = await getInstanceStatus()
      const instances = Array.isArray(data) ? data : []
      const inst = instances.find(i => i.instance?.instanceName === 'test') ?? instances[0]
      const isOpen = inst?.instance?.status === 'open' || inst?.state === 'open'
      const owner = inst?.instance?.owner ?? inst?.owner ?? null
      const number = isOpen && owner ? formatPhone(owner) : null

      const newStatus = isOpen ? 'connected' : 'disconnected'
      const { error: syncError } = await supabase.from('integrations').upsert(
        { user_id: user.id, type: 'whatsapp', status: newStatus,
          config: isOpen ? { number } : {},
          ...(isOpen ? { connected_at: new Date().toISOString() } : {}) },
        { onConflict: 'user_id,type' }
      )
      if (syncError) console.error('[WA sync]', syncError.message)

      setIntegrations(prev => ({
        ...prev,
        whatsapp: { ...(prev.whatsapp ?? {}), status: newStatus, config: isOpen ? { number } : {} },
      }))
    } catch {
      // Evolution API unreachable — trust cached Supabase status
    } finally {
      setWaChecking(false)
    }
  }, [user, isDemoMode])

  /* ── Contagem real de mensagens do mês corrente ── */
  const fetchMonthlyMessages = useCallback(async () => {
    if (!user || isDemoMode) return
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', startOfMonth.toISOString())
    setMonthlyMessages(count ?? 0)
  }, [user, isDemoMode])

  /* ── On mount ── */
  useEffect(() => {
    if (isDemoMode) {
      setIntegrations({ whatsapp: { status: 'connected', config: { number: '+55 11 99774-0712' } } })
      setMonthlyMessages(12847)
      return
    }
    loadIntegrations().then(checkWhatsApp)
    fetchMonthlyMessages()
  }, [user, isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Helpers ── */
  const isConnected = (type) => {
    if (isDemoMode) return type === 'whatsapp'
    return integrations[type]?.status === 'connected'
  }

  const getConfig = (type) => integrations[type]?.config ?? {}

  const handleSuccess = (type, config = {}) => {
    setIntegrations(prev => ({
      ...prev,
      [type]: { ...(prev[type] ?? {}), status: 'connected', config },
    }))
    setActiveModal(null)
  }

  /* ── Disconnect ── */
  const handleDisconnect = async (type) => {
    if (isDemoMode || !user) return
    setDisconnecting(type)
    setConfirmDisc(null)
    try {
      if (type === 'whatsapp') {
        await disconnectInstance().catch(() => {})
      }
      if (type === 'telegram') {
        // Para o bot no servidor (o proxy também atualiza integrations).
        await disconnectTelegram(user.id).catch(() => {})
      }
      if (type === 'facebook' || type === 'instagram') {
        // Remove a página do registro do servidor.
        await disconnectMeta(user.id, type).catch(() => {})
      }
      if (type === 'whatsapp_cloud') {
        // Remove o número Cloud do registro do servidor.
        await disconnectWhatsAppCloud().catch(() => {})
      }
      await supabase.from('integrations').upsert(
        { user_id: user.id, type, status: 'disconnected', config: {} },
        { onConflict: 'user_id,type' }
      )
      setIntegrations(prev => ({
        ...prev,
        [type]: { ...(prev[type] ?? {}), status: 'disconnected', config: {} },
      }))
    } catch {
      // ignore
    } finally {
      setDisconnecting(null)
    }
  }

  /* ── Enviar email de teste (prova o canal SMTP ponta-a-ponta) ── */
  const handleTestEmail = async () => {
    if (isDemoMode || !user) return
    const to = window.prompt('Enviar email de teste para qual endereço?', user.email ?? '')
    if (!to?.trim()) return
    setEmailTesting(true)
    try {
      await sendEmail({
        userId: user.id,
        to: to.trim(),
        subject: 'RiseFlow — email de teste',
        text: 'Este é um email de teste enviado pela sua integração SMTP no RiseFlow. Se você recebeu, está tudo funcionando!',
      })
      window.alert('Email de teste enviado para ' + to.trim() + '.')
    } catch (err) {
      window.alert('Falha ao enviar: ' + emailErrorMessage(err))
    } finally {
      setEmailTesting(false)
    }
  }

  const connectedCount = CARDS.filter(c => !c.comingSoon && isConnected(c.id)).length

  /* ── Render ── */
  return (
    <Layout title="Integrações" subtitle="Conecte seus canais de comunicação">

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card text-center">
          <p className="text-3xl font-display font-bold text-brand-green mb-1">{connectedCount}</p>
          <p className="text-sm text-slate-400">Conectados</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-display font-bold text-slate-400 mb-1">{CARDS.length - connectedCount}</p>
          <p className="text-sm text-slate-400">Disponíveis</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl font-display font-bold text-brand-orange mb-1">
            {monthlyMessages.toLocaleString('pt-BR')}
          </p>
          <p className="text-sm text-slate-400">Mensagens/mês</p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(card => {
          const comingSoon = card.comingSoon
          const locked = !comingSoon && !canAccess(card.id)
          const connected = !comingSoon && !locked && isConnected(card.id)
          const cfg = getConfig(card.id)
          const isDisc = disconnecting === card.id
          const isWACheck = card.id === 'whatsapp' && waChecking
          const askConfirm = confirmDisc === card.id
          const requiredPlan = REQUIRED_PLAN[card.id]

          return (
            <div
              key={card.id}
              className={clsx(
                'glass rounded-2xl p-5 hover:border-white/15 transition-all duration-300 relative overflow-hidden',
                connected && 'border-white/10'
              )}
            >
              <div className={clsx('absolute inset-0 bg-gradient-to-br opacity-30 rounded-2xl', card.bg)} />

              <div className="relative">
                {/* ── Card header ── */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: `${card.color}22` }}
                    >
                      <BrandIcon id={card.id} size={26} />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-white text-sm">{card.name}</h3>
                      <span className="text-xs text-slate-500">{card.category}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {comingSoon ? (
                      <span className="text-[10px] font-semibold text-brand-orange bg-brand-orange/15 border border-brand-orange/30 px-2 py-0.5 rounded-full">
                        Em breve
                      </span>
                    ) : isWACheck ? (
                      <>
                        <Loader2 size={13} className="text-brand-blue animate-spin" />
                        <span className="text-xs text-brand-blue">Verificando</span>
                      </>
                    ) : connected ? (
                      <>
                        <CheckCircle size={13} className="text-brand-green" />
                        <span className="text-xs text-brand-green font-medium">Online</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={13} className="text-slate-500" />
                        <span className="text-xs text-slate-500">Desconectado</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{card.description}</p>

                {/* Connected phone (WhatsApp only) */}
                {card.id === 'whatsapp' && connected && cfg.number && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wifi size={12} className="text-brand-green" />
                    <span className="text-xs text-slate-300 font-mono">{cfg.number}</span>
                  </div>
                )}

                {/* Connected bot (Telegram only) */}
                {card.id === 'telegram' && connected && cfg.username && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wifi size={12} className="text-brand-green" />
                    <span className="text-xs text-slate-300 font-mono">@{cfg.username}</span>
                  </div>
                )}

                {/* Connected page (Meta channels) */}
                {(card.id === 'facebook' || card.id === 'instagram') && connected && cfg.page_name && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wifi size={12} className="text-brand-green" />
                    <span className="text-xs text-slate-300 font-mono">{cfg.page_name}</span>
                  </div>
                )}

                {/* ── Action area ── */}
                {comingSoon ? (
                  <div className="mt-3">
                    <button
                      disabled
                      className="w-full py-2 rounded-xl text-sm font-medium text-slate-500 bg-white/5 border border-white/5 flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <Plug size={13} /> Em breve
                    </button>
                  </div>
                ) : locked ? (
                  /* ── Locked by plan ── */
                  <div className="mt-3">
                    <div className="glass rounded-xl p-3 mb-2 flex items-center gap-2">
                      <Lock size={13} className="text-brand-orange shrink-0" />
                      <p className="text-xs text-slate-300">
                        Disponível no plano{' '}
                        <span className="font-semibold text-brand-orange">
                          {PLAN_LABEL[requiredPlan] ?? requiredPlan}
                        </span>
                      </p>
                    </div>
                    <a
                      href="/plans"
                      className="w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25 transition-all"
                    >
                      <Lock size={13} /> Fazer upgrade
                    </a>
                  </div>
                ) : connected ? (
                  askConfirm ? (
                    /* ── Disconnect confirmation ── */
                    <div className="mt-3 glass rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={14} className="text-red-400 shrink-0" />
                        <p className="text-xs text-slate-300 font-medium">
                          Desconectar {card.name}?
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                        {card.id === 'whatsapp'
                          ? 'O WhatsApp será desconectado da Evolution API. Fluxos ativos serão interrompidos.'
                          : 'A integração será desativada. Você pode reconectar a qualquer momento.'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDisc(null)}
                          className="flex-1 py-2 glass rounded-xl text-sm text-slate-300 hover:text-white transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleDisconnect(card.id)}
                          disabled={isDisc}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                        >
                          {isDisc ? <Loader2 size={13} className="animate-spin" /> : null}
                          {isDisc ? 'Desconectando...' : 'Desconectar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal connected buttons ── */
                    <div className="mt-3 space-y-2">
                      {/* Primary row */}
                      <div className="flex items-center gap-2">
                        {card.id === 'whatsapp' ? (
                          <button
                            onClick={() => setManageWA(true)}
                            className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-brand-green/15 text-brand-green hover:bg-brand-green/25 transition-all"
                          >
                            <Settings size={13} /> Gerenciar
                          </button>
                        ) : card.id === 'email' ? (
                          <button
                            onClick={handleTestEmail}
                            disabled={emailTesting}
                            className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25 transition-all disabled:opacity-50"
                          >
                            {emailTesting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                            {emailTesting ? 'Enviando...' : 'Enviar teste'}
                          </button>
                        ) : (
                          <div className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-brand-green/10 text-brand-green cursor-default select-none">
                            <CheckCircle size={13} /> Conectado
                          </div>
                        )}

                        {/* WA refresh */}
                        {card.id === 'whatsapp' && (
                          <button
                            onClick={checkWhatsApp}
                            disabled={waChecking}
                            className="p-2 glass rounded-xl hover:border-white/20 transition-colors disabled:opacity-50"
                            title="Verificar status"
                          >
                            <RefreshCw size={14} className={clsx('text-slate-400', waChecking && 'animate-spin')} />
                          </button>
                        )}
                      </div>

                      {/* Disconnect button (full width, red) */}
                      <button
                        onClick={() => setConfirmDisc(card.id)}
                        className="w-full py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <XCircle size={13} /> Desconectar
                      </button>
                    </div>
                  )
                ) : (
                  /* ── Connect button ── */
                  <div className="mt-3">
                    <button
                      onClick={() => setActiveModal(card.id)}
                      disabled={isWACheck}
                      className="w-full py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 transition-all disabled:opacity-50"
                    >
                      {isWACheck
                        ? <><Loader2 size={13} className="animate-spin" /> Verificando...</>
                        : <><Plug size={13} /> Conectar</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modals — mounted only when active ── */}
      {activeModal === 'whatsapp' && (
        <WhatsAppModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('whatsapp', cfg)}
        />
      )}
      {activeModal === 'instagram' && (
        <InstagramModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('instagram', cfg)}
        />
      )}
      {activeModal === 'facebook' && (
        <FacebookModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('facebook', cfg)}
        />
      )}
      {activeModal === 'telegram' && (
        <TelegramModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('telegram', cfg)}
        />
      )}
      {activeModal === 'whatsapp_cloud' && (
        <WhatsAppCloudModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('whatsapp_cloud', cfg)}
        />
      )}
      {activeModal === 'email' && (
        <EmailModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('email', cfg)}
        />
      )}
      {activeModal === 'ai' && (
        <AIModal
          onClose={() => setActiveModal(null)}
          onSuccess={(cfg) => handleSuccess('ai', cfg)}
        />
      )}

      {/* WhatsApp Management Panel */}
      <WhatsAppManagePanel
        open={manageWA}
        onClose={() => setManageWA(false)}
        isDemoMode={isDemoMode}
        connectedNumber={getConfig('whatsapp').number}
      />
    </Layout>
  )
}
