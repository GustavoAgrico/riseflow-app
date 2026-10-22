import React, { useEffect, useRef, useState } from 'react';

/**
 * Réguas e guias do monitor (como no Premiere: View › Mostrar réguas / Mostrar guias).
 * Arraste da régua de cima para criar uma guia horizontal e da régua da esquerda para uma
 * vertical; arraste a linha para mover e para fora do quadro para apagar; clique duplo
 * pede a posição exata. Posições guardadas em fração do quadro (0–1), mostradas em pixels
 * do vídeo final (frameW × frameH).
 */
export const GUIDE_LINE = '#22D3EE';
const RULER = 16;

/** Modelos de guia prontos (Premiere › Guide Templates). p = fração do quadro. */
export const GUIDE_TEMPLATES = [
  { id: 'safe', label: 'Área segura (ação 90% · título 80%)', lines: [
    { o: 'h', p: 0.05 }, { o: 'h', p: 0.95 }, { o: 'v', p: 0.05 }, { o: 'v', p: 0.95 },
    { o: 'h', p: 0.1 }, { o: 'h', p: 0.9 }, { o: 'v', p: 0.1 }, { o: 'v', p: 0.9 },
  ] },
  { id: 'thirds', label: 'Regra dos terços', lines: [{ o: 'h', p: 1 / 3 }, { o: 'h', p: 2 / 3 }, { o: 'v', p: 1 / 3 }, { o: 'v', p: 2 / 3 }] },
  { id: 'center', label: 'Centro', lines: [{ o: 'h', p: 0.5 }, { o: 'v', p: 0.5 }] },
  { id: 'reels', label: 'Área segura Reels / TikTok (9:16)', lines: [{ o: 'h', p: 0.14 }, { o: 'h', p: 0.8 }, { o: 'v', p: 0.06 }, { o: 'v', p: 0.84 }] },
  { id: 'shorts', label: 'Área segura YouTube Shorts (9:16)', lines: [{ o: 'h', p: 0.12 }, { o: 'h', p: 0.78 }, { o: 'v', p: 0.06 }, { o: 'v', p: 0.82 }] },
];

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const withIds = (lines) => lines.map((l) => ({ id: l.id || newId(), o: l.o === 'v' ? 'v' : 'h', p: +Math.max(0, Math.min(1, Number(l.p) || 0)).toFixed(4) }));

function ticks(sizePx, framePx) {
  // passo "redondo" em pixels do vídeo, com uns 60 px de tela entre números
  const per = framePx / Math.max(1, sizePx);
  const raw = per * 60;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => s >= raw) || 1000;
  const out = [];
  for (let v = 0; v <= framePx + 0.5; v += step) out.push(v);
  return { step, out, per };
}

export default function MonitorGuides({ box, frameW, frameH, cfg, onLines }) {
  const [drag, setDrag] = useState(null); // { id, o, p, fresh }
  const ref = useRef(null);
  const cb = useRef({ onLines, cfg, box });
  cb.current = { onLines, cfg, box };
  useEffect(() => {
    if (!drag) return undefined;
    function pos(e) {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return null;
      return drag.o === 'h' ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    }
    function move(e) {
      const p = pos(e);
      if (p != null) setDrag((d) => (d ? { ...d, p } : d));
    }
    function up(e) {
      const p = pos(e);
      const { onLines: set, cfg: c } = cb.current;
      const lines = c.lines || [];
      const out = p == null || p < -0.01 || p > 1.01; // soltou fora do quadro: apaga
      const rest = lines.filter((l) => l.id !== drag.id);
      set(out ? rest : [...rest, { id: drag.id, o: drag.o, p: +Math.max(0, Math.min(1, p)).toFixed(4) }]);
      setDrag(null);
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag?.id]);
  if (!box || !box.w || !box.h) return null;
  const start = (e, line) => {
    if (cfg.lock) return;
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setDrag(line);
  };
  const askPos = (l) => {
    if (cfg.lock) return;
    const full = l.o === 'h' ? frameH : frameW;
    const v = window.prompt(`Posição da guia ${l.o === 'h' ? 'horizontal (Y)' : 'vertical (X)'} em pixels (0–${full}):`, String(Math.round(l.p * full)));
    if (v == null) return;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) return;
    onLines((cfg.lines || []).map((x) => (x.id === l.id ? { ...x, p: +Math.max(0, Math.min(1, n / full)).toFixed(4) } : x)));
  };
  const lines = (cfg.lines || []).filter((l) => !drag || l.id !== drag.id);
  const shown = cfg.show ? [...lines, ...(drag ? [drag] : [])] : drag ? [drag] : [];
  const hx = ticks(box.w, frameW);
  const vy = ticks(box.h, frameH);
  const rulerBg = 'rgba(12,12,18,0.82)';
  return (
    <div ref={ref} aria-hidden="true" style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none', zIndex: 25 }}>
      {shown.map((l) => {
        const isH = l.o === 'h';
        const pct = `${Math.max(0, Math.min(1, l.p)) * 100}%`;
        const active = drag && drag.id === l.id;
        const px = Math.round(Math.max(0, Math.min(1, l.p)) * (isH ? frameH : frameW));
        return (
          <div key={l.id} onPointerDown={(e) => start(e, { ...l })} onDoubleClick={() => askPos(l)}
            title={cfg.lock ? undefined : `Guia ${isH ? 'horizontal' : 'vertical'} em ${px} px — arraste para mover, para fora do quadro para apagar · clique duplo: posição exata`}
            style={{ position: 'absolute', pointerEvents: cfg.lock ? 'none' : 'auto', cursor: isH ? 'row-resize' : 'col-resize',
              ...(isH ? { left: 0, right: 0, top: pct, height: 9, marginTop: -4 } : { top: 0, bottom: 0, left: pct, width: 9, marginLeft: -4 }) }}>
            <div style={{ position: 'absolute', background: GUIDE_LINE, opacity: active ? 1 : 0.85, boxShadow: active ? `0 0 6px ${GUIDE_LINE}` : 'none',
              ...(isH ? { left: 0, right: 0, top: 4, height: 1 } : { top: 0, bottom: 0, left: 4, width: 1 }) }} />
            {active && (
              <span style={{ position: 'absolute', ...(isH ? { left: RULER + 4, top: -14 } : { top: RULER + 4, left: 8 }), fontSize: 10, fontWeight: 700, color: '#001018', background: GUIDE_LINE, borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}>{px} px</span>
            )}
          </div>
        );
      })}
      {cfg.rulers && (
        <>
          {/* régua de cima: arraste para baixo = guia horizontal */}
          <div onPointerDown={(e) => start(e, { id: newId(), o: 'h', p: 0, fresh: true })} title={cfg.lock ? 'Guias travadas' : 'Arraste para baixo para criar uma guia horizontal'}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: RULER, background: rulerBg, borderBottom: '1px solid rgba(255,255,255,0.18)', pointerEvents: 'auto', cursor: cfg.lock ? 'default' : 's-resize', overflow: 'hidden' }}>
            {hx.out.map((v) => (
              <div key={v} style={{ position: 'absolute', left: v / hx.per, top: 0, bottom: 0 }}>
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 6, background: 'rgba(255,255,255,0.55)' }} />
                <span style={{ position: 'absolute', left: 3, top: 1, fontSize: 8.5, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
          {/* régua da esquerda: arraste para a direita = guia vertical */}
          <div onPointerDown={(e) => start(e, { id: newId(), o: 'v', p: 0, fresh: true })} title={cfg.lock ? 'Guias travadas' : 'Arraste para a direita para criar uma guia vertical'}
            style={{ position: 'absolute', left: 0, top: RULER, bottom: 0, width: RULER, background: rulerBg, borderRight: '1px solid rgba(255,255,255,0.18)', pointerEvents: 'auto', cursor: cfg.lock ? 'default' : 'e-resize', overflow: 'hidden' }}>
            {vy.out.map((v) => (
              <div key={v} style={{ position: 'absolute', top: v / vy.per - RULER, left: 0, right: 0 }}>
                <div style={{ position: 'absolute', right: 0, top: 0, height: 1, width: 6, background: 'rgba(255,255,255,0.55)' }} />
                <span style={{ position: 'absolute', left: 1, top: 2, fontSize: 8.5, color: 'rgba(255,255,255,0.7)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
