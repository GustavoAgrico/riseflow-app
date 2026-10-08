import React from 'react';
import { C } from '../theme.js';
import { captionLook, CaptionWords } from './CaptionPreview.jsx';

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
];

const RESET = { captionFont: 'auto', captionAnimation: 'auto', captionBackground: 'auto', captionMode: 'auto', captionHighlight: false };

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
