import React, { useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import { Logo } from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../AuthContext.jsx';
import { resendVerify } from '../api.js';

/** Conta nova: confirma o e-mail com o código de 6 dígitos antes de usar o editor. */
export default function VerifyEmail({ user, onLogout }) {
  const { verifyAccount } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function confirm(e) {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await verifyAccount(code);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    try {
      await resendVerify();
      setNotice('Enviamos um novo código. Veja também a caixa de spam.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={confirm} style={{ ...glass({ padding: 28 }), width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Logo size={40} /></div>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '0 0 8px' }}>Confirme seu e-mail</h1>
        <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55, margin: '0 0 20px' }}>
          Enviamos um código de 6 dígitos para <b style={{ color: C.text }}>{user.email}</b>. Digite abaixo para liberar sua conta.
        </p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 54, textAlign: 'center', letterSpacing: 10, fontSize: 24, fontWeight: 700, borderRadius: 12, border: `1px solid ${C.borderStrong || C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontFamily: 'inherit' }}
        />
        <button type="submit" disabled={busy || code.length !== 6}
          style={{ marginTop: 14, width: '100%', minHeight: 50, border: 'none', borderRadius: 12, background: GRAD, color: '#fff', fontSize: 15.5, fontWeight: 700, cursor: busy || code.length !== 6 ? 'not-allowed' : 'pointer', opacity: code.length === 6 ? 1 : 0.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {busy && <Spinner size={14} />} Confirmar
        </button>
        {error && <p style={{ color: '#FCA5B4', fontSize: 13.5, margin: '12px 0 0' }}>{error}</p>}
        {notice && <p style={{ color: C.green, fontSize: 13.5, margin: '12px 0 0' }}>{notice}</p>}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 18, fontSize: 13.5 }}>
          <button type="button" onClick={resend} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reenviar código</button>
          <button type="button" onClick={onLogout} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>Usar outro e-mail</button>
        </div>
      </form>
    </div>
  );
}
