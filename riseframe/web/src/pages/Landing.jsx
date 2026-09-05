import React from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon, { Logo } from '../components/Icon.jsx';

function MeshBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 520, height: 520, borderRadius: '50%', background: C.orange, filter: 'blur(160px)', opacity: 0.18 }} />
      <div style={{ position: 'absolute', top: '10%', right: '-12%', width: 560, height: 560, borderRadius: '50%', background: C.purple, filter: 'blur(170px)', opacity: 0.2 }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '25%', width: 480, height: 480, borderRadius: '50%', background: C.purpleSoft, filter: 'blur(160px)', opacity: 0.12 }} />
    </div>
  );
}

function GhostBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.orange; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderStrong; }}
    >
      {children}
    </button>
  );
}

function GradBtn({ children, onClick, big }) {
  return (
    <button
      onClick={onClick}
      style={{ background: GRAD, border: 'none', color: '#fff', borderRadius: 13, padding: big ? '15px 30px' : '11px 22px', fontSize: big ? 16 : 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 30px -8px rgba(255,107,53,0.5)', transition: 'transform .15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      {children}
    </button>
  );
}

const FEATURES = [
  { icon: 'captions', title: 'Legendas dinâmicas', desc: 'Legendas palavra a palavra, sincronizadas com a fala real, em vários estilos e cores.' },
  { icon: 'scissors', title: 'Corte de silêncio', desc: 'Remove pausas e trechos mortos automaticamente e remonta a timeline sozinho.' },
  { icon: 'mic', title: 'Correção da fala', desc: 'Corta muletas ("é...", "hã"), hesitações e gagueiras — o vídeo fica limpo e direto.' },
  { icon: 'film', title: 'Movimento e zoom', desc: 'Efeito de câmera (punch-in, Ken Burns) que dá energia e retém a atenção.' },
  { icon: 'palette', title: 'Color grade por IA', desc: 'Analisa a imagem e aplica correção + look cinematográfico automaticamente.' },
  { icon: 'image', title: 'B-roll automático', desc: 'Insere imagens de apoio de banco gratuito nos momentos certos da fala.' },
];

const STEPS = [
  { n: '1', title: 'Suba o vídeo', desc: 'Arraste seu bruto — horizontal ou vertical, qualquer formato.' },
  { n: '2', title: 'Escolha o que fazer', desc: 'Legendas, cortes, zoom, color grade, formato. Ou deixe tudo no automático.' },
  { n: '3', title: 'Baixe pronto', desc: 'O Riseframe processa e entrega o vídeo finalizado, pronto pra postar.' },
];

export default function Landing({ onEnter, onLogin }) {
  return (
    <div style={{ position: 'relative', minHeight: '100%', color: C.text }}>
      <MeshBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* NAV */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px', maxWidth: 1160, margin: '0 auto' }}>
          <Logo size={34} />
          <span style={{ fontWeight: 800, fontSize: 19, fontFamily: FONT_DISPLAY, letterSpacing: -0.4 }}>Riseframe</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <GhostBtn onClick={onLogin}>Entrar</GhostBtn>
            <GradBtn onClick={onEnter}>Começar grátis</GradBtn>
          </div>
        </nav>

        {/* HERO */}
        <header style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px 40px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 500, color: C.orangeSoft, background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)', marginBottom: 24 }}>
            <Icon name="sparkles" size={14} color={C.orangeSoft} /> Editor de vídeo com IA
          </div>
          <h1 style={{ fontSize: 'clamp(38px, 7vw, 66px)', lineHeight: 1.05, margin: '0 0 20px', letterSpacing: -2, fontWeight: 800, fontFamily: FONT_DISPLAY }}>
            Do bruto ao pronto,<br /><span style={gradientText}>em minutos.</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 'clamp(15px, 2.5vw, 19px)', lineHeight: 1.6, maxWidth: 620, margin: '0 auto 32px' }}>
            Suba um vídeo e o Riseframe corta as pausas, corrige a fala, cria legendas dinâmicas,
            adiciona movimento e aplica color grade cinematográfico — tudo automático.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <GradBtn onClick={onEnter} big>Criar minha conta grátis</GradBtn>
            <GhostBtn onClick={onLogin}>Já tenho conta</GhostBtn>
          </div>
        </header>

        {/* MOCKUP */}
        <div style={{ maxWidth: 340, margin: '10px auto 70px', padding: '0 24px' }}>
          <div style={glass({ borderRadius: 30, padding: 12, aspectRatio: '9/16', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg, #1a1230, #0c0c16)' })}>
            <div style={{ position: 'absolute', inset: 0, background: GRAD, opacity: 0.14 }} />
            <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', width: 90, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ position: 'relative', textAlign: 'center', paddingBottom: 60 }}>
              <div style={{ display: 'inline-block', background: '#000', color: '#fff', fontWeight: 800, fontSize: 30, fontFamily: FONT_DISPLAY, padding: '6px 14px', borderRadius: 8, boxShadow: `0 0 0 3px ${C.orange}`, letterSpacing: -0.5 }}>
                RISEFRAME
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 60px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>
            Tudo que um editor faria, <span style={gradientText}>automático</span>
          </h2>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, maxWidth: 560, margin: '0 auto 40px' }}>
            Recursos pensados para conteúdo vertical, cortes e social — sem abrir um editor complexo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={glass({ padding: 24 })}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon name={f.icon} size={22} color={C.orangeSoft} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, fontFamily: FONT_DISPLAY }}>{f.title}</h3>
                <p style={{ margin: 0, color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW */}
        <section style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px 70px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 40px' }}>
            Em <span style={gradientText}>3 passos</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ textAlign: 'center', padding: '0 12px' }}>
                <div style={{ width: 58, height: 58, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 24, fontWeight: 800, fontFamily: FONT_DISPLAY, boxShadow: '0 10px 26px -8px rgba(124,58,237,0.6)' }}>
                  {s.n}
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, fontFamily: FONT_DISPLAY }}>{s.title}</h3>
                <p style={{ margin: 0, color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ maxWidth: 800, margin: '0 auto 70px', padding: '0 24px' }}>
          <div style={glass({ padding: '48px 32px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(255,107,53,0.12), rgba(124,58,237,0.12))' })}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 14px' }}>
              Pronto para acelerar sua edição?
            </h2>
            <p style={{ color: C.muted, fontSize: 16, margin: '0 0 26px' }}>Crie sua conta e edite seu primeiro vídeo agora.</p>
            <GradBtn onClick={onEnter} big>Começar grátis</GradBtn>
          </div>
        </section>

        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '24px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
          <Logo size={22} /> <span style={{ verticalAlign: 'middle', marginLeft: 6 }}>Riseframe · Editor de vídeo com IA</span>
        </footer>
      </div>
    </div>
  );
}
