import React, { useEffect, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import Icon from './Icon.jsx';
import { apiAsset } from '../api.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * Vitrine do topo do site: uma edição REAL tocando sozinha assim que a página abre —
 * o vídeo bruto (ANTES) atrás e o resultado do Riseframe (DEPOIS) na frente, com o que
 * foi aplicado. Toque no DEPOIS para ouvir.
 */
export default function HeroDemo({ showcase, onMore }) {
  const before = useRef(null);
  const after = useRef(null);
  const [sound, setSound] = useState(false);
  const [failed, setFailed] = useState(false);
  const st = showcase?.stats || {};
  const feats = (st.features || []).slice(0, 6);

  // Autoplay mudo (permitido pelos navegadores); reinicia se o navegador pausar.
  useEffect(() => {
    for (const v of [before.current, after.current]) v?.play?.().catch(() => {});
  }, [showcase?.after]);

  if (!showcase?.after || failed) return null;

  const toggleSound = () => {
    const v = after.current;
    if (!v) return;
    v.muted = sound;
    if (!sound) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setSound(!sound);
  };

  return (
    <div className="rf-herodemo" style={{ position: 'relative', width: '100%', maxWidth: 470, margin: '0 auto' }}>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', paddingLeft: '18%' }}>
        {/* ANTES — atrás, menor, sem cor */}
        <div style={{ position: 'absolute', left: 0, bottom: '6%', width: '44%', transform: 'rotate(-5deg)', zIndex: 1 }}>
          <div style={{ borderRadius: 20, padding: 6, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px -28px rgba(0,0,0,0.9)' }}>
            <div style={{ position: 'relative', borderRadius: 15, overflow: 'hidden', aspectRatio: '9/16', background: '#000' }}>
              <video ref={before} src={apiAsset(showcase.before)} muted loop autoPlay playsInline preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.75) brightness(0.92)' }} />
              <span style={pill(false)}>ANTES</span>
              {st.beforeSeconds > 0 && <span style={stamp}>{mmss(st.beforeSeconds)} · bruto</span>}
            </div>
          </div>
        </div>
        {/* DEPOIS — na frente, com brilho */}
        <div style={{ position: 'relative', width: '64%', zIndex: 2 }}>
          <div style={{ position: 'absolute', inset: '-12%', background: 'radial-gradient(closest-side, rgba(255,107,53,0.35), rgba(124,58,237,0.22) 55%, transparent 75%)', filter: 'blur(18px)', zIndex: -1 }} />
          <div onClick={toggleSound} style={{ borderRadius: 26, padding: 7, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 40px 90px -30px rgba(255,107,53,0.55)', cursor: 'pointer' }}>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', aspectRatio: '9/16', background: '#000' }}>
              <video ref={after} src={apiAsset(showcase.after)} muted={!sound} loop autoPlay playsInline preload="auto" onError={() => setFailed(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={pill(true)}>DEPOIS</span>
              <span style={{ position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '4px 9px', backdropFilter: 'blur(6px)' }}>
                <Icon name={sound ? 'volume' : 'mute'} size={12} strokeWidth={2.2} /> {sound ? 'Som ligado' : 'Toque p/ ouvir'}
              </span>
              {st.afterSeconds > 0 && <span style={stamp}>{mmss(st.afterSeconds)} · pronto pra postar</span>}
            </div>
          </div>
        </div>
      </div>
      {feats.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 18 }}>
          {feats.map((f) => (
            <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: C.text, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 10px' }}>
              <Icon name="check" size={12} color={C.green} strokeWidth={2.8} /> {f}
            </span>
          ))}
        </div>
      )}
      {onMore && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={onMore} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ver lado a lado e ligar/desligar cada ajuste ↓
          </button>
        </div>
      )}
    </div>
  );
}

const pill = (after) => ({
  position: 'absolute', top: 10, left: 10, fontSize: after ? 10.5 : 9.5, fontWeight: 800, letterSpacing: 0.8, color: '#fff',
  background: after ? GRAD : 'rgba(0,0,0,0.6)', borderRadius: 999, padding: after ? '4px 10px' : '3px 8px',
});
const stamp = {
  position: 'absolute', left: 8, right: 8, bottom: 8, textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff',
  background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '4px 6px', backdropFilter: 'blur(6px)',
};
