import React, { useState } from 'react';
import { C, GRAD, glass } from '../theme.js';

/** Botão primário com gradiente da marca, brilho e leve elevação no hover. */
export function PrimaryButton({ children, onClick, disabled, style }) {
  const [hover, setHover] = useState(false);
  const on = !disabled;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        border: 'none',
        borderRadius: 14,
        padding: '15px 22px',
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: 0.2,
        color: on ? '#fff' : C.faint,
        background: on ? GRAD : C.panel2,
        cursor: on ? 'pointer' : 'not-allowed',
        transform: on && hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: on
          ? hover
            ? '0 14px 34px -8px rgba(255,107,53,0.55), 0 6px 18px -6px rgba(124,58,237,0.5)'
            : '0 8px 22px -8px rgba(255,107,53,0.45)'
          : 'none',
        transition: 'transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Botão secundário/ghost translúcido. */
export function GhostButton({ children, onClick, disabled, style, title }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1px solid ${hover ? C.borderStrong : C.border}`,
        background: hover ? C.panel2 : 'transparent',
        color: hover ? C.text : C.muted,
        borderRadius: 12,
        padding: '9px 14px',
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all .15s ease',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Card em vidro com animação de entrada. */
export function Card({ children, style, delay = 0 }) {
  return (
    <div className="rf-anim" style={{ animationDelay: `${delay}s`, padding: 24, ...glass(), ...style }}>
      {children}
    </div>
  );
}

export function Spinner({ size = 16, color = '#fff' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid rgba(255,255,255,0.25)`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'rf-spin 0.7s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  );
}
