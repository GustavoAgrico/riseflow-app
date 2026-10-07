import React, { useRef, useState } from 'react';
import { C, GRAD, FONT_DISPLAY } from '../theme.js';
import Icon from './Icon.jsx';
import { apiAsset } from '../api.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function Phone({ label, tone, children }) {
  return (
    <div style={{ flex: '1 1 0', maxWidth: 340, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, padding: '5px 12px', borderRadius: 999, color: tone === 'after' ? '#fff' : C.muted, background: tone === 'after' ? GRAD : 'rgba(255,255,255,0.06)', border: tone === 'after' ? 'none' : `1px solid ${C.border}` }}>
          {label}
        </span>
      </div>
      <div style={{ position: 'relative', borderRadius: 26, padding: 8, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', boxShadow: tone === 'after' ? '0 30px 70px -30px rgba(255,107,53,0.55)' : '0 30px 70px -30px rgba(0,0,0,0.8)' }}>
        <div style={{ position: 'relative', borderRadius: 19, overflow: 'hidden', background: '#000', aspectRatio: '9/16' }}>{children}</div>
      </div>
    </div>
  );
}

/** Demonstração real: o bruto e o resultado tocando lado a lado. */
function RealDemo({ showcase, onFail }) {
  const before = useRef(null);
  const after = useRef(null);
  const [sound, setSound] = useState(null); // 'before' | 'after' | null
  const st = showcase.stats;

  function listen(which) {
    const next = sound === which ? null : which;
    setSound(next);
    for (const [k, ref] of [['before', before], ['after', after]]) {
      const v = ref.current;
      if (!v) continue;
      v.muted = next !== k;
      if (next === k) { v.currentTime = 0; v.play().catch(() => {}); }
    }
  }

  const video = (ref, src, which) => (
    <>
      <video ref={ref} src={apiAsset(src)} autoPlay muted loop playsInline preload="metadata" onError={onFail}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
      <button onClick={() => listen(which)} aria-label={sound === which ? 'Silenciar' : 'Ouvir'}
        style={{ position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Icon name={sound === which ? 'volume' : 'mute'} size={14} color="#fff" /> {sound === which ? 'Som ligado' : 'Ouvir'}
      </button>
    </>
  );

  return (
    <>
      <div className="rf-ba" style={{ display: 'flex', gap: 22, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Phone label="ANTES" tone="before">{video(before, showcase.before, 'before')}</Phone>
        <div className="rf-ba-arrow" style={{ alignSelf: 'center', color: C.orange, fontSize: 30, fontWeight: 800 }}>→</div>
        <Phone label="DEPOIS" tone="after">{video(after, showcase.after, 'after')}</Phone>
      </div>
      {st && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 }}>
          {st.beforeSeconds > 0 && st.afterSeconds > 0 && (
            <span style={chip}>{mmss(st.beforeSeconds)} → <b style={{ color: C.text }}>{mmss(st.afterSeconds)}</b></span>
          )}
          {st.removedSeconds > 0 && <span style={chip}>{st.removedSeconds}s de pausas cortadas</span>}
          {(st.features || []).filter((f) => f !== 'pausas cortadas').map((f) => <span key={f} style={chip}>{f}</span>)}
        </div>
      )}
      <p style={{ textAlign: 'center', color: C.faint, fontSize: 12.5, margin: '14px 0 0' }}>Vídeo real editado no Riseframe, sem ajustes manuais depois.</p>
    </>
  );
}

const chip = { fontSize: 13, color: C.muted, padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' };

/** Enquanto não há vídeo de demonstração: ilustração (identificada) do que muda. */
function Illustration() {
  const words = ['3', 'erros', 'que', 'travam', 'seu', 'conteúdo'];
  return (
    <>
      <div className="rf-ba" style={{ display: 'flex', gap: 22, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Phone label="ANTES" tone="before">
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(170deg,#5d5a55,#3c3a37)', filter: 'saturate(0.6) contrast(0.9)' }} />
          <Person dim />
          <Timeline gaps />
          <Badge text="1:12 · com pausas, sem legenda" />
        </Phone>
        <div className="rf-ba-arrow" style={{ alignSelf: 'center', color: C.orange, fontSize: 30, fontWeight: 800 }}>→</div>
        <Phone label="DEPOIS" tone="after">
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(170deg,#3d5a80,#1b2a41)' }} />
          <Person />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: '24%', textAlign: 'center', padding: '0 14px', fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 21, color: '#fff', textShadow: '0 2px 0 #000, 0 0 6px rgba(0,0,0,.8)' }}>
            {words.join(' ')}
          </div>
          <Timeline />
          <Badge text="0:48 · cortado, legendado, cor corrigida" />
        </Phone>
      </div>
      <p style={{ textAlign: 'center', color: C.faint, fontSize: 12.5, margin: '16px 0 0' }}>Ilustração. O vídeo de demonstração real aparece aqui em breve.</p>
    </>
  );
}

function Person({ dim }) {
  return (
    <div style={{ position: 'absolute', bottom: '34%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', opacity: dim ? 0.55 : 0.9 }}>
      <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,214,186,0.55)', margin: '0 auto' }} />
      <div style={{ width: 132, height: 70, borderRadius: '66px 66px 0 0', background: 'rgba(255,255,255,0.18)', marginTop: 8 }} />
    </div>
  );
}

function Timeline({ gaps }) {
  const parts = gaps ? [0.16, 0.1, 0.22, 0.12, 0.18, 0.08, 0.14] : [0.3, 0.42, 0.28];
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 44, display: 'flex', gap: 4 }}>
      {parts.map((w, i) => (
        <div key={i} style={{ flex: w, height: 14, borderRadius: 4, background: gaps && i % 2 ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 4px, transparent 4px 8px)' : gaps ? 'rgba(255,255,255,.22)' : GRAD }} />
      ))}
    </div>
  );
}

function Badge({ text }) {
  return (
    <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '5px 6px' }}>{text}</div>
  );
}

export default function BeforeAfter({ showcase }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      {showcase && !failed ? <RealDemo showcase={showcase} onFail={() => setFailed(true)} /> : <Illustration />}
      <style>{`@media (max-width: 640px){ .rf-ba{ gap: 10px !important; } .rf-ba .rf-ba-arrow{ display: none; } }`}</style>
    </>
  );
}
