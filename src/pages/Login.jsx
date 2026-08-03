import React, { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Zap, Bot, BarChart3, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@context/AuthContext'

const ERROR_MAP = {
  'Invalid login credentials': 'Email ou senha incorretos',
  'Email not confirmed': 'Verifique seu email para confirmar o cadastro',
  'Too many requests': 'Muitas tentativas. Aguarde alguns minutos',
}
const translateError = (m) => ERROR_MAP[m] ?? 'Email ou senha incorretos'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
@keyframes rfFloat{from{transform:translateY(0)}to{transform:translateY(-30px)}}
@keyframes rfIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.rf-in{width:100%;box-sizing:border-box;background:#0F172A;border:1px solid #334155;border-radius:10px;padding:12px 12px 12px 40px;color:#F8FAFC;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s}
.rf-in:focus{border-color:#FF6B35}
.rf-in::placeholder{color:#64748B}
.rf-g:hover{box-shadow:0 4px 14px rgba(0,0,0,.25)}
.rf-s:hover{filter:brightness(1.1)}
@media(max-width:767px){.rf-l{display:none!important}.rf-r{width:100%!important}.rf-c{box-shadow:none!important}}
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

export const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn, signInWithGoogle, loginDemo, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('oauth_error')
    if (oauthError) {
      setError(oauthError)
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  if (!authLoading && user) return <Navigate to="/" replace />

  const handleDemo = () => { loginDemo(); navigate('/') }

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await signIn(email, password); navigate('/') }
    catch (err) { setError(translateError(err.message)) }
    finally { setLoading(false) }
  }
  const handleGoogle = async () => {
    setError(''); setGoogleLoading(true)
    try { await signInWithGoogle() }
    catch { setError('Erro ao entrar com Google. Tente novamente.'); setGoogleLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans',sans-serif", background: '#0F172A' }}>
      <style>{CSS}</style>
      <div className="rf-l" style={{ width: '50vw', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#0F172A,#1C1410)', padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center' }}>
        {circles.map((c, i) => <div key={i} style={{ position: 'absolute', width: c.s, height: c.s, top: c.t, left: c.l, borderRadius: '50%', background: c.c, opacity: 0.15, filter: 'blur(8px)', animation: `rfFloat 6s ease-in-out ${c.d} infinite alternate` }} />)}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#FF6B35,#E55100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-1px', fontFamily: "'DM Sans',sans-serif" }}>RF</div>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>RiseFlow</span>
        </div>
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.2, margin: '0 0 16px' }}>Automatize suas plataformas digitais com inteligência artificial</h1>
          <p style={{ fontSize: 16, color: '#94A3B8', margin: '0 0 28px' }}>CRM, chatbot com IA, campanhas em massa e muito mais.</p>
          {bullets.map(([Ic, t], i) => <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14, color: '#E2E8F0', fontSize: 15 }}><Ic size={20} color="#FF6B35" />{t}</div>)}
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ color: '#475569', fontSize: 13 }}>Created by <span style={{ color: '#FF6B35', fontWeight: 600 }}>Rise Creative</span></span>
        </div>
      </div>

      <div className="rf-r" style={{ width: '50vw', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="rf-c" style={{ width: '100%', maxWidth: 400, background: '#1E293B', borderRadius: 16, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'rfIn .5s ease-out' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F8FAFC', margin: '0 0 4px' }}>Entrar na sua conta</h2>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 24px' }}>Bem-vindo de volta!</p>
          {error && <div style={{ background: '#EF444420', border: '1px solid #EF4444', color: '#FCA5A5', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <button type="button" onClick={handleGoogle} disabled={googleLoading || loading} className="rf-g" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', color: '#333', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'box-shadow .2s', fontFamily: "'DM Sans',sans-serif" }}>
            <Goo />{googleLoading ? 'Conectando...' : 'Continuar com Google'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #334155' }} /><span style={{ color: '#64748B', fontSize: 13 }}>ou</span><hr style={{ flex: 1, border: 'none', borderTop: '1px solid #334155' }} />
          </div>
          <form onSubmit={handleLogin}>
            <label style={lbl}>Email</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Mail size={16} style={ico} />
              <input className="rf-in" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email" />
            </div>
            <label style={lbl}>Senha</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Lock size={16} style={ico} />
              <input className="rf-in" style={{ paddingRight: 40 }} type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
              <button type="button" onClick={() => setShowPass(!showPass)} style={eyeBtn}>{showPass ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" style={{ accentColor: '#FF6B35' }} /> Lembrar de mim</label>
              <Link to="/forgot-password" style={{ color: '#FF6B35', fontSize: 13, textDecoration: 'none' }}>Esqueceu a senha?</Link>
            </div>
            <button type="submit" disabled={loading || googleLoading} className="rf-s" style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E55100)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'filter .2s', fontFamily: "'DM Sans',sans-serif", opacity: loading ? 0.8 : 1 }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 14, color: '#94A3B8', marginTop: 20 }}>Não tem conta? <Link to="/register" style={{ color: '#FF6B35', fontWeight: 600, textDecoration: 'none' }}>Criar conta grátis</Link></p>
          <p style={{ textAlign: 'center', marginTop: 10 }}><span onClick={handleDemo} style={{ fontSize: 12, color: '#64748B', cursor: 'pointer' }}>Ver demo sem cadastro</span></p>
        </div>
      </div>
    </div>
  )
}
