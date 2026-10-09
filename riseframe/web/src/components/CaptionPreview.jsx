import React, { useEffect, useRef, useState } from 'react';
import { C } from '../theme.js';
import { motionAt, playWhoosh, LOOK_CSS, colorAdjustCss } from '../livePreview.js';
import { pickKeyword, premiumChunks, layoutCaption, autoMaxChars } from '../../../shared/captionKeyword.js';

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
  premium: { mode: 'phrase', font: 'Archivo Black', anim: 'fade', upper: false, size: 34, premium: true },
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
export default function CaptionPreview({ options, videoUrl }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const motionRef = useRef(null);
  const [availW, setAvailW] = useState(320);
  const [natural, setNatural] = useState(null); // proporção do vídeo (formato "original")
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
                  onLoadedMetadata={(e) => { const v = e.currentTarget; v.playbackRate = speed; setDur(v.duration || 0); if (v.videoWidth && v.videoHeight) setNatural(v.videoWidth / v.videoHeight); }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter, cursor: 'pointer' }}
                />
              </div>
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
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${dur ? (cur / dur) * 100 : 0}%`, borderRadius: 3, background: 'linear-gradient(90deg, #FF6B35, #7C3AED)' }} />
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
  premium: { size: 0.08, align: 'bottom', marginV: 0.2 },
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
  let words = wordsOf(seg);
  // Mesmos "cartões" do render: no máximo 1 ou 2 linhas, até N caracteres por linha.
  if (look.mode !== 'word') {
    const maxChars = Number(options.captionMaxChars) > 0 ? Number(options.captionMaxChars) : autoMaxChars(box.w, fontPx, look.T.upper);
    const cards = layoutCaption(words, { lines: options.captionLines === 1 ? 1 : 2, maxChars, segEnd: seg.end });
    words = (cards.find((c, i) => at < c.end || i === cards.length - 1) || cards[0]).words;
  }
  let wi = words.findIndex((w, i) => at >= w.start && (i + 1 >= words.length || at < words[i + 1].start));
  if (wi < 0) wi = 0;

  const align = look.pos === 'top' ? 'top' : look.pos === 'center' ? 'center' : look.pos === 'bottom' ? 'bottom' : S.align;
  const marginV = look.pos === 'auto' ? S.marginV : 0.12;
  const content = <CaptionWords words={words} wi={wi} look={look} options={options} fontPx={fontPx} keyId={words[0]?.start ?? seg.start} />;

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

  if (T.premium) return <PremiumWords words={words} wi={still ? words.length - 1 : wi} look={look} options={options} fontPx={fontPx} still={still} />;

  const kw = T.highlightKeyword ? pickKeyword(words) : -1;
  const kwStyle = { color: look.glowOn ? undefined : look.color, fontSize: `${T.kwScale || 1.18}em`, display: 'inline-block' };
  // Quebra de linha: a do estilo "duas linhas" (palavra-chave desce) ou a do cartão (br).
  const twoLines = options.captionLines !== 1;
  const duo = T.keywordBreak && twoLines && kw >= 0 && words.length > 1;
  const breakAt = (k) => (duo ? k === kw || (kw === 0 && k === 1) : !!words[k].br);
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
    <span key={`${keyId}-${look.animKind}`} style={{ ...style, ...(highlight ? { color: '#fff' } : null), ...base, maxWidth: still ? '90%' : 'none', whiteSpace: still ? 'normal' : 'nowrap', textAlign: 'center' }}>
      {words.map((w, k) => (
        <React.Fragment key={k}>
          {k > 0 ? (breakAt(k) ? <br /> : ' ') : ''}
          <span style={wordStyle(w, k)}>{up(w.word)}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

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
  const colorId = options.captionColor || 'white';
  const glowHex = colorId === 'white' ? '#C6F25A' : look.color;
  const fill = tintHex(glowHex, colorId === 'white' ? 0.72 : 0.55);
  const small = Math.max(6, Math.round(fontPx * 0.5));
  const span = (wd, j) => {
    const big = j >= ch.big;
    const glow = big && ch.glow;
    const em = wd.emColor ? COLOR_HEX[wd.emColor] : null;
    const base = !big
      ? { fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600, fontSize: small, color: em || '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)', letterSpacing: 0 }
      : glow
        ? { fontFamily: `'${look.fontFamily}', system-ui, sans-serif`, fontSize: wd.emBig ? '1.3em' : '1em', color: em || fill, textShadow: `0 0 ${fontPx * 0.12}px ${em || glowHex}, 0 0 ${fontPx * 0.3}px ${em || glowHex}` }
        : { fontFamily: `'${look.fontFamily}', system-ui, sans-serif`, fontSize: '0.78em', color: em || '#fff', textShadow: '0 2px 4px rgba(0,0,0,.55)' };
    const vis = j < local || still ? null
      : j === local ? { animation: big ? 'rf-blurin .22s ease-out both' : 'rf-fade .15s ease both' }
        : { visibility: 'hidden' };
    return <span key={j} style={{ display: 'inline-block', ...base, ...vis }}>{wd.word}</span>;
  };
  const top = ch.words.slice(0, ch.big);
  const bottom = ch.words.slice(ch.big);
  return (
    <span key={ch.words[0].start} style={{ display: 'inline-block', textAlign: 'center', maxWidth: '92%', lineHeight: 1.02, fontSize: fontPx, fontWeight: 800, letterSpacing: -0.3 }}>
      {top.length > 0 && <span style={{ display: 'block' }}>{top.map((wd, j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}{span(wd, j)}</React.Fragment>)}</span>}
      <span style={{ display: 'block' }}>{bottom.map((wd, j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}{span(wd, ch.big + j)}</React.Fragment>)}</span>
    </span>
  );
}
