// Gráficos do pipeline (CRM e Painel ao vivo): funil de alcance, rosca por etapa, área de entradas,
// saúde e feed ao vivo. SVG próprio + motion.css (entram crescendo/desenhando).
import React, { useEffect, useState } from 'react'
import { ArrowDown, Clock3, DollarSign, PhoneOff, Sparkles, TrendingUp, Trophy, XCircle, ArrowRight } from 'lucide-react'
import { CountUp } from '@components/motion'

const F = "'DM Sans', system-ui, sans-serif"
const MUT = 'var(--ink-3)'

export function Panel({ title, icon: Icon, accent = '#7C3AED', right, children, style }) {
  return (
    <div className="rf-lift" style={{ position: 'relative', overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, fontFamily: F, color: 'var(--ink-1)', minWidth: 0, ...style }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 100% 0%, ${accent}1f, transparent 60%)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        {Icon && <Icon size={14} color={accent} />}
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>{title}</span>
        <span style={{ marginLeft: 'auto' }}>{right}</span>
      </div>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )
}

// Funil de alcance: barras centralizadas que afinam; entre elas, a conversão de uma etapa para a outra.
export function FunnelBars({ steps, compact = false }) {
  const max = Math.max(1, ...steps.map(s => s.reached))
  const h = compact ? 18 : 24
  return (
    <div style={{ display: 'grid', gap: compact ? 3 : 4 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, fontSize: 10, color: MUT, height: compact ? 12 : 14 }}>
              <ArrowDown size={10} /> {s.conv == null ? '' : `${String(s.conv).replace('.', ',')}%`}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '74px 1fr 34px' : '92px 1fr 40px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: compact ? 11 : 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <span className="rf-bar-c" style={{
                '--i': i, display: 'block', height: h, borderRadius: 8,
                width: `${Math.max(s.reached ? 6 : 2, (s.reached / max) * 100)}%`,
                background: `linear-gradient(90deg, ${s.color}aa, ${s.color})`,
                boxShadow: s.reached ? `0 0 16px ${s.color}55, inset 0 1px 0 rgba(255,255,255,.25)` : 'none',
                opacity: s.reached ? 1 : 0.35,
              }} />
            </span>
            <span style={{ fontSize: compact ? 12 : 13, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><CountUp value={s.reached} /></span>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

// Rosca de distribuição por etapa. Arcos crescem ao montar.
export function Donut({ data, size = 132, thickness = 16, center, sub }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  let acc = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Distribuição: ${data.map(d => `${d.label} ${d.value}`).join(', ')}`} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {total > 0 && data.filter(d => d.value > 0).map((d) => {
          const len = (d.value / total) * c
          const gap = data.filter(x => x.value > 0).length > 1 ? Math.min(3, len * 0.2) : 0
          const el = (
            <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeLinecap="butt"
              strokeDasharray={`${on ? Math.max(0, len - gap) : 0} ${c}`} strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 4px ${d.color}66)` }}>
              <title>{`${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`}</title>
            </circle>
          )
          acc += len
          return el
        })}
        <text x="50%" y="47%" dominantBaseline="central" textAnchor="middle" fill="var(--ink-1)" fontSize={size / 6} fontWeight="800" fontFamily={F}>{center ?? total}</text>
        {sub && <text x="50%" y="64%" dominantBaseline="central" textAnchor="middle" fill="var(--ink-3)" fontSize={size / 13} fontFamily={F}>{sub}</text>}
      </svg>
      <div style={{ display: 'grid', gap: 4, minWidth: 110, flex: 1 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: d.color, boxShadow: `0 0 6px ${d.color}88`, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: d.value ? 'var(--ink-1)' : MUT }}>{d.label}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value}</b>
            <span style={{ color: MUT, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{total ? `${Math.round((d.value / total) * 100)}%` : '–'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Área com linha que se desenha; último ponto pulsa. points: [{ label, count }].
export function AreaTrend({ points, color = '#FF6B35', height = 92, id = 'trend' }) {
  const W = 300
  const max = Math.max(1, ...points.map(p => p.count))
  const step = points.length > 1 ? W / (points.length - 1) : W
  const xy = points.map((p, i) => [i * step, height - 8 - (p.count / max) * (height - 20)])
  const line = xy.map(([x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = xy[i - 1]
    const cx = (px + x) / 2
    return `C${cx},${py} ${cx},${y} ${x},${y}`
  }).join(' ')
  const area = `${line} L${W},${height} L0,${height} Z`
  const last = xy[xy.length - 1] || [0, height]
  const total = points.reduce((a, p) => a + p.count, 0)
  const gid = `rf-grad-${id}`
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`${total} entradas no período`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.45" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} className="rf-fade-late" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" pathLength="1" className="rf-draw" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 6px ${color}99)` }} />
        {points.map((p, i) => (
          <rect key={p.label} x={xy[i][0] - step / 2} y="0" width={step} height={height} fill="transparent"><title>{`${p.label}: ${p.count}`}</title></rect>
        ))}
      </svg>
      <div style={{ position: 'relative', height: 0 }}>
        <span className="rf-live-dot" style={{ position: 'absolute', left: `calc(${(last[0] / W) * 100}% - 5px)`, top: -height + last[1] - 5, width: 10, height: 10, borderRadius: '50%', background: color, '--c': color }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUT, marginTop: 4 }}>
        <span>{points[0]?.label}</span><span>hoje</span>
      </div>
    </div>
  )
}

export function Sparkline({ values, color = '#FF6B35', width = 84, height = 26 }) {
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : width
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${i * step},${height - 3 - (v / max) * (height - 6)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="rf-draw" style={{ filter: `drop-shadow(0 0 4px ${color}aa)` }} />
    </svg>
  )
}

// Saúde do funil com o que fazer em cada problema.
export function HealthList({ health, onAction }) {
  const items = [
    { key: 'stale', Icon: Clock3, color: '#EF4444', n: health.stale, label: 'parados há 7+ dias', tip: 'Retome o contato ou mova para Perdido.' },
    { key: 'noValue', Icon: DollarSign, color: '#EAB308', n: health.noValue, label: 'sem valor', tip: 'Sem valor não há previsão de receita.' },
    { key: 'noPhone', Icon: PhoneOff, color: '#94A3B8', n: health.noPhone, label: 'sem telefone', tip: 'Não dá para chamar no WhatsApp.' },
  ]
  const ok = items.every(i => !i.n)
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {ok && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#22C55E' }}><Sparkles size={14} /> Funil saudável — nada parado.</div>}
      {items.filter(i => i.n).map(i => (
        <button key={i.key} type="button" onClick={() => onAction?.(i.key)} title={i.tip} className="rf-press"
          style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', padding: '7px 9px', borderRadius: 10, border: `1px solid ${i.color}44`, background: i.color + '10', color: 'var(--ink-1)', cursor: onAction ? 'pointer' : 'default', fontFamily: F }}>
          <i.Icon size={14} color={i.color} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}><CountUp value={i.n} /></b> <span style={{ fontSize: 12 }}>{i.label}</span>
            <span style={{ display: 'block', fontSize: 10.5, color: MUT }}>{i.tip}</span>
          </span>
          {onAction && <ArrowRight size={13} color={MUT} />}
        </button>
      ))}
    </div>
  )
}

const FEED_ICON = { new: Sparkles, move: TrendingUp, won: Trophy, lost: XCircle }
export function LiveFeed({ events, empty = 'As movimentações aparecem aqui em tempo real.' }) {
  if (!events.length) return <p style={{ margin: 0, fontSize: 12, color: MUT }}>{empty}</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
      {events.map(e => {
        const Icon = FEED_ICON[e.kind] || TrendingUp
        return (
          <li key={e.id + e.at} className="rf-feed-in" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 10, background: e.color + '12', border: `1px solid ${e.color}33` }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: e.color + '26', flexShrink: 0 }}><Icon size={13} color={e.color} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || 'Sem nome'}</b>
              <span style={{ color: MUT }}>{e.text}</span>
            </span>
            <span style={{ fontSize: 10.5, color: MUT, flexShrink: 0 }}>{new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </li>
        )
      })}
    </ul>
  )
}

// Ilustração de coluna vazia (flutua devagar).
export function EmptyColumn({ color, label = 'Arraste um card para cá' }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 8, padding: '18px 8px', borderRadius: 12, border: '1px dashed var(--border)', color: MUT, fontSize: 11.5, textAlign: 'center' }}>
      <svg width="54" height="40" viewBox="0 0 54 40" aria-hidden="true" className="rf-float">
        <rect x="6" y="8" width="42" height="26" rx="7" fill={color + '22'} stroke={color + '88'} strokeDasharray="4 3" />
        <rect x="13" y="15" width="18" height="4" rx="2" fill={color + 'aa'} />
        <rect x="13" y="23" width="26" height="3" rx="1.5" fill={color + '55'} />
        <circle cx="44" cy="10" r="5" fill={color} opacity=".85" />
      </svg>
      {label}
    </div>
  )
}

