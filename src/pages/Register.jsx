import React, { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Zap, Bot, BarChart3, User, Mail, Lock, Eye, EyeOff, Check, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@context/AuthContext'

const ERRORS = {
  'User already registered': 'Este email já está cadastrado',
  'Password should be at least 6 characters': 'Senha deve ter no mínimo 8 caracteres',
}
const translateError = (m) => ERRORS[m] ?? m

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
@keyframes rfFloat{from{transform:translateY(0)}to{transform:translateY(-30px)}}
@keyframes rfIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.rf-in{width:100%;box-sizing:border-box;background:#0F172A;border:1px solid #334155;border-radius:10px;padding:12px 12px 12px 40px;color:#F8FAFC;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s}
.rf-in:focus{border-color:#FF6B35}
.rf-in::placeholder{color:#64748B}
.rf-g:hover{box-shadow:0 4px 14px rgba(0,0,0,.25)}
.rf-s:hover{filter:brightness(1.1)}
@media(max-width:767px){.rf-l{display:none!important}.rf-r{width:100%!important}.rf-c{box-shadow:none!important}.rf-mb{display:flex!important}}
@media(min-width:768px) and (max-width:1024px){.rf-l{width:40%!important}.rf-r{width:60%!important}}
`
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 6 }
const ico = { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }
const eyeBtn = { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0, display: 'flex' }
const Goo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
)
const bullets = [[Zap, 'Flows automáticos que vendem 24h'], [Bot, 'IA que qualifica leads por você'], [BarChart3, 'Dashboard com métricas em tempo real']]
const circles = [{ s: 200, c: '#FF6B35', t: '8%', l: '6%', d: '0s' }, { s: 150, c: '#E55100', t: '55%', l: '62%', d: '2s' }, { s: 100, c: '#FF8C42', t: '72%', l: '14%', d: '4s' }]
const strength = (p) => p.length >= 12 ? { w: '100%', c: '#22C55E', t: 'forte' } : p.length >= 8 ? { w: '66%', c: '#EAB308', t: 'média' } : { w: '33%', c: '#EF4444', t: 'fraca' }

export const Register = () => {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { signUp, signInWithGoogle, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  if (!authLoading && user) return <Navigate to="/" replace />

  const validate = () => {
    if (!fullName.trim() || fullName.trim().length < 2) return 'Nome deve ter no mínimo 2 caracteres'
    if (/<[^>]*>/.test(fullName)) return 'Nome inválido'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Informe um email válido'
    if (password.length < 8) return 'Senha deve ter no mínimo 8 caracteres'
    if (password !== confirmPassword) return 'As senhas não coincidem'
    if (!acceptTerms) return 'Aceite os termos para continuar'
    return null
  }
  const handleRegister = async (e) => {
    e.preventDefault(); setError('')
    const v = validate(); if (v) { setError(v); return }
    setLoading(true)
    try { await signUp(email, password, fullName); setSuccess(true) }
    catch (err) { setError(translateError(err.message)) }
    finally { setLoading(false) }
  }
  const handleGoogle = async () => {
    setError(''); setGoogleLoading(true)
    try { await signInWithGoogle() }
    catch { setError('Erro ao cadastrar com Google. Tente novamente.'); setGoogleLoading(false) }
  }

  if (success) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A', fontFamily: "'DM Sans',sans-serif", padding: 20 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 400, textAlign: 'center', animation: 'rfIn .5s ease-out' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#FF6B35,#E55100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><CheckCircle2 size={32} color="#fff" /></div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px' }}>Conta criada!</h1>
        <p style={{ color: '#94A3B8', margin: '0 0 24px' }}>Enviamos um link de confirmação para <span style={{ color: '#FF6B35' }}>{email}</span></p>
        <button onClick={() => navigate('/login')} className="rf-s" style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E55100)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Ir para o login</button>
      </div>
    </div>
  )

  const st = strength(password)
  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans',sans-serif", background: '#0F172A' }}>
      <style>{CSS}</style>
      <div className="rf-l" style={{ width: '50vw', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#0F172A,#1C1410)', padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center' }}>
        {circles.map((c, i) => <div key={i} style={{ position: 'absolute', width: c.s, height: c.s, top: c.t, left: c.l, borderRadius: '50%', background: c.c, opacity: 0.15, filter: 'blur(8px)', animation: `rfFloat 6s ease-in-out ${c.d} infinite alternate` }} />)}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#FF6B35,#E55100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: '#fff' }}>R</div>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>RiseFlow</span>
        </div>
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.2, margin: '0 0 16px' }}>Comece grátis. 50 mensagens por mês.</h1>
          <p style={{ fontSize: 16, color: '#94A3B8', margin: '0 0 28px' }}>Sem cartão de crédito. Configure em 2 minutos.</p>
          {bullets.map(([Ic, t], i) => <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14, color: '#E2E8F0', fontSize: 15 }}><Ic size={20} color="#FF6B35" />{t}</div>)}
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ color: '#475569', fontSize: 13 }}>Created by <span style={{ color: '#FF6B35', fontWeight: 600 }}>Rise Creative</span></span>
        </div>
      </div>

      <div className="rf-r" style={{ width: '50vw', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="rf-c" style={{ width: '100%', maxWidth: 400, background: '#1E293B', borderRadius: 16, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'rfIn .5s ease-out' }}>
          {/* Branding no topo — só no mobile (a coluna lateral fica escondida) */}
          <div className="rf-mb" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF6B35,#E55100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, color: '#fff' }}>RF</div>
              <span style={{ fontSize: 23, fontWeight: 700, color: '#fff' }}>RiseFlow</span>
            </div>
            <span style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>Automação de WhatsApp com inteligência artificial</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F8FAFC', margin: '0 0 4px' }}>Criar sua conta</h2>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 24px' }}>Comece a automatizar agora</p>
          {error && <div style={{ background: '#EF444420', border: '1px solid #EF4444', color: '#FCA5A5', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <button type="button" onClick={handleGoogle} disabled={googleLoading || loading} className="rf-g" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', color: '#333', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'box-shadow .2s', fontFamily: "'DM Sans',sans-serif" }}>
            <Goo />{googleLoading ? 'Conectando...' : 'Continuar com Google'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #334155' }} /><span style={{ color: '#64748B', fontSize: 13 }}>ou</span><hr style={{ flex: 1, border: 'none', borderTop: '1px solid #334155' }} />
          </div>
          <form onSubmit={handleRegister}>
            <label style={lbl}>Nome completo</label>
            <div style={{ position: 'relative', marginBottom: 14 }}><User size={16} style={ico} /><input className="rf-in" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome" required autoComplete="name" autoFocus /></div>
            <label style={lbl}>Email</label>
            <div style={{ position: 'relative', marginBottom: 14 }}><Mail size={16} style={ico} /><input className="rf-in" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email" /></div>
            <label style={lbl}>Senha</label>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Lock size={16} style={ico} />
              <input className="rf-in" style={{ paddingRight: 40 }} type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required autoComplete="new-password" />
              <button type="button" onClick={() => setShowPass(!showPass)} style={eyeBtn}>{showPass ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            {password && <>
              <div style={{ height: 4, borderRadius: 4, background: '#334155', marginBottom: 6, overflow: 'hidden' }}><div style={{ width: st.w, height: '100%', background: st.c, transition: 'all .3s' }} /></div>
              <p style={{ fontSize: 12, color: password.length >= 8 ? '#22C55E' : '#94A3B8', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>{password.length >= 8 && <Check size={13} />} Mínimo 8 caracteres · senha {st.t}</p>
            </>}
            <label style={lbl}>Confirmar senha</label>
            <div style={{ position: 'relative', marginBottom: 16 }}><Lock size={16} style={ico} /><input className="rf-in" type={showPass ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a senha" required autoComplete="new-password" /></div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 18, color: '#94A3B8', fontSize: 12, cursor: 'pointer', lineHeight: 1.5 }}>
              <input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} style={{ marginTop: 2, accentColor: '#FF6B35' }} />
              <span>Li e aceito os <span style={{ color: '#FF6B35' }}>Termos de Uso</span> e <span style={{ color: '#FF6B35' }}>Política de Privacidade</span></span>
            </label>
            <button type="submit" disabled={loading || googleLoading} className="rf-s" style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E55100)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'filter .2s', fontFamily: "'DM Sans',sans-serif", opacity: loading ? 0.8 : 1 }}>
              {loading ? 'Criando conta...' : 'Criar conta grátis'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 14, color: '#94A3B8', marginTop: 20 }}>Já tem conta? <Link to="/login" style={{ color: '#FF6B35', fontWeight: 600, textDecoration: 'none' }}>Fazer login</Link></p>
        </div>
      </div>
    </div>
  )
}
