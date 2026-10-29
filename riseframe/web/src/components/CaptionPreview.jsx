import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../theme.js';
import SnapGuides, { snapCenter } from './SnapGuides.jsx';
import { motionAt, playWhoosh, LOOK_CSS, colorAdjustCss } from '../livePreview.js';
import { pickKeyword, premiumChunks, layoutCaption, autoMaxChars, stripPunct, captionTiming, timeSegments } from '../../../shared/captionKeyword.js';
import { shadowParams, shadowGeometry } from '../../../shared/captionShadow.js';
import {
  CAPTION_TEMPLATES, CAPTION_FONTS, CAPTION_COLOR_LIST, fontById, fontBold, colorHex, isLightHex, isWhiteish, HIGHLIGHT_IDS, LINE_HEIGHT, resolveFontFace,
  SAFE_ZONE, isVerticalFrame, safeCaptionBox,
} from '../../../shared/captionStyle.js';

// Fontes, cores, estilos e destaques: os MESMOS do render (shared/captionStyle.js).
export const COLOR_HEX = Object.fromEntries(CAPTION_COLOR_LIST.map((c) => [c.id, c.hex]));
const hexOf = (v) => `#${colorHex(v)}`;
const ANIM_CSS = {
  fade: 'rf-fade .5s ease both', pop: 'rf-pop .35s ease both', bounce: 'rf-bounce .5s ease both',
  zoom: 'rf-zoom .4s ease both', 'pop-rot': 'rf-pop-rot .45s ease both', shake: 'rf-shake .5s ease both', none: 'none',
  zoomblur: 'rf-zoomblur .26s ease both', typewriter: 'rf-fade .12s ease both',
};

// Largura de um texto (em "em") na fonte já carregada — para o auto-ajuste da palavra
// longa ficar igual ao do render.
let measureCtx = null;
function textEm(text, family, weight) {
  try {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} 100px '${family}'`;
    return measureCtx.measureText(text).width / 100;
  } catch {
    return String(text).length * 0.58;
  }
}

/**
 * Visual da legenda (fonte, cor, fundo, animação, modo, posição, destaque) a partir das
 * opções — as mesmas regras do render (server/src/pipeline/captions.js).
 * `textStyle(fontPx)` monta o estilo do texto.
 */
export function captionLook(options) {
  const tplKey = CAPTION_TEMPLATES[options.captionTemplate] ? options.captionTemplate : 'clean';
  const T = CAPTION_TEMPLATES[tplKey];
  // fonte própria do usuário ("custom:<id>", registrada no navegador como "RFU <id>")
  const customId = String(options.captionFont || '').startsWith('custom:') ? options.captionFont.slice(7) : null;
  const font = customId
    ? { id: 'custom', family: `RFU ${customId}`, bold: false }
    : options.captionFont && options.captionFont !== 'auto' && CAPTION_FONTS[options.captionFont] ? CAPTION_FONTS[options.captionFont] : fontById(T.defaultFont);
  // estilo da fonte (Regular, Itálico, Black…): arquivo próprio com família única
  const face = resolveFontFace(font, options.captionFontStyle);
  const fontFamily = face.family;
  const weight = face.styled ? 400 : T.bold && fontBold(font) ? 800 : 400;
  const fakeItalic = options.captionItalic === true && !face.italic;
  const underline = options.captionUnderline === true;
  const caseMode = ['upper', 'lower', 'normal'].includes(options.captionCase) ? options.captionCase : T.upper ? 'upper' : 'normal';
  const caseFn = (w) => (caseMode === 'upper' ? String(w).toUpperCase() : caseMode === 'lower' ? String(w).toLowerCase() : String(w));
  const animKind = options.captionAnimation && options.captionAnimation !== 'auto' ? options.captionAnimation : T.anim;
  const anim = ANIM_CSS[animKind] || ANIM_CSS.fade;
  const color = hexOf(options.captionColor);
  const accentIsWhite = isWhiteish(color);
  const scale = options.captionScale || 1;
  const bg = ['shadow', 'box', 'bar', 'glow', 'none', 'clean'].includes(options.captionBackground)
    ? options.captionBackground
    : T.box ? 'box' : T.soft ? 'clean' : 'shadow';
  const useBox = bg === 'box' || bg === 'bar';
  const glowOn = bg === 'glow' || ((options.captionBackground == null || options.captionBackground === 'auto') && !!T.glow);
  const mode = ['word', 'phrase'].includes(options.captionMode) ? options.captionMode : T.mode;
  const pos = ['top', 'center', 'bottom'].includes(options.captionPosition) ? options.captionPosition : 'auto';
  const vAlign = pos === 'top' ? 'flex-start' : pos === 'bottom' ? 'flex-end' : 'center';
  const highlight = options.captionHighlight === true || !!T.forceHighlight;
  const hl = HIGHLIGHT_IDS.includes(options.captionHighlightStyle) ? options.captionHighlightStyle : T.hl || 'color';
  // espaçamento entre as letras (em) e sombra das letras — iguais ao render
  const spacing = T.premium ? 0 : Math.min(0.3, Math.max(-0.05, Number(options.captionSpacing) || 0));
  const shMode = ['off', 'on'].includes(options.captionShadow) ? options.captionShadow : 'auto';
  const shGeo = shadowParams(options);

  function stroke(px, c = '#000') {
    return `-${px}px 0 ${c}, ${px}px 0 ${c}, 0 -${px}px ${c}, 0 ${px}px ${c},`
      + `-${px}px -${px}px ${c}, ${px}px ${px}px ${c}, -${px}px ${px}px ${c}, ${px}px -${px}px ${c}`;
  }
  function textStyle(fontPx) {
    let dropFilter = null;
    const outline = bg === 'clean' || T.outline === 0 ? 0 : Math.max(1, Math.round(fontPx * T.outline));
    const shadow = `0 ${Math.max(1, Math.round(fontPx * 0.05))}px ${Math.round(fontPx * 0.12)}px rgba(0,0,0,.55)`;
    const hs = Math.max(1, Math.round(fontPx * (T.hardShadow === 'accent' ? 0.07 : 0.06)));
    // sombra dura: no libass a sombra é a letra COM o contorno deslocada
    const hc = T.hardShadow === 'accent' ? color : '#000';
    const hard = T.hardShadow && bg !== 'clean' && !useBox && shMode === 'auto'
      ? `, ${hs}px ${hs}px 0 ${hc}${outline ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].map(([dx, dy]) => `, ${hs + dx * outline}px ${hs + dy * outline}px 0 ${hc}`).join('') : ''}`
      : '';
    let baseShadow = glowOn
      ? `0 0 ${fontPx * 0.15}px ${color}, 0 0 ${fontPx * 0.3}px ${color}${outline ? `, ${stroke(outline, color)}` : ''}`
      : bg === 'clean' || !outline ? shadow
        : bg === 'none' ? stroke(outline) + hard : `${stroke(outline)}, ${shadow}${hard}`;
    // Sombra escolhida pelo usuário (a mesma conta do render): sem sombra, ou a letra (com o
    // contorno) deslocada para baixo/direita com a intensidade escolhida.
    if (shMode === 'off') {
      baseShadow = glowOn
        ? `0 0 ${fontPx * 0.15}px ${color}, 0 0 ${fontPx * 0.3}px ${color}${outline ? `, ${stroke(outline, color)}` : ''}`
        : outline ? stroke(outline) : 'none';
    } else if (shMode === 'on' && !useBox) {
      // Sombra projetada (como no Photoshop): a letra com o contorno vira a sombra — no CSS,
      // drop-shadow do elemento (pega o contorno junto). Mesmas contas do render.
      baseShadow = glowOn
        ? `0 0 ${fontPx * 0.15}px ${color}, 0 0 ${fontPx * 0.3}px ${color}${outline ? `, ${stroke(outline, color)}` : ''}`
        : outline ? stroke(outline) : 'none';
      const g = shadowGeometry(shGeo, fontPx / (1080 * T.size * scale));
      const [r, gg, b] = [0, 2, 4].map((i) => parseInt(g.color.slice(i, i + 2), 16));
      dropFilter = g.opacity > 0.005 ? `drop-shadow(${g.dx.toFixed(1)}px ${g.dy.toFixed(1)}px ${(g.blur * 1.2).toFixed(1)}px rgba(${r},${gg},${b},${g.opacity.toFixed(3)}))` : null;
    }
    return {
      fontFamily: `'${fontFamily}', system-ui, sans-serif`,
      fontWeight: weight,
      fontSize: fontPx,
      lineHeight: LINE_HEIGHT,
      color: glowOn ? '#fff' : color,
      textShadow: baseShadow,
      ...(dropFilter ? { filter: dropFilter } : null),
      textTransform: caseMode === 'upper' ? 'uppercase' : caseMode === 'lower' ? 'lowercase' : 'none',
      fontStyle: fakeItalic ? 'italic' : 'normal',
      textDecoration: underline ? 'underline' : 'none',
      letterSpacing: `${spacing}em`,
      display: 'inline-block',
      padding: useBox ? `${fontPx * 0.05}px ${fontPx * 0.28}px` : 0,
      ...(useBox
        ? bg === 'bar'
          ? { background: 'rgba(16,16,20,0.55)', color: '#fff', textShadow: 'none', borderRadius: fontPx * 0.2 }
          : mode === 'phrase'
            ? { background: '#101014', color: '#fff', textShadow: 'none', borderRadius: fontPx * 0.2 }
            : { background: accentIsWhite ? '#fff' : color, color: isLightHex(accentIsWhite ? 'FFFFFF' : color) ? '#111' : '#fff', textShadow: 'none', borderRadius: fontPx * 0.2 }
        : { background: 'transparent' }),
      animation: anim,
    };
  }

  return { tplKey, T, font, face, caseMode, caseFn, upper: caseMode === 'upper', fontFamily, weight, animKind, anim, color, accentIsWhite, scale, bg, useBox, glowOn, mode, pos, vAlign, highlight, hl, stroke, textStyle };
}

// Frases de exemplo da prévia (tempos em segundos, repetem em loop).
const SAMPLE_LINES = ['Esse é o seu vídeo', 'com a legenda pronta', 'do jeito que vai sair'];
export const SAMPLE_SEGS = (() => {
  const segs = [];
  let t = 0.2;
  for (const line of SAMPLE_LINES) {
    const words = line.split(' ').map((word) => {
      const w = { start: +t.toFixed(2), end: +(t + 0.38).toFixed(2), word };
      t += 0.42;
      return w;
    });
    segs.push({ start: words[0].start, end: words[words.length - 1].end + 0.35, words });
    t += 0.45;
  }
  return segs;
})();
export const SAMPLE_DUR = SAMPLE_SEGS[SAMPLE_SEGS.length - 1].end + 0.3;
const RATIOS = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9, '4:5': 4 / 5 };

/**
 * Prévia ANTES de editar: o próprio vídeo do usuário (quando já escolhido) no formato
 * escolhido, COM SOM e com os recursos ligados — velocidade, cor (look + ajuste fino),
 * movimento/zoom, efeitos sonoros (whoosh nos punch-ins) e a legenda no estilo escolhido
 * (frases de exemplo; o texto real vem da transcrição, na edição).
 */
export default function CaptionPreview({ options, videoUrl, onFocus = null }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const motionRef = useRef(null);
  const [availW, setAvailW] = useState(320);
  const [natural, setNatural] = useState(null); // proporção do vídeo (formato "original")
  const [dims, setDims] = useState(null); // tamanho do vídeo (para o zoom/enquadramento)
  const [guides, setGuides] = useState(null); // linhas de centralização enquanto arrasta
  const [muted, setMuted] = useState(true); // o navegador só deixa tocar sozinho sem som
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth || 320));
    ro.observe(el);
    setAvailW(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);
  const ratio = RATIOS[options.aspect] || natural || 9 / 16;
  // Tela estreita (celular): prévia mais baixa, para as opções não ficarem longe.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const h = Math.round(Math.min(ratio >= 1 ? 260 : narrow ? 300 : 420, availW / ratio));
  const w = Math.round(h * ratio);
  const startedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  // Com vídeo: a legenda de exemplo acompanha o tempo do vídeo (pausa junto).
  const clock = () => (videoRef.current ? videoRef.current.currentTime : (performance.now() - startedAt.current) / 1000) % SAMPLE_DUR;
  const look = captionLook(options);
  const speed = Number(options.speed) > 0 ? Number(options.speed) : 1;
  const lookCss = LOOK_CSS[options.colorLook] || LOOK_CSS.auto;
  const adj = colorAdjustCss(options.colorAdjust || {});
  const filter = [lookCss.filter, adj.filter].filter(Boolean).join(' ') || undefined;
  const motion = options.videoMotion && options.videoMotion !== 'none' ? options.videoMotion : null;

  // Velocidade escolhida (a voz não muda de tom no navegador, como no render).
  useEffect(() => { const v = videoRef.current; if (v) v.playbackRate = speed; }, [speed, videoUrl]);
  useEffect(() => { const v = videoRef.current; if (v) v.muted = muted; }, [muted]);

  // Movimento (zoom) + whoosh nos punch-ins, a cada quadro, sobre o tempo do vídeo.
  useEffect(() => {
    if (!videoUrl) return undefined;
    let id;
    let lastT = null;
    const loop = () => {
      const v = videoRef.current;
      const box = motionRef.current;
      if (v && box) {
        const t = v.currentTime || 0;
        const d = v.duration || 10;
        // "Dinâmico": nos momentos-chave (na prévia, um punch-in a cada 4 s).
        const windows = [];
        for (let a = 1; a < d; a += 4) windows.push([a, a + 1.6, null]);
        const m = motion ? motionAt(motion, options.motionIntensity, t, d, windows) : { scale: 1, ox: 50, oy: 50 };
        const tf = m.scale && m.scale !== 1 ? `scale(${m.scale.toFixed(4)})` : 'none';
        if (box.style.transform !== tf) box.style.transform = tf;
        box.style.transformOrigin = `${m.ox ?? 50}% ${m.oy ?? 50}%`;
        if (!v.paused && !v.muted && options.soundEffects && motion === 'dynamic' && lastT != null && t > lastT && t - lastT < 0.6) {
          if (windows.some(([a]) => a - 0.3 > lastT && a - 0.3 <= t)) playWhoosh(options.sfxIntensity);
        }
        lastT = v.paused ? null : t;
        setCur((c) => (Math.abs(c - t) > 0.25 ? t : c));
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [videoUrl, motion, options.motionIntensity, options.soundEffects, options.sfxIntensity]);

  // Zoom e enquadramento (a mesma conta do servidor: amplia no ponto escolhido e depois
  // o formato recorta pelo centro): o vídeo é posicionado e ampliado dentro da prévia.
  const zoomK = Math.min(2.5, Math.max(1, Number(options.personZoom) || 1));
  const fx0 = Number.isFinite(Number(options.personFocusX)) ? Number(options.personFocusX) : 0.5;
  const fy0 = Number.isFinite(Number(options.personFocusY)) ? Number(options.personFocusY) : 0.4;
  const frame = (() => {
    if (!dims || !w || !h) return null;
    const half = 0.5 / zoomK;
    const cx = Math.min(1 - half, Math.max(half, fx0));
    const cy = Math.min(1 - half, Math.max(half, fy0));
    const k = Math.max(w / (dims.w / zoomK), h / (dims.h / zoomK));
    const dispW = dims.w * k;
    const dispH = dims.h * k;
    const left = Math.min(0, Math.max(w - dispW, w / 2 - cx * dispW));
    const top = Math.min(0, Math.max(h - dispH, h / 2 - cy * dispH));
    return { dispW, dispH, left, top };
  })();
  function startPan(e) {
    if (!onFocus || !frame) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, fx: fx0, fy: fy0 };
    const move = (ev) => {
      // arrastar o vídeo para a direita mostra mais da esquerda (como mover a foto)
      const sx = snapCenter(Math.min(1, Math.max(0, start.fx - (ev.clientX - start.x) / frame.dispW)), frame.dispW);
      const sy = snapCenter(Math.min(1, Math.max(0, start.fy - (ev.clientY - start.y) / frame.dispH)), frame.dispH);
      setGuides({ x: sx.on, y: sy.on });
      onFocus(+sx.v.toFixed(3), +sy.v.toFixed(3));
    };
    const up = () => { setGuides(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }
  function toggleSound() {
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) {
      v.muted = next;
      if (!next) v.play().catch(() => {}); // ao ligar o som, garante que está tocando
    }
  }
  const fmt = (t) => `${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;

  return (
    <div style={{ marginTop: 6 }} ref={wrapRef}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>
        PRÉVIA{videoUrl ? ' · NO SEU VÍDEO, COM OS RECURSOS ESCOLHIDOS' : ' DA LEGENDA'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg, #1b2436, #0c0c16)', border: `1px solid ${C.border}` }}>
          {videoUrl ? (
            <>
              <div ref={motionRef} style={{ position: 'absolute', inset: 0, transition: 'transform .35s ease' }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  autoPlay
                  muted={muted}
                  loop
                  playsInline
                  onClick={togglePlay}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onLoadedMetadata={(e) => { const v = e.currentTarget; v.playbackRate = speed; setDur(v.duration || 0); if (v.videoWidth && v.videoHeight) { setNatural(v.videoWidth / v.videoHeight); setDims({ w: v.videoWidth, h: v.videoHeight }); } }}
                  style={frame ? { position: 'absolute', left: frame.left, top: frame.top, width: frame.dispW, height: frame.dispH, maxWidth: 'none', objectFit: 'fill', display: 'block', filter, cursor: 'pointer' } : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter, cursor: 'pointer' }}
                />
              </div>
              {onFocus && frame && (
                <div title="Arraste o vídeo para posicionar" onPointerDown={startPan}
                  style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none', boxShadow: `inset 0 0 0 2px ${C.orange}`, borderRadius: 14 }}>
                  <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: 6 }}>arraste o vídeo para posicionar</span>
                </div>
              )}
              {guides && <SnapGuides x={guides.x} y={guides.y} />}
              {lookCss.tint && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...lookCss.tint }} />}
              {adj.tint && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...adj.tint }} />}
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 120%, rgba(255,107,53,0.18), transparent 60%)' }} />
          )}
          {options.captions !== false && <CaptionOverlay clock={clock} segments={SAMPLE_SEGS} options={options} box={{ x: 0, y: 0, w, h }} />}
          {videoUrl && muted && (
            <button onClick={toggleSound} style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 999, padding: '7px 13px', background: 'rgba(0,0,0,0.62)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(6px)', whiteSpace: 'nowrap' }}>
              🔊 Ouvir com som
            </button>
          )}
          {videoUrl && (
            <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
              <button onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Tocar'} style={ctlBtn}>{playing ? '❚❚' : '▶'}</button>
              <div onPointerDown={(e) => { const v = videoRef.current; if (!v || !dur) return; const r = e.currentTarget.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur)); }}
                style={{ flex: 1, height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ position: 'relative', width: '100%', height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${dur ? (cur / dur) * 100 : 0}%`, borderRadius: 3, background: 'linear-gradient(90deg, #FF8A2A, #C2410C)' }} />
                </div>
              </div>
              <span style={{ fontSize: 10.5, color: '#fff', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(cur)}/{fmt(dur)}</span>
              <button onClick={toggleSound} aria-label={muted ? 'Ligar o som' : 'Tirar o som'} style={ctlBtn}>{muted ? '🔇' : '🔊'}</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
        {videoUrl
          ? [
            speed !== 1 ? `${String(speed).replace('.', ',')}×` : null,
            options.colorLook && options.colorLook !== 'none' ? 'cor' : null,
            motion ? 'zoom' : null,
            options.soundEffects ? 'efeitos sonoros' : null,
            options.captions === false ? 'sem legenda' : `legenda ${look.mode === 'word' ? 'palavra por palavra' : 'por frase'} (texto de exemplo)`,
          ].filter(Boolean).join(' · ')
          : options.captions === false
            ? 'Sem legenda no vídeo'
            : `${look.fontFamily} · ${look.mode === 'word' ? 'palavra por palavra' : 'frase'} · escolha o vídeo para ver a prévia nele`}
      </div>
    </div>
  );
}

const ctlBtn = { width: 26, height: 26, flexShrink: 0, border: 'none', borderRadius: 7, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0, fontFamily: 'inherit' };

function wordsOf(seg) {
  return (seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }])
    .filter((w) => !w.removed && !w.hidden && String(w.word ?? '').trim()); // hidden: legenda apagada (a fala fica)
}

/**
 * Legenda desenhada POR CIMA do vídeo da timeline, no tempo certo, com o estilo
 * escolhido — prévia de como vai sair no render. Lê o tempo do próprio <video>
 * (requestAnimationFrame) para acompanhar palavra a palavra sem re-renderizar o editor.
 * `box` = retângulo onde o vídeo aparece dentro do player (px).
 */
export function CaptionOverlay({ videoRef, clock, segments, options, box, sample, editable = false, onDragPos, centerWindows = null }) {
  const [t, setT] = useState(0);
  const boxRef = useRef(null);
  const [guides, setGuides] = useState(null); // linhas de centralização enquanto arrasta
  // `clock` (opcional) substitui o tempo do <video> — usado na prévia com frases de exemplo.
  const clockRef = useRef(clock);
  clockRef.current = clock;
  useEffect(() => {
    let id;
    let last = -1;
    const loop = () => {
      const now = clockRef.current ? clockRef.current() : videoRef?.current?.currentTime;
      if (now != null && Math.abs(now - last) > 0.03) { last = now; setT(now); }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [videoRef]);

  // Remover pontuação, duração mínima e intervalo entre legendas — a mesma conta do render.
  const timedSegs = useMemo(() => {
    const tm = captionTiming(options);
    let segs = segments || [];
    if (tm.noPunct) segs = segs.map((s) => (s.words?.length ? { ...s, words: s.words.map((w) => ({ ...w, word: stripPunct(w.word) })) } : s));
    if (captionLook(options).mode === 'word') return segs;
    return timeSegments(segs, { minDur: tm.minDur, gap: tm.gap }, (s) => wordsOf(s).length > 0);
  }, [segments, options]);

  if (!box || box.h < 10) return null;
  // Guia das áreas cobertas pelos botões/textos do Instagram e TikTok (só editando, vídeo vertical).
  const guide = (
    <>
      {editable && isVerticalFrame(box.w, box.h) && <SafeZoneGuide box={box} />}
      {guides && <SnapGuides box={box} x={guides.x} y={guides.y} />}
    </>
  );
  const look = captionLook(options);
  const T = look.T;
  const fontPx = Math.max(4, T.size * box.h * look.scale);

  // Frase ativa no instante t; sem fala agora e `sample` ligado → mostra a 1ª frase como exemplo.
  let seg = timedSegs.find((s) => t >= s.start && t < (s.end || s.start + 0.1) && wordsOf(s).length);
  let at = t;
  if (!seg && sample) {
    seg = timedSegs.find((s) => wordsOf(s).length);
    at = seg ? wordsOf(seg)[0].start : 0;
  }
  if (!seg) return guide;
  let words = wordsOf(seg);
  // Tela dividida com B-roll: a legenda vai para o meio (linha entre as metades) — o cartão
  // nunca atravessa o começo/fim do B-roll (a mesma conta do render).
  const wins = (centerWindows || []).filter((x) => x && x.end > x.start);
  const inWin = (w) => !!w && wins.some((x) => w.start >= x.start - 0.05 && w.start < x.end);
  let segEnd = seg.end;
  if (look.mode !== 'word' && wins.length) {
    const runs = [];
    for (const w of words) {
      const inside = inWin(w);
      if (!runs.length || runs[runs.length - 1].inside !== inside) runs.push({ inside, words: [] });
      runs[runs.length - 1].words.push(w);
    }
    let ri = 0;
    while (ri + 1 < runs.length && at >= runs[ri + 1].words[0].start) ri++;
    words = runs[ri].words;
    segEnd = ri + 1 < runs.length ? runs[ri + 1].words[0].start : seg.end;
  }
  // Mesmos "cartões" do render: no máximo 1 ou 2 linhas, até N caracteres por linha.
  // Onde fica o bloco (com a área segura das redes no vídeo vertical — a mesma conta do render).
  const align = look.pos !== 'auto' ? look.pos : T.align === 8 ? 'top' : T.align === 5 ? 'center' : 'bottom';
  const safeBox = safeCaptionBox({ w: box.w, h: box.h, kind: align, marginV: look.pos === 'auto' ? T.marginV : look.pos === 'center' ? 0 : 0.12, safe: options.captionSafeZone !== false });
  const marginV = safeBox.marginV;
  if (look.mode !== 'word') {
    const maxChars = Number(options.captionMaxChars) > 0 ? Number(options.captionMaxChars) : autoMaxChars(box.w, fontPx, look.upper, T.premium ? 0.86 : safeBox.widthFrac);
    const gap = captionTiming(options).gap;
    const cards = layoutCaption(words, { lines: options.captionLines === 1 ? 1 : 2, maxChars, segEnd, gap });
    let ci = 0;
    while (ci + 1 < cards.length && at >= cards[ci + 1].words[0].start) ci++;
    if (gap > 0 && ci + 1 < cards.length && at >= cards[ci].end) return guide; // intervalo entre legendas
    words = cards[ci].words;
  }
  let wi = words.findIndex((w, i) => at >= w.start && (i + 1 >= words.length || at < words[i + 1].start));
  if (wi < 0) wi = 0;
  const inBroll = inWin(look.mode === 'word' ? words[wi] : words[0]);

  const content = <CaptionWords words={words} wi={wi} look={look} options={options} fontPx={fontPx} keyId={words[0]?.start ?? seg.start} frameW={box.w} />;

  // Posição manual (arrastada): da palavra (modo palavra) ou da frase; senão a geral.
  const wpos = (w) => (w && w.px != null && w.py != null ? { x: w.px, y: w.py } : null);
  // A posição geral cede ao meio da tela dividida enquanto o B-roll está na tela (igual ao render).
  const pos = (look.mode === 'word' ? wpos(words[wi]) : wpos(words[0]))
    || (!inBroll && options.captionX != null && options.captionY != null ? { x: options.captionX, y: options.captionY } : null);

  // Arrastar a legenda na prévia (aba Legenda): devolve o ponto (0–1) do centro do texto.
  const startDrag = (e) => {
    if (!editable || !onDragPos) return;
    e.preventDefault();
    e.stopPropagation();
    const el = boxRef.current;
    if (!el) return;
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      // gruda no centro do quadro (com a linha-guia) quando passa perto
      const sx = snapCenter(Math.min(0.94, Math.max(0.06, (ev.clientX - r.left) / r.width)), r.width, undefined, 'x');
      const sy = snapCenter(Math.min(0.96, Math.max(0.04, (ev.clientY - r.top) / r.height)), r.height, undefined, 'y');
      setGuides({ x: sx.on, y: sy.on });
      onDragPos(+sx.v.toFixed(3), +sy.v.toFixed(3), seg, words[wi]);
    };
    const up = () => { setGuides(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  };
  const dragStyle = editable && onDragPos
    ? { pointerEvents: 'auto', cursor: 'move', outline: '1.5px dashed rgba(255,255,255,0.75)', outlineOffset: 4, borderRadius: 4, touchAction: 'none' }
    : null;
  const handle = (
    <span onPointerDown={startDrag} title={editable ? 'Arraste para mover a legenda' : undefined} style={{ display: 'inline-flex', justifyContent: 'center', maxWidth: '100%', ...dragStyle }}>
      {content}
    </span>
  );

  if (pos) {
    return (
      <>
      {guide}
      <div ref={boxRef} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none', overflow: 'hidden', zIndex: 3 }}>
        <div style={{ position: 'absolute', left: pos.x * box.w, top: pos.y * box.h, transform: 'translate(-50%, -50%)', width: box.w * 0.9, display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
          {handle}
        </div>
      </div>
      </>
    );
  }
  return (
    <>
    {guide}
    <div ref={boxRef} style={{
      position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: inBroll ? 'center' : align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center',
      paddingTop: !inBroll && align === 'top' ? box.h * marginV : 0,
      paddingBottom: !inBroll && align === 'bottom' ? box.h * marginV : 0,
      boxSizing: 'border-box', overflow: 'hidden', zIndex: 3,
    }}>
      {handle}
    </div>
    </>
  );
}

/** Faixas que os botões e textos das redes cobrem (vídeo vertical), para posicionar a legenda. */
function SafeZoneGuide({ box }) {
  const z = SAFE_ZONE;
  const area = { position: 'absolute', background: 'repeating-linear-gradient(135deg, rgba(255,80,80,0.16) 0 6px, rgba(255,80,80,0.06) 6px 12px)', border: '1px dashed rgba(255,120,120,0.55)', boxSizing: 'border-box' };
  const tag = { position: 'absolute', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.45)', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' };
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none', zIndex: 3 }}>
      <div style={{ ...area, left: 0, right: 0, top: 0, height: box.h * z.top }} />
      <div style={{ ...area, left: 0, right: 0, bottom: 0, height: box.h * z.bottom }}>
        <span style={{ ...tag, right: 4, top: 3, maxWidth: '62%', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Área coberta pelo nome e pela descrição no Reels/TikTok">área da descrição</span>
      </div>
      <div style={{ ...area, right: 0, width: box.w * z.right, top: box.h * z.rightFrom, height: box.h * (Math.min(z.rightTo, 1 - z.bottom) - z.rightFrom) }} />
    </div>
  );
}

/**
 * O texto da legenda num instante (palavra `wi` sendo falada), com as mesmas regras do
 * render: modo palavra/frase, destaque da palavra falada (cor, caixa, maior, brilho,
 * sublinhado), palavra-chave (e quebra do estilo "duas linhas"), vazado e a ênfase manual.
 * `still` = sem animação (miniaturas da galeria).
 */
export function CaptionWords({ words, wi = 0, look, options, fontPx, keyId = 0, still = false, frameW = 0 }) {
  const T = look.T;
  // Miniatura (still): sem animação e com um respiro entre as palavras (letra pequena).
  const style = { ...look.textStyle(fontPx), ...(still ? { animation: 'none', wordSpacing: '0.18em' } : null) };
  const up = (w) => look.caseFn(w);
  const emStyle = (w) => (w.emColor || w.emBig
    ? { ...(w.emColor ? { color: hexOfEm(w.emColor), opacity: 1 } : null), ...(w.emBig ? { fontSize: '1.3em' } : null), display: 'inline-block' }
    : null);

  if (look.mode === 'word') {
    const w = words[wi] || words[0];
    // Auto-ajuste igual ao render: palavra longa encolhe para caber no quadro.
    let px = fontPx * (w.emBig ? 1.3 : 1);
    if (frameW && !still) {
      const avail = frameW * 0.86 - (look.useBox ? 2 * 0.28 * fontPx : 0);
      const wpx = textEm(up(w.word), look.fontFamily, look.weight) * px;
      if (wpx > avail) px = Math.max(px * 0.45, (px * avail) / wpx);
    }
    const em = emStyle(w);
    return <span key={`${keyId}-${wi}-${look.animKind}`} style={{ ...style, ...(px !== fontPx ? look.textStyle(px) : null), whiteSpace: 'nowrap', textAlign: 'center', ...(em ? { color: em.color || style.color } : null) }}>{up(w.word)}</span>;
  }

  if (T.premium) return <PremiumWords words={words} wi={still ? words.length - 1 : wi} look={look} options={options} fontPx={fontPx} still={still} />;

  const kw = T.highlightKeyword ? pickKeyword(words) : -1;
  const kwStyle = { color: look.glowOn ? undefined : look.color, fontSize: `${T.kwScale || 1.18}em`, display: 'inline-block' };
  // Quebra de linha: a do estilo "duas linhas" (palavra-chave desce) ou a do cartão (br).
  const twoLines = options.captionLines !== 1;
  const duo = T.keywordBreak && twoLines && kw >= 0 && words.length > 1;
  const breakAt = (k) => (duo ? k === kw || (kw === 0 && k === 1) : !!words[k].br);
  const { highlight, hl } = look;
  const markHex = look.accentIsWhite ? '#FFFFFF' : look.color;
  // Frase base: branca com destaque, palavra-chave, caixa ou brilho; senão na cor escolhida.
  const base = highlight || T.highlightKeyword || look.useBox ? { color: '#fff' } : null;
  const hollowOff = T.hollow ? { color: 'transparent', WebkitTextStroke: `${Math.max(1, fontPx * 0.045)}px #fff`, textShadow: 'none' } : null;
  const dimmed = (hl === 'color' && look.accentIsWhite) || T.dimOthers;

  const wordStyle = (w, k) => {
    const em = emStyle(w);
    if (em) return em;
    if (k === kw) return kwStyle;
    if (!highlight || still && k !== wi) return hollowOff || undefined;
    if (k === wi) {
      if (T.hollow) return { color: look.accentIsWhite ? '#fff' : look.color };
      if (hl === 'box') {
        return { background: markHex, color: isLightHex(markHex) ? '#111' : '#fff', textShadow: 'none', padding: '0 0.1em', margin: '0 -0.1em', borderRadius: '0.1em', display: 'inline-block' };
      }
      if (hl === 'glow') return { color: '#fff', textShadow: `0 0 ${fontPx * 0.1}px ${look.color}, 0 0 ${fontPx * 0.22}px ${look.color}, 0 0 ${fontPx * 0.35}px ${look.color}` };
      if (hl === 'underline') {
        return { color: '#fff', textDecorationLine: 'underline', textDecorationColor: markHex, textDecorationThickness: '0.08em', textUnderlineOffset: '0.12em', textDecorationSkipInk: 'none' };
      }
      const col = T.highlightKeyword || look.accentIsWhite || look.glowOn ? '#fff' : look.color;
      if (hl === 'scale') return { color: col, fontSize: '1.18em', lineHeight: LINE_HEIGHT / 1.18, display: 'inline-block' };
      return { color: col };
    }
    if (T.hollow) return hollowOff;
    if (dimmed) return { opacity: T.dimOthers ? 0.62 : 0.56 };
    return undefined;
  };

  // Máquina de escrever: as palavras futuras ficam escondidas (ocupam o espaço, como no
  // render); a da vez digita letra a letra no tempo da palavra; o cursor pisca no fim.
  const typing = look.animKind === 'typewriter';
  const cur = still ? words.length : wi;
  // cursor depois de cada palavra: pisca só na palavra da vez; fora dela fica escondido (mesmo espaço)
  const cursorOf = (k) => (k === cur && !still
    ? <span style={{ animation: 'rf-blink 1s steps(1) infinite' }}>|</span>
    : <span style={{ visibility: 'hidden' }}>|</span>);
  const typeWord = (w, k) => {
    if (k > cur) return <>{<span style={{ visibility: 'hidden' }}>{up(w.word)}</span>}{cursorOf(k)}</>;
    if (k < cur) return <>{up(w.word)}{cursorOf(k)}</>;
    const chars = [...up(w.word)];
    const dur = Math.max(0, (k + 1 < words.length ? words[k + 1].start : w.end) - w.start);
    return (
      <>
        {chars.map((c, ci) => <span key={`${wi}-${ci}`} style={{ animation: 'rf-tw .01s linear both', animationDelay: `${((dur * ci) / chars.length).toFixed(3)}s` }}>{c}</span>)}
        {cursorOf(k)}
      </>
    );
  };

  return (
    <span key={`${keyId}-${look.animKind}`} style={{ ...style, ...base, maxWidth: still ? '90%' : 'none', whiteSpace: still ? 'normal' : 'nowrap', textAlign: 'center' }}>
      {words.map((w, k) => (
        <React.Fragment key={k}>
          {k > 0 ? (breakAt(k) ? <br /> : ' ') : ''}
          <span style={wordStyle(w, k)}>{typing ? typeWord(w, k) : up(w.word)}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

/** Cor de ênfase manual: id da paleta ou "#RRGGBB". */
const hexOfEm = (v) => `#${colorHex(v)}`;

/** Mistura uma cor (#RRGGBB) com o branco — igual ao render. */
function tintHex(hex, t) {
  const h = hex.replace('#', '');
  return `#${[0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - t) + 255 * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Premium (prévia): mesmo bloco de até 4 palavras do render; as já faladas aparecem, a
 * da vez entra (desfoque + esticada nas grandes) e as próximas ficam reservadas.
 */
function PremiumWords({ words, wi, look, options, fontPx, still }) {
  const chunks = premiumChunks(words, 0);
  let off = 0;
  let ch = chunks[0];
  for (const c of chunks) {
    if (wi < off + c.words.length) { ch = c; break; }
    off += c.words.length;
  }
  const local = wi - off;
  const glowHex = look.accentIsWhite ? '#C6F25A' : look.color;
  const fill = tintHex(glowHex, look.accentIsWhite ? 0.72 : 0.55);
  const small = Math.max(6, Math.round(fontPx * 0.5));
  const span = (wd, j) => {
    const big = j >= ch.big;
    const glow = big && ch.glow;
    const em = wd.emColor ? hexOfEm(wd.emColor) : null;
    const base = !big
      ? { fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: small, color: em || '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)', letterSpacing: 0 }
      : glow
        ? { fontFamily: `'${look.fontFamily}', system-ui, sans-serif`, fontWeight: 400, fontSize: wd.emBig ? '1.3em' : '1em', color: em || fill, textShadow: `0 0 ${fontPx * 0.12}px ${em || glowHex}, 0 0 ${fontPx * 0.3}px ${em || glowHex}` }
        : { fontFamily: `'${look.fontFamily}', system-ui, sans-serif`, fontWeight: 400, fontSize: '0.78em', color: em || '#fff', textShadow: '0 2px 4px rgba(0,0,0,.55)' };
    const vis = j < local || still ? null
      : j === local ? { animation: big ? 'rf-blurin .22s ease-out both' : 'rf-fade .15s ease both' }
        : { visibility: 'hidden' };
    return <span key={j} style={{ display: 'inline-block', ...base, ...vis }}>{wd.word}</span>;
  };
  const top = ch.words.slice(0, ch.big);
  const bottom = ch.words.slice(ch.big);
  return (
    <span key={ch.words[0].start} style={{ display: 'inline-block', textAlign: 'center', maxWidth: '92%', lineHeight: 1.02, fontSize: fontPx, fontWeight: 800, letterSpacing: 0 }}>
      {top.length > 0 && <span style={{ display: 'block' }}>{top.map((wd, j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}{span(wd, j)}</React.Fragment>)}</span>}
      <span style={{ display: 'block' }}>{bottom.map((wd, j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}{span(wd, ch.big + j)}</React.Fragment>)}</span>
    </span>
  );
}
