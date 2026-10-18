import React from 'react';
import { C, FONT_DISPLAY, gradientText } from '../theme.js';
import { RenderQueueList } from '../components/RenderQueue.jsx';

/** Aba "Renderizando": todos os vídeos da conta em processamento, na fila ou pausados. */
export default function Rendering({ onLibrary }) {
  return (
    <div className="rf-page" style={{ maxWidth: 980, margin: '0 auto', width: '100%', padding: '36px 32px 90px' }}>
      <h1 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.8, margin: '0 0 6px' }}>
        Vídeos <span style={gradientText}>renderizando</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 14.5, margin: '0 0 24px', lineHeight: 1.55 }}>
        Acompanhe, pause ou cancele cada vídeo. O servidor faz um vídeo por vez, na ordem da fila; ao cancelar, os créditos voltam.
        Os prontos ficam em <button onClick={onLibrary} style={{ background: 'none', border: 'none', padding: 0, color: C.orangeSoft, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Meus projetos</button>.
      </p>
      <RenderQueueList hours={12} />
    </div>
  );
}
