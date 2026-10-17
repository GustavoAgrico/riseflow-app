import React, { useEffect, useRef, useState } from 'react';
import { C, GRAD, glass, FONT_DISPLAY } from '../theme.js';
import Icon from '../components/Icon.jsx';
import CaptionGallery, { ColorSwatches } from '../components/CaptionGallery.jsx';
import { CaptionOverlay, SAMPLE_SEGS, SAMPLE_DUR } from '../components/CaptionPreview.jsx';
import { loadBrand, saveBrand, brandOptions, listBrands, setActiveBrand, createBrand, deleteBrand } from '../brandKit.js';
import { CAPTION_FONT_LIST, CAPTION_COLOR_LIST, HIGHLIGHT_STYLES } from '../../../shared/captionStyle.js';

const FONTS = [{ id: '', label: 'Do estilo escolhido' }, ...CAPTION_FONT_LIST.map((f) => ({ id: f.id, label: f.label }))];
const HIGHLIGHTS = [{ id: '', label: 'Do estilo' }, ...HIGHLIGHT_STYLES];
const POSITIONS = [{ id: '', label: 'Do estilo' }, { id: 'top', label: 'Em cima' }, { id: 'center', label: 'No meio' }, { id: 'bottom', label: 'Embaixo' }];
const CORNERS = [{ id: 'tl', label: '↖' }, { id: 'tr', label: '↗' }, { id: 'bl', label: '↙' }, { id: 'br', label: '↘' }];

/** Reduz o logo (máx. 512 px) e devolve um PNG em data URL — leve para guardar no navegador. */
function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 512 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      resolve(cv.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('não foi possível ler a imagem'));
    img.src = URL.createObjectURL(file);
  });
}

function Card({ title, hint, children }) {
  return (
    <div style={{ ...glass({ padding: 18 }) }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: C.muted, margin: '3px 0 12px', lineHeight: 1.45 }}>{hint}</div>}
      {!hint && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}

const seg = (on) => ({ border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: on ? GRAD : 'rgba(255,255,255,0.05)', color: on ? '#fff' : C.muted });

export default function BrandKit({ onNewVideo }) {
  const [b, setB] = useState(() => loadBrand());
  const [brands, setBrands] = useState(listBrands);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const set = (patch) => setB((x) => ({ ...x, ...patch }));
  useEffect(() => {
    setMsg(saveBrand(b) ? 'Salvo neste navegador' : 'Não deu para salvar (o logo é grande demais?)');
    setBrands(listBrands());
  }, [b]);
  function pickBrand(id) {
    setActiveBrand(id);
    setB(loadBrand(id));
  }
  function newBrand(copy) {
    const nb = createBrand(copy ? b : null);
    if (nb) setB(loadBrand(nb.id));
    else setMsg('Não deu para criar (armazenamento cheio — use logos menores)');
  }
  function removeBrand() {
    if (!window.confirm(`Excluir a marca “${b.name || 'sem nome'}”?`)) return;
    deleteBrand(b.id);
    setB(loadBrand());
  }

  async function pickLogo(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      set({ logo: await shrinkLogo(f), watermark: true });
    } catch (err) {
      setMsg(err.message);
    }
  }

  // Prévia: as opções que o Brand Kit aplica + a legenda de exemplo animada.
  const opts = { captions: true, captionTemplate: 'clean', ...brandOptions({ ...b, enabled: true }) };
  const t0 = useRef(performance.now());
  const clock = () => ((performance.now() - t0.current) / 1000) % SAMPLE_DUR;
  const pw = 230;
  const ph = Math.round((pw * 16) / 9);
  const logoW = Math.round(pw * b.logoSize);
  const m = Math.round(pw * 0.035);
  const corner = { tl: { left: m, top: m }, tr: { right: m, top: m }, bl: { left: m, bottom: m }, br: { right: m, bottom: m } }[b.logoPosition] || { right: m, top: m };

  return (
    <div className="rf-page" style={{ maxWidth: 1180, margin: '0 auto', width: '100%', padding: '36px 32px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 4px' }}>Brand Kit</h1>
          <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Uma identidade por cliente: a marca ativa é aplicada em todo vídeo novo.</p>
        </div>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={b.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: C.orange }} />
          Aplicar automaticamente nos vídeos novos
        </label>
      </div>

      {/* Marcas (clientes): escolher, criar, duplicar e excluir */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        {brands.map((x) => {
          const on = x.id === b.id;
          return (
            <button key={x.id} onClick={() => pickBrand(x.id)} aria-pressed={on} title={on ? 'Marca ativa' : 'Usar esta marca'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px 0 6px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 700 : 500,
                border: on ? '2px solid #fff' : `1px solid ${C.border}`, background: on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: on ? C.text : C.muted }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
                {x.logo ? <img src={x.logo} alt="" style={{ maxWidth: '90%', maxHeight: '90%' }} /> : <span style={{ fontWeight: 800, fontSize: 12 }}>{(x.name || '?').trim().slice(0, 1).toUpperCase()}</span>}
              </span>
              {x.name || 'Sem nome'}
              {on && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: GRAD, borderRadius: 20, padding: '2px 7px' }}>ATIVA</span>}
            </button>
          );
        })}
        <button onClick={() => newBrand(false)} style={{ ...seg(false), color: C.text, border: `1px dashed ${C.borderStrong}`, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={14} strokeWidth={2.4} /> Nova marca</button>
        <button onClick={() => newBrand(true)} title="Cria outra marca com as mesmas configurações" style={{ ...seg(false), minHeight: 40 }}>Duplicar</button>
        <button onClick={removeBrand} style={{ ...seg(false), minHeight: 40 }}>Excluir</button>
      </div>

      <div className="rf-bk-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 290px', gap: 22, alignItems: 'start', opacity: b.enabled ? 1 : 0.55 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Card title="Marca / cliente" hint="O nome é só para você se organizar. O logo pode entrar no vídeo como marca d'água.">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 92, height: 92, borderRadius: 16, border: `1px dashed ${C.borderStrong}`, display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%) 50% / 16px 16px' }}>
                {b.logo ? <img src={b.logo} alt="Logo" style={{ maxWidth: '86%', maxHeight: '86%' }} /> : <Icon name="image" size={26} color={C.faint} />}
              </div>
              <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 200 }}>
                <input value={b.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} placeholder="Nome da marca"
                  style={{ minHeight: 40, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.3)', color: C.text, fontSize: 14, fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pickLogo} style={{ display: 'none' }} />
                  <button onClick={() => fileRef.current?.click()} style={{ ...seg(false), color: C.text, border: `1px solid ${C.border}` }}>{b.logo ? 'Trocar logo' : 'Enviar logo'}</button>
                  {b.logo && <button onClick={() => set({ logo: null, watermark: false })} style={{ ...seg(false) }}>Remover</button>}
                </div>
                <div style={{ fontSize: 11.5, color: C.faint }}>PNG com fundo transparente fica melhor.</div>
              </div>
            </div>
          </Card>

          <Card title="Marca d'água" hint="Coloca o seu logo num canto do vídeo, do começo ao fim.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 600, cursor: b.logo ? 'pointer' : 'not-allowed', opacity: b.logo ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!b.logo} checked={b.watermark && !!b.logo} onChange={(e) => set({ watermark: e.target.checked })} style={{ width: 18, height: 18, accentColor: C.orange }} />
              Incluir o logo nos vídeos {b.logo ? '' : '(envie um logo antes)'}
            </label>
            {b.watermark && b.logo && (
              <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: C.muted, width: 70 }}>Canto</span>
                  {CORNERS.map((c) => <button key={c.id} onClick={() => set({ logoPosition: c.id })} style={{ ...seg(b.logoPosition === c.id), width: 42, fontSize: 15 }}>{c.label}</button>)}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.muted }}>
                  <span style={{ width: 70 }}>Tamanho</span>
                  <input type="range" min={0.06} max={0.35} step={0.01} value={b.logoSize} onChange={(e) => set({ logoSize: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ width: 40, textAlign: 'right' }}>{Math.round(b.logoSize * 100)}%</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.muted }}>
                  <span style={{ width: 70 }}>Opacidade</span>
                  <input type="range" min={0.15} max={1} step={0.05} value={b.logoOpacity} onChange={(e) => set({ logoOpacity: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ width: 40, textAlign: 'right' }}>{Math.round(b.logoOpacity * 100)}%</span>
                </label>
              </div>
            )}
          </Card>

          <Card title="Estilo da legenda" hint="O modelo que já vem escolhido em todo vídeo novo.">
            <CaptionGallery options={{ captions: true, captionTemplate: opts.captionTemplate, captionColor: opts.captionColor, captionPreset: b.preset }} onApply={(p) => set({ preset: p.captionPreset === 'none' ? '' : p.captionPreset || '' })} compact />
            {b.preset && <button onClick={() => set({ preset: '' })} style={{ ...seg(false), marginTop: 10 }}>Usar o padrão do app</button>}
          </Card>

          <Card title="Cores, fonte e posição">
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: C.muted, width: 70 }}>Cor</span>
                <button onClick={() => set({ captionColor: '' })} style={{ ...seg(!b.captionColor), padding: '6px 10px' }}>Do estilo</button>
                <ColorSwatches value={b.captionColor} options={CAPTION_COLOR_LIST} onChange={(v) => set({ captionColor: v })} size={26} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: C.muted, width: 70 }}>Fonte</span>
                <select value={b.captionFont} onChange={(e) => set({ captionFont: e.target.value })} style={{ minHeight: 38, padding: '0 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#13131B', color: C.text, fontSize: 13.5, fontFamily: 'inherit', minWidth: 200 }}>
                  {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: C.muted, width: 70 }}>Posição</span>
                {POSITIONS.map((p) => <button key={p.id} onClick={() => set({ captionPosition: p.id })} style={seg(b.captionPosition === p.id)}>{p.label}</button>)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: C.muted, width: 70 }}>Destaque</span>
                {HIGHLIGHTS.map((h) => <button key={h.id} onClick={() => set({ captionHighlightStyle: h.id })} style={seg((b.captionHighlightStyle || '') === h.id)}>{h.label}</button>)}
              </div>
            </div>
          </Card>
        </div>

        <div className="rf-bk-side" style={{ position: 'sticky', top: 16, display: 'grid', gap: 12, justifyItems: 'center' }}>
          <div style={{ fontSize: 12, color: C.faint, fontWeight: 700, letterSpacing: 0.8 }}>PRÉVIA</div>
          <div style={{ position: 'relative', width: pw, height: ph, borderRadius: 22, overflow: 'hidden', border: `1px solid ${C.borderStrong}`, background: 'radial-gradient(circle at 50% 30%, rgba(255,107,53,0.25), transparent 55%), linear-gradient(170deg, #23263a, #0d0d16 70%)', boxShadow: '0 30px 60px -30px rgba(0,0,0,0.8)' }}>
            <div style={{ position: 'absolute', left: '50%', top: '24%', transform: 'translateX(-50%)', textAlign: 'center', opacity: 0.85 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', margin: '0 auto' }} />
              <div style={{ width: 132, height: 84, borderRadius: '66px 66px 0 0', background: 'rgba(255,255,255,0.12)', marginTop: 8 }} />
            </div>
            <CaptionOverlay clock={clock} segments={SAMPLE_SEGS} options={opts} box={{ x: 0, y: 0, w: pw, h: ph }} />
            {b.logo && b.watermark && (
              <img src={b.logo} alt="" style={{ position: 'absolute', width: logoW, opacity: b.logoOpacity, ...corner, zIndex: 2 }} />
            )}
          </div>
          <div style={{ fontSize: 12, color: msg.startsWith('Salvo') ? C.green : C.red }}>{msg}</div>
          <button onClick={onNewVideo} style={{ minHeight: 42, padding: '0 18px', borderRadius: 12, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> Criar vídeo com a marca
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px){
          .rf-bk-grid{ grid-template-columns: 1fr !important; }
          .rf-bk-side{ position: static !important; order: -1; }
        }
      `}</style>
    </div>
  );
}
