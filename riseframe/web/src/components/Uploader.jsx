import React, { useRef, useState } from 'react';
import { C, fmtBytes } from '../theme.js';

export default function Uploader({ file, onFile, disabled }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  function pick(f) {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name)) {
      alert('Envie um arquivo de vídeo (mp4, mov, mkv, webm, avi).');
      return;
    }
    onFile(f);
  }

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
      style={{
        border: `2px dashed ${drag ? C.orange : C.border}`,
        background: drag ? 'rgba(255,107,53,0.06)' : C.panel,
        borderRadius: 16,
        padding: '38px 24px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .15s ease',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v"
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div style={{ fontSize: 40, marginBottom: 8 }}>{file ? '🎬' : '⬆️'}</div>
      {file ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{file.name}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            {fmtBytes(file.size)} · clique para trocar
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            Arraste um vídeo ou clique para enviar
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            MP4, MOV, MKV, WEBM, AVI
          </div>
        </div>
      )}
    </div>
  );
}
