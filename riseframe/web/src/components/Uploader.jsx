import React, { useRef, useState } from 'react';
import { C, GRAD, fmtBytes } from '../theme.js';
import Icon from './Icon.jsx';

const FORMATS = ['MP4', 'MOV', 'MKV', 'WEBM', 'AVI'];

export default function Uploader({ file, onFile, disabled }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);

  function pick(f) {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name)) {
      alert('Envie um arquivo de vídeo (mp4, mov, mkv, webm, avi).');
      return;
    }
    onFile(f);
  }

  const active = drag || hover;

  // Estado com arquivo selecionado: cartão premium (não mais o drop-zone tracejado).
  if (file) {
    return (
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 15, cursor: disabled ? 'not-allowed' : 'pointer',
          border: `1px solid ${hover ? 'rgba(255,107,53,0.4)' : C.border}`, borderRadius: 18, padding: 18,
          background: 'linear-gradient(180deg, rgba(255,107,53,0.06), rgba(255,255,255,0.015))',
          transition: 'border-color .18s', overflow: 'hidden',
        }}
      >
        <input ref={inputRef} type="file" accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
        <div style={{ width: 54, height: 54, borderRadius: 14, display: 'grid', placeItems: 'center', background: GRAD, boxShadow: '0 10px 26px -10px rgba(255,107,53,0.6)', color: '#fff', flexShrink: 0 }}>
          <Icon name="film" size={24} strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.green }}>
              <Icon name="check" size={13} strokeWidth={2.6} /> pronto
            </span>
            · {fmtBytes(file.size)}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 13, fontWeight: 600, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 20, padding: '8px 14px' }}>
          <Icon name="upload" size={14} strokeWidth={2} /> Trocar
        </span>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) pick(e.dataTransfer.files?.[0]); }}
      onClick={() => !disabled && inputRef.current?.click()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        border: `1.5px dashed ${drag ? C.orange : active ? C.borderStrong || C.border : C.border}`,
        background: drag
          ? 'linear-gradient(180deg, rgba(255,107,53,0.12), rgba(124,58,237,0.07))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
        borderRadius: 20,
        padding: '46px 24px 30px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .18s ease',
        transform: active && !disabled ? 'translateY(-2px)' : 'none',
        boxShadow: active ? '0 16px 40px -16px rgba(255,107,53,0.45)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* halo de fundo ao arrastar/hover */}
      {active && <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', width: 260, height: 160, background: 'radial-gradient(circle, rgba(255,107,53,0.22), transparent 65%)', pointerEvents: 'none' }} />}
      <input ref={inputRef} type="file" accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />

      <div style={{ position: 'relative', width: 66, height: 66, margin: '0 auto 16px' }}>
        {active && <div style={{ position: 'absolute', inset: -6, borderRadius: 20, background: C.orange, filter: 'blur(16px)', opacity: 0.5 }} />}
        <div
          style={{
            position: 'relative', width: 66, height: 66, borderRadius: 18, display: 'grid', placeItems: 'center',
            background: active ? GRAD : C.panel2, boxShadow: active ? '0 12px 30px -8px rgba(255,107,53,0.6)' : 'none',
            transition: 'all .2s ease', color: active ? '#fff' : C.muted,
          }}
        >
          <Icon name="upload" size={28} strokeWidth={1.8} />
        </div>
      </div>

      <div style={{ position: 'relative', fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>
        {drag ? 'Solte o vídeo aqui' : 'Arraste um vídeo ou clique para enviar'}
      </div>
      <div style={{ position: 'relative', color: C.muted, fontSize: 13.5, marginTop: 6 }}>
        Processamos tudo na nuvem — você recebe o vídeo pronto para publicar
      </div>

      <div style={{ position: 'relative', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        {FORMATS.map((f) => (
          <span key={f} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: C.faint, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 7, padding: '3px 8px' }}>{f}</span>
        ))}
      </div>
    </div>
  );
}
