// Configurações → Segurança: verificação em duas etapas de verdade.
//   app autenticador (QR code) → códigos de recuperação (uma vez só) → desativar.
//   código por e-mail: só quando o servidor tem provedor de e-mail.
import React, { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, Loader2, Copy, Download, KeyRound, Mail, Check, AlertTriangle } from 'lucide-react'
import { mfaApi, totp } from '@services/mfa'

const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }
const btn = (bg, color = '#fff', off = false) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, border: bg === 'transparent' ? '1px solid var(--border)' : 'none', background: bg, color, fontSize: 13, fontWeight: 700, cursor: off ? 'default' : 'pointer', opacity: off ? 0.6 : 1, fontFamily: 'inherit' })
const codeInput = { width: 150, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 18, letterSpacing: 4, textAlign: 'center', color: 'var(--ink-1)', background: 'var(--bg)', outline: 'none', fontFamily: 'inherit' }
const pill = (on) => ({ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: on ? '#22C55E' : 'var(--ink-3)', background: on ? '#22C55E1f' : 'var(--surface-1)' })

export function TwoFactorSettings({ disabled = false }) {
  const [st, setSt] = useState(null)
  const [setup, setSetup] = useState(null)       // { factorId, qr, secret }
  const [codes, setCodes] = useState(null)       // códigos de recuperação recém-gerados
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [confirmOff, setConfirmOff] = useState(false)
  const [emailStep, setEmailStep] = useState(false)

  const load = useCallback(async () => {
    if (disabled) return
    try { setSt(await mfaApi.status()) } catch (e) { setErr(e.message) }
  }, [disabled])
  useEffect(() => { load() }, [load])

  const run = async (name, fn) => {
    setBusy(name); setErr('')
    try { await fn() } catch (e) { setErr(e.message || 'Algo deu errado.') }
    setBusy('')
  }

  const start = () => run('enroll', async () => { setSetup(await totp.enroll()); setCode('') })
  const confirm = () => run('verify', async () => {
    await totp.verify(setup.factorId, code)
    setSetup(null); setCode('')
    try { setCodes((await mfaApi.generateRecovery()).codes) } catch (e) { setErr(`2FA ativado, mas não deu para gerar os códigos de recuperação: ${e.message}`) }
    await load()
  })
  const newCodes = () => run('codes', async () => { setCodes((await mfaApi.generateRecovery()).codes); await load() })
  const turnOff = () => run('off', async () => {
    const id = st.totpFactorIds[0]
    try { await totp.unenroll(id) } catch { await mfaApi.removeTotp(id) } // sessão aceita por recuperação/e-mail (aal1)
    setConfirmOff(false); setCodes(null)
    await load()
  })
  const emailSend = () => run('email', async () => { await mfaApi.sendEmail('enable'); setEmailStep(true); setCode('') })
  const emailConfirm = () => run('email', async () => { await mfaApi.verifyEmail(code, true); setEmailStep(false); setCode(''); await load() })
  const emailOff = () => run('email', async () => { await mfaApi.disableEmail(); await load() })

  const copy = () => { try { navigator.clipboard.writeText(codes.join('\n')) } catch { /* sem permissão */ } }
  const download = () => {
    const blob = new Blob([`Códigos de recuperação do RiseFlow (cada um vale uma vez)\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'riseflow-codigos-de-recuperacao.txt' })
    a.click(); URL.revokeObjectURL(a.href)
  }

  if (disabled) {
    return <div style={card}><h3 style={{ margin: 0, fontSize: 15 }}>Verificação em duas etapas</h3><p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Indisponível no modo demo.</p></div>
  }

  return (
    <div style={card} data-testid="two-factor">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ShieldCheck size={18} color="#A78BFA" />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', flex: 1 }}>Verificação em duas etapas</h3>
        {st && <span style={pill(st.required)}>{st.required ? 'Ativada' : 'Desativada'}</span>}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '6px 0 16px', lineHeight: 1.5, maxWidth: 560 }}>
        Além da senha, o login pede um código do app autenticador do seu celular (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Sem SMS.
      </p>

      {!st ? <Loader2 size={16} className="animate-spin" /> : (
        <>
          {/* ── App autenticador ── */}
          {!st.totp && !setup && (
            <button type="button" onClick={start} disabled={!!busy} style={btn('#7C3AED', '#fff', !!busy)}>
              {busy === 'enroll' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Ativar com app autenticador
            </button>
          )}

          {setup && (
            <div className="rf-pop" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {setup.qr && <img src={setup.qr} alt="QR code para o app autenticador" width={168} height={168} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />}
              <div style={{ flex: 1, minWidth: 220 }}>
                <ol style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                  <li>Abra o app autenticador e escaneie o QR code.</li>
                  <li>Sem câmera? Digite a chave: <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--ink-1)' }}>{setup.secret}</code></li>
                  <li>Digite o código de 6 dígitos que aparecer:</li>
                </ol>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código do app autenticador" style={codeInput} />
                  <button type="button" onClick={confirm} disabled={code.length !== 6 || !!busy} style={btn('#7C3AED', '#fff', code.length !== 6 || !!busy)}>
                    {busy === 'verify' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmar e ativar
                  </button>
                  <button type="button" onClick={() => setSetup(null)} style={btn('transparent', 'var(--ink-3)')}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {st.totp && !setup && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <b>App autenticador ativo.</b>{st.recoveryAvailable ? ` Códigos de recuperação restantes: ${st.recoveryLeft}.` : ''}
              </span>
              {st.recoveryAvailable && (
                <button type="button" onClick={newCodes} disabled={!!busy} style={btn('transparent', 'var(--ink-1)', !!busy)}>
                  {busy === 'codes' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Gerar novos códigos
                </button>
              )}
              {!confirmOff ? (
                <button type="button" onClick={() => setConfirmOff(true)} style={btn('transparent', '#F87171')}><ShieldOff size={14} /> Desativar</button>
              ) : (
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: '#F87171' }}>Desativar deixa a conta só com a senha.</span>
                  <button type="button" onClick={turnOff} disabled={!!busy} style={btn('#EF4444', '#fff', !!busy)}>{busy === 'off' ? <Loader2 size={14} className="animate-spin" /> : null} Confirmar</button>
                  <button type="button" onClick={() => setConfirmOff(false)} style={btn('transparent', 'var(--ink-3)')}>Cancelar</button>
                </span>
              )}
            </div>
          )}

          {!st.recoveryAvailable && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#EAB308', display: 'flex', gap: 6 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              {st.totp ? 'Códigos de recuperação indisponíveis' : 'Antes de ativar: os códigos de recuperação ainda não estão disponíveis'} (migração supabase/mfa.sql não encontrada no banco). Sem eles, perder o celular exige suporte para recuperar a conta.
            </p>
          )}

          {/* ── Códigos de recuperação recém-gerados ── */}
          {codes && (
            <div className="rf-pop" style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #EAB30866', background: '#EAB3080f' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                <b>Guarde estes códigos agora</b> (eles não aparecem de novo). Se perder o celular, cada código libera um login.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 14, marginBottom: 12 }} aria-label="Códigos de recuperação">
                {codes.map(c => <span key={c} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink-1)' }}>{c}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={copy} style={btn('transparent', 'var(--ink-1)')}><Copy size={14} /> Copiar</button>
                <button type="button" onClick={download} style={btn('transparent', 'var(--ink-1)')}><Download size={14} /> Baixar .txt</button>
                <button type="button" onClick={() => setCodes(null)} style={btn('#22C55E')}><Check size={14} /> Já guardei</button>
              </div>
            </div>
          )}

          {/* ── Código por e-mail ── */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Mail size={15} color="var(--ink-3)" />
            <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1, minWidth: 200 }}>
              Código por e-mail {st.email ? <b>(ativo)</b> : ''}
              {!st.emailAvailable && <span style={{ color: 'var(--ink-4)' }}> — disponível quando o envio de e-mail do sistema estiver configurado.</span>}
            </span>
            {st.emailAvailable && !st.email && !emailStep && (
              <button type="button" onClick={emailSend} disabled={!!busy || (st.required && !st.satisfied)} style={btn('transparent', 'var(--ink-1)', !!busy)}>Ativar por e-mail</button>
            )}
            {emailStep && (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000" aria-label="Código recebido por e-mail" style={codeInput} />
                <button type="button" onClick={emailConfirm} disabled={code.length !== 6 || !!busy} style={btn('#7C3AED', '#fff', code.length !== 6 || !!busy)}>Confirmar</button>
              </span>
            )}
            {st.email && <button type="button" onClick={emailOff} disabled={!!busy} style={btn('transparent', '#F87171', !!busy)}>Desativar</button>}
          </div>
        </>
      )}

      {err && <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: '#F87171' }}>{err}</p>}
    </div>
  )
}

export default TwoFactorSettings
