import React from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon from '../components/Icon.jsx';

const SHORTCUTS = [
  { icon: 'wand', title: 'Edição automática', desc: 'Legendas, cortes, zoom e color grade de uma vez.' },
  { icon: 'captions', title: 'Editar pela transcrição', desc: 'Corte o vídeo apagando o texto da fala.' },
  { icon: 'film', title: 'Cortes curtos', desc: 'Gere vários clipes de um vídeo longo.' },
];

export default function Dashboard({ user, onNewVideo }) {
  const first = (user?.name || '').split(' ')[0] || 'você';
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '5%', width: 460, height: 460, borderRadius: '50%', background: C.purple, filter: 'blur(180px)', opacity: 0.14 }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{ color: C.orangeSoft, fontWeight: 600, fontSize: 14, margin: '0 0 6px' }}>Olá, {first} 👋</p>
        <h1 style={{ fontSize: 'clamp(28px,5vw,42px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1.2, margin: '0 0 10px' }}>
          O que vamos <span style={gradientText}>criar hoje?</span>
        </h1>
        <p style={{ color: C.muted, fontSize: 16, margin: '0 0 34px', maxWidth: 560 }}>
          Suba um vídeo e deixe a IA cuidar dos cortes, legendas, movimento e acabamento.
        </p>

        {/* CTA principal */}
        <button
          onClick={onNewVideo}
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', ...glass({ padding: 0 }), background: 'linear-gradient(135deg, rgba(255,107,53,0.16), rgba(124,58,237,0.16))', display: 'flex', alignItems: 'center', gap: 20, padding: '26px 28px', marginBottom: 28 }}
        >
          <div style={{ width: 60, height: 60, borderRadius: 16, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 12px 30px -8px rgba(255,107,53,0.55)' }}>
            <Icon name="upload" size={28} color="#fff" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, color: C.text }}>Novo vídeo</div>
            <div style={{ color: C.muted, fontSize: 14.5, marginTop: 3 }}>Arraste seu bruto e comece a editar agora</div>
          </div>
          <span style={{ fontSize: 26, color: C.orangeSoft, fontWeight: 700, lineHeight: 1 }}>→</span>
        </button>

        {/* Atalhos / recursos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {SHORTCUTS.map((s) => (
            <button
              key={s.title}
              onClick={onNewVideo}
              style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.border}`, ...glass({ padding: 22 }) }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(124,58,237,0.14)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Icon name={s.icon} size={20} color={C.purpleSoft} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text, marginBottom: 5 }}>{s.title}</div>
              <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
