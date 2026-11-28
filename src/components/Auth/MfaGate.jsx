// Porta da verificação em duas etapas: depois do login, se a conta tem 2FA e a
// sessão ainda não passou pela 2ª etapa, nada do app aparece até o código.
// O servidor também exige (não entrega o token da API sem isso).
import React, { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Loader2, KeyRound, Mail, LogOut } from 'lucide-react'
import { useAuth } from '@context/AuthContext'
import { getProxyToken } from '@/lib/supabase'
import { mfaApi, totp, MFA_EVENT } from '@services/mfa'

const box = { width: '100%', maxWidth: 400, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,.35)' }
const inputCss = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, fontSize: 22, letterSpacing: 6, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)', background: 'var(--bg)', outline: 'none', fontFamily: 'inherit' }
const primary = (off) => ({ width: '100%', marginTop: 14, padding: '11px 14px', border: 'none', borderRadius: 12, background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14, cursor: off ? 'default' : 'pointer', opacity: off ? 0.6 : 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontFamily: 'inherit' })
const link = { background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit' }

export function MfaGate({ children }) {
  const { user, session, isDemoMode, signOut } = useAuth()
  const [status, setStatus] = useState(null) // resposta de /api/mfa/status
  const [mode, setMode] = useState('totp')   // totp | recovery | email
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const check = useCallback(async () => {
    if (!user || isDemoMode) { setStatus(null); return }
    try { setStatus(await mfaApi.status()) } catch { setStatus(null) /* servidor fora: o app trata */ }
  }, [user, isDemoMode])

  useEffect(() => { check() }, [check, session?.user?.id])
  useEffect(() => {
    const on = () => check()
    window.addEventListener(MFA_EVENT, on)
    return () => window.removeEventListener(MFA_EVENT, on)
  }, [check])
  useEffect(() => { if (status && !status.totp) setMode(status.email ? 'email' : 'recovery') }, [status])

  const locked = Boolean(status?.required && !status?.satisfied)
  if (!locked) return children

  const done = async () => {
    await getProxyToken({ force: true })
    setCode(''); setErr(''); setInfo('')
    await check()
  }

  const submit = async (e) => {
    e?.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true); setErr('')
    try {
      if (mode === 'totp') await totp.verify(status.totpFactorIds[0], code)
      else if (mode === 'recovery') {
        const r = await mfaApi.useRecovery(code)
        if (r.left != null && r.left <= 2) setInfo(`Restam ${r.left} códigos de recuperação. Gere novos em Configurações → Segurança.`)
      } else await mfaApi.verifyEmail(code)
      await done()
    } catch (e2) { setErr(e2.message || 'Código inválido.') }
    setBusy(false)
  }

  const sendEmail = async () => {
    setBusy(true); setErr('')
    try { await mfaApi.sendEmail('login'); setInfo(`Enviamos um código para ${user?.email}.`) } catch (e2) { setErr(e2.message) }
    setBusy(false)
  }

  const isDigits = mode !== 'recovery'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="mfa-title" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>
      <form onSubmit={submit} style={box} className="rf-pop">
        <div style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(124,58,237,.15)', color: '#A78BFA', marginBottom: 14 }}>
          {mode === 'recovery' ? <KeyRound size={24} /> : mode === 'email' ? <Mail size={24} /> : <ShieldCheck size={24} />}
        </div>
        <h1 id="mfa-title" style={{ margin: '0 0 6px', fontSize: 20, color: 'var(--ink-1)' }}>Verificação em duas etapas</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          {mode === 'totp' && 'Digite o código de 6 dígitos do seu app autenticador.'}
          {mode === 'recovery' && 'Digite um dos seus códigos de recuperação (cada um vale uma vez).'}
          {mode === 'email' && (info ? info : `Vamos enviar um código para ${user?.email}.`)}
        </p>

        {mode === 'email' && !info ? (
          <button type="button" onClick={sendEmail} disabled={busy} style={primary(busy)}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Enviar código
          </button>
        ) : (
          <>
            <input autoFocus value={code} onChange={e => setCode(isDigits ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value.slice(0, 14))}
              inputMode={isDigits ? 'numeric' : 'text'} autoComplete="one-time-code" aria-label={mode === 'recovery' ? 'Código de recuperação' : 'Código de verificação'}
              placeholder={isDigits ? '000000' : 'xxxxx-xxxxx'} style={{ ...inputCss, ...(isDigits ? {} : { fontSize: 18, letterSpacing: 2 }) }} />
            <button type="submit" disabled={busy || (isDigits ? code.length !== 6 : code.replace(/[^a-z0-9]/gi, '').length !== 10)} style={primary(busy)}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Confirmar
            </button>
          </>
        )}

        {err && <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: '#F87171' }}>{err}</p>}
        {info && mode !== 'email' && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#EAB308' }}>{info}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18, alignItems: 'flex-start' }}>
          {mode !== 'totp' && status.totp && <button type="button" style={link} onClick={() => { setMode('totp'); setCode(''); setErr('') }}>Usar o app autenticador</button>}
          {mode !== 'recovery' && status.recoveryAvailable && <button type="button" style={link} onClick={() => { setMode('recovery'); setCode(''); setErr(''); setInfo('') }}>Perdi o celular: usar código de recuperação</button>}
          {mode !== 'email' && status.emailAvailable && <button type="button" style={link} onClick={() => { setMode('email'); setCode(''); setErr(''); setInfo('') }}>Receber código por e-mail</button>}
          <button type="button" style={{ ...link, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => signOut()}><LogOut size={12} /> Sair e entrar com outra conta</button>
        </div>
      </form>
    </div>
  )
}

export default MfaGate
