import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, GRAD, FONT_DISPLAY } from '../theme.js';
import Icon from './Icon.jsx';
import { CaptionOverlay } from './CaptionPreview.jsx';
import { LOOK_CSS, motionAt } from '../livePreview.js';
import { keyZoomMoments } from '../../../shared/keyMoments.js';
import { apiAsset } from '../api.js';

// SIMULADOR da página inicial: refaz AO VIVO, sobre o vídeo bruto de uma edição real,
// cada ajuste que o Riseframe aplicou — o visitante liga/desliga e vê na hora.
// Os dados (fala com tempos, cortes, B-roll, cor, zooms) vêm da própria edição.

const CAPTION_STYLES = [
  { id: 'clean', label: 'Clássica' },
  { id: 'hormozi', label: 'Impacto' },
  { id: 'box', label: 'Caixa' },
  { id: 'keyword', label: 'Palavra-chave' },
  { id: 'neon', label: 'Neon' },
];
const LOOKS = [
  { id: 'none', label: 'Original' },
  { id: 'natural', label: 'Natural (automático)' },
  { id: 'teal-orange', label: 'Cinema' },
  { id: 'warm', label: 'Quente' },
  { id: 'vibrant', label: 'Vibrante' },
];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Filtro SVG com a correção de cor automática REAL desta edição (ganhos, contraste, saturação, gamma). */
function NaturalFilter({ id, ai }) {
  const wb = ai?.whiteBalance || {};
  const r = Number(wb.rGain) || 1, g = Number(wb.gGain) || 1, b = Number(wb.bGain) || 1;
  const c = Number(ai?.contrast) || 1, s = Number(ai?.saturation) || 1, gm = Number(ai?.gamma) || 1;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`} />
        <feColorMatrix type="saturate" values={String(s)} />
        <feComponentTransfer>
          {['R', 'G', 'B'].map((ch) => {
            const Fn = `feFunc${ch}`;
            return <Fn key={ch} type="gamma" amplitude={c} exponent={1 / gm} offset={(1 - c) / 2} />;
          })}
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

function Toggle({ on, onClick, icon, title, desc }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', color: C.text, background: on ? 'rgba(255,107,53,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? `${C.orange}88` : C.border}` }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: on ? GRAD : 'rgba(255,255,255,0.06)' }}>
        <Icon name={icon} size={17} color="#fff" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>{desc}</span>
      </span>
      <span style={{ width: 38, height: 22, borderRadius: 99, background: on ? C.orange : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
    </button>
  );
}

function Chips({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: value === o.id ? '#fff' : C.muted, background: value === o.id ? 'rgba(255,107,53,0.2)' : 'transparent', border: `1px solid ${value === o.id ? C.orange : C.border}` }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Simulator({ showcase }) {
  const sim = showcase.sim;
  const o = sim.options || {};
  const landscape = (sim.width || 9) > (sim.height || 16);
  const [cuts, setCuts] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [capStyle, setCapStyle] = useState(CAPTION_STYLES.some((c) => c.id === o.captionTemplate) ? o.captionTemplate : 'clean');
  const [look, setLook] = useState(sim.color?.ai ? 'natural' : LOOKS.some((l) => l.id === o.colorLook) ? o.colorLook : 'natural');
  const [zoom, setZoom] = useState(true);
  const [broll, setBroll] = useState(sim.broll.length > 0);
  const [split, setSplit] = useState(['top', 'bottom'].includes(sim.brollLayout) ? sim.brollLayout : 'fullscreen');
  const [vertical, setVertical] = useState(landscape ? o.aspect === '9:16' : true);
  const [finalView, setFinalView] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [activeBroll, setActiveBroll] = useState(-1);
  const [box, setBox] = useState(null);

  const videoRef = useRef(null);
  const beforeRef = useRef(null); // vídeo real, sem ajustes, no mesmo instante
  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const state = useRef({});
  const filterId = 'rf-sim-natural';

  const keep = sim.keep?.length ? sim.keep : [{ start: 0, end: sim.duration }];
  const keptSeconds = keep.reduce((s, k) => s + (k.end - k.start), 0);
  // Legendas: com "cortar pausas" ligado, somem as palavras cortadas (muletas etc.).
  const segments = useMemo(
    () => (cuts ? sim.segments : sim.segments.map((sg) => ({ ...sg, words: (sg.words || []).map(({ removed, ...w }) => w) }))),
    [cuts, sim.segments],
  );
  const zoomWindows = useMemo(() => {
    if (Array.isArray(sim.zoomMoments) && sim.zoomMoments.length) return sim.zoomMoments.map((z) => [z.start, z.end, z.scale || null]);
    const clean = sim.segments.map((sg) => ({ ...sg, words: (sg.words || []).filter((w) => !w.removed) }));
    return keyZoomMoments(clean, sim.duration).map((z) => [z.start, z.end, null]);
  }, [sim]);
  state.current = { cuts, zoom, broll, keep, zoomWindows, intensity: o.motionIntensity || 'medio', items: sim.broll, activeBroll };

  // Laço de prévia: pula os trechos cortados, aplica o zoom e troca o B-roll no tempo certo.
  useEffect(() => {
    let id;
    const loop = () => {
      const v = videoRef.current;
      const s = state.current;
      if (v && !finalView) {
        const t = v.currentTime;
        if (s.cuts && s.keep.length) {
          const inside = s.keep.find((k) => t >= k.start - 0.02 && t < k.end);
          if (!inside) {
            const next = s.keep.find((k) => k.start > t);
            v.currentTime = next ? next.start : s.keep[0].start;
          }
        }
        // ANTES acompanha o mesmo instante do DEPOIS (comparação lado a lado).
        const bv = beforeRef.current;
        if (bv && Math.abs(bv.currentTime - v.currentTime) > 0.3) bv.currentTime = v.currentTime;
        const m = s.zoom ? motionAt('dynamic', s.intensity, t, sim.duration, s.zoomWindows) : { scale: 1, ox: 50, oy: 50 };
        if (frameRef.current) {
          frameRef.current.style.transform = `scale(${m.scale})`;
          frameRef.current.style.transformOrigin = `${m.ox}% ${m.oy}%`;
        }
        const bi = s.broll ? s.items.findIndex((b) => t >= b.start && t < b.end) : -1;
        if (bi !== s.activeBroll) setActiveBroll(bi);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [finalView, sim.duration]);

  // Área onde o vídeo aparece (para a legenda ficar no lugar certo).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBox({ x: 0, y: 0, w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [vertical, finalView]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (playing) v.play().catch(() => {});
    else v.pause();
    const bv = beforeRef.current;
    if (bv) {
      if (playing) bv.play().catch(() => {});
      else bv.pause();
    }
  }, [muted, playing, finalView]);

  const lookCss = look === 'natural' ? { filter: `url(#${filterId})` } : LOOK_CSS[look] || LOOK_CSS.none;
  const item = activeBroll >= 0 ? sim.broll[activeBroll] : null;
  const isSplit = item && split !== 'fullscreen';
  const aspect = vertical ? '9 / 16' : `${sim.width} / ${sim.height}`;
  const capOptions = { ...o, captionTemplate: capStyle, captionHighlight: o.captionHighlight === true };
  const focus = sim.reframe?.centerX != null ? `${sim.reframe.centerX * 100}% 40%` : '50% 40%';

  return (
    <div className="rf-sim" style={{ display: 'grid', gap: 22 }}>
      {look === 'natural' && <NaturalFilter id={filterId} ai={sim.color?.ai} />}
      <div className={`rf-sim-row${landscape ? ' rf-sim-wide' : ''}`} style={{ display: 'flex', gap: 18, justifyContent: 'center', alignItems: 'flex-end' }}>
      {/* ANTES: o vídeo real como foi gravado, no mesmo instante */}
      <div style={{ flex: '1 1 0', maxWidth: landscape ? 520 : 300, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={paneLabel(false)}>ANTES · COMO FOI GRAVADO</span>
        <div style={{ width: '100%', borderRadius: 24, padding: 8, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 70px -30px rgba(0,0,0,0.8)' }}>
          <div style={{ position: 'relative', aspectRatio: `${sim.width || 9} / ${sim.height || 16}`, borderRadius: 17, overflow: 'hidden', background: '#000' }}>
            <video ref={beforeRef} src={apiAsset(showcase.before)} autoPlay loop playsInline muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '4px 9px', borderRadius: 999 }}>VÍDEO REAL</div>
          </div>
        </div>
      </div>
      <div className="rf-sim-arrow" style={{ alignSelf: 'center', color: C.orange, fontSize: 30, fontWeight: 800 }}>→</div>
      {/* DEPOIS: o mesmo vídeo com os ajustes ligados abaixo */}
      <div style={{ flex: '1 1 0', maxWidth: vertical ? 300 : 520, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={paneLabel(true)}>DEPOIS · COM OS AJUSTES</span>
        <div style={{ width: '100%', position: 'relative', borderRadius: 24, padding: 8, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 70px -30px rgba(255,107,53,0.45)' }}>
          <div ref={stageRef} style={{ position: 'relative', aspectRatio: aspect, borderRadius: 17, overflow: 'hidden', background: '#000' }}>
            {finalView ? (
              <video key="final" ref={videoRef} src={apiAsset(showcase.after)} autoPlay loop playsInline muted={muted}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            ) : (
              <>
                <div style={{ position: 'absolute', inset: 0, ...lookCss }}>
                  {/* pessoa: tela cheia, ou a metade oposta ao B-roll na tela dividida */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: isSplit && split === 'top' ? '50%' : 0, height: isSplit ? '50%' : '100%', overflow: 'hidden' }}>
                    <div ref={frameRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
                      <video key="sim" ref={videoRef} src={apiAsset(showcase.before)} autoPlay loop playsInline muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus, display: 'block' }} />
                    </div>
                  </div>
                  {item && (
                    <div key={activeBroll} style={{ position: 'absolute', left: 0, right: 0, top: split === 'bottom' && isSplit ? '50%' : 0, height: isSplit ? '50%' : '100%', overflow: 'hidden', animation: 'rf-fade .25s ease both', background: '#000' }}>
                      {item.kind === 'video' ? (
                        <video src={apiAsset(item.src)} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <img src={apiAsset(item.src)} alt={item.query || 'B-roll'} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(item.fx ?? 0.5) * 100}% ${(item.fy ?? 0.5) * 100}%`, transform: `scale(${item.zoom || 1})` }} />
                      )}
                    </div>
                  )}
                  {lookCss.tint && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...lookCss.tint }} />}
                </div>
                {captions && <CaptionOverlay videoRef={videoRef} segments={segments} options={capOptions} box={box} />}
              </>
            )}
            <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: '#fff', background: finalView ? GRAD : 'rgba(0,0,0,0.55)', padding: '4px 9px', borderRadius: 999, zIndex: 3 }}>
              {finalView ? 'VÍDEO FINAL (RENDER)' : 'PRÉVIA AO VIVO'}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* controles do player + duração */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => setPlaying((p) => !p)} style={ctrlBtn}><Icon name={playing ? 'pause' : 'play'} size={15} /> {playing ? 'Pausar' : 'Tocar'}</button>
          <button onClick={() => setMuted((m) => !m)} style={ctrlBtn}><Icon name={muted ? 'mute' : 'volume'} size={15} /> {muted ? 'Ouvir' : 'Sem som'}</button>
          <button onClick={() => setFinalView((f) => !f)} style={{ ...ctrlBtn, borderColor: finalView ? C.orange : C.border, color: finalView ? C.orange : C.text }}>
            <Icon name="film" size={15} /> {finalView ? 'Voltar à prévia' : 'Ver o vídeo final real'}
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10, textAlign: 'center' }}>
          {cuts ? <>Duração: {mmss(sim.duration)} → <b style={{ color: C.text }}>{mmss(keptSeconds)}</b> com as pausas cortadas</> : <>Duração original: {mmss(sim.duration)}</>}
        </div>
      </div>

      {/* AJUSTES */}
      <div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 10, textAlign: 'center' }}>Ligue e desligue cada ajuste e veja o <b style={{ color: C.text }}>depois</b> mudar na hora:</div>
        <div className="rf-sim-ctl" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, alignItems: 'start' }}>
        <Toggle on={cuts} onClick={() => setCuts((v) => !v)} icon="scissors" title="Cortar pausas e muletas" desc={`Tira ${Math.max(0, Math.round(sim.duration - keptSeconds))}s de silêncios e "é…", "hã"`} />
        <div>
          <Toggle on={captions} onClick={() => setCaptions((v) => !v)} icon="captions" title="Legendas" desc="Escritas da fala, sincronizadas" />
          {captions && <Chips value={capStyle} options={CAPTION_STYLES} onChange={setCapStyle} />}
        </div>
        <div>
          <Toggle on={look !== 'none'} onClick={() => setLook((l) => (l === 'none' ? 'natural' : 'none'))} icon="palette" title="Cor" desc="Corrige luz e cor, ou aplica um estilo" />
          <Chips value={look} options={LOOKS} onChange={setLook} />
        </div>
        <Toggle on={zoom} onClick={() => setZoom((v) => !v)} icon="search" title="Zoom nos momentos-chave" desc={`${zoomWindows.length} aproximações nas frases mais fortes`} />
        {sim.broll.length > 0 && (
          <div>
            <Toggle on={broll} onClick={() => setBroll((v) => !v)} icon="image" title="Imagens de apoio (B-roll)" desc={`${sim.broll.length} imagens que ilustram a fala`} />
            {broll && <Chips value={split} options={[{ id: 'fullscreen', label: 'Tela cheia' }, { id: 'top', label: 'Dividida (em cima)' }, { id: 'bottom', label: 'Dividida (embaixo)' }]} onChange={setSplit} />}
          </div>
        )}
        {landscape && <Toggle on={vertical} onClick={() => setVertical((v) => !v)} icon="crop" title="Formato vertical 9:16" desc="Para Reels, Shorts e TikTok" />}
        </div>
        <p style={{ fontSize: 12, color: C.faint, margin: '12px 0 0', lineHeight: 1.5, textAlign: 'center' }}>
          Os dois lados tocam o mesmo vídeo real no mesmo instante. O botão “Ver o vídeo final real” mostra o arquivo exatamente como o Riseframe entregou.
        </p>
      </div>
      {/* Celular: vídeo horizontal fica pequeno lado a lado → ANTES em cima, DEPOIS embaixo. */}
      <style>{`@media (max-width: 640px){ .rf-sim-row{ gap: 8px !important; } .rf-sim-arrow{ display: none; }
        .rf-sim-wide{ flex-direction: column !important; align-items: center !important; gap: 18px !important; }
        .rf-sim-wide > div{ width: 100%; flex: none !important; } }`}</style>
    </div>
  );
}

const paneLabel = (after) => ({
  fontSize: 11.5, fontWeight: 800, letterSpacing: 1, padding: '5px 12px', borderRadius: 999, marginBottom: 12, textAlign: 'center',
  color: after ? '#fff' : C.muted, background: after ? GRAD : 'rgba(255,255,255,0.06)', border: after ? 'none' : `1px solid ${C.border}`,
});

const ctrlBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 999, border: `1px solid ${C.border}`,
  background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
