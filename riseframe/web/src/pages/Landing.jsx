import React, { useEffect, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon, { Logo } from '../components/Icon.jsx';
import BeforeAfter from '../components/BeforeAfter.jsx';
import HeroDemo from '../components/HeroDemo.jsx';
import { getPublicInfo } from '../api.js';

function MeshBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 520, height: 520, borderRadius: '50%', background: C.orange, filter: 'blur(160px)', opacity: 0.16 }} />
      <div style={{ position: 'absolute', top: '8%', right: '-12%', width: 560, height: 560, borderRadius: '50%', background: C.purple, filter: 'blur(170px)', opacity: 0.18 }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '25%', width: 480, height: 480, borderRadius: '50%', background: C.purpleSoft, filter: 'blur(160px)', opacity: 0.1 }} />
    </div>
  );
}

function GhostBtn({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text, borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.orange; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderStrong; }}
    >
      {children}
    </button>
  );
}

function GradBtn({ children, onClick, big, style }) {
  return (
    <button
      onClick={onClick}
      style={{ background: GRAD, border: 'none', color: '#fff', borderRadius: 13, padding: big ? '15px 30px' : '11px 22px', fontSize: big ? 16 : 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 30px -8px rgba(255,107,53,0.5)', transition: 'transform .15s', ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      {children}
    </button>
  );
}

const FEATURES = [
  { icon: 'captions', title: 'Legendas automáticas', desc: 'Escritas a partir da sua fala e sincronizadas. Vários estilos, cores e posições — você revisa o texto antes de exportar.' },
  { icon: 'scissors', title: 'Corta as pausas', desc: 'Tira silêncios e trechos parados e junta o vídeo sozinho. Você vê cada corte na timeline e pode desfazer.' },
  { icon: 'mic', title: 'Limpa a fala', desc: 'Remove "é...", "hã", gaguejos e repetições, para o vídeo ficar direto ao ponto.' },
  { icon: 'film', title: 'Zoom nos momentos-chave', desc: 'Aproxima a imagem nas frases mais fortes para prender a atenção — sem ficar mexendo o tempo todo.' },
  { icon: 'palette', title: 'Corrige luz e cor', desc: 'Acerta a cor de lâmpada amarela ou luz fria e clareia vídeo escuro, mantendo a pele natural. Looks opcionais.' },
  { icon: 'image', title: 'Imagens de apoio (B-roll)', desc: 'Insere imagens e vídeos que ilustram o que você fala — em tela cheia ou dividida. Você escolhe e troca cada uma.' },
];

const STEPS = [
  { n: '1', title: 'Suba o vídeo', desc: 'Arraste o bruto do celular ou da câmera (MP4, MOV, MKV, WEBM…), horizontal ou vertical.' },
  { n: '2', title: 'Revise e ajuste', desc: 'Deixe no automático ou ajuste legendas, cortes, zoom, cor e formato (9:16, 1:1, 16:9) vendo a prévia.' },
  { n: '3', title: 'Baixe pronto', desc: 'Receba o MP4 final na mesma resolução do original, sem marca d’água, pronto para postar.' },
];

const TRUST = ['3 edições grátis com tudo liberado', 'Sem cartão de crédito', 'Sem marca d’água'];

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FEATURE_NAMES = { captionStyle: 'legendas estilizadas', image: 'imagens de apoio (B-roll)', ai: 'limpeza de fala por IA', clips: 'clipes curtos' };

/** Seção do teste grátis + planos com preço, limites e forma de pagamento. */
function Pricing({ info, onEnter }) {
  const free = info?.freeEdits || 3;
  return (
    <section id="precos" style={{ maxWidth: 1100, margin: '0 auto', padding: '10px 24px 70px' }}>
      <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>
        Comece com <span style={gradientText}>{free} edições grátis</span>
      </h2>
      <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, maxWidth: 640, margin: '0 auto 30px', lineHeight: 1.6 }}>
        Crie a conta e edite {free} vídeos com <b style={{ color: C.text }}>todos os recursos liberados</b> — sem cartão e sem marca d’água.
        Depois, escolha um plano se quiser continuar.
      </p>
      {info?.plans?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {info.plans.map((p) => (
            <div key={p.id} style={{ ...glass({ padding: 22 }), border: p.popular ? `1px solid ${C.purple}99` : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
                {p.popular && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: GRAD, borderRadius: 20, padding: '3px 9px' }}>MAIS POPULAR</span>}
              </div>
              <div style={{ margin: '10px 0 2px' }}>
                <span style={{ fontSize: 30, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{brl(p.priceCents)}</span>
                <span style={{ color: C.muted, fontSize: 14 }}> / {info.periodDays} dias</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.credits.toLocaleString('pt-BR')} créditos (≈ {Math.floor(p.credits / (info.costs?.video || 20))} vídeos)</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                Corte de pausas e legenda{p.features.length ? ` + ${p.features.map((f) => FEATURE_NAMES[f] || f).join(', ')}` : ''}.
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginTop: 18, color: C.muted, fontSize: 13.5 }}>
        {[
          info?.payment === 'pix-links' ? `Pagamento por Pix. O plano vale ${info.periodDays} dias e não renova sozinho — avisamos antes de vencer.` : 'Pagamento por Pix ou cartão.',
          'Um vídeo custa em média 20 créditos; recursos extras somam créditos. Se o processamento falhar, os créditos voltam.',
          `Formatos aceitos: ${(info?.formats || ['MP4', 'MOV', 'MKV', 'WEBM']).join(', ')}. Sem limite de tamanho de arquivo.`,
          `Saída em MP4 na resolução do original, em 9:16, 1:1, 16:9 ou no formato original.`,
        ].map((t) => (
          <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="check" size={15} color={C.green} strokeWidth={2.4} /> <span>{t}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 26 }}>
        <GradBtn onClick={onEnter} big>Testar grátis</GradBtn>
      </div>
    </section>
  );
}

/** Privacidade em linguagem simples (o detalhe completo fica em /privacidade). */
function PrivacyNote({ info }) {
  const hours = info?.retentionHours;
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
      <div style={glass({ padding: '24px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' })}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(46,212,122,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="shield" size={22} color={C.green} />
        </div>
        <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.65 }}>
          <b style={{ color: C.text, fontSize: 16 }}>Seus vídeos são seus.</b>{' '}
          {hours ? `Os arquivos são apagados do servidor em até ${hours} horas. ` : 'Os arquivos são apagados do servidor periodicamente. '}
          Não usamos seus vídeos para treinar IA. Para gerar legendas, o áudio passa por um serviço de transcrição; as imagens de apoio vêm de bancos como Pexels.{' '}
          <a href="/privacidade" style={{ color: C.orangeSoft }}>Política de privacidade</a> · <a href="/termos" style={{ color: C.orangeSoft }}>Termos de uso</a>
        </div>
      </div>
    </section>
  );
}

// Mockup do celular que mostra o PRODUTO real (legenda com palavra-chave + timeline).
function PhoneMock() {
  return (
    <div style={{ position: 'relative', width: 300, maxWidth: '82vw' }}>
      <div style={{ position: 'absolute', inset: -30, background: GRAD, filter: 'blur(60px)', opacity: 0.35, borderRadius: 40 }} />
      <div
        style={{
          position: 'relative', aspectRatio: '9/16', borderRadius: 34, padding: 10,
          background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 40px 90px -30px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* "tela" do vídeo */}
        <div style={{ position: 'relative', height: '100%', borderRadius: 26, overflow: 'hidden', background: 'linear-gradient(160deg, #24314f 0%, #141a2c 55%, #0e0f1a 100%)' }}>
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 78, height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.18)' }} />
          {/* silhueta de pessoa */}
          <div style={{ position: 'absolute', bottom: 128, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', opacity: 0.9 }}>
            <div style={{ width: 66, height: 66, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', margin: '0 auto' }} />
            <div style={{ width: 128, height: 62, borderRadius: '60px 60px 0 0', background: 'rgba(255,255,255,0.12)', marginTop: 8 }} />
          </div>
          {/* legenda estilo palavra-chave */}
          <div style={{ position: 'absolute', bottom: 78, left: 0, right: 0, textAlign: 'center', padding: '0 14px' }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: -0.3, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 0 #000' }}>
              O PROBLEMA<br />NUNCA FOI O <span style={{ color: C.orange, textShadow: `0 0 16px ${C.orange}88` }}>DINHEIRO</span>
            </div>
          </div>
          {/* mini timeline */}
          <div style={{ position: 'absolute', bottom: 16, left: 12, right: 12 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0.28, 0.5, 0.16, 0.38, 0.22].map((w, i) => (
                <div key={i} style={{ flex: w, height: 22, borderRadius: 5, background: i === 1 ? GRAD : 'rgba(255,255,255,0.12)', border: i === 1 ? 'none' : '1px solid rgba(255,255,255,0.08)' }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ onEnter, onLogin }) {
  const [info, setInfo] = useState(null);
  const [bundled, setBundled] = useState(null);
  // Demo do servidor (criada pelo admin) tem prioridade; senão a que vem com o site.
  const showcase = info?.showcase || bundled;
  useEffect(() => {
    getPublicInfo().then(setInfo).catch(() => {});
    // Demonstração que vem junto com o site: aparece na hora, sem esperar a API (que
    // pode estar "acordando" num servidor separado).
    fetch('/demo/showcase.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m?.ready) return;
        const fix = (u) => (typeof u === 'string' ? u.replace('/api/showcase/', '/demo/') : u);
        const sim = m.sim ? { ...m.sim, broll: (m.sim.broll || []).map((b) => ({ ...b, src: fix(b.src) })) } : null;
        setBundled({ before: '/demo/antes.mp4', after: '/demo/depois.mp4', stats: m.stats, sim, bundled: true });
      })
      .catch(() => {});
  }, []);
  return (
    <div style={{ position: 'relative', minHeight: '100%', color: C.text }}>
      <MeshBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* NAV fixo com blur */}
        <nav style={{ position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(8,8,12,0.55)', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 20px', maxWidth: 1160, margin: '0 auto' }}>
            <Logo size={30} />
            <span style={{ fontWeight: 800, fontSize: 18, fontFamily: FONT_DISPLAY, letterSpacing: -0.4 }}>Riseframe</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center' }}>
              <GhostBtn onClick={onLogin} style={{ padding: '9px 16px' }}>Entrar</GhostBtn>
              <GradBtn onClick={onEnter} style={{ padding: '9px 18px', whiteSpace: 'nowrap' }}>Começar grátis</GradBtn>
            </div>
          </div>
        </nav>

        {/* HERO — duas colunas (texto + mockup) */}
        <header style={{ maxWidth: 1120, margin: '0 auto', padding: '54px 24px 30px' }}>
          <div className="rf-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 40, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 500, color: C.orangeSoft, background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)', marginBottom: 22 }}>
                <Icon name="sparkles" size={14} color={C.orangeSoft} /> Editor de vídeo com IA
              </div>
              <h1 className="rf-hero-h1" style={{ fontSize: 'clamp(36px, 6vw, 60px)', lineHeight: 1.04, margin: '0 0 18px', letterSpacing: -2, fontWeight: 800, fontFamily: FONT_DISPLAY }}>
                Do bruto ao pronto,<br /><span style={gradientText}>em minutos.</span>
              </h1>
              <p style={{ color: C.muted, fontSize: 'clamp(15px, 2.2vw, 18px)', lineHeight: 1.6, maxWidth: 520, margin: '0 0 26px' }}>
                Suba o vídeo gravado no celular e o Riseframe corta as pausas, limpa a fala, coloca legendas,
                acerta a cor e aproxima nos momentos-chave. Você revisa tudo antes de baixar.
              </p>
              <div className="rf-hero-cta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <GradBtn onClick={onEnter} big>Testar grátis</GradBtn>
                <GhostBtn onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })} style={{ padding: '15px 26px', fontSize: 16 }}>Ver antes e depois</GhostBtn>
              </div>
              <div className="rf-trust" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 22 }}>
                {TRUST.map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
                    <Icon name="check" size={14} color={C.green} strokeWidth={2.6} /> {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="rf-hero-mock" style={{ display: 'flex', justifyContent: 'center' }}>
              {showcase?.after
                ? <HeroDemo showcase={showcase} onMore={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })} />
                : <PhoneMock />}
            </div>
          </div>
        </header>

        {/* DEMO: antes e depois */}
        <section id="demo" style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 50px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>
            Veja o <span style={gradientText}>antes e depois</span>
          </h2>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, maxWidth: 560, margin: '0 auto 34px' }}>
            {showcase?.sim
              ? 'Uma edição real: ligue e desligue cortes, legendas, cor, zoom e B-roll e veja como o vídeo fica.'
              : 'O mesmo vídeo: como foi gravado e como saiu do Riseframe.'}
          </p>
          <BeforeAfter showcase={showcase} />
        </section>

        {/* FEATURES */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 60px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>
            O que o Riseframe <span style={gradientText}>faz por você</span>
          </h2>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, maxWidth: 560, margin: '0 auto 40px' }}>
            Feito para quem grava falando para a câmera — Reels, Shorts, TikTok, aulas e cortes de podcast.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rf-feat"
                style={{ ...glass({ padding: 22 }), transition: 'transform .18s ease, border-color .18s' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'rgba(255,107,53,0.35)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = ''; }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 13, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 20px -8px rgba(255,107,53,0.6)' }}>
                  <Icon name={f.icon} size={22} color="#fff" />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 17.5, fontWeight: 700, fontFamily: FONT_DISPLAY }}>{f.title}</h3>
                <p style={{ margin: 0, color: C.muted, fontSize: 14, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW */}
        <section style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 24px 70px' }}>
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

        <Pricing info={info} onEnter={onEnter} />
        <PrivacyNote info={info} />

        {/* CTA */}
        <section style={{ maxWidth: 800, margin: '0 auto 40px', padding: '0 24px' }}>
          <div style={glass({ padding: '48px 32px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(255,107,53,0.12), rgba(124,58,237,0.12))' })}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 14px' }}>
              Pronto para acelerar sua edição?
            </h2>
            <p style={{ color: C.muted, fontSize: 16, margin: '0 0 26px' }}>Crie sua conta e edite seus primeiros {info?.freeEdits || 3} vídeos de graça.</p>
            <GradBtn onClick={onEnter} big>Testar grátis</GradBtn>
          </div>
        </section>

        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '24px 24px 90px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
          <Logo size={22} /> <span style={{ verticalAlign: 'middle', marginLeft: 6 }}>Riseframe · Editor de vídeo com IA</span>
          <div style={{ marginTop: 10, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/termos" style={{ color: C.muted }}>Termos de uso</a>
            <a href="/privacidade" style={{ color: C.muted }}>Privacidade</a>
            <a href="#precos" style={{ color: C.muted }}>Preços</a>
            {info?.supportEmail && <a href={`mailto:${info.supportEmail}`} style={{ color: C.muted }}>Contato</a>}
          </div>
        </footer>
      </div>

      {/* Barra fixa de CTA no mobile (cara de app nativo) */}
      <div className="rf-mobile-cta" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(8,8,12,0), rgba(8,8,12,0.9) 40%)', display: 'none' }}>
        <button onClick={onEnter} style={{ width: '100%', background: GRAD, border: 'none', color: '#fff', borderRadius: 14, padding: '15px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 30px -8px rgba(255,107,53,0.6)' }}>
          Testar grátis ({info?.freeEdits || 3} edições)
        </button>
      </div>

      <style>{`
        @media (max-width: 860px){
          .rf-hero-grid{ grid-template-columns: 1fr !important; text-align: center; }
          .rf-hero-h1{ letter-spacing: -1px !important; }
          .rf-hero-cta{ justify-content: center; }
          .rf-trust{ justify-content: center; }
          .rf-hero-grid p{ margin-left: auto; margin-right: auto; }
          .rf-hero-mock{ margin-top: 30px; }        /* mockup DEPOIS do texto */
          .rf-hero-mock > div{ width: 230px !important; } /* menor no mobile */
          .rf-hero-mock > .rf-herodemo{ width: 100% !important; max-width: 360px !important; }
        }
        @media (max-width: 640px){
          .rf-mobile-cta{ display: block !important; }
        }
      `}</style>
    </div>
  );
}
