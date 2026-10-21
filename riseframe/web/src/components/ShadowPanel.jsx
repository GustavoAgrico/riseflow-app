import React, { useRef } from 'react';
import { C } from '../theme.js';
import { SHADOW_BLENDS, shadowParams } from '../../../shared/captionShadow.js';

// Sombra projetada da legenda, como o painel do Photoshop: modo de mesclagem + cor,
// opacidade, ângulo (disco arrastável), distância, expansão e tamanho.

/** Disco do ângulo: a linha aponta de onde vem a luz (0° = direita, 90° = em cima). */
function AngleDial({ value, onChange }) {
  const ref = useRef(null);
  const set = (e) => {
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    onChange(Math.round((Math.atan2(-dy, dx) * 180) / Math.PI));
  };
  const down = (e) => {
    e.preventDefault();
    set(e);
    const move = (ev) => set(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const a = (value * Math.PI) / 180;
  return (
    <svg ref={ref} width="46" height="46" viewBox="0 0 46 46" onPointerDown={down} style={{ cursor: 'grab', flexShrink: 0, touchAction: 'none' }} role="slider" aria-label="Ângulo da luz" aria-valuenow={value}>
      <circle cx="23" cy="23" r="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <line x1="23" y1="23" x2={23 + Math.cos(a) * 18} y2={23 - Math.sin(a) * 18} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="23" cy="23" r="2" fill="#fff" />
    </svg>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '108px minmax(0, 1fr)', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: C.muted, textAlign: 'right' }}>{label}:</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  );
}

const numBox = { width: 54, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12.5, fontFamily: 'inherit', padding: '0 6px', textAlign: 'right' };

function SliderNum({ value, min, max, step = 1, unit, onChange }) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n))); }} style={numBox} />
      <span style={{ fontSize: 12, color: C.faint, width: 18 }}>{unit}</span>
    </>
  );
}

/** `cap` = campos da legenda (captionShadow*); `onPatch(patch)` grava. */
export default function ShadowPanel({ cap, onPatch }) {
  const p = shadowParams(cap);
  const put = (patch) => onPatch({
    captionShadowBlend: p.blend, captionShadowColor: p.color, captionShadowOpacity: p.opacity, captionShadowAngle: p.angle,
    captionShadowDistance: p.distance, captionShadowSpread: p.spread, captionShadowBlur: p.size, ...patch,
  });
  return (
    <div style={{ display: 'grid', gap: 9, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.025)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>Sombra projetada</div>
      <Row label="Modo de mesclagem">
        <select value={p.blend} onChange={(e) => put({ captionShadowBlend: e.target.value })}
          style={{ flex: 1, minWidth: 0, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 12.5, fontFamily: 'inherit', padding: '0 6px' }}>
          {SHADOW_BLENDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input type="color" value={`#${p.color}`} onChange={(e) => put({ captionShadowColor: e.target.value.replace('#', '').toUpperCase() })} title="Cor da sombra"
          style={{ width: 40, height: 28, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: 'none', cursor: 'pointer' }} />
      </Row>
      <Row label="Opacidade"><SliderNum value={Math.round(p.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => put({ captionShadowOpacity: v / 100 })} /></Row>
      <Row label="Ângulo">
        <AngleDial value={p.angle} onChange={(v) => put({ captionShadowAngle: v })} />
        <input type="number" min={-180} max={360} value={p.angle} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) put({ captionShadowAngle: Math.max(-360, Math.min(360, n)) }); }} style={numBox} />
        <span style={{ fontSize: 12, color: C.faint }}>°</span>
      </Row>
      <Row label="Distância"><SliderNum value={p.distance} min={0} max={100} unit="px" onChange={(v) => put({ captionShadowDistance: v })} /></Row>
      <Row label="Expansão"><SliderNum value={p.spread} min={0} max={100} unit="%" onChange={(v) => put({ captionShadowSpread: v })} /></Row>
      <Row label="Tamanho"><SliderNum value={p.size} min={0} max={100} unit="px" onChange={(v) => put({ captionShadowBlur: v })} /></Row>
      <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.45 }}>Medidas em px de um vídeo de 1080 px de altura (em outros tamanhos a sombra acompanha). O ângulo é de onde vem a luz.</div>
    </div>
  );
}
