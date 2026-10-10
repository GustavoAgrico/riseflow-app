import React, { useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon, { Logo } from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { deviceApprove } from '../api.js';

/**
 * Site aberto pelo app de PC/Mac ("Entrar pelo navegador", ?device=CÓDIGO): a pessoa já
 * está logada aqui e confirma que quer conectar o app a esta conta.
 */
export default function DeviceLogin({ code, user, onDone }) {
  const [state, setState] = useState('ask'); // ask | busy | ok | error
  const [error, setError] = useState('');

  async function approve() {
    setState('busy');
    setError('');
    try {
      await deviceApprove(code);
      setState('ok');
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }

  const btn = { border: 'none', borderRadius: 12, padding: '13px 18px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px 16px', background: C.bg }}>
      <div style={{ ...glass({ padding: '30px 26px' }), width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Logo size={44} /></div>
        {state === 'ok' ? (
          <>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(46,212,122,0.15)', color: C.green, display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
              <Icon name="check" size={24} strokeWidth={2.4} />
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '0 0 8px' }}>App conectado!</h1>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: '0 0 20px' }}>
              Pode voltar para o Riseframe no computador: ele já entrou na sua conta. Esta aba pode ser fechada.
            </p>
            <button onClick={onDone} style={{ ...btn, background: 'rgba(255,255,255,0.06)', color: C.text, border: `1px solid ${C.borderStrong}` }}>Continuar no site</button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 21, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '0 0 8px' }}>Conectar o app do computador</h1>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: '0 0 6px' }}>
              O app Riseframe para PC/Mac vai entrar na conta <b style={{ color: C.text }}>{user.email}</b>, com o seu plano e os seus créditos.
            </p>
            <p style={{ color: C.faint, fontSize: 12.5, lineHeight: 1.5, margin: '0 0 20px' }}>
              Só confirme se foi você que clicou em “Entrar pelo navegador” no app agora.
            </p>
            {error && (
              <div style={{ background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14, textAlign: 'left' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={onDone} style={{ ...btn, background: 'rgba(255,255,255,0.05)', color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
              <button onClick={approve} disabled={state === 'busy'} style={{ ...btn, background: GRAD, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 28px -8px rgba(255,107,53,0.5)' }}>
                {state === 'busy' && <Spinner size={15} color="#fff" />} Conectar app
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
