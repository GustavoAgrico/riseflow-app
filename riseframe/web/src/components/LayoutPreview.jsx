import React from 'react';
import { C, GRAD } from '../theme.js';

// Silhueta simples de pessoa (cabeça + ombros) para a metade "Você".
function Person({ small }) {
  const s = small ? 0.7 : 1;
  return (
    <svg width={40 * s} height={40 * s} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="13" r="7" fill="rgba(255,255,255,0.9)" />
      <path d="M6 38c0-8 6.5-13 14-13s14 5 14 13" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}

// Ícone de mídia (foto/vídeo) para a metade "Apoio".
function Media() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="4" y="7" width="32" height="26" rx="4" fill="rgba(255,255,255,0.92)" />
      <circle cx="14" cy="16" r="3" fill="#FF6B35" />
      <path d="M8 30l7-8 5 5 6-7 6 10H8z" fill="#7C3AED" />
    </svg>
  );
}

function Half({ kind, height, crop }) {
  const isPerson = kind === 'person';
  // No lado da pessoa, o conteúdo se posiciona conforme o recorte escolhido.
  const justify = !isPerson ? 'center' : crop === 'center' ? 'center' : crop === 'bottom' ? 'flex-end' : 'flex-start';
  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: justify,
        gap: 5,
        padding: isPerson ? '10px 0' : 0,
        boxSizing: 'border-box',
        background: isPerson ? 'linear-gradient(160deg,#1c2c50,#101a30)' : GRAD,
      }}
    >
      {isPerson ? <Person small={height < 90} /> : <Media />}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', letterSpacing: 0.2, textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
        {isPerson ? 'Você' : 'Apoio'}
      </div>
    </div>
  );
}

/**
 * Prévia visual do layout do B-roll (tela cheia / apoio em cima / apoio embaixo).
 * Mostra um quadro 9:16 dividido conforme a escolha, atualizando ao vivo.
 */
export default function LayoutPreview({ layout = 'fullscreen', personCrop = 'top' }) {
  const H = 170;
  const W = Math.round((H * 9) / 16); // ~96, mantém proporção vertical
  const half = H / 2;

  let body;
  if (layout === 'top') {
    body = (<><Half kind="broll" height={half} /><Half kind="person" height={half} crop={personCrop} /></>);
  } else if (layout === 'bottom') {
    body = (<><Half kind="person" height={half} crop={personCrop} /><Half kind="broll" height={half} /></>);
  } else {
    // Tela cheia: o apoio cobre o quadro inteiro durante o momento.
    body = <Half kind="broll" height={H} />;
  }

  const desc =
    layout === 'top' ? 'Apoio em cima · você embaixo'
      : layout === 'bottom' ? 'Você em cima · apoio embaixo'
        : 'Apoio ocupa a tela inteira';

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>PRÉVIA DO LAYOUT</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: W, height: H, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, flexShrink: 0, boxShadow: '0 8px 22px -12px rgba(0,0,0,0.6)' }}>
          {body}
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          {desc}
          <div style={{ color: C.faint, fontSize: 11.5, marginTop: 4 }}>
            Sem vídeo para o momento, entra uma imagem no mesmo contexto.
          </div>
        </div>
      </div>
    </div>
  );
}
