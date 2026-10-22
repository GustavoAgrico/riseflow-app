import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, GRAD } from '../theme.js';

// Seletor de cor como o do Premiere: quadro de saturação/brilho, barra de matiz, campos
// H/S/B, R/G/B e hexadecimal, conta-gotas (pega a cor de qualquer lugar da tela) e OK/Cancelar.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const normHex = (v, d = '#FFFFFF') => {
  const s = String(v || '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toUpperCase()}` : /^[0-9a-f]{3}$/i.test(s) ? `#${s.split('').map((c) => c + c).join('').toUpperCase()}` : d;
};
const hexToRgb = (h) => { const s = normHex(h).slice(1); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const rgbToHex = (r, g, b) => `#${[r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(((h * 60) + 360) % 360), mx ? (d / mx) * 100 : 0, mx * 100];
}
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Conta-gotas do sistema (Chrome/Edge/app de PC). → '#RRGGBB' ou null. */
export async function pickFromScreen() {
  if (typeof window === 'undefined' || !window.EyeDropper) return null;
  try { return normHex((await new window.EyeDropper().open()).sRGBHex); } catch { return null; }
}
export const canPickFromScreen = () => typeof window !== 'undefined' && !!window.EyeDropper;

function drag(e, el, fn) {
  e.preventDefault();
  const at = (ev) => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); };
  at(e);
  const up = () => { window.removeEventListener('pointermove', at); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', at);
  window.addEventListener('pointerup', up);
}

/** Janela do seletor. `onChange` é chamado ao vivo; Cancelar volta a cor de antes. */
export function ColorPickerDialog({ value, onChange, onClose, title = 'Seletor de cor' }) {
  const start = useRef(normHex(value));
  const [hsv, setHsv] = useState(() => rgbToHsv(...hexToRgb(value)));
  const [hexText, setHexText] = useState(normHex(value).slice(1));
  const sq = useRef(null);
  const bar = useRef(null);
  const rgb = hsvToRgb(...hsv);
  const hex = rgbToHex(...rgb);
  useEffect(() => { setHexText(hex.slice(1)); onChange(hex); }, [hex]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRgb = (r, g, b) => setHsv(rgbToHsv(r, g, b));
  const num = { width: 50, height: 24, borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)', color: '#7DB6FF', fontSize: 12.5, fontFamily: 'inherit', padding: '0 6px' };
  const field = (label, val, max, on) => (
    <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
      <span style={{ width: 16 }}>{label}:</span>
      <input type="number" min={0} max={max} value={Math.round(val)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) on(clamp(n, 0, max)); }} style={num} />
    </label>
  );
  return createPortal(
    <div role="dialog" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) { onChange(start.current); onClose(); } }}
      style={{ position: 'fixed', inset: 0, zIndex: 980, background: 'rgba(5,5,10,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(560px, 100%)', background: '#1E1F25', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.9)', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <b style={{ fontSize: 14 }}>{title}</b>
          <button onClick={() => { onChange(start.current); onClose(); }} aria-label="Fechar" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.faint, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 14, padding: 16, flexWrap: 'wrap' }}>
          {/* saturação × brilho */}
          <div ref={sq} onPointerDown={(e) => drag(e, sq.current, (x, y) => setHsv(([h]) => [h, x * 100, (1 - y) * 100]))}
            style={{ position: 'relative', width: 240, height: 240, borderRadius: 4, cursor: 'crosshair', touchAction: 'none', background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv[0]}, 100%, 50%)` }}>
            <span style={{ position: 'absolute', left: `${hsv[1]}%`, top: `${100 - hsv[2]}%`, width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          </div>
          {/* matiz */}
          <div ref={bar} onPointerDown={(e) => drag(e, bar.current, (_, y) => setHsv(([, s, v]) => [Math.min(359, y * 360), s, v]))}
            style={{ position: 'relative', width: 22, height: 240, borderRadius: 3, cursor: 'ns-resize', touchAction: 'none', background: 'linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
            <span style={{ position: 'absolute', left: -4, right: -4, top: `${(hsv[0] / 360) * 100}%`, height: 4, marginTop: -2, background: '#fff', borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          </div>
          <div style={{ display: 'grid', gap: 8, alignContent: 'start', minWidth: 170 }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: 4, overflow: 'hidden', border: `1px solid ${C.border}`, width: 90 }}>
              <div title="Nova" style={{ flex: 1, height: 44, background: hex }} />
              <div title="Antes" onClick={() => setHsv(rgbToHsv(...hexToRgb(start.current)))} style={{ flex: 1, height: 44, background: start.current, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {field('H', hsv[0], 359, (n) => setHsv(([, s, v]) => [n, s, v]))}
              {field('R', rgb[0], 255, (n) => setRgb(n, rgb[1], rgb[2]))}
              {field('S', hsv[1], 100, (n) => setHsv(([h, , v]) => [h, n, v]))}
              {field('G', rgb[1], 255, (n) => setRgb(rgb[0], n, rgb[2]))}
              {field('B', hsv[2], 100, (n) => setHsv(([h, s]) => [h, s, n]))}
              {field('B', rgb[2], 255, (n) => setRgb(rgb[0], rgb[1], n))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
              #
              <input value={hexText} maxLength={7} onChange={(e) => { setHexText(e.target.value.replace('#', '')); const h = normHex(e.target.value, null); if (h) setRgb(...hexToRgb(h)); }}
                style={{ ...num, width: 90, color: C.text, textTransform: 'uppercase' }} />
              {canPickFromScreen() && (
                <button title="Conta-gotas: pegar uma cor da tela" onClick={async () => { const h = await pickFromScreen(); if (h) setRgb(...hexToRgb(h)); }}
                  style={{ height: 26, padding: '0 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: C.text, cursor: 'pointer' }}>
                  <EyeDropperIcon />
                </button>
              )}
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 16px 16px' }}>
          <button onClick={onClose} style={{ height: 34, padding: '0 22px', borderRadius: 999, border: 'none', background: GRAD, color: '#fff', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>OK</button>
          <button onClick={() => { onChange(start.current); onClose(); }} style={{ height: 34, padding: '0 18px', borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function EyeDropperIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.7 3.3a2.4 2.4 0 0 0-3.4 0l-2.6 2.6-1-1-1.4 1.4 1 1L5 15.6V19h3.4l8.3-8.3 1 1 1.4-1.4-1-1 2.6-2.6a2.4 2.4 0 0 0 0-3.4z" />
    </svg>
  );
}

/** Quadradinho da cor (abre o seletor) + conta-gotas, como no painel do Premiere. */
export default function ColorField({ value, onChange, title = 'Cor', size = 28 }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={() => setOpen(true)} title={`${title} — clique para escolher qualquer cor`} aria-label={title}
        style={{ width: size * 1.7, height: size, borderRadius: 5, border: '2px solid rgba(255,255,255,0.85)', background: normHex(value), cursor: 'pointer', padding: 0 }} />
      {canPickFromScreen() && (
        <button type="button" title="Conta-gotas: pegar uma cor da tela" onClick={async () => { const h = await pickFromScreen(); if (h) onChange(h); }}
          style={{ height: size, width: size, display: 'grid', placeItems: 'center', borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, cursor: 'pointer', padding: 0 }}>
          <EyeDropperIcon />
        </button>
      )}
      {open && <ColorPickerDialog value={value} title={title} onChange={onChange} onClose={() => setOpen(false)} />}
    </span>
  );
}
