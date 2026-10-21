import React from 'react'
import { Link } from 'react-router-dom'
import { Target, Trophy, Package, CalendarClock } from 'lucide-react'
import { useGoalProgress } from '@hooks/useGoalProgress'
import { useAuth } from '@context/AuthContext'
import { brl } from '@lib/metrics'

const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const Stat = ({ label, value, color }) => (
  <div style={{ flex: '1 1 120px', minWidth: 0 }}>
    <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{label}</p>
    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: color || 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
  </div>
)

export function GoalPanel() {
  const { canAccess } = useAuth()
  const g = useGoalProgress()
  const monthName = MONTHS[new Date().getMonth()]
  const canEdit = canAccess?.('/goals') ?? true

  if (g.loading) return null

  if (!g.goal) {
    return (
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FF6B3518', display: 'grid', placeItems: 'center' }}><Target size={20} color="#FF6B35" /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Sem meta de vendas para {monthName}</p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-4)' }}>Defina uma meta para acompanhar quanto falta em tempo real.</p>
        </div>
        {canEdit && <Link to="/goals" style={{ padding: '8px 16px', borderRadius: 10, background: '#FF6B35', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Definir meta</Link>}
      </div>
    )
  }

  const pct = Math.min(100, g.pct)
  const barColor = g.reached ? '#10B981' : pct >= 70 ? '#F59E0B' : '#FF6B35'

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {g.reached ? <Trophy size={20} color="#10B981" /> : <Target size={20} color="#FF6B35" />}
        <h3 className="rf-section-title" style={{ margin: 0 }}>Meta de {monthName}</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#10B981', background: '#10B98118', padding: '3px 9px', borderRadius: 999 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} /> ao vivo
        </span>
        {canEdit && <Link to="/goals" style={{ marginLeft: 'auto', fontSize: 12, color: '#FF6B35', textDecoration: 'none', fontWeight: 600 }}>Editar meta →</Link>}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat label="Meta" value={brl(g.target)} />
        <Stat label="Vendido" value={brl(g.sold)} color="#10B981" />
        <Stat label={g.reached ? 'Superou em' : 'Falta'} value={brl(g.reached ? g.sold - g.target : g.remaining)} color={g.reached ? '#10B981' : '#FF6B35'} />
        <Stat label="Atingido" value={`${g.pct.toFixed(1)}%`} color={barColor} />
      </div>

      <div style={{ height: 14, borderRadius: 999, background: 'var(--surface-1, rgba(255,255,255,.06))', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`, transition: 'width .8s ease' }} />
      </div>

      {g.reached ? (
        <p style={{ margin: '14px 0 0', fontSize: 14, fontWeight: 700, color: '#10B981' }}>🎉 Parabéns, meta batida! Vamos para a próxima.</p>
      ) : (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <CalendarClock size={14} />
          {g.daysLeft} {g.daysLeft === 1 ? 'dia restante' : 'dias restantes'} — vender <b style={{ color: 'var(--ink-1)' }}>{brl(g.perDay)}/dia</b> para bater a meta
          <span style={{ color: 'var(--ink-4)' }}>· {g.wonDeals.length} {g.wonDeals.length === 1 ? 'venda' : 'vendas'} no mês</span>
        </p>
      )}

      {!g.reached && g.productsNeeded.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={13} /> O que falta, em produtos
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {g.productsNeeded.map(p => (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-4)' }}>{brl(p.price)} cada</p>
                <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: '#FF6B35' }}>{p.units}× <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>para bater</span></p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
