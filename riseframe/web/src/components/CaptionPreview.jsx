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

export default function CaptionPreview({ options }) {
  const tplKey = TPL[options.captionTemplate] ? options.captionTemplate : 'clean';
  const T = TPL[tplKey];
  const fontFamily = options.captionFont && options.captionFont !== 'auto' ? FONT_FAMILY[options.captionFont] : T.font;
  const animKind = options.captionAnimation && options.captionAnimation !== 'auto' ? options.captionAnimation : T.anim;
  const anim = ANIM_CSS[animKind] || ANIM_CSS.fade;
  const color = COLOR_HEX[options.captionColor] || '#FFFFFF';
  const scale = options.captionScale || 1;
  // Fundo do texto (escolha manual): sombra | caixa | sem sombra. 'auto' segue o estilo.
  const bg = ['shadow', 'box', 'none'].includes(options.captionBackground)
    ? options.captionBackground
    : (T.box ? 'box' : 'shadow');
  const useBox = bg === 'box';

  const [i, setI] = useState(0);
  // No modo palavra, cicla as palavras para dar a sensação de dinâmica.
  useEffect(() => {
    if (T.mode !== 'word') return undefined;
    const id = setInterval(() => setI((v) => (v + 1) % SAMPLE.length), 900);
    return () => clearInterval(id);
  }, [T.mode, tplKey, animKind]);
  // reinicia o ciclo de frase para reanimar
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (T.mode === 'word') return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 1800);
    return () => clearInterval(id);
  }, [T.mode, tplKey, animKind]);

  const fontPx = Math.round(T.size * scale);
  const outline = Math.max(2, Math.round(fontPx * 0.09));
  const shadow = `0 2px 6px rgba(0,0,0,.5)`;
  const stroke = `-${outline}px 0 #000, ${outline}px 0 #000, 0 -${outline}px #000, 0 ${outline}px #000,` +
    `-${outline}px -${outline}px #000, ${outline}px ${outline}px #000, -${outline}px ${outline}px #000, ${outline}px -${outline}px #000`;

  // Sombra: contorno + sombra. Sem sombra: só contorno. Neon mantém o glow.
  const baseShadow = T.glow
    ? `0 0 12px ${color}, 0 0 22px ${color}, ${stroke}`
    : bg === 'none' ? stroke : `${stroke}, ${shadow}`;
  const textStyle = {
    fontFamily: `'${fontFamily}', system-ui, sans-serif`,
    fontWeight: 800,
    fontSize: fontPx,
    lineHeight: 1.1,
    color,
    textShadow: baseShadow,
    textTransform: T.upper ? 'uppercase' : 'none',
    letterSpacing: fontFamily === 'Bebas Neue' ? 1 : -0.3,
    display: 'inline-block',
    padding: useBox ? '2px 12px' : 0,
    ...(useBox
      ? T.mode === 'phrase'
        // Frase/palavra-chave: caixa escura + texto branco (destaque colorido por cima).
        ? { background: '#101014', color: '#fff', textShadow: 'none', borderRadius: 6 }
        : { background: options.captionColor === 'white' ? '#fff' : color, color: options.captionColor === 'white' ? '#111' : '#fff', textShadow: 'none', borderRadius: 6 }
      : { background: 'transparent' }),
    animation: anim,
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>PRÉVIA DA LEGENDA</div>
      <div
        style={{
          position: 'relative', height: 150, borderRadius: 14, overflow: 'hidden',
          background: 'linear-gradient(135deg, #1b2436, #0c0c16)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 120%, rgba(255,107,53,0.18), transparent 60%)' }} />
        {T.mode === 'word' ? (
          <span key={`${i}-${animKind}-${fontFamily}`} style={textStyle}>{SAMPLE[i]}</span>
        ) : T.highlightKeyword ? (
          <span key={`${tick}-${animKind}-${fontFamily}`} style={{ ...textStyle, color: '#FFFFFF', maxWidth: '86%', textAlign: 'center' }}>
            {SAMPLE_PHRASE.split(' ').map((wd, k) => (
              <React.Fragment key={k}>
                {k > 0 ? ' ' : ''}
                <span style={k === KW_INDEX ? { color, fontSize: '1.18em', display: 'inline-block' } : undefined}>{wd}</span>
              </React.Fragment>
            ))}
          </span>
        ) : (
          <span key={`${tick}-${animKind}-${fontFamily}`} style={{ ...textStyle, maxWidth: '86%', textAlign: 'center' }}>{SAMPLE_PHRASE}</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
        {fontFamily} · {options.captionColor || 'white'} · {animKind} · {bg === 'box' ? 'caixa' : bg === 'none' ? 'sem sombra' : 'sombra'}
      </div>
    </div>
  );
}
