import React, { useEffect, useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from './Icon.jsx';
import { Spinner } from './ui.jsx';
import Uploader from './Uploader.jsx';
import CaptionPreview from './CaptionPreview.jsx';
import CaptionGallery, { presetPatch, currentPreset, CAPTION_PRESETS } from './CaptionGallery.jsx';
import CostLine from './CostLine.jsx';
import { FORMATS } from '../formats.js';
import { listBrands, loadBrand, activeBrandId, setActiveBrand, brandOptions } from '../brandKit.js';
import { listTemplatesApi } from '../api.js';

const STEPS = [
  { id: 'format', label: 'Formato' },
  { id: 'upload', label: 'Vídeo' },
  { id: 'ai', label: 'Edição com IA' },
];

const HIGHLIGHT = ['premium', 'keyword', 'duo', 'karaoke', 'marker'];

// Agrupa as melhorias por assunto, para o cliente achar sem ler a lista inteira.
const TASK_GROUPS = [
  ['Cortes e fala', ['cut', 'clean', 'short', 'moments']],
  ['Legendas', ['captions', 'highlight']],
  ['Imagem', ['reframe', 'color', 'zoom', 'broll']],
  ['Som e destaques', ['audio', 'sfx', 'kinetic', 'vsl']],
  ['Depois de criar', ['review']],
];
// O "recomendado" liga só o essencial: corta o tempo morto, limpa a fala, legenda e corrige a cor.
const RECOMMENDED = ['cut', 'clean', 'captions', 'reframe', 'color'];

/**
 * O que a IA faz, em linguagem simples. Cada item lê/escreve as opções do vídeo (e o
 * modo: automático, timeline ou cortes). `off` = não se aplica agora (com o motivo).
 */
function aiTasks({ options, mode, caps }) {
  const isClips = mode === 'clips';
  const brollOk = caps.openverseReady || caps.brollReady || caps.googleImagesReady;
  const notClips = isClips ? 'não vale para cortes' : null;
  return [
    { id: 'cut', icon: 'scissors', title: 'Remover pausas e silêncios', desc: 'Deixa o vídeo mais dinâmico, sem tempo parado', on: options.cutSilence !== false, set: (v) => ({ cutSilence: v }), off: notClips },
    { id: 'clean', icon: 'mic', title: 'Limpar a fala', desc: 'Tira “é…”, gaguejos, frases refeitas e tosse', on: options.autoClean !== false, set: (v) => ({ autoClean: v, cutCoughs: v }), off: notClips },
    { id: 'captions', icon: 'captions', title: 'Gerar legendas', desc: 'Legendas automáticas e dinâmicas', on: options.captions !== false, set: (v) => ({ captions: v }) },
    {
      id: 'highlight', icon: 'sparkles', title: 'Destacar palavras importantes', desc: 'Realça o que realmente importa (estilo Premium)',
      on: options.captions !== false && HIGHLIGHT.includes(options.captionTemplate),
      set: (v) => (v ? presetPatch('premium') : presetPatch('classico')),
      off: options.captions === false ? 'ligue as legendas' : null,
    },
    {
      id: 'reframe', icon: 'crop', title: 'Corrigir enquadramento', desc: 'Mantém o rosto no centro no novo formato',
      on: (options.reframeMode || 'auto') === 'auto',
      set: (v) => ({ reframeMode: v ? 'auto' : 'fit' }),
      off: !isClips && (options.aspect || 'original') === 'original' ? 'formato original' : null,
    },
    { id: 'audio', icon: 'volume', title: 'Melhorar áudio', desc: 'Remove ruído e deixa a voz clara e profissional', on: options.voiceEnhance === true, set: (v) => ({ voiceEnhance: v, ...(v && !options.voiceNoise ? { voiceNoise: 'medio' } : null) }), off: notClips },
    { id: 'color', icon: 'palette', title: 'Corrigir luz e cor', desc: 'Acerta a cor e clareia vídeo escuro', on: (options.colorLook || 'auto') !== 'none', set: (v) => ({ colorLook: v ? 'auto' : 'none' }) },
    { id: 'zoom', icon: 'zap', title: 'Zoom nos momentos-chave', desc: 'Aproxima nas frases mais fortes', on: options.videoMotion === 'dynamic', set: (v) => ({ videoMotion: v ? 'dynamic' : 'none' }), off: notClips },
    { id: 'broll', icon: 'image', title: 'Imagens de apoio (B-roll)', desc: 'Ilustra o que você fala com imagens e vídeos', on: options.broll === true, set: (v) => ({ broll: v }), off: notClips || (!brollOk ? 'indisponível no servidor' : null) },
    { id: 'kinetic', icon: 'sparkles', title: 'Motion tipográfico', desc: 'Frases animadas palavra por palavra, com sons', on: options.kinetic === true, set: (v) => ({ kinetic: v, ...(v ? { vsl: false } : {}) }), off: notClips },
    {
      id: 'vsl', icon: 'film', title: 'Reel VSL (interface animada)',
      desc: 'Tela cheia com zoom ↔ tela dividida com painel de vidro, letreiros nas frases fortes e som enxuto (vertical 9:16)',
      on: options.vsl === true,
      set: (v) => ({ vsl: v, ...(v ? { aspect: '9:16', kinetic: false } : {}) }),
      off: notClips || (mode === 'editor' ? 'por enquanto só no automático' : null),
    },
    { id: 'sfx', icon: 'volume', title: 'Efeitos sonoros', desc: 'Teclas na legenda e whoosh nas transições', on: options.soundEffects === true, set: (v) => ({ soundEffects: v }), off: notClips },
    { id: 'short', icon: 'zap', title: 'Transformar em um vídeo curto', desc: 'A IA monta UM vídeo com o essencial: gancho, ideia principal e conclusão', on: Number(options.shortTarget) > 0, set: (v) => ({ shortTarget: v ? 60 : 0 }), off: notClips },
    { id: 'moments', icon: 'film', title: 'Detectar melhores momentos', desc: 'Gera vários cortes curtos com os trechos mais fortes', on: isClips, mode: (v) => (v ? 'clips' : 'auto') },
    { id: 'review', icon: 'edit', title: 'Revisar na timeline antes', desc: 'Abre o editor para você ajustar antes de finalizar', on: mode === 'editor', mode: (v) => (v ? 'editor' : 'auto'), off: isClips ? 'não vale para cortes' : null },
  ];
}

function Check({ on, disabled }) {
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center',
      background: on && !disabled ? GRAD : 'transparent', border: on && !disabled ? 'none' : `1.5px solid ${C.borderStrong}`,
      boxShadow: on && !disabled ? '0 4px 12px -4px rgba(255,107,53,0.7)' : 'none', transition: 'all .15s',
    }}>
      {on && !disabled && <Icon name="check" size={14} strokeWidth={3} color="#fff" />}
    </span>
  );
}

/** Cabeçalho com o passo atual e a barra de progresso. */
function StepHeader({ step }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: i <= step ? C.text : C.faint, fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: i < step ? C.green : i === step ? GRAD : 'rgba(255,255,255,0.06)', color: i <= step ? '#fff' : C.faint }}>
                {i < step ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className="rf-step-label">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < step ? C.green : C.border, minWidth: 16 }} />}
          </React.Fragment>
        ))}
        <span style={{ marginLeft: 8, fontSize: 12, color: C.faint, whiteSpace: 'nowrap' }}>{step + 1} de {STEPS.length}</span>
      </div>
      <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: '100%', background: GRAD, transition: 'width .3s ease' }} />
      </div>
    </div>
  );
}

const h2 = { fontSize: 'clamp(24px, 3.4vw, 32px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.8, margin: '0 0 6px' };
const lead = { color: C.muted, fontSize: 15, margin: '0 0 22px', lineHeight: 1.55 };

function NavButtons({ onBack, onNext, nextLabel = 'Próximo', nextDisabled, nextIcon = 'arrowRight', big }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 26 }}>
      {onBack ? (
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 4px' }}>
          <Icon name="arrowLeft" size={16} strokeWidth={2} /> Voltar
        </button>
      ) : <span />}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 9, border: 'none', borderRadius: 13, fontFamily: 'inherit', fontWeight: 700,
          padding: big ? '16px 30px' : '13px 24px', fontSize: big ? 16 : 14.5,
          background: nextDisabled ? 'rgba(255,255,255,0.08)' : GRAD, color: nextDisabled ? C.faint : '#fff',
          cursor: nextDisabled ? 'not-allowed' : 'pointer', boxShadow: nextDisabled ? 'none' : '0 12px 28px -10px rgba(255,107,53,0.65)',
        }}
      >
        {nextLabel} <Icon name={nextIcon} size={17} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/**
 * Criar vídeo em 3 passos (como um onboarding): 1) o que você quer criar (formato),
 * 2) envie o vídeo, 3) o que a IA deve fazer — com prévia ao vivo e ajustes avançados.
 */
export default function CreateWizard({
  catalog, options, onOptions, mode, onMode, file, onFile, videoUrl,
  formatId, onFormat, onStart, onExample, loadingExample, recent, onReopen, reopening, reopenError, renderAdvanced,
}) {
  const [step, setStep] = useState(formatId ? 1 : 0);
  const [advanced, setAdvanced] = useState(false);
  const [styleOpen, setStyleOpen] = useState(true);
  // Modelo salvo (Modelos da conta) aplicado ANTES da edição: o editor abre com ele.
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  useEffect(() => { listTemplatesApi().then((t) => setTemplates(t)).catch(() => setTemplates([])); }, []);
  function pickTemplate(id) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    // legenda e cor do modelo entram nas opções do vídeo: a prévia e o render usam essas opções
    const capPatch = Object.fromEntries(Object.entries(t?.data?.cap || {}).filter(([k]) => k === 'captions' || k.startsWith('caption')));
    const lookPatch = {
      ...(t?.data?.colorLook !== undefined ? { colorLook: t.data.colorLook } : null),
      ...(t?.data?.colorAdj ? { colorAdjust: t.data.colorAdj } : null),
    };
    if (t?.data) set({ ...capPatch, ...lookPatch });
    try {
      if (t?.data) sessionStorage.setItem('rf_carry_style', JSON.stringify(t.data));
      else sessionStorage.removeItem('rf_carry_style');
    } catch { /* sem armazenamento: começa do padrão */ }
  }
  // Marca (cliente) deste vídeo: a ativa do Brand Kit, outra, ou nenhuma.
  const [brands] = useState(() => listBrands().filter((b) => b.name || b.logo || b.preset));
  const [brandSel, setBrandSel] = useState(() => (options.brandOff ? '' : activeBrandId()));
  function chooseBrand(id) {
    setBrandSel(id);
    // tira os ajustes de legenda da marca anterior (volta ao padrão) e aplica os da nova
    const base = Object.fromEntries(Object.entries(catalog?.defaults || {}).filter(([k]) => k.startsWith('caption')));
    if (!id) return set({ ...base, captionPreset: undefined, brandOff: true });
    setActiveBrand(id);
    set({ ...base, captionPreset: undefined, ...brandOptions({ ...loadBrand(id), enabled: true }), brandOff: false });
  }
  const caps = catalog?.capabilities || {};
  const set = (patch) => onOptions({ ...options, ...patch });

  function pickFormat(f) {
    onFormat(f.id);
    if (f.clips) {
      onMode('clips');
      set({ clipAspect: f.aspect === 'original' ? 'original' : f.aspect, shortTarget: 0 });
    } else {
      if (mode === 'clips') onMode('auto');
      // longo → curto: um vídeo só com o essencial (60 s por padrão)
      set({ aspect: f.aspect, shortTarget: f.short ? Number(options.shortTarget) || 60 : 0 });
    }
    setStep(1);
  }

  const tasks = aiTasks({ options, mode, caps });
  // Zoom e enquadramento (antes do editor): automático no rosto, ou o ponto que eu escolher.
  const framingManual = Number.isFinite(Number(options.personFocusX));
  const zoomVal = Math.min(2.5, Math.max(1, Number(options.personZoom) || 1));
  const setZoom = (z) => set({ personZoom: +Math.min(2.5, Math.max(1, z)).toFixed(2) });
  const toggle = (t) => {
    if (t.off) return;
    if (t.mode) onMode(t.mode(!t.on));
    else set(t.set(!t.on));
  };
  const activeCount = tasks.filter((t) => t.on && !t.off).length;
  const selectableCount = tasks.filter((t) => !t.off).length;
  const styleName = CAPTION_PRESETS.find((p) => p.id === currentPreset(options))?.label || 'Personalizado';
  // Liga o recomendado e desliga o resto (exceto os de modo, que o cliente escolhe à parte).
  function applyRecommended() {
    let patch = {};
    for (const t of tasks) {
      if (!t.set || t.off || t.id === 'highlight') continue;
      patch = { ...patch, ...t.set(RECOMMENDED.includes(t.id)) };
    }
    set(patch);
  }
  const previewAspect = mode === 'clips' ? options.clipAspect || '9:16' : options.aspect || 'original';
  const ctaLabel = mode === 'clips' ? 'Gerar meus cortes' : mode === 'editor' ? 'Abrir no editor' : 'Criar meu vídeo';

  return (
    <div className="rf-wizard" style={{ ...glass({ padding: 'clamp(18px, 3vw, 30px)' }) }}>
      <StepHeader step={step} />

      {step === 0 && (
        <div className="rf-anim">
          <h2 style={h2}>O que você quer criar?</h2>
          <p style={lead}>Escolha o formato do seu vídeo para uma edição sob medida.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {FORMATS.map((f) => {
              const on = formatId === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => pickFormat(f)}
                  className="rf-lift"
                  style={{
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.text, borderRadius: 16, padding: '18px 16px 16px',
                    background: on ? 'linear-gradient(180deg, rgba(255,107,53,0.16), rgba(194,65,12,0.08))' : 'rgba(255,255,255,0.035)',
                    border: `1px solid ${on ? 'transparent' : C.border}`, boxShadow: on ? `0 0 0 1.5px ${C.orange}` : 'none',
                  }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${f.tint}1c`, border: `1px solid ${f.tint}40`, color: f.tint, marginBottom: 14 }}>
                    <Icon name={f.icon} size={21} strokeWidth={1.9} />
                  </span>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>{f.sub}</div>
                </button>
              );
            })}
          </div>
          <NavButtons onNext={() => setStep(1)} nextDisabled={!formatId} />
        </div>
      )}

      {step === 1 && (
        <div className="rf-anim">
          <h2 style={h2}>Envie seu vídeo</h2>
          <p style={lead}>Arraste o arquivo ou selecione no seu computador ou celular. Qualquer tamanho.</p>
          <Uploader file={file} onFile={onFile} />
          {!file && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button onClick={onExample} disabled={loadingExample} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: loadingExample ? 'wait' : 'pointer', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 20, padding: '8px 16px', fontSize: 13, fontFamily: 'inherit' }}>
                {loadingExample ? <Spinner size={13} color={C.orange} /> : <Icon name="sparkles" size={14} color={C.orangeSoft} />}
                {loadingExample ? 'Carregando exemplo…' : 'Experimentar com um vídeo de exemplo'}
              </button>
            </div>
          )}
          {recent?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>OU CONTINUE UM VÍDEO RECENTE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                {recent.map((j) => (
                  <button key={j.sourceId} onClick={() => onReopen(j)} disabled={!!reopening} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.035)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', color: C.text, fontFamily: 'inherit', fontSize: 14, cursor: reopening ? 'wait' : 'pointer' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: C.panel2, display: 'grid', placeItems: 'center', color: C.orangeSoft, flexShrink: 0 }}>
                      {reopening === j.sourceId ? <Spinner size={14} color={C.orange} /> : <Icon name="clapper" size={16} strokeWidth={1.8} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                    <span className="rf-hide-xs" style={{ fontSize: 12, color: C.faint, flexShrink: 0, whiteSpace: 'nowrap' }}>Abrir na timeline</span>
                  </button>
                ))}
              </div>
              {reopenError && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8 }}>{reopenError}</div>}
            </div>
          )}
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!file} />
        </div>
      )}

      {step === 2 && (
        <div className="rf-anim">
          <h2 style={h2}>O que você quer que a IA faça?</h2>
          <p style={lead}>Escolha as melhorias. Dá para ajustar cada detalhe em “Ajustes avançados”.</p>
          {templates.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.muted }}>Usar um modelo salvo:</span>
              <select value={templateId} onChange={(e) => pickTemplate(e.target.value)} aria-label="Modelo salvo"
                style={{ height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: '#0E0E14', color: C.text, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', minWidth: 200 }}>
                <option value="">Nenhum (começar do padrão)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (padrão)' : ''}</option>)}
              </select>
              <span style={{ fontSize: 12, color: C.faint }}>Legenda, cor, efeitos e marca já entram no vídeo novo.</span>
            </div>
          )}
          <div className="rf-ai-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.muted }}><b style={{ color: C.text }}>{activeCount}</b> de {selectableCount} melhorias ativas</span>
                <button type="button" onClick={applyRecommended} style={{ border: `1px solid ${C.border}`, background: 'transparent', color: C.text, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✨ Usar o recomendado
                </button>
              </div>
              {TASK_GROUPS.map(([groupName, ids]) => {
                const list = tasks.filter((t) => ids.includes(t.id));
                if (!list.length) return null;
                return (
                  <div key={groupName} style={{ display: 'grid', gap: 7 }}>
                    <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '0 2px' }}>{groupName}</div>
                    {list.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => toggle(t)}
                        disabled={!!t.off}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', fontFamily: 'inherit', color: C.text,
                          padding: '12px 14px', borderRadius: 13, cursor: t.off ? 'not-allowed' : 'pointer', opacity: t.off ? 0.5 : 1,
                          background: t.on && !t.off ? 'rgba(255,107,53,0.07)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${t.on && !t.off ? 'rgba(255,107,53,0.32)' : C.border}`, transition: 'all .15s',
                        }}
                      >
                        <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)', color: t.on && !t.off ? C.orangeSoft : C.muted, flexShrink: 0 }}>
                          <Icon name={t.icon} size={18} strokeWidth={1.9} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 650, fontSize: 14 }}>{t.title}</span>
                          <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 2 }}>{t.off || t.desc}</span>
                        </span>
                        <Check on={t.on} disabled={!!t.off} />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="rf-ai-side" style={{ position: 'sticky', top: 16, display: 'grid', gap: 14 }}>
              <CaptionPreview options={{ ...options, aspect: previewAspect }} videoUrl={videoUrl}
                onFocus={framingManual && mode !== 'clips' ? (x, y) => set({ personFocusX: x, personFocusY: y }) : null} />
              {options.captions !== false && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <button type="button" onClick={() => setStyleOpen((o) => !o)} aria-expanded={styleOpen}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.text, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8 }}>ESTILO DA LEGENDA</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700 }}>
                      {styleName}
                      <span style={{ fontSize: 12, color: C.orangeSoft, fontWeight: 600 }}>{styleOpen ? 'fechar' : 'trocar'}</span>
                    </span>
                  </button>
                  {styleOpen && <CaptionGallery options={options} onApply={(p) => set(p)} compact />}
                </div>
              )}
            </div>
          </div>

          {mode !== 'clips' && (
            <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>ENQUADRAMENTO E ZOOM</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10, lineHeight: 1.45 }}>Aproxime e posicione você no quadro — vale para o vídeo inteiro.</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[[false, 'Automático (rosto)'], [true, 'Ajustar eu mesmo']].map(([manual, label]) => {
                  const on = framingManual === manual;
                  return (
                    <button key={label} type="button"
                      onClick={() => (manual ? set({ personFocusX: Number.isFinite(Number(options.personFocusX)) ? options.personFocusX : 0.5, personFocusY: Number.isFinite(Number(options.personFocusY)) ? options.personFocusY : 0.4 }) : set({ personFocusX: undefined, personFocusY: undefined }))}
                      style={{ flex: 1, border: on ? `1.5px solid ${C.orange}` : `1px solid ${C.border}`, borderRadius: 10, padding: '9px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        background: on ? 'rgba(255,107,53,0.14)' : 'rgba(255,255,255,0.03)', color: on ? C.orangeSoft || C.orange : C.muted }}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: C.muted, width: 40 }}>Zoom</span>
                <button type="button" onClick={() => setZoom(zoomVal - 0.05)} aria-label="Menos zoom" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.25)', color: C.text, cursor: 'pointer', fontSize: 16 }}>−</button>
                <input type="range" min="1" max="2.5" step="0.05" value={zoomVal} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1 }} aria-label="Zoom" />
                <button type="button" onClick={() => setZoom(zoomVal + 0.05)} aria-label="Mais zoom" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.25)', color: C.text, cursor: 'pointer', fontSize: 16 }}>+</button>
                <span style={{ fontSize: 13, color: C.text, width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{zoomVal.toFixed(2)}×</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
                {framingManual
                  ? <>Arraste o vídeo na <b>prévia</b> para posicionar o rosto (a linha azul aparece quando fica centralizado).</>
                  : <>Com zoom, a IA aproxima no seu rosto. Para escolher o ponto, use <b>Ajustar eu mesmo</b>.</>}
              </div>
            </div>
          )}

          {brands.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>MARCA DESTE VÍDEO</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[...brands, { id: '', name: 'Sem marca' }].map((x) => {
                  const on = brandSel === x.id;
                  return (
                    <button key={x.id || 'none'} type="button" onClick={() => chooseBrand(x.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: on ? '2px solid #fff' : `1px solid ${C.border}`, borderRadius: 999, padding: '6px 14px 6px 8px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                        background: on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: on ? C.text : C.muted, fontWeight: on ? 700 : 500 }}>
                      {x.logo ? <img src={x.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 800 }}>{x.id ? (x.name || '?').slice(0, 1).toUpperCase() : '–'}</span>}
                      {x.name || 'Sem nome'}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>A legenda, as cores, a fonte e o logo da marca entram neste vídeo. Cadastre outras marcas no <b>Brand Kit</b>.</div>
            </div>
          )}

          {mode !== 'clips' && Number(options.shortTarget) > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>DURAÇÃO DO VÍDEO CURTO</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[30, 45, 60, 90, 120].map((s) => {
                  const on = Number(options.shortTarget) === s;
                  return (
                    <button key={s} type="button" onClick={() => set({ shortTarget: s })}
                      style={{ border: on ? '2px solid #fff' : `1px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                        background: on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: on ? C.text : C.muted, fontWeight: on ? 700 : 500 }}>
                      {s < 60 ? `${s} s` : s === 60 ? '1 min' : s === 90 ? '1 min 30' : '2 min'}
                    </button>
                  );
                })}
              </div>
              {catalog?.clipGoals && (
                <>
                  <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, margin: '14px 0 8px' }}>OBJETIVO DO VÍDEO</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {catalog.clipGoals.map((g) => {
                      const on = (options.clipGoal || 'auto') === g.id;
                      return (
                        <button key={g.id} type="button" onClick={() => set({ clipGoal: g.id })} title={g.label}
                          style={{ border: on ? '2px solid #fff' : `1px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                            background: on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: on ? C.text : C.muted, fontWeight: on ? 700 : 500 }}>
                          {g.label.replace(/ \(.*\)$/, '')}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
                A IA lê o vídeo inteiro e monta um único vídeo curto que conta a ideia do começo ao fim — abre com um gancho, pula apresentação, repetições e enrolação, e fecha com a conclusão.
                {mode !== 'editor' && <> Dica: ligue <b>Revisar na timeline antes</b> para ver o que ficou (o resto aparece riscado) e devolver qualquer trecho.</>}
              </div>
            </div>
          )}

          {mode === 'clips' && catalog?.clipGoals && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>OBJETIVO DOS CORTES</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {catalog.clipGoals.map((g) => {
                  const on = (options.clipGoal || 'auto') === g.id;
                  return (
                    <button key={g.id} type="button" onClick={() => set({ clipGoal: g.id })} title={g.label}
                      style={{ border: on ? '2px solid #fff' : `1px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                        background: on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: on ? C.text : C.muted, fontWeight: on ? 700 : 500 }}>
                      {g.label.replace(/ \(.*\)$/, '')}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>{(catalog.clipGoals.find((g) => g.id === (options.clipGoal || 'auto')) || {}).label}. Cada corte vem com nota e o motivo da escolha.</div>
            </div>
          )}

          <button onClick={() => setAdvanced((a) => !a)} style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: `1px solid ${C.border}`, color: C.text, borderRadius: 11, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name="gear" size={16} strokeWidth={1.9} /> Ajustes avançados
            <span style={{ display: 'inline-flex', transform: advanced ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}><Icon name="chevron" size={14} strokeWidth={2.4} /></span>
          </button>
          {advanced && (
            <div style={{ marginTop: 12, padding: '4px 18px 14px', borderRadius: 14, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.18)' }}>
              {renderAdvanced()}
            </div>
          )}

          <CostLine mode={mode === 'clips' ? 'clips' : mode === 'editor' ? 'transcribe' : 'auto'} options={options} style={{ marginTop: 18, marginBottom: 0 }} />
          <NavButtons onBack={() => setStep(1)} onNext={onStart} nextDisabled={!file} nextLabel={ctaLabel} nextIcon={mode === 'editor' ? 'edit' : 'sparkles'} big />
        </div>
      )}

      <style>{`
        .rf-lift{ transition: transform .16s ease, border-color .16s, box-shadow .16s; }
        .rf-lift:hover{ transform: translateY(-3px); border-color: ${C.borderStrong} !important; }
        @media (max-width: 860px){
          .rf-ai-grid{ grid-template-columns: 1fr !important; }
          .rf-ai-side{ position: static !important; order: -1; }
        }
        @media (max-width: 560px){ .rf-step-label{ display: none; } }
      `}</style>
    </div>
  );
}
