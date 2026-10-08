import React, { useEffect, useRef, useState } from 'react';
import { C } from '../theme.js';
import { pickKeyword } from '../../../shared/captionKeyword.js';

// Espelha o servidor: cada estilo tem fonte e animação padrão.
const TPL = {
  clean: { mode: 'phrase', font: 'Poppins', anim: 'fade', upper: false, size: 30 },
  pop: { mode: 'word', font: 'Anton', anim: 'pop', upper: true, size: 46 },
  hormozi: { mode: 'word', font: 'Anton', anim: 'pop', upper: true, size: 50 },
  box: { mode: 'word', font: 'Archivo Black', anim: 'pop', upper: true, size: 42, box: true },
  neon: { mode: 'phrase', font: 'Poppins', anim: 'fade', upper: false, size: 32, glow: true },
  bounce: { mode: 'word', font: 'Luckiest Guy', anim: 'bounce', upper: true, size: 46 },
  keyword: { mode: 'phrase', font: 'Poppins', anim: 'pop', upper: true, size: 34, highlightKeyword: true },
  karaoke: { mode: 'phrase', font: 'Montserrat', anim: 'fade', upper: true, size: 32, forceHighlight: true },
  marker: { mode: 'phrase', font: 'Poppins', anim: 'fade', upper: true, size: 31, marker: true },
  duo: { mode: 'phrase', font: 'Archivo Black', anim: 'pop', upper: true, size: 31, highlightKeyword: true, keywordBreak: true, kwScale: 1.35 },
  minimal: { mode: 'phrase', font: 'Poppins', anim: 'fade', upper: false, size: 27, forceHighlight: true, dimOthers: true },
};
const FONT_FAMILY = {
  montserrat: 'Montserrat', gotham: 'Poppins', helvetica: 'Arimo',
  poppins: 'Poppins', inter: 'Inter', opensans: 'Open Sans', anton: 'Anton',
  bebas: 'Bebas Neue', archivo: 'Archivo Black', garamond: 'EB Garamond', luckiest: 'Luckiest Guy',
};
const COLOR_HEX = {
  white: '#FFFFFF', yellow: '#FFE24B', orange: '#FF6B35', purple: '#9F67FF',
  green: '#2ED47A', cyan: '#22D3EE', pink: '#FF5CA8', red: '#F0526B',
};
const ANIM_CSS = {
  fade: 'rf-fade .5s ease both', pop: 'rf-pop .35s ease both', bounce: 'rf-bounce .5s ease both',
  zoom: 'rf-zoom .4s ease both', 'pop-rot': 'rf-pop-rot .45s ease both', shake: 'rf-shake .5s ease both', none: 'none',
};


/**
 * Visual da legenda (fonte, cor, fundo, animação, modo, posição) a partir das opções.
 * `textStyle(fontPx)` monta o estilo do texto. Usado na prévia de exemplo e na legenda
 * desenhada por cima do vídeo na timeline.
 */
export function captionLook(options) {
  const tplKey = TPL[options.captionTemplate] ? options.captionTemplate : 'clean';
  const T = TPL[tplKey];
  const fontFamily = options.captionFont && options.captionFont !== 'auto' ? FONT_FAMILY[options.captionFont] : T.font;
  const animKind = options.captionAnimation && options.captionAnimation !== 'auto' ? options.captionAnimation : T.anim;
  const anim = ANIM_CSS[animKind] || ANIM_CSS.fade;
  const color = COLOR_HEX[options.captionColor] || '#FFFFFF';
  const scale = options.captionScale || 1;
  const bg = ['shadow', 'box', 'bar', 'glow', 'none', 'clean'].includes(options.captionBackground)
    ? options.captionBackground
    : (T.box ? 'box' : 'shadow');
  const useBox = bg === 'box' || bg === 'bar';
  const glowOn = bg === 'glow' || (options.captionBackground == null && T.glow) || (options.captionBackground === 'auto' && T.glow);
  const mode = ['word', 'phrase'].includes(options.captionMode) ? options.captionMode : T.mode;
  const pos = ['top', 'center', 'bottom'].includes(options.captionPosition) ? options.captionPosition : 'auto';
  const vAlign = pos === 'top' ? 'flex-start' : pos === 'bottom' ? 'flex-end' : 'center';

  function textStyle(fontPx) {
    const outline = Math.max(1, Math.round(fontPx * 0.09));
    const shadow = `0 2px 6px rgba(0,0,0,.5)`;
    const stroke = `-${outline}px 0 #000, ${outline}px 0 #000, 0 -${outline}px #000, 0 ${outline}px #000,` +
      `-${outline}px -${outline}px #000, ${outline}px ${outline}px #000, -${outline}px ${outline}px #000, ${outline}px -${outline}px #000`;
    const baseShadow = glowOn
      ? `0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}, ${stroke}`
      : bg === 'clean' ? shadow
        : bg === 'none' ? stroke : `${stroke}, ${shadow}`;
    return {
      fontFamily: `'${fontFamily}', system-ui, sans-serif`,
      fontWeight: 800,
      fontSize: fontPx,
      lineHeight: 1.1,
      color: glowOn ? '#fff' : color,
      textShadow: baseShadow,
      textTransform: T.upper ? 'uppercase' : 'none',
      letterSpacing: fontFamily === 'Bebas Neue' ? 1 : -0.3,
      display: 'inline-block',
      padding: useBox ? `${Math.max(1, Math.round(fontPx * 0.05))}px ${Math.round(fontPx * 0.28)}px` : 0,
      ...(useBox
        ? bg === 'bar'
          ? { background: 'rgba(16,16,20,0.55)', color: '#fff', textShadow: 'none', borderRadius: 6 }
          : mode === 'phrase'
            ? { background: '#101014', color: '#fff', textShadow: 'none', borderRadius: 6 }
            : { background: options.captionColor === 'white' ? '#fff' : color, color: options.captionColor === 'white' ? '#111' : '#fff', textShadow: 'none', borderRadius: 6 }
        : { background: 'transparent' }),
      animation: anim,
    };
  }

  return { tplKey, T, fontFamily, animKind, anim, color, scale, bg, useBox, glowOn, mode, pos, vAlign, textStyle };
}

// Frases de exemplo da prévia (tempos em segundos, repetem em loop).
const SAMPLE_LINES = ['Esse é o seu vídeo', 'com a legenda pronta', 'do jeito que vai sair'];
const SAMPLE_SEGS = (() => {
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
const SAMPLE_DUR = SAMPLE_SEGS[SAMPLE_SEGS.length - 1].end + 0.3;
const RATIOS = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9, '4:5': 4 / 5 };

/**
 * Prévia da legenda ANTES de editar: o próprio vídeo do usuário (quando já escolhido)
 * no formato escolhido, com frases de exemplo no estilo selecionado — igual ao render.
 */
export default function CaptionPreview({ options, videoUrl }) {
  const wrapRef = useRef(null);
  const [availW, setAvailW] = useState(320);
  const [natural, setNatural] = useState(null); // proporção do vídeo (formato "original")
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth || 320));
    ro.observe(el);
    setAvailW(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);
  const ratio = RATIOS[options.aspect] || natural || 9 / 16;
  const h = Math.round(Math.min(ratio >= 1 ? 240 : 380, availW / ratio));
  const w = Math.round(h * ratio);
  const startedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const clock = () => ((performance.now() - startedAt.current) / 1000) % SAMPLE_DUR;
  const look = captionLook(options);

  return (
    <div style={{ marginTop: 6 }} ref={wrapRef}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>
        PRÉVIA DA LEGENDA{videoUrl ? ' · NO SEU VÍDEO' : ''}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg, #1b2436, #0c0c16)', border: `1px solid ${C.border}` }}>
          {videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              muted
              loop
              playsInline
              onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setNatural(v.videoWidth / v.videoHeight); }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 120%, rgba(255,107,53,0.18), transparent 60%)' }} />
          )}
          {options.captions !== false && <CaptionOverlay clock={clock} segments={SAMPLE_SEGS} options={options} box={{ x: 0, y: 0, w, h }} />}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6, textAlign: 'center' }}>
        {options.captions === false
          ? 'Sem legenda no vídeo'
          : `${look.fontFamily} · ${look.mode === 'word' ? 'palavra por palavra' : 'frase'}${videoUrl ? '' : ' · escolha o vídeo para ver a prévia nele'}`}
      </div>
    </div>
  );
}

// Tamanho (fração da altura do vídeo), alinhamento e margem de cada estilo — iguais
// aos do servidor (pipeline/captions.js), para a legenda sobre o vídeo bater com o render.
const SERVER_TPL = {
  clean: { size: 0.062, align: 'bottom', marginV: 0.14 },
  pop: { size: 0.088, align: 'center', marginV: 0 },
  hormozi: { size: 0.1, align: 'bottom', marginV: 0.17 },
  box: { size: 0.082, align: 'center', marginV: 0 },
  neon: { size: 0.066, align: 'bottom', marginV: 0.14 },
  bounce: { size: 0.092, align: 'center', marginV: 0 },
  keyword: { size: 0.07, align: 'bottom', marginV: 0.15 },
  karaoke: { size: 0.066, align: 'bottom', marginV: 0.15 },
  marker: { size: 0.064, align: 'bottom', marginV: 0.15 },
  duo: { size: 0.064, align: 'bottom', marginV: 0.15 },
  minimal: { size: 0.056, align: 'bottom', marginV: 0.14 },
};

function wordsOf(seg) {
  return (seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }])
    .filter((w) => !w.removed && String(w.word ?? '').trim());
}

/**
 * Legenda desenhada POR CIMA do vídeo da timeline, no tempo certo, com o estilo
 * escolhido — prévia de como vai sair no render. Lê o tempo do próprio <video>
 * (requestAnimationFrame) para acompanhar palavra a palavra sem re-renderizar o editor.
 * `box` = retângulo onde o vídeo aparece dentro do player (px).
 */
export function CaptionOverlay({ videoRef, clock, segments, options, box, sample, editable = false, onDragPos }) {
  const [t, setT] = useState(0);
  const boxRef = useRef(null);
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

  if (!box || box.h < 10) return null;
  const look = captionLook(options);
  const S = SERVER_TPL[look.tplKey] || SERVER_TPL.clean;
  const fontPx = Math.max(8, Math.round(S.size * box.h * look.scale));

  // Frase ativa no instante t; sem fala agora e `sample` ligado → mostra a 1ª frase como exemplo.
  let seg = (segments || []).find((s) => t >= s.start && t < (s.end || s.start + 0.1) && wordsOf(s).length);
  let at = t;
  if (!seg && sample) {
    seg = (segments || []).find((s) => wordsOf(s).length);
    at = seg ? wordsOf(seg)[0].start : 0;
  }
  if (!seg) return null;
  const words = wordsOf(seg);
  let wi = words.findIndex((w, i) => at >= w.start && (i + 1 >= words.length || at < words[i + 1].start));
  if (wi < 0) wi = 0;

  const align = look.pos === 'top' ? 'top' : look.pos === 'center' ? 'center' : look.pos === 'bottom' ? 'bottom' : S.align;
  const marginV = look.pos === 'auto' ? S.marginV : 0.12;
  const content = <CaptionWords words={words} wi={wi} look={look} options={options} fontPx={fontPx} keyId={seg.start} />;

  // Posição manual (arrastada): da palavra (modo palavra) ou da frase; senão a geral.
  const wpos = (w) => (w && w.px != null && w.py != null ? { x: w.px, y: w.py } : null);
  const pos = (look.mode === 'word' ? wpos(words[wi]) : wpos(words[0]))
    || (options.captionX != null && options.captionY != null ? { x: options.captionX, y: options.captionY } : null);

  // Arrastar a legenda na prévia (aba Legenda): devolve o ponto (0–1) do centro do texto.
  const startDrag = (e) => {
    if (!editable || !onDragPos) return;
    e.preventDefault();
    e.stopPropagation();
    const el = boxRef.current;
    if (!el) return;
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(0.94, Math.max(0.06, (ev.clientX - r.left) / r.width));
      const y = Math.min(0.96, Math.max(0.04, (ev.clientY - r.top) / r.height));
      onDragPos(+x.toFixed(3), +y.toFixed(3), seg, words[wi]);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
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
      <div ref={boxRef} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
        <div style={{ position: 'absolute', left: pos.x * box.w, top: pos.y * box.h, transform: 'translate(-50%, -50%)', width: box.w * 0.9, display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
          {handle}
        </div>
      </div>
    );
  }
  return (
    <div ref={boxRef} style={{
      position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center',
      paddingTop: align === 'top' ? box.h * marginV : 0,
      paddingBottom: align === 'bottom' ? box.h * marginV : 0,
      boxSizing: 'border-box', overflow: 'hidden', zIndex: 1,
    }}>
      {handle}
    </div>
  );
}

const LIGHT = new Set(['white', 'yellow', 'green', 'cyan']);

/**
 * O texto da legenda num instante (palavra `wi` sendo falada), com as mesmas regras do
 * render: modo palavra/frase, destaque da palavra falada, palavra-chave (e quebra de
 * linha do estilo "duas linhas"), marca-texto e a ênfase manual de cada palavra.
 * `still` = sem animação (miniaturas da galeria).
 */
export function CaptionWords({ words, wi = 0, look, options, fontPx, keyId = 0, still = false }) {
  const T = look.T;
  // Miniatura (still): sem animação e com um respiro entre as palavras (letra pequena).
  const style = { ...look.textStyle(fontPx), ...(still ? { animation: 'none', wordSpacing: '0.18em' } : null) };
  const up = (w) => (T.upper ? String(w).toUpperCase() : w);
  const colorId = options.captionColor || 'white';
  const emStyle = (w) => (w.emColor || w.emBig
    ? { ...(w.emColor ? { color: COLOR_HEX[w.emColor], opacity: 1 } : null), ...(w.emBig ? { fontSize: '1.3em' } : null), display: 'inline-block' }
    : null);

  if (look.mode === 'word') {
    const w = words[wi] || words[0];
    return <span key={`${keyId}-${wi}-${look.animKind}`} style={{ ...style, maxWidth: '92%', textAlign: 'center', ...emStyle(w) }}>{up(w.word)}</span>;
  }

  const kw = T.highlightKeyword ? pickKeyword(words) : -1;
  const kwStyle = { color: look.glowOn ? undefined : look.color, fontSize: `${T.kwScale || 1.18}em`, display: 'inline-block' };
  const breakAt = (k) => T.keywordBreak && (k === kw || (kw === 0 && k === 1));
  const highlight = options.captionHighlight === true || !!T.forceHighlight;
  // Nos estilos de palavra-chave e no marca-texto a frase fica branca.
  const base = T.highlightKeyword || T.marker ? { color: '#fff' } : null;

  const wordStyle = (w, k) => {
    const em = emStyle(w);
    if (em) return em;
    if (T.marker && k === wi) {
      return {
        background: look.color, color: LIGHT.has(colorId) ? '#111' : '#fff', textShadow: 'none',
        padding: '0 0.1em', borderRadius: 3, display: 'inline-block',
      };
    }
    if (k === kw) return kwStyle;
    if (!highlight || T.marker) return undefined;
    if (k === wi) return T.highlightKeyword || colorId === 'white' || look.glowOn ? { color: '#fff' } : { color: look.color };
    if (colorId === 'white' || T.dimOthers) return { opacity: T.dimOthers ? 0.62 : 0.55 };
    return undefined;
  };

  return (
    <span key={`${keyId}-${look.animKind}`} style={{ ...style, ...(highlight ? { color: '#fff' } : null), ...base, maxWidth: '90%', textAlign: 'center' }}>
      {words.map((w, k) => (
        <React.Fragment key={k}>
          {k > 0 ? (breakAt(k) ? <br /> : ' ') : ''}
          <span style={wordStyle(w, k)}>{up(w.word)}</span>
        </React.Fragment>
      ))}
    </span>
  );
}
