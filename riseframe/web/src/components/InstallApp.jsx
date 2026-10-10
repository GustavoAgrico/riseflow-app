import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from './Icon.jsx';
import { useInstall, promptInstall } from '../installApp.js';

/**
 * Botão "Instalar app" (só aparece quando dá para instalar). `compact`: só o ícone, para
 * a barra do celular. No iPhone abre o passo a passo do Safari.
 */
export default function InstallApp({ compact = false }) {
  const { show, native, ios } = useInstall();
  const [help, setHelp] = useState(false);
  if (!show) return null;
  const onClick = () => (native ? promptInstall() : ios ? setHelp(true) : null);
  return (
    <>
      {compact ? (
        <button onClick={onClick} aria-label="Instalar o app" title="Instalar o app" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 11px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.borderStrong}`, color: C.text, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          <Icon name="download" size={14} strokeWidth={2.2} /> App
        </button>
      ) : (
        <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 40, padding: '0 12px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
          <Icon name="download" size={16} strokeWidth={2} /> Instalar o app
        </button>
      )}
      {/* Portal: a barra do topo tem backdrop-filter, que prenderia o position:fixed nela. */}
      {help && createPortal(
        <div onClick={() => setHelp(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass({ padding: '22px 20px calc(18px + env(safe-area-inset-bottom))' }), width: '100%', maxWidth: 420, background: '#12121a' }}>
            <div style={{ fontWeight: 800, fontSize: 18, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Instalar o Riseframe no iPhone</div>
            <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 14 }}>Fica com ícone na tela inicial e abre em tela cheia, como um app.</div>
            {[
              ['1', <>Toque em <b style={{ color: C.text }}>Compartilhar</b> <ShareGlyph /> na barra do Safari</>],
              ['2', <>Escolha <b style={{ color: C.text }}>Adicionar à Tela de Início</b></>],
              ['3', <>Toque em <b style={{ color: C.text }}>Adicionar</b></>],
            ].map(([n, t]) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, fontSize: 14, color: C.muted }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: GRAD, color: '#fff', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
                <span>{t}</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: C.faint, margin: '4px 0 14px' }}>Precisa ser pelo Safari (no Chrome do iPhone o menu é parecido: Compartilhar → Adicionar à Tela de Início).</div>
            <button onClick={() => setHelp(false)} style={{ width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 14.5, fontFamily: 'inherit', cursor: 'pointer' }}>Entendi</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const ShareGlyph = () => (
  <svg width="15" height="17" viewBox="0 0 15 17" style={{ verticalAlign: '-3px', display: 'inline-block' }} aria-hidden="true">
    <path d="M7.5 1v10M4 4.5 7.5 1 11 4.5M3 7.5H1.5v8h12v-8H12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
