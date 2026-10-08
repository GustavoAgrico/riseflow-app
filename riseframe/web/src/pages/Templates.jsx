import React, { useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from '../components/Icon.jsx';
import { captionLook, CaptionWords } from '../components/CaptionPreview.jsx';
import { presetPatch, CAPTION_PRESETS } from '../components/CaptionGallery.jsx';
import { NICHE_CATEGORIES, TEMPLATES } from '../templates.js';

const TINTS = ['#FF6B35', '#9F67FF', '#22D3EE', '#2ED47A', '#FFB020', '#FF5CA8'];

/** Miniatura 9:16 do template: "pessoa" + a legenda no estilo do template. */
export function Thumb({ t, i }) {
  const opts = { captions: true, ...presetPatch(t.preset) };
  const look = captionLook(opts);
  const words = t.title.split(' ').map((word) => ({ word }));
  const tint = TINTS[i % TINTS.length];
  return (
    <div style={{ position: 'relative', aspectRatio: '9 / 14', borderRadius: 14, overflow: 'hidden', background: `radial-gradient(circle at 50% 30%, ${tint}38, transparent 55%), linear-gradient(170deg, #23263a, #0d0d16 70%)` }}>
      {/* silhueta */}
      <div style={{ position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', textAlign: 'center', opacity: 0.85 }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', margin: '0 auto' }} />
        <div style={{ width: 112, height: 70, borderRadius: '56px 56px 0 0', background: 'rgba(255,255,255,0.12)', marginTop: 7 }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '14%', display: 'flex', justifyContent: 'center', padding: '0 8px' }}>
        <CaptionWords words={words} wi={Math.max(0, words.length - 1)} look={look} options={opts} fontPx={15} still />
      </div>
      <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 7, padding: '3px 7px' }}>
        {(CAPTION_PRESETS.find((p) => p.id === t.preset) || {}).label}
      </span>
    </div>
  );
}

export default function Templates({ onUse, onNewVideo }) {
  const [cat, setCat] = useState('todos');
  const shown = cat === 'todos' ? TEMPLATES : TEMPLATES.filter((t) => t.cat === cat);
  return (
    <div className="rf-page" style={{ maxWidth: 1180, margin: 0, padding: '36px 32px 90px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 4px' }}>Templates</h1>
          <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Escolha o nicho do seu conteúdo e comece com um estilo pronto. Tudo pode ser ajustado depois.</p>
        </div>
        <button onClick={onNewVideo} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Começar do zero
        </button>
      </div>

      <div className="rf-tpl-grid" style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
        <div className="rf-tpl-cats" style={{ ...glass({ padding: 8 }), display: 'grid', gap: 2, position: 'sticky', top: 16 }}>
          {NICHE_CATEGORIES.map((c) => {
            const on = cat === c.id;
            return (
              <button key={c.id} onClick={() => setCat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', background: on ? 'rgba(255,107,53,0.12)' : 'transparent', color: on ? C.text : C.muted }}>
                <Icon name={c.icon} size={16} strokeWidth={1.9} color={on ? C.orangeSoft : 'currentColor'} /> {c.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
          {shown.map((t, i) => (
            <div key={t.id} className="rf-tpl" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Thumb t={t} i={i} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.desc}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{NICHE_CATEGORIES.find((c) => c.id === t.cat)?.label}{t.format === 'cortes' ? ' · cortes curtos' : ''}</div>
              </div>
              <button onClick={() => onUse(t)} style={{ minHeight: 38, borderRadius: 11, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                Usar template <Icon name="arrowRight" size={15} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .rf-tpl{ transition: transform .16s ease; }
        .rf-tpl:hover{ transform: translateY(-3px); }
        @media (max-width: 820px){
          .rf-tpl-grid{ grid-template-columns: 1fr !important; }
          .rf-tpl-cats{ position: static !important; display: flex !important; overflow-x: auto; }
        }
      `}</style>
    </div>
  );
}
