import React, { useEffect, useState } from 'react';
import { C } from '../theme.js';
import { getPixQr } from '../api.js';
import { Spinner } from './ui.jsx';

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Pix direto na tela (sem abrir o banco): QR Code e "copia e cola" com o valor exato do
 * plano/recarga. O código identifica o cliente (aparece no extrato) para a confirmação.
 */
export default function PixQr({ kind, itemId, priceCents, onShown }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    getPixQr(kind, itemId)
      .then((d) => { if (alive) { setData(d); onShown?.(); } })
      .catch((e) => alive && setError(e.message || 'não deu para gerar o Pix'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, itemId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.brCode);
    } catch {
      // navegador sem permissão: seleciona o texto para copiar à mão
      const el = document.getElementById('rf-pix-code');
      el?.select?.();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (error) return <div style={{ padding: 12, borderRadius: 12, background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4', fontSize: 13.5 }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, textAlign: 'center' }}><Spinner size={20} color={C.orange} /></div>;
  return (
    <div style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 16, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <img src={data.qr} alt={`QR Code do Pix de ${brl(data.amountCents ?? priceCents)}`} width={200} height={200}
          style={{ width: 200, height: 200, borderRadius: 12, background: '#fff', padding: 8, boxSizing: 'border-box' }} />
        <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Valor</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{brl(data.amountCents ?? priceCents)}</div>
          <div style={{ fontSize: 13, color: C.muted }}>{data.label} · para <b style={{ color: C.text }}>{data.receiver}</b></div>
          <div style={{ fontSize: 12, color: C.faint }}>Identificador: <code>{data.txid}</code></div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Pix copia e cola</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="rf-pix-code" readOnly value={data.brCode} onFocus={(e) => e.currentTarget.select()}
            style={{ flex: 1, minWidth: 0, height: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12.5, fontFamily: 'ui-monospace, monospace' }} />
          <button onClick={copy} style={{ flex: 'none', minHeight: 44, padding: '0 16px', borderRadius: 10, border: 'none', background: copied ? C.green : 'linear-gradient(135deg, #FF8A2A, #C2410C)', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  );
}
