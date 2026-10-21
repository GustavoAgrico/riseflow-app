import React, { useEffect, useRef, useState } from 'react'
import { useGoalProgress } from '@hooks/useGoalProgress'
import { playAirHorn } from '@lib/airhorn'
import { brl } from '@lib/metrics'

const COLORS = ['#FF6B35', '#7C3AED', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#FDE047']
const seenKey = (goal) => `rf_goal_celebrated:${goal.id}:${goal.target}`

function Confetti() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const g = canvas.getContext('2d')
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const pieces = Array.from({ length: 260 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      vy: 2 + Math.random() * 4,
      vx: -2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))
    let raf
    const tick = () => {
      g.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of pieces) {
        p.y += p.vy; p.x += p.vx + Math.sin(p.y / 40); p.rot += p.vr
        if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot)
        g.fillStyle = p.color; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        g.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
}

export function GoalCelebration() {
  const { goal, reached, sold, target } = useGoalProgress()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!reached || !goal) return
    try {
      if (localStorage.getItem(seenKey(goal))) return
      localStorage.setItem(seenKey(goal), new Date().toISOString())
    } catch { /* sem storage: comemora mesmo assim */ }
    setShow(true)
    playAirHorn()
  }, [reached, goal])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 12_000)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null
  return (
    <div role="alertdialog" aria-label="Meta batida" onClick={() => setShow(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,8,16,0.82)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 16 }}>
      <Confetti />
      <style>{`@keyframes rfGoalPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
        @keyframes rfGoalPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}`}</style>
      <div style={{ position: 'relative', textAlign: 'center', maxWidth: 560, animation: 'rfGoalPop .6s ease-out' }}>
        <div style={{ fontSize: 72, lineHeight: 1, animation: 'rfGoalPulse 1s ease-in-out infinite' }}>🎉🏆🎉</div>
        <h1 style={{ margin: '18px 0 6px', fontSize: 'clamp(30px, 7vw, 54px)', fontWeight: 900, color: '#fff', letterSpacing: '-.02em', lineHeight: 1.05 }}>
          PARABÉNS!<br />META BATIDA!
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 'clamp(18px, 4vw, 26px)', fontWeight: 800, background: 'linear-gradient(90deg,#FF6B35,#F59E0B,#7C3AED)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Vamos para a próxima! 🚀
        </p>
        <p style={{ margin: '18px 0 0', fontSize: 16, color: '#E5E7EB' }}>
          {brl(sold)} vendidos de {brl(target)} de meta
        </p>
        <button onClick={() => setShow(false)}
          style={{ marginTop: 24, padding: '12px 28px', borderRadius: 999, border: 'none', background: '#FF6B35', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
          Bora! 💪
        </button>
      </div>
    </div>
  )
}
