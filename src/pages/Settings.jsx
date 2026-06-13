import React, { useState, useEffect } from 'react'
import { Layout } from '@components/Layout/Layout'
import { User, Lock, Bell, CreditCard, Key, Shield, ChevronRight, Crown, Check, Loader2, CheckCircle, Eye, EyeOff, ExternalLink, Camera, Monitor, Smartphone, LogOut, Download, X, Bot, Brain, Sparkles, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { NicheSetup } from '@components/NicheSetup'
import { usePlan } from '@hooks/usePlan'
import { downloadInvoicePDF } from '@utils/exportUtils'
import { logger } from '@services/activityLogger'
import clsx from 'clsx'

const sections = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'security', label: 'Segurança', icon: Lock },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'billing', label: 'Planos & Faturamento', icon: CreditCard },
  { id: 'api', label: 'API & Webhooks', icon: Key },
]

const timezones = [
  { value: 'America/Sao_Paulo', label: 'América/São Paulo (GMT-3)' },
  { value: 'America/Manaus', label: 'América/Manaus (GMT-4)' },
  { value: 'America/Cuiaba', label: 'América/Cuiabá (GMT-4)' },
  { value: 'America/Fortaleza', label: 'América/Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'América/Recife (GMT-3)' },
  { value: 'America/Rio_Branco', label: 'América/Rio Branco (GMT-5)' },
]

const languages = [
  { value: 'pt-BR', label: 'Português (BR)' },
  { value: 'en', label: 'Inglês' },
  { value: 'es', label: 'Espanhol' },
]

const mockSessions = [
  { id: 1, browser: 'Chrome', os: 'Windows', ip: '189.45.123.10', date: '31 mai 2026, 14:22', current: true },
  { id: 2, browser: 'Safari', os: 'iPhone', ip: '177.92.88.4', date: '30 mai 2026, 09:15', current: false },
  { id: 3, browser: 'Firefox', os: 'Linux', ip: '201.17.55.231', date: '28 mai 2026, 21:48', current: false },
]

// ── Notification preferences ──
const notifGroups = [
  {
    label: 'Mensagens',
    items: [
      { id: 'msg_new',       label: 'Nova mensagem recebida',           defaultOn: true },
      { id: 'msg_unread',    label: 'Mensagem não lida há 30min',       defaultOn: true },
      { id: 'msg_campaign',  label: 'Contato respondeu campanha',       defaultOn: false },
    ],
  },
  {
    label: 'CRM',
    items: [
      { id: 'crm_stage',     label: 'Lead moveu de etapa',              defaultOn: true },
      { id: 'crm_deal',      label: 'Deal fechado',                     defaultOn: true },
      { id: 'crm_inactive',  label: 'Lead inativo há 7 dias',           defaultOn: false },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'sys_flow_err',  label: 'Flow com erro',                    defaultOn: true },
      { id: 'sys_campaign',  label: 'Campanha concluída',               defaultOn: true },
      { id: 'sys_limit',     label: 'Limite de envios atingido',        defaultOn: true },
    ],
  },
]

const notifChannels = [
  { id: 'email', label: 'Email' },
  { id: 'push',  label: 'Push browser' },
  { id: 'whatsapp', label: 'WhatsApp' },
]

// ── Billing ──
const billingPlans = [
  {
    id: 'starter', name: 'Starter', price: 'R$ 67', period: '/mês',
    features: [
      { label: '1.000 mensagens/mês', ok: true },
      { label: '1 atendente',         ok: true },
      { label: '1 flow',              ok: true },
      { label: 'Inteligência Artificial', ok: false },
    ],
  },
  {
    id: 'pro', name: 'Pro', price: 'R$ 197', period: '/mês',
    features: [
      { label: '10.000 mensagens/mês', ok: true },
      { label: '5 atendentes',         ok: true },
      { label: 'Flows ilimitados',     ok: true },
      { label: 'Inteligência Artificial', ok: true },
    ],
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 'R$ 497', period: '/mês',
    features: [
      { label: 'Mensagens ilimitadas',   ok: true },
      { label: 'Atendentes ilimitados',  ok: true },
      { label: 'Inteligência Artificial', ok: true },
      { label: 'API dedicada',           ok: true },
      { label: 'Suporte prioritário',    ok: true },
    ],
  },
]

const mockInvoices = [
  { id: 'inv-2026-05', date: '01 mai 2026', amount: 'R$ 197,00', status: 'Pago' },
  { id: 'inv-2026-04', date: '01 abr 2026', amount: 'R$ 197,00', status: 'Pago' },
  { id: 'inv-2026-03', date: '01 mar 2026', amount: 'R$ 197,00', status: 'Pago' },
]

const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'U'

// Password input with show/hide toggle (module scope to preserve focus across renders)
const PwdInput = ({ value, onChange, show, setShow, placeholder }) => (
  <div style={{ position: 'relative' }}>
    <input
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ ...inputStyle, paddingRight: 40 }}
    />
    <button type="button" onClick={() => setShow(v => !v)}
      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, display: 'inline-flex', alignItems: 'center' }}>
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
)

// Reusable on/off switch (green active, gray inactive)
const Toggle = ({ on, onClick }) => (
  <button type="button" onClick={onClick}
    style={{
      width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
      background: on ? C.green : C.border, position: 'relative', flexShrink: 0,
      transition: 'background 0.2s',
    }}>
    <span style={{
      position: 'absolute', top: 3, left: on ? 25 : 3, width: 20, height: 20,
      borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
    }} />
  </button>
)

// ── Theme (inline styles) ──
const C = {
  bg: '#0F172A',
  card: '#1E293B',
  border: '#334155',
  text: '#F8FAFC',
  muted: '#94A3B8',
  purple: '#7C3AED',
  red: '#EF4444',
  green: '#22C55E',
  yellow: '#EAB308',
}
const FONT = "'DM Sans', sans-serif"

const labelStyle = { display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontFamily: FONT }
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  color: C.text,
  fontSize: 14,
  fontFamily: FONT,
  outline: 'none',
  boxSizing: 'border-box',
}
const cardStyle = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 20,
  fontFamily: FONT,
}

// password strength helper
const getStrength = (pwd) => {
  if (!pwd) return { score: 0, label: '', color: C.border, pct: 0 }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Fraca', color: C.red, pct: 33 }
  if (score <= 3) return { score, label: 'Média', color: C.yellow, pct: 66 }
  return { score, label: 'Forte', color: C.green, pct: 100 }
}

export const Settings = () => {
  const { user, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const { plan: usagePlan } = usePlan()
  const [active, setActive]         = useState('profile')
  const [name, setName]             = useState('')
  const [plan, setPlan]             = useState('starter')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')

  // Profile extra fields
  const [phone, setPhone]       = useState('')
  const [company, setCompany]   = useState('')
  const [role, setRole]         = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [language, setLanguage] = useState('pt-BR')
  const [toast, setToast]       = useState(false)

  // Security
  const [curPwd, setCurPwd]         = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCur, setShowCur]       = useState(false)
  const [showNew, setShowNew]       = useState(false)
  const [showConf, setShowConf]     = useState(false)
  const [pwdMsg, setPwdMsg]         = useState({ type: '', text: '' })
  const [pwdSaving, setPwdSaving]   = useState(false)
  const [twoFA, setTwoFA]           = useState(false)
  const [sessions, setSessions]     = useState(mockSessions)

  const [geminiKey, setGeminiKey]       = useState('')
  const [groqKey, setGroqKey]           = useState('')
  const [openaiKey, setOpenaiKey]       = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [showGem, setShowGem]           = useState(false)
  const [showGroq, setShowGroq]         = useState(false)
  const [showOAI, setShowOAI]           = useState(false)
  const [showAnt, setShowAnt]           = useState(false)
  const [keysSaving, setKeysSaving]     = useState(false)
  const [keysMsg, setKeysMsg]           = useState('')

  // Notifications
  const [notifs, setNotifs] = useState(() =>
    Object.fromEntries(notifGroups.flatMap(g => g.items.map(i => [i.id, i.defaultOn]))))
  const [channels, setChannels] = useState({ email: true, push: true, whatsapp: false })
  const [quietHours, setQuietHours]   = useState(true)
  const [quietFrom, setQuietFrom]     = useState('22:00')
  const [quietTo, setQuietTo]         = useState('07:00')
  const [notifSaved, setNotifSaved]   = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifError, setNotifError]   = useState('')

  const toggleNotif   = (id) => setNotifs(n => ({ ...n, [id]: !n[id] }))
  const toggleChannel = (id) => setChannels(c => ({ ...c, [id]: !c[id] }))

  const flashSaved = () => {
    setNotifSaved(true)
    setToast(true)
    setTimeout(() => { setToast(false); setNotifSaved(false) }, 3000)
  }

  const handleSaveNotifs = async () => {
    setNotifError('')
    if (isDemoMode || !user) { flashSaved(); return }  // demo: não persiste
    setNotifSaving(true)
    try {
      const { error } = await supabase.from('settings').upsert({
        user_id:            user.id,
        notification_prefs: { notifs, channels, quietHours, quietFrom, quietTo },
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw error
      flashSaved()
    } catch (e) {
      setNotifError(e.message || 'Erro ao salvar preferências')
    } finally {
      setNotifSaving(false)
    }
  }

  useEffect(() => {
    if (user) {
      const meta = user.user_metadata ?? {}
      setName(meta.full_name ?? user.email?.split('@')[0] ?? '')
      setPhone(meta.phone ?? '')
      setCompany(meta.company ?? '')
      setRole(meta.role ?? '')
      if (meta.timezone) setTimezone(meta.timezone)
      if (meta.language) setLanguage(meta.language)
      supabase.from('profiles').select('plan').eq('id', user.id).single()
        .then(({ data }) => { if (data?.plan) setPlan(data.plan) })
      // select('*') em vez de colunas nomeadas: não quebra se notification_prefs
      // ainda não tiver sido migrada no banco (mantém o sistema no ar).
      supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.gemini_key)    setGeminiKey(data.gemini_key)
          if (data?.groq_key)      setGroqKey(data.groq_key)
          if (data?.openai_key)    setOpenaiKey(data.openai_key)
          if (data?.anthropic_key) setAnthropicKey(data.anthropic_key)
          const p = data?.notification_prefs
          if (p) {
            if (p.notifs)   setNotifs(n => ({ ...n, ...p.notifs }))
            if (p.channels) setChannels(c => ({ ...c, ...p.channels }))
            if (typeof p.quietHours === 'boolean') setQuietHours(p.quietHours)
            if (p.quietFrom) setQuietFrom(p.quietFrom)
            if (p.quietTo)   setQuietTo(p.quietTo)
          }
        })
    }
  }, [user])

  const handleSaveKeys = async () => {
    if (!user || isDemoMode) return
    setKeysSaving(true)
    setKeysMsg('')
    try {
      const { error } = await supabase.from('settings').upsert({
        user_id:       user.id,
        gemini_key:    geminiKey.trim()    || null,
        groq_key:      groqKey.trim()      || null,
        openai_key:    openaiKey.trim()    || null,
        anthropic_key: anthropicKey.trim() || null,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw error
      logger.log(user.id, 'api_key_updated', { category: 'settings', description: 'Chave de API atualizada' })
      setKeysMsg('Chaves salvas com segurança')
      setTimeout(() => setKeysMsg(''), 4000)
    } catch (e) {
      setKeysMsg('Erro: ' + e.message)
    } finally {
      setKeysSaving(false)
    }
  }

  const handleSave = async () => {
    setSaveError('')
    if (isDemoMode) {
      // demo: just show toast
      setToast(true)
      setTimeout(() => setToast(false), 3000)
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          phone:     phone.trim(),
          company:   company.trim(),
          role:      role.trim(),
          timezone,
          language,
        },
      })
      if (error) throw error
      logger.log(user?.id, 'profile_updated', { category: 'settings', description: 'Perfil atualizado' })
      setToast(true)
      setTimeout(() => setToast(false), 3000)
    } catch (err) {
      setSaveError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePassword = async () => {
    setPwdMsg({ type: '', text: '' })
    if (!curPwd || !newPwd || !confirmPwd) {
      setPwdMsg({ type: 'error', text: 'Preencha todos os campos.' })
      return
    }
    if (newPwd.length < 8 || !/[A-Z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
      setPwdMsg({ type: 'error', text: 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula e 1 número.' })
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'error', text: 'As senhas não coincidem.' })
      return
    }
    if (isDemoMode) {
      setPwdMsg({ type: 'success', text: 'Senha atualizada! (modo demo)' })
      setCurPwd(''); setNewPwd(''); setConfirmPwd('')
      return
    }
    setPwdSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw error
      setPwdMsg({ type: 'success', text: 'Senha atualizada com sucesso!' })
      setCurPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.message || 'Erro ao atualizar senha.' })
    } finally {
      setPwdSaving(false)
    }
  }

  const endSession = (id) => setSessions(s => s.filter(x => x.id !== id))
  const endAllOthers = () => setSessions(s => s.filter(x => x.current))

  const avatarInitials = getInitials(name || (user?.email?.split('@')[0] ?? 'U'))
  // Plano vigente vem do uso real (usage / localStorage demo); cai para o default se for 'free'.
  const currentPlanId = (usagePlan?.plan && billingPlans.some(b => b.id === usagePlan.plan))
    ? usagePlan.plan
    : (isDemoMode ? 'starter' : plan)
  const strength = getStrength(newPwd)

  // shared button styles
  const purpleBtn = (disabled) => ({
    padding: '11px 20px', background: C.purple, border: 'none', borderRadius: 10,
    color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: FONT,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 8,
  })

  return (
    <Layout title="Configurações" subtitle="Gerencie sua conta">
      {/* Toast sucesso */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: C.green, color: '#fff', padding: '12px 20px',
          borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={16} /> {notifSaved ? 'Preferências salvas!' : 'Perfil atualizado!'}
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0 space-y-1">
          {sections.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all',
                  active === s.id
                    ? 'bg-brand-orange/15 text-brand-orange border border-brand-orange/30'
                    : 'text-slate-400 hover:text-white hover:bg-dark-500'
                )}
              >
                <Icon size={16} />
                <span className="font-medium">{s.label}</span>
                {active === s.id && <ChevronRight size={14} className="ml-auto" />}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 glass rounded-2xl p-6 animate-fade-in">

          {/* ── Profile ── */}
          {active === 'profile' && (
            <div style={{ fontFamily: FONT, color: C.text }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 24 }}>Perfil</h2>

              {isDemoMode && (
                <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)',
                  color: C.yellow, fontSize: 13 }}>
                  Você está no modo demo. Crie uma conta para salvar suas informações.
                </div>
              )}

              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.purple}, #4F46E5)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {avatarInitials}
                </div>
                <div>
                  <button style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 10, color: C.text, fontSize: 13, fontWeight: 500,
                    fontFamily: FONT, cursor: 'pointer',
                  }}>
                    <Camera size={14} /> Alterar foto
                  </button>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>JPG ou PNG, máx. 2MB</p>
                </div>
              </div>

              {saveError && (
                <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.red}`, color: C.red, fontSize: 13 }}>
                  {saveError}
                </div>
              )}

              {/* Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Nome completo</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    placeholder="Seu nome completo" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={user?.email ?? 'demo@riseflow.app'} disabled
                    style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }} />
                </div>
                <div>
                  <label style={labelStyle}>Telefone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Empresa</label>
                  <input value={company} onChange={e => setCompany(e.target.value)}
                    placeholder="Nome da empresa" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Cargo</label>
                  <input value={role} onChange={e => setRole(e.target.value)}
                    placeholder="Seu cargo" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fuso horário</label>
                  <select value={timezone} onChange={e => setTimezone(e.target.value)} style={inputStyle}>
                    {timezones.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Idioma</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>
                    {languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={handleSave} disabled={saving || !name.trim()} style={{ ...purpleBtn(saving || !name.trim()), marginTop: 8 }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

          {/* ── Security ── */}
          {active === 'security' && (
            <div style={{ fontFamily: FONT, color: C.text }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 24 }}>Segurança</h2>

              {/* Alterar senha */}
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: C.text }}>Alterar senha</h3>

                <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
                  <div>
                    <label style={labelStyle}>Senha atual</label>
                    <PwdInput value={curPwd} onChange={e => setCurPwd(e.target.value)}
                      show={showCur} setShow={setShowCur} placeholder="••••••••" />
                  </div>
                  <div>
                    <label style={labelStyle}>Nova senha</label>
                    <PwdInput value={newPwd} onChange={e => setNewPwd(e.target.value)}
                      show={showNew} setShow={setShowNew} placeholder="••••••••" />
                    {newPwd && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ height: 6, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${strength.pct}%`, background: strength.color,
                            transition: 'width 0.3s, background 0.3s' }} />
                        </div>
                        <p style={{ fontSize: 11, color: strength.color, marginTop: 4, fontWeight: 600 }}>
                          Força: {strength.label}
                        </p>
                      </div>
                    )}
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                      Mínimo 8 caracteres, 1 maiúscula e 1 número.
                    </p>
                  </div>
                  <div>
                    <label style={labelStyle}>Confirmar nova senha</label>
                    <PwdInput value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                      show={showConf} setShow={setShowConf} placeholder="••••••••" />
                  </div>
                </div>

                {pwdMsg.text && (
                  <p style={{ fontSize: 13, marginTop: 14,
                    color: pwdMsg.type === 'success' ? C.green : C.red }}>
                    {pwdMsg.text}
                  </p>
                )}

                <button onClick={handleUpdatePassword} disabled={pwdSaving}
                  style={{ ...purpleBtn(pwdSaving), marginTop: 16 }}>
                  {pwdSaving ? <Loader2 size={15} className="animate-spin" /> : null}
                  {pwdSaving ? 'Atualizando...' : 'Atualizar senha'}
                </button>
              </div>

              {/* 2FA */}
              <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Autenticação de 2 fatores</h3>
                  <p style={{ fontSize: 13, color: C.muted, maxWidth: 520 }}>
                    Adicione uma camada extra de segurança exigindo um código do seu app autenticador
                    além da senha ao fazer login.
                  </p>
                </div>
                <button onClick={() => setTwoFA(v => !v)}
                  style={{
                    width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: twoFA ? C.green : C.border, position: 'relative', flexShrink: 0,
                    transition: 'background 0.2s',
                  }}>
                  <span style={{
                    position: 'absolute', top: 3, left: twoFA ? 25 : 3, width: 20, height: 20,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
              </div>

              {/* Sessões ativas */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16 }}>Sessões ativas</h3>

                <div style={{ display: 'grid', gap: 10 }}>
                  {sessions.map(s => {
                    const DeviceIcon = s.os === 'iPhone' ? Smartphone : Monitor
                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 14px', background: C.bg, border: `1px solid ${C.border}`,
                        borderRadius: 10,
                      }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.card,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <DeviceIcon size={18} color={C.muted} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                            {s.browser} · {s.os}
                            {s.current && (
                              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: C.green,
                                background: 'rgba(34,197,94,0.12)', padding: '2px 8px', borderRadius: 6 }}>
                                ATUAL
                              </span>
                            )}
                          </p>
                          <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                            IP {s.ip} · {s.date}
                          </p>
                        </div>
                        {!s.current && (
                          <button onClick={() => endSession(s.id)}
                            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                              color: C.muted, fontSize: 12, fontFamily: FONT, padding: '6px 12px', cursor: 'pointer' }}>
                            Encerrar sessão
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {sessions.some(s => !s.current) && (
                  <button onClick={endAllOthers}
                    style={{
                      marginTop: 16, padding: '10px 18px', background: C.red, border: 'none',
                      borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}>
                    <LogOut size={14} /> Encerrar todas as outras sessões
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Billing ── */}
          {active === 'billing' && (() => {
            const current = billingPlans.find(p => p.id === currentPlanId) ?? billingPlans[1]
            const currentIdx = billingPlans.findIndex(p => p.id === current.id)
            return (
            <div style={{ fontFamily: FONT, color: C.text }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 24 }}>Planos & Faturamento</h2>

              {/* Card do plano atual destacado */}
              <div style={{
                ...cardStyle, marginBottom: 28, border: `2px solid ${C.purple}`,
                background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(124,58,237,0.03))',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Crown size={16} color={C.purple} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.purple, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Seu plano atual
                      </span>
                    </div>
                    <h3 style={{ fontSize: 26, fontWeight: 700, color: C.text }}>{current.name}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: C.purple }}>{current.price}</span>
                    <span style={{ fontSize: 14, color: C.muted }}>{current.period}</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginTop: 18 }}>
                  {current.features.filter(f => f.ok).map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text }}>
                      <Check size={15} color="#22C55E" style={{ flexShrink: 0 }} />{f.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid de planos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
                {billingPlans.map((p, idx) => {
                  const isCurrent = p.id === current.id
                  const isUpgrade = idx > currentIdx
                  return (
                    <div key={p.id} style={{
                      ...cardStyle, position: 'relative', display: 'flex', flexDirection: 'column',
                      border: isCurrent ? `2px solid ${C.purple}` : `1px solid ${C.border}`,
                    }}>
                      {isCurrent && (
                        <span style={{
                          position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                          background: C.purple, color: '#fff', fontSize: 10, fontWeight: 700,
                          padding: '4px 12px', borderRadius: 999, letterSpacing: 0.5, whiteSpace: 'nowrap',
                        }}>ATUAL</span>
                      )}
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>{p.name}</h3>
                      <div style={{ marginBottom: 16 }}>
                        <span style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{p.price}</span>
                        <span style={{ fontSize: 13, color: C.muted }}>{p.period}</span>
                      </div>
                      <div style={{ display: 'grid', gap: 10, marginBottom: 20, flex: 1 }}>
                        {p.features.map((f, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                            color: f.ok ? C.text : C.muted }}>
                            {f.ok ? <Check size={15} color="#22C55E" style={{ flexShrink: 0 }} /> : <X size={15} color={C.muted} style={{ flexShrink: 0 }} />}{f.label}
                          </div>
                        ))}
                      </div>
                      <button disabled={isCurrent}
                        onClick={() => navigate(`/plans/${p.id}`)}
                        style={{
                          width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                          fontSize: 14, fontWeight: 600, fontFamily: FONT,
                          cursor: isCurrent ? 'default' : 'pointer',
                          background: isCurrent ? 'rgba(124,58,237,0.15)' : C.purple,
                          color: isCurrent ? C.purple : '#fff',
                        }}>
                        {isCurrent ? 'Atual' : isUpgrade ? 'Upgrade' : 'Downgrade'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Faturamento */}
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16 }}>Faturamento</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  {mockInvoices.map(inv => (
                    <div key={inv.id} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{inv.date}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{inv.amount}</p>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: C.green,
                        background: 'rgba(34,197,94,0.12)', padding: '4px 10px', borderRadius: 6,
                      }}>{inv.status}</span>
                      <button onClick={() => { logger.log(user?.id, 'export_pdf', { category: 'system', description: 'Baixou fatura em PDF' }); downloadInvoicePDF(inv) }} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                        color: C.text, fontSize: 12, fontFamily: FONT, padding: '6px 12px', cursor: 'pointer',
                      }}>
                        <Download size={13} /> Download PDF
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Método de pagamento */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16 }}>Método de pagamento</h3>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, background: C.card, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><CreditCard size={22} color={C.purple} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: 1 }}>•••• •••• •••• 4242</p>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Validade 08/2028</p>
                  </div>
                  <button style={{
                    background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.text, fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '8px 16px', cursor: 'pointer',
                  }}>Alterar</button>
                </div>
              </div>
            </div>
            )
          })()}

          {/* ── API ── */}
          {active === 'api' && (
            <div>
              <h2 className="font-display font-bold text-xl text-white mb-2">API & Chaves de IA</h2>
              <p className="text-sm text-slate-400 mb-6">Configure suas chaves para habilitar os nodes de IA nos fluxos.</p>

              <div className="glass-orange rounded-xl p-4 mb-6 flex items-start gap-3">
                <Shield size={16} className="text-brand-orange shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300">
                  As chaves são salvas criptografadas no Supabase e só acessíveis pela sua conta.
                  Nunca compartilhe com terceiros.
                </p>
              </div>

              {/* Google Gemini (gratuito) */}
              <div className="mb-6 p-4 bg-dark-700 rounded-xl border border-dark-400">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-brand-orange" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">Google Gemini</p>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 border border-brand-green/30 rounded-full px-2 py-0.5">
                          1.500 req/dia grátis
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">Gemini 2.5 Flash</p>
                    </div>
                  </div>
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-brand-blue hover:underline">
                    Obter chave grátis <ExternalLink size={10} />
                  </a>
                </div>
                <label className="block text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">API Key</label>
                <div className="relative">
                  <input
                    type={showGem ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={e => setGeminiKey(e.target.value)}
                    placeholder="AIza••••••••••••••••••••••••••••••••"
                    className="input-field w-full font-mono text-xs pr-9"
                    disabled={isDemoMode}
                  />
                  <button onClick={() => setShowGem(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                    {showGem ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {geminiKey && (
                  <p className="text-[10px] text-brand-green mt-1.5 flex items-center gap-1">
                    <CheckCircle size={10} /> Chave configurada
                  </p>
                )}
              </div>

              {/* Groq (gratuito) */}
              <div className="mb-6 p-4 bg-dark-700 rounded-xl border border-dark-400">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap size={18} className="text-brand-orange" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">Groq Llama 3.3</p>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 border border-brand-green/30 rounded-full px-2 py-0.5">
                          Grátis e ultrarrápido
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">Llama 3.3 70B Versatile</p>
                    </div>
                  </div>
                  <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-brand-blue hover:underline">
                    Obter chave grátis <ExternalLink size={10} />
                  </a>
                </div>
                <label className="block text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">API Key</label>
                <div className="relative">
                  <input
                    type={showGroq ? 'text' : 'password'}
                    value={groqKey}
                    onChange={e => setGroqKey(e.target.value)}
                    placeholder="gsk_••••••••••••••••••••••••••••••••"
                    className="input-field w-full font-mono text-xs pr-9"
                    disabled={isDemoMode}
                  />
                  <button onClick={() => setShowGroq(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                    {showGroq ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {groqKey && (
                  <p className="text-[10px] text-brand-green mt-1.5 flex items-center gap-1">
                    <CheckCircle size={10} /> Chave configurada
                  </p>
                )}
              </div>

              {/* OpenAI */}
              <div className="mb-6 p-4 bg-dark-700 rounded-xl border border-dark-400">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot size={18} className="text-brand-orange" />
                    <div>
                      <p className="text-sm font-semibold text-white">OpenAI</p>
                      <p className="text-[10px] text-slate-500">GPT-4o Mini · GPT-4o</p>
                    </div>
                  </div>
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-brand-blue hover:underline">
                    Obter chave <ExternalLink size={10} />
                  </a>
                </div>
                <label className="block text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">API Key</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showOAI ? 'text' : 'password'}
                      value={openaiKey}
                      onChange={e => setOpenaiKey(e.target.value)}
                      placeholder="sk-proj-••••••••••••••••••••••••••••••••"
                      className="input-field w-full font-mono text-xs pr-9"
                      disabled={isDemoMode}
                    />
                    <button onClick={() => setShowOAI(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                      {showOAI ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                {openaiKey && (
                  <p className="text-[10px] text-brand-green mt-1.5 flex items-center gap-1">
                    <CheckCircle size={10} /> Chave configurada
                  </p>
                )}
              </div>

              {/* Anthropic */}
              <div className="mb-6 p-4 bg-dark-700 rounded-xl border border-dark-400">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain size={18} className="text-brand-orange" />
                    <div>
                      <p className="text-sm font-semibold text-white">Anthropic Claude</p>
                      <p className="text-[10px] text-slate-500">Claude Sonnet · Claude Haiku</p>
                    </div>
                  </div>
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-brand-blue hover:underline">
                    Obter chave <ExternalLink size={10} />
                  </a>
                </div>
                <label className="block text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">API Key</label>
                <div className="relative">
                  <input
                    type={showAnt ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={e => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-••••••••••••••••••••••••••••••••"
                    className="input-field w-full font-mono text-xs pr-9"
                    disabled={isDemoMode}
                  />
                  <button onClick={() => setShowAnt(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                    {showAnt ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {anthropicKey && (
                  <p className="text-[10px] text-brand-green mt-1.5 flex items-center gap-1">
                    <CheckCircle size={10} /> Chave configurada
                  </p>
                )}
              </div>

              {keysMsg && (() => {
                const ok = !keysMsg.startsWith('Erro')
                return (
                  <p className={clsx('text-sm mb-3 flex items-center gap-2', ok ? 'text-brand-green' : 'text-brand-red')}>
                    {ok ? <CheckCircle size={14} /> : <X size={14} />} {keysMsg}
                  </p>
                )
              })()}

              <button onClick={handleSaveKeys} disabled={keysSaving || isDemoMode}
                className="btn-primary disabled:opacity-50 flex items-center gap-2">
                {keysSaving ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                {keysSaving ? 'Salvando...' : 'Salvar chaves'}
              </button>

              {/* Divider */}
              <div className="border-t border-dark-400 my-6" />

              <div>
                <h3 className="font-display font-semibold text-white text-sm mb-4">Webhook Evolution API</h3>
                <label className="block text-xs text-slate-400 mb-2">URL do Webhook</label>
                <input className="input-field" placeholder="https://seu-servidor.com/api/webhook" disabled={isDemoMode} />
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Configure esta URL no painel da Evolution API para receber mensagens em tempo real.
                </p>
                <button className="btn-secondary mt-3 text-sm" disabled={isDemoMode}>Salvar Webhook</button>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {active === 'notifications' && (
            <div style={{ fontFamily: FONT, color: C.text }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 24 }}>Notificações</h2>

              {isDemoMode && (
                <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)',
                  color: C.yellow, fontSize: 13 }}>
                  Você está no modo demo. Crie uma conta para salvar suas preferências de notificação.
                </div>
              )}

              {/* Grupos de toggles */}
              {notifGroups.map(group => (
                <div key={group.label} style={{ ...cardStyle, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: C.purple, marginBottom: 14,
                    textTransform: 'uppercase', letterSpacing: 0.5 }}>{group.label}</h3>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {group.items.map((item, idx) => (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                        padding: '12px 0',
                        borderTop: idx === 0 ? 'none' : `1px solid ${C.border}`,
                      }}>
                        <span style={{ fontSize: 14, color: C.text }}>{item.label}</span>
                        <Toggle on={notifs[item.id]} onClick={() => toggleNotif(item.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Canal de notificação */}
              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Canal de notificação</h3>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
                  Escolha onde deseja receber suas notificações.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {notifChannels.map(ch => (
                    <button key={ch.id} type="button" onClick={() => toggleChannel(ch.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT,
                        fontSize: 14, color: C.text, background: C.bg,
                        border: `1px solid ${channels[ch.id] ? C.purple : C.border}`,
                        transition: 'border-color 0.2s',
                      }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: channels[ch.id] ? C.purple : 'transparent',
                        border: `1px solid ${channels[ch.id] ? C.purple : C.border}`,
                        transition: 'background 0.2s, border-color 0.2s',
                      }}>
                        {channels[ch.id] && <Check size={12} color="#fff" />}
                      </span>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário silencioso */}
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Horário silencioso</h3>
                    <p style={{ fontSize: 13, color: C.muted, maxWidth: 460 }}>
                      Pause as notificações em um intervalo de tempo definido.
                    </p>
                  </div>
                  <Toggle on={quietHours} onClick={() => setQuietHours(v => !v)} />
                </div>

                {quietHours && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 18 }}>
                    <div>
                      <label style={labelStyle}>De</label>
                      <input type="time" value={quietFrom} onChange={e => setQuietFrom(e.target.value)}
                        style={{ ...inputStyle, width: 140 }} />
                    </div>
                    <div>
                      <label style={labelStyle}>Até</label>
                      <input type="time" value={quietTo} onChange={e => setQuietTo(e.target.value)}
                        style={{ ...inputStyle, width: 140 }} />
                    </div>
                  </div>
                )}
              </div>

              {notifError && (
                <p style={{ fontSize: 13, marginBottom: 12, color: C.red }}>{notifError}</p>
              )}

              <button onClick={handleSaveNotifs} disabled={notifSaving} style={purpleBtn(notifSaving)}>
                {notifSaving ? <Loader2 size={15} className="animate-spin" />
                  : notifSaved ? <CheckCircle size={15} /> : null}
                {notifSaving ? 'Salvando...' : notifSaved ? 'Preferências salvas' : 'Salvar preferências'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
