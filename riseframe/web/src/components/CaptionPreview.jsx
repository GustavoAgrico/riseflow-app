import React, { useEffect, useState } from 'react';
import { C } from '../theme.js';

// Espelha o servidor: cada estilo tem fonte e animação padrão.
const TPL = {
  clean: { mode: 'phrase', font: 'Poppins', anim: 'fade', upper: false, size: 30 },
  pop: { mode: 'word', font: 'Anton', anim: 'pop', upper: true, size: 46 },
  hormozi: { mode: 'word', font: 'Anton', anim: 'pop', upper: true, size: 50 },
  box: { mode: 'word', font: 'Archivo Black', anim: 'pop', upper: true, size: 42, box: true },
  neon: { mode: 'phrase', font: 'Poppins', anim: 'fade', upper: false, size: 32, glow: true },
  bounce: { mode: 'word', font: 'Luckiest Guy', anim: 'bounce', upper: true, size: 46 },
  keyword: { mode: 'phrase', font: 'Poppins', anim: 'pop', upper: true, size: 34, highlightKeyword: true },
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

const SAMPLE = ['ISSO', 'MUDA', 'TUDO', 'AGORA'];
const SAMPLE_PHRASE = 'isso muda tudo agora';
// Índice da palavra-chave na frase de exemplo (destaque do estilo "keyword").
const KW_INDEX = 3; // "agora"

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

export default function CaptionPreview({ options }) {
  const { tplKey, T, fontFamily, animKind, color, scale, bg, glowOn, mode, pos, vAlign, textStyle: styleFor } = captionLook(options);

  const [i, setI] = useState(0);
  // No modo palavra, cicla as palavras para dar a sensação de dinâmica.
  useEffect(() => {
    if (mode !== 'word') return undefined;
    const id = setInterval(() => setI((v) => (v + 1) % SAMPLE.length), 900);
    return () => clearInterval(id);
  }, [mode, tplKey, animKind]);
  // reinicia o ciclo de frase para reanimar
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (mode === 'word') return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 1800);
    return () => clearInterval(id);
  }, [mode, tplKey, animKind]);

  const textStyle = styleFor(Math.round(T.size * scale));

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>PRÉVIA DA LEGENDA</div>
      <div
        style={{
          position: 'relative', height: 150, borderRadius: 14, overflow: 'hidden',
          background: 'linear-gradient(135deg, #1b2436, #0c0c16)',
          display: 'flex', alignItems: vAlign, justifyContent: 'center',
          padding: pos === 'auto' ? 0 : '14px 0',
          boxSizing: 'border-box',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 120%, rgba(255,107,53,0.18), transparent 60%)' }} />
        {mode === 'word' ? (
          <span key={`${i}-${animKind}-${fontFamily}`} style={textStyle}>{SAMPLE[i]}</span>
        ) : T.highlightKeyword ? (
          <span key={`${tick}-${animKind}-${fontFamily}`} style={{ ...textStyle, color: '#FFFFFF', maxWidth: '86%', textAlign: 'center' }}>
            {SAMPLE_PHRASE.split(' ').map((wd, k) => (
              <React.Fragment key={k}>
                {k > 0 ? ' ' : ''}
                <span style={k === KW_INDEX ? { color: glowOn ? undefined : color, fontSize: '1.18em', display: 'inline-block' } : undefined}>{wd}</span>
              </React.Fragment>
            ))}
          </span>
        ) : (
          <span key={`${tick}-${animKind}-${fontFamily}`} style={{ ...textStyle, maxWidth: '86%', textAlign: 'center' }}>{SAMPLE_PHRASE}</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
        {fontFamily} · {options.captionColor || 'white'} · {animKind} · {{ box: 'caixa', bar: 'barra', glow: 'brilho', none: 'sem sombra', clean: 'limpo' }[bg] || 'sombra'} · {mode === 'word' ? 'palavra' : 'frase'}
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
export function CaptionOverlay({ videoRef, segments, options, box, sample }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let id;
    let last = -1;
    const loop = () => {
      const v = videoRef.current;
      if (v && Math.abs(v.currentTime - last) > 0.03) { last = v.currentTime; setT(v.currentTime); }
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
  const style = look.textStyle(fontPx);
  const up = (w) => (look.T.upper ? String(w).toUpperCase() : w);

  let content;
  if (look.mode === 'word') {
    content = <span key={`${seg.start}-${wi}-${look.animKind}`} style={{ ...style, maxWidth: '92%', textAlign: 'center' }}>{up(words[wi].word)}</span>;
  } else {
    const white = (options.captionColor || 'white') === 'white';
    content = (
      <span key={`${seg.start}-${look.animKind}`} style={{ ...style, color: '#fff', maxWidth: '90%', textAlign: 'center' }}>
        {words.map((w, k) => (
          <React.Fragment key={k}>
            {k > 0 ? ' ' : ''}
            <span style={k === wi ? { color: white || look.glowOn ? '#fff' : look.color } : white ? { opacity: 0.55 } : undefined}>{up(w.word)}</span>
          </React.Fragment>
        ))}
      </span>
    );
  }

  return (
    <div style={{
      position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center',
      paddingTop: align === 'top' ? box.h * marginV : 0,
      paddingBottom: align === 'bottom' ? box.h * marginV : 0,
      boxSizing: 'border-box', overflow: 'hidden', zIndex: 1,
    }}>
      {content}
    </div>
  );
}
