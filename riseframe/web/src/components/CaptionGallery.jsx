import React, { useRef, useState } from 'react';
import { useCustomFonts } from '../customFonts.js';
import { ColorPickerDialog, EyeDropperIcon, canPickFromScreen, pickFromScreen } from './ColorPicker.jsx';
import { C } from '../theme.js';
import { captionLook, CaptionWords } from './CaptionPreview.jsx';
import { CAPTION_FONTS, CAPTION_TEMPLATES, fontStyles } from '../../../shared/captionStyle.js';

// Modelos prontos: cada um é um estilo + cor (e às vezes fundo). Um clique aplica tudo;
// os ajustes finos (fonte, animação, tamanho…) continuam valendo depois.
export const CAPTION_PRESETS = [
  { id: 'none', label: 'Sem legenda' },
  // Prontos para cada tipo de perfil (o que costuma funcionar para cada público)
  { id: 'especialista', label: 'Especialista', group: 'perfil', patch: { captionTemplate: 'clean', captionColor: 'sky', captionFont: 'montserrat', captionHighlight: true, captionHighlightStyle: 'color' } },
  { id: 'podcast', label: 'Podcast', group: 'perfil', patch: { captionTemplate: 'karaoke', captionColor: 'yellow', captionFont: 'archivo' } },
  { id: 'empresa', label: 'Empresa', group: 'perfil', patch: { captionTemplate: 'minimal', captionColor: 'blue', captionFont: 'inter', captionBackground: 'clean' } },
  { id: 'criador', label: 'Criador', group: 'perfil', patch: { captionTemplate: 'tiktok', captionColor: 'lime', captionFont: 'montserrat' } },
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

const RESET = { captionFont: 'auto', captionFontStyle: '', captionItalic: false, captionUnderline: false, captionCase: 'auto', captionAnimation: 'auto', captionBackground: 'auto', captionMode: 'auto', captionHighlight: false, captionHighlightStyle: 'auto' };

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
  const custom = useCustomFonts();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cell = (on) => ({
    minWidth: 0, padding: '7px 6px', borderRadius: 9, cursor: 'pointer', textAlign: 'center',
    border: on ? '2px solid #fff' : `1px solid ${C.border}`, background: on ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.25)', color: C.text, position: 'relative',
  });
  const grid = { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 96 : 112}px, 1fr))`, gap: 6, width: '100%' };
  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      const r = await custom.upload(f);
      onChange(`custom:${r.id}`);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: 'grid', gap: 8, width: '100%' }}>
      <div style={grid}>
        {fonts.map((f) => {
          const def = CAPTION_FONTS[f.id];
          const on = value === f.id;
          return (
            <button key={f.id} type="button" onClick={() => onChange(f.id)} title={f.label} aria-pressed={on} style={cell(on)}>
              <div style={{ fontFamily: def ? `'${def.family}', system-ui, sans-serif` : 'inherit', fontWeight: def && def.bold === false ? 400 : 800, fontSize: compact ? 15 : 17, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {def ? 'Legenda' : 'Auto'}
              </div>
              <div style={{ fontSize: 10, color: on ? C.text : C.faint, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label.replace(/ \(.*\)$/, '')}</div>
            </button>
          );
        })}
      </div>
      {/* Minhas fontes: o usuário envia a fonte que tem licença (ex.: Coolvetica) */}
      <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: 0.6, marginTop: 2 }}>MINHAS FONTES</div>
      <div style={grid}>
        {custom.fonts.map((f) => {
          const id = `custom:${f.id}`;
          const on = value === id;
          return (
            <button key={f.id} type="button" onClick={() => onChange(id)} title={f.name} aria-pressed={on} style={cell(on)}>
              <div style={{ fontFamily: `'${f.family}', system-ui, sans-serif`, fontWeight: 400, fontSize: compact ? 15 : 17, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Legenda</div>
              <div style={{ fontSize: 10, color: on ? C.text : C.faint, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <span role="button" tabIndex={0} title="Apagar esta fonte"
                onClick={(e) => { e.stopPropagation(); if (window.confirm(`Apagar a fonte “${f.name}”?`)) { custom.remove(f.id).catch(() => {}); if (on) onChange('auto'); } }}
                style={{ position: 'absolute', top: 2, right: 4, fontSize: 11, color: C.faint, cursor: 'pointer' }}>×</span>
            </button>
          );
        })}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Envie o arquivo .ttf, .otf ou .woff de uma fonte que você tem licença para usar"
          style={{ ...cell(false), border: `1px dashed ${C.borderStrong || C.border}`, color: C.muted, cursor: busy ? 'wait' : 'pointer' }}>
          <div style={{ fontSize: compact ? 15 : 17, lineHeight: 1.15 }}>+</div>
          <div style={{ fontSize: 10, marginTop: 3 }}>{busy ? 'Enviando…' : 'Enviar fonte'}</div>
        </button>
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff" onChange={pick} style={{ display: 'none' }} />
      </div>
      {err && <div style={{ fontSize: 11.5, color: C.red }}>{err}</div>}
    </div>
  );
}

/** Cores da legenda: a paleta + uma cor livre (seletor de cor). */
export function ColorSwatches({ value, options = [], onChange, size = 26 }) {
  const custom = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : null;
  const [picking, setPicking] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.label} aria-label={o.label} aria-pressed={on}
            style={{ width: size, height: size, borderRadius: '50%', cursor: 'pointer', background: o.hex, border: on ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', boxShadow: on ? `0 0 0 2px ${o.hex}, 0 0 10px ${o.hex}88` : 'none', padding: 0 }} />
        );
      })}
      <button type="button" title="Qualquer cor (seletor completo)" aria-label="Cor personalizada" onClick={() => setPicking(true)}
        style={{ width: size, height: size, borderRadius: '50%', cursor: 'pointer', flexShrink: 0, padding: 0,
          background: custom || 'conic-gradient(#ff4d4d, #ffd84d, #4dff88, #4dd2ff, #9b4dff, #ff4dcf, #ff4d4d)',
          border: custom ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', boxShadow: custom ? `0 0 0 2px ${custom}` : 'none' }} />
      {canPickFromScreen() && (
        <button type="button" title="Conta-gotas: pegar uma cor da tela" onClick={async () => { const h = await pickFromScreen(); if (h) onChange(h); }}
          style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: C.text, cursor: 'pointer', padding: 0 }}>
          <EyeDropperIcon size={Math.round(size * 0.5)} />
        </button>
      )}
      {picking && <ColorPickerDialog value={custom || (options.find((o) => o.id === value)?.hex) || '#FFFFFF'} title="Cor da legenda" onChange={onChange} onClose={() => setPicking(false)} />}
    </div>
  );
}

/**
 * Estilo do texto (como o painel de texto do Premiere): os estilos da fonte escolhida
 * (Regular, Itálico, Negrito, Black… — cada um mostrado na própria letra) e os botões de
 * itálico, sublinhado e maiúsculas/minúsculas. `options` usa as chaves da legenda
 * (captionFont, captionFontStyle, captionItalic, captionUnderline, captionCase).
 */
export function TextStyleBar({ options, onChange, compact = false }) {
  const tpl = CAPTION_TEMPLATES[options.captionTemplate] || CAPTION_TEMPLATES.clean;
  const fontId = options.captionFont && options.captionFont !== 'auto' ? options.captionFont : tpl.defaultFont;
  const styles = fontStyles(fontId);
  const cur = styles.find((x) => x.id === (options.captionFontStyle || '')) || styles[0];
  const caseMode = options.captionCase || 'auto';
  const tbtn = (on, extra = {}) => ({
    minWidth: 36, height: 32, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: '0 9px',
    border: on ? '2px solid #fff' : `1px solid ${C.border}`, background: on ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.25)', color: C.text, ...extra,
  });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {styles.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 92 : 104}px, 1fr))`, gap: 6 }}>
          {styles.map((st) => {
            const on = st.id === cur?.id;
            return (
              <button key={st.id || 'padrao'} type="button" onClick={() => onChange({ captionFontStyle: st.id })} aria-pressed={on} title={st.label}
                style={{ minWidth: 0, padding: '6px 6px', borderRadius: 9, cursor: 'pointer', textAlign: 'center', border: on ? '2px solid #fff' : `1px solid ${C.border}`, background: on ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.25)', color: C.text }}>
                <div style={{ fontFamily: `'${st.family}', system-ui, sans-serif`, fontWeight: st.isDefault ? 800 : 400, fontSize: compact ? 16 : 18, lineHeight: 1.1 }}>Aa</div>
                <div style={{ fontSize: 10, color: on ? C.text : C.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</div>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" title={cur?.italic ? 'Este estilo já é itálico' : 'Itálico'} disabled={cur?.italic}
          onClick={() => onChange({ captionItalic: !options.captionItalic })}
          style={tbtn(options.captionItalic === true || cur?.italic, { fontStyle: 'italic', fontFamily: 'Georgia, serif', fontWeight: 700, opacity: cur?.italic ? 0.6 : 1 })}>I</button>
        <button type="button" title="Sublinhado" onClick={() => onChange({ captionUnderline: !options.captionUnderline })}
          style={tbtn(options.captionUnderline === true, { textDecoration: 'underline', fontWeight: 700 })}>U</button>
        <span style={{ width: 1, height: 22, background: C.border, margin: '0 2px' }} />
        {[['auto', 'Do estilo', 'Estilo'], ['upper', 'TUDO MAIÚSCULO', 'AA'], ['normal', 'Normal (como foi falado)', 'Aa'], ['lower', 'tudo minúsculo', 'aa']].map(([id, title, label]) => (
          <button key={id} type="button" title={title} onClick={() => onChange({ captionCase: id })} style={tbtn(caseMode === id, { fontWeight: 700, fontSize: id === 'auto' ? 11.5 : 13 })}>{label}</button>
        ))}
      </div>
    </div>
  );
}
