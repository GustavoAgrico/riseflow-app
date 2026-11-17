import { useEffect, useRef, useState } from 'react';
import { C, GRAD } from '../theme.js';
import { generatePromptMotion } from '../api.js';
import {
  drawPromptMotion, fallbackPromptSpec, PM_TEMPLATES, PM_GOALS, PM_LOOKS, PM_PACES, PM_PALETTES,
} from '../../../shared/promptMotion.js';

// Motion por PROMPT (como o Prompt Motion): modelos prontos, o pedido em texto e um
// formulário (objetivo, estilo, cores, ritmo, duração, criatividade). A IA monta o roteiro da
// cena; a prévia toca aqui em loop; "Ajustar" pede mudanças em cima da cena pronta.

const field = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit' };
const label = { fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' };
const CREATIVITY = { baixa: 'Direto', media: 'Equilibrado', alta: 'Ousado' };

function Chip({ on, onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title}
      style={{ height: 28, padding: '0 11px', borderRadius: 999, border: `1px solid ${on ? C.orange : C.border}`, background: on ? 'rgba(255,107,53,0.16)' : 'transparent', color: on ? C.text : C.muted, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

/** Prévia em loop do roteiro (o mesmo desenho do render). */
function Preview({ spec, aspect, loadFonts }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const shown = useRef(0);
  const [, setFonts] = useState(0);
  useEffect(() => { loadFonts?.().then(() => setFonts((n) => n + 1)); }, [loadFonts]);
  useEffect(() => { tRef.current = 0; setT(0); }, [spec]);
  useEffect(() => {
    if (!spec) return undefined;
    let id;
    let last = performance.now();
    const loop = (now) => {
      const c = ref.current;
      if (c) {
        if (playing) {
          tRef.current = (tRef.current + (now - last) / 1000) % (spec.duration + 0.6);
          // o controle de tempo não precisa de 60 atualizações por segundo
          if (Math.abs(tRef.current - shown.current) > 0.08 || tRef.current < shown.current) { shown.current = tRef.current; setT(tRef.current); }
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = Math.round(c.clientWidth * dpr);
        const H = Math.round(c.clientHeight * dpr);
        if (W > 1 && H > 1) {
          if (c.width !== W) c.width = W;
          if (c.height !== H) c.height = H;
          drawPromptMotion(c.getContext('2d'), spec, Math.min(spec.duration, tRef.current), { W, H });
        }
      }
      last = now;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [spec, playing]);
  const ar = aspect?.w && aspect?.h ? aspect.w / aspect.h : 9 / 16;
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
      <div style={{ width: ar >= 1 ? 'min(100%, 420px)' : 'min(100%, 280px)', aspectRatio: `${ar}`, borderRadius: 14, overflow: 'hidden', background: '#000', border: `1px solid ${C.border}`, position: 'relative' }}>
        {spec
          ? <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.faint, fontSize: 13, padding: 20, textAlign: 'center' }}>A prévia aparece aqui</div>}
      </div>
      {spec && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: ar >= 1 ? 'min(100%, 420px)' : 'min(100%, 280px)' }}>
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar' : 'Tocar'}
            style={{ width: 30, height: 30, borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 12 }}>{playing ? '❚❚' : '▶'}</button>
          <input type="range" min="0" max={spec.duration} step="0.01" value={Math.min(spec.duration, t)} aria-label="Tempo da cena"
            onChange={(e) => { setPlaying(false); tRef.current = Number(e.target.value); setT(tRef.current); }} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums', width: 54, textAlign: 'right' }}>{Math.min(spec.duration, t).toFixed(1)} / {spec.duration.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ initial?: {prompt,form,spec}|null, aspect?: {w,h}, aspectLabel?: string, loadFonts?: () => Promise,
 *   onInsert: (spec, meta) => void, onClose: () => void, editing?: boolean }} props
 */
export default function PromptMotionStudio({ initial = null, aspect, aspectLabel = '9:16', loadFonts, onInsert, onClose, editing = false }) {
  const [prompt, setPrompt] = useState(initial?.prompt || '');
  const [form, setForm] = useState(() => ({ goal: 'explicar', look: 'bold', pace: 'medio', palette: 'laranja', duration: 5, creativity: 'media', hideCaps: true, ...(initial?.form || {}) }));
  const [spec, setSpec] = useState(initial?.spec || null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [change, setChange] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const customOn = form.palette === 'custom';
  const colors = form.colors || { bg: '#0B0B12', text: '#FFFFFF', accent: '#FF6B35' };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const formOut = () => {
    const { hideCaps, ...f } = form;
    return { ...f, aspect: aspectLabel, ...(customOn ? { palette: undefined, colors: { ...PM_PALETTES.laranja.palette, ...colors, bg2: colors.bg } } : {}) };
  };

  async function generate(withChange = '') {
    if (!prompt.trim() && !withChange) { setNote('Descreva a cena (ou escolha um modelo).'); return; }
    setBusy(true);
    setNote(withChange ? 'Ajustando a cena…' : 'A IA está montando a cena…');
    try {
      const r = await generatePromptMotion({ prompt, form: formOut(), ...(withChange && spec ? { current: spec, change: withChange } : {}) });
      setSpec(r.spec);
      setNote(r.note || (withChange ? 'Pronto — veja a prévia.' : `Cena "${r.spec.title}" pronta (${r.spec.elements.length} peças).`));
      if (withChange) setChange('');
    } catch (err) {
      // sem conexão com o servidor: monta pelo modelo aqui mesmo
      const s = withChange ? null : fallbackPromptSpec(prompt, formOut());
      if (s) setSpec(s);
      setNote(`${err.message}${s ? ' — montei pelo modelo.' : ''}`);
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(tp) {
    setPrompt(tp.prompt);
    set({ goal: tp.goal, look: tp.look });
    setSpec(fallbackPromptSpec(tp.prompt, { ...formOut(), goal: tp.goal, look: tp.look }));
    setNote(`Modelo "${tp.label}" — edite o texto e clique em Gerar com IA para deixar do seu jeito.`);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Motion por prompt" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.66)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(1040px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: C.panelSolid, border: `1px solid ${C.borderStrong}`, borderRadius: 18, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <b style={{ fontSize: 16 }}>✨ Motion por prompt</b>
          <span style={{ fontSize: 12, color: C.faint }}>descreva a cena, escolha o estilo — a IA anima</span>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, padding: 18 }}>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <span style={label}>Modelos</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PM_TEMPLATES.map((tp) => <Chip key={tp.id} on={false} onClick={() => applyTemplate(tp)} title={tp.prompt}>{tp.label}</Chip>)}
            </div>
            <span style={label}>O que você quer na cena</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder='Ex.: contador de 0 a 10 mil seguidores com "em 30 dias" embaixo e confete no final'
              style={{ ...field, resize: 'vertical', lineHeight: 1.45 }} />
            <span style={label}>Objetivo</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{Object.entries(PM_GOALS).map(([id, l]) => <Chip key={id} on={form.goal === id} onClick={() => set({ goal: id })}>{l}</Chip>)}</div>
            <span style={label}>Estilo</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{Object.entries(PM_LOOKS).map(([id, l]) => <Chip key={id} on={form.look === id} onClick={() => set({ look: id })}>{l}</Chip>)}</div>
            <span style={label}>Cores</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {Object.entries(PM_PALETTES).map(([id, p]) => (
                <button key={id} type="button" onClick={() => set({ palette: id })} title={p.label} aria-label={p.label} aria-pressed={form.palette === id}
                  style={{ display: 'flex', gap: 0, padding: 3, borderRadius: 999, border: `2px solid ${form.palette === id ? C.orange : C.border}`, background: 'transparent', cursor: 'pointer' }}>
                  {[p.palette.bg, p.palette.accent, p.palette.accent2, p.palette.text].map((c, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 999, background: c, marginLeft: i ? -4 : 0, border: '1px solid rgba(255,255,255,0.25)' }} />)}
                </button>
              ))}
              <Chip on={customOn} onClick={() => set({ palette: 'custom', colors })}>Minhas cores</Chip>
            </div>
            {customOn && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[['bg', 'Fundo'], ['text', 'Texto'], ['accent', 'Destaque']].map(([k, l]) => (
                  <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                    <input type="color" value={colors[k]} onChange={(e) => set({ colors: { ...colors, [k]: e.target.value } })} style={{ width: 30, height: 26, border: 'none', background: 'transparent', padding: 0 }} /> {l}
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={label}>Ritmo</span>
                <div style={{ display: 'flex', gap: 6 }}>{Object.entries(PM_PACES).map(([id, l]) => <Chip key={id} on={form.pace === id} onClick={() => set({ pace: id })}>{l}</Chip>)}</div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={label}>Criatividade</span>
                <div style={{ display: 'flex', gap: 6 }}>{Object.entries(CREATIVITY).map(([id, l]) => <Chip key={id} on={form.creativity === id} onClick={() => set({ creativity: id })}>{l}</Chip>)}</div>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: C.muted }}>
              <span style={{ ...label, minWidth: 64 }}>Duração</span>
              <input type="range" min="2" max="12" step="0.5" value={form.duration} onChange={(e) => set({ duration: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ width: 36, textAlign: 'right', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{form.duration}s</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.hideCaps} onChange={(e) => set({ hideCaps: e.target.checked })} /> Esconder a legenda enquanto a cena estiver na tela
            </label>
            <button type="button" onClick={() => generate()} disabled={busy}
              style={{ height: 44, borderRadius: 12, border: 'none', background: GRAD, color: '#fff', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Gerando…' : spec ? 'Gerar de novo com IA' : 'Gerar com IA'}
            </button>
          </div>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <Preview spec={spec} aspect={aspect} loadFonts={loadFonts} />
            {note && <div role="status" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, textAlign: 'center' }}>{note}</div>}
            {spec && (
              <>
                <span style={label}>Ajustar com IA</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={change} onChange={(e) => setChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && change.trim() && !busy) generate(change.trim()); }}
                    placeholder="Ex.: mais rápido, troque o gráfico por um contador, fundo branco" style={field} />
                  <button type="button" disabled={busy || !change.trim()} onClick={() => generate(change.trim())}
                    style={{ flex: 'none', padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: busy || !change.trim() ? 0.5 : 1 }}>Ajustar</button>
                </div>
                <button type="button" onClick={() => onInsert(spec, { prompt, form: { ...form } })}
                  style={{ height: 46, borderRadius: 12, border: 'none', background: C.green, color: '#04130A', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {editing ? 'Atualizar a cena no vídeo' : 'Colocar no vídeo (no ponto atual)'}
                </button>
                <span style={{ fontSize: 11.5, color: C.faint, textAlign: 'center' }}>A cena entra como um clipe na timeline: dá para arrastar, encurtar ou apagar como qualquer mídia.</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
