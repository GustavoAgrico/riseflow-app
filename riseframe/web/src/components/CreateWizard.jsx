import React, { useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from './Icon.jsx';
import { Spinner } from './ui.jsx';
import Uploader from './Uploader.jsx';
import CaptionPreview from './CaptionPreview.jsx';
import CaptionGallery, { presetPatch } from './CaptionGallery.jsx';
import CostLine from './CostLine.jsx';
import { FORMATS } from '../formats.js';

const STEPS = [
  { id: 'format', label: 'Formato' },
  { id: 'upload', label: 'Vídeo' },
  { id: 'ai', label: 'Edição com IA' },
];

const HIGHLIGHT = ['premium', 'keyword', 'duo', 'karaoke', 'marker'];

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
    { id: 'clean', icon: 'mic', title: 'Limpar a fala', desc: 'Tira “é…”, gaguejos e palavras repetidas', on: options.autoClean !== false, set: (v) => ({ autoClean: v }), off: notClips },
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
    { id: 'sfx', icon: 'volume', title: 'Efeitos sonoros', desc: 'Teclas na legenda e whoosh nas transições', on: options.soundEffects === true, set: (v) => ({ soundEffects: v }), off: notClips },
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
  const caps = catalog?.capabilities || {};
  const set = (patch) => onOptions({ ...options, ...patch });

  function pickFormat(f) {
    onFormat(f.id);
    if (f.clips) {
      onMode('clips');
      set({ clipAspect: f.aspect === 'original' ? 'original' : f.aspect });
    } else {
      if (mode === 'clips') onMode('auto');
      set({ aspect: f.aspect });
    }
    setStep(1);
  }

  const tasks = aiTasks({ options, mode, caps });
  const toggle = (t) => {
    if (t.off) return;
    if (t.mode) onMode(t.mode(!t.on));
    else set(t.set(!t.on));
  };
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
                    background: on ? 'linear-gradient(180deg, rgba(255,107,53,0.16), rgba(124,58,237,0.08))' : 'rgba(255,255,255,0.035)',
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
              <div style={{ display: 'grid', gap: 8 }}>
                {recent.map((j) => (
                  <button key={j.sourceId} onClick={() => onReopen(j)} disabled={!!reopening} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.035)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', color: C.text, fontFamily: 'inherit', fontSize: 14, cursor: reopening ? 'wait' : 'pointer' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: C.panel2, display: 'grid', placeItems: 'center', color: C.orangeSoft, flexShrink: 0 }}>
                      {reopening === j.sourceId ? <Spinner size={14} color={C.orange} /> : <Icon name="clapper" size={16} strokeWidth={1.8} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                    <span style={{ fontSize: 12, color: C.faint }}>Abrir na timeline</span>
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
          <div className="rf-ai-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {tasks.map((t) => (
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
            <div className="rf-ai-side" style={{ position: 'sticky', top: 16, display: 'grid', gap: 14 }}>
              <CaptionPreview options={{ ...options, aspect: previewAspect }} videoUrl={videoUrl} />
              {options.captions !== false && (
                <div>
                  <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>ESTILO DA LEGENDA</div>
                  <CaptionGallery options={options} onApply={(p) => set(p)} compact />
                </div>
              )}
            </div>
          </div>

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
