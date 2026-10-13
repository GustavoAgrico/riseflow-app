import React from 'react';
import { C } from '../theme.js';
import { captionLook, CaptionWords } from './CaptionPreview.jsx';
import { CAPTION_FONTS } from '../../../shared/captionStyle.js';

// Modelos prontos: cada um é um estilo + cor (e às vezes fundo). Um clique aplica tudo;
// os ajustes finos (fonte, animação, tamanho…) continuam valendo depois.
export const CAPTION_PRESETS = [
  { id: 'none', label: 'Sem legenda' },
  // Premium: palavra a palavra, palavra-chave grande com brilho + som de tecla a cada palavra.
  { id: 'premium', label: 'Premium ✨', patch: { captionTemplate: 'premium', captionColor: 'white', soundEffects: true } },
  { id: 'classico', label: 'Clássico', patch: { captionTemplate: 'clean', captionColor: 'white' } },
  { id: 'karaoke', label: 'Karaokê', patch: { captionTemplate: 'karaoke', captionColor: 'yellow' } },
  { id: 'marcatexto', label: 'Marca-texto', patch: { captionTemplate: 'marker', captionColor: 'purple' } },
  { id: 'caixabranca', label: 'Caixa branca', patch: { captionTemplate: 'marker', captionColor: 'white' } },
  { id: 'duaslinhas', label: 'Duas linhas', patch: { captionTemplate: 'duo', captionColor: 'green' } },
  { id: 'destaque', label: 'Destaque', patch: { captionTemplate: 'duo', captionColor: 'yellow' } },
  { id: 'impacto', label: 'Impacto', patch: { captionTemplate: 'hormozi', captionColor: 'yellow' } },
  { id: 'pop', label: 'Pop', patch: { captionTemplate: 'pop', captionColor: 'white' } },
  { id: 'minimal', label: 'Minimalista', patch: { captionTemplate: 'minimal', captionColor: 'green', captionBackground: 'clean' } },
  { id: 'neon', label: 'Neon', patch: { captionTemplate: 'neon', captionColor: 'cyan' } },
  { id: 'divertido', label: 'Divertido', patch: { captionTemplate: 'bounce', captionColor: 'yellow' } },
  { id: 'palavrachave', label: 'Palavra-chave', patch: { captionTemplate: 'keyword', captionColor: 'orange' } },
  { id: 'caixarosa', label: 'Caixa rosa', patch: { captionTemplate: 'box', captionColor: 'pink' } },
  // novos
  { id: 'tiktok', label: 'TikTok', patch: { captionTemplate: 'tiktok', captionColor: 'lime' } },
  { id: 'youtuber', label: 'YouTuber', patch: { captionTemplate: 'beast', captionColor: 'yellow' } },
  { id: 'quadrinhos', label: 'Quadrinhos', patch: { captionTemplate: 'comic', captionColor: 'gold' } },
  { id: 'vazado', label: 'Vazado', patch: { captionTemplate: 'hollow', captionColor: 'yellow' } },
  { id: 'sombra3d', label: 'Sombra 3D', patch: { captionTemplate: 'shadow3d', captionColor: 'magenta' } },
  { id: 'elegante', label: 'Elegante', patch: { captionTemplate: 'elegant', captionColor: 'gold' } },
  { id: 'caneta', label: 'Caneta', patch: { captionTemplate: 'handwritten', captionColor: 'sky' } },
  { id: 'brilho', label: 'Brilho', patch: { captionTemplate: 'karaoke', captionColor: 'cyan', captionHighlightStyle: 'glow' } },
  { id: 'sublinhado', label: 'Sublinhado', patch: { captionTemplate: 'karaoke', captionColor: 'orange', captionHighlightStyle: 'underline' } },
];

const RESET = { captionFont: 'auto', captionAnimation: 'auto', captionBackground: 'auto', captionMode: 'auto', captionHighlight: false, captionHighlightStyle: 'auto' };

/** As opções que um modelo aplica (para o `onChange` do painel). */
export function presetPatch(id) {
  const p = CAPTION_PRESETS.find((x) => x.id === id);
  if (!p) return {};
  if (!p.patch) return { captions: false, captionPreset: 'none' };
  return { captions: true, ...RESET, ...p.patch, captionPreset: id };
}

/** Qual modelo está escolhido agora (o salvo, ou o primeiro com o mesmo estilo e cor). */
export function currentPreset(options) {
  if (options.captions === false) return 'none';
  const same = (p) => p.patch && p.patch.captionTemplate === options.captionTemplate;
  const saved = CAPTION_PRESETS.find((p) => p.id === options.captionPreset && same(p));
  if (saved) return saved.id;
  return (CAPTION_PRESETS.find((p) => same(p) && p.patch.captionColor === (options.captionColor || 'white'))
    || CAPTION_PRESETS.find(same) || {}).id;
}

const SAMPLE = [{ word: 'Seu' }, { word: 'vídeo' }, { word: 'pronto' }];

/**
 * Galeria de modelos de legenda (miniaturas com o visual de cada um). `onApply(patch)`
 * recebe as opções a aplicar. `compact` = miniaturas menores (painel da timeline).
 */
export default function CaptionGallery({ options, onApply, compact = false, row = false }) {
  const sel = currentPreset(options);
  const tileH = row ? 72 : compact ? 50 : 60;
  // row = carrossel numa linha só (celular), como os modelos do CapCut
  const wrap = row
    ? { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 96, gap: 10, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }
    : { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 80 : 86}px, 1fr))`, gap: compact ? 7 : 9 };
  return (
    <div style={wrap}>
      {CAPTION_PRESETS.map((p) => {
        const on = sel === p.id;
        const opts = p.patch ? { ...options, ...RESET, ...p.patch, captionScale: 1, captions: true } : null;
        const look = opts && captionLook(opts);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(presetPatch(p.id))}
            title={p.label}
            aria-pressed={on}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', minWidth: 0, scrollSnapAlign: 'start' }}
          >
            <div style={{
              height: tileH, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #2a2f3a, #15151d)',
              border: on ? '2px solid #fff' : `1px solid ${C.border}`,
              boxShadow: on ? '0 0 0 3px rgba(255,255,255,0.12)' : 'none',
              boxSizing: 'border-box', padding: '0 4px',
            }}>
              {look ? (
                <CaptionWords words={SAMPLE} wi={1} look={look} options={opts} fontPx={row ? 12 : compact ? 10 : 11.5} still />
              ) : (
                <svg width={compact ? 24 : 28} height={compact ? 24 : 28} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>
              )}
            </div>
            <div style={{ fontSize: compact ? 10.5 : 11.5, marginTop: 5, color: on ? C.text : C.muted, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Escolha da fonte mostrando cada uma no próprio desenho (a amostra já sai na fonte).
 * `fonts` = catálogo do servidor (id/label); "auto" = a fonte do estilo.
 */
export function FontPicker({ value = 'auto', fonts = [], onChange, compact = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 96 : 112}px, 1fr))`, gap: 6, width: '100%' }}>
      {fonts.map((f) => {
        const def = CAPTION_FONTS[f.id];
        const on = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            title={f.label}
            aria-pressed={on}
            style={{
              minWidth: 0, padding: '7px 6px', borderRadius: 9, cursor: 'pointer', textAlign: 'center',
              border: on ? '2px solid #fff' : `1px solid ${C.border}`, background: on ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.25)', color: C.text,
            }}
          >
            <div style={{ fontFamily: def ? `'${def.family}', system-ui, sans-serif` : 'inherit', fontWeight: def && def.bold === false ? 400 : 800, fontSize: compact ? 15 : 17, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {def ? 'Legenda' : 'Auto'}
            </div>
            <div style={{ fontSize: 10, color: on ? C.text : C.faint, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label.replace(/ \(.*\)$/, '')}</div>
          </button>
        );
      })}
    </div>
  );
}

/** Cores da legenda: a paleta + uma cor livre (seletor de cor). */
export function ColorSwatches({ value, options = [], onChange, size = 26 }) {
  const custom = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : null;
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.label} aria-label={o.label} aria-pressed={on}
            style={{ width: size, height: size, borderRadius: '50%', cursor: 'pointer', background: o.hex, border: on ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', boxShadow: on ? `0 0 0 2px ${o.hex}, 0 0 10px ${o.hex}88` : 'none', padding: 0 }} />
        );
      })}
      <label title="Cor personalizada" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
        background: custom || 'conic-gradient(#ff4d4d, #ffd84d, #4dff88, #4dd2ff, #9b4dff, #ff4dcf, #ff4d4d)',
        border: custom ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', boxShadow: custom ? `0 0 0 2px ${custom}` : 'none' }}>
        <input type="color" value={custom || '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Cor personalizada"
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
      </label>
    </div>
  );
}
