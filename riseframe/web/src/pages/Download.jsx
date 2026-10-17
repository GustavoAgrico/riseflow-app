import React, { useEffect, useMemo, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon, { Logo, Wordmark } from '../components/Icon.jsx';
import { MeshBg, GhostBtn, GradBtn } from './Landing.jsx';
import { getDownloads, getPublicInfo } from '../api.js';

// Página de download do app de PC/Mac (/download), no estilo das páginas de app dos
// grandes editores: botão do sistema detectado, outras versões, recursos, passo a passo,
// planos mensais (o app só funciona com plano ativo), requisitos e dúvidas.

const PLATFORMS = {
  win: { label: 'Windows', sub: 'Windows 10 e 11 (64 bits)', os: 'win' },
  winPortable: { label: 'Windows portátil', sub: 'Sem instalar — roda direto do arquivo', os: 'win' },
  macArm: { label: 'Mac (Apple M)', sub: 'Chips M1, M2, M3, M4…', os: 'mac' },
  macIntel: { label: 'Mac (Intel)', sub: 'Macs com processador Intel', os: 'mac' },
};

/** Sistema do visitante → id da plataforma sugerida ('mobile' no celular). */
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'win';
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) && !/Macintosh/.test(ua)) return 'mobile';
  if (/Macintosh|Mac OS X/i.test(ua)) {
    if (navigator.maxTouchPoints > 1) return 'mobile'; // iPad se apresenta como Mac
    // Chip Apple M: a placa de vídeo aparece como "Apple M…"/"Apple GPU" no WebGL.
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      if (/Intel|AMD|Radeon|NVIDIA/i.test(gpu)) return 'macIntel';
    } catch { /* sem WebGL: assume Apple M (todos os Macs novos) */ }
    return 'macArm';
  }
  return 'win';
}

const mb = (bytes) => (bytes ? `${Math.round(bytes / 1e6)} MB` : '');

function OsIcon({ os, size = 18, color = 'currentColor' }) {
  if (os === 'mac') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.05-.89.94-1.97 1.48-3.13 1.39-.03-.11-.04-.23-.04-.35 0-1.1.48-2.27 1.33-3.13.42-.44.96-.8 1.6-1.09.64-.28 1.25-.44 1.82-.47.02.2.03.4.03.6zM20.5 17.1c-.36.83-.79 1.6-1.29 2.3-.68.96-1.24 1.63-1.67 2-.67.6-1.38.91-2.15.93-.55 0-1.22-.16-2-.48-.78-.31-1.5-.47-2.15-.47-.68 0-1.42.16-2.2.47-.79.32-1.42.49-1.9.5-.74.03-1.47-.29-2.2-.95-.47-.4-1.05-1.1-1.75-2.1-.75-1.04-1.36-2.25-1.84-3.63C.85 14.18.6 12.7.6 11.27c0-1.64.36-3.06 1.07-4.24.56-.95 1.3-1.7 2.23-2.25.93-.55 1.93-.83 3.01-.85.59 0 1.36.18 2.32.54.95.36 1.56.54 1.83.54.2 0 .89-.21 2.05-.64 1.1-.39 2.03-.55 2.79-.49 2.06.17 3.6.98 4.63 2.44-1.84 1.12-2.75 2.68-2.73 4.69.02 1.56.58 2.86 1.69 3.9.5.48 1.06.85 1.69 1.11-.14.39-.28.77-.43 1.13z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M2 4.3l8.2-1.1v7.9H2V4.3zm0 15.4l8.2 1.1v-7.8H2v6.7zm9.1 1.2L22 22.5V13H11.1v7.9zM11.1 3.1V11H22V1.5L11.1 3.1z" />
    </svg>
  );
}

/** Janela do app desenhada em CSS: monitor com legenda, painel e timeline com as faixas. */
function AppWindow() {
  const lanes = [
    { label: 'V1', color: '#E2E2EA', blocks: [[0, 22], [24, 41], [43, 70], [72, 100]] },
    { label: 'A1', color: '#2ED47A', blocks: [[0, 22], [24, 41], [43, 70], [72, 100]], wave: true },
    { label: 'T1', color: '#FF6B35', blocks: [[2, 14], [16, 30], [33, 48], [50, 66], [69, 84], [86, 98]] },
  ];
  return (
    <div className="rf-dl-window" style={{ position: 'relative', width: '100%', maxWidth: 640 }}>
      <div style={{ position: 'absolute', inset: '-8% -6%', background: GRAD, filter: 'blur(90px)', opacity: 0.28, borderRadius: 60 }} />
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#0c0c12', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 50px 120px -40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
        {/* barra de título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', background: '#111119', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
          <span style={{ marginLeft: 10, fontSize: 11, color: C.faint, fontWeight: 600 }}>Riseframe — Meu vídeo.mp4</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#fff', background: GRAD, borderRadius: 6, padding: '3px 8px' }}>Exportar</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 8, padding: 8 }}>
          {/* monitor */}
          <div style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 9, overflow: 'hidden', background: 'linear-gradient(160deg, #2a3557 0%, #161b2e 60%, #0e0f1a 100%)' }}>
            <div style={{ position: 'absolute', left: '50%', bottom: '18%', transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', margin: '0 auto' }} />
              <div style={{ width: 86, height: 40, borderRadius: '44px 44px 0 0', background: 'rgba(255,255,255,0.12)', marginTop: 5 }} />
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '9%', textAlign: 'center', fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 'clamp(10px, 1.5vw, 15px)', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>
              EDITE EM <span style={{ color: C.orange }}>MINUTOS</span>
            </div>
          </div>
          {/* painel */}
          <div style={{ borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: 9, display: 'grid', gap: 6, alignContent: 'start' }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['Transcrição', 'Estilo', 'Legendas'].map((t, i) => (
                <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, color: i === 1 ? '#fff' : C.faint, background: i === 1 ? 'rgba(255,107,53,0.2)' : 'transparent' }}>{t}</span>
              ))}
            </div>
            {[0.9, 0.7, 0.82, 0.55].map((w, i) => (
              <div key={i} style={{ height: 7, width: `${w * 100}%`, borderRadius: 4, background: i === 1 ? 'rgba(255,107,53,0.45)' : 'rgba(255,255,255,0.09)' }} />
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginTop: 4 }}>
              {['#FF6B35', '#C2410C', '#2ED47A', '#F0526B', '#FFD166', '#4CC9F0'].map((c) => (
                <div key={c} style={{ aspectRatio: '16 / 10', borderRadius: 5, background: `linear-gradient(135deg, ${c}55, ${c}15)`, border: `1px solid ${c}55` }} />
              ))}
            </div>
          </div>
        </div>
        {/* timeline */}
        <div style={{ position: 'relative', margin: '0 8px 8px', padding: '6px 6px 8px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: C.faint, padding: '0 0 4px 22px' }}>
            {['00:00', '00:15', '00:30', '00:45', '01:00'].map((t) => <span key={t}>{t}</span>)}
          </div>
          {lanes.map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 20, marginTop: 4 }}>
              <span style={{ width: 16, fontSize: 8, fontWeight: 800, color: C.faint }}>{l.label}</span>
              <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                {l.blocks.map(([a, b]) => (
                  <div key={a} style={{ position: 'absolute', left: `${a}%`, width: `${b - a}%`, top: 0, bottom: 0, borderRadius: 4, background: `${l.color}${l.wave ? '30' : '55'}`, border: `1px solid ${l.color}aa`, overflow: 'hidden' }}>
                    {l.wave && <div style={{ position: 'absolute', inset: '25% 0', background: `repeating-linear-gradient(90deg, ${l.color}cc 0 1px, transparent 1px 3px)`, opacity: 0.8 }} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rf-dl-playhead" style={{ position: 'absolute', top: 18, bottom: 6, left: 'calc(22px + 6px)', width: 2, background: '#fff', boxShadow: '0 0 10px rgba(255,255,255,0.7)', borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}

/** Ilustrações das linhas de recursos (leves, em CSS). */
function FeatureArt({ kind }) {
  const box = { ...glass({ padding: 20, borderRadius: 20 }), minHeight: 230, display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative' };
  if (kind === 'captions') {
    const styles = [
      { t: 'ISSO MUDA', hl: 'TUDO', c: '#FFD166' },
      { t: 'o segredo é', hl: 'constância', c: C.orange },
      { t: 'VOCÊ PRECISA', hl: 'VER ISSO', c: '#4CC9F0' },
    ];
    return (
      <div style={box}>
        <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 360 }}>
          {styles.map((s, i) => (
            <div key={i} style={{ borderRadius: 12, padding: '14px 12px', textAlign: 'center', background: 'linear-gradient(160deg, #222b48, #121626)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 18, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
              {s.t} <span style={{ color: s.c }}>{s.hl}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'cuts') {
    const bars = Array.from({ length: 64 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37)) * 0.75);
    const cut = (i) => (i >= 14 && i < 21) || (i >= 38 && i < 44);
    return (
      <div style={box}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 110 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${(cut(i) ? 0.12 : h) * 100}%`, borderRadius: 2, background: cut(i) ? 'rgba(240,82,107,0.5)' : 'linear-gradient(180deg, #2ED47A, #1a9e5a)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[['Pausa', '1,8 s'], ['Tosse', '0,6 s'], ['"é..."', '0,4 s']].map(([a, b]) => (
              <span key={a} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 700, padding: '6px 11px', borderRadius: 999, background: 'rgba(240,82,107,0.12)', border: '1px solid rgba(240,82,107,0.35)', color: '#ffb3c0' }}>
                <Icon name="scissors" size={13} strokeWidth={2.2} /> {a} · {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'effects') {
    const fx = [['Zoom', 'maximize'], ['Brilho', 'sparkles'], ['Cor', 'palette'], ['Corte', 'scissors'], ['Texto', 'type'], ['B-roll', 'image']];
    return (
      <div style={box}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', maxWidth: 380 }}>
          {fx.map(([t, ic], i) => (
            <div key={t} style={{ aspectRatio: '1', borderRadius: 14, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 8, background: i === 0 ? GRAD : 'rgba(255,255,255,0.04)', border: `1px solid ${i === 0 ? 'transparent' : C.border}`, boxShadow: i === 0 ? '0 14px 30px -12px rgba(255,107,53,0.7)' : 'none', transform: i === 0 ? 'rotate(-4deg) translateY(-4px)' : 'none' }}>
              <Icon name={ic} size={24} strokeWidth={1.8} color={i === 0 ? '#fff' : C.orangeSoft} />
              <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#fff' : C.muted }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // timeline
  return (
    <div style={box}>
      <div style={{ width: '100%', maxWidth: 440, display: 'grid', gap: 8 }}>
        {[['V2', '#4CC9F0', [[30, 52]]], ['V1', '#E2E2EA', [[0, 28], [30, 64], [66, 100]]], ['A1', '#2ED47A', [[0, 28], [30, 64], [66, 100]]], ['T1', '#FF6B35', [[4, 20], [24, 44], [48, 62], [68, 92]]]].map(([l, c, bl]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30 }}>
            <span style={{ width: 22, fontSize: 11, fontWeight: 800, color: C.faint }}>{l}</span>
            <div style={{ position: 'relative', flex: 1, height: '100%', borderRadius: 6, background: 'rgba(255,255,255,0.025)' }}>
              {bl.map(([a, b]) => <div key={a} style={{ position: 'absolute', left: `${a}%`, width: `${b - a}%`, top: 2, bottom: 2, borderRadius: 6, background: `${c}55`, border: `1px solid ${c}` }} />)}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['V', 'Selecionar'], ['C', 'Cortar'], ['R', 'Trecho'], ['J K L', 'Reproduzir']].map(([k, t]) => (
            <span key={k} style={{ fontSize: 11.5, color: C.muted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <kbd style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 800, color: C.text, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: `1px solid ${C.borderStrong}` }}>{k}</kbd>{t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { kind: 'timeline', tag: 'EDIÇÃO PROFISSIONAL', title: 'Timeline completa, fácil como deveria ser', desc: 'Faixas de vídeo, áudio e legenda, cortes com a lâmina, seleção de trechos, zoom e atalhos de editor profissional (V, C, R, J/K/L). Tudo com prévia instantânea.' },
  { kind: 'captions', tag: 'LEGENDAS COM IA', title: 'Legendas automáticas que batem com a fala', desc: 'A IA transcreve, sincroniza palavra por palavra e destaca as palavras-chave. Escolha o estilo, revise o texto e pronto.' },
  { kind: 'cuts', tag: 'CORTE INTELIGENTE', title: 'Pausas, tosses e "é..." saem sozinhos', desc: 'O Riseframe encontra silêncios, tosses, gaguejos e repetições — inclusive em vídeos longos — e corta sem engolir palavras. Você vê cada corte e pode desfazer.' },
  { kind: 'effects', tag: 'EFEITOS', title: 'Arraste os efeitos direto para a timeline', desc: 'Zoom, transições, cor, textos e imagens de apoio (B-roll) com arrastar e soltar. O vídeo final sai na resolução do original e sem marca d’água.' },
];

const STEPS = [
  { icon: 'download', title: 'Baixe e instale', desc: 'Escolha o seu sistema acima. O instalador é leve e já traz tudo o que o app precisa.' },
  { icon: 'mail', title: 'Entre com seu e-mail', desc: 'A mesma conta do site: um login só, no navegador, no Windows e no Mac.' },
  { icon: 'zap', title: 'Teste grátis e assine', desc: 'As primeiras edições são grátis, com tudo liberado. Para continuar, assine o plano mensal — seus vídeos são processados no seu computador.' },
];

const REQS = [
  ['Windows', 'Windows 10 ou 11 (64 bits)'],
  ['Mac', 'macOS 11 ou mais novo — Apple M ou Intel'],
  ['Memória', '8 GB de RAM (16 GB para vídeos longos em 4K)'],
  ['Espaço', '2 GB livres + espaço para os seus vídeos'],
  ['Internet', 'Para entrar na conta, legendas e recursos de IA'],
];

function faqs(info) {
  const days = info?.periodDays || 30;
  const pix = info?.payment === 'pix-links';
  return [
    ['O download é grátis?', `Sim. E você testa ${info?.freeEdits || 3} edições grátis com todos os recursos, sem cartão. Depois, para continuar no app, é preciso um plano mensal ativo — o mesmo plano vale no site e no computador.`],
    ['Posso usar a mesma conta do site?', 'Sim. Entre com o mesmo e-mail e senha (ou pelo botão “Entrar pelo navegador”). Plano, créditos e projetos são da sua conta, não do computador.'],
    ['Como funciona a cobrança mensal?', pix
      ? `Cada pagamento libera o plano por ${days} dias. Avisamos por e-mail antes de vencer; ao renovar, o app continua liberado. Se vencer, o app pausa até a renovação — nada do que você fez é perdido.`
      : `O plano renova a cada ${days} dias. No cartão a renovação é automática; no Pix você paga a cada mês. Se o plano vencer, o app pausa até a renovação — nada do que você fez é perdido.`],
    ['Posso cancelar quando quiser?', 'Sim. O plano continua valendo até o fim do período já pago e não renova mais.'],
    ['O Windows avisou “O Windows protegeu o computador”', 'Clique em “Mais informações” e depois em “Executar assim mesmo”. O aviso aparece com apps novos que ainda não têm muitos downloads.'],
    ['O Mac diz que não pode abrir o app', 'Abra Ajustes do Sistema → Privacidade e Segurança, role até o fim e clique em “Abrir mesmo assim”. Só é preciso na primeira vez.'],
    ['Qual versão do Mac eu escolho?', 'Menu  → Sobre este Mac. Se aparecer “Chip Apple M1/M2/M3/M4”, escolha Apple M. Se aparecer “Processador Intel”, escolha Intel.'],
    ['Meus vídeos sobem para a internet?', 'O vídeo é editado no seu computador. Só o áudio vai para a transcrição das legendas — e não usamos seus vídeos para treinar IA.'],
  ];
}

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '18px 4px', background: 'none', border: 'none', color: C.text, fontFamily: 'inherit', fontSize: 15.5, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ flex: 1 }}>{q}</span>
        <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}>
          <Icon name="plus" size={14} strokeWidth={2.4} />
        </span>
      </button>
      {open && <p style={{ margin: '0 4px 18px', color: C.muted, fontSize: 14.5, lineHeight: 1.65 }}>{a}</p>}
    </div>
  );
}

export default function Download({ onEnter, onLogin, onHome, loggedIn = false }) {
  const [dl, setDl] = useState(null);
  const [info, setInfo] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const detected = useMemo(detectPlatform, []);
  const mobile = detected === 'mobile';
  const main = mobile ? 'win' : detected;

  useEffect(() => {
    getDownloads().then(setDl).catch(() => setDl({ platforms: {}, releasesUrl: '' }));
    getPublicInfo().then(setInfo).catch(() => {});
  }, []);

  const link = (id) => dl?.platforms?.[id]?.url || dl?.releasesUrl || '';
  const version = dl?.platforms?.[main]?.version;
  const start = (id) => {
    const url = link(id);
    if (url) window.location.href = url;
  };
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div style={{ position: 'relative', minHeight: '100vh', color: C.text }}>
      <MeshBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <nav style={{ position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(8,8,12,0.6)', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 20px', maxWidth: 1180, margin: '0 auto' }}>
            <button onClick={onHome} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text }}>
              <Logo size={30} variant="mark" />
              <Wordmark size={19} />
            </button>
            <div className="rf-nav-links" style={{ display: 'flex', gap: 22, marginLeft: 34 }}>
              {[['Recursos', 'dl-recursos'], ['Como começar', 'dl-passos'], ['Planos', 'dl-planos'], ['Dúvidas', 'dl-faq']].map(([l, id]) => (
                <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollTo(id); }} style={{ color: C.muted, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>{l}</a>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center' }}>
              {loggedIn ? (
                <GradBtn onClick={onHome} style={{ padding: '9px 18px', borderRadius: 999, whiteSpace: 'nowrap' }}>Abrir o painel</GradBtn>
              ) : (
                <>
                  <GhostBtn onClick={onLogin} style={{ padding: '9px 16px', borderRadius: 999 }}>Entrar</GhostBtn>
                  <GradBtn onClick={onEnter} style={{ padding: '9px 18px', borderRadius: 999, whiteSpace: 'nowrap' }}>Criar conta</GradBtn>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* HERO */}
        <header style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 24px 40px' }}>
          <div className="rf-dl-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 48, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, color: C.orangeSoft, background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)', marginBottom: 22 }}>
                <Icon name="download" size={13} color={C.orangeSoft} strokeWidth={2.2} /> APP PARA WINDOWS E MAC
              </div>
              <h1 style={{ fontSize: 'clamp(36px, 5vw, 60px)', lineHeight: 1.03, margin: '0 0 20px', letterSpacing: -2, fontWeight: 800, fontFamily: FONT_DISPLAY }}>
                O editor com IA,<br /><span style={gradientText}>agora no seu computador.</span>
              </h1>
              <p style={{ color: C.muted, fontSize: 'clamp(15px, 1.8vw, 18px)', lineHeight: 1.6, maxWidth: 520, margin: '0 0 30px' }}>
                Timeline profissional, legendas automáticas, cortes inteligentes e efeitos de arrastar e soltar —
                com a velocidade do seu PC ou Mac. Entre com o seu e-mail e use o mesmo plano do site.
              </p>

              {mobile ? (
                <div style={{ ...glass({ padding: 18 }), maxWidth: 460 }}>
                  <b style={{ fontSize: 15 }}>Abra esta página no computador para baixar.</b>
                  <p style={{ margin: '6px 0 14px', color: C.muted, fontSize: 14, lineHeight: 1.55 }}>O app é para Windows e Mac. No celular, você pode editar direto pelo navegador.</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <GradBtn onClick={loggedIn ? onHome : onEnter}>{loggedIn ? 'Abrir o painel' : 'Usar no navegador'}</GradBtn>
                    <GhostBtn onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copiar o link</GhostBtn>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <GradBtn big onClick={() => start(main)} style={{ display: 'inline-flex', alignItems: 'center', gap: 11, padding: '16px 28px' }}>
                      <OsIcon os={PLATFORMS[main].os} size={20} color="#fff" /> Baixar para {PLATFORMS[main].label}
                    </GradBtn>
                    <GhostBtn onClick={() => setShowAll((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 20px' }}>
                      Outras versões <Icon name="chevron" size={14} strokeWidth={2.4} style={{ transform: showAll ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
                    </GhostBtn>
                  </div>
                  <div style={{ marginTop: 14, fontSize: 13, color: C.faint, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {version && <span>Versão {version}</span>}
                    {dl?.platforms?.[main]?.size ? <span>{mb(dl.platforms[main].size)}</span> : null}
                    <span>{PLATFORMS[main].sub}</span>
                  </div>
                </>
              )}

              {(showAll || mobile) && (
                <div className="rf-dl-all" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 18, maxWidth: 520 }}>
                  {Object.entries(PLATFORMS).map(([id, p]) => (
                    <button key={id} onClick={() => start(id)} disabled={!link(id)} style={{ ...glass({ padding: '12px 14px', borderRadius: 14 }), display: 'flex', alignItems: 'center', gap: 12, cursor: link(id) ? 'pointer' : 'default', color: C.text, fontFamily: 'inherit', textAlign: 'left', borderColor: id === main && !mobile ? 'rgba(255,107,53,0.5)' : undefined }}>
                      <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
                        <OsIcon os={p.os} size={18} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{p.label}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 2 }}>{dl?.platforms?.[id] ? `${p.sub}${dl.platforms[id].size ? ` · ${mb(dl.platforms[id].size)}` : ''}` : dl ? 'Em breve' : 'Carregando…'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 28, color: C.muted, fontSize: 13.5 }}>
                {[`${info?.freeEdits || 3} edições grátis`, 'Mesma conta do site', 'Sem marca d’água'].map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(46,212,122,0.16)', color: C.green }}><Icon name="check" size={11} strokeWidth={3} /></span>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AppWindow />
            </div>
          </div>
        </header>

        {/* RECURSOS em linhas alternadas */}
        <section id="dl-recursos" style={{ maxWidth: 1120, margin: '0 auto', padding: '50px 24px 30px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>
            Tudo o que você precisa, <span style={gradientText}>num app só</span>
          </h2>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, maxWidth: 600, margin: '0 auto 50px', lineHeight: 1.6 }}>
            Do vídeo bruto ao post pronto: a IA faz o trabalho pesado e você tem o controle total na timeline.
          </p>
          <div style={{ display: 'grid', gap: 60 }}>
            {FEATURES.map((f, i) => (
              <div key={f.kind} className="rf-dl-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
                <div style={{ order: i % 2 ? 2 : 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: C.orangeSoft, marginBottom: 12 }}>{f.tag}</div>
                  <h3 style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', lineHeight: 1.15, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.6, margin: '0 0 14px' }}>{f.title}</h3>
                  <p style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
                </div>
                <div style={{ order: i % 2 ? 1 : 2 }}><FeatureArt kind={f.kind} /></div>
              </div>
            ))}
          </div>
        </section>

        {/* COMO COMEÇAR */}
        <section id="dl-passos" style={{ maxWidth: 1080, margin: '0 auto', padding: '70px 24px 30px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 40px' }}>
            Comece em <span style={gradientText}>3 passos</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {STEPS.map((s, i) => (
              <div key={s.title} style={{ ...glass({ padding: 24 }), position: 'relative' }}>
                <span style={{ position: 'absolute', top: 18, right: 20, fontSize: 40, fontWeight: 800, fontFamily: FONT_DISPLAY, color: 'rgba(255,255,255,0.06)' }}>{i + 1}</span>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: GRAD, display: 'grid', placeItems: 'center', marginBottom: 16, boxShadow: '0 8px 20px -8px rgba(255,107,53,0.6)' }}>
                  <Icon name={s.icon} size={22} color="#fff" strokeWidth={2} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, fontFamily: FONT_DISPLAY }}>{s.title}</h3>
                <p style={{ margin: 0, color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PLANOS MENSAIS */}
        <section id="dl-planos" style={{ maxWidth: 1120, margin: '0 auto', padding: '70px 24px 30px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>
            Um plano mensal, <span style={gradientText}>site + app</span>
          </h2>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, maxWidth: 620, margin: '0 auto 34px', lineHeight: 1.6 }}>
            Teste {info?.freeEdits || 3} edições grátis com tudo liberado. Depois, o app fica liberado enquanto o seu plano mensal estiver ativo. Cancele quando quiser.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {(info?.plans || []).map((p) => (
              <div key={p.id} style={{ ...glass({ padding: 24 }), position: 'relative', border: p.popular ? '1px solid rgba(194,65,12,0.7)' : undefined, boxShadow: p.popular ? '0 30px 70px -30px rgba(194,65,12,0.6)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
                  {p.popular && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: GRAD, borderRadius: 20, padding: '3px 9px' }}>MAIS POPULAR</span>}
                </div>
                <div style={{ margin: '12px 0 4px' }}>
                  <span style={{ fontSize: 34, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{brl(p.priceCents)}</span>
                  <span style={{ color: C.muted, fontSize: 14 }}> / mês</span>
                </div>
                <div style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>{p.credits.toLocaleString('pt-BR')} créditos por mês (≈ {Math.floor(p.credits / (info.costs?.video || 20))} vídeos)</div>
                <div style={{ display: 'grid', gap: 8, fontSize: 13.5, marginBottom: 20 }}>
                  {['App para Windows e Mac', 'Editor no navegador', 'Legendas automáticas e corte de pausas', ...(p.features?.includes('ai') ? ['Limpeza de fala por IA'] : []), ...(p.features?.includes('image') ? ['Imagens de apoio (B-roll)'] : []), ...(p.features?.includes('clips') ? ['Clipes curtos automáticos'] : [])].map((t) => (
                    <span key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="check" size={14} color={C.green} strokeWidth={2.6} /> {t}</span>
                  ))}
                </div>
                <button onClick={loggedIn ? onHome : onEnter} style={{ width: '100%', minHeight: 44, borderRadius: 12, border: p.popular ? 'none' : `1px solid ${C.borderStrong}`, background: p.popular ? GRAD : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {loggedIn ? 'Ver no painel' : 'Assinar'}
                </button>
              </div>
            ))}
          </div>
          {!info?.plans?.length && <p style={{ textAlign: 'center', color: C.faint }}>Carregando planos…</p>}
        </section>

        {/* REQUISITOS + DÚVIDAS */}
        <section style={{ maxWidth: 1120, margin: '0 auto', padding: '70px 24px 40px' }}>
          <div className="rf-dl-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 1.15fr)', gap: 36, alignItems: 'start' }}>
            <div style={glass({ padding: 24 })}>
              <h3 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Requisitos do sistema</h3>
              <div style={{ display: 'grid' }}>
                {REQS.map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 12, padding: '11px 0', borderTop: `1px solid ${C.border}`, fontSize: 14 }}>
                    <span style={{ color: C.faint, fontWeight: 700 }}>{k}</span>
                    <span style={{ color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div id="dl-faq">
              <h3 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.6 }}>Dúvidas frequentes</h3>
              {faqs(info).map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section style={{ maxWidth: 860, margin: '30px auto 50px', padding: '0 24px' }}>
          <div style={glass({ padding: '48px 28px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(255,107,53,0.14), rgba(194,65,12,0.14))' })}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 12px' }}>Seu próximo vídeo começa aqui.</h2>
            <p style={{ color: C.muted, fontSize: 16, margin: '0 0 26px' }}>Baixe o Riseframe e edite com IA no seu computador.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {!mobile && (
                <GradBtn big onClick={() => start(main)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <OsIcon os={PLATFORMS[main].os} size={19} color="#fff" /> Baixar para {PLATFORMS[main].label}
                </GradBtn>
              )}
              {!loggedIn && <GhostBtn onClick={onEnter} style={{ padding: '15px 22px' }}>Criar minha conta</GhostBtn>}
            </div>
          </div>
        </section>

        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '24px 24px 40px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
          <Logo size={22} /> <span style={{ verticalAlign: 'middle', marginLeft: 6 }}>Riseframe · Editor de vídeo com IA</span>
          <div style={{ marginTop: 10, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/" style={{ color: C.muted }}>Início</a>
            <a href="/termos" style={{ color: C.muted }}>Termos de uso</a>
            <a href="/privacidade" style={{ color: C.muted }}>Privacidade</a>
            {dl?.releasesUrl && <a href={dl.releasesUrl} target="_blank" rel="noreferrer" style={{ color: C.muted }}>Todas as versões</a>}
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes rfPlayhead { from { left: 28px; } to { left: calc(100% - 12px); } }
        .rf-dl-playhead{ animation: rfPlayhead 9s linear infinite; }
        @media (prefers-reduced-motion: reduce){ .rf-dl-playhead{ animation: none; left: 40% !important; } }
        @media (max-width: 960px){
          .rf-dl-hero{ grid-template-columns: 1fr !important; gap: 40px !important; }
          .rf-dl-row{ grid-template-columns: 1fr !important; gap: 22px !important; }
          .rf-dl-row > div{ order: initial !important; }
          .rf-dl-two{ grid-template-columns: 1fr !important; }
        }
        @media (max-width: 900px){ .rf-nav-links{ display: none !important; } }
        @media (max-width: 520px){ .rf-dl-all{ grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
