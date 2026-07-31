import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Wifi, WifiOff, RefreshCw, CheckCircle, Loader2, MessageCircle, HelpCircle, ChevronDown } from 'lucide-react'
import { connectInstance, getInstanceStatus } from '@/services/evolutionApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@context/AuthContext'
import { syncWhatsAppChats } from '@/services/chatService'
import clsx from 'clsx'

const INSTANCE = 'test'

const formatPhone = (raw = '') => {
  const n = String(raw).split('@')[0].replace(/\D/g, '')
  if (n.length === 13) return `+${n.slice(0,2)} (${n.slice(2,4)}) ${n.slice(4,9)}-${n.slice(9)}`
  if (n.length === 12) return `+${n.slice(0,2)} (${n.slice(2,4)}) ${n.slice(4,8)}-${n.slice(8)}`
  if (n.length >= 8) return `+${n}`
  return raw
}

const extractQR = (data) => {
  const raw =
    data?.base64 ??
    data?.qrcode?.base64 ??
    data?.qrcode?.code ??
    data?.code ??
    null
  if (!raw || typeof raw !== 'string' || raw.length < 50) return null
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`
}

/* Parses fetchInstances response — handles both old and new Evolution API shapes */
const parseStatus = (data) => {
  const instances = Array.isArray(data) ? data : (data ? [data] : [])
  const inst =
    instances.find(i =>
      i.instance?.instanceName === INSTANCE ||
      i.instanceName           === INSTANCE ||
      i.name                   === INSTANCE
    ) ?? instances[0]

  const state =
    inst?.instance?.state  ??
    inst?.instance?.status ??
    inst?.state            ??
    inst?.status           ??
    ''

  const isOpen = state === 'open'

  const owner =
    inst?.instance?.profileName ??
    inst?.instance?.owner       ??
    inst?.instance?.wuid        ??
    inst?.profileName           ??
    inst?.owner                 ??
    ''

  console.log('[WhatsApp] parseStatus — state:', state, '| owner:', owner)
  return { isOpen, number: owner ? formatPhone(owner) : '' }
}

export const WhatsAppModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth()
  const navigate  = useNavigate()

  // steps: loading | qrcode | syncing | connected | error
  const [step, setStep]             = useState('loading')
  const [helpOpen, setHelpOpen]     = useState(false)
  const [qrCode, setQrCode]         = useState(null)
  const [timer, setTimer]           = useState(45)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [errorMsg, setErrorMsg]     = useState('')

  const pollingRef  = useRef(null)
  const timerRef    = useRef(null)
  const mountedRef  = useRef(true)

  /* ── Countdown timer ── */
  const startTimer = () => {
    clearInterval(timerRef.current)
    setTimer(45)
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const stopAll = () => {
    clearInterval(pollingRef.current)
    clearInterval(timerRef.current)
  }

  /* ── Handle connected: sync chats then show connected state ── */
  const handleConnected = async (number) => {
    if (!mountedRef.current) return
    stopAll()
    setPhoneNumber(number)
    setStep('syncing')
    setSyncMessage('Importando suas conversas do WhatsApp...')

    // 1. Save connection to integrations table
    if (user) {
      const { error: dbError } = await supabase
        .from('integrations')
        .upsert(
          {
            user_id: user.id,
            type: 'whatsapp',
            status: 'connected',
            config: { instance: INSTANCE, number },
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,type' }
        )
      if (dbError) console.error('[WhatsApp] integrations error:', dbError.message)
    }

    // 2. Sync conversations from Evolution API → Supabase
    if (user) {
      try {
        const count = await syncWhatsAppChats(user.id, (msg) => {
          if (mountedRef.current) setSyncMessage(msg)
        })
        if (mountedRef.current) {
          setSyncMessage(count > 0
            ? `${count} conversas importadas!`
            : 'WhatsApp conectado! Sem conversas anteriores.'
          )
        }
      } catch (err) {
        console.error('[WhatsApp] sync error:', err)
        if (mountedRef.current) {
          setSyncMessage('WhatsApp conectado! Conversas disponíveis no Chat.')
        }
      }
    }

    if (mountedRef.current) setStep('connected')
  }

  /* ── Fetch QR Code ── */
  const fetchQRCode = async () => {
    if (!mountedRef.current) return
    stopAll()
    setStep('loading')
    setErrorMsg('')

    try {
      // Check if already open before requesting QR
      const statusData = await getInstanceStatus()
      const { isOpen, number } = parseStatus(statusData)
      if (isOpen) {
        await handleConnected(number)
        return
      }

      const data = await connectInstance()
      if (!mountedRef.current) return
      console.log('[WhatsApp] connect response:', data)

      const qr = extractQR(data)
      if (qr) {
        setQrCode(qr)
        setStep('qrcode')
        startTimer()
        startPolling()
      } else {
        const recheck = await getInstanceStatus()
        const { isOpen: nowOpen, number: nowNum } = parseStatus(recheck)
        if (nowOpen) {
          await handleConnected(nowNum)
        } else {
          setErrorMsg(`A API não retornou QR Code.\nResposta: ${JSON.stringify(data).slice(0, 300)}`)
          setStep('error')
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setErrorMsg(err.message ?? 'Erro ao conectar com a Evolution API')
        setStep('error')
      }
    }
  }

  /* ── Poll connection every 3s while QR code is shown ── */
  const startPolling = () => {
    pollingRef.current = setInterval(async () => {
      if (!mountedRef.current) return
      try {
        const data = await getInstanceStatus()
        console.log('[WhatsApp] polling status:', data)
        const { isOpen, number } = parseStatus(data)
        if (isOpen) await handleConnected(number)
      } catch {
        // transient — keep polling
      }
    }, 3000)
  }

  /* ── Lifecycle ── */
  useEffect(() => {
    mountedRef.current = true
    fetchQRCode()
    return () => {
      mountedRef.current = false
      stopAll()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConcluir = () => {
    onSuccess?.({ instance: INSTANCE, number: phoneNumber })
    onClose()
  }

  const handleGoToChat = () => {
    onSuccess?.({ instance: INSTANCE, number: phoneNumber })
    onClose()
    navigate('/chat')
  }

  /* ── Render ── */
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="glass rounded-2xl p-6 w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <MessageCircle size={20} className="text-green-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-brand-orange">Conectar WhatsApp</h3>
              <p className="text-xs text-slate-400">
                {step === 'syncing'   ? 'Importando conversas...'   :
                 step === 'connected' ? 'Conectado com sucesso!'     :
                 step === 'error'     ? 'Erro na conexão'            :
                 'Escaneie o QR Code com seu celular'}
              </p>
            </div>
          </div>
          {/* Only show close button when not syncing (avoid accidental close) */}
          {step !== 'syncing' && (
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          )}
        </div>

        {/* ── Loading: generating QR ── */}
        {step === 'loading' && (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Gerando QR Code...</p>
          </div>
        )}

        {/* ── QR Code ── */}
        {step === 'qrcode' && qrCode && (
          <div className="flex flex-col items-center">
            {/* Ajuda colapsável */}
            <div className="w-full rounded-xl border border-white/10 overflow-hidden mb-4">
              <button
                type="button"
                onClick={() => setHelpOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle size={12} className="text-green-400 shrink-0" />
                  <span className="font-medium">Como escanear o QR Code?</span>
                </span>
                <ChevronDown size={12} className={`transition-transform duration-200 shrink-0 ${helpOpen ? 'rotate-180' : ''}`} />
              </button>
              {helpOpen && (
                <div className="px-3 pb-3 border-t border-white/10 space-y-2 mt-3">
                  {[
                    'Abra o WhatsApp no seu celular',
                    'Toque nos três pontos ⋮ (Android) ou em Configurações ⚙️ (iPhone)',
                    'Selecione "Aparelhos conectados"',
                    'Toque em "Conectar um aparelho"',
                    'Aponte a câmera para o QR Code abaixo — a conexão é automática',
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 text-[9px] flex items-center justify-center font-bold shrink-0 mt-0.5">{i + 1}</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative mb-4">
              <div className="bg-white p-3 rounded-2xl inline-block">
                <img
                  src={qrCode}
                  alt="QR Code WhatsApp"
                  className="w-48 h-48 block"
                  onError={e => { e.currentTarget.style.opacity = '0.3' }}
                />
              </div>
              {timer === 0 && (
                <div className="absolute inset-0 rounded-2xl bg-black/75 flex flex-col items-center justify-center gap-2">
                  <p className="text-white text-sm font-medium">QR Code expirado</p>
                  <button onClick={fetchQRCode} className="flex items-center gap-1.5 text-xs text-brand-orange">
                    <RefreshCw size={12} /> Atualizar
                  </button>
                </div>
              )}
            </div>

            <div className="glass rounded-xl p-3 mb-4 w-full text-center">
              <p className="text-xs text-slate-300 mb-0.5">Como conectar:</p>
              <p className="text-xs text-slate-400">
                WhatsApp → ⋮ → <strong className="text-white">Aparelhos conectados</strong> → Conectar aparelho
              </p>
            </div>

            <div className="flex items-center justify-between w-full mb-4">
              <p className="text-sm text-slate-400">
                Expira em:{' '}
                <span className={clsx('font-mono font-bold', timer <= 10 ? 'text-red-400' : 'text-brand-orange')}>
                  {timer}s
                </span>
              </p>
              <button onClick={fetchQRCode} className="flex items-center gap-1 text-sm text-brand-orange hover:text-orange-400 transition-colors">
                <RefreshCw size={14} /> Atualizar QR Code
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-brand-blue">
              <Loader2 size={11} className="animate-spin" />
              Aguardando conexão...
            </div>
          </div>
        )}

        {/* ── Syncing: importing conversations ── */}
        {step === 'syncing' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Importando conversas</p>
            <p className="text-slate-400 text-sm leading-relaxed">{syncMessage}</p>
          </div>
        )}

        {/* ── Connected ── */}
        {step === 'connected' && (
          <div className="text-center py-6">
            <CheckCircle size={52} className="text-green-500 mx-auto mb-4" />
            <h4 className="font-display font-bold text-xl text-white mb-2">
              WhatsApp Conectado!
            </h4>
            {syncMessage && (
              <p className={clsx(
                'text-sm mb-3',
                /(importad|conectado|sucesso)/i.test(syncMessage) ? 'text-green-400' : 'text-slate-400'
              )}>
                {syncMessage}
              </p>
            )}
            {phoneNumber && (
              <div className="flex items-center gap-2 justify-center mb-6">
                <Wifi size={14} className="text-green-400" />
                <p className="text-slate-300 font-mono text-sm">{phoneNumber}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleConcluir} className="flex-1 py-2.5 glass rounded-xl text-sm text-slate-300 hover:text-white transition-all">
                Concluir
              </button>
              <button onClick={handleGoToChat} className="btn-primary flex-1 justify-center">
                Ir para o Chat →
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="text-center py-4">
            <WifiOff size={44} className="text-red-400 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Erro ao gerar QR Code</p>
            {errorMsg && (
              <div className="glass rounded-xl p-3 mb-4 text-left max-h-32 overflow-auto">
                <pre className="text-[10px] text-red-400 font-mono break-all whitespace-pre-wrap">
                  {errorMsg}
                </pre>
              </div>
            )}
            <p className="text-xs text-slate-500 mb-4">
              Certifique-se que o proxy (<code>server/</code>, porta 3333) e o servidor WhatsApp
              (<code>whatsapp-server/</code>, porta 3334) estão rodando.
            </p>
            <button onClick={fetchQRCode} className="btn-primary w-full flex items-center justify-center gap-2">
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
