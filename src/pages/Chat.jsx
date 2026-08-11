import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Paperclip, Send, Mic, Trash2, Play, Pause, Image as ImageIcon, FileText, Download, RefreshCw, Check, CheckCheck, Clock, ArrowLeft, PanelRight, ArrowRightLeft, Plus, Sparkles, Bot, Loader2, Pencil, MessageSquareText, Save, User, Phone, Mail, Tag, Bell, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usageService } from '@services/usageService'
import { fetchConversations, fetchMessages, sendChatMessage, markConversationRead, syncWhatsAppChats, deleteConversation, loadConversationMessages, createConversation } from '@services/chatService'
import { listTemplates, incrementTemplateUse } from '@services/templatesService'
import { logger } from '@services/activityLogger'
import { PaywallModal } from '@components/PaywallModal'
import { LeadScorePanel } from '@components/LeadScorePanel'
import { NotesPanel } from '@components/NotesPanel'
import { NewConversationModal } from '@components/Chat/NewConversationModal'
import { leadQualification } from '@services/leadQualificationService'
import { generateReply } from '@services/attendanceAI'
import { useIsMobile } from '@hooks/useIsMobile'
import { socket } from '@services/socket'
import { sanitizeMessage } from '@utils/sanitize'
import { useAuth } from '@context/AuthContext'

const C = { bg: '#0F172A', panel: '#1E293B', border: '#334155', text: '#F8FAFC',
  muted: '#94A3B8', dim: '#64748B', purple: '#7C3AED', green: '#22C55E', blue: '#53BDEB' }
const F = 'DM Sans, sans-serif'
const PAL = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#EC4899', '#0891B2', '#8B5CF6', '#EF4444']
const colorFor = s => PAL[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length]
const ini = n => (n || '?').trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
const hm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const rel = t => { const d = Date.now() - t
  if (d < 3600000) return `há ${Math.max(1, Math.floor(d / 60000))}min`
  if (d < 86400000) return hm(t)
  if (d < 172800000) return 'Ontem'
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
const trunc = (s, n = 30) => s.length > n ? s.slice(0, n) + '…' : s

const Tick = ({ s }) => s === 'sending'
  ? <Clock size={13} style={{ opacity: .55 }} />
  : (s === 'delivered' || s === 'read'
    ? <CheckCheck size={14} color={s === 'read' ? C.blue : 'rgba(255,255,255,.6)'} />
    : <Check size={14} color="rgba(255,255,255,.6)" />)

const iBtn = { background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }

const fmtDur = (s, fb) => isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : (fb || '0:00')
const Audio = ({ src, out, dur }) => {
  const ref = useRef(null)
  const [play, setPlay] = useState(false), [prog, setProg] = useState(0), [time, setTime] = useState(dur || '0:00')
  const toggle = () => { const a = ref.current; if (!a) return; play ? a.pause() : a.play().catch(() => {}) }
  const seek = e => { const a = ref.current; if (!a || !a.duration) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * a.duration }
  const fill = out ? '#fff' : C.purple
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
      <audio ref={ref} src={src} preload="metadata"
        onPlay={() => setPlay(true)} onPause={() => setPlay(false)} onEnded={() => { setPlay(false); setProg(0) }}
        onLoadedMetadata={e => setTime(fmtDur(e.target.duration, dur))}
        onTimeUpdate={e => { const a = e.target; setProg(a.duration ? a.currentTime / a.duration * 100 : 0); setTime(fmtDur(a.currentTime || a.duration, dur)) }} />
      <button onClick={toggle} style={{ background: 'none', border: 'none', color: fill, cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex' }}>{play ? <Pause size={22} fill={fill} /> : <Play size={22} fill={fill} />}</button>
      <div onClick={seek} style={{ flex: 1, height: 4, background: '#334155', borderRadius: 2, cursor: 'pointer' }}><div style={{ width: prog + '%', height: '100%', background: fill, borderRadius: 2 }} /></div>
      <span style={{ fontSize: 11, opacity: .7, flexShrink: 0 }}>{time}</span>
    </div>
  )
}

export const Chat = () => {
  const nav = useNavigate()
  const location = useLocation()
  const { isMember, memberRecord, ownerUserId, loading: authLoading, isDemoMode } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const isMobile = useIsMobile()
  const [messages, setMessages] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [connectedChannels, setConnectedChannels] = useState(['whatsapp']) // canais habilitados no modal Nova Conversa (WhatsApp é o primário, sempre disponível)
  const [newContactPrefill, setNewContactPrefill] = useState(null) // { name, phone } do Clients
  const [aiBusy, setAiBusy] = useState(false)
  const [hoverId, setHoverId] = useState(null)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [panelTab, setPanelTab] = useState('contato') // 'contato' | 'info'
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', tag: 'Prospect', channel: 'whatsapp' })
  const [clientId, setClientId] = useState(null)
  const [savingClient, setSavingClient] = useState(false)
  const [clientSaved, setClientSaved] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')
  const [teamMembers, setTeamMembers] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [transferToast, setTransferToast] = useState(null)
  const [typing, setTyping] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const [showAttach, setShowAttach] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [usage, setUsage] = useState({ messages_sent: 0, messages_limit: 50 })
  const [userId, setUserId] = useState(null)
  const [flashIds, setFlashIds] = useState(() => new Set()) // conversas com mensagem nova (badge piscando)
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const userRef = useRef(null)
  const selRef = useRef(null)
  const endRef = useRef(null)
  const convIdsRef = useRef(new Set())
  const convsRef = useRef([]) // espelho de `conversations` para os handlers do socket (sem closure stale)
  const recRef = useRef(null), chunksRef = useRef([]), streamRef = useRef(null), recTimer = useRef(null), sendOnStop = useRef(true)
  const fileRef = useRef(null), attachKind = useRef('image')
  const pendingContactRef = useRef(location.state?.contact ?? null) // contato pré-selecionado vindo do CRM
  const fmtSecs = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const sel = conversations.find(c => c.id === selectedId)
  const msgs = messages[selectedId] || []
  useEffect(() => { selRef.current = selectedId }, [selectedId])
  useEffect(() => { convIdsRef.current = new Set(conversations.map(c => c.id)); convsRef.current = conversations }, [conversations])

  /* Marca uma conversa para piscar o badge por alguns segundos (mensagem nova). */
  const flash = (id) => {
    setFlashIds(s => new Set(s).add(id))
    setTimeout(() => setFlashIds(s => { const n = new Set(s); n.delete(id); return n }), 4000)
  }
  const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '')
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  /* Carrega dados do cliente vinculado à conversa selecionada */
  useEffect(() => {
    if (!selectedId || !userId) return
    const phone = conversations.find(c => c.id === selectedId)?.phone
    if (!phone) return
    const digits = String(phone).replace(/\D/g, '')
    ;(async () => {
      const { data } = await supabase.from('clients').select('*').eq('user_id', userId).ilike('phone', `%${digits}%`).maybeSingle()
      if (data) {
        setClientId(data.id)
        setClientForm({ name: data.name ?? '', phone: data.phone ?? '', email: data.email ?? '', tag: data.tag ?? 'Prospect', channel: data.channel ?? 'whatsapp' })
      } else {
        setClientId(null)
        const convName = conversations.find(c => c.id === selectedId)?.name ?? ''
        setClientForm({ name: convName, phone: phone ?? '', email: '', tag: 'Prospect', channel: 'whatsapp' })
      }
      setClientSaved(false)
    })()
  }, [selectedId, userId])
  useEffect(() => { if (userId) listTemplates(userId).then(setTemplates).catch(() => {}) }, [userId])
  useEffect(() => { setTyping(true); const t = setTimeout(() => setTyping(false), 2200); return () => clearTimeout(t) }, [selectedId])

  // Carrega membros da equipe (para painel de transferência real)
  useEffect(() => {
    if (!userId) return
    supabase.from('team_members').select('id, name, email, role').eq('user_id', userId)
      .then(({ data }) => { if (data) setTeamMembers(data) })
  }, [userId])

  // Escuta notificações de transferência via Socket.io
  useEffect(() => {
    const onTransfer = (data) => {
      console.log('[transfer_notification] recebido:', JSON.stringify(data).slice(0, 100))
      setNotifications(prev => [{ ...data, id: Date.now(), read: false }, ...prev])
      setTransferToast(data)
      setTimeout(() => setTransferToast(null), 4500)
    }
    socket.on('transfer_notification', onTransfer)
    console.log('[transfer_notification] listener registrado no socket', socket.id)
    return () => { socket.off('transfer_notification', onTransfer) }
  }, [])

  /* Mapeia linhas reais do Supabase para o formato que a UI já espera */
  const mapConv = c => ({ id: c.id, name: c.contact_name || `+${c.contact_phone ?? '?'}`, phone: c.contact_phone, preview: c.last_message ?? '', lt: c.last_message_at ? new Date(c.last_message_at).getTime() : Date.now(), unread: c.unread_count ?? 0, online: false, auto: c.ai_auto_reply ?? false, av: colorFor(c.contact_name || c.contact_phone) })
  const mapMsg = m => ({ id: m.id, dir: m.direction === 'outbound' ? 'out' : 'in', type: 'text', text: m.content ?? m.text ?? m.body ?? '', t: m.created_at ? new Date(m.created_at).getTime() : Date.now(), s: m.status || 'delivered' })

  const loadConvs = async (uid) => {
    const filter = isMember && memberRecord ? { assignedTo: memberRecord.name } : {}
    const convs = (await fetchConversations(uid, filter)).map(mapConv)
    setConversations(convs)

    // Processa contato pré-selecionado vindo do CRM (navigate state)
    const pending = pendingContactRef.current
    if (pending) {
      pendingContactRef.current = null
      window.history.replaceState({}, document.title) // limpa state para não reabrir
      const phone = String(pending.phone ?? '').replace(/\D/g, '')
      if (phone) {
        const existing = convs.find(c => String(c.phone ?? '').replace(/\D/g, '') === phone)
        if (existing) {
          setSelectedId(existing.id)
          return convs
        }
        // Abre modal pré-preenchido para criar nova conversa
        setNewContactPrefill({ name: pending.name || '', phone })
        setShowNew(true)
        return convs
      }
    }

    if (convs.length && !selRef.current) setSelectedId(convs[0].id)
    console.log(`[Chat] ${convs.length} conversas carregadas`)
    return convs
  }

  /* PASSO 1: aguarda AuthContext resolver ownerUserId (dono ou membro de equipe). */
  useEffect(() => {
    if (authLoading) return
    if (!ownerUserId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        userRef.current = ownerUserId; setUserId(ownerUserId)
        try { setUsage(await usageService.getUsage(ownerUserId)) } catch (e) { console.warn('[Usage] indisponível:', e?.message ?? e) }
        // Canais conectados → habilita as abas correspondentes no modal Nova Conversa.
        // No demo, espelha a tela de Integrações (só WhatsApp conectado).
        if (isDemoMode) {
          if (!cancelled) setConnectedChannels(['whatsapp'])
        } else {
          try {
            const { data: integ } = await supabase.from('integrations')
              .select('type').eq('user_id', ownerUserId).eq('status', 'connected')
            if (!cancelled && Array.isArray(integ)) {
              const t = new Set(integ.map(r => r.type))
              // WhatsApp é o canal primário — sempre disponível (evita travar o
              // usuário caso a linha de integração não esteja sincronizada).
              // Instagram/Facebook/Telegram só liberam se conectados de fato.
              const avail = ['whatsapp']
              if (t.has('instagram')) avail.push('instagram')
              if (t.has('facebook'))  avail.push('facebook')
              if (t.has('telegram'))  avail.push('telegram')
              setConnectedChannels(avail)
            }
          } catch (e) { console.warn('[Chat] canais conectados indisponíveis:', e?.message ?? e) }
        }
        if (pendingContactRef.current) await loadConvs(ownerUserId)
      } catch (e) { console.warn('[Chat] erro ao inicializar:', e?.message ?? e) }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [authLoading, ownerUserId, isDemoMode])

  /* Sincroniza conversas reais do WhatsApp (Evolution API) e recarrega a lista.
     Exige que o WhatsApp (ou outro canal) esteja conectado — caso contrário orienta
     o usuário a ir para Integrações, evitando exibir conversas antigas do banco. */
  const doSync = async () => {
    const uid = userRef.current
    if (!uid || syncing) return

    // Verifica se há algum canal conectado antes de buscar conversas.
    const { data: integration } = await supabase
      .from('integrations')
      .select('type')
      .eq('user_id', uid)
      .eq('status', 'connected')
      .maybeSingle()

    if (!integration) {
      setSyncMsg('Nenhum canal conectado. Conecte o WhatsApp (ou outro canal) em Integrações.')
      setTimeout(() => setSyncMsg(''), 5000)
      return
    }

    console.log('[Chat] Sincronizando conversas...')
    setSyncing(true); setSyncMsg('Iniciando...')
    try {
      const count = await syncWhatsAppChats(uid, (m) => setSyncMsg(m))
      await loadConvs(uid)
      setSyncMsg(count > 0 ? `${count} conversa(s) sincronizada(s)` : 'Nenhuma conversa encontrada')
    } catch (e) { console.warn('[Chat] sync falhou:', e?.message ?? e); setSyncMsg('Erro ao sincronizar') }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 4000)
  }

  /* Cria uma nova conversa manualmente (destrava o fluxo quando a Evolution
     não tem histórico). Salva no Supabase, recarrega a lista e abre a conversa.
     Se houver mensagem inicial, o createConversation já a envia via WhatsApp. */
  const handleCreateConversation = async (payload) => {
    const uid = userRef.current
    if (!uid) throw new Error('Não autenticado — faça login novamente.')
    console.log('[Chat] Criando conversa:', payload.contactPhone)
    const conv = await createConversation(uid, payload)
    console.log('[Chat] Conversa criada:', conv?.id)
    await loadConvs(uid)
    if (conv?.id) setSelectedId(conv.id)
    logger.log(uid, 'conversation_created', { category: 'messages', description: `Nova conversa com ${payload.contactName}` })
  }

  /* Exclui uma conversa/número (e suas mensagens) com confirmação */
  const removeConversation = async (id) => {
    if (!id) return
    const conv = conversations.find(c => c.id === id)
    if (!window.confirm(`Excluir a conversa com ${conv?.name ?? 'este contato'}?\n\nIsso remove o número e todas as mensagens. Esta ação não pode ser desfeita.`)) return
    try { await deleteConversation(id); console.log('[Chat] Conversa excluída:', id) }
    catch (e) { console.warn('[Chat] erro ao excluir:', e?.message ?? e) }
    const rest = conversations.filter(c => c.id !== id)
    setConversations(rest)
    setMessages(p => { const n = { ...p }; delete n[id]; return n })
    if (selectedId === id) setSelectedId(rest[0]?.id ?? null)
  }

  /* Corrige o número do contato. Necessário quando o webhook gravou um LID do
     Baileys (ex.: 93519305773219@lid → 93519305773219) em vez do telefone real.
     Atualiza conversations.contact_phone no Supabase e o estado local. */
  const editPhone = async () => {
    if (!sel) return
    const entrada = window.prompt('Número do contato (DDI + DDD + número, só dígitos):', sel.phone || '')
    if (entrada == null) return
    const novo = onlyDigits(entrada)
    if (novo.length < 10 || novo.length > 15) {
      window.alert(`Número inválido: ${novo || '(vazio)'}\nUse DDI + DDD + número (10 a 15 dígitos).`)
      return
    }
    if (novo === onlyDigits(sel.phone)) return
    try {
      const { error } = await supabase.from('conversations').update({ contact_phone: novo }).eq('id', selectedId)
      if (error) throw error
      setConversations(cs => cs.map(c => c.id === selectedId ? { ...c, phone: novo } : c))
      console.log('[Chat] Número atualizado:', selectedId, '→', novo)
    } catch (e) {
      console.warn('[Chat] editPhone falhou:', e?.message ?? e)
      window.alert('Não foi possível atualizar o número:\n' + (e?.message ?? e) + '\n\n(Se já existe outra conversa com esse número, exclua-a antes.)')
    }
  }

  /* PASSO 3 + 6: mensagens da conversa selecionada + marcar como lida */
  useEffect(() => {
    if (!selectedId) return
    let on = true
    ;(async () => {
      setLoadingMsgs(true)
      try {
        // Evolution: puxa da Evolution (recebidas) + Supabase; cai p/ só Supabase se offline.
        const phone = conversations.find(c => c.id === selectedId)?.phone
        let rows
        try { rows = await loadConversationMessages(userRef.current, selectedId, phone) }
        catch { rows = await fetchMessages(selectedId) }
        const data = rows.map(mapMsg)
        console.log('[Chat] Mensagens carregadas:', data.length, { rawSample: rows[0], mapped: data })
        if (data.length === 0) console.warn('[Chat] 0 mensagens para conversation_id', selectedId, '— se há mensagens no banco mas vêm 0 aqui, é RLS: o user_id das mensagens (DEFAULT_USER_ID do webhook) precisa ser igual ao usuário logado.')
        if (on) setMessages(p => ({ ...p, [selectedId]: data }))
      } catch (e) {
        console.warn('[Chat] erro ao carregar mensagens:', e?.message ?? e)
        if (on) setMessages(p => ({ ...p, [selectedId]: p[selectedId] || [] }))
      }
      try { await markConversationRead(selectedId) } catch {}
      if (on) { setConversations(cs => cs.map(c => c.id === selectedId ? { ...c, unread: 0 } : c)); setLoadingMsgs(false) }
    })()
    return () => { on = false }
  }, [selectedId])

  /* PASSO 5: tempo real — novas mensagens via Supabase */
  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel('chat_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${userId}` }, ({ new: r }) => {
        if (!r?.conversation_id) return
        const cid = r.conversation_id, m = mapMsg(r)
        // Conversa ainda não está na lista (novo contato): recarrega para ela aparecer
        if (!convIdsRef.current.has(cid)) { loadConvs(userRef.current); return }
        // Auto-qualificação: ao receber mensagem do lead, qualifica e move etapa se aprovado
        if (m.dir === 'in' && userId) {
          ;(async () => {
            try {
              const { data: cv } = await supabase.from('conversations').select('contact_phone').eq('id', cid).maybeSingle()
              if (cv?.contact_phone) leadQualification.autoQualifyByPhone(userId, cv.contact_phone)
              // A auto-resposta da IA agora roda 24/7 na Edge Function do webhook (server-side).
            } catch {}
          })()
        }
        if (cid === selRef.current) {
          setMessages(p => (p[cid]?.some(x => x.id === m.id) ? p : { ...p, [cid]: [...(p[cid] || []), m] }))
          setConversations(cs => cs.map(c => c.id === cid ? { ...c, preview: m.text ?? c.preview, lt: m.t } : c))
        } else {
          setConversations(cs => {
            const i = cs.findIndex(c => c.id === cid); if (i < 0) return cs
            const up = { ...cs[i], preview: m.text ?? cs[i].preview, lt: m.t, unread: (cs[i].unread || 0) + (m.dir === 'in' ? 1 : 0) }
            return [up, ...cs.filter(c => c.id !== cid)]
          })
        }
      }).subscribe((status) => console.log('[Chat] realtime:', status))
    return () => { try { supabase.removeChannel(ch) } catch {} }
  }, [userId])

  /* TEMPO REAL via Socket.io (substitui o polling).
     O servidor emite 'new_message' quando a Evolution dispara o webhook.
     Atualizamos APENAS a conversa afetada — sem varrer todas a cada 10s. */
  useEffect(() => {
    const onNewMessage = ({ jid, message }) => {
      if (!jid || message?.fromMe) return // ignora as próprias mensagens (já exibidas no envio)
      const phone = onlyDigits(String(jid).split('@')[0])
      const conv = convsRef.current.find(c => onlyDigits(c.phone) === phone)
      // Contato ainda não está na lista → recarrega para ele aparecer.
      if (!conv) { loadConvs(userRef.current); return }

      const cid = conv.id
      const text = message?.text ?? ''
      const t = message?.timestamp ? Number(message.timestamp) * 1000 : Date.now()

      if (cid === selRef.current) {
        // Conversa aberta: recarrega (persiste no Supabase por external_id, sem duplicar).
        loadConversationMessages(userRef.current, cid, conv.phone)
          .then(rows => setMessages(p => ({ ...p, [cid]: rows.map(mapMsg) })))
          .catch(() => {
            // Offline: anexa direto do payload do socket.
            setMessages(p => {
              const cur = p[cid] || []
              const id = message?.id || ('w' + t)
              if (cur.some(x => x.id === id)) return p
              return { ...p, [cid]: [...cur, { id, dir: 'in', type: 'text', text, t, s: 'delivered' }] }
            })
          })
        setConversations(cs => cs.map(c => c.id === cid ? { ...c, preview: text || c.preview, lt: t } : c))
      } else {
        // Conversa fechada: sobe na lista, incrementa badge e faz piscar.
        setConversations(cs => {
          const i = cs.findIndex(c => c.id === cid); if (i < 0) return cs
          const up = { ...cs[i], preview: text || cs[i].preview, lt: t, unread: (cs[i].unread || 0) + 1 }
          return [up, ...cs.filter(c => c.id !== cid)]
        })
        flash(cid)
      }
    }
    const onNewChat = () => loadConvs(userRef.current)
    const onIntegrationConnected = () => {
      setConversations([])
      setSelectedId(null)
      setMessages({})
      if (userRef.current) loadConvs(userRef.current)
    }

    socket.on('new_message', onNewMessage)
    socket.on('new_chat', onNewChat)
    socket.on('integration_connected', onIntegrationConnected)
    return () => {
      socket.off('new_message', onNewMessage)
      socket.off('new_chat', onNewChat)
      socket.off('integration_connected', onIntegrationConnected)
    }
  }, [])

  const upd = (id, s) => setMessages(p => ({ ...p, [selectedId]: (p[selectedId] || []).map(m => m.id === id ? { ...m, s } : m) }))

  /* PASSO 4: enviar mensagem real (salva no Supabase + Evolution via chatService) */
  const send = async () => {
    const text = input.trim(); if (!text || !selectedId) return
    // PASSO 1 — diagnóstico: mostra a conversa (e o contact_phone) usada no envio.
    console.log('[Chat] Conversa selecionada:', JSON.stringify(sel))
    // PASSO 5 — valida o número antes de enviar (evita disparar para LID/lixo).
    // Contatos Meta (fb/ig) e Telegram (tg) já têm prefixo no phone — preserva o
    // prefixo para o roteamento multi-canal funcionar em sendChatMessage.
    const rawPhone = String(conversations.find(c => c.id === selectedId)?.phone || '')
    const isChannelContact = /^(fb|ig|tg)/.test(rawPhone)
    const phone = isChannelContact ? rawPhone : onlyDigits(rawPhone)
    if (!isChannelContact && (phone.length < 10 || phone.length > 15)) {
      window.alert(`Número inválido: ${phone || '(vazio)'}\n\nClique no lápis (✏) ao lado do nome, no topo da conversa, para corrigir o número do contato.`)
      return
    }
    const uid = userRef.current
    if (uid) {
      try { if (!(await usageService.canSend(uid))) { setShowPaywall(true); return } }
      catch (e) { console.warn('[Usage] canSend falhou:', e?.message ?? e) }
    }
    const tmp = 'm' + Date.now()
    setMessages(p => ({ ...p, [selectedId]: [...(p[selectedId] || []), { id: tmp, dir: 'out', text, t: Date.now(), s: 'sending' }] }))
    setInput('')
    setConversations(cs => cs.map(c => c.id === selectedId ? { ...c, preview: text, lt: Date.now() } : c))
    try {
      const saved = await sendChatMessage(uid, selectedId, phone, text)
      setMessages(p => {
        const list = p[selectedId] || []
        const next = list.some(x => x.id === saved.id) ? list.filter(x => x.id !== tmp) : list.map(x => x.id === tmp ? { ...x, id: saved.id, s: 'delivered' } : x)
        return { ...p, [selectedId]: next }
      })
      console.log('[Chat] Mensagem enviada')
      logger.log(uid, 'message_sent', { category: 'messages', description: 'Mensagem enviada para ' + (conversations.find(c => c.id === selectedId)?.name || 'contato') })
    } catch (e) {
      console.warn('[Chat] envio falhou:', e?.message ?? e)
      window.alert('Não foi possível enviar pelo WhatsApp:\n' + (e?.message ?? e))
      const saved = e?.savedMsg
      setMessages(p => ({ ...p, [selectedId]: (p[selectedId] || []).map(x => x.id === tmp ? { ...x, id: saved?.id ?? x.id, s: 'sent' } : x) }))
    }
    if (uid) {
      try { const sent = await usageService.increment(uid); setUsage(u => ({ ...u, messages_sent: sent })) }
      catch (e) { console.warn('[Usage] increment falhou:', e?.message ?? e) }
    }
  }

  /* IA — Sugerir resposta: gera um rascunho personalizado e coloca no campo
     para o atendente revisar/editar antes de enviar (humano no controle). */
  const suggestReply = async () => {
    if (!sel || aiBusy) return
    setAiBusy(true)
    try {
      const res = await generateReply(userRef.current, sel.phone, { contactName: sel.name })
      if (res?.success && res.response) { setInput(res.response); console.log('[Chat] Sugestão IA pronta') }
      else { console.warn('[Chat] IA não gerou sugestão:', res?.error || 'erro desconhecido') }
    } catch (e) { console.warn('[Chat] suggestReply falhou:', e?.message ?? e) }
    setAiBusy(false)
  }

  /* IA — Auto-resposta 24/7: liga/desliga por conversa, gravado em
     conversations.ai_auto_reply. Quem responde é a Edge Function do webhook
     (server-side), então funciona mesmo com o app fechado. */
  const toggleAutoReply = async () => {
    if (!selectedId || !sel) return
    const on = !sel.auto
    setConversations(cs => cs.map(c => c.id === selectedId ? { ...c, auto: on } : c))
    try {
      const { error } = await supabase.from('conversations').update({ ai_auto_reply: on }).eq('id', selectedId)
      if (error) throw error
      console.log('[Chat] Auto-resposta 24/7', on ? 'LIGADA' : 'desligada', 'para', selectedId)
      logger.log(userRef.current, 'ai_auto_reply_toggle', { category: 'messages', description: `Auto-resposta IA ${on ? 'ligada' : 'desligada'} para ${sel.name}` })
    } catch (e) {
      console.warn('[Chat] toggleAutoReply falhou:', e?.message ?? e)
      setConversations(cs => cs.map(c => c.id === selectedId ? { ...c, auto: !on } : c)) // reverte
      window.alert('Não foi possível alterar a auto-resposta: ' + (e?.message ?? e) + '\n\n(Rode o SQL que adiciona a coluna ai_auto_reply.)')
    }
  }

  /* Salva/atualiza cliente vinculado à conversa */
  const saveClient = async () => {
    if (!userId || savingClient) return
    setSavingClient(true)
    try {
      const row = { user_id: userId, name: clientForm.name.trim() || (sel?.name ?? 'Contato'), phone: clientForm.phone.trim() || null, email: clientForm.email.trim() || null, tag: clientForm.tag, channel: clientForm.channel, status: 'active' }
      if (clientId) {
        await supabase.from('clients').update(row).eq('id', clientId)
      } else {
        const { data } = await supabase.from('clients').insert(row).select().single()
        if (data) setClientId(data.id)
      }
      setClientSaved(true)
      setTimeout(() => setClientSaved(false), 2500)
    } catch (e) { console.warn('[Chat] saveClient falhou:', e?.message ?? e) }
    setSavingClient(false)
  }

  /* Transfere a conversa atual para um atendente real (persiste no banco + notifica via socket). */
  const transferTo = async (agent) => {
    setShowTransfer(false)
    const currentId = selRef.current
    const conv = convsRef.current.find(c => c.id === currentId)
    console.log('[transferTo] agent:', agent?.name, '| currentId:', currentId, '| conv:', conv?.name ?? 'NOT FOUND', '| convsRef.len:', convsRef.current.length)
    if (!conv) return
    const agentName = agent.name
    const agentEmail = agent.email || null

    // Persiste a atribuição no Supabase
    try {
      await supabase.from('conversations').update({ assigned_to: agentName }).eq('id', currentId)
    } catch (e) { console.warn('[Chat] transferTo update falhou:', e?.message ?? e) }

    // Emite evento socket para notificar em tempo real todos os clientes conectados
    console.log('[transferTo] emitindo transfer_request | socket.id:', socket.id, '| connected:', socket.connected)
    socket.emit('transfer_request', {
      conversationId: currentId,
      contactName: conv.name,
      contactPhone: conv.phone,
      assignTo: agentName,
      agentName,
      agentEmail,
      timestamp: new Date().toISOString(),
    })

    logger.log(userRef.current, 'conversation_transferred', { category: 'team', description: `Conversa com ${conv.name} transferida para ${agentName}` })
    setTransferMsg(`Conversa transferida para ${agentName}`)
    setTimeout(() => setTransferMsg(''), 2800)
  }

  /* Gravação de áudio real via MediaRecorder */
  const pushAudio = (url) => {
    const id = 'a' + Date.now()
    setMessages(p => ({ ...p, [selectedId]: [...(p[selectedId] || []), { id, dir: 'out', type: 'audio', src: url, dur: '0:00', t: Date.now(), s: 'sending' }] }))
    setTimeout(() => upd(id, 'delivered'), 1000)
    setTimeout(() => upd(id, 'read'), 3000)
  }
  const startRec = async () => {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream); chunksRef.current = []; sendOnStop.current = true
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (sendOnStop.current && blob.size) pushAudio(URL.createObjectURL(blob))
      }
      mr.start(); recRef.current = mr; setRecording(true); setRecSecs(0)
      recTimer.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    } catch { alert('Não foi possível acessar o microfone. Verifique a permissão do navegador (use HTTPS ou localhost).') }
  }
  const stopRec = (doSend) => {
    sendOnStop.current = doSend; clearInterval(recTimer.current); setRecording(false)
    try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop() } catch {}
  }
  useEffect(() => () => { clearInterval(recTimer.current); streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  /* Anexar arquivo: imagem vira mensagem de imagem, qualquer outro vira documento */
  const pickFile = (kind) => { attachKind.current = kind; fileRef.current.accept = kind === 'image' ? 'image/*' : '*/*'; fileRef.current.value = ''; fileRef.current.click(); setShowAttach(false) }
  const onFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const id = 'f' + Date.now(), base = { id, dir: 'out', t: Date.now(), s: 'sending' }
    const isImg = attachKind.current === 'image' && file.type.startsWith('image/')
    const msg = isImg
      ? { ...base, type: 'image', src: URL.createObjectURL(file), cap: file.name }
      : { ...base, type: 'document', src: URL.createObjectURL(file), fn: file.name, fs: file.size < 1048576 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1048576).toFixed(1)} MB` }
    setMessages(p => ({ ...p, [selectedId]: [...(p[selectedId] || []), msg] }))
    setTimeout(() => upd(id, 'delivered'), 1000)
    setTimeout(() => upd(id, 'read'), 3000)
  }

  const filtered = conversations.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display: 'flex', fontFamily: F, height: '100vh', overflow: 'hidden' }}>

      {/* Toast de transferência — aparece no canto superior direito para todos os clientes */}
      {transferToast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, background: '#7C3AED', color: '#fff', borderRadius: 12, padding: '12px 16px', boxShadow: '0 8px 28px rgba(124,58,237,.5)', fontSize: 13, fontWeight: 600, maxWidth: 290, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Bell size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0 }}>Conversa atribuída</p>
            <p style={{ margin: '3px 0 0', fontWeight: 400, fontSize: 12, opacity: .85 }}>
              {transferToast.contactName} → {transferToast.agentName || transferToast.assignTo}
            </p>
          </div>
          <button onClick={() => setTransferToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: .7, padding: 0, display: 'flex', flexShrink: 0 }}><X size={14} /></button>
        </div>
      )}

      {/* ── COLUNA 1 ── */}
      <div style={{ width: isMobile ? '100%' : 320, flexShrink: 0, background: C.panel, borderRight: `1px solid ${C.border}`, display: (isMobile && sel) ? 'none' : 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={() => nav('/dashboard')} title="Voltar" style={iBtn}><ArrowLeft size={20} /></button>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
              {isMember ? `Meu Atendimento` : 'Conversas'}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ position: 'relative' }}>
                <button onClick={() => { setShowNotifs(v => !v); setNotifications(prev => prev.map(n => ({ ...n, read: true }))) }}
                  title="Notificações de transferência"
                  style={{ ...iBtn, color: notifications.some(n => !n.read) ? C.purple : C.muted }}>
                  <Bell size={20} />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span style={{ position: 'absolute', top: 0, right: 0, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 15, height: 15, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>
              </div>
              <button onClick={() => setShowNew(true)} title="Nova conversa" style={{ ...iBtn, color: C.purple }}><Plus size={22} /></button>
            </div>
          </div>
          {showNotifs && (
            <div style={{ position: 'absolute', top: 60, left: 0, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, maxHeight: 280, overflowY: 'auto', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.5)', margin: '0 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 8px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Transferências recebidas</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {notifications.length > 0 && <button onClick={() => setNotifications([])} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: F }}>Limpar</button>}
                  <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={14} /></button>
                </div>
              </div>
              {notifications.length === 0 ? (
                <p style={{ margin: '12px 4px', fontSize: 12, color: C.dim }}>Nenhuma notificação ainda</p>
              ) : notifications.map(n => (
                <div key={n.id} style={{ padding: '8px 6px', borderRadius: 6, marginBottom: 2, background: n.read ? 'transparent' : C.purple + '18' }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: C.text, fontWeight: n.read ? 400 : 600 }}>
                    <strong>{n.contactName}</strong> → <strong>{n.agentName || n.assignTo}</strong>
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.dim }}>
                    {n.source === 'flow' ? '⚡ Funil automático' : '👤 Transferência manual'} · {n.timestamp ? new Date(n.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'agora'}
                  </p>
                </div>
              ))}
            </div>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa"
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', color: C.text, fontSize: 13, outline: 'none', fontFamily: F, boxSizing: 'border-box' }} />
          {!isMember && <button onClick={doSync} disabled={syncing} title="Sincronizar conversas do WhatsApp"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: syncing ? C.border : 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)', border: 'none', borderRadius: 10, padding: '11px 14px',
              color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F, cursor: syncing ? 'default' : 'pointer',
              boxShadow: syncing ? 'none' : '0 4px 14px rgba(124,58,237,.35)', transition: 'opacity .15s, box-shadow .15s' }}>
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar conversas'}
          </button>}
          {!isMember && (syncing || syncMsg) && <p style={{ margin: '8px 0 0', fontSize: 11, color: C.muted, textAlign: 'center' }}>{syncMsg}</p>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Carregando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>
              <p style={{ margin: '0 0 12px' }}>Nenhuma conversa ainda</p>
              <button onClick={() => setShowNew(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)', border: 'none', borderRadius: 10, padding: '9px 14px', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: F, cursor: 'pointer' }}>
                <Plus size={15} /> Nova conversa
              </button>
            </div>
          ) : filtered.map(c => (
            <div key={c.id} onClick={() => setSelectedId(c.id)}
              onMouseEnter={() => setHoverId(c.id)} onMouseLeave={() => setHoverId(h => h === c.id ? null : h)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: c.id === selectedId ? C.border : 'transparent', borderBottom: `1px solid ${C.bg}` }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: c.av, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15 }}>{ini(c.name)}</div>
                {c.online && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', background: C.green, border: `2px solid ${C.panel}` }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: C.dim, flexShrink: 0, marginLeft: 6 }}>{rel(c.lt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                  <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{trunc(c.preview)}</span>
                  {c.unread > 0 && <span className={flashIds.has(c.id) ? 'animate-pulse' : ''} style={{ background: flashIds.has(c.id) ? C.green : C.purple, color: '#fff', borderRadius: '50%', minWidth: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 6, padding: '0 5px', boxSizing: 'border-box', boxShadow: flashIds.has(c.id) ? `0 0 0 3px ${C.green}55` : 'none' }}>{c.unread}</span>}
                </div>
              </div>
              {hoverId === c.id && (
                <button onClick={e => { e.stopPropagation(); removeConversation(c.id) }} title="Excluir conversa"
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 4, flexShrink: 0, display: 'flex' }}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── COLUNA 2 ── */}
      <div style={{ flex: 1, background: C.bg, display: (isMobile && !sel) ? 'none' : 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!sel ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14 }}>
            {loading ? 'Carregando...' : 'Nenhuma conversa ainda'}
          </div>
        ) : (
        <>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', gap: 12 }}>
          {isMobile && (
            <button onClick={() => setSelectedId(null)} title="Voltar à lista" style={iBtn}><ArrowLeft size={20} /></button>
          )}
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: sel.av, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{ini(sel.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>{sel.name}</p>
            <p style={{ margin: 0, fontSize: 11, color: typing ? C.green : C.dim }}>{typing ? 'Digitando...' : 'Online'}</p>
          </div>
          <button onClick={toggleAutoReply} title={sel.auto ? 'Auto-resposta IA 24/7: LIGADA (clique para desligar)' : 'Auto-resposta IA 24/7: desligada (clique para ligar)'}
            style={{ ...iBtn, color: sel.auto ? C.green : C.muted }}><Bot size={20} /></button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowTransfer(v => !v)} title="Transferir conversa" style={{ ...iBtn, color: showTransfer ? C.purple : C.muted }}><ArrowRightLeft size={19} /></button>
            {showTransfer && (
              <div style={{ position: 'absolute', top: 38, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, width: 220, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)', maxHeight: 240, overflowY: 'auto' }}>
                <p style={{ margin: '4px 8px 6px', fontSize: 11, color: C.muted, fontWeight: 700 }}>Transferir para</p>
                {teamMembers.length === 0 ? (
                  <p style={{ margin: '8px', fontSize: 12, color: C.dim }}>Nenhum membro na equipe.<br/>Adicione em Equipe.</p>
                ) : teamMembers.map(a => (
                  <button key={a.id} onClick={() => transferTo(a)}
                    style={{ display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.text, fontSize: 13, padding: '8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.border} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <span>{a.name}</span>
                    {a.role && <span style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{a.role}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={editPhone} title={sel.phone ? `Editar número (${sel.phone})` : 'Editar número'} style={{ ...iBtn, color: C.muted }}><Pencil size={17} /></button>
          <button onClick={() => removeConversation(selectedId)} title="Excluir conversa" style={{ ...iBtn, color: C.muted }}><Trash2 size={19} /></button>
          <button onClick={() => setShowPanel(v => !v)} title="Painel" style={{ ...iBtn, color: showPanel ? C.purple : C.muted }}><PanelRight size={20} /></button>
        </div>
        {transferMsg && <div style={{ background: C.purple + '22', color: C.purple, fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>✓ {transferMsg}</div>}
        {sel.auto && <div style={{ background: C.green + '18', color: C.green, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}><Bot size={14} /> IA respondendo automaticamente 24/7</div>}

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 8%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loadingMsgs ? (
            <div style={{ margin: 'auto', color: C.muted, fontSize: 13 }}>Carregando...</div>
          ) : msgs.length === 0 ? (
            <div style={{ margin: 'auto', color: C.muted, fontSize: 13 }}>Envie a primeira mensagem</div>
          ) : msgs.map(m => {
            const out = m.dir === 'out'
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '70%', padding: '8px 12px', background: out ? C.purple : C.panel, color: C.text, fontSize: 13.5, lineHeight: 1.45, borderRadius: out ? '16px 16px 0 16px' : '16px 16px 16px 0', boxShadow: '0 1px 1px rgba(0,0,0,.2)' }}>
                  {m.type === 'image' ? (
                    <div>
                      <img src={m.src || 'https://placehold.co/200x150/1E293B/7C3AED?text=Foto'} alt="" style={{ width: 200, height: 150, borderRadius: 8, display: 'block', objectFit: 'cover' }} />
                      {m.cap && <p style={{ margin: '5px 0 0', fontSize: 13 }}>{m.cap}</p>}
                    </div>
                  ) : m.type === 'audio' ? <Audio src={m.src} dur={m.dur} out={out} />
                  : m.type === 'document' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#334155', borderRadius: 8, padding: 10 }}>
                      <FileText size={26} color={out ? '#fff' : '#A78BFA'} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.fn}</p>
                        <p style={{ margin: 0, fontSize: 11, opacity: .6 }}>{m.fs}</p>
                      </div>
                      <a href={m.src || undefined} download={m.fn} title="Baixar" style={{ color: '#fff', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><Download size={17} /></a>
                    </div>
                  ) : <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: sanitizeMessage(m.text) }} />}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <span style={{ fontSize: 11, opacity: .6 }}>{hm(m.t)}</span>
                    {out && <Tick s={m.s} />}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input ref={fileRef} type="file" onChange={onFile} style={{ display: 'none' }} />
          {recording ? (
            <>
              <button onClick={() => stopRec(false)} title="Cancelar gravação" style={{ ...iBtn, color: '#EF4444' }}><Trash2 size={22} /></button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: C.bg, borderRadius: 24, padding: '11px 16px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: C.text, fontSize: 14 }}>Gravando... {fmtSecs(recSecs)}</span>
              </div>
              <button onClick={() => stopRec(true)} title="Enviar áudio" style={{ width: 44, height: 44, borderRadius: '50%', background: C.purple, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={20} color="#fff" /></button>
            </>
          ) : (
            <>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setShowAttach(v => !v)} title="Anexar" style={{ ...iBtn, color: showAttach ? C.purple : C.muted }}><Paperclip size={22} style={{ transform: 'rotate(-45deg)' }} /></button>
                {showAttach && (
                  <>
                    <div onClick={() => setShowAttach(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: '#233138', border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px 0', zIndex: 21, boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>
                      {[[<ImageIcon size={17} color="#A78BFA" key="i" />, 'Imagem', 'image'], [<FileText size={17} color="#60A5FA" key="d" />, 'Documento', 'doc']].map(([ic, lb, k]) => (
                        <button key={lb} onClick={() => pickFile(k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 22px 9px 16px', background: 'none', border: 'none', color: C.text, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', width: '100%', fontFamily: F }}>{ic} {lb}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setShowTemplates(v => !v)} title="Inserir template"
                  style={{ ...iBtn, color: showTemplates ? C.purple : C.muted }}><MessageSquareText size={21} /></button>
                {showTemplates && (
                  <>
                    <div onClick={() => setShowTemplates(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 280, maxHeight: 320, overflowY: 'auto', background: '#233138', border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px 0', zIndex: 21, boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>
                      {templates.length === 0 ? (
                        <div style={{ padding: '12px 16px', fontSize: 12, color: C.muted }}>Nenhum template. Crie em Templates.</div>
                      ) : templates.map(t => (
                        <button key={t.id} onClick={() => { setInput(t.msg); setShowTemplates(false); setTemplates(p => p.map(x => x.id === t.id ? { ...x, uses: x.uses + 1 } : x)); incrementTemplateUse(t.id, t.uses).catch(() => {}) }}
                          style={{ display: 'block', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', color: C.text, cursor: 'pointer', fontSize: 13, width: '100%', fontFamily: F }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.msg}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={suggestReply} disabled={aiBusy} title="Sugerir resposta com IA"
                style={{ ...iBtn, color: aiBusy ? C.dim : C.purple, flexShrink: 0, cursor: aiBusy ? 'default' : 'pointer' }}>
                {aiBusy ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              </button>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={aiBusy ? 'Gerando sugestão...' : 'Mensagem'}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 24, padding: '11px 16px', color: C.text, fontSize: 14, outline: 'none', fontFamily: F }} />
              {input.trim()
                ? <button onClick={send} title="Enviar" style={{ width: 44, height: 44, borderRadius: '50%', background: C.purple, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={20} color="#fff" /></button>
                : <button onClick={startRec} title="Gravar áudio" style={{ width: 44, height: 44, borderRadius: '50%', background: C.purple, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic size={21} color="#fff" /></button>
              }
            </>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── COLUNA 3: painel contato ── */}
      {showPanel && sel && (
        <div style={{ width: 300, flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.border}`, display: isMobile ? 'none' : 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          {/* Cabeçalho fixo */}
          <div style={{ padding: '14px 16px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: sel.av, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, margin: '0 auto 6px' }}>{ini(sel.name)}</div>
                <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: C.text }}>{sel.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{sel.phone ? (String(sel.phone).startsWith('fb') || String(sel.phone).startsWith('ig') || String(sel.phone).startsWith('tg') ? sel.phone : `+${sel.phone}`) : '—'}</p>
              </div>
              <button onClick={() => setShowPanel(false)} style={{ ...iBtn, alignSelf: 'flex-start' }}>×</button>
            </div>
            {/* Abas */}
            <div style={{ display: 'flex', gap: 0 }}>
              {[['contato', 'Contato'], ['info', 'Informações']].map(([tab, label]) => (
                <button key={tab} onClick={() => setPanelTab(tab)}
                  style={{ flex: 1, background: 'none', border: 'none', borderBottom: `2px solid ${panelTab === tab ? C.purple : 'transparent'}`, color: panelTab === tab ? C.purple : C.muted, fontWeight: panelTab === tab ? 700 : 400, fontSize: 13, padding: '8px 4px', cursor: 'pointer', fontFamily: F, transition: 'all .15s' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo scrollável */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {panelTab === 'contato' ? (
              <>
                <LeadScorePanel contactId={sel.id} userId={userId} />
                <NotesPanel contactId={sel.id} userId={userId} />
                <button onClick={() => nav('/clients')} style={{ display: 'block', textAlign: 'center', background: C.purple, color: '#fff', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', marginTop: 16, width: '100%', boxSizing: 'border-box' }}>Ver no CRM</button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {clientId ? 'Dados salvos no CRM' : 'Novo cliente — preencha e salve'}
                </p>

                {/* Nome */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 5 }}>
                    <User size={12} /> Nome completo
                  </label>
                  <input value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Nome do cliente"
                    style={{ width: '100%', background: '#0F172A', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', fontFamily: F, boxSizing: 'border-box' }} />
                </div>

                {/* Telefone */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 5 }}>
                    <Phone size={12} /> Telefone
                  </label>
                  <input value={clientForm.phone} onChange={e => setClientForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+55 11 99999-9999" type="tel"
                    style={{ width: '100%', background: '#0F172A', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', fontFamily: F, boxSizing: 'border-box' }} />
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 5 }}>
                    <Mail size={12} /> E-mail
                  </label>
                  <input value={clientForm.email} onChange={e => setClientForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="email@exemplo.com" type="email"
                    style={{ width: '100%', background: '#0F172A', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', fontFamily: F, boxSizing: 'border-box' }} />
                </div>

                {/* Status do Lead */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>
                    <Tag size={12} /> Status do Lead
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {['Prospect', 'Lead Quente', 'Cliente', 'VIP', 'Inativo'].map(opt => (
                      <button key={opt} onClick={() => setClientForm(p => ({ ...p, tag: opt }))}
                        style={{ padding: '6px 4px', borderRadius: 8, border: `1px solid ${clientForm.tag === opt ? C.purple : C.border}`, background: clientForm.tag === opt ? C.purple + '33' : 'transparent', color: clientForm.tag === opt ? '#A78BFA' : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F, transition: 'all .15s' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Canal */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>
                    Canal de origem
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[['whatsapp','WhatsApp','#22C55E'],['instagram','Instagram','#EC4899'],['facebook','Facebook','#3B82F6'],['telegram','Telegram','#0EA5E9'],['email','E-mail','#A78BFA'],['indicação','Indicação','#F59E0B']].map(([val, lbl, clr]) => (
                      <button key={val} onClick={() => setClientForm(p => ({ ...p, channel: val }))}
                        style={{ padding: '6px 2px', borderRadius: 8, border: `1px solid ${clientForm.channel === val ? clr : C.border}`, background: clientForm.channel === val ? clr + '22' : 'transparent', color: clientForm.channel === val ? clr : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F, transition: 'all .15s' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botão salvar */}
                <button onClick={saveClient} disabled={savingClient}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: clientSaved ? C.green : C.purple, color: '#fff', fontSize: 13, fontWeight: 700, cursor: savingClient ? 'default' : 'pointer', fontFamily: F, transition: 'background .3s', opacity: savingClient ? 0.7 : 1 }}>
                  {savingClient ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {clientSaved ? 'Salvo!' : clientId ? 'Atualizar dados' : 'Salvar no CRM'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showNew && <NewConversationModal
        onClose={() => { setShowNew(false); setNewContactPrefill(null) }}
        onCreate={handleCreateConversation}
        onGoToIntegrations={() => nav('/integrations')}
        availableChannels={connectedChannels}
        initialName={newContactPrefill?.name ?? ''}
        initialPhone={newContactPrefill?.phone ?? ''}
      />}

      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} used={usage.messages_sent} limit={usage.messages_limit} />
    </div>
  )
}
