import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Singleton fetch interceptor — tracks pending HTTP requests globally
let _intercepted = false
let _pending = 0
const _subs = new Set()

function _notify() { _subs.forEach(fn => fn(_pending)) }

if (!_intercepted && typeof window !== 'undefined') {
  _intercepted = true
  const _origFetch = window.fetch
  window.fetch = async function (...args) {
    _pending++
    _notify()
    try { return await _origFetch.apply(this, args) }
    finally { _pending = Math.max(0, _pending - 1); _notify() }
  }
}

// Only show overlay if requests are still pending after this many ms
const THRESHOLD_MS = 300

export const PageTransition = () => {
  const location = useLocation()
  const [phase, setPhase] = useState('hidden')
  const isFirst = useRef(true)
  const timers = useRef([])

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }

    timers.current.forEach(clearTimeout)

    // Called when pending count reaches 0 while overlay is active
    const onDone = (count) => {
      if (count === 0) {
        _subs.delete(onDone)
        setPhase('out')
        timers.current = [setTimeout(() => setPhase('hidden'), 300)]
      }
    }

    // After threshold: only show if there are still pending requests
    const thresholdTimer = setTimeout(() => {
      if (_pending > 0) {
        setPhase('in')
        _subs.add(onDone)
      }
    }, THRESHOLD_MS)

    timers.current = [thresholdTimer]

    return () => {
      timers.current.forEach(clearTimeout)
      _subs.delete(onDone)
    }
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

        {entering && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.28) 50%, transparent 75%)',
            animation: 'rf-shimmer 480ms 90ms ease forwards',
          }} />
        )}

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
