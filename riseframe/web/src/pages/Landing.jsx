import React, { useEffect, useMemo, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import {
  ChevronRight, Menu, X, Search, Sparkles, Film, Captions, Wand2, Image as ImageIcon, AudioLines, Upload,
  Scissors, Play, SkipBack, SkipForward, Download as DownloadIcon, Check,
} from 'lucide-react';
import { Logo } from '../components/Icon.jsx';
import BeforeAfter from '../components/BeforeAfter.jsx';
import { getPublicInfo, apiAsset } from '../api.js';
import { detectPlatform, PLATFORMS } from './Download.jsx';

// Página inicial (visitante sem login): cinematográfica, vídeo de fundo em loop, título
// com brilho animado, barra de menu estilo macOS, o editor do Riseframe em miniatura e
// cartões em "vidro líquido". Paleta: laranja sobre preto.

// Vídeo de fundo (troque por VITE_HERO_VIDEO_URL). O laranja da marca é aplicado por cima
// (mistura "color"), então qualquer vídeo fica no tom do site.
const HERO_VIDEO = import.meta.env.VITE_HERO_VIDEO_URL
  || 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4';

const EASE = [0.22, 1, 0.36, 1];

const gradientStyle = {
  backgroundImage: 'linear-gradient(to right, #140700 0%, #5C1E00 12.5%, #FFD9B0 32.5%, #FF6A1A 50%, #5C1E00 67.5%, #140700 87.5%, #140700 100%)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'url(#c3-noise)',
};

function AppleLogo({ className = 'ra-i16' }) {
  return (
    <svg viewBox="0 0 384 512" fill="currentColor" className={className} aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function WindowsLogo({ className = 'ra-i16' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M2 4.3l8.2-1.1v7.9H2V4.3zm0 15.4l8.2 1.1v-7.8H2v6.7zm9.1 1.2L22 22.5V13H11.1v7.9zM11.1 3.1V11H22V1.5L11.1 3.1z" />
    </svg>
  );
}

/** Pílula branca (o botão principal do modelo). */
function PillButton({ children, onClick, icon, full = false, href }) {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} onClick={onClick} className={`ra-pill group${full ? ' ra-pill-full' : ''}`}>
      {icon}
      <span>{children}</span>
      <ChevronRight className="ra-i16 ra-chev" />
    </Tag>
  );
}

function SectionEyebrow({ label, tag }) {
  return (
    <div className="ra-eyebrow">
      <span className="ra-dot" />
      <span>{label}</span>
      {tag && <span className="ra-eyebrow-tag">{tag}</span>}
    </div>
  );
}

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, delay, ease: EASE },
});

// ── 1. Barra de navegação ──
const NAV = [['Recursos', '#recursos'], ['Antes e depois', '#demo'], ['Preços', '#precos'], ['Baixar app', '/download']];

function Navbar({ onEnter, onLogin }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.nav initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="ra-nav">
      <div className="ra-wrap ra-nav-row">
        <a href="/" aria-label="Riseframe" className="ra-logo"><Logo size={34} variant="mark" /></a>
        <div className="ra-nav-links">
          {NAV.map(([l, h], i) => (
            <motion.a key={l} href={h} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.5 }} className="ra-nav-link">{l}</motion.a>
          ))}
        </div>
        <div className="ra-nav-right">
          <button onClick={onLogin} className="ra-nav-link ra-nav-login">Entrar</button>
          <PillButton onClick={onEnter}>Começar grátis</PillButton>
        </div>
        <button className="ra-menu-btn" aria-label={open ? 'Fechar o menu' : 'Abrir o menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="ra-i18" /> : <Menu className="ra-i18" />}
        </button>
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="ra-mobile-menu liquid-glass">
          {NAV.map(([l, h]) => <a key={l} href={h} onClick={() => setOpen(false)} className="ra-mobile-link">{l}</a>)}
          <button onClick={onLogin} className="ra-mobile-link" style={{ textAlign: 'left' }}>Entrar</button>
          <PillButton onClick={onEnter} full>Começar grátis</PillButton>
        </motion.div>
      )}
    </motion.nav>
  );
}

// ── 2. Hero ──
function Hero({ onEnter, freeEdits }) {
  return (
    <section className="ra-wrap ra-hero">
      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8, ease: EASE }} className="ra-h1">
        Seus vídeos,<br />
        <span className="animate-shiny" style={gradientStyle}>no próximo nível.</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: EASE }} className="ra-lead">
        O Riseframe é o editor de vídeo com IA para quem cria conteúdo. Ele corta as pausas, legenda a sua fala,
        limpa o áudio e entrega o vídeo pronto para postar — em minutos.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8, ease: EASE }} className="ra-hero-cta">
        <div className="ra-row">
          <PillButton onClick={onEnter}>Começar grátis</PillButton>
          <DownloadOutline />
        </div>
        <span className="ra-note">{freeEdits} edições grátis com tudo liberado · Windows, Mac (Intel / Apple M) e navegador</span>
      </motion.div>
    </section>
  );
}

function DownloadOutline() {
  const plat = useMemo(detectPlatform, []);
  const id = plat === 'mobile' ? 'win' : plat;
  return (
    <a href="/download" className="ra-outline">
      {PLATFORMS[id].os === 'mac' ? <AppleLogo className="ra-i14" /> : <WindowsLogo className="ra-i14" />}
      Baixar para {PLATFORMS[id].os === 'mac' ? 'Mac' : 'Windows'}
      <ChevronRight className="ra-i16 ra-chev" />
    </a>
  );
}

// ── 3. Barra de menu estilo macOS ──
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const clock = (d) => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function MenuBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.6 }} className="ra-menubar">
      <div className="ra-wrap ra-menubar-row">
        <div className="ra-menubar-left">
          <AppleLogo className="ra-i14" />
          <b>Riseframe</b>
          {['Arquivo', 'Editar', 'Clipe', 'Sequência', 'Janela', 'Ajuda'].map((m, i) => (
            <span key={m} className={i > 3 ? 'ra-hide-md' : i > 1 ? 'ra-hide-sm' : ''}>{m}</span>
          ))}
        </div>
        <div className="ra-menubar-right">
          <Search className="ra-i14" />
          <span>{clock(now)}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── 4. O editor em miniatura ──
const SIDE = [
  { icon: Film, label: 'Projeto', active: true },
  { icon: Upload, label: 'Mídia', count: 4 },
  { icon: Captions, label: 'Legendas', count: 186 },
  { icon: Wand2, label: 'Efeitos' },
  { icon: ImageIcon, label: 'B-roll', count: 5 },
  { icon: AudioLines, label: 'Áudio' },
];
const STYLES = [['Destaque', '#FF6A1A'], ['Clean', '#FFFFFF'], ['Neon', '#FFD166'], ['Minimal', '#A3A3A3']];
const TRANSCRIPT = [
  { t: '00:00', words: [['Hoje', 0], ['eu', 0], ['vou', 0], ['te', 0], ['mostrar', 0]] },
  { t: '00:02', words: [['é...', 1], ['o', 0], ['segredo', 2], ['que', 0], ['ninguém', 0], ['conta', 0]] },
  { t: '00:05', words: [['sobre', 0], ['crescer', 0], ['nas', 0], ['redes', 2]] },
  { t: '00:08', words: [['*tosse*', 1], ['Não', 0], ['é', 0], ['sorte.', 0]] },
  { t: '00:10', words: [['É', 0], ['constância', 2], ['e', 0], ['um', 0], ['bom', 0], ['editor.', 0]] },
];

function EditorMockup({ showcase }) {
  const [videoOk, setVideoOk] = useState(true);
  const src = showcase?.after ? apiAsset(showcase.after) : '';
  return (
    <section className="ra-wrap ra-mock-sec">
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.9, ease: EASE }} className="ra-mock">
        <div className="ra-titlebar">
          <div className="ra-lights">{['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ background: c }} />)}</div>
          <span className="ra-titlebar-label">Riseframe — Meu vídeo.mp4</span>
          <span className="ra-export"><DownloadIcon className="ra-i12" /> Exportar</span>
        </div>
        <div className="ra-mock-body">
          {/* barra lateral */}
          <aside className="ra-side">
            <div className="ra-compose"><Sparkles className="ra-i14" /> Editar com IA</div>
            <div className="ra-side-list">
              {SIDE.map(({ icon: I, label, count, active }) => (
                <div key={label} className={`ra-side-item${active ? ' is-active' : ''}`}>
                  <I className="ra-i14" /><span>{label}</span>{count ? <em>{count}</em> : null}
                </div>
              ))}
            </div>
            <div className="ra-side-title">Estilos de legenda</div>
            {STYLES.map(([n, c]) => (
              <div key={n} className="ra-side-item"><span className="ra-swatch" style={{ background: c }} /><span>{n}</span></div>
            ))}
          </aside>

          {/* monitor */}
          <div className="ra-monitor">
            <div className="ra-screen">
              {src && videoOk ? (
                <>
                  <video className="ra-screen-blur" src={src} autoPlay loop muted playsInline aria-hidden="true" />
                  <video className="ra-screen-video" src={src} autoPlay loop muted playsInline onError={() => setVideoOk(false)} />
                </>
              ) : (
                <div className="ra-screen-fallback">
                  <div className="ra-person"><span /><i /></div>
                  <div className="ra-cap">O SEGREDO É <b>CONSTÂNCIA</b></div>
                </div>
              )}
            </div>
            <div className="ra-transport">
              <SkipBack className="ra-i14" /><span className="ra-play"><Play className="ra-i12" fill="currentColor" /></span><SkipForward className="ra-i14" />
              <span className="ra-tc">00:42 <i>/ 02:04</i></span>
              <span className="ra-fmt">9:16 · 1080p</span>
            </div>
          </div>

          {/* transcrição + resumo da IA */}
          <div className="ra-reader">
            <div className="ra-tabs">{['Transcrição', 'Estilo', 'Legendas'].map((t, i) => <span key={t} className={i === 0 ? 'is-on' : ''}>{t}</span>)}</div>
            <div className="ra-summary liquid-glass">
              <div className="ra-summary-head"><Sparkles className="ra-i14" style={{ color: '#FFB067' }} /> Resumo do Riseframe</div>
              <p>23 pausas e 4 tosses removidas, 186 palavras legendadas e 3 zooms nas frases fortes. Duração: 3:12 → 2:04.</p>
            </div>
            <div className="ra-lines">
              {TRANSCRIPT.map((l) => (
                <div key={l.t} className="ra-line">
                  <span className="ra-line-t">{l.t}</span>
                  <span>{l.words.map(([w, k], i) => <span key={i} className={k === 1 ? 'is-cut' : k === 2 ? 'is-key' : ''}>{w} </span>)}</span>
                </div>
              ))}
            </div>
            <div className="ra-attach"><Scissors className="ra-i12" /> 27 cortes · MP4 1080×1920</div>
          </div>

          {/* timeline */}
          <div className="ra-timeline">
            {[['V1', 'v', [[0, 18], [19, 37], [38, 61], [62, 80], [81, 100]]], ['A1', 'a', [[0, 18], [19, 37], [38, 61], [62, 80], [81, 100]]], ['T1', 't', [[1, 11], [13, 25], [27, 36], [39, 52], [54, 66], [68, 79], [82, 97]]]].map(([n, k, bl]) => (
              <div key={n} className="ra-lane">
                <span className="ra-lane-n">{n}</span>
                <div className="ra-lane-track">{bl.map(([a, b]) => <span key={a} className={`ra-clip ra-clip-${k}`} style={{ left: `${a}%`, width: `${b - a}%` }} />)}</div>
              </div>
            ))}
            <motion.span className="ra-playhead" animate={{ left: ['6%', '96%'] }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} />
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ── 5. Edição automática (em uma passada) ──
const PASS = [
  { name: 'Cortes', count: 23, color: '#FFFFFF', items: ['Pausa longa — 00:42', 'Silêncio — 03:17'] },
  { name: 'Ruídos', count: 6, color: '#FFB067', items: ['Tosse — 05:02', 'Pigarro — 08:40'] },
  { name: 'Legendas', count: 186, color: '#FF6A1A', items: ['Frases sincronizadas', 'Palavras-chave em destaque'] },
  { name: 'Destaques', count: 5, color: '#9A3A0A', items: ['Zoom — “o segredo é…” · B-roll — “praia” · Cor corrigida'] },
];

function FeaturePass() {
  return (
    <section id="recursos" className="ra-wrap ra-sec ra-two">
      <motion.div {...reveal()}>
        <SectionEyebrow label="Edição automática" tag="Com IA" />
        <h2 className="ra-h2">Do bruto ao pronto<br />em uma passada só.</h2>
        <p className="ra-p">
          O Riseframe ouve o vídeo inteiro, entende a fala e tira o que atrapalha: pausas, tosses, “é…” e repetições.
          Depois legenda, destaca as palavras fortes e aproxima nos momentos-chave. Você revisa tudo na timeline.
        </p>
        <div className="ra-chips">
          {['Corte de pausas', 'Legendas automáticas', 'Remove tosses e “é…”', 'Zoom nos momentos-chave', 'B-roll automático', 'Correção de cor'].map((c) => <span key={c}>{c}</span>)}
        </div>
      </motion.div>
      <motion.div {...reveal(0.1)} className="liquid-glass ra-pass">
        <div className="ra-pass-eyebrow">Agora · vídeo de 14 min analisado</div>
        <div className="ra-pass-grid">
          {PASS.map((g) => (
            <div key={g.name} className="liquid-glass ra-pass-card">
              <div className="ra-pass-head"><span className="ra-swatch" style={{ background: g.color }} />{g.name}<em>{g.count}</em></div>
              {g.items.map((it) => <div key={it} className="ra-pass-item">{it}</div>)}
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ── 6. Redes ──
const NETWORKS = ['Instagram', 'TikTok', 'YouTube', 'Shorts', 'Reels', 'LinkedIn', 'Kwai', 'Facebook'];
function LogoCloud() {
  return (
    <section className="ra-wrap ra-cloud">
      <p className="ra-kicker">Vídeos prontos para as redes onde o seu público está</p>
      <div className="ra-cloud-grid">
        {NETWORKS.map((n, i) => (
          <motion.span key={n} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.5 }} className="ra-cloud-name">{n}</motion.span>
        ))}
      </div>
    </section>
  );
}

// ── 7. Para quem é ──
const USES = [
  { quote: 'Grave falando para a câmera e receba o Reels pronto: sem pausas, com legenda que destaca as palavras certas e zoom nos momentos-chave.', who: 'Criadores de conteúdo', what: 'Reels, TikTok e Shorts', tag: 'Criadores' },
  { quote: 'Uma aula ou live longa vira vários cortes curtos, legendados e sem as partes paradas — prontos para divulgar durante a semana.', who: 'Infoprodutores', what: 'Aulas, lives e lançamentos', tag: 'Infoprodutos' },
  { quote: 'Vídeos com a sua marca — logo, cores e estilo de legenda — em todo post, sem precisar contratar um editor.', who: 'Profissionais e empresas', what: 'Advogados, médicos, imobiliárias', tag: 'Negócios' },
];
function UseCases() {
  return (
    <section className="ra-wrap ra-sec ra-bordered">
      <motion.div {...reveal()} style={{ marginBottom: 36 }}>
        <SectionEyebrow label="Para quem é" />
        <h2 className="ra-h2" style={{ marginTop: 18 }}>Feito para quem precisa postar<br />bem e com frequência.</h2>
      </motion.div>
      <div className="ra-uses">
        {USES.map((u, i) => (
          <motion.figure key={u.who} {...reveal(i * 0.08)} className="liquid-glass ra-use">
            <blockquote>“{u.quote}”</blockquote>
            <figcaption>
              <div className="ra-use-who">{u.who}</div>
              <div className="ra-use-what">{u.what}</div>
              <div className="ra-use-tag">{u.tag.toUpperCase()}</div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}

// ── Antes e depois ──
function Demo({ showcase }) {
  return (
    <section id="demo" className="ra-wrap ra-sec">
      <motion.div {...reveal()} style={{ textAlign: 'center', marginBottom: 34 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><SectionEyebrow label="Antes e depois" tag="Edição real" /></div>
        <h2 className="ra-h2" style={{ marginTop: 18 }}>Veja o que muda.</h2>
        <p className="ra-p" style={{ margin: '16px auto 0' }}>
          {showcase?.sim ? 'Ligue e desligue cortes, legendas, cor, zoom e B-roll e veja como o vídeo fica.' : 'O mesmo vídeo: como foi gravado e como saiu do Riseframe.'}
        </p>
      </motion.div>
      <motion.div {...reveal(0.1)}><BeforeAfter showcase={showcase} /></motion.div>
    </section>
  );
}

// ── 8. Preços ──
const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PLAN_DESC = {
  basico: 'Para quem está começando a postar com frequência.',
  pro: 'Para criadores e profissionais que publicam toda semana.',
  premium: 'Para agências, estúdios e quem produz em volume.',
};
const FEATURE_NAMES = { captionStyle: 'Legendas estilizadas', image: 'Imagens de apoio (B-roll)', ai: 'Limpeza de fala por IA', clips: 'Clipes curtos automáticos', hd: 'Exportação em alta qualidade' };

function CheckDot() {
  return (
    <span className="c3-check">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
}

function Pricing({ info, onEnter }) {
  const plans = info?.plans || [];
  const free = info?.freeEdits || 3;
  return (
    <section id="precos" className="c3-pricing-section">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="c3-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch" />
          <feComponentTransfer><feFuncA type="linear" slope="0.075" /></feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
        </filter>
      </svg>
      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">Seus vídeos,</span>
          <span className="c3-watermark-line-2">no próximo nível.</span>
        </div>
      </div>
      <div className="c3-grid">
        {plans.map((p) => (
          <motion.div key={p.id} {...reveal(0.05)} className="c3-cell">
          <div className={`c3-card${p.popular ? ' c3-card-pro' : ''}`}>
            {p.popular && <span className="c3-badge">Mais popular</span>}
            <div className="c3-tier-small">{p.name}</div>
            <div className="c3-tier-large">{brl(p.priceCents)}<span className="c3-per">/mês</span></div>
            <div className="c3-desc">{PLAN_DESC[p.id] || `${p.credits.toLocaleString('pt-BR')} créditos por mês.`}</div>
            <ul className="c3-list">
              {[
                `${p.credits.toLocaleString('pt-BR')} créditos por mês (≈ ${Math.floor(p.credits / (info.costs?.video || 20))} vídeos)`,
                'Corte de pausas e legendas automáticas',
                'App para Windows e Mac + navegador',
                ...(p.features || []).map((f) => FEATURE_NAMES[f]).filter(Boolean),
              ].map((t) => <li key={t}><CheckDot />{t}</li>)}
            </ul>
            <button className="c3-btn" onClick={onEnter}>Escolher plano</button>
          </div>
          </motion.div>
        ))}
      </div>
      <div className="c3-toggle-wrap">
        <span className="c3-free"><Check className="ra-i14" /> Comece com {free} edições grátis, com tudo liberado — sem cartão.</span>
        <span className="c3-pay">{info?.payment === 'pix-links' ? `Pix · cada pagamento vale ${info.periodDays} dias` : 'Pix ou cartão · renovação mensal'}</span>
      </div>
    </section>
  );
}

// ── 9. Chamada final ──
function FinalCTA({ onEnter, freeEdits }) {
  return (
    <section className="ra-wrap ra-final-sec">
      <motion.div {...reveal()} className="liquid-glass ra-final">
        <div className="ra-final-glow" />
        <h2 className="ra-h2 ra-final-h">Feche a timeline antiga.<br />Abra o próximo nível.</h2>
        <p className="ra-p" style={{ margin: '24px auto 0', fontSize: 14 }}>
          Edite com IA, poste mais e volte a ter tempo para criar. Comece com {freeEdits} edições grátis, sem cartão.
        </p>
        <div className="ra-row" style={{ justifyContent: 'center', marginTop: 32 }}>
          <PillButton onClick={onEnter}>Começar grátis</PillButton>
          <a href="/download" className="ra-outline">Baixar o app <ChevronRight className="ra-i16 ra-chev" /></a>
        </div>
      </motion.div>
    </section>
  );
}

function Footer({ info }) {
  const hours = info?.retentionHours;
  return (
    <footer className="ra-wrap ra-footer">
      <p className="ra-privacy">
        <b>Seus vídeos são seus.</b>{' '}
        {hours ? `Os arquivos são apagados do servidor em até ${hours} horas. ` : 'Os arquivos são apagados do servidor periodicamente. '}
        Não usamos seus vídeos para treinar IA. Para gerar legendas, o áudio passa por um serviço de transcrição; as imagens de apoio vêm de bancos como Pexels.
      </p>
      <div className="ra-footer-row">
        <span className="ra-footer-brand"><Logo size={22} variant="mark" /> Riseframe · Editor de vídeo com IA</span>
        <div className="ra-footer-links">
          <a href="/termos">Termos de uso</a>
          <a href="/privacidade">Privacidade</a>
          <a href="/download">Baixar o app</a>
          {info?.supportEmail && <a href={`mailto:${info.supportEmail}`}>Contato</a>}
        </div>
      </div>
    </footer>
  );
}

export default function Landing({ onEnter, onLogin }) {
  const [info, setInfo] = useState(null);
  const [bundled, setBundled] = useState(null);
  const [bgOk, setBgOk] = useState(true);
  const showcase = info?.showcase || bundled;
  const freeEdits = info?.freeEdits || 3;
  useEffect(() => {
    getPublicInfo().then(setInfo).catch(() => {});
    // Demonstração que vem junto com o site: aparece na hora, sem esperar a API.
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
    <MotionConfig reducedMotion="user">
      <div className="ra-root">
        <style>{CSS}</style>
        {/* filtro de granulado do título */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id="c3-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
            <feComposite in2="SourceGraphic" operator="in" result="noise" />
            <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
          </filter>
        </svg>

        {/* fundo: vídeo em loop no tom laranja (ou brilhos animados se o vídeo não carregar) */}
        <div className="ra-bg" aria-hidden="true">
          <div className="ra-aurora"><span /><span /><span /></div>
          {bgOk && <video autoPlay loop muted playsInline className="ra-bg-video" src={HERO_VIDEO} onError={() => setBgOk(false)} />}
          <div className="ra-bg-tint" />
          <div className="ra-bg-shade" />
        </div>
        <div className="ra-guide ra-guide-l" />
        <div className="ra-guide ra-guide-r" />

        <div className="ra-content">
          <Navbar onEnter={onEnter} onLogin={onLogin} />
          <Hero onEnter={onEnter} freeEdits={freeEdits} />
          <MenuBar />
          <EditorMockup showcase={showcase} />
          <FeaturePass />
          <LogoCloud />
          <Demo showcase={showcase} />
          <UseCases />
          <Pricing info={info} onEnter={onEnter} />
          <FinalCTA onEnter={onEnter} freeEdits={freeEdits} />
          <Footer info={info} />
        </div>

        {/* celular: botão fixo embaixo */}
        <div className="ra-mobile-cta">
          <PillButton onClick={onEnter} full>Começar grátis ({freeEdits} edições)</PillButton>
        </div>
      </div>
    </MotionConfig>
  );
}

const CSS = `
.ra-root{ position: relative; min-height: 100vh; overflow-x: hidden; background: #0c0c0c; color: #fff; font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.ra-root ::selection{ background: rgba(255,106,26,0.3); }
.ra-root a{ color: inherit; text-decoration: none; }
.ra-root button{ font-family: inherit; }
.ra-i12{ width: 12px; height: 12px; flex-shrink: 0; } .ra-i14{ width: 14px; height: 14px; flex-shrink: 0; } .ra-i16{ width: 16px; height: 16px; flex-shrink: 0; } .ra-i18{ width: 18px; height: 18px; }
.ra-wrap{ max-width: 72rem; margin: 0 auto; padding: 0 24px; position: relative; }
.ra-content{ position: relative; z-index: 10; }

/* fundo */
.ra-bg{ position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.ra-bg-video{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ra-bg-tint{ position: absolute; inset: 0; background: #FF6A1A; mix-blend-mode: color; opacity: 0.85; }
.ra-bg-shade{ position: absolute; inset: 0; background: radial-gradient(120% 80% at 50% 0%, rgba(12,12,12,0.15), rgba(12,12,12,0.7) 70%), linear-gradient(180deg, rgba(12,12,12,0.1), rgba(12,12,12,0.55) 60%, rgba(12,12,12,0.85)); }
.ra-aurora span{ position: absolute; border-radius: 50%; filter: blur(110px); opacity: 0.55; }
.ra-aurora span:nth-child(1){ width: 60vw; height: 60vw; left: -10vw; top: -20vw; background: #FF6A1A; animation: raFloat 18s ease-in-out infinite; }
.ra-aurora span:nth-child(2){ width: 50vw; height: 50vw; right: -15vw; top: 10vh; background: #9A3A0A; animation: raFloat 22s ease-in-out infinite reverse; }
.ra-aurora span:nth-child(3){ width: 40vw; height: 40vw; left: 30vw; bottom: -20vw; background: #C2410C; opacity: 0.35; animation: raFloat 26s ease-in-out infinite; }
@keyframes raFloat{ 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(4vw, 3vh) scale(1.12); } }
.ra-guide{ display: none; pointer-events: none; position: fixed; top: 0; bottom: 0; left: 50%; width: 1px; background: rgba(255,255,255,0.1); z-index: 5; }
.ra-guide-l{ transform: translateX(calc(-50% - 36rem)); } .ra-guide-r{ transform: translateX(calc(-50% + 36rem)); }
@media (min-width: 768px){ .ra-guide{ display: block; } }

/* título brilhante */
.animate-shiny{ animation: raShiny 6s linear infinite; }
@keyframes raShiny{ 0%{ background-position: -200% center; } 100%{ background-position: 200% center; } }

/* vidro líquido */
.liquid-glass{ background: rgba(255,255,255,0.01); background-blend-mode: luminosity; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: none; box-shadow: inset 0 1px 1px rgba(255,255,255,0.1); position: relative; overflow: hidden; }
.liquid-glass::before{ content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.4px; background: linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }

/* botões */
.ra-pill{ display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; background: #fff; color: #000 !important; font-weight: 500; font-size: 14px; padding: 12px 20px; border: none; cursor: pointer; transition: all .2s; white-space: nowrap; }
.ra-pill:hover{ background: rgba(255,255,255,0.9); } .ra-pill:active{ transform: scale(0.98); }
.ra-pill-full{ width: 100%; }
.ra-chev{ transition: transform .2s; } .group:hover .ra-chev, .ra-outline:hover .ra-chev{ transform: translateX(1px); }
.ra-outline{ display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 14px; font-weight: 500; padding: 12px 20px; transition: background .2s; white-space: nowrap; }
.ra-outline:hover{ background: rgba(255,255,255,0.05); }
.ra-row{ display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

/* navegação */
.ra-nav{ position: relative; z-index: 20; }
.ra-nav-row{ display: flex; align-items: center; justify-content: space-between; height: 76px; }
.ra-logo{ display: inline-flex; }
.ra-nav-links{ display: none; gap: 32px; }
.ra-nav-link{ color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 500; transition: color .2s; background: none; border: none; cursor: pointer; padding: 0; }
.ra-nav-link:hover{ color: #fff; }
.ra-nav-right{ display: none; align-items: center; gap: 22px; }
.ra-menu-btn{ width: 40px; height: 40px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; display: grid; place-items: center; cursor: pointer; }
.ra-mobile-menu{ margin: 0 24px; border-radius: 20px; padding: 14px; display: grid; gap: 4px; background: rgba(12,12,12,0.7); }
.ra-mobile-link{ padding: 12px 10px; font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.85); background: none; border: none; cursor: pointer; }
@media (min-width: 768px){ .ra-nav-links{ display: flex; } .ra-nav-right{ display: flex; } .ra-menu-btn, .ra-mobile-menu{ display: none; } }

/* hero */
.ra-hero{ padding-top: 64px; padding-bottom: 80px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.ra-h1{ font-size: 2.6rem; font-weight: 600; letter-spacing: -0.035em; line-height: 0.95; margin: 0; }
.ra-lead{ margin: 32px 0 0; color: rgba(255,255,255,0.6); max-width: 30rem; font-size: 16px; line-height: 1.5; }
.ra-hero-cta{ margin-top: 32px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.ra-hero-cta .ra-row{ justify-content: center; }
.ra-note{ font-size: 12px; color: rgba(255,255,255,0.4); }
@media (min-width: 768px){ .ra-hero{ padding-top: 112px; } .ra-h1{ font-size: 4.5rem; line-height: 0.92; } }

/* barra de menu */
.ra-menubar{ height: 40px; background: rgba(0,0,0,0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 6; }
.ra-menubar-row{ height: 100%; display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.ra-menubar-left, .ra-menubar-right{ display: flex; align-items: center; gap: 18px; color: rgba(255,255,255,0.8); }
.ra-menubar-left b{ color: #fff; }
.ra-menubar-right span{ white-space: nowrap; }
.ra-hide-sm, .ra-hide-md{ display: none; }
@media (min-width: 640px){ .ra-hide-sm{ display: inline; } }
@media (min-width: 768px){ .ra-hide-md{ display: inline; } }

/* editor em miniatura */
.ra-mock-sec{ padding-top: 64px; padding-bottom: 64px; }
@media (min-width: 768px){ .ra-mock-sec{ padding-top: 96px; padding-bottom: 96px; } }
.ra-mock{ position: relative; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: rgba(16,12,10,0.9); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); box-shadow: 0 60px 140px -50px rgba(255,106,26,0.35); }
.ra-titlebar{ height: 40px; display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
.ra-lights{ position: absolute; left: 16px; display: flex; gap: 8px; } .ra-lights span{ width: 12px; height: 12px; border-radius: 50%; }
.ra-titlebar-label{ font-size: 12px; color: rgba(255,255,255,0.5); }
.ra-export{ position: absolute; right: 12px; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #FF8A2A, #C2410C); border-radius: 7px; padding: 5px 10px; }
.ra-mock-body{ display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: 1fr auto; height: 600px; }
.ra-side{ grid-column: span 3; border-right: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); padding: 16px; font-size: 13px; overflow: hidden; }
.ra-compose{ display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; background: #fff; color: #000; font-size: 12px; font-weight: 600; padding: 9px 12px; }
.ra-side-list{ margin-top: 16px; display: grid; gap: 2px; }
.ra-side-item{ display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 7px; color: rgba(255,255,255,0.6); }
.ra-side-item:hover{ background: rgba(255,255,255,0.05); }
.ra-side-item.is-active{ background: rgba(255,255,255,0.1); color: #fff; }
.ra-side-item em{ margin-left: auto; font-style: normal; font-size: 11px; color: rgba(255,255,255,0.45); }
.ra-side-title{ margin: 22px 10px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.35); font-weight: 600; }
.ra-swatch{ width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ra-monitor{ grid-column: span 5; border-right: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; min-height: 0; }
.ra-screen{ position: relative; flex: 1; min-height: 0; overflow: hidden; background: #050505; display: grid; place-items: center; }
.ra-screen-blur{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(28px) brightness(0.45); transform: scale(1.2); }
.ra-screen-video{ position: relative; height: 92%; max-width: 92%; aspect-ratio: 9 / 16; object-fit: cover; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.ra-screen-fallback{ position: relative; height: 92%; aspect-ratio: 9 / 16; border-radius: 10px; background: linear-gradient(160deg, #3a2418, #160d08 60%, #0c0806); overflow: hidden; }
.ra-person{ position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); text-align: center; }
.ra-person span{ display: block; width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.14); margin: 0 auto; }
.ra-person i{ display: block; width: 120px; height: 60px; border-radius: 60px 60px 0 0; background: rgba(255,255,255,0.1); margin-top: 8px; }
.ra-cap{ position: absolute; left: 0; right: 0; bottom: 12%; text-align: center; font-weight: 800; font-size: 17px; letter-spacing: -0.01em; text-shadow: 0 2px 8px rgba(0,0,0,0.7); padding: 0 12px; }
.ra-cap b{ color: #FF8A2A; }
.ra-transport{ height: 44px; display: flex; align-items: center; gap: 14px; padding: 0 16px; border-top: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); font-size: 12px; }
.ra-play{ width: 26px; height: 26px; border-radius: 50%; background: #fff; color: #000; display: grid; place-items: center; }
.ra-tc{ font-variant-numeric: tabular-nums; color: #fff; } .ra-tc i{ font-style: normal; color: rgba(255,255,255,0.4); }
.ra-fmt{ margin-left: auto; font-size: 11px; color: rgba(255,255,255,0.45); }
.ra-reader{ grid-column: span 4; padding: 16px; display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: hidden; font-size: 13px; }
.ra-tabs{ display: flex; gap: 6px; } .ra-tabs span{ font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 7px; color: rgba(255,255,255,0.45); } .ra-tabs .is-on{ background: rgba(255,255,255,0.1); color: #fff; }
.ra-summary{ border-radius: 12px; padding: 12px 14px; }
.ra-summary-head{ display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); }
.ra-summary p{ margin: 8px 0 0; color: rgba(255,255,255,0.7); line-height: 1.55; font-size: 12.5px; }
.ra-lines{ display: grid; gap: 9px; color: rgba(255,255,255,0.75); line-height: 1.5; }
.ra-line{ display: grid; grid-template-columns: 42px 1fr; gap: 8px; }
.ra-line-t{ font-size: 11px; color: rgba(255,255,255,0.35); font-variant-numeric: tabular-nums; padding-top: 2px; }
.ra-line .is-cut{ color: #ff8a8a; text-decoration: line-through; opacity: 0.7; }
.ra-line .is-key{ color: #FF8A2A; font-weight: 700; }
.ra-attach{ margin-top: auto; align-self: flex-start; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 6px 12px; }
.ra-timeline{ grid-column: 1 / -1; position: relative; border-top: 1px solid rgba(255,255,255,0.08); padding: 12px 16px 14px; background: rgba(0,0,0,0.35); display: grid; gap: 7px; }
.ra-lane{ display: grid; grid-template-columns: 28px 1fr; align-items: center; gap: 8px; height: 24px; }
.ra-lane-n{ font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.4); }
.ra-lane-track{ position: relative; height: 100%; }
.ra-clip{ position: absolute; top: 0; bottom: 0; border-radius: 5px; }
.ra-clip-v{ background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.35); }
.ra-clip-a{ background: repeating-linear-gradient(90deg, rgba(255,176,103,0.75) 0 1px, transparent 1px 3px) center / 100% 55% no-repeat, rgba(255,138,42,0.12); border: 1px solid rgba(255,138,42,0.45); }
.ra-clip-t{ background: linear-gradient(135deg, #FF8A2A, #C2410C); }
.ra-playhead{ position: absolute; top: 6px; bottom: 6px; width: 2px; border-radius: 2px; background: #fff; box-shadow: 0 0 12px rgba(255,255,255,0.8); }
@media (max-width: 900px){
  .ra-mock-body{ height: auto; }
  .ra-side, .ra-reader{ display: none; }
  .ra-monitor{ grid-column: 1 / -1; border-right: none; }
  .ra-screen{ height: 420px; flex: none; }
}

/* seções */
.ra-sec{ padding-top: 80px; padding-bottom: 80px; }
@media (min-width: 768px){ .ra-sec{ padding-top: 112px; padding-bottom: 112px; } }
.ra-bordered{ border-top: 1px solid rgba(255,255,255,0.1); }
.ra-two{ display: grid; gap: 40px; align-items: start; }
@media (min-width: 768px){ .ra-two{ grid-template-columns: 1fr 1fr; gap: 64px; } }
.ra-eyebrow{ display: inline-flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 500; }
.ra-dot{ width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.ra-eyebrow-tag{ padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); font-size: 12px; }
.ra-h2{ margin: 20px 0 0; font-size: 1.9rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.02; }
@media (min-width: 768px){ .ra-h2{ font-size: 3rem; } }
.ra-p{ margin: 24px 0 0; color: rgba(255,255,255,0.6); font-size: 16px; line-height: 1.6; max-width: 28rem; }
.ra-chips{ margin-top: 28px; display: flex; flex-wrap: wrap; gap: 8px; }
.ra-chips span{ font-size: 12px; color: rgba(255,255,255,0.7); padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
.ra-pass{ border-radius: 16px; padding: 20px; }
.ra-pass-eyebrow{ font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 14px; }
.ra-pass-grid{ display: grid; gap: 10px; }
.ra-pass-card{ border-radius: 10px; padding: 12px; }
.ra-pass-head{ display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.ra-pass-head em{ margin-left: auto; font-style: normal; font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 500; }
.ra-pass-item{ font-size: 12.5px; color: rgba(255,255,255,0.6); padding: 3px 0 3px 16px; }
.ra-cloud{ padding-top: 64px; padding-bottom: 64px; }
.ra-kicker{ text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; color: rgba(255,255,255,0.4); margin: 0; }
.ra-cloud-grid{ margin-top: 40px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; text-align: center; }
@media (min-width: 640px){ .ra-cloud-grid{ grid-template-columns: repeat(4, 1fr); } }
@media (min-width: 1024px){ .ra-cloud-grid{ grid-template-columns: repeat(8, 1fr); } }
.ra-cloud-name{ font-size: 15px; font-weight: 600; letter-spacing: -0.02em; color: rgba(255,255,255,0.5); transition: color .2s; }
.ra-cloud-name:hover{ color: #fff; }
.ra-uses{ display: grid; gap: 16px; }
@media (min-width: 768px){ .ra-uses{ grid-template-columns: repeat(3, 1fr); } }
.ra-use{ margin: 0; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; }
.ra-use blockquote{ margin: 0; font-size: 14px; color: rgba(255,255,255,0.8); line-height: 1.6; flex: 1; }
.ra-use figcaption{ margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
.ra-use-who{ font-size: 14px; font-weight: 600; } .ra-use-what{ font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 2px; } .ra-use-tag{ font-size: 12px; font-weight: 600; letter-spacing: 0.05em; margin-top: 8px; color: #FF8A2A; }

/* preços */
.c3-pricing-section{ position: relative; padding: 40px 20px 80px; display: flex; flex-direction: column; align-items: center; overflow-x: hidden; }
.c3-watermark-container{ position: relative; width: 100%; max-width: 1100px; text-align: center; margin-top: 40px; z-index: 2; }
.c3-watermark-main{ font-size: min(9rem, 7.4vw); font-weight: 800; line-height: 0.9; letter-spacing: -0.05em; filter: url(#c3-noise); display: flex; flex-direction: column; align-items: center; white-space: nowrap; }
.c3-watermark-line-1{ color: #fff; }
.c3-watermark-line-2{ background: linear-gradient(to right, #140700 0%, #5C1E00 25%, #FFD9B0 65%, #FF6A1A 100%); -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent; }
.c3-grid{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; width: 100%; max-width: 1100px; margin-top: 60px; transform: translateX(20px); position: relative; z-index: 3; }
.c3-cell{ display: flex; }
.c3-cell > .c3-card{ flex: 1; }
.c3-card{ background: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(0,0,0,0.4)); backdrop-filter: blur(14px) brightness(0.91); -webkit-backdrop-filter: blur(14px) brightness(0.91); border: 1px solid rgba(255,255,255,1); border-radius: 44px; padding: 50px 24px; min-height: 580px; display: flex; flex-direction: column; transition: all 0.6s cubic-bezier(.22,1,.36,1); overflow: hidden; position: relative; }
.c3-card::before{ content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%); pointer-events: none; }
.c3-card:hover{ background: rgba(15,15,15,0.6); border-color: rgba(255,106,26,0.75); transform: translateY(-12px) scale(1.01); }
.c3-card-pro{ background: linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.55)); }
.c3-badge{ position: absolute; top: 26px; right: 26px; font-size: 11px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #FF8A2A, #C2410C); border-radius: 999px; padding: 4px 10px; }
.c3-tier-small{ font-size: 1.1rem; font-weight: 400; color: rgba(255,255,255,0.6); }
.c3-tier-large{ font-size: 2.8rem; font-weight: 500; letter-spacing: -0.02em; color: #fff; margin-top: 8px; }
.c3-per{ font-size: 1rem; color: rgba(255,255,255,0.5); margin-left: 4px; font-weight: 400; }
.c3-desc{ font-size: 0.88rem; color: rgba(255,255,255,0.45); min-height: 3.2em; margin-top: 16px; margin-bottom: 40px; line-height: 1.5; }
.c3-list{ list-style: none; padding: 0; margin: 0 0 24px; }
.c3-list li{ display: flex; align-items: flex-start; gap: 14px; font-size: 0.92rem; color: rgba(255,255,255,0.8); margin-bottom: 18px; line-height: 1.4; }
.c3-check{ width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.15); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.c3-btn{ background: #fff; color: #000; padding: 10px 32px; border-radius: 100px; font-weight: 600; font-size: 0.88rem; margin-top: auto; border: none; cursor: pointer; align-self: center; transition: all 0.3s cubic-bezier(.22,1,.36,1); }
.c3-btn:hover{ background: #f5f5f5; transform: scale(1.02); box-shadow: 0 8px 24px rgba(255,255,255,0.15); }
.c3-toggle-wrap{ display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; width: 100%; max-width: 1100px; margin-top: 32px; padding: 0 20px; font-size: 13px; }
.c3-free{ display: inline-flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.85); }
.c3-pay{ color: rgba(255,255,255,0.45); }
@media (max-width: 1024px){
  .c3-watermark-main{ font-size: 3.5rem; filter: none; white-space: normal; }
  .c3-watermark-line-2{ background: none; -webkit-text-fill-color: #FF6A1A; color: #FF6A1A; }
  .c3-grid{ display: flex; overflow-x: auto; scroll-snap-type: x mandatory; transform: none; width: 100vw; padding: 0 20px; gap: 16px; scrollbar-width: none; }
  .c3-grid::-webkit-scrollbar{ display: none; }
  .c3-cell{ flex: 0 0 320px; scroll-snap-align: center; }
  .c3-toggle-wrap{ justify-content: center; text-align: center; }
}
@media (max-width: 520px){ .c3-watermark-main{ font-size: 2.6rem; } }

/* chamada final + rodapé */
.ra-final-sec{ padding-top: 80px; padding-bottom: 80px; }
@media (min-width: 768px){ .ra-final-sec{ padding-top: 128px; padding-bottom: 128px; } }
.ra-final{ border-radius: 24px; padding: 64px 32px; text-align: center; }
@media (min-width: 768px){ .ra-final{ padding: 96px 32px; } }
.ra-final-glow{ position: absolute; inset: 0; background: radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%); opacity: 0.3; pointer-events: none; }
.ra-final-h{ font-size: 2.25rem; position: relative; }
@media (min-width: 768px){ .ra-final-h{ font-size: 3.75rem; } }
.ra-footer{ padding-bottom: 110px; }
.ra-privacy{ font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.6; max-width: 46rem; margin: 0 0 28px; }
.ra-privacy b{ color: rgba(255,255,255,0.8); }
.ra-footer-row{ display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 22px; font-size: 13px; color: rgba(255,255,255,0.45); }
.ra-footer-brand{ display: inline-flex; align-items: center; gap: 10px; }
.ra-footer-links{ display: flex; gap: 18px; flex-wrap: wrap; } .ra-footer-links a{ color: rgba(255,255,255,0.6); } .ra-footer-links a:hover{ color: #fff; }
@media (min-width: 768px){ .ra-footer{ padding-bottom: 40px; } }
.ra-mobile-cta{ display: none; position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, rgba(12,12,12,0), rgba(12,12,12,0.92) 45%); }
@media (max-width: 640px){ .ra-mobile-cta{ display: block; } }
@media (prefers-reduced-motion: reduce){ .animate-shiny, .ra-aurora span{ animation: none; } }
`;
