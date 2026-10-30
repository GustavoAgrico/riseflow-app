/**
 * Animações de entrada/saída e movimentos contínuos para camadas visuais (imagens, vídeos,
 * stickers). Compartilhado pelo site (editor + prévia) e pelo servidor (render FFmpeg).
 *
 * Entrada/saída: progresso 0→1 (como letterFrame). Contínuo: recebe o tempo absoluto e
 * retorna deslocamento/escala/rotação cíclicos — a camada fica "viva" enquanto está na tela.
 */

const TAU = Math.PI * 2;

// ────────────────────────── Animações de entrada/saída ──────────────────────────

export const ELEMENT_ANIMS = {
  none: 'Nenhuma',
  fade: 'Fade',
  zoom: 'Zoom',
  pop: 'Pop (quicar)',
  'slide-left': 'Deslizar ←',
  'slide-right': 'Deslizar →',
  'slide-up': 'Deslizar ↑',
  'slide-down': 'Deslizar ↓',
  bounce: 'Quicar (mola)',
  elastic: 'Elástico',
  grow: 'Crescer do zero',
  drop: 'Cair de cima',
  'whip-left': 'Chicote da esquerda',
  'whip-right': 'Chicote da direita',
  'whip-up': 'Chicote de baixo',
  'whip-down': 'Chicote de cima',
  spin: 'Girar entrando',
  'blur-in': 'Entrar do desfoque',
};

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t, s = 1.70158) => {
  const c = s + 1;
  return 1 + c * (t - 1) ** 3 + s * (t - 1) ** 2;
};
const easeOutElastic = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
};
const easeOutBounce = (t) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { const t2 = t - 1.5 / 2.75; return 7.5625 * t2 * t2 + 0.75; }
  if (t < 2.5 / 2.75) { const t2 = t - 2.25 / 2.75; return 7.5625 * t2 * t2 + 0.9375; }
  const t2 = t - 2.625 / 2.75;
  return 7.5625 * t2 * t2 + 0.984375;
};

/**
 * Quadro de uma animação de entrada no progresso p (0→1).
 * Retorna { scale, alpha, dx, dy, rot } — dx/dy em fração da tela (como overlay.js).
 */
export function elemAnimFrame(anim, p) {
  const e = easeOutCubic(p);
  switch (anim) {
    case 'bounce':
      return { scale: easeOutBounce(p), alpha: Math.min(1, p * 4), dx: 0, dy: 0, rot: 0 };
    case 'elastic':
      return { scale: easeOutElastic(p), alpha: Math.min(1, p * 3), dx: 0, dy: 0, rot: 0 };
    case 'grow':
      return { scale: e, alpha: e, dx: 0, dy: 0, rot: 0 };
    case 'drop':
      return { scale: 1, alpha: Math.min(1, p * 3), dx: 0, dy: -(1 - easeOutBounce(p)) * 0.5, rot: 0 };
    case 'whip-left':
      return { scale: 1, alpha: Math.min(1, p * 3), dx: -(1 - easeOutBack(p, 2.5)) * 1.2, dy: 0, rot: 0 };
    case 'whip-right':
      return { scale: 1, alpha: Math.min(1, p * 3), dx: (1 - easeOutBack(p, 2.5)) * 1.2, dy: 0, rot: 0 };
    case 'whip-up':
      return { scale: 1, alpha: Math.min(1, p * 3), dx: 0, dy: (1 - easeOutBack(p, 2.5)) * 1.2, rot: 0 };
    case 'whip-down':
      return { scale: 1, alpha: Math.min(1, p * 3), dx: 0, dy: -(1 - easeOutBack(p, 2.5)) * 1.2, rot: 0 };
    case 'spin':
      return { scale: e, alpha: Math.min(1, p * 3), dx: 0, dy: 0, rot: (1 - e) * 360 };
    case 'blur-in':
      return { scale: 1.15 - 0.15 * e, alpha: e, dx: 0, dy: 0, rot: 0, blur: (1 - e) * 12 };
    default:
      return { scale: 1, alpha: 1, dx: 0, dy: 0, rot: 0 };
  }
}

// ────────────────────────── Movimentos contínuos (loop) ──────────────────────────

export const ELEMENT_MOTIONS = {
  none: 'Nenhum',
  float: 'Flutuar (sobe e desce)',
  pulse: 'Pulsar (respirar)',
  wiggle: 'Tremer (vibrar)',
  sway: 'Balançar (rotação)',
  spin: 'Girar continuamente',
  drift: 'Derivar (deslizar lento)',
  'drift-up': 'Subir lentamente',
  'float-rotate': 'Flutuar + girar sutil',
  breathe: 'Respirar (escala + opacidade)',
  jelly: 'Gelatina (escala alternada)',
};

/**
 * Propriedades contínuas no tempo t (segundos desde o começo da camada).
 * Retorna { dx, dy, scale, rot, alpha } — deltas a aplicar sobre a posição base.
 * Velocidade (speed) 0.5–3, amplitude (amp) 0.2–2.
 */
export function elemMotionAt(motion, t, { speed = 1, amp = 1 } = {}) {
  const s = t * speed;
  switch (motion) {
    case 'float':
      return { dx: 0, dy: Math.sin(s * TAU * 0.4) * 0.012 * amp, scale: 1, rot: 0, alpha: 1 };
    case 'pulse':
      return { dx: 0, dy: 0, scale: 1 + Math.sin(s * TAU * 0.5) * 0.06 * amp, rot: 0, alpha: 1 };
    case 'wiggle':
      return { dx: Math.sin(s * 14) * 0.004 * amp, dy: Math.cos(s * 17) * 0.003 * amp, scale: 1, rot: Math.sin(s * 11) * 1.5 * amp, alpha: 1 };
    case 'sway':
      return { dx: 0, dy: 0, scale: 1, rot: Math.sin(s * TAU * 0.35) * 8 * amp, alpha: 1 };
    case 'spin':
      return { dx: 0, dy: 0, scale: 1, rot: (s * 90 * amp) % 360, alpha: 1 };
    case 'drift':
      return { dx: Math.sin(s * 0.3) * 0.015 * amp, dy: Math.cos(s * 0.2) * 0.01 * amp, scale: 1, rot: 0, alpha: 1 };
    case 'drift-up':
      return { dx: Math.sin(s * 0.5) * 0.005 * amp, dy: -s * 0.004 * amp, scale: 1, rot: 0, alpha: 1 };
    case 'float-rotate':
      return { dx: Math.sin(s * 0.7) * 0.008 * amp, dy: Math.sin(s * TAU * 0.35) * 0.01 * amp, scale: 1, rot: Math.sin(s * 0.5) * 3 * amp, alpha: 1 };
    case 'breathe':
      return { dx: 0, dy: 0, scale: 1 + Math.sin(s * TAU * 0.4) * 0.05 * amp, rot: 0, alpha: 0.85 + Math.sin(s * TAU * 0.4) * 0.15 * amp };
    case 'jelly': {
      const ph = Math.sin(s * TAU * 0.6);
      return { dx: 0, dy: 0, scaleX: 1 + ph * 0.04 * amp, scaleY: 1 - ph * 0.04 * amp, scale: 1, rot: 0, alpha: 1 };
    }
    default:
      return { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1 };
  }
}

/**
 * Expressão FFmpeg de um movimento contínuo (para eval=frame no overlay/scale).
 * t = variável de tempo no filtro.
 */
export function elemMotionExpr(motion, tVar, { speed = 1, amp = 1 } = {}) {
  const s = `(${tVar}*${speed.toFixed(2)})`;
  const f = (n) => n.toFixed(4);
  switch (motion) {
    case 'float':
      return { dy: `sin(${s}*${f(TAU * 0.4)})*${f(0.012 * amp)}` };
    case 'pulse':
      return { scale: `(1+sin(${s}*${f(TAU * 0.5)})*${f(0.06 * amp)})` };
    case 'wiggle':
      return { dx: `sin(${s}*14)*${f(0.004 * amp)}`, dy: `cos(${s}*17)*${f(0.003 * amp)}` };
    case 'sway':
      return { rot: `sin(${s}*${f(TAU * 0.35)})*${f(8 * amp)}*PI/180` };
    case 'spin':
      return { rot: `${s}*${f(90 * amp)}*PI/180` };
    case 'drift':
      return { dx: `sin(${s}*0.3)*${f(0.015 * amp)}`, dy: `cos(${s}*0.2)*${f(0.01 * amp)}` };
    case 'drift-up':
      return { dx: `sin(${s}*0.5)*${f(0.005 * amp)}`, dy: `-(${s})*${f(0.004 * amp)}` };
    case 'float-rotate':
      return { dx: `sin(${s}*0.7)*${f(0.008 * amp)}`, dy: `sin(${s}*${f(TAU * 0.35)})*${f(0.01 * amp)}`, rot: `sin(${s}*0.5)*${f(3 * amp)}*PI/180` };
    case 'breathe':
      return { scale: `(1+sin(${s}*${f(TAU * 0.4)})*${f(0.05 * amp)})` };
    case 'jelly':
      return { scale: `(1+sin(${s}*${f(TAU * 0.6)})*${f(0.04 * amp)})` };
    default:
      return {};
  }
}

// ────────────────────────── Stickers decorativos (SVG) ──────────────────────────

export const DECORATIVE_STICKERS = [
  { id: 'arrow-right', label: 'Seta →', cat: 'setas', svg: '<svg viewBox="0 0 120 60"><path d="M10 30h80l-20-18M90 30l-20 18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'arrow-down', label: 'Seta ↓', cat: 'setas', svg: '<svg viewBox="0 0 60 120"><path d="M30 10v80l-18-20M30 90l18-20" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'arrow-curved', label: 'Seta curva', cat: 'setas', svg: '<svg viewBox="0 0 120 100"><path d="M15 75C15 30 60 15 105 35l-18-14M105 35l-5 22" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'arrow-circle', label: 'Seta circular', cat: 'setas', svg: '<svg viewBox="0 0 100 100"><path d="M75 20A35 35 0 1 1 25 30l12 1M25 30l-1-14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'underline', label: 'Sublinhado', cat: 'linhas', svg: '<svg viewBox="0 0 160 30"><path d="M10 20C40 10 80 28 150 15" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'underline-double', label: 'Sublinhado duplo', cat: 'linhas', svg: '<svg viewBox="0 0 160 40"><path d="M10 15C50 8 100 22 150 12M10 28C50 21 100 35 150 25" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'zigzag', label: 'Zigzag', cat: 'linhas', svg: '<svg viewBox="0 0 160 40"><path d="M5 20l15-15 15 15 15-15 15 15 15-15 15 15 15-15 15 15 15-15 15 15" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'squiggle', label: 'Ondulado', cat: 'linhas', svg: '<svg viewBox="0 0 160 40"><path d="M5 20C25 5 35 35 55 20S85 5 105 20S135 35 155 20" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'circle', label: 'Círculo', cat: 'formas', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="#fff" stroke-width="4" fill="none"/></svg>' },
  { id: 'circle-hand', label: 'Círculo à mão', cat: 'formas', svg: '<svg viewBox="0 0 100 100"><path d="M50 10C75 8 92 25 93 50S78 92 50 90C22 88 8 72 10 50S28 12 50 10Z" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'star-4', label: 'Estrela 4 pontas', cat: 'formas', svg: '<svg viewBox="0 0 100 100"><path d="M50 5L58 38 95 50 58 62 50 95 42 62 5 50 42 38Z" fill="#fff"/></svg>' },
  { id: 'sparkle', label: 'Brilho', cat: 'formas', svg: '<svg viewBox="0 0 100 100"><path d="M50 5l5 35 35 10-35 5-5 35-5-35-35-5 35-10z" fill="#fff"/><circle cx="22" cy="18" r="4" fill="#fff"/><circle cx="80" cy="78" r="3" fill="#fff"/></svg>' },
  { id: 'burst', label: 'Explosão', cat: 'formas', svg: '<svg viewBox="0 0 100 100"><path d="M50 3l8 22 20-14-6 23 24 2-19 14 12 20-22-7-3 24-14-19-14 19-3-24-22 7 12-20-19-14 24-2-6-23 20 14z" fill="#fff"/></svg>' },
  { id: 'bracket-left', label: 'Chave {', cat: 'formas', svg: '<svg viewBox="0 0 40 100"><path d="M30 8C18 8 14 14 14 26V42C14 48 6 50 6 50s8 2 8 8v16c0 12 4 18 16 18" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'bracket-right', label: 'Chave }', cat: 'formas', svg: '<svg viewBox="0 0 40 100"><path d="M10 8c12 0 16 6 16 18v16c0 6 8 8 8 8s-8 2-8 8v16c0 12-4 18-16 18" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'highlight', label: 'Destaque', cat: 'formas', svg: '<svg viewBox="0 0 160 50"><rect x="5" y="10" width="150" height="30" rx="6" fill="#FF6B35" opacity="0.35"/></svg>' },
  { id: 'cross', label: 'X (cancelar)', cat: 'formas', svg: '<svg viewBox="0 0 80 80"><path d="M15 15l50 50M65 15l-50 50" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>' },
  { id: 'checkmark', label: 'Check ✓', cat: 'formas', svg: '<svg viewBox="0 0 100 80"><path d="M10 45l25 22 55-52" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'heart-outline', label: 'Coração', cat: 'formas', svg: '<svg viewBox="0 0 100 90"><path d="M50 85S5 55 5 30C5 12 18 5 30 5c8 0 15 4 20 12C55 9 62 5 70 5c12 0 25 7 25 25C95 55 50 85 50 85z" stroke="#fff" stroke-width="4" fill="none"/></svg>' },
  { id: 'lightning', label: 'Raio', cat: 'formas', svg: '<svg viewBox="0 0 60 100"><path d="M35 5L15 45h20L10 95 50 48H30z" fill="#fff"/></svg>' },
  { id: 'speech-bubble', label: 'Balão de fala', cat: 'formas', svg: '<svg viewBox="0 0 120 90"><path d="M10 10h100a5 5 0 0 1 5 5v45a5 5 0 0 1-5 5H60l-15 20-5-20H10a5 5 0 0 1-5-5V15a5 5 0 0 1 5-5z" stroke="#fff" stroke-width="3.5" fill="none"/></svg>' },
  { id: 'pin', label: 'Pin (marcador)', cat: 'formas', svg: '<svg viewBox="0 0 60 90"><circle cx="30" cy="26" r="18" stroke="#fff" stroke-width="4" fill="none"/><path d="M30 44v36" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>' },
  { id: 'badge-circle', label: 'Selo circular', cat: 'formas', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" stroke="#fff" stroke-width="3" fill="none"/><circle cx="50" cy="50" r="35" stroke="#fff" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/></svg>' },
];

export const STICKER_CATEGORIES = [
  { id: 'setas', label: 'Setas' },
  { id: 'linhas', label: 'Linhas' },
  { id: 'formas', label: 'Formas' },
];

/**
 * Presets de elementos com animação + motion pré-configurados (como os do CapCut).
 * Cada um é um sticker + entrada + movimento contínuo prontos para usar.
 */
export const ELEMENT_PRESETS = [
  { id: 'floating-arrow', label: 'Seta flutuante', sticker: 'arrow-down', animIn: 'pop', motion: 'float', motionAmp: 1.2 },
  { id: 'pulsing-circle', label: 'Círculo pulsante', sticker: 'circle-hand', animIn: 'grow', motion: 'pulse', motionAmp: 1 },
  { id: 'wiggling-star', label: 'Estrela vibrando', sticker: 'sparkle', animIn: 'elastic', motion: 'wiggle', motionAmp: 0.8 },
  { id: 'swaying-bracket', label: 'Chave balançando', sticker: 'bracket-left', animIn: 'fade', motion: 'sway', motionAmp: 0.6 },
  { id: 'spinning-burst', label: 'Explosão girando', sticker: 'burst', animIn: 'grow', motion: 'spin', motionAmp: 0.3 },
  { id: 'drifting-heart', label: 'Coração derivando', sticker: 'heart-outline', animIn: 'bounce', motion: 'drift', motionAmp: 0.7 },
  { id: 'bouncing-check', label: 'Check quicando', sticker: 'checkmark', animIn: 'bounce', motion: 'none' },
  { id: 'breathing-highlight', label: 'Destaque respirando', sticker: 'highlight', animIn: 'fade', motion: 'breathe', motionAmp: 0.8 },
  { id: 'whip-lightning', label: 'Raio com chicote', sticker: 'lightning', animIn: 'whip-down', motion: 'jelly', motionAmp: 0.5 },
  { id: 'rising-pin', label: 'Pin subindo', sticker: 'pin', animIn: 'drop', motion: 'float', motionAmp: 0.6 },
];
