import React, { useEffect, useState } from 'react';
import { C, glass, FONT_DISPLAY } from '../theme.js';
import { Spinner } from './ui.jsx';
import { adminApproveClaim, adminClaims, adminGrant, adminRejectClaim, adminSendReminders } from '../api.js';

const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const btn = (bg, color = '#fff', border = 'none') => ({
  background: bg, color, border, borderRadius: 9, padding: '8px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
});
const input = {
  background: '#13131B', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', minWidth: 0,
};

/** Painel do admin (modo Pix por link): confirmar os "Já paguei", liberar planos na mão e lembretes. */
export default function AdminPayments({ plans }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState(plans[0]?.id || '');

  async function run(key, fn, ok) {
    setBusy(key);
    setErr('');
    setMsg('');
    try {
      const r = await fn();
      if (r?.pending) setData(r);
      if (ok) setMsg(typeof ok === 'function' ? ok(r) : ok);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    run('load', adminClaims);
  }, []);

  const sentText = (s) => (s ? ` Aviso ao cliente: e-mail ${s.email ? 'enviado' : 'não enviado'}, WhatsApp ${s.whatsapp ? 'enviado' : 'não enviado'}.` : '');

  return (
    <div style={glass({ padding: 22, marginBottom: 28, borderColor: `${C.orange}55` })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: 0 }}>Pagamentos Pix para confirmar</h2>
        <button style={btn('transparent', C.muted, `1px solid ${C.border}`)} onClick={() => run('load', adminClaims)} disabled={!!busy}>
          {busy === 'load' ? <Spinner size={12} color={C.muted} /> : 'Atualizar'}
        </button>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: '6px 0 14px' }}>
        Confira no extrato do banco se o Pix caiu antes de confirmar. Ao confirmar, o plano vale 30 dias e o cliente é avisado por e-mail e WhatsApp.
      </p>

      {!data ? (
        <Spinner size={18} color={C.orange} />
      ) : data.pending.length === 0 ? (
        <div style={{ fontSize: 14, color: C.faint, padding: '6px 0 4px' }}>Nenhum pagamento esperando confirmação.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {data.pending.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{cap(c.itemName)} · {brl(c.priceCents)}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3, overflowWrap: 'anywhere' }}>
                  {c.name || 'Sem nome'} · {c.contactEmail || c.email} · WhatsApp {c.phone}
                </div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Avisou em {when(c.createdAt)}</div>
                {c.notice?.email?.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 2, color: c.notice.email.every((m) => m.ok) ? C.green : '#FCA5B4', overflowWrap: 'anywhere' }}>
                    {c.notice.email.every((m) => m.ok)
                      ? '✓ aviso enviado para o seu e-mail'
                      : `✕ aviso por e-mail não saiu: ${c.notice.email.filter((m) => !m.ok).map((m) => m.error || 'envio de e-mail não configurado').join(' · ')}`}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btn(C.green, '#062814')} disabled={!!busy} onClick={() => run(c.id, () => adminApproveClaim(c.id), (r) => `Confirmado: ${c.itemName} de ${c.email}.${sentText(r.sent)}`)}>
                  {busy === c.id ? <Spinner size={12} color="#062814" /> : 'Confirmar Pix'}
                </button>
                <button style={btn('transparent', C.muted, `1px solid ${C.border}`)} disabled={!!busy} onClick={() => window.confirm('Recusar este aviso? O cliente não recebe o plano.') && run(`r${c.id}`, () => adminRejectClaim(c.id), 'Aviso recusado.')}>
                  Recusar
                </button>
                {c.waLink && (
                  <a href={c.waLink} target="_blank" rel="noreferrer" style={{ ...btn('transparent', C.text, `1px solid ${C.border}`), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Liberação manual */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 18, paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Liberar plano pelo e-mail do cliente</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: '1 1 220px' }} type="email" placeholder="email@cliente.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select style={{ ...input, flex: '0 1 160px' }} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {brl(p.priceCents)}</option>)}
          </select>
          <button style={btn(C.purple)} disabled={!!busy || !email.includes('@')} onClick={() => run('grant', () => adminGrant({ email, kind: 'plan', itemId: planId }), (r) => `Plano liberado para ${r.user} até ${new Date(r.until).toLocaleDateString('pt-BR')}.${sentText(r.sent)}`)}>
            {busy === 'grant' ? <Spinner size={12} color="#fff" /> : 'Liberar 30 dias'}
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={btn('transparent', C.muted, `1px solid ${C.border}`)} disabled={!!busy} onClick={() => run('rem', adminSendReminders, (r) => (r.sent.length ? `${r.sent.length} lembrete(s) de vencimento enviados.` : 'Nenhum lembrete pendente agora.'))}>
            {busy === 'rem' ? <Spinner size={12} color={C.muted} /> : 'Enviar lembretes de vencimento agora'}
          </button>
          <span style={{ fontSize: 12, color: C.faint, marginLeft: 10 }}>Saem sozinhos 3 dias antes, 1 dia antes e no vencimento (8h–21h).</span>
        </div>
      </div>

      {msg && <p style={{ color: C.green, fontSize: 13.5, margin: '12px 0 0' }}>{msg}</p>}
      {err && <p style={{ color: '#FCA5B4', fontSize: 13.5, margin: '12px 0 0' }}>{err}</p>}

      {data?.recent?.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 13, color: C.muted, cursor: 'pointer' }}>Últimos decididos ({data.recent.length})</summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {data.recent.map((c) => (
              <div key={c.id} style={{ fontSize: 12.5, color: C.faint }}>
                {c.status === 'approved' ? '✓' : '✕'} {c.itemName} · {c.email} · {when(c.decidedAt || c.createdAt)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
