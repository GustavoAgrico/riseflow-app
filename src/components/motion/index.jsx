// Componentes de movimento do RiseFlow (estilos em src/styles/motion.css).
//   <CountUp value="R$ 1.250,00" />  — número conta até o valor (aceita texto já formatado em pt-BR)
//   <RevealText text="Cobranças" />  — título entra letra por letra
//   <Segmented options value onChange /> — seletor com pílula que desliza
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Primeiro número de um texto pt-BR: "R$ 1.234,50" → 1234.5 (2 casas); "50%" → 50.
const NUM_RE = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/
export function parseLocaleNumber(text) {
  const m = String(text ?? '').match(NUM_RE)
  if (!m) return null
  const raw = m[0]
  const decimals = raw.includes(',') ? raw.split(',')[1].length : 0
  const grouped = /\.\d{3}/.test(raw)
  return { value: Number(raw.replace(/\./g, '').replace(',', '.')), decimals, grouped, index: m.index, length: raw.length }
}
export function formatLike(parsed, n) {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: parsed.decimals, maximumFractionDigits: parsed.decimals,
    useGrouping: parsed.grouped || Math.abs(n) >= 10000,
  })
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3)

export function CountUp({ value, duration = 900, format }) {
  const isText = typeof value === 'string'
  const parsed = isText ? parseLocaleNumber(value) : { value: Number(value) || 0, decimals: 0, grouped: true }
  const target = parsed?.value ?? 0
  const from = useRef(0)
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0))

  useEffect(() => {
    if (!parsed) return
    if (prefersReducedMotion()) { setShown(target); from.current = target; return }
    const start = from.current
    if (start === target) { setShown(target); return }
    let raf
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const v = start + (target - start) * easeOut(p)
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!parsed) return <>{value}</>
  const n = parsed.decimals ? shown : Math.round(shown)
  if (!isText) return <span aria-label={format ? format(target) : String(target)}>{format ? format(n) : formatLike(parsed, n)}</span>
  const text = value.slice(0, parsed.index) + formatLike(parsed, n) + value.slice(parsed.index + parsed.length)
  // Leitor de tela lê o valor final, não os intermediários.
  return <span aria-label={value}><span aria-hidden="true">{text}</span></span>
}

export function RevealText({ text, className = '' }) {
  const chars = Array.from(String(text ?? ''))
  return (
    <span className={`rf-reveal ${className}`} aria-label={text}>
      {chars.map((ch, i) => (
        <span key={i} className="rf-ch" aria-hidden="true" style={{ '--i': i }}>{ch}</span>
      ))}
    </span>
  )
}

// options: [[id, label]] ou [{ id, label }]. A pílula acompanha o botão ativo.
export function Segmented({ options, value, onChange, accent = '#7C3AED', size = 'md', label, style }) {
  const wrap = useRef(null)
  const [pill, setPill] = useState(null)
  const opts = options.map(o => (Array.isArray(o) ? { id: o[0], label: o[1] } : o))

  useLayoutEffect(() => {
    const measure = () => {
      const key = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(value)) : String(value)
      const el = wrap.current?.querySelector(`[data-seg="${key}"]`)
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !wrap.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [value, options.length])

  const pad = size === 'sm' ? '4px 10px' : '6px 12px'
  const fs = size === 'sm' ? 12 : 12.5
  return (
    <div ref={wrap} role="group" aria-label={label} className="rf-segmented"
      style={{ gap: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, maxWidth: '100%', overflowX: 'auto', ...style }}>
      {pill && <span className="rf-segmented__pill" style={{ width: pill.w, transform: `translateX(${pill.x}px)`, background: accent, boxShadow: `0 4px 14px ${accent}55` }} />}
      {opts.map(o => {
        const on = o.id === value
        return (
          <button key={o.id} data-seg={o.id} aria-pressed={on} onClick={() => onChange(o.id)}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 7, padding: pad, fontSize: fs, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', background: !pill && on ? accent : 'transparent', color: on ? '#fff' : 'var(--ink-3)' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
