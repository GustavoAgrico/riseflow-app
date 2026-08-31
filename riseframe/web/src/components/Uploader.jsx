import React, { useRef, useState } from 'react';
import { C, GRAD, fmtBytes } from '../theme.js';

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
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled) pick(e.dataTransfer.files?.[0]);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        border: `1.5px dashed ${drag ? C.orange : active ? C.borderStrong : C.border}`,
        background: drag
          ? 'linear-gradient(180deg, rgba(255,107,53,0.1), rgba(124,58,237,0.06))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        borderRadius: 18,
        padding: '44px 24px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .18s ease',
        transform: active && !disabled ? 'translateY(-1px)' : 'none',
        boxShadow: active ? '0 12px 34px -14px rgba(255,107,53,0.4)' : 'none',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v"
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div
        style={{
          width: 60,
          height: 60,
          margin: '0 auto 14px',
          borderRadius: 16,
          display: 'grid',
          placeItems: 'center',
          fontSize: 27,
          background: file || active ? GRAD : C.panel2,
          boxShadow: file || active ? '0 10px 26px -8px rgba(255,107,53,0.55)' : 'none',
          transition: 'all .2s ease',
        }}
      >
        {file ? '🎬' : '⬆️'}
      </div>
      {file ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{file.name}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>
            {fmtBytes(file.size)} · clique para trocar
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: -0.2 }}>
            Arraste um vídeo ou clique para enviar
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>MP4 · MOV · MKV · WEBM · AVI</div>
        </div>
      )}
    </div>
  );
}
