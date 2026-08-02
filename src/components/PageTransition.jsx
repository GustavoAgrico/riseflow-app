import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Phase flow: hidden → in (logo enters + rings expand) → out (logo scales up + fades) → hidden
export const PageTransition = () => {
  const location = useLocation()
  const [phase, setPhase] = useState('hidden')
  const isFirst = useRef(true)
  const timers = useRef([])

  useEffect(() => {
    // Skip the very first render (initial page load has its own auth spinner)
    if (isFirst.current) { isFirst.current = false; return }

    timers.current.forEach(clearTimeout)
    setPhase('in')
    timers.current = [
      setTimeout(() => setPhase('out'),    400),
      setTimeout(() => setPhase('hidden'), 700),
    ]
    return () => timers.current.forEach(clearTimeout)
  }, [location.pathname])

  if (phase === 'hidden') return null
  const entering = phase === 'in'

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6, 9, 20, 0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: entering
          ? 'rf-veil-in 90ms ease forwards'
          : 'rf-veil-out 280ms ease forwards',
        pointerEvents: 'none',
      }}
    >
      {/* Outer pulse ring */}
      <div style={{
        position: 'absolute',
        width: 160, height: 160, borderRadius: '50%',
        border: '1px solid rgba(255, 107, 53, 0.35)',
        animation: entering ? 'rf-ring 620ms ease-out forwards' : 'none',
        opacity: 0,
      }} />

      {/* Inner pulse ring */}
      <div style={{
        position: 'absolute',
        width: 118, height: 118, borderRadius: '50%',
        border: '1.5px solid rgba(255, 107, 53, 0.22)',
        animation: entering ? 'rf-ring 480ms 40ms ease-out forwards' : 'none',
        opacity: 0,
      }} />

      {/* RF Logo */}
      <div style={{
        position: 'relative',
        width: 72, height: 72, borderRadius: 20,
        background: 'linear-gradient(138deg, #FF6B35 0%, #D94F1A 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 27, fontWeight: 900, color: '#fff',
        letterSpacing: '-1.5px',
        fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
        boxShadow: [
          '0 0 0 1px rgba(255,255,255,0.10) inset',
          '0 0 30px rgba(255,107,53,0.60)',
          '0 0 70px rgba(255,107,53,0.22)',
          '0 4px 24px rgba(0,0,0,0.5)',
        ].join(', '),
        overflow: 'hidden',
        animation: entering
          ? 'rf-logo-in 280ms cubic-bezier(.22, 1, .36, 1) forwards'
          : 'rf-logo-out 250ms cubic-bezier(.4, 0, 1, 1) forwards',
      }}>
        RF

        {/* Shimmer sweep — only on entry */}
        {entering && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.28) 50%, transparent 75%)',
            animation: 'rf-shimmer 480ms 90ms ease forwards',
          }} />
        )}

        {/* Top-left highlight */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)',
          borderRadius: '20px 20px 0 0',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}
