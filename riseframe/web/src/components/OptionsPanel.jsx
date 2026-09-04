import React, { useState } from 'react';
import { C, GRAD } from '../theme.js';
import Icon from './Icon.jsx';
import CaptionPreview from './CaptionPreview.jsx';
import LayoutPreview from './LayoutPreview.jsx';

function Row({ label, hint, children }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
          {hint && <div style={{ color: C.faint, fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
        </div>
        <div style={{ flexShrink: 0 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Seção premium recolhível (agrupa funções por tema) ────────────────
function Section({ icon, title, subtitle, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: `1px solid ${open ? 'rgba(255,107,53,0.35)' : C.border}`,
        borderRadius: 16,
        background: open ? 'linear-gradient(180deg, rgba(255,107,53,0.05), rgba(255,255,255,0.015))' : 'rgba(255,255,255,0.02)',
        marginBottom: 12,
        overflow: 'hidden',
        transition: 'border-color .18s, background .18s',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontFamily: 'inherit', textAlign: 'left' }}
      >
        <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', flexShrink: 0, background: open ? GRAD : C.panel2, color: open ? '#fff' : C.muted, boxShadow: open ? '0 6px 16px -6px rgba(255,107,53,0.6)' : 'none', transition: 'all .18s' }}>
          <Icon name={icon} size={18} strokeWidth={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            {title}
            {badge && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.orangeSoft, background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 20, padding: '2px 8px' }}>{badge}</span>}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: C.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
        </div>
        <span style={{ color: C.faint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s', display: 'flex', flexShrink: 0 }}>
          <Icon name="chevron" size={17} strokeWidth={2.2} />
        </span>
      </button>
      {open && <div style={{ padding: '0 16px 8px' }}>{children}</div>}
    </div>
  );
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{ width: 48, height: 27, borderRadius: 20, border: 'none', background: on ? GRAD : 'rgba(255,255,255,0.1)', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, transition: 'background .2s', boxShadow: on ? '0 4px 12px -3px rgba(255,107,53,0.6)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 24 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', transition: 'left .2s cubic-bezier(.22,1,.36,1)', boxShadow: '0 2px 5px rgba(0,0,0,0.35)' }} />
    </button>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 11, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{ border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: 12.5, cursor: 'pointer', transition: 'all .15s ease', background: on ? GRAD : 'transparent', color: on ? '#fff' : C.muted, fontWeight: on ? 600 : 500, boxShadow: on ? '0 4px 12px -4px rgba(255,107,53,0.5)' : 'none' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: '#13131B', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, minWidth: 210, cursor: 'pointer', fontFamily: 'inherit' }}>
      {options.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
    </select>
  );
}

function Swatches({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} title={o.label} style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', background: o.hex, border: on ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', boxShadow: on ? `0 0 0 2px ${o.hex}, 0 0 10px ${o.hex}88` : 'none', transition: 'all .12s' }} />
        );
      })}
    </div>
  );
}

export default function OptionsPanel({ catalog, options, onChange, disabled, onSettings }) {
  const set = (patch) => onChange({ ...options, ...patch });
  const caps = catalog?.capabilities || {};
  const keyValid = /^[A-Za-z0-9]{20,80}$/.test((options.pexelsKey || '').trim());
  const brollUsable = caps.brollReady || keyValid;

  // resumo curto para o subtítulo de cada seção (fechada)
  const on = (b) => (b ? 'ligado' : 'desligado');
  const tplLabel = (catalog.captionTemplates?.find((t) => t.id === options.captionTemplate) || {}).label;

  return (
    <div style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      {/* ── Fala e áudio ── */}
      <Section icon="mic" title="Fala e áudio" defaultOpen subtitle={`Pausas ${on(options.cutSilence)} · fala ${on(options.autoClean !== false)} · voz ${on(options.voiceEnhance === true)}`}>
        <Row label="Cortar pausas e silêncios" hint="Remove trechos sem fala e remonta a timeline">
          <Toggle on={options.cutSilence} onChange={(v) => set({ cutSilence: v })} />
        </Row>
        {options.cutSilence && (
          <Row label="Sensibilidade do silêncio" hint={`Ruído < ${options.silenceNoiseDb} dB por ${options.silenceMinDuration}s`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 190 }}>
              <input type="range" min={-50} max={-15} value={options.silenceNoiseDb} onChange={(e) => set({ silenceNoiseDb: Number(e.target.value) })} />
              <input type="range" min={0.2} max={2} step={0.1} value={options.silenceMinDuration} onChange={(e) => set({ silenceMinDuration: Number(e.target.value) })} />
            </div>
          </Row>
        )}
        <Row label="Corrigir a fala automaticamente" hint="Remove muletas (é..., hã, hmm), gagueiras e palavras repetidas. Com a chave da Anthropic (Configurações), a IA corta também falsos começos e autocorreções.">
          <Toggle on={options.autoClean !== false} onChange={(v) => set({ autoClean: v })} />
        </Row>
        <Row label="Correção automática de voz" hint="Limpa o áudio: reduz ruído de fundo, normaliza o volume e dá mais clareza à voz">
          <Toggle on={options.voiceEnhance === true} onChange={(v) => set({ voiceEnhance: v })} />
        </Row>
        {options.voiceEnhance === true && (
          <Row label="Intensidade da limpeza" hint="Quanto ruído remover (forte pode soar artificial)">
            <Segmented value={options.voiceIntensity || 'medio'} options={catalog.motionIntensities} onChange={(v) => set({ voiceIntensity: v })} />
          </Row>
        )}
      </Section>

      {/* ── Legendas ── */}
      <Section icon="captions" title="Legendas dinâmicas" defaultOpen badge="Popular" subtitle={options.captions ? `${tplLabel || 'estilo'} · ${options.captionColor || 'branco'}` : 'desligadas'}>
        <Row label="Legendas dinâmicas" hint="Transcrição queimada no vídeo, palavra-a-palavra">
          <Toggle on={options.captions} onChange={(v) => set({ captions: v })} />
        </Row>
        {options.captions && (
          <>
            <Row label="Estilo da legenda" hint="Look + movimento das legendas">
              <Select value={options.captionTemplate} options={catalog.captionTemplates} onChange={(v) => set({ captionTemplate: v })} />
            </Row>
            <Row label="Tipografia (fonte)" hint="Fonte premium embutida — renderiza igual em qualquer máquina">
              <Select value={options.captionFont || 'auto'} options={catalog.captionFonts} onChange={(v) => set({ captionFont: v })} />
            </Row>
            {catalog.captionAnimations && (
              <Row label="Animação do texto" hint="Como cada palavra/frase entra na tela">
                <Select value={options.captionAnimation || 'auto'} options={catalog.captionAnimations} onChange={(v) => set({ captionAnimation: v })} />
              </Row>
            )}
            {catalog.captionBackgrounds && (
              <Row label="Fundo do texto" hint="Sombra, caixa, barra translúcida, brilho neon ou só contorno">
                <Select value={options.captionBackground || 'auto'} options={catalog.captionBackgrounds} onChange={(v) => set({ captionBackground: v })} />
              </Row>
            )}
            {catalog.captionPositions && (
              <Row label="Posição da legenda" hint="Onde a legenda aparece: em cima, no meio ou embaixo">
                <Select value={options.captionPosition || 'auto'} options={catalog.captionPositions} onChange={(v) => set({ captionPosition: v })} />
              </Row>
            )}
            <Row label="Cor de destaque" hint="Padrão branco">
              <Swatches value={options.captionColor} options={catalog.captionColors} onChange={(v) => set({ captionColor: v })} />
            </Row>
            <Row label="Tamanho da legenda" hint={`${Math.round((options.captionScale ?? 1) * 100)}% — palavras longas encolhem sozinhas para caber`}>
              <input type="range" min={0.6} max={1.4} step={0.05} value={options.captionScale ?? 1} onChange={(e) => set({ captionScale: Number(e.target.value) })} style={{ minWidth: 190 }} />
            </Row>
            <div style={{ padding: '4px 0 12px' }}><CaptionPreview options={options} /></div>
          </>
        )}
      </Section>

      {/* ── Movimento e cor ── */}
      <Section icon="wand" title="Movimento e cor" subtitle={`${options.colorLook === 'auto' ? 'cor automática' : 'color grade'} · zoom ${options.videoMotion && options.videoMotion !== 'none' ? 'ligado' : 'desligado'}`}>
        <Row label="Color grade cinematográfico" hint={options.colorLook === 'auto' ? 'A IA analisa o vídeo e calcula a correção + o look' : 'O diferencial de acabamento do Riseframe'}>
          <Select value={options.colorLook} options={catalog.colorLooks} onChange={(v) => set({ colorLook: v })} />
        </Row>
        <Row label="Movimento no vídeo (zoom)" hint="Efeito de câmera: aproxima, afasta ou Ken Burns ao longo do vídeo">
          <Select value={options.videoMotion || 'none'} options={catalog.videoMotions} onChange={(v) => set({ videoMotion: v })} />
        </Row>
        {options.videoMotion && options.videoMotion !== 'none' && (
          <Row label="Intensidade do movimento" hint="O quanto o zoom é perceptível">
            <Segmented value={options.motionIntensity || 'medio'} options={catalog.motionIntensities} onChange={(v) => set({ motionIntensity: v })} />
          </Row>
        )}
      </Section>

      {/* ── B-roll ── */}
      <Section icon="image" title="B-roll (imagens de apoio)" subtitle={options.broll && brollUsable ? 'ligado' : brollUsable ? 'desligado' : 'requer chave do Pexels'}>
        <Row
          label="B-roll automático (Pexels)"
          hint={caps.brollReady ? 'Insere imagens de apoio de banco gratuito (chave no servidor)' : keyValid ? 'Chave conectada — insere imagens de apoio de banco gratuito' : 'Configure sua chave gratuita do Pexels para ativar'}
        >
          <Toggle on={options.broll} onChange={(v) => set({ broll: v })} disabled={!brollUsable} />
        </Row>
        {options.broll && brollUsable && catalog.niches && (
          <Row label="Nicho do vídeo" hint="As imagens de apoio combinam com o tema (liderança, médico, mentor...)">
            <Select value={options.niche || 'auto'} options={catalog.niches} onChange={(v) => set({ niche: v })} />
          </Row>
        )}
        {options.broll && brollUsable && (
          <Row label="Layout do B-roll" hint="Tela cheia OU dividida (você numa metade, o apoio na outra). Sem vídeo, usa imagem.">
            <Segmented value={options.brollLayout || 'fullscreen'} options={catalog.brollLayouts || [{ id: 'fullscreen', label: 'Tela cheia' }, { id: 'top', label: 'Apoio em cima' }, { id: 'bottom', label: 'Apoio embaixo' }]} onChange={(v) => set({ brollLayout: v })} />
          </Row>
        )}
        {options.broll && brollUsable && (options.brollLayout === 'top' || options.brollLayout === 'bottom') && (
          <Row label="Recorte da pessoa" hint="Ajuste fino: o que manter na metade da pessoa (topo preserva o rosto)">
            <Segmented value={options.personCrop || 'center'} options={catalog.personCrops || [{ id: 'top', label: 'Topo (rosto)' }, { id: 'center', label: 'Centro' }, { id: 'bottom', label: 'Base' }]} onChange={(v) => set({ personCrop: v })} />
          </Row>
        )}
        {options.broll && brollUsable && (
          <div style={{ padding: '4px 0 12px' }}><LayoutPreview layout={options.brollLayout || 'fullscreen'} personCrop={options.personCrop || 'center'} /></div>
        )}
        {!caps.brollReady && !keyValid && (
          <Row label="Chave do Pexels" hint="Configure sua chave em Configurações para ativar o B-roll">
            <button onClick={() => onSettings?.()} style={{ background: 'transparent', border: `1px solid ${C.borderStrong || C.border}`, color: C.text, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Abrir Configurações →
            </button>
          </Row>
        )}
      </Section>

      {/* ── Formato de saída ── */}
      <Section icon="crop" title="Formato de saída" subtitle={(catalog.aspects?.find((a) => a.id === options.aspect) || {}).label || 'original'}>
        <Row label="Formato de saída" hint="Reframe automático para a plataforma">
          <Select value={options.aspect} options={catalog.aspects} onChange={(v) => set({ aspect: v })} />
        </Row>
        {options.aspect !== 'original' && (
          <Row label="Seguir o sujeito (tracking)" hint="A IA mantém o rosto/sujeito no quadro em vez de crop central">
            <Toggle on={options.reframeTrack !== false} onChange={(v) => set({ reframeTrack: v })} />
          </Row>
        )}
      </Section>
    </div>
  );
}
