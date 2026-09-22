import React from 'react';
import { C } from '../theme.js';
import Icon from './Icon.jsx';
import { useAuth } from '../AuthContext.jsx';
import { creditItems, creditTotal } from '../../../shared/credits.js';

/** Pede ao Root para abrir a página de créditos (sem acoplar a navegação aqui). */
export const openCredits = () => window.dispatchEvent(new CustomEvent('rf:open-credits'));

/** "Custa N créditos · você tem M" antes de enviar/renderizar. Some quando não há cobrança. */
export default function CostLine({ mode, options, style }) {
  const { billing } = useAuth();
  if (!billing || billing.unlimited) return null;
  const items = creditItems(mode, options, billing.costs);
  const total = creditTotal(items);
  if (!total) return null;
  const short = billing.credits < total;
  return (
    <div style={{ marginTop: 12, fontSize: 13, color: C.muted, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sparkles" size={14} strokeWidth={2} color={C.purpleSoft} />
          Custa <b style={{ color: C.text }}>{total} créditos</b>
          <span style={{ color: C.faint }}>· você tem {billing.credits}</span>
        </span>
        {short && (
          <button
            onClick={openCredits}
            style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit' }}
          >
            Comprar créditos →
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
