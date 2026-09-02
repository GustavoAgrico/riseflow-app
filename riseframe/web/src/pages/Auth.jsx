import React, { useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon, { Logo } from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../AuthContext.jsx';

function Field({ label, type, value, onChange, placeholder, autoFocus }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 7 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={type === 'password' ? 'current-password' : 'on'}
        style={{ width: '100%', boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${C.border}`, borderRadius: 11, padding: '12px 14px', fontSize: 14.5, fontFamily: 'inherit', outline: 'none' }}
        onFocus={(e) => { e.target.style.borderColor = C.orange; }}
        onBlur={(e) => { e.target.style.borderColor = C.border; }}
      />
    </label>
  );
}

export default function Auth({ initialMode = 'login', onDone, onHome }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register(email, password, name);
      else await login(email, password);
      onDone?.();
    } catch (err) {
      setError(err.message || 'não foi possível continuar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '20%', width: 500, height: 500, borderRadius: '50%', background: C.orange, filter: 'blur(170px)', opacity: 0.14 }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '15%', width: 520, height: 520, borderRadius: '50%', background: C.purple, filter: 'blur(180px)', opacity: 0.16 }} />
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 410 }}>
        <div style={{ textAlign: 'center', marginBottom: 26, cursor: 'pointer' }} onClick={onHome}>
          <Logo size={44} />
          <div style={{ fontWeight: 800, fontSize: 22, fontFamily: FONT_DISPLAY, letterSpacing: -0.5, marginTop: 8 }}>Riseframe</div>
        </div>

        <div style={glass({ padding: 30 })}>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.6, margin: '0 0 6px', textAlign: 'center' }}>
            {isRegister ? 'Criar conta' : 'Bem-vindo de volta'}
          </h1>
          <p style={{ color: C.muted, fontSize: 14, textAlign: 'center', margin: '0 0 24px' }}>
            {isRegister ? 'Comece a editar em segundos' : 'Entre para continuar editando'}
          </p>

          <form onSubmit={submit}>
            {isRegister && (
              <Field label="Nome" type="text" value={name} onChange={setName} placeholder="Como quer ser chamado" autoFocus />
            )}
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="voce@email.com" autoFocus={!isRegister} />
            <Field label="Senha" type="password" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" />

            {error && (
              <div style={{ background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="alert" size={15} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{ width: '100%', background: GRAD, border: 'none', color: '#fff', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 28px -8px rgba(255,107,53,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            >
              {busy && <Spinner size={15} color="#fff" />}
              {isRegister ? 'Criar conta grátis' : 'Entrar'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: C.muted }}>
            {isRegister ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
            <button
              onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}
              style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0 }}
            >
              {isRegister ? 'Entrar' : 'Criar agora'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={onHome} style={{ background: 'none', border: 'none', color: C.faint, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ← Voltar para a página inicial
          </button>
        </div>
      </div>
    </div>
  );
}
