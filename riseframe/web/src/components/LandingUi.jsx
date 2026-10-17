import React from 'react';
import { C, GRAD } from '../theme.js';

// Peças visuais compartilhadas pelas páginas públicas (download etc.).
export function MeshBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 520, height: 520, borderRadius: '50%', background: C.orange, filter: 'blur(160px)', opacity: 0.16 }} />
      <div style={{ position: 'absolute', top: '8%', right: '-12%', width: 560, height: 560, borderRadius: '50%', background: C.purple, filter: 'blur(170px)', opacity: 0.18 }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '25%', width: 480, height: 480, borderRadius: '50%', background: C.purpleSoft, filter: 'blur(160px)', opacity: 0.1 }} />
    </div>
  );
}

export function GhostBtn({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.orange; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderStrong; }}
    >
      {children}
    </button>
  );
}

export function GradBtn({ children, onClick, big, style }) {
  return (
    <button
      onClick={onClick}
      style={{ background: GRAD, border: 'none', color: '#fff', borderRadius: 13, padding: big ? '15px 30px' : '11px 22px', fontSize: big ? 16 : 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 30px -8px rgba(255,107,53,0.5)', transition: 'transform .15s', ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      {children}
    </button>
  );
}
