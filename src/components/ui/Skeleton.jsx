import React from 'react'

export const Skeleton = ({ width, height = 16, radius = 'var(--r-md)', style, className = '' }) => (
  <div
    className={`rf-skeleton ${className}`}
    style={{ width: width ?? '100%', height, borderRadius: radius, ...style }}
    aria-hidden="true"
  />
)

export const SkeletonKPI = ({ count = 4 }) => (
  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ flex: 1, minWidth: 140, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
        <Skeleton width={28} height={28} radius={8} />
        <Skeleton width="60%" height={10} style={{ marginTop: 12 }} />
        <Skeleton width="40%" height={22} style={{ marginTop: 8 }} />
      </div>
    ))}
  </div>
)

export const SkeletonTable = ({ rows = 4, cols = 5 }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
    <Skeleton width="30%" height={14} style={{ marginBottom: 16 }} />
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: r ? '1px solid var(--border)' : 'none' }}>
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} width={c === 0 ? '25%' : '15%'} height={12} />
        ))}
      </div>
    ))}
  </div>
)

export const SkeletonCards = ({ count = 3 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <Skeleton width={38} height={38} radius="50%" />
          <div style={{ flex: 1 }}>
            <Skeleton width="70%" height={12} />
            <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
          </div>
        </div>
        <Skeleton height={8} style={{ marginBottom: 6 }} />
        <Skeleton width="80%" height={8} />
      </div>
    ))}
  </div>
)
