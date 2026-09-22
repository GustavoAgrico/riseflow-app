import React from 'react';
import { C } from '../theme.js';
import Icon from './Icon.jsx';
import { useAuth } from '../AuthContext.jsx';
import { creditItems, creditTotal, lockedItems, cheapestPlanFor } from '../../../shared/credits.js';

/** Pede ao Root para abrir a página de planos (sem acoplar a navegação aqui). */
export const openPlans = () => window.dispatchEvent(new CustomEvent('rf:open-plans'));

const linkBtn = { background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit' };

/**
 * "Custa N créditos · você tem M" antes de enviar/renderizar, e aviso quando algum
 * recurso ligado não está no plano. Some quando não há cobrança.
 */
export default function CostLine({ mode, options, style }) {
  const { billing } = useAuth();
  if (!billing || billing.unlimited) return null;
  const items = creditItems(mode, options, billing.costs);
  const total = creditTotal(items);
  if (!total) return null;
  const locked = lockedItems(items, billing.features);
  const short = billing.credits < total;
  return (
    <div style={{ marginTop: 12, fontSize: 13, color: C.muted, ...style }}>
      {locked.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', marginBottom: 10, borderRadius: 10, background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4' }}>
          <Icon name="lock" size={15} strokeWidth={2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {locked.map((i) => (
              <div key={i.id}>
                {i.label}: plano {cheapestPlanFor(i.id, billing.plans) || 'superior'} ou acima.
              </div>
            ))}
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Desligue o recurso ou mude de plano.</div>
          </div>
          <button onClick={openPlans} style={{ ...linkBtn, padding: 0, flexShrink: 0 }}>Ver planos</button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="zap" size={14} strokeWidth={2} color={C.purpleSoft} />
          Custa <b style={{ color: C.text }}>{total} créditos</b>
          <span style={{ color: C.faint }}>· você tem {billing.credits.toLocaleString('pt-BR')}</span>
        </span>
        {short && (
          <button onClick={openPlans} style={linkBtn}>
            Assinar ou recarregar →
          </button>
        )}
      </div>
      {items.length > 1 && (
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
          {items.map((i) => `${i.label} ${i.credits}`).join(' · ')}
        </div>
      )}
    </div>
  );
}
