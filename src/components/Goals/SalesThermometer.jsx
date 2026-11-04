import React from 'react'

// Termômetro de vendas: o mercúrio sobe conforme a meta é atingida.
export function SalesThermometer({ pct = 0, reached = false, color = '#FF6B35' }) {
  const p = Math.max(0, Math.min(100, pct))
  const TUBE_TOP = 10
  const TUBE_BOTTOM = 128
  const TUBE_H = TUBE_BOTTOM - TUBE_TOP
  const fillH = (TUBE_H * p) / 100
  const fillY = TUBE_BOTTOM - fillH
  const fill = reached ? '#10B981' : color

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <svg width="74" height="158" viewBox="0 0 74 158" role="img" aria-label={`Termômetro de vendas: ${p.toFixed(0)}% da meta`}>
        <rect x="26" y={TUBE_TOP - 4} width="22" height={TUBE_H + 8} rx="11" fill="var(--surface-1, rgba(255,255,255,.05))" stroke="var(--border, #334155)" strokeWidth="1.5" />
        <rect x="31" y={fillY} width="12" height={fillH} rx="6" fill={fill}
          style={{ transition: 'y .9s ease, height .9s ease' }} />
        <circle cx="37" cy="138" r="18" fill="var(--surface-1, rgba(255,255,255,.05))" stroke="var(--border, #334155)" strokeWidth="1.5" />
        <circle cx="37" cy="138" r="12" fill={fill} />
        {[0, 25, 50, 75, 100].map((t) => {
          const y = TUBE_BOTTOM - (TUBE_H * t) / 100
          return (
            <g key={t}>
              <line x1="50" x2="56" y1={y} y2={y} stroke="var(--ink-4, #64748B)" strokeWidth="1" />
              <text x="60" y={y + 4} fontSize="9" fill="var(--ink-4, #64748B)">{t}%</text>
            </g>
          )
        })}
      </svg>
      <span style={{ fontSize: 15, fontWeight: 800, color: fill }}>{p.toFixed(0)}%</span>
      {reached && <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>🎉 batida</span>}
    </div>
  )
}
