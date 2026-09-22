import React, { useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY, fmtDuration } from '../theme.js';
import Icon from '../components/Icon.jsx';

const PLANS = [
  { id: 'starter', tokens: 500, price: 29.90, priceDisplay: 'R$ 29,90', color: C.orange },
  { id: 'pro', tokens: 2000, price: 99.90, priceDisplay: 'R$ 99,90', color: C.purple, popular: true },
  { id: 'enterprise', tokens: 5000, price: 249.90, priceDisplay: 'R$ 249,90', color: C.cyan || '#22D3EE' },
];

export default function Credits({ user, onBack }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState([
    // Mock data - será substituído por dados reais do backend
    // { id: 1, plan: 'pro', tokens: 2000, price: 99.90, date: new Date(Date.now() - 86400000), status: 'completed' }
  ]);

  const handleBuy = async (plan) => {
    try {
      setProcessing(true);
      setSelectedPlan(plan.id);
      // Simula transação bem-sucedida
      const newPurchase = {
        id: purchaseHistory.length + 1,
        plan: plan.id,
        tokens: plan.tokens,
        price: plan.price,
        priceDisplay: plan.priceDisplay,
        date: new Date(),
        status: 'completed'
      };

      // Aqui você integraria com Stripe, PagSeguro, etc.
      alert(`Plano ${plan.id} selecionado: ${plan.tokens} tokens por ${plan.priceDisplay}\n\nIntegração de pagamento em desenvolvimento.`);

      // Descomente quando integrar com backend
      // setPurchaseHistory([newPurchase, ...purchaseHistory]);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: 0, padding: '40px 32px 90px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-12%', right: '2%', width: 460, height: 460, borderRadius: '50%', background: C.purple, filter: 'blur(190px)', opacity: 0.12 }} />
        <div style={{ position: 'absolute', top: '20%', left: '-6%', width: 340, height: 340, borderRadius: '50%', background: C.orange, filter: 'blur(180px)', opacity: 0.09 }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 24, fontFamily: 'inherit' }}>
          <Icon name="chevron" size={16} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} /> Voltar
        </button>

        <h1 style={{ fontSize: 'clamp(26px,4.5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1.1, margin: '0 0 12px' }}>
          Adquira <span style={gradientText}>créditos</span>
        </h1>
        <p style={{ fontSize: 16, color: C.muted, marginBottom: 32, maxWidth: 600 }}>
          Cada renderização de vídeo consome tokens. Escolha o plano que melhor se adequa ao seu uso.
        </p>

        {/* Status de créditos atuais */}
        <div style={{ ...glass({ padding: 24 }), marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Icon name="zap" size={24} strokeWidth={1.9} color={C.purple} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.faint }}>Créditos disponíveis</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.purple, fontFamily: FONT_DISPLAY, letterSpacing: -0.6 }}>{user?.credits || 0}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Cada renderização em HD consome ~50-100 tokens, dependendo da duração.
          </div>

          {/* Barra de uso */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: C.faint }}>Uso este mês</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>150 / 1000 tokens</div>
            </div>
            <div style={{ width: '100%', height: 6, background: C.panel2, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: '15%', height: '100%', background: C.purple, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
              Créditos expiram em: 30 set 2027
            </div>
          </div>
        </div>

        {/* Planos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 40 }}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                ...glass({ padding: 0 }),
                position: 'relative',
                overflow: 'hidden',
                border: plan.popular ? `2px solid ${plan.color}` : `1px solid ${C.border}`,
                background: plan.popular ? `linear-gradient(135deg, rgba(${plan.color === C.purple ? '124,58,237' : '34,211,238'},0.08), rgba(255,107,53,0.04))` : 'transparent',
              }}
            >
              {plan.popular && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#000', padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700 }}>
                  MAIS POPULAR
                </div>
              )}
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${plan.color}22`, border: `1px solid ${plan.color}44`, display: 'grid', placeItems: 'center', color: plan.color }}>
                    <Icon name="zap" size={20} strokeWidth={1.9} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{plan.id}</div>
                    <div style={{ fontSize: 11, color: C.faint }}>{plan.tokens} tokens</div>
                  </div>
                </div>

                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: plan.color, fontFamily: FONT_DISPLAY, letterSpacing: -0.8 }}>
                    {plan.priceDisplay}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                    {(plan.price / plan.tokens * 100).toFixed(2)} centavos por token
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    <Icon name="check" size={14} strokeWidth={2.5} color={plan.color} /> {plan.tokens} tokens
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    <Icon name="check" size={14} strokeWidth={2.5} color={plan.color} /> Válido por 12 meses
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    <Icon name="check" size={14} strokeWidth={2.5} color={plan.color} /> Suporte por email
                  </div>
                </div>

                <button
                  onClick={() => handleBuy(plan)}
                  disabled={processing && selectedPlan === plan.id}
                  style={{
                    width: '100%',
                    background: plan.popular ? GRAD : `rgba(${plan.color === C.purple ? '124,58,237' : '34,211,238'},0.15)`,
                    color: plan.popular ? '#fff' : plan.color,
                    border: plan.popular ? 'none' : `1px solid ${plan.color}44`,
                    borderRadius: 10,
                    padding: '12px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: (processing && selectedPlan === plan.id) ? 'wait' : 'pointer',
                    opacity: (processing && selectedPlan === plan.id) ? 0.7 : 1,
                    fontFamily: 'inherit',
                    boxShadow: plan.popular ? '0 8px 20px -8px rgba(255,107,53,0.55)' : 'none',
                  }}
                >
                  {processing && selectedPlan === plan.id ? 'Processando…' : 'Comprar agora'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ ...glass({ padding: 28 }), maxWidth: 600, margin: '0 auto', marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Perguntas frequentes</h2>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Quanto custa cada renderização?</div>
              <div style={{ fontSize: 12, color: C.muted }}>Varia de 50-150 tokens dependendo da duração e efeitos aplicados. Renderizações básicas custam menos.</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Quando os créditos expiram?</div>
              <div style={{ fontSize: 12, color: C.muted }}>Créditos comprados são válidos por 12 meses a partir da data de compra.</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Posso reembolsar créditos?</div>
              <div style={{ fontSize: 12, color: C.muted }}>Reembolsos são permitidos em até 30 dias após a compra, desde que os créditos não tenham sido utilizados.</div>
            </div>
          </div>
        </div>

        {/* Histórico de compras */}
        {purchaseHistory.length > 0 && (
          <div style={{ ...glass({ padding: 28 }), maxWidth: 600, margin: '0 auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Histórico de compras</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {purchaseHistory.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: 8, background: 'rgba(124,58,237,0.05)', border: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{p.plan} — {p.tokens} tokens</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                      {new Date(p.date).toLocaleDateString('pt-BR')} • {p.priceDisplay}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.green, background: 'rgba(34,197,94,0.15)', padding: '4px 10px', borderRadius: 6 }}>✓ Concluído</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {purchaseHistory.length === 0 && (
          <div style={{ ...glass({ padding: 28 }), maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              Você ainda não realizou nenhuma compra de créditos.
            </div>
            <div style={{ fontSize: 12, color: C.faint }}>
              Escolha um dos planos acima para começar a renderizar seus vídeos.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
