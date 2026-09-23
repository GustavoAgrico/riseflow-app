import React, { useEffect, useRef, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../AuthContext.jsx';
import { startCheckout, syncBilling } from '../api.js';

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n) => Number(n).toLocaleString('pt-BR');
const date = (iso) => new Date(iso).toLocaleDateString('pt-BR');

// Linhas comparadas nos cartões dos planos (ids de shared/credits.js; null = sempre incluso).
const FEATURE_ROWS = [
  { id: null, label: 'Corte de silêncio + legenda básica' },
  { id: 'captionStyle', label: 'Legendas estilizadas' },
  { id: 'image', label: 'B-roll (imagens automáticas)' },
  { id: 'ai', label: 'Limpeza de fala por IA' },
  { id: 'clips', label: 'Clipes curtos' },
];

const input = {
  width: '100%', boxSizing: 'border-box', background: '#13131B', color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 11, padding: '13px 14px', fontSize: 16, fontFamily: 'inherit', outline: 'none',
};
const label = { display: 'block', fontSize: 13, fontWeight: 600, color: C.muted, margin: '14px 0 7px' };
const h2 = { fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '0 0 6px' };

function appliedMessage(applied, billing) {
  const parts = applied.map((a) => {
    if (a.kind === 'plan') return `plano ${billing.plans.find((p) => p.id === a.itemId)?.name || a.itemId} ativo`;
    return `+${num(a.credits)} créditos avulsos`;
  });
  return `Pagamento confirmado: ${parts.join(' e ')}.`;
}

export default function Plans({ user, checkOnOpen }) {
  const { billing, setBilling, refreshBilling } = useAuth();
  const [pick, setPick] = useState(null); // { kind: 'plan'|'pack', id }
  const [name, setName] = useState(user?.name || '');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const formRef = useRef(null);

  async function check(quiet = false) {
    setChecking(true);
    setError('');
    try {
      const s = await syncBilling();
      setBilling(s);
      if (s.applied?.length) setNotice(appliedMessage(s.applied, s));
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

  // No celular o formulário fica abaixo dos cartões: rola até ele ao escolher.
  useEffect(() => {
    if (pick) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [pick?.kind, pick?.id]);

  async function pay() {
    setPaying(true);
    setError('');
    try {
      const { url } = await startCheckout({ kind: pick.kind, itemId: pick.id, name, cpf, phone });
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

  const { plan: current, plans, packs, costs } = billing;
  const selected = pick && (pick.kind === 'plan' ? plans : packs).find((x) => x.id === pick.id);
  const switching = pick?.kind === 'plan' && current && current.id !== pick.id;
  const canPay = selected && cpf.replace(/\D/g, '').length >= 11 && phone.replace(/\D/g, '').length >= 10 && !paying;
  const canBuy = billing.enabled && !billing.admin;

  return (
    <div className="rf-page" style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px 90px' }}>
      <h1 style={{ fontSize: 'clamp(28px,5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 8px' }}>
        <span style={gradientText}>Planos</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 15, margin: '0 0 24px', maxWidth: 600 }}>
        Cada plano dá créditos por mês e libera recursos. Os créditos do mês renovam a cada {billing.periodDays} dias e não acumulam.
        Se um processamento falhar, os créditos voltam.
      </p>

      {notice && <div style={glass({ padding: '14px 18px', marginBottom: 18, borderColor: `${C.green}55`, fontSize: 14 })}>{notice}</div>}

      {/* Situação atual */}
      <div style={glass({ padding: 22, marginBottom: 30 })}>
        <div className="rf-plan-status" style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.faint, marginBottom: 4 }}>Seu plano</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: FONT_DISPLAY }}>
              {billing.unlimited ? 'Ilimitado' : current ? current.name : 'Sem plano'}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              {billing.unlimited
                ? 'Todos os recursos, sem cobrança.'
                : current
                  ? `Válido até ${date(current.until)} · ${num(current.credits)} de ${num(current.monthlyCredits)} créditos do mês`
                  : 'Recursos básicos: corte de silêncio + legenda básica.'}
            </div>
          </div>
          {!billing.unlimited && (
            <div className="rf-plan-balance" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: C.faint, marginBottom: 2 }}>Saldo total</div>
              <div style={{ fontSize: 34, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1 }}>
                {num(billing.credits)} <span style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>créditos</span>
              </div>
              {billing.extraCredits > 0 && current && <div style={{ fontSize: 12, color: C.faint }}>inclui {num(billing.extraCredits)} avulsos</div>}
            </div>
          )}
        </div>
        {billing.hasPending && (
          <button onClick={() => check(false)} disabled={checking} style={{ marginTop: 16, width: '100%', minHeight: 44, background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {checking && <Spinner size={14} color={C.text} />} Já paguei — verificar pagamento
          </button>
        )}
      </div>

      {/* Planos mensais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>
        {plans.map((p) => {
          const isCurrent = current?.id === p.id;
          const on = pick?.kind === 'plan' && pick.id === p.id;
          const cta = isCurrent ? 'Renovar' : current ? `Mudar para ${p.name}` : `Assinar ${p.name}`;
          return (
            <div key={p.id} style={{ ...glass({ padding: 22 }), position: 'relative', display: 'flex', flexDirection: 'column', border: on ? `2px solid ${C.orange}` : p.popular ? `1px solid ${C.purple}99` : `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{p.name}</div>
                {isCurrent ? (
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: C.green, border: `1px solid ${C.green}66`, borderRadius: 20, padding: '3px 9px' }}>SEU PLANO</span>
                ) : p.popular ? (
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: GRAD, borderRadius: 20, padding: '3px 9px' }}>MAIS POPULAR</span>
                ) : null}
              </div>
              <div style={{ margin: '10px 0 2px' }}>
                <span style={{ fontSize: 32, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.8 }}>{brl(p.priceCents)}</span>
                <span style={{ fontSize: 14, color: C.muted }}> /mês</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{num(p.credits)} créditos por mês</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>≈ {Math.floor(p.credits / costs.video)} vídeos básicos</div>
              <div style={{ display: 'grid', gap: 8, margin: '16px 0 18px' }}>
                {FEATURE_ROWS.map((f) => {
                  const has = f.id === null || p.features.includes(f.id);
                  return (
                    <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: has ? C.text : C.faint }}>
                      <Icon name={has ? 'check' : 'close'} size={15} strokeWidth={2.4} color={has ? C.green : C.faint} />
                      <span style={{ textDecoration: has ? 'none' : 'line-through' }}>{f.label}</span>
                    </div>
                  );
                })}
              </div>
              {canBuy && (
                <button
                  onClick={() => setPick({ kind: 'plan', id: p.id })}
                  style={{ marginTop: 'auto', width: '100%', minHeight: 46, borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: p.popular || on ? 'none' : `1px solid ${C.borderStrong}`, background: p.popular || on ? GRAD : 'transparent', color: C.text }}
                >
                  {cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Recarga avulsa */}
      {canBuy && (
        <div style={{ marginTop: 34 }}>
          <h2 style={h2}>Recarga avulsa</h2>
          <p style={{ color: C.muted, fontSize: 14, margin: '0 0 14px' }}>
            Créditos extras que não expiram — usados depois dos créditos do mês. Não liberam recursos do plano.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {packs.map((p) => {
              const on = pick?.kind === 'pack' && pick.id === p.id;
              return (
                <button key={p.id} onClick={() => setPick({ kind: 'pack', id: p.id })} style={{ ...glass({ padding: 16 }), textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.text, border: on ? `2px solid ${C.orange}` : `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{num(p.credits)} créditos</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, marginTop: 4 }}>{brl(p.priceCents)}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>≈ {Math.floor(p.credits / costs.video)} vídeos básicos</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagamento */}
      {selected && (
        <div ref={formRef} style={glass({ padding: 22, marginTop: 24 })}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {pick.kind === 'plan'
              ? `Plano ${selected.name} · ${brl(selected.priceCents)} por ${billing.periodDays} dias`
              : `Recarga de ${num(selected.credits)} créditos · ${brl(selected.priceCents)}`}
          </div>
          {switching && (
            <p style={{ fontSize: 13, color: C.orangeSoft, margin: '8px 0 0' }}>
              Trocar de plano começa um novo período de {billing.periodDays} dias agora. O que resta do plano {current.name} não é aproveitado.
            </p>
          )}
          {pick.kind === 'plan' && current?.id === pick.id && (
            <p style={{ fontSize: 13, color: C.muted, margin: '8px 0 0' }}>
              Renovar soma mais {billing.periodDays} dias e volta os créditos do mês para {num(selected.credits)} (não acumula).
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
          <p style={{ color: C.faint, fontSize: 12, margin: '8px 0 0' }}>Exigidos pela AbacatePay para emitir a cobrança. Sem renovação automática.</p>
          <button
            onClick={pay}
            disabled={!canPay}
            style={{ marginTop: 16, width: '100%', minHeight: 50, background: GRAD, border: 'none', color: '#fff', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: canPay ? 'pointer' : 'not-allowed', opacity: canPay ? 1 : 0.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {paying && <Spinner size={14} color="#fff" />}
            Pagar {brl(selected.priceCents)} com Pix ou cartão
          </button>
        </div>
      )}
      {error && <p style={{ color: '#FCA5B4', fontSize: 13.5, marginTop: 12 }}>{error}</p>}
      {!billing.enabled && (
        <p style={{ color: C.faint, fontSize: 13, marginTop: 16 }}>As assinaturas abrem em breve. Enquanto isso, use seus créditos de teste.</p>
      )}

      <style>{`@media (max-width: 720px){ .rf-plan-balance{ text-align: left !important; } }`}</style>

      {/* Custos */}
      <div style={glass({ padding: 22, marginTop: 34 })}>
        <h2 style={{ ...h2, fontSize: 17, marginBottom: 10 }}>Quanto custa cada vídeo</h2>
        {[
          ['Vídeo editado (corte de silêncio + legenda básica)', costs.video],
          ['Legenda estilizada', `+${costs.captionStyle}`],
          ['Cada imagem de B-roll inserida', `+${costs.image}`],
          ['Limpeza de fala por IA', `+${costs.ai}`],
          ['Clipes curtos (pacote)', costs.clips],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 }}>
            <span style={{ color: C.muted }}>{k}</span>
            <b style={{ whiteSpace: 'nowrap' }}>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
