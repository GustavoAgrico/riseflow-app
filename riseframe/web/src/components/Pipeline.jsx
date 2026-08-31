import React from 'react';
import { C, STAGE_ICONS } from '../theme.js';

const FLOW = [
  { key: 'probe', label: 'Sondagem' },
  { key: 'transcribe', label: 'Transcrição' },
  { key: 'analyze', label: 'Análise (IA)' },
  { key: 'silence', label: 'Corte de silêncios' },
  { key: 'broll', label: 'B-roll' },
  { key: 'captions', label: 'Legendas' },
  { key: 'color', label: 'Color grade' },
  { key: 'render', label: 'Render final' },
];

const ORDER = FLOW.map((s) => s.key);

export default function Pipeline({ job }) {
  const currentIdx = job?.stage === 'done' ? ORDER.length : ORDER.indexOf(job?.stage);

  return (
    <div style={{ background: C.panel, borderRadius: 16, padding: 22, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{job.stageLabel || 'Processando'}</div>
        <div style={{ color: C.orange, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {job.progress ?? 0}%
        </div>
      </div>

      <div style={{ height: 8, background: C.panel2, borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{
          height: '100%', width: `${job.progress ?? 0}%`,
          background: `linear-gradient(90deg, ${C.orange}, ${C.purple})`, transition: 'width .3s ease',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FLOW.map((s, i) => {
          const done = i < currentIdx || job.stage === 'done';
          const active = i === currentIdx && job.stage !== 'done';
          return (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8,
              background: active ? 'rgba(255,107,53,0.08)' : 'transparent',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13,
                background: done ? C.green : active ? C.orange : C.panel2,
                color: done || active ? '#fff' : C.faint,
              }}>
                {done ? '✓' : active ? STAGE_ICONS[s.key] : i + 1}
              </span>
              <span style={{
                fontSize: 14, color: done ? C.text : active ? C.text : C.faint,
                fontWeight: active ? 600 : 400,
              }}>
                {s.label}
              </span>
              {active && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: C.orange }}>em andamento…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
