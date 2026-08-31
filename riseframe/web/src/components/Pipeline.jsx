import React from 'react';
import { C, GRAD, glass, STAGE_ICONS } from '../theme.js';

const FLOW = [
  { key: 'probe', label: 'Sondagem' },
  { key: 'transcribe', label: 'Transcrição' },
  { key: 'cut', label: 'Cortes na timeline' },
  { key: 'analyze', label: 'Análise (IA)' },
  { key: 'broll', label: 'B-roll' },
  { key: 'captions', label: 'Legendas' },
  { key: 'color', label: 'Color grade' },
  { key: 'render', label: 'Render final' },
];

const ORDER = FLOW.map((s) => s.key);

export default function Pipeline({ job }) {
  const currentIdx = job?.stage === 'done' ? ORDER.length : ORDER.indexOf(job?.stage);
  const pct = job.progress ?? 0;

  return (
    <div style={{ ...glass(), padding: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{job.stageLabel || 'Processando'}</div>
        <div style={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums', ...gradText() }}>{pct}%</div>
      </div>

      <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 22 }}>
        <div
          style={{
            height: '100%',
            width: `${Math.max(3, pct)}%`,
            borderRadius: 8,
            background: GRAD,
            transition: 'width .35s cubic-bezier(.22,1,.36,1)',
            boxShadow: '0 0 14px rgba(255,107,53,0.5)',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FLOW.map((s, i) => {
          const done = i < currentIdx || job.stage === 'done';
          const active = i === currentIdx && job.stage !== 'done';
          return (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 10px',
                borderRadius: 10,
                background: active ? 'linear-gradient(90deg, rgba(255,107,53,0.1), transparent)' : 'transparent',
                transition: 'background .2s',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                  background: done ? C.green : active ? GRAD : 'rgba(255,255,255,0.06)',
                  color: done || active ? '#fff' : C.faint,
                  boxShadow: active
                    ? '0 0 0 4px rgba(255,107,53,0.16)'
                    : done
                      ? `0 0 10px ${C.green}66`
                      : 'none',
                  transition: 'all .2s',
                }}
              >
                {done ? '✓' : active ? STAGE_ICONS[s.key] : i + 1}
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: done || active ? C.text : C.faint,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {s.label}
              </span>
              {active && (
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.orangeSoft, fontWeight: 500 }}>
                  em andamento…
                </span>
              )}
              {done && <span style={{ marginLeft: 'auto', fontSize: 12, color: C.green }}>✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function gradText() {
  return {
    background: GRAD,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  };
}
