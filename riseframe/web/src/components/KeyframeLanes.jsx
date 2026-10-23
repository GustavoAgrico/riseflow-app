import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../theme.js';
import { LAYER_KF_PROPS, KF_INTERPS, kfInterpOf, withInterp } from '../../../shared/layerKeys.js';

const LABEL = { pos: 'Posição', scale: 'Escala', rot: 'Rotação', opacity: 'Opacidade' };
/** Linhas das propriedades de uma camada (Propriedades/Controle de efeitos). */
export const layerRows = (layer, onTrack) => LAYER_KF_PROPS.map((p) => ({ id: p, label: LABEL[p], keys: layer.kf?.[p] || [], onChange: (list) => onTrack(p, list) }));
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;

/** Desenho do quadro conforme a interpolação (como no Premiere: losango, ampulheta, quadrado). */
function KeyIcon({ interp, on }) {
  const fill = on ? '#FACC15' : '#D1D5DB';
  const st = { stroke: '#111', strokeWidth: 1 };
  if (interp === 'hold') return <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1.5" y="1.5" width="8" height="8" fill={fill} {...st} /></svg>;
  if (interp === 'bezier') return <svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4.3" fill={fill} {...st} /></svg>;
  if (interp === 'easeIn') return <svg width="11" height="11" viewBox="0 0 11 11"><path d="M5.5 1 L10 5.5 L5.5 10 A4.5 4.5 0 0 1 5.5 1 Z" fill={fill} {...st} /></svg>;
  if (interp === 'easeOut') return <svg width="11" height="11" viewBox="0 0 11 11"><path d="M5.5 1 A4.5 4.5 0 0 1 5.5 10 L1 5.5 Z" fill={fill} {...st} /></svg>;
  return <svg width="11" height="11" viewBox="0 0 11 11"><path d="M5.5 1 L10 5.5 L5.5 10 L1 5.5 Z" fill={fill} {...st} /></svg>;
}

/**
 * Quadros-chave da camada numa mini-timeline (o lado direito do Controle de efeitos do
 * Premiere): uma linha por propriedade, com o playhead. Arraste o ◆ para mudar o tempo,
 * clique para ir até ele e use o botão direito para a interpolação (Linear, Bezier, Ease
 * In/Out, Manter) ou para apagar.
 */
export default function KeyframeLanes({ start = 0, duration, rows, cur, onSeek }) {
  const stripRef = useRef(null);
  const [sel, setSel] = useState(null); // { prop, t }
  const [menu, setMenu] = useState(null); // { x, y, prop, t }
  const drag = useRef(null);
  const dur = Math.max(0.2, Number(duration) || 1);
  const cb = useRef({ start, dur, rows, onSeek });
  cb.current = { start, dur, rows, onSeek };
  const kf = Object.fromEntries(rows.map((r) => [r.id, r.keys || []]));
  const rowOf = (id) => rows.find((r) => r.id === id);
  const rel = Math.max(0, Math.min(dur, cur - start));

  useEffect(() => {
    function move(e) {
      const d = drag.current;
      const el = stripRef.current;
      if (!d || !el) return;
      if (Math.abs(e.clientX - d.x0) > 3) d.moved = true;
      if (!d.moved) return;
      const r = el.getBoundingClientRect();
      const t = +Math.max(0, Math.min(cb.current.dur, ((e.clientX - r.left) / r.width) * cb.current.dur)).toFixed(3);
      const row = cb.current.rows.find((x) => x.id === d.prop);
      const tr = row?.keys || [];
      // não deixa dois quadros no mesmo ponto: para um pouco antes do vizinho
      if (tr.some((k, i) => i !== d.i && Math.abs(k.t - t) < 0.04)) return;
      const next = tr.map((k, i) => (i === d.i ? { ...k, t } : k));
      const moved = next[d.i];
      next.sort((a, b) => a.t - b.t);
      d.i = next.indexOf(moved);
      setSel({ prop: d.prop, t });
      row.onChange(next);
    }
    function up() {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) cb.current.onSeek(cb.current.start + d.t);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const setInterp = (prop, t, id) => rowOf(prop)?.onChange((kf[prop] || []).map((k) => (Math.abs(k.t - t) < 0.001 ? withInterp(k, id) : k)));
  const removeKey = (prop, t) => rowOf(prop)?.onChange((kf[prop] || []).filter((k) => Math.abs(k.t - t) >= 0.001));
  const ticks = [];
  const step = dur > 20 ? 5 : dur > 8 ? 2 : dur > 3 ? 1 : 0.5;
  for (let s = 0; s <= dur + 1e-6; s += step) ticks.push(+s.toFixed(2));
  const rowH = 22;
  const playhead = <div aria-hidden="true" style={{ position: 'absolute', left: `${(rel / dur) * 100}%`, top: 0, bottom: 0, width: 1.5, marginLeft: -0.75, background: '#3B82F6', pointerEvents: 'none', zIndex: 1 }} />;
  const keyOf = menu ? (kf[menu.prop] || []).find((k) => Math.abs(k.t - menu.t) < 0.001) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', gap: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
      <div style={{ height: 18, borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.faint, padding: '2px 6px', whiteSpace: 'nowrap' }}>Quadros</div>
      <div onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(start + ((e.clientX - r.left) / r.width) * dur); }}
        style={{ position: 'relative', height: 18, borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }} title="Clique para ir a este ponto">
        {ticks.map((s) => (
          <span key={s} style={{ position: 'absolute', left: `${(s / dur) * 100}%`, top: 2, fontSize: 9, color: C.faint, transform: s ? 'translateX(-50%)' : 'none', whiteSpace: 'nowrap' }}>{fmtT(s)}</span>
        ))}
        {playhead}
      </div>
      {rows.map(({ id: p, label }, ri) => (
        <React.Fragment key={p}>
          <div style={{ height: rowH, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 11, color: kf[p]?.length ? C.text : C.faint, borderBottom: `1px solid rgba(255,255,255,0.04)`, whiteSpace: 'nowrap', overflow: 'hidden' }}>{label}</div>
          <div ref={ri === 0 ? stripRef : undefined}
            onPointerDown={(e) => { if (e.target !== e.currentTarget) return; const r = e.currentTarget.getBoundingClientRect(); onSeek(start + ((e.clientX - r.left) / r.width) * dur); }}
            style={{ position: 'relative', height: rowH, borderBottom: `1px solid rgba(255,255,255,0.04)`, cursor: 'pointer' }}>
            {playhead}
            {(kf[p] || []).length > 1 && (
              <div style={{ position: 'absolute', top: rowH / 2, height: 1, left: `${(kf[p][0].t / dur) * 100}%`, width: `${((kf[p][kf[p].length - 1].t - kf[p][0].t) / dur) * 100}%`, background: 'rgba(250,204,21,0.35)', pointerEvents: 'none' }} />
            )}
            {(kf[p] || []).map((k, i) => {
              const on = sel && sel.prop === p && Math.abs(sel.t - k.t) < 0.001;
              const interp = kfInterpOf(k);
              return (
                <button key={`${i}-${k.t}`} type="button"
                  onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); setSel({ prop: p, t: k.t }); drag.current = { prop: p, i, t: k.t, x0: e.clientX, moved: false }; }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel({ prop: p, t: k.t }); setMenu({ x: e.clientX, y: e.clientY, prop: p, t: k.t }); }}
                  title={`${label} em ${fmtT(k.t)} · ${KF_INTERPS[interp]} — arraste para mudar o tempo · botão direito: interpolação`}
                  aria-label={`Quadro-chave de ${label} em ${fmtT(k.t)}`}
                  style={{ position: 'absolute', left: `${(k.t / dur) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 16, height: 16, padding: 0, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'ew-resize', zIndex: 2 }}>
                  <KeyIcon interp={interp} on={on} />
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      {menu && keyOf && createPortal(
        <>
          <div onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 960 }} />
          <div role="menu" style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 260), zIndex: 961, width: 230, padding: 5, borderRadius: 9, background: '#1E1E26', border: `1px solid ${C.border}`, boxShadow: '0 16px 40px -10px rgba(0,0,0,0.9)', color: C.text, fontSize: 12.5 }}>
            <div style={{ padding: '4px 8px', fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.3 }}>INTERPOLAÇÃO TEMPORAL</div>
            {Object.entries(KF_INTERPS).map(([id, label]) => (
              <button key={id} role="menuitemradio" aria-checked={kfInterpOf(keyOf) === id} onClick={() => { setInterp(menu.prop, menu.t, id); setMenu(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 'none', borderRadius: 6, background: 'transparent', color: C.text, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ width: 12, color: '#7DB6FF', fontWeight: 800 }}>{kfInterpOf(keyOf) === id ? '✓' : ''}</span><KeyIcon interp={id} /> {label}
              </button>
            ))}
            <div style={{ height: 1, background: C.border, margin: '4px 2px' }} />
            <button onClick={() => { onSeek(start + menu.t); setMenu(null); }} style={{ display: 'block', width: '100%', padding: '6px 8px 6px 28px', border: 'none', borderRadius: 6, background: 'transparent', color: C.text, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>Ir até o quadro</button>
            <button onClick={() => { removeKey(menu.prop, menu.t); setMenu(null); setSel(null); }} style={{ display: 'block', width: '100%', padding: '6px 8px 6px 28px', border: 'none', borderRadius: 6, background: 'transparent', color: C.red, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>Apagar o quadro</button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
