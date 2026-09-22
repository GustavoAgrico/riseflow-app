import React, { useEffect, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import { Spinner } from '../components/ui.jsx';
import { getBilling, startCheckout, syncBilling } from '../api.js';

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (iso) => new Date(iso).toLocaleDateString('pt-BR');

const FEATURES = [
  'Vídeos ilimitados enquanto a assinatura estiver ativa',
  'Corte de silêncio e legendas automáticas',
  'B-roll, color grade e clipes curtos',
  'Pague com Pix ou cartão — sem renovação automática',
];

const input = {
  width: '100%', boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 11, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
};
const label = { display: 'block', fontSize: 13, fontWeight: 600, color: C.muted, margin: '14px 0 7px' };

export default function Plan({ user, checkOnOpen, onNewVideo }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState(user?.name || '');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);

  async function check(quiet = false) {
    setChecking(true);
    setError('');
    try {
      const s = await syncBilling();
      setStatus(s);
      if (s.activated) setNotice('Pagamento confirmado! Sua assinatura está ativa.');
      else if (!quiet) setNotice(s.hasPending ? 'Ainda não recebemos a confirmação do pagamento. Pix costuma cair em segundos — tente de novo em instantes.' : 'Nenhum pagamento pendente.');
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setStatus(await getBilling());
        if (checkOnOpen) await check(true);
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    setPaying(true);
    setError('');
    try {
      const { url } = await startCheckout({ name, cpf, phone });
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setPaying(false);
    }
  }

  if (!status) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: C.muted }}>
        {error ? <p style={{ color: '#FCA5B4' }}>{error}</p> : <Spinner size={24} color={C.orange} />}
      </div>
    );
  }

  const { plan } = status;
  const canPay = cpf.replace(/\D/g, '').length >= 11 && phone.replace(/\D/g, '').length >= 10 && !paying;

  let summary;
  if (!status.enabled) summary = 'Uso liberado — pagamentos não estão ativos neste servidor.';
  else if (status.admin) summary = 'Conta de administrador — acesso liberado.';
  else if (status.active) summary = `${plan.name} ativo até ${date(status.paidUntil)}.`;
  else summary = `Plano grátis: ${status.freeUsed} de ${status.freeLimit} vídeos usados.`;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 80px' }}>
      <h1 style={{ fontSize: 'clamp(26px,5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 6px' }}>
        <span style={gradientText}>Assinatura</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 15, margin: '0 0 30px' }}>{summary}</p>

      {notice && (
        <div style={glass({ padding: '14px 18px', marginBottom: 20, borderColor: `${C.green}55`, color: C.text, fontSize: 14 })}>{notice}</div>
      )}

      {status.enabled && !status.admin && (
        <div style={glass({ padding: 26, marginBottom: 20 })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: 0 }}>{plan.name}</h2>
            <div>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{brl(plan.priceCents)}</span>
              <span style={{ color: C.muted, fontSize: 14 }}> / {plan.periodDays} dias</span>
            </div>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 6px', display: 'grid', gap: 9 }}>
            {FEATURES.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.muted }}>
                <span style={{ color: C.green, fontWeight: 800 }}>✓</span> {f}
              </li>
            ))}
          </ul>
          {status.active && (
            <p style={{ color: C.faint, fontSize: 13, margin: '10px 0 0' }}>
              Pagar de novo agora soma mais {plan.periodDays} dias ao que você já tem.
            </p>
          )}

          <label style={label}>Nome completo</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
            <div>
              <label style={label}>CPF ou CNPJ</label>
              <input style={input} value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" />
            </div>
            <div>
              <label style={label}>Celular com DDD</label>
              <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" />
            </div>
          </div>
          <p style={{ color: C.faint, fontSize: 12, margin: '8px 0 0' }}>Exigidos pela AbacatePay para emitir a cobrança.</p>

          <button
            onClick={pay}
            disabled={!canPay}
            style={{ marginTop: 18, width: '100%', background: GRAD, border: 'none', color: '#fff', borderRadius: 12, padding: '14px 20px', fontSize: 15, fontWeight: 700, cursor: canPay ? 'pointer' : 'not-allowed', opacity: canPay ? 1 : 0.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {paying && <Spinner size={14} color="#fff" />}
            {status.active ? 'Renovar' : 'Assinar'} com Pix ou cartão
          </button>
          {error && <p style={{ color: '#FCA5B4', fontSize: 13, marginTop: 10 }}>{error}</p>}

          {status.hasPending && (
            <button
              onClick={() => check(false)}
              disabled={checking}
              style={{ marginTop: 12, width: '100%', background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {checking && <Spinner size={14} color={C.text} />}
              Já paguei — verificar pagamento
            </button>
          )}
        </div>
      )}

      {status.canCreate && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={onNewVideo}
            style={{ background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Ir para o editor →
          </button>
        </div>
      )}
    </div>
  );
}
