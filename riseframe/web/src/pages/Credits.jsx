import React, { useEffect, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../AuthContext.jsx';
import { startCheckout, syncBilling } from '../api.js';

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const input = {
  width: '100%', boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 11, padding: '13px 14px', fontSize: 16, fontFamily: 'inherit', outline: 'none',
};
const label = { display: 'block', fontSize: 13, fontWeight: 600, color: C.muted, margin: '14px 0 7px' };

function costRows(costs) {
  return [
    ['Vídeo editado (corte de silêncio + legenda básica)', costs.video],
    ['Legenda estilizada (estilos além do “clean”)', `+${costs.captionStyle}`],
    ['Cada imagem de B-roll inserida', `+${costs.image}`],
    ['Limpeza de fala por IA', `+${costs.ai}`],
    ['Clipes curtos (pacote)', costs.clips],
  ];
}

export default function Credits({ user, checkOnOpen, onBack }) {
  const { billing, setBilling, refreshBilling } = useAuth();
  const [packId, setPackId] = useState(null);
  const [name, setName] = useState(user?.name || '');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function check(quiet = false) {
    setChecking(true);
    setError('');
    try {
      const s = await syncBilling();
      setBilling(s);
      if (s.added) setNotice(`Pagamento confirmado! +${s.added} créditos na sua conta.`);
      else if (!quiet) setNotice(s.hasPending ? 'Ainda não recebemos a confirmação. Pix costuma cair em segundos — tente de novo em instantes.' : 'Nenhum pagamento pendente.');
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (checkOnOpen) check(true);
    else refreshBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    setPaying(true);
    setError('');
    try {
      const { url } = await startCheckout({ packId, name, cpf, phone });
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setPaying(false);
    }
  }

  if (!billing) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spinner size={24} color={C.orange} />
      </div>
    );
  }

  const pack = billing.packs.find((p) => p.id === packId);
  const canPay = pack && cpf.replace(/\D/g, '').length >= 11 && phone.replace(/\D/g, '').length >= 10 && !paying;

  return (
    <div className="rf-page" style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 90px' }}>
      {onBack && (
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer', margin: '0 0 18px', padding: '6px 0', fontFamily: 'inherit' }}>
          <Icon name="arrowLeft" size={16} strokeWidth={2.2} /> Voltar
        </button>
      )}
      <h1 style={{ fontSize: 'clamp(28px,5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 8px' }}>
        <span style={gradientText}>Créditos</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 15, margin: '0 0 24px', maxWidth: 560 }}>
        Cada vídeo consome créditos conforme os recursos usados. Se o processamento falhar, os créditos voltam para você.
      </p>

      {notice && <div style={glass({ padding: '14px 18px', marginBottom: 18, borderColor: `${C.green}55`, fontSize: 14 })}>{notice}</div>}

      <div className="rf-credits-top" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 16, marginBottom: 28 }}>
        <div style={glass({ padding: 22 })}>
          <div style={{ fontSize: 13, color: C.faint, marginBottom: 6 }}>Seu saldo</div>
          {billing.unlimited ? (
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Ilimitado</div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, color: C.text }}>
              {billing.credits.toLocaleString('pt-BR')}
              <span style={{ fontSize: 15, fontWeight: 600, color: C.muted, marginLeft: 8 }}>créditos</span>
            </div>
          )}
          {!billing.unlimited && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
              ≈ {Math.floor(billing.credits / billing.costs.video)} vídeo(s) básico(s)
            </div>
          )}
          {billing.hasPending && (
            <button onClick={() => check(false)} disabled={checking} style={{ marginTop: 14, width: '100%', minHeight: 44, background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {checking && <Spinner size={14} color={C.text} />} Já paguei — verificar
            </button>
          )}
        </div>

        <div style={glass({ padding: 22 })}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Quanto custa</div>
          <div style={{ display: 'grid' }}>
            {costRows(billing.costs).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 }}>
                <span style={{ color: C.muted }}>{k}</span>
                <b style={{ whiteSpace: 'nowrap' }}>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {billing.enabled && !billing.admin && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '0 0 14px' }}>Comprar créditos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 20 }}>
            {billing.packs.map((p) => {
              const on = p.id === packId;
              return (
                <button
                  key={p.id}
                  onClick={() => setPackId(p.id)}
                  style={{
                    ...glass({ padding: 20 }),
                    position: 'relative', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.text,
                    border: on ? `2px solid ${C.orange}` : p.popular ? `1px solid ${C.purple}88` : `1px solid ${C.border}`,
                  }}
                >
                  {p.popular && (
                    <span style={{ position: 'absolute', top: 12, right: 12, background: GRAD, color: '#fff', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4 }}>MAIS POPULAR</span>
                  )}
                  <div style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 30, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.8, margin: '6px 0 2px' }}>{brl(p.priceCents)}</div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{p.credits.toLocaleString('pt-BR')} créditos</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
                    ≈ {Math.floor(p.credits / billing.costs.video)} vídeos básicos · {brl(Math.round(p.priceCents / (p.credits / billing.costs.video)))} por vídeo
                  </div>
                </button>
              );
            })}
          </div>

          {pack && (
            <div style={glass({ padding: 22 })}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {pack.name} · {pack.credits.toLocaleString('pt-BR')} créditos por {brl(pack.priceCents)}
              </div>
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
                style={{ marginTop: 16, width: '100%', minHeight: 50, background: GRAD, border: 'none', color: '#fff', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: canPay ? 'pointer' : 'not-allowed', opacity: canPay ? 1 : 0.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {paying && <Spinner size={14} color="#fff" />}
                Pagar {brl(pack.priceCents)} com Pix ou cartão
              </button>
            </div>
          )}
        </>
      )}
      {error && <p style={{ color: '#FCA5B4', fontSize: 13.5, marginTop: 12 }}>{error}</p>}
      {!billing.enabled && (
        <p style={{ color: C.faint, fontSize: 13 }}>Pagamentos ainda não estão ativos neste servidor — o uso está liberado.</p>
      )}

      <style>{`@media (max-width: 720px){ .rf-credits-top{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
