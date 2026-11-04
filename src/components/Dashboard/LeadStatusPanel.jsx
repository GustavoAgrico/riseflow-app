import React, { useEffect, useState } from 'react'
import { Users, UserPlus, CalendarDays, Wallet } from 'lucide-react'
import { useLeadStats } from '@hooks/useLeadStats'
import { brl } from '@lib/metrics'

const card = {
  background: 'linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.01)), var(--card)',
  border: '1px solid var(--border)', borderRadius: 16, padding: 20,
  boxShadow: '0 1px 0 rgba(255,255,255,.03) inset, 0 16px 40px -28px rgba(0,0,0,.6)',
}
const num = { fontVariantNumeric: 'tabular-nums' }

function secondsAgo(ts, now) {
  if (!ts) return '—'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s}s`
  return `há ${Math.round(s / 60)} min`
}

const Kpi = ({ icon: Icon, label, value, hint, color }) => (
  <div style={{ flex: '1 1 130px', minWidth: 0, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-1, rgba(255,255,255,.03))', border: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
      <Icon size={13} color={color} /> {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-1)', marginTop: 4, ...num }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{hint}</div>}
  </div>
)

export function LeadStatusPanel() {
  const s = useLeadStats()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const total = s.total
  const pct = (n) => (total ? (n / total) * 100 : 0)

  return (
    <div style={card}>
      <style>{'@keyframes rfLivePulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.55)}70%{box-shadow:0 0 0 8px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}'}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Users size={20} color="#7C3AED" />
        <h3 className="rf-section-title" style={{ margin: 0 }}>Leads por status</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#10B981', background: '#10B98118', padding: '3px 9px', borderRadius: 999 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'rfLivePulse 1.8s infinite' }} /> ao vivo
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)' }}>atualizado {secondsAgo(s.updatedAt, now)}</span>
      </div>

      {s.loading ? (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', margin: 0 }}>Carregando leads…</p>
      ) : total === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', margin: 0 }}>Nenhum lead cadastrado ainda. Os leads aparecem aqui assim que entrarem.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi icon={Users} label="Total" value={total.toLocaleString('pt-BR')} hint="leads na base" color="#7C3AED" />
            <Kpi icon={UserPlus} label="Novos hoje" value={s.newToday} hint="últimas 24h" color="#10B981" />
            <Kpi icon={CalendarDays} label="Novos 7 dias" value={s.newWeek} hint="última semana" color="#3B82F6" />
            <Kpi icon={Wallet} label="Em aberto" value={brl(s.pipeline)} hint="valor no funil" color="#FF6B35" />
          </div>

          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-1, rgba(255,255,255,.05))', marginBottom: 14 }}>
            {s.byStage.filter(st => st.count > 0).map(st => (
              <div key={st.key} title={`${st.label}: ${st.count}`} style={{ width: `${pct(st.count)}%`, background: st.color, transition: 'width .6s ease' }} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {s.byStage.map(st => (
              <div key={st.key} style={{ borderRadius: 12, padding: '12px 14px', background: 'var(--surface-1, rgba(255,255,255,.03))', border: '1px solid var(--border)', borderTop: `3px solid ${st.color}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-1)', ...num }}>{st.count}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)', ...num }}>{pct(st.count).toFixed(0)}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, ...num }}>{brl(st.value)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
