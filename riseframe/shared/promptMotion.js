// Motion por PROMPT: a pessoa descreve a cena ("contador de 0 a 10 mil com gráfico subindo")
// e escolhe objetivo, estilo, cores e ritmo; a IA devolve um ROTEIRO de cena (JSON) e este
// módulo desenha esse roteiro em Canvas 2D, quadro a quadro, como função pura do tempo — o
// mesmo código desenha a prévia (navegador) e o render (servidor, @napi-rs/canvas → FFmpeg).
//
// O roteiro é um vocabulário FECHADO (tipos, efeitos e campos conhecidos, tudo validado em
// sanitizePromptSpec): a IA não escreve código que roda no app — só escolhe e posiciona peças.
//
// Peças: texto (palavra a palavra, letra a letra, máquina de escrever, máscara, destaque),
// contador, gráfico de barras, gráfico de linha, anel/barra de progresso, formas, ícones,
// lista com marcadores, selo, cartão (vidro), seta, partículas e telinhas de app (busca,
// notificação, botão com cursor, conversa). Câmera com quadros-chave e fundos animados.

// ─────────────────────────────── vocabulário ───────────────────────────────
export const PM_TYPES = ['text', 'counter', 'bars', 'line', 'progress', 'shape', 'icon', 'list', 'badge', 'card', 'arrow', 'particles', 'ui', 'transition'];
export const PM_IN = ['fade', 'rise', 'drop', 'slide-left', 'slide-right', 'pop', 'zoom', 'blur', 'mask-up', 'typewriter', 'words', 'letters', 'scramble', 'wave', 'outline', 'glitch', 'draw', 'spin', 'flip', 'none'];
/** Transições de tela cheia (peça "transition"): cobrem e revelam a tela. */
export const PM_TRANSITIONS = ['wipe-left', 'wipe-right', 'wipe-up', 'circle', 'diagonal', 'bars', 'flash'];
export const PM_OUT = ['fade', 'sink', 'rise', 'slide-left', 'slide-right', 'shrink', 'zoom', 'blur', 'none'];
export const PM_EASE = ['out', 'inout', 'back', 'spring', 'expo', 'linear'];
export const PM_LOOP = ['none', 'float', 'pulse', 'wiggle', 'spin', 'shimmer'];
export const PM_BG = ['solid', 'gradient', 'radial', 'grid', 'dots', 'mesh', 'stripes'];
export const PM_SHAPES = ['rect', 'circle', 'pill', 'line', 'triangle', 'star', 'ring'];
export const PM_ICONS = ['check', 'x', 'arrow', 'star', 'heart', 'bolt', 'clock', 'money', 'chart', 'target', 'bulb', 'user', 'chat', 'cart', 'play', 'lock', 'bell', 'gift', 'fire', 'search', 'rocket', 'trophy'];
export const PM_PARTICLES = ['confetti', 'sparkle', 'embers', 'bubbles', 'burst', 'snow'];
export const PM_UI = ['search', 'notification', 'button', 'chat'];
export const PM_HIGHLIGHT = ['color', 'box', 'underline', 'marker'];

/** Fontes (famílias já registradas para o motion: shared/motionEngine.js EXPLAINER_FONT_FILES). */
export const PM_FONTS = {
  display: 'RF Anton',
  sans: 'RF Inter 700',
  heavy: 'RF Inter 900',
  geometric: 'RF Montserrat 800',
  serif: 'RF Playfair 900i',
  elegant: 'RF Playfair 400',
  italic: 'RF Garamond Italic',
  sporty: 'RF Barlow 900i',
  punchy: 'RF Poppins 900i',
};

// ─────────────────────────────── utilidades ───────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : d;
};
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, n = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (v, d) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : d);

// mola (rigidez 170, amortecimento 13): passa do alvo e assenta
function spring(t) {
  if (t <= 0) return 0;
  if (t >= 1.6) return 1;
  const s = t * 1.6;
  const w0 = Math.sqrt(170);
  const z = 13 / (2 * w0);
  const wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * s) * (Math.cos(wd * s) + ((z * w0) / wd) * Math.sin(wd * s));
}
export const EASE = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  spring,
  expo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
};
const ease = (name, t) => (EASE[name] || EASE.out)(clamp(t));

// gerador determinístico (partículas e granulado iguais na prévia e no render)
function rand(seed) {
  let s = (Math.floor(seed) % 2147483647) || 1;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Número no jeito brasileiro: 12.500 · 3,5 · R$ (prefixo vem no campo). Puro. */
export function pmNumber(v, decimals = 0) {
  const d = clamp(Math.round(decimals), 0, 2);
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(d);
  const [int, frac] = fixed.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${withSep}${frac ? `,${frac}` : ''}`;
}

// ─────────────────────────────── validação ───────────────────────────────
const DEFAULT_PALETTE = { bg: '#0B0B12', bg2: '#1B1240', text: '#FFFFFF', accent: '#FF6B35', accent2: '#7C3AED', muted: '#A1A1B5' };

function cleanAnim(a, list, dflt) {
  if (typeof a === 'string') a = { fx: a };
  if (!a || typeof a !== 'object') return { fx: dflt, dur: 0.5, ease: 'out', delay: 0 };
  return {
    fx: pick(a.fx, list, dflt),
    dur: num(a.dur, 0.05, 4, 0.5),
    ease: pick(a.ease, PM_EASE, 'out'),
    delay: num(a.delay, 0, 3, 0),
    ...(a.stagger != null ? { stagger: num(a.stagger, 0, 0.6, 0.08) } : {}),
  };
}
const xy = (p, d) => (Array.isArray(p) && p.length >= 2 ? [num(p[0], -0.2, 1.2, d[0]), num(p[1], -0.2, 1.2, d[1])] : d);

/** Pintura do texto: degradê, brilho passando e sombra suave. Puro. */
function paintOf(e) {
  const g = (Array.isArray(e.gradient) ? e.gradient : []).map((c) => color(c, null)).filter(Boolean).slice(0, 3);
  return {
    ...(g.length >= 2 ? { gradient: g } : {}),
    ...(e.shine ? { shine: true } : {}),
    ...(e.shadow ? { shadow: true } : {}),
  };
}

function cleanElement(e, dur, pal) {
  const type = pick(e?.type, PM_TYPES, null);
  if (!type) return null;
  const at = num(e.at, 0, dur, 0);
  const base = {
    type,
    at,
    ...(e.dur != null ? { dur: num(e.dur, 0.2, dur, dur - at) } : {}),
    x: num(e.x, -0.2, 1.2, 0.5),
    y: num(e.y, -0.2, 1.2, 0.5),
    scale: num(e.scale, 0.1, 4, 1),
    rotate: num(e.rotate, -180, 180, 0),
    opacity: num(e.opacity, 0, 1, 1),
    color: color(e.color, pal.text),
    in: cleanAnim(e.in, PM_IN, type === 'text' ? 'rise' : type === 'arrow' || type === 'line' ? 'draw' : type === 'particles' || type === 'card' ? 'fade' : 'pop'),
    out: cleanAnim(e.out ?? 'none', PM_OUT, 'none'),
    loop: pick(e.loop, PM_LOOP, 'none'),
    ...(e.fixed ? { fixed: true } : {}),
    ...(e.glow ? { glow: num(e.glow, 0, 1, 0.5) } : {}),
    // profundidade (paralaxe: a câmera mexe mais o que está "na frente") e rastro de movimento
    ...(e.depth ? { depth: num(e.depth, -1, 1, 0) } : {}),
    ...(e.trail ? { trail: true } : {}),
  };
  const size = (d, lo = 0.01, hi = 0.4) => num(e.size, lo, hi, d);
  const font = pick(e.font, Object.keys(PM_FONTS), null);
  switch (type) {
    case 'text': {
      const text = str(e.text, 140);
      if (!text) return null;
      return {
        ...base, text, size: size(0.06), ...(font ? { font } : {}),
        align: pick(e.align, ['center', 'left', 'right'], 'center'),
        maxWidth: num(e.maxWidth, 0.2, 1, 0.84),
        upper: Boolean(e.upper),
        ...(e.stroke ? { stroke: color(e.stroke, pal.accent) } : {}),
        highlight: (Array.isArray(e.highlight) ? e.highlight : typeof e.highlight === 'string' ? [e.highlight] : []).map((w) => str(w, 40)).filter(Boolean).slice(0, 6),
        highlightColor: color(e.highlightColor, pal.accent),
        highlightStyle: pick(e.highlightStyle, PM_HIGHLIGHT, 'color'),
        ...paintOf(e),
      };
    }
    case 'counter': {
      const to = num(e.to, -1e12, 1e12, 100);
      return {
        ...base, from: num(e.from, -1e12, 1e12, 0), to, decimals: num(e.decimals, 0, 2, 0),
        prefix: str(e.prefix, 8), suffix: str(e.suffix, 12), size: size(0.12, 0.02, 0.4), ...(font ? { font } : {}), ...paintOf(e),
        count: num(e.count, 0.2, 8, 1.6), countEase: pick(e.countEase, PM_EASE, 'out'),
        label: str(e.label, 60),
      };
    }
    case 'bars':
    case 'line': {
      const values = (Array.isArray(e.values) ? e.values : []).map((v) => num(v, -1e9, 1e9, 0)).slice(0, 12);
      if (values.length < 2) return null;
      return {
        ...base, values,
        labels: (Array.isArray(e.labels) ? e.labels : []).map((l) => str(l, 16)).slice(0, values.length),
        w: num(e.w, 0.1, 1, 0.78), h: num(e.h, 0.05, 0.8, 0.3),
        colors: (Array.isArray(e.colors) ? e.colors : []).map((c) => color(c, null)).filter(Boolean).slice(0, 12),
        showValues: e.showValues !== false,
        ...(type === 'line' ? { area: e.area !== false } : {}),
        prefix: str(e.prefix, 8), suffix: str(e.suffix, 12),
      };
    }
    case 'progress':
      return {
        ...base, value: num(e.value, 0, 100, 75), kind: pick(e.kind, ['ring', 'bar'], 'ring'), size: size(0.22, 0.04, 0.8),
        w: num(e.w, 0.1, 1, 0.7), label: str(e.label, 40), fill: color(e.fill, pal.accent), track: color(e.track, null),
      };
    case 'shape':
      return {
        ...base, shape: pick(e.shape, PM_SHAPES, 'rect'), w: num(e.w, 0.005, 1.5, 0.3), h: num(e.h, 0.002, 1.5, 0.1),
        fill: color(e.fill, e.stroke ? null : pal.accent), stroke: color(e.stroke, null), strokeWidth: num(e.strokeWidth, 0.5, 40, 6),
        radius: num(e.radius, 0, 0.5, 0.04),
      };
    case 'icon':
      return { ...base, icon: pick(e.icon, PM_ICONS, 'star'), size: size(0.1, 0.02, 0.5), ...(color(e.bg, null) ? { bg: color(e.bg, null) } : {}) };
    case 'list': {
      const items = (Array.isArray(e.items) ? e.items : []).map((i) => str(i, 60)).filter(Boolean).slice(0, 6);
      if (!items.length) return null;
      return {
        ...base, items, size: size(0.04, 0.015, 0.12), ...(font ? { font } : {}), bullet: pick(e.bullet, ['check', 'dot', 'number', 'arrow', 'x'], 'check'),
        gap: num(e.gap, 0.2, 3, 1), stagger: num(e.stagger, 0.05, 1.5, 0.35), accent: color(e.accent, pal.accent), align: pick(e.align, ['left', 'center'], 'left'),
        w: num(e.w, 0.2, 1, 0.78),
      };
    }
    case 'badge': {
      const text = str(e.text, 40);
      if (!text) return null;
      return { ...base, text, size: size(0.035, 0.01, 0.12), fill: color(e.fill, pal.accent), ...(font ? { font } : {}), upper: e.upper !== false, ...(e.shine ? { shine: true } : {}) };
    }
    case 'card':
      return {
        ...base, w: num(e.w, 0.05, 1.2, 0.8), h: num(e.h, 0.05, 1.2, 0.3), fill: color(e.fill, '#FFFFFF'),
        radius: num(e.radius, 0, 0.5, 0.06), glass: Boolean(e.glass), border: color(e.border, null), shadow: e.shadow !== false,
      };
    case 'arrow':
      return {
        ...base, from: xy(e.from, [0.3, 0.6]), to: xy(e.to, [0.7, 0.4]), curve: num(e.curve, -1, 1, 0.3),
        width: num(e.width, 1, 40, 8), head: e.head !== false,
      };
    case 'particles':
      return {
        ...base, kind: pick(e.kind, PM_PARTICLES, 'confetti'), count: Math.round(num(e.count, 4, 160, 50)),
        colors: (Array.isArray(e.colors) ? e.colors : []).map((c) => color(c, null)).filter(Boolean).slice(0, 6),
      };
    case 'transition':
      return {
        ...base, fixed: true, kind: pick(e.kind, PM_TRANSITIONS, 'wipe-left'),
        fill: color(e.fill, pal.accent), fill2: color(e.fill2, null),
        in: { ...base.in, fx: 'none', dur: num(e.in?.dur ?? e.dur, 0.2, 2, 0.7) },
        dur: num(e.in?.dur ?? e.dur, 0.2, 2, 0.7),
      };
    case 'ui':
      return {
        ...base, kind: pick(e.kind, PM_UI, 'search'), text: str(e.text, 80), title: str(e.title, 40),
        w: num(e.w, 0.2, 1, 0.82), size: size(0.034, 0.012, 0.1), fill: color(e.fill, '#FFFFFF'), accent: color(e.accent, pal.accent),
      };
    default:
      return null;
  }
}

/**
 * Roteiro de cena seguro: só tipos, efeitos e campos conhecidos, números nos limites,
 * cores em hexadecimal e textos curtos. Tudo que a IA (ou o cliente) mandar passa por aqui.
 * @returns {object|null} null quando não sobra nenhuma peça
 */
export function sanitizePromptSpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const duration = num(raw.duration, 1.5, 15, 5);
  const p = raw.palette && typeof raw.palette === 'object' ? raw.palette : {};
  const palette = {
    bg: color(p.bg, DEFAULT_PALETTE.bg), bg2: color(p.bg2, DEFAULT_PALETTE.bg2), text: color(p.text, DEFAULT_PALETTE.text),
    accent: color(p.accent, DEFAULT_PALETTE.accent), accent2: color(p.accent2, DEFAULT_PALETTE.accent2), muted: color(p.muted, DEFAULT_PALETTE.muted),
  };
  const b = raw.bg && typeof raw.bg === 'object' ? raw.bg : { kind: raw.bg };
  const bg = {
    kind: pick(b.kind, PM_BG, 'gradient'),
    colors: (Array.isArray(b.colors) ? b.colors : []).map((c) => color(c, null)).filter(Boolean).slice(0, 3),
    angle: num(b.angle, -360, 360, 160),
    motion: pick(b.motion, ['none', 'drift', 'pulse'], 'drift'),
    grain: Boolean(b.grain),
    vignette: b.vignette !== false,
    ...(b.leak ? { leak: true } : {}),
  };
  if (!bg.colors.length) bg.colors = [palette.bg, palette.bg2];
  const camera = (Array.isArray(raw.camera) ? raw.camera : []).slice(0, 12).map((k) => ({
    at: num(k?.at, 0, duration, 0), dur: num(k?.dur, 0.05, duration, 1),
    zoom: num(k?.zoom, 0.5, 3, 1), x: num(k?.x, -0.5, 0.5, 0), y: num(k?.y, -0.5, 0.5, 0), rotate: num(k?.rotate, -30, 30, 0),
    ease: pick(k?.ease, PM_EASE, 'inout'),
  })).sort((a, c) => a.at - c.at);
  const elements = (Array.isArray(raw.elements) ? raw.elements : []).slice(0, 28).map((e) => cleanElement(e, duration, palette)).filter(Boolean);
  if (!elements.length) return null;
  return {
    v: 1,
    title: str(raw.title, 60) || 'Motion',
    duration,
    font: pick(raw.font, Object.keys(PM_FONTS), 'heavy'),
    palette,
    bg,
    camera,
    ...(raw.shake ? { shake: num(raw.shake, 0, 1, 0.3) } : {}),
    elements,
  };
}

// ─────────────────────────────── desenho ───────────────────────────────
function cameraAt(cam, t) {
  const s = { zoom: 1, x: 0, y: 0, rotate: 0 };
  for (const k of cam) {
    if (t <= k.at) break;
    const p = ease(k.ease, (t - k.at) / k.dur);
    const from = { ...s };
    s.zoom = lerp(from.zoom, k.zoom, p);
    s.x = lerp(from.x, k.x, p);
    s.y = lerp(from.y, k.y, p);
    s.rotate = lerp(from.rotate, k.rotate, p);
  }
  return s;
}

function rr(ctx, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

function withAlpha(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const full = h.length <= 4 ? h.split('').map((c) => c + c).join('').slice(0, 6) : h.slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
}

function drawBackground(ctx, spec, t, W, H) {
  const { bg, palette } = spec;
  const [c1, c2 = palette.bg2, c3 = palette.accent2] = bg.colors;
  const drift = bg.motion === 'drift' ? t / Math.max(1, spec.duration) : 0;
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, W, H);
  if (bg.kind === 'gradient') {
    const a = ((bg.angle + drift * 40) * Math.PI) / 180;
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === 'radial') {
    const pulse = bg.motion === 'pulse' ? 1 + 0.06 * Math.sin(t * 2.4) : 1 + drift * 0.15;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7 * pulse);
    g.addColorStop(0, c2);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === 'mesh') {
    // três manchas de luz que passeiam devagar (degradê "premium")
    const u = Math.max(W, H);
    const blobs = [[0.2, 0.25, c2, 0], [0.85, 0.55, c3, 2.1], [0.4, 0.9, c2, 4.2]];
    for (const [bx, by, bc, ph] of blobs) {
      const x = W * (bx + 0.08 * Math.sin(t * 0.5 + ph));
      const y = H * (by + 0.06 * Math.cos(t * 0.45 + ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, u * 0.55);
      g.addColorStop(0, withAlpha(bc, 0.85));
      g.addColorStop(1, withAlpha(bc, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (bg.kind === 'grid' || bg.kind === 'dots') {
    const step = Math.round(Math.min(W, H) / 14);
    const off = (drift * step * 2) % step;
    ctx.fillStyle = withAlpha(c2, bg.kind === 'dots' ? 0.55 : 0.35);
    ctx.strokeStyle = withAlpha(c2, 0.35);
    ctx.lineWidth = Math.max(1, step / 40);
    if (bg.kind === 'grid') {
      ctx.beginPath();
      for (let x = -step + off; x <= W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = -step + off; y <= H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    } else {
      const r = Math.max(1.2, step / 16);
      for (let x = -step + off; x <= W + step; x += step) {
        for (let y = -step + off; y <= H + step; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (bg.kind === 'stripes') {
    const step = Math.round(Math.max(W, H) / 10);
    const off = (t * step * 0.4) % (step * 2);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = withAlpha(c2, 0.5);
    const R = Math.hypot(W, H);
    for (let x = -R - step * 2 + off; x < R; x += step * 2) ctx.fillRect(x, -R, step, R * 2);
    ctx.restore();
  }
  if (bg.leak) {
    // vazamento de luz: duas manchas quentes passeando, somadas à imagem (como filme)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const u = Math.max(W, H);
    for (const [bx, by, col, ph] of [[0.1, 0.15, 'rgba(255,140,60,0.22)', 0], [0.95, 0.75, 'rgba(255,60,120,0.16)', 2.4]]) {
      const x = W * (bx + 0.12 * Math.sin(t * 0.35 + ph));
      const y = H * (by + 0.08 * Math.cos(t * 0.3 + ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, u * 0.6);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  if (bg.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawGrain(ctx, t, W, H) {
  const r = rand(Math.floor(t * 24) * 7919 + 13);
  const n = Math.round((W * H) / 900);
  const s = Math.max(1, Math.round(Math.min(W, H) / 540));
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(r() * W, r() * H, s, s);
  }
}

/** Quanto do efeito de entrada/saída já aconteceu e onde a peça está nesse instante. */
function lifeOf(el, t, specDur) {
  const lt = t - el.at - el.in.delay;
  const end = el.dur != null ? el.at + el.dur : specDur;
  const outDur = el.out.fx === 'none' ? 0 : el.out.dur;
  const pIn = el.in.fx === 'none' ? 1 : clamp(lt / el.in.dur);
  const pOut = outDur ? clamp((t - (end - outDur)) / outDur) : 0;
  return { lt, end, pIn, eIn: ease(el.in.ease, pIn), pOut, eOut: ease('inout', pOut), visible: lt >= 0 && t < end + 1e-6 };
}

/** Transformação da peça inteira pela entrada/saída/loop (efeitos "por palavra" ficam no texto). */
function applyTransform(ctx, el, life, t, W, H) {
  const u = Math.min(W, H);
  let alpha = el.opacity;
  let dx = 0;
  let dy = 0;
  let sc = el.scale;
  let rot = (el.rotate * Math.PI) / 180;
  let blur = 0;
  let flip = null;
  const e = life.eIn;
  const raw = life.pIn;
  switch (el.in.fx) {
    case 'fade': alpha *= e; break;
    case 'rise': alpha *= clamp(raw * 2); dy += (1 - e) * u * 0.08; break;
    case 'drop': alpha *= clamp(raw * 2); dy -= (1 - e) * u * 0.1; break;
    case 'slide-left': alpha *= clamp(raw * 2); dx += (1 - e) * W * 0.5; break;
    case 'slide-right': alpha *= clamp(raw * 2); dx -= (1 - e) * W * 0.5; break;
    case 'pop': sc *= Math.max(0, el.in.ease === 'out' ? EASE.back(raw) : e); alpha *= clamp(raw * 3); break;
    case 'zoom': sc *= lerp(2.2, 1, e); alpha *= clamp(raw * 2); break;
    case 'blur': alpha *= e; blur = (1 - e) * u * 0.02; break;
    case 'spin': rot += (1 - e) * Math.PI * 1.2; sc *= Math.max(0.01, e); break;
    case 'flip': flip = e; alpha *= clamp(raw * 2); break;
    default: break; // words/letters/typewriter/mask-up/draw: no desenho da peça
  }
  const o = life.eOut;
  switch (el.out.fx) {
    case 'fade': alpha *= 1 - o; break;
    case 'sink': alpha *= 1 - o; dy += o * u * 0.08; break;
    case 'rise': alpha *= 1 - o; dy -= o * u * 0.08; break;
    case 'slide-left': dx -= o * W * 0.6; break;
    case 'slide-right': dx += o * W * 0.6; break;
    case 'shrink': sc *= 1 - o; break;
    case 'zoom': sc *= 1 + o * 1.5; alpha *= 1 - o; break;
    case 'blur': alpha *= 1 - o; blur += o * u * 0.02; break;
    default: break;
  }
  const lt = Math.max(0, life.lt);
  switch (el.loop) {
    case 'float': dy += Math.sin(lt * 2.2) * u * 0.008; break;
    case 'pulse': sc *= 1 + 0.035 * Math.sin(lt * 5); break;
    case 'wiggle': rot += Math.sin(lt * 9) * 0.035; break;
    case 'spin': rot += lt * 1.4; break;
    default: break;
  }
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(el.x * W + dx, el.y * H + dy);
  if (rot) ctx.rotate(rot);
  if (sc !== 1) ctx.scale(sc, sc);
  if (flip != null) ctx.scale(Math.max(0.02, Math.abs(Math.cos(((1 - flip) * Math.PI) / 2))), 1);
  if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  if (el.glow) { ctx.shadowColor = el.color; ctx.shadowBlur = el.glow * u * 0.04; }
}

function fontOf(spec, el) {
  return PM_FONTS[el.font || spec.font] || PM_FONTS.heavy;
}

function wrapWords(ctx, words, maxW) {
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur, w].map((x) => x.t).join(' ');
    if (cur.length && ctx.measureText(test).width > maxW) {
      lines.push(cur);
      cur = [w];
    } else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}%$]/gu, '');

const SCRAMBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*@';

/** Pintura de um bloco de texto: cor, degradê ou brilho passando (faixa clara que atravessa). */
function blockPaint(ctx, el, x0, y0, x1, y1, lt, base) {
  if (!el.gradient && !el.shine) return base;
  const cols = el.gradient || [base, base];
  if (!el.shine) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
    return g;
  }
  // brilho: a cada 2,4 s uma faixa clara passa da esquerda para a direita
  const w = x1 - x0 || 1;
  const k = ((Math.max(0, lt) % 2.4) / 1.2) - 0.25;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const c0 = cols[0];
  const c1 = cols[cols.length - 1];
  const at = (v) => clamp(v);
  g.addColorStop(0, c0);
  if (k > 0 && k < 1) {
    g.addColorStop(at(k - 0.12), lerpColor(c0, c1, at(k - 0.12)));
    g.addColorStop(at(k), '#FFFFFF');
    g.addColorStop(at(k + 0.12), lerpColor(c0, c1, at(k + 0.12)));
  }
  g.addColorStop(1, c1);
  void w;
  return g;
}

function lerpColor(a, b, t) {
  const p = (h) => { const x = String(h).replace('#', ''); const f = x.length <= 4 ? x.split('').map((c) => c + c).join('') : x; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0); };
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}

function drawText(ctx, spec, el, life, W, H) {
  let size = el.size * H;
  const fam = fontOf(spec, el);
  const text = el.upper ? el.text.toUpperCase() : el.text;
  const maxW = el.maxWidth * W;
  ctx.font = `${size}px "${fam}"`;
  // palavra maior que a largura: diminui a fonte
  const longest = Math.max(...text.split(/\s+/).map((w) => ctx.measureText(w).width));
  if (longest > maxW) { size *= maxW / longest; ctx.font = `${size}px "${fam}"`; }
  const hl = new Set(el.highlight.map(norm));
  const words = text.split(/\s+/).filter(Boolean).map((w, i) => ({ t: w, i, hi: hl.has(norm(w)) }));
  const lines = wrapWords(ctx, words, maxW);
  const lh = size * 1.12;
  const total = lines.length * lh;
  ctx.textBaseline = 'alphabetic';
  const fx = el.in.fx;
  const n = words.length;
  const chars = text.length;
  const stag = el.in.stagger ?? Math.min(0.12, (el.in.dur * 1.6) / Math.max(1, n));
  const space = ctx.measureText(' ').width;
  // degradê / brilho passando: uma pintura só para o bloco de texto inteiro
  const paint = blockPaint(ctx, el, -maxW / 2, -total / 2, maxW / 2, total / 2, life.lt, el.color);
  if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.35; ctx.shadowOffsetY = size * 0.08; }
  const perLetter = fx === 'letters' || fx === 'typewriter' || fx === 'scramble' || fx === 'wave';
  let ci = 0;
  lines.forEach((line, li) => {
    const lw = line.reduce((a, w) => a + ctx.measureText(w.t).width, 0) + space * (line.length - 1);
    let x = el.align === 'left' ? 0 : el.align === 'right' ? -lw : -lw / 2;
    const y = -total / 2 + lh * (li + 0.8);
    if (fx === 'mask-up') {
      // cada linha sobe de trás de uma máscara
      const p = ease(el.in.ease, (life.lt - li * stag * 2) / el.in.dur);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - size, y - size * 1.05, lw + size * 2, size * 1.35);
      ctx.clip();
      ctx.translate(0, (1 - p) * size * 1.3);
    }
    for (const w of line) {
      const ww = ctx.measureText(w.t).width;
      let a = 1;
      let oy = 0;
      let s = 1;
      if (fx === 'words') {
        const p = (life.lt - w.i * stag) / el.in.dur;
        a = clamp(p * 2);
        const e = ease(el.in.ease, p);
        oy = (1 - e) * size * 0.45;
      }
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(0, oy);
      if (s !== 1) ctx.scale(s, s);
      // destaque da palavra
      if (w.hi && el.highlightStyle !== 'color') {
        const hp = clamp((life.lt - el.in.dur * 0.6 - w.i * stag) / 0.45);
        const he = EASE.out(hp);
        ctx.save();
        ctx.shadowBlur = 0;
        if (el.highlightStyle === 'box') {
          ctx.fillStyle = el.highlightColor;
          rr(ctx, x - size * 0.12, y - size * 0.86, (ww + size * 0.24) * he, size * 1.06, size * 0.12);
          ctx.fill();
        } else if (el.highlightStyle === 'marker') {
          ctx.fillStyle = withAlpha(el.highlightColor, 0.55);
          ctx.fillRect(x - size * 0.06, y - size * 0.42, (ww + size * 0.12) * he, size * 0.46);
        } else {
          ctx.fillStyle = el.highlightColor;
          ctx.fillRect(x, y + size * 0.12, ww * he, Math.max(2, size * 0.08));
        }
        ctx.restore();
      }
      const fill = w.hi && el.highlightStyle === 'color' ? el.highlightColor : w.hi && el.highlightStyle === 'box' ? spec.palette.bg : paint;
      if (perLetter) {
        // letra a letra: aparecer, máquina de escrever, embaralhar (decodifica) ou onda
        let lx = x;
        const step = fx === 'typewriter' ? el.in.dur / Math.max(1, chars) : fx === 'scramble' ? el.in.dur / Math.max(1, chars) * 0.8 : Math.min(0.05, stag / 2);
        for (const ch of w.t) {
          const p = fx === 'typewriter' ? (life.lt - ci * step) / 0.001 : (life.lt - ci * step) / (el.in.dur * (fx === 'scramble' ? 0.35 : 0.6));
          const cw = ctx.measureText(ch).width;
          if (p > 0) {
            ctx.save();
            let glyph = ch;
            let col = fill;
            if (fx === 'scramble') {
              // antes de "travar", letras aleatórias trocando (cor de destaque)
              if (p < 1) {
                const r = rand(((ci + 1) * 2654435761 + Math.floor(life.lt * 30) * 40503) % 2147483647);
                r();
                glyph = SCRAMBLE[Math.floor(r() * SCRAMBLE.length)];
                col = el.highlightColor;
                ctx.globalAlpha *= 0.85;
              }
            } else {
              ctx.globalAlpha *= clamp(p);
              if (fx === 'letters') ctx.translate(0, (1 - ease('back', p)) * size * 0.35);
              if (fx === 'wave') ctx.translate(0, (1 - ease('out', p)) * size * 0.55 + Math.sin(life.lt * 7 - ci * 0.55) * size * 0.05 * (1 - clamp(p - 1)));
            }
            ctx.fillStyle = col;
            if (el.stroke) { ctx.lineWidth = size * 0.06; ctx.strokeStyle = el.stroke; ctx.strokeText(glyph, lx, y); }
            ctx.fillText(glyph, lx, y);
            ctx.restore();
          }
          lx += cw;
          ci += 1;
        }
        ci += 1;
      } else if (fx === 'outline') {
        // contorno desenhado primeiro, o preenchimento vem depois
        const p = clamp(life.lt / el.in.dur);
        ctx.lineWidth = Math.max(1.5, size * 0.035);
        ctx.strokeStyle = typeof fill === 'string' ? fill : el.color;
        ctx.lineJoin = 'round';
        ctx.strokeText(w.t, x, y);
        ctx.save();
        ctx.globalAlpha *= EASE.out(clamp((p - 0.45) / 0.55));
        ctx.fillStyle = fill;
        ctx.fillText(w.t, x, y);
        ctx.restore();
      } else if (fx === 'glitch' && life.lt < el.in.dur) {
        // glitch de entrada: cópias deslocadas em ciano e magenta tremendo
        const r = rand(Math.floor(life.lt * 40) * 53 + w.i * 7);
        const j = size * 0.06;
        ctx.save();
        ctx.globalAlpha *= 0.75;
        ctx.fillStyle = '#00E5FF';
        ctx.fillText(w.t, x - j * (0.5 + r()), y + j * (r() - 0.5));
        ctx.fillStyle = '#FF2D95';
        ctx.fillText(w.t, x + j * (0.5 + r()), y + j * (r() - 0.5));
        ctx.restore();
        ctx.fillStyle = fill;
        if (r() > 0.25) ctx.fillText(w.t, x + j * (r() - 0.5), y);
      } else {
        ctx.fillStyle = fill;
        if (el.stroke) { ctx.lineWidth = size * 0.06; ctx.strokeStyle = el.stroke; ctx.lineJoin = 'round'; ctx.strokeText(w.t, x, y); }
        ctx.fillText(w.t, x, y);
      }
      ctx.restore();
      x += ww + space;
    }
    if (fx === 'mask-up') ctx.restore();
  });
  // cursor da máquina de escrever
  if (fx === 'typewriter' && life.lt < el.in.dur + 0.6 && Math.floor(life.lt * 3) % 2 === 0) {
    const last = lines[lines.length - 1] || [];
    const typed = clamp(life.lt / el.in.dur);
    const lw = last.reduce((a, w) => a + ctx.measureText(w.t).width, 0) + space * Math.max(0, last.length - 1);
    const xEnd = (el.align === 'left' ? 0 : el.align === 'right' ? -lw : -lw / 2) + lw * (typed >= 1 ? 1 : typed);
    ctx.fillStyle = el.color;
    ctx.fillRect(xEnd + size * 0.06, total / 2 - lh * 0.95, Math.max(2, size * 0.07), size * 0.95);
  }
}

function drawCounter(ctx, spec, el, life, W, H) {
  const size = el.size * H;
  const p = ease(el.countEase, Math.max(0, life.lt) / el.count);
  const v = lerp(el.from, el.to, p);
  const txt = `${el.prefix}${pmNumber(v, el.decimals)}${el.suffix}`;
  ctx.font = `${size}px "${fontOf(spec, el)}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = blockPaint(ctx, el, -W * 0.4, -size / 2, W * 0.4, size / 2, life.lt, el.color);
  if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.3; ctx.shadowOffsetY = size * 0.06; }
  // tamanho fixo pela largura final (não "pula" enquanto conta)
  const final = `${el.prefix}${pmNumber(el.to, el.decimals)}${el.suffix}`;
  const fw = ctx.measureText(final).width;
  const maxW = W * 0.9;
  if (fw > maxW) ctx.font = `${size * (maxW / fw)}px "${fontOf(spec, el)}"`;
  // batidinha quando chega no valor final
  const land = clamp((Math.max(0, life.lt) - el.count) / 0.25);
  const bump = land > 0 && land < 1 ? 1 + 0.08 * Math.sin(land * Math.PI) : 1;
  ctx.save();
  ctx.scale(bump, bump);
  ctx.fillText(txt, 0, 0);
  ctx.restore();
  if (el.label) {
    ctx.font = `${Math.max(10, size * 0.28)}px "${PM_FONTS.sans}"`;
    ctx.fillStyle = spec.palette.muted;
    ctx.fillText(el.label, 0, size * 0.78);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function chartColors(spec, el, i) {
  if (el.colors.length) return el.colors[i % el.colors.length];
  return i % 2 ? spec.palette.accent2 : spec.palette.accent;
}

function drawBars(ctx, spec, el, life, W, H) {
  const w = el.w * W;
  const h = el.h * H;
  const n = el.values.length;
  const max = Math.max(...el.values.map((v) => Math.abs(v)), 1e-9);
  const gap = (w / n) * 0.28;
  const bw = (w - gap * (n - 1)) / n;
  const stag = el.in.stagger ?? Math.min(0.15, 0.9 / n);
  const fs = Math.max(10, Math.min(bw * 0.42, H * 0.03));
  ctx.textAlign = 'center';
  // linha de base
  ctx.fillStyle = withAlpha(spec.palette.muted, 0.6);
  ctx.fillRect(-w / 2, h / 2, w, Math.max(1, H * 0.002));
  el.values.forEach((v, i) => {
    const p = ease(el.in.ease === 'out' ? 'back' : el.in.ease, (life.lt - i * stag) / el.in.dur);
    const bh = (Math.abs(v) / max) * h * Math.max(0, p);
    const x = -w / 2 + i * (bw + gap);
    ctx.fillStyle = chartColors(spec, el, i);
    rr(ctx, x, h / 2 - bh, bw, bh, Math.min(bw * 0.18, 18));
    ctx.fill();
    if (el.showValues && p > 0.05) {
      ctx.globalAlpha *= 1;
      ctx.font = `${fs}px "${PM_FONTS.heavy}"`;
      ctx.fillStyle = el.color;
      ctx.fillText(`${el.prefix}${pmNumber(v * clamp(p), 0)}${el.suffix}`, x + bw / 2, h / 2 - bh - fs * 0.45);
    }
    if (el.labels[i]) {
      ctx.font = `${fs * 0.85}px "${PM_FONTS.sans}"`;
      ctx.fillStyle = spec.palette.muted;
      ctx.fillText(el.labels[i], x + bw / 2, h / 2 + fs * 1.25);
    }
  });
  ctx.textAlign = 'left';
}

function drawLine(ctx, spec, el, life, W, H) {
  const w = el.w * W;
  const h = el.h * H;
  const n = el.values.length;
  const max = Math.max(...el.values);
  const min = Math.min(...el.values, 0);
  const span = max - min || 1;
  const pts = el.values.map((v, i) => [-w / 2 + (w * i) / (n - 1), h / 2 - ((v - min) / span) * h]);
  const p = clamp(life.eIn);
  // até onde a linha já foi desenhada (por comprimento)
  const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let left = total * (el.in.fx === 'draw' ? p : 1);
  const drawn = [pts[0]];
  for (let i = 0; i < segs.length && left > 0; i++) {
    const k = Math.min(1, left / segs[i]);
    drawn.push([lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]);
    left -= segs[i];
  }
  const col = el.colors[0] || spec.palette.accent;
  ctx.fillStyle = withAlpha(spec.palette.muted, 0.5);
  ctx.fillRect(-w / 2, h / 2, w, Math.max(1, H * 0.002));
  if (el.area && drawn.length > 1) {
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, withAlpha(col, 0.45));
    g.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(drawn[0][0], h / 2);
    for (const q of drawn) ctx.lineTo(q[0], q[1]);
    ctx.lineTo(drawn[drawn.length - 1][0], h / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, H * 0.006);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  drawn.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.stroke();
  const head = drawn[drawn.length - 1];
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(head[0], head[1], Math.max(4, H * 0.009), 0, Math.PI * 2);
  ctx.fill();
  const fs = Math.max(10, H * 0.026);
  ctx.textAlign = 'center';
  if (el.showValues && p >= 0.98) {
    ctx.font = `${fs}px "${PM_FONTS.heavy}"`;
    ctx.fillStyle = el.color;
    ctx.fillText(`${el.prefix}${pmNumber(el.values[n - 1])}${el.suffix}`, head[0], head[1] - fs * 0.8);
  }
  ctx.font = `${fs * 0.8}px "${PM_FONTS.sans}"`;
  ctx.fillStyle = spec.palette.muted;
  el.labels.forEach((l, i) => l && ctx.fillText(l, pts[i][0], h / 2 + fs * 1.2));
  ctx.textAlign = 'left';
}

function drawProgress(ctx, spec, el, life, W, H) {
  const p = clamp(life.eIn) * (el.value / 100);
  const track = el.track || withAlpha(spec.palette.muted, 0.25);
  if (el.kind === 'bar') {
    const w = el.w * W;
    const h = Math.max(8, H * 0.022);
    ctx.fillStyle = track;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = el.fill;
    rr(ctx, -w / 2, -h / 2, Math.max(h, w * p), h, h / 2);
    ctx.fill();
    ctx.font = `${h * 1.6}px "${PM_FONTS.heavy}"`;
    ctx.fillStyle = el.color;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(p * 100)}%`, w / 2, -h * 1.2);
    if (el.label) { ctx.textAlign = 'left'; ctx.font = `${h * 1.3}px "${PM_FONTS.sans}"`; ctx.fillText(el.label, -w / 2, -h * 1.2); }
    ctx.textAlign = 'left';
    return;
  }
  const r = (el.size * Math.min(W, H)) / 2 + el.size * H * 0.2;
  const lw = r * 0.18;
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = track;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = el.fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${r * 0.62}px "${PM_FONTS.heavy}"`;
  ctx.fillStyle = el.color;
  ctx.fillText(`${Math.round(p * 100)}%`, 0, el.label ? -r * 0.08 : 0);
  if (el.label) { ctx.font = `${r * 0.2}px "${PM_FONTS.sans}"`; ctx.fillStyle = spec.palette.muted; ctx.fillText(el.label, 0, r * 0.38); }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function shapePath(ctx, shape, w, h, r) {
  ctx.beginPath();
  if (shape === 'circle' || shape === 'ring') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'pill') rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  else if (shape === 'triangle') { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); }
  else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr2 = i % 2 ? 0.42 : 1;
      ctx.lineTo(Math.cos(a) * (w / 2) * rr2, Math.sin(a) * (h / 2) * rr2);
    }
    ctx.closePath();
  } else if (shape === 'line') { ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); }
  else rr(ctx, -w / 2, -h / 2, w, h, r);
}

function drawShape(ctx, spec, el, life, W, H) {
  const w = el.w * W;
  const h = el.shape === 'circle' || el.shape === 'ring' || el.shape === 'star' ? (el.h === 0.1 ? el.w * W : el.h * H) : el.h * H;
  const drawFx = el.in.fx === 'draw';
  shapePath(ctx, el.shape, w, h, el.radius * Math.min(w, h) * 2);
  if (el.fill && !drawFx && el.shape !== 'line' && el.shape !== 'ring') { ctx.fillStyle = el.fill; ctx.fill(); }
  const stroke = el.stroke || (el.shape === 'line' || el.shape === 'ring' || drawFx ? el.fill || el.color : null);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = el.shape === 'line' ? Math.max(el.strokeWidth, h) : el.strokeWidth;
    ctx.lineCap = 'round';
    if (drawFx) {
      const len = (el.shape === 'line' ? w : Math.PI * (w + h)) * 1.05;
      ctx.setLineDash([len, len]);
      ctx.lineDashOffset = len * (1 - life.eIn);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (drawFx && el.fill && life.pIn >= 1 && el.shape !== 'line' && el.shape !== 'ring') {
      ctx.globalAlpha *= clamp((life.lt - el.in.dur) / 0.3);
      ctx.fillStyle = el.fill;
      ctx.fill();
    }
  }
}

/** Ícones de traço num quadrado de lado s (centro 0,0). */
function drawIconPath(ctx, icon, s, col, life) {
  const k = s / 2;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const draw = life ? clamp(life.lt / Math.max(0.2, life.inDur)) : 1;
  ctx.beginPath();
  switch (icon) {
    case 'check': {
      const pts = [[-0.55, 0.02], [-0.15, 0.42], [0.6, -0.42]];
      const segs = [Math.hypot(0.4, 0.4), Math.hypot(0.75, 0.84)];
      let left = (segs[0] + segs[1]) * draw;
      ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
      for (let i = 0; i < 2 && left > 0; i++) {
        const f = Math.min(1, left / segs[i]);
        ctx.lineTo(lerp(pts[i][0], pts[i + 1][0], f) * k, lerp(pts[i][1], pts[i + 1][1], f) * k);
        left -= segs[i];
      }
      ctx.stroke();
      return;
    }
    case 'x': ctx.moveTo(-0.45 * k, -0.45 * k); ctx.lineTo(0.45 * k, 0.45 * k); ctx.moveTo(0.45 * k, -0.45 * k); ctx.lineTo(-0.45 * k, 0.45 * k); ctx.stroke(); return;
    case 'arrow': ctx.moveTo(-0.6 * k, 0); ctx.lineTo(0.55 * k, 0); ctx.moveTo(0.15 * k, -0.4 * k); ctx.lineTo(0.6 * k, 0); ctx.lineTo(0.15 * k, 0.4 * k); ctx.stroke(); return;
    case 'star': shapePath(ctx, 'star', s * 0.95, s * 0.95, 0); ctx.fill(); return;
    case 'heart':
      ctx.moveTo(0, 0.6 * k);
      ctx.bezierCurveTo(-1.1 * k, -0.1 * k, -0.45 * k, -0.95 * k, 0, -0.35 * k);
      ctx.bezierCurveTo(0.45 * k, -0.95 * k, 1.1 * k, -0.1 * k, 0, 0.6 * k);
      ctx.fill();
      return;
    case 'bolt': ctx.moveTo(0.15 * k, -0.85 * k); ctx.lineTo(-0.45 * k, 0.1 * k); ctx.lineTo(0, 0.1 * k); ctx.lineTo(-0.15 * k, 0.85 * k); ctx.lineTo(0.45 * k, -0.1 * k); ctx.lineTo(0, -0.1 * k); ctx.closePath(); ctx.fill(); return;
    case 'clock': ctx.arc(0, 0, 0.75 * k, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(0, -0.45 * k); ctx.moveTo(0, 0); ctx.lineTo(0.35 * k, 0.2 * k); ctx.stroke(); return;
    case 'money':
      ctx.font = `${s * 0.95}px "${PM_FONTS.heavy}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, s * 0.04);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      return;
    case 'chart': ctx.moveTo(-0.7 * k, 0.7 * k); ctx.lineTo(0.7 * k, 0.7 * k); ctx.moveTo(-0.55 * k, 0.3 * k); ctx.lineTo(-0.15 * k, -0.1 * k); ctx.lineTo(0.15 * k, 0.15 * k); ctx.lineTo(0.6 * k, -0.55 * k); ctx.stroke(); return;
    case 'target': ctx.arc(0, 0, 0.78 * k, 0, Math.PI * 2); ctx.moveTo(0.45 * k, 0); ctx.arc(0, 0, 0.45 * k, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 0.14 * k, 0, Math.PI * 2); ctx.fill(); return;
    case 'bulb': ctx.arc(0, -0.15 * k, 0.55 * k, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(0.25 * k, 0.55 * k); ctx.lineTo(-0.25 * k, 0.55 * k); ctx.closePath(); ctx.moveTo(-0.22 * k, 0.8 * k); ctx.lineTo(0.22 * k, 0.8 * k); ctx.stroke(); return;
    case 'user': ctx.arc(0, -0.3 * k, 0.33 * k, 0, Math.PI * 2); ctx.moveTo(-0.65 * k, 0.8 * k); ctx.quadraticCurveTo(0, -0.05 * k, 0.65 * k, 0.8 * k); ctx.stroke(); return;
    case 'chat': rr(ctx, -0.75 * k, -0.6 * k, 1.5 * k, 1.05 * k, 0.3 * k); ctx.moveTo(-0.35 * k, 0.45 * k); ctx.lineTo(-0.5 * k, 0.8 * k); ctx.lineTo(0.05 * k, 0.45 * k); ctx.stroke(); return;
    case 'cart': ctx.moveTo(-0.8 * k, -0.6 * k); ctx.lineTo(-0.55 * k, -0.6 * k); ctx.lineTo(-0.35 * k, 0.35 * k); ctx.lineTo(0.55 * k, 0.35 * k); ctx.lineTo(0.7 * k, -0.35 * k); ctx.lineTo(-0.45 * k, -0.35 * k); ctx.stroke(); ctx.beginPath(); ctx.arc(-0.25 * k, 0.65 * k, 0.12 * k, 0, Math.PI * 2); ctx.arc(0.45 * k, 0.65 * k, 0.12 * k, 0, Math.PI * 2); ctx.fill(); return;
    case 'play': ctx.moveTo(-0.35 * k, -0.6 * k); ctx.lineTo(0.6 * k, 0); ctx.lineTo(-0.35 * k, 0.6 * k); ctx.closePath(); ctx.fill(); return;
    case 'lock': rr(ctx, -0.6 * k, -0.1 * k, 1.2 * k, 0.9 * k, 0.12 * k); ctx.moveTo(-0.35 * k, -0.1 * k); ctx.arc(0, -0.35 * k, 0.35 * k, Math.PI, 0); ctx.lineTo(0.35 * k, -0.1 * k); ctx.stroke(); return;
    case 'bell': ctx.moveTo(-0.65 * k, 0.45 * k); ctx.quadraticCurveTo(-0.45 * k, 0.2 * k, -0.45 * k, -0.15 * k); ctx.arc(0, -0.15 * k, 0.45 * k, Math.PI, 0); ctx.quadraticCurveTo(0.45 * k, 0.2 * k, 0.65 * k, 0.45 * k); ctx.closePath(); ctx.moveTo(-0.15 * k, 0.65 * k); ctx.lineTo(0.15 * k, 0.65 * k); ctx.stroke(); return;
    case 'gift': rr(ctx, -0.7 * k, -0.15 * k, 1.4 * k, 0.95 * k, 0.08 * k); ctx.rect(-0.8 * k, -0.45 * k, 1.6 * k, 0.3 * k); ctx.moveTo(0, -0.45 * k); ctx.lineTo(0, 0.8 * k); ctx.moveTo(0, -0.45 * k); ctx.quadraticCurveTo(-0.5 * k, -0.95 * k, -0.25 * k, -0.45 * k); ctx.moveTo(0, -0.45 * k); ctx.quadraticCurveTo(0.5 * k, -0.95 * k, 0.25 * k, -0.45 * k); ctx.stroke(); return;
    case 'fire': ctx.moveTo(0, 0.85 * k); ctx.bezierCurveTo(-0.85 * k, 0.6 * k, -0.6 * k, -0.2 * k, -0.1 * k, -0.85 * k); ctx.bezierCurveTo(0, -0.3 * k, 0.35 * k, -0.4 * k, 0.3 * k, -0.6 * k); ctx.bezierCurveTo(0.85 * k, -0.1 * k, 0.75 * k, 0.65 * k, 0, 0.85 * k); ctx.fill(); return;
    case 'search': ctx.arc(-0.15 * k, -0.15 * k, 0.5 * k, 0, Math.PI * 2); ctx.moveTo(0.22 * k, 0.22 * k); ctx.lineTo(0.7 * k, 0.7 * k); ctx.stroke(); return;
    case 'rocket': ctx.moveTo(0, -0.9 * k); ctx.quadraticCurveTo(0.5 * k, -0.4 * k, 0.32 * k, 0.4 * k); ctx.lineTo(-0.32 * k, 0.4 * k); ctx.quadraticCurveTo(-0.5 * k, -0.4 * k, 0, -0.9 * k); ctx.moveTo(-0.32 * k, 0.15 * k); ctx.lineTo(-0.6 * k, 0.55 * k); ctx.moveTo(0.32 * k, 0.15 * k); ctx.lineTo(0.6 * k, 0.55 * k); ctx.moveTo(0, 0.55 * k); ctx.lineTo(0, 0.85 * k); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -0.25 * k, 0.14 * k, 0, Math.PI * 2); ctx.fill(); return;
    case 'trophy': ctx.moveTo(-0.45 * k, -0.7 * k); ctx.lineTo(0.45 * k, -0.7 * k); ctx.quadraticCurveTo(0.45 * k, 0.15 * k, 0, 0.2 * k); ctx.quadraticCurveTo(-0.45 * k, 0.15 * k, -0.45 * k, -0.7 * k); ctx.moveTo(0, 0.2 * k); ctx.lineTo(0, 0.55 * k); ctx.moveTo(-0.35 * k, 0.75 * k); ctx.lineTo(0.35 * k, 0.75 * k); ctx.moveTo(-0.45 * k, -0.55 * k); ctx.quadraticCurveTo(-0.85 * k, -0.45 * k, -0.4 * k, -0.1 * k); ctx.moveTo(0.45 * k, -0.55 * k); ctx.quadraticCurveTo(0.85 * k, -0.45 * k, 0.4 * k, -0.1 * k); ctx.stroke(); return;
    default: ctx.arc(0, 0, 0.6 * k, 0, Math.PI * 2); ctx.fill();
  }
}

function drawIcon(ctx, spec, el, life, W, H) {
  const s = el.size * Math.min(W, H) * 1.6;
  if (el.bg) {
    ctx.fillStyle = el.bg;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }
  drawIconPath(ctx, el.icon, s * (el.bg ? 0.85 : 1), el.color, el.in.fx === 'draw' ? { lt: life.lt, inDur: el.in.dur } : null);
}

function drawList(ctx, spec, el, life, W, H) {
  const size = el.size * H;
  const lh = size * (1.55 + 0.4 * (el.gap - 1));
  const fam = fontOf(spec, el);
  const total = lh * el.items.length;
  const x0 = el.align === 'center' ? 0 : -(el.w * W) / 2;
  ctx.textBaseline = 'middle';
  el.items.forEach((it, i) => {
    const lt = life.lt - i * el.stagger;
    if (lt < 0) return;
    const p = ease(el.in.ease, lt / el.in.dur);
    const y = -total / 2 + lh * (i + 0.5);
    ctx.save();
    ctx.globalAlpha *= clamp(lt / (el.in.dur * 0.6));
    ctx.translate((1 - p) * -size * 1.2, 0);
    ctx.font = `${size}px "${fam}"`;
    const tw = ctx.measureText(it).width;
    const bx = el.align === 'center' ? -(tw + size * 1.4) / 2 : x0;
    // marcador
    const bs = size * 0.95;
    if (el.bullet === 'number') {
      ctx.fillStyle = el.accent;
      ctx.beginPath();
      ctx.arc(bx + bs / 2, y, bs / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = spec.palette.bg;
      ctx.font = `${bs * 0.6}px "${PM_FONTS.heavy}"`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), bx + bs / 2, y + bs * 0.03);
      ctx.textAlign = 'left';
      ctx.font = `${size}px "${fam}"`;
    } else if (el.bullet === 'dot') {
      ctx.fillStyle = el.accent;
      ctx.beginPath();
      ctx.arc(bx + bs / 2, y, bs * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(bx + bs / 2, y);
      if (el.bullet === 'check' || el.bullet === 'x') {
        ctx.fillStyle = el.bullet === 'x' ? '#E5484D' : el.accent;
        ctx.beginPath();
        ctx.arc(0, 0, bs / 2, 0, Math.PI * 2);
        ctx.fill();
        drawIconPath(ctx, el.bullet, bs * 0.55, '#FFFFFF', { lt: lt - el.in.dur * 0.4, inDur: 0.3 });
      } else drawIconPath(ctx, 'arrow', bs * 0.8, el.accent, null);
      ctx.restore();
    }
    ctx.fillStyle = el.color;
    ctx.fillText(it, bx + bs * 1.45, y + size * 0.04);
    ctx.restore();
  });
  ctx.textBaseline = 'alphabetic';
}

function drawBadge(ctx, spec, el, life, W, H) {
  const size = el.size * H;
  const text = el.upper ? el.text.toUpperCase() : el.text;
  ctx.font = `${size}px "${fontOf(spec, el)}"`;
  const tw = ctx.measureText(text).width;
  const ph = size * 1.7;
  const pw = tw + size * 1.6;
  const open = el.in.fx === 'draw' ? life.eIn : 1;
  ctx.fillStyle = el.fill;
  rr(ctx, -pw / 2, -ph / 2, pw * open, ph, ph / 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-pw / 2, -ph / 2, pw * open, ph);
  ctx.clip();
  if (el.shine) {
    // brilho atravessando o selo
    const x = lerp(-pw, pw, ((Math.max(0, life.lt) % 2.2) / 1.1) - 0.2);
    const g = ctx.createLinearGradient(x - pw * 0.25, 0, x + pw * 0.25, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  }
  ctx.fillStyle = el.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawCard(ctx, spec, el, life, W, H) {
  const w = el.w * W;
  const h = el.h * H;
  const r = el.radius * Math.min(W, H);
  ctx.save();
  if (el.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.min(W, H) * 0.05;
    ctx.shadowOffsetY = Math.min(W, H) * 0.015;
  }
  ctx.fillStyle = el.glass ? withAlpha(el.fill, 0.14) : el.fill;
  rr(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.restore();
  if (el.glass || el.border) {
    ctx.strokeStyle = el.border || withAlpha('#FFFFFF', 0.35);
    ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.003);
    rr(ctx, -w / 2, -h / 2, w, h, r);
    ctx.stroke();
  }
  if (el.loop === 'shimmer') {
    const x = lerp(-w, w, (Math.max(0, life.lt) * 0.5) % 1.4);
    ctx.save();
    rr(ctx, -w / 2, -h / 2, w, h, r);
    ctx.clip();
    const g = ctx.createLinearGradient(x - w * 0.2, 0, x + w * 0.2, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawArrow(ctx, spec, el, life, W, H) {
  // a peça é posicionada em (x,y); a seta vai de from → to (frações do quadro), relativa a ele
  const ox = el.x * W;
  const oy = el.y * H;
  const a = [el.from[0] * W - ox, el.from[1] * H - oy];
  const b = [el.to[0] * W - ox, el.to[1] * H - oy];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const c = [mx + nx * el.curve * 0.5, my + ny * el.curve * 0.5];
  const p = el.in.fx === 'draw' ? life.eIn : 1;
  const steps = 40;
  const at = (k) => [(1 - k) ** 2 * a[0] + 2 * (1 - k) * k * c[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * c[1] + k * k * b[1]];
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.width * (H / 1920) * 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= steps * p; i++) {
    const q = at(i / steps);
    if (i === 0) ctx.moveTo(q[0], q[1]);
    else ctx.lineTo(q[0], q[1]);
  }
  ctx.stroke();
  if (el.head && p > 0.85) {
    const e = at(p);
    const d = at(Math.max(0, p - 0.04));
    const ang = Math.atan2(e[1] - d[1], e[0] - d[0]);
    const hs = ctx.lineWidth * 3.2;
    ctx.beginPath();
    ctx.moveTo(e[0] - Math.cos(ang - 0.5) * hs, e[1] - Math.sin(ang - 0.5) * hs);
    ctx.lineTo(e[0], e[1]);
    ctx.lineTo(e[0] - Math.cos(ang + 0.5) * hs, e[1] - Math.sin(ang + 0.5) * hs);
    ctx.stroke();
  }
}

function drawParticles(ctx, spec, el, life, W, H) {
  const r = rand(el.count * 131 + Math.round(el.at * 100) + 7);
  const cols = el.colors.length ? el.colors : [spec.palette.accent, spec.palette.accent2, '#FFFFFF', '#FFD23F'];
  const lt = Math.max(0, life.lt);
  const u = Math.min(W, H);
  // posições no quadro inteiro (a peça só define onde o "burst" explode)
  const fx0 = -el.x * W;
  const fy0 = -el.y * H;
  for (let i = 0; i < el.count; i++) {
    const x0 = r();
    const y0 = r();
    const sp = 0.5 + r();
    const ph = r() * Math.PI * 2;
    const col = cols[i % cols.length];
    const sz = u * (0.006 + r() * 0.012);
    ctx.save();
    ctx.fillStyle = col;
    switch (el.kind) {
      case 'confetti': {
        const y = (((y0 + lt * 0.22 * sp) % 1.2) - 0.1) * H;
        ctx.translate(fx0 + x0 * W + Math.sin(lt * 2 + ph) * u * 0.03, fy0 + y);
        ctx.rotate(lt * 3 * sp + ph);
        ctx.scale(1, Math.cos(lt * 5 * sp + ph));
        ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
        break;
      }
      case 'sparkle': {
        const tw = 0.5 + 0.5 * Math.sin(lt * 4 * sp + ph);
        ctx.translate(fx0 + x0 * W, fy0 + y0 * H);
        ctx.globalAlpha *= tw;
        shapePath(ctx, 'star', sz * 3 * tw, sz * 3 * tw, 0);
        ctx.fill();
        break;
      }
      case 'embers': {
        const y = (1.05 - ((y0 + lt * 0.12 * sp) % 1.1)) * H;
        ctx.translate(fx0 + x0 * W + Math.sin(lt + ph) * u * 0.02, fy0 + y);
        ctx.globalAlpha *= 0.4 + 0.6 * Math.abs(Math.sin(lt * 2 + ph));
        ctx.shadowColor = col;
        ctx.shadowBlur = sz * 3;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bubbles': {
        const y = (1.1 - ((y0 + lt * 0.08 * sp) % 1.2)) * H;
        ctx.translate(fx0 + x0 * W, fy0 + y);
        ctx.strokeStyle = col;
        ctx.globalAlpha *= 0.55;
        ctx.lineWidth = Math.max(1, sz * 0.2);
        ctx.beginPath();
        ctx.arc(0, 0, sz * 2 * sp, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'snow': {
        const y = (((y0 + lt * 0.07 * sp) % 1.1) - 0.05) * H;
        ctx.translate(fx0 + x0 * W + Math.sin(lt + ph) * u * 0.03, fy0 + y);
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: { // burst: explode a partir do centro da peça e cai
        const ang = ph;
        const v = u * (0.25 + 0.5 * r()) * sp;
        const k = EASE.out(clamp(lt / 1.2));
        ctx.translate(Math.cos(ang) * v * k, Math.sin(ang) * v * k + lt * lt * u * 0.08);
        ctx.rotate(lt * 6 * sp);
        ctx.globalAlpha *= clamp(1.6 - lt * 0.7);
        ctx.fillRect(-sz, -sz * 0.45, sz * 2, sz * 0.9);
      }
    }
    ctx.restore();
  }
}

function drawUi(ctx, spec, el, life, W, H) {
  const size = el.size * H;
  const w = el.w * W;
  const lt = Math.max(0, life.lt);
  ctx.textBaseline = 'middle';
  if (el.kind === 'search') {
    const h = size * 2.4;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = size;
    ctx.fillStyle = el.fill;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(-w / 2 + h * 0.55, 0);
    drawIconPath(ctx, 'search', size * 1.1, '#6B6B7B', null);
    ctx.restore();
    const typed = Math.floor(clamp((lt - el.in.dur * 0.6) / Math.max(0.6, el.text.length * 0.06)) * el.text.length);
    ctx.font = `${size}px "${PM_FONTS.sans}"`;
    ctx.fillStyle = '#18181F';
    const shown = el.text.slice(0, typed);
    // texto maior que a barra: rola para a esquerda (como num campo de busca de verdade)
    const tx0 = -w / 2 + h * 1.05;
    const room = w / 2 - h * 0.45 - tx0;
    const sw = ctx.measureText(shown).width;
    const shift = Math.max(0, sw - room);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx0, -h / 2, room + size * 0.3, h);
    ctx.clip();
    ctx.fillText(shown, tx0 - shift, 0);
    if (Math.floor(lt * 3) % 2 === 0) ctx.fillRect(tx0 - shift + sw + 2, -size * 0.6, Math.max(2, size * 0.08), size * 1.2);
    ctx.restore();
  } else if (el.kind === 'notification') {
    const h = size * 3.6;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = size * 1.2;
    ctx.fillStyle = withAlpha(el.fill, 0.96);
    rr(ctx, -w / 2, -h / 2, w, h, size * 0.9);
    ctx.fill();
    ctx.restore();
    const is = size * 2.1;
    ctx.fillStyle = el.accent;
    rr(ctx, -w / 2 + size * 0.75, -is / 2, is, is, is * 0.24);
    ctx.fill();
    ctx.save();
    ctx.translate(-w / 2 + size * 0.75 + is / 2, 0);
    drawIconPath(ctx, 'bell', is * 0.6, '#FFFFFF', null);
    ctx.restore();
    ctx.fillStyle = '#18181F';
    ctx.font = `${size}px "${PM_FONTS.heavy}"`;
    ctx.fillText(el.title || 'Agora', -w / 2 + size * 1.25 + is, -size * 0.6);
    ctx.font = `${size * 0.9}px "${PM_FONTS.sans}"`;
    ctx.fillStyle = '#3A3A48';
    let line = el.text;
    const maxW = w - (size * 2 + is);
    while (line.length > 3 && ctx.measureText(line).width > maxW) line = `${line.slice(0, -2).trimEnd()}…`;
    ctx.fillText(line, -w / 2 + size * 1.25 + is, size * 0.7);
  } else if (el.kind === 'button') {
    ctx.font = `${size * 1.15}px "${PM_FONTS.heavy}"`;
    const label = el.text || 'Saiba mais';
    const bw = Math.min(w, ctx.measureText(label).width + size * 3);
    const bh = size * 2.6;
    // o cursor chega e clica no meio da cena
    const clickAt = el.in.dur + 0.7;
    const press = lt > clickAt && lt < clickAt + 0.25 ? 0.93 : 1;
    ctx.save();
    ctx.scale(press, press);
    ctx.shadowColor = withAlpha(el.accent, 0.55);
    ctx.shadowBlur = size * (lt > clickAt ? 1.6 : 0.8);
    ctx.fillStyle = el.accent;
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, size * 0.05);
    ctx.textAlign = 'left';
    const cp = EASE.inout(clamp((lt - el.in.dur * 0.4) / 0.7));
    if (cp > 0) {
      const cx = lerp(bw * 0.9, bw * 0.12, cp);
      const cy = lerp(bh * 1.6, bh * 0.2, cp);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(1, size * 0.08);
      const s = size * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, s); ctx.lineTo(s * 0.28, s * 0.74); ctx.lineTo(s * 0.5, s * 1.1); ctx.lineTo(s * 0.64, s * 1.02); ctx.lineTo(s * 0.44, s * 0.68); ctx.lineTo(s * 0.8, s * 0.66); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // conversa: três pontinhos digitando, depois a mensagem
    ctx.font = `${size}px "${PM_FONTS.sans}"`;
    const typing = lt < el.in.dur + 0.9;
    const lines = typing ? ['   '] : (() => { const ws = el.text.split(' '); const out = []; let cur = ''; for (const x of ws) { const t2 = cur ? `${cur} ${x}` : x; if (ctx.measureText(t2).width > w * 0.82 && cur) { out.push(cur); cur = x; } else cur = t2; } if (cur) out.push(cur); return out; })();
    const bw = typing ? size * 4 : Math.min(w, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.8);
    const bh = size * (1.4 * lines.length + 1.2);
    ctx.fillStyle = el.accent;
    rr(ctx, -bw / 2, -bh / 2, bw, bh, size * 0.9);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    if (typing) {
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(lt * 5 - i * 0.6));
        ctx.beginPath();
        ctx.arc(-size + i * size, 0, size * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    } else lines.forEach((l, i) => ctx.fillText(l, -bw / 2 + size * 0.9, -bh / 2 + size * (1.3 + i * 1.4)));
  }
  ctx.textBaseline = 'alphabetic';
}

/** Transição de tela cheia: na 1ª metade cobre a tela, na 2ª revela (a cena de baixo muda). */
function drawTransition(ctx, spec, el, life, W, H) {
  const d = el.in.dur;
  const q = clamp(Math.max(0, life.lt) / d);
  // ctx já está no centro da peça; a transição usa o quadro inteiro
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  const cover = q < 0.5 ? EASE.inout(q * 2) : 1;
  const reveal = q < 0.5 ? 0 : EASE.inout((q - 0.5) * 2);
  const c1 = el.fill;
  const c2 = el.fill2 || c1;
  ctx.fillStyle = c1;
  switch (el.kind) {
    case 'wipe-right':
      ctx.fillRect(W * reveal, 0, W * (cover - reveal), H);
      break;
    case 'wipe-up':
      ctx.fillRect(0, H * (1 - cover), W, H * (cover - reveal));
      break;
    case 'circle': {
      const R = Math.hypot(W, H) / 2;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, R * cover, 0, Math.PI * 2);
      if (reveal > 0) ctx.arc(W / 2, H / 2, R * reveal, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      break;
    }
    case 'diagonal': {
      const L = W + H;
      const a = L * reveal;
      const b = L * cover;
      ctx.beginPath();
      ctx.moveTo(W - a, 0); ctx.lineTo(W - b, 0); ctx.lineTo(W - b - H, H); ctx.lineTo(W - a - H, H);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bars': {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const k = clamp(cover * 1.4 - i * 0.08);
        const r2 = clamp(reveal * 1.4 - i * 0.08);
        ctx.fillStyle = i % 2 ? c2 : c1;
        ctx.fillRect((W / n) * i, H * r2, W / n + 1, H * (k - r2));
      }
      break;
    }
    case 'flash': {
      ctx.fillStyle = withAlpha(c1 || '#FFFFFF', q < 0.3 ? q / 0.3 : clamp(1 - (q - 0.3) / 0.7));
      ctx.fillRect(0, 0, W, H);
      break;
    }
    default: // wipe-left: entra pela direita, sai pela esquerda
      ctx.fillRect(W * (1 - cover), 0, W * (cover - reveal), H);
  }
}

const DRAW = { transition: drawTransition, text: drawText, counter: drawCounter, bars: drawBars, line: drawLine, progress: drawProgress, shape: drawShape, icon: drawIcon, list: drawList, badge: drawBadge, card: drawCard, arrow: drawArrow, particles: drawParticles, ui: drawUi };

/**
 * Desenha o quadro do instante `t` (segundos desde o início da cena).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec roteiro já validado (sanitizePromptSpec)
 * @param {{W:number,H:number}} env
 */
export function drawPromptMotion(ctx, spec, t, env) {
  const { W, H } = env;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.shadowBlur = 0;
  drawBackground(ctx, spec, t, W, H);
  const cam = cameraAt(spec.camera || [], t);
  const shake = spec.shake ? spec.shake * Math.min(W, H) * 0.006 : 0;
  for (const el of spec.elements) {
    const life = lifeOf(el, t, spec.duration);
    if (!life.visible) continue;
    const place = (lf, tt) => {
      if (!el.fixed) {
        // paralaxe: o que está "na frente" (depth > 0) anda e aproxima mais com a câmera
        const k = 1 + (el.depth || 0) * 0.8;
        const z = 1 + (cam.zoom - 1) * k;
        ctx.translate(W / 2, H / 2);
        ctx.scale(z, z);
        if (cam.rotate) ctx.rotate((cam.rotate * Math.PI) / 180);
        ctx.translate(-W / 2 - cam.x * W * k + (shake ? Math.sin(tt * 47) * shake : 0), -H / 2 - cam.y * H * k + (shake ? Math.cos(tt * 39) * shake : 0));
      }
      applyTransform(ctx, el, lf, tt, W, H);
    };
    // rastro de movimento na entrada: cópias fracas de instantes anteriores (motion blur barato)
    if (el.trail && life.pIn < 1 && life.lt > 0) {
      for (const [dt, a] of [[0.05, 0.22], [0.1, 0.12], [0.15, 0.06]]) {
        const lf = lifeOf(el, t - dt, spec.duration);
        if (!lf.visible) continue;
        ctx.save();
        ctx.globalAlpha = a;
        place(lf, t - dt);
        (DRAW[el.type] || (() => {}))(ctx, spec, el, lf, W, H);
        ctx.restore();
      }
    }
    ctx.save();
    place(life, t);
    (DRAW[el.type] || (() => {}))(ctx, spec, el, life, W, H);
    ctx.restore();
  }
  if (spec.bg.grain) drawGrain(ctx, t, W, H);
  ctx.restore();
}

// ─────────────────────────────── formulário (como o Prompt Motion) ───────────────────────────────
export const PM_GOALS = {
  explicar: 'Explicar uma ideia',
  numeros: 'Mostrar números/resultado',
  lista: 'Lista ou passo a passo',
  produto: 'Vender produto/oferta',
  gancho: 'Gancho de abertura',
  cta: 'Chamada final (CTA)',
  comparar: 'Antes × depois',
  showreel: 'Showreel de palavras',
};
export const PM_LOOKS = {
  bold: 'Impacto (bold)',
  minimal: 'Minimalista',
  neon: 'Neon escuro',
  editorial: 'Editorial',
  premium: 'Premium (vidro)',
  divertido: 'Divertido',
};
export const PM_PACES = { calmo: 'Calmo', medio: 'Médio', rapido: 'Rápido' };
export const PM_PALETTES = {
  laranja: { label: 'Laranja e roxo', palette: { bg: '#0B0B12', bg2: '#22124A', text: '#FFFFFF', accent: '#FF6B35', accent2: '#7C3AED', muted: '#A1A1B5' } },
  neon: { label: 'Neon', palette: { bg: '#05050A', bg2: '#0E1F3A', text: '#F4F7FF', accent: '#22D3EE', accent2: '#E879F9', muted: '#8A94A8' } },
  creme: { label: 'Creme e preto', palette: { bg: '#F7F3EC', bg2: '#ECE4D6', text: '#111111', accent: '#E3161F', accent2: '#111111', muted: '#6B6459' } },
  verde: { label: 'Dinheiro (verde)', palette: { bg: '#04140C', bg2: '#0B3B24', text: '#FFFFFF', accent: '#22C55E', accent2: '#FACC15', muted: '#9DB8A8' } },
  azul: { label: 'Azul corporativo', palette: { bg: '#071226', bg2: '#123A7A', text: '#FFFFFF', accent: '#3B82F6', accent2: '#F59E0B', muted: '#9DB0CF' } },
  pastel: { label: 'Pastel', palette: { bg: '#FFF4F8', bg2: '#E9E4FF', text: '#2A1E3D', accent: '#FF5C8A', accent2: '#7C5CFF', muted: '#7D7290' } },
};

/** Modelos prontos (ponto de partida, como os modelos do Prompt Motion). */
export const PM_TEMPLATES = [
  { id: 'contador', label: 'Contador de resultado', goal: 'numeros', look: 'bold', prompt: 'Contador de 0 a 10.000 seguidores com a palavra "em 30 dias" embaixo e confete no final' },
  { id: 'grafico', label: 'Gráfico subindo', goal: 'numeros', look: 'premium', prompt: 'Gráfico de barras crescendo mês a mês (jan 2 mil, fev 5 mil, mar 12 mil) com o título "Faturamento" e uma seta subindo' },
  { id: 'passos', label: 'Lista de passos', goal: 'lista', look: 'minimal', prompt: '3 passos para vender mais: 1 defina o cliente, 2 crie a oferta, 3 faça o anúncio — cada um entra com um check' },
  { id: 'oferta', label: 'Oferta de produto', goal: 'produto', look: 'premium', prompt: 'Card de oferta "Mentoria 90 dias" com selo "VAGAS LIMITADAS", preço de R$ 997 por R$ 497 e um botão "Quero entrar" sendo clicado' },
  { id: 'gancho', label: 'Gancho de abertura', goal: 'gancho', look: 'neon', prompt: 'Pergunta grande: "Você está perdendo dinheiro?" com a palavra dinheiro destacada, câmera aproximando e brilho' },
  { id: 'antesdepois', label: 'Antes × depois', goal: 'comparar', look: 'editorial', prompt: 'Antes: 2 vendas por mês (com X vermelho). Depois: 40 vendas por mês (com check verde). Divisão no meio da tela' },
  { id: 'notificacao', label: 'Notificação de venda', goal: 'produto', look: 'divertido', prompt: 'Várias notificações de "Venda aprovada R$ 197" chegando uma atrás da outra num fundo degradê' },
  { id: 'cta', label: 'Chamada final', goal: 'cta', look: 'bold', prompt: 'Siga para mais dicas — com a palavra "Siga" destacada, uma seta apontando e um botão de seguir' },
  { id: 'busca', label: 'Pesquisa no Google', goal: 'explicar', look: 'minimal', prompt: 'Barra de pesquisa digitando "como vender pelo Instagram" e depois o texto "a resposta está neste vídeo"' },
  { id: 'showreel', label: 'Showreel de palavras', goal: 'showreel', look: 'neon', prompt: 'Palavras rápidas uma depois da outra: FOCO, CONSTÂNCIA, RESULTADO — cada uma com um efeito diferente, câmera tremendo levemente' },
];

const PACE_SCALE = { calmo: 1.35, medio: 1, rapido: 0.72 };

// ─────────────────────────────── roteiro sem IA (ou como ponto de partida) ───────────────────────────────
function numbersIn(text) {
  const out = [];
  const re = /(R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)(\s*(?:mil|k|milh(?:ão|ões|ao|oes)|%))?/gi;
  let m;
  while ((m = re.exec(String(text)))) {
    let n = Number(m[2].replace(/\./g, '').replace(',', '.'));
    const unit = (m[3] || '').trim().toLowerCase();
    if (unit === 'mil' || unit === 'k') n *= 1000;
    if (unit.startsWith('milh')) n *= 1e6;
    if (Number.isFinite(n)) out.push({ n, money: Boolean(m[1]), pct: unit === '%', raw: m[0] });
  }
  return out;
}

/**
 * Roteiro montado sem IA a partir do prompt e do formulário: dá uma cena boa na hora (e é o
 * que entra se a IA não estiver disponível). Escolhe as peças pelo objetivo e pelo texto.
 */
export function fallbackPromptSpec(prompt, form = {}) {
  const text = str(prompt, 400);
  const pal = PM_PALETTES[form.palette]?.palette || (form.colors && typeof form.colors === 'object' ? { ...PM_PALETTES.laranja.palette, ...form.colors } : PM_PALETTES.laranja.palette);
  const look = form.look || 'bold';
  const k = PACE_SCALE[form.pace] || 1;
  const dur = num(form.duration, 2, 12, 5);
  const font = look === 'editorial' ? 'serif' : look === 'minimal' ? 'geometric' : look === 'divertido' ? 'punchy' : look === 'neon' ? 'display' : 'heavy';
  const bg = look === 'premium' ? { kind: 'mesh', colors: [pal.bg, pal.bg2, pal.accent2], grain: true }
    : look === 'neon' ? { kind: 'grid', colors: [pal.bg, pal.accent2], grain: true }
      : look === 'minimal' ? { kind: 'solid', colors: [pal.bg], vignette: false }
        : look === 'editorial' ? { kind: 'solid', colors: [pal.bg], grain: true, vignette: false }
          : look === 'divertido' ? { kind: 'stripes', colors: [pal.bg, pal.bg2] }
            : { kind: 'radial', colors: [pal.bg, pal.bg2] };
  const quoted = [...text.matchAll(/["“”']([^"“”']{2,60})["“”']/g)].map((m) => m[1]);
  const nums = numbersIn(text);
  const goal = form.goal || (nums.length ? 'numeros' : /\b\d\s*passos|\blista|\b1[).]/i.test(text) ? 'lista' : 'explicar');
  const title = quoted[0] || text.replace(/[.!?].*$/, '').split(/[—–:-]/)[0].trim().slice(0, 48) || 'Seu motion';
  const els = [];
  const t = (s) => +(s * k).toFixed(2);
  const kicker = (txt, y = 0.3) => els.push({ type: 'badge', text: txt, at: t(0.2), x: 0.5, y, size: 0.028, fill: pal.accent, color: '#FFFFFF', in: { fx: 'pop', dur: 0.5, ease: 'back' } });
  const chart = /gr[aá]fico|barras|m[eê]s a m[eê]s|evolu|cresc/i.test(text);
  if (/notifica/i.test(text)) {
    // notificações chegando uma atrás da outra (empilham)
    const msg = quoted[0] || (text.match(/["“]?(venda aprovada[^"”,.]*)/i) || [])[1] || 'Venda aprovada';
    const n = 4;
    for (let i = 0; i < n; i++) {
      els.push({ type: 'ui', kind: 'notification', title: i % 2 ? 'Pix recebido' : 'Venda aprovada', text: msg, at: t(0.3 + i * 0.7), y: 0.3 + i * 0.13, w: 0.84, size: 0.026, accent: pal.accent, in: { fx: 'drop', dur: 0.45, ease: 'back' } });
    }
    els.push({ type: 'particles', kind: 'sparkle', count: 24, at: t(2.6) });
    return sanitizePromptSpec({ title: title || 'Notificações', duration: dur, font, palette: pal, bg, camera: [{ at: 0, dur, zoom: 1.06, ease: 'inout' }], elements: els });
  }
  if (goal === 'numeros' && nums.length >= 3 && chart) {
    const vals = nums.slice(0, 6).map((x) => x.n);
    const labels = [...text.matchAll(/\b([a-zç]{3})\b\s*\d/gi)].map((m) => m[1]).slice(0, vals.length);
    els.push({ type: 'text', text: quoted[0] || 'Resultado', at: t(0.1), y: 0.24, size: 0.055, in: { fx: 'words', dur: 0.5 } });
    els.push({ type: 'bars', values: vals, labels, at: t(0.5), y: 0.55, w: 0.76, h: 0.28, in: { fx: 'rise', dur: 0.7, ease: 'back' }, prefix: nums[0].money ? 'R$ ' : '' });
    els.push({ type: 'arrow', from: [0.18, 0.72], to: [0.84, 0.36], curve: -0.25, at: t(1.6), color: pal.accent, in: { fx: 'draw', dur: 0.8 } });
  } else if (goal === 'numeros' && nums.length) {
    const big = nums.reduce((a, b) => (b.n > a.n ? b : a));
    const from = /\bde\s+0\b/i.test(text) ? 0 : 0;
    const rest = (text.split(big.raw)[1] || '').replace(/^\s*(de|em)?\s*/i, '').replace(/\s+com\s.*$/i, '');
    els.push({ type: 'counter', from, to: big.n, prefix: big.money ? 'R$ ' : '', suffix: big.pct ? '%' : '', at: t(0.2), y: 0.44, size: 0.12, count: t(1.8), color: pal.text, in: { fx: 'zoom', dur: 0.5 } });
    els.push({ type: 'text', text: quoted[0] || rest.split(/[,—–]/)[0].trim().slice(0, 50) || 'resultado', at: t(1.2), y: 0.57, size: 0.042, color: pal.muted, in: { fx: 'rise', dur: 0.5 } });
    if (/confete|celebr|comemor/i.test(text)) els.push({ type: 'particles', kind: 'burst', count: 70, at: t(2), x: 0.5, y: 0.44 });
    else els.push({ type: 'shape', shape: 'line', w: 0.3, h: 0.006, at: t(1.5), y: 0.62, fill: pal.accent, in: { fx: 'draw', dur: 0.5 } });
  } else if (goal === 'lista') {
    // "1 defina o cliente, 2 crie a oferta, 3 faça o anúncio — instrução": os itens numerados
    const body = text.split(/\s[—–]\s/)[0];
    const afterColon = body.includes(':') ? body.split(':').slice(1).join(':') : body;
    const numbered = [...afterColon.matchAll(/(?:^|[\s,;])(\d)\s*[).:-]?\s+([^,;\d]+)/g)].map((m) => m[2].trim()).filter((x) => x && x.length < 60);
    const list = (numbered.length >= 2 ? numbered : afterColon.split(/,|;|\be\b/).map((x) => x.trim()).filter(Boolean)).slice(0, 5);
    els.push({ type: 'text', text: quoted[0] || text.split(/[:—–]/)[0].slice(0, 50), at: t(0.1), y: 0.26, size: 0.05, in: { fx: 'mask-up', dur: 0.5 }, highlight: [], maxWidth: 0.82 });
    els.push({ type: 'list', items: list, at: t(0.7), y: 0.56, size: 0.036, stagger: t(0.45), bullet: /passo|\d[).]/i.test(text) ? 'number' : 'check', in: { fx: 'rise', dur: 0.45 } });
  } else if (goal === 'produto') {
    els.push({ type: 'card', at: t(0.1), y: 0.5, w: 0.82, h: 0.42, glass: look === 'premium' || look === 'neon', fill: look === 'premium' || look === 'neon' ? '#FFFFFF' : pal.bg2, loop: 'shimmer', in: { fx: 'rise', dur: 0.6, ease: 'spring' } });
    const tag = quoted.find((q) => q === q.toUpperCase()) || 'OFERTA';
    kicker(tag, 0.33);
    els.push({ type: 'text', text: quoted.find((q) => q !== tag) || title, at: t(0.5), y: 0.43, size: 0.05, in: { fx: 'words', dur: 0.5 } });
    const prices = nums.filter((x) => x.money);
    if (prices.length >= 2) {
      els.push({ type: 'text', text: `de R$ ${pmNumber(prices[0].n)}`, at: t(1), y: 0.51, size: 0.03, color: pal.muted, in: { fx: 'fade', dur: 0.4 } });
      els.push({ type: 'shape', shape: 'line', w: 0.26, h: 0.004, at: t(1.3), y: 0.505, fill: '#E5484D', in: { fx: 'draw', dur: 0.3 } });
      els.push({ type: 'counter', from: prices[0].n, to: prices[1].n, prefix: 'R$ ', at: t(1.4), y: 0.58, size: 0.07, count: t(0.9), color: pal.accent, in: { fx: 'pop', dur: 0.4 } });
    }
    const btn = quoted.find((q) => /quero|compr|entrar|garant|clique|saiba/i.test(q)) || 'Quero agora';
    els.push({ type: 'ui', kind: 'button', text: btn, at: t(1.8), y: 0.67, accent: pal.accent, size: 0.03, in: { fx: 'pop', dur: 0.4 } });
  } else if (goal === 'comparar') {
    const parts = text.split(/depois\s*:?/i);
    // só a primeira frase de cada lado (o resto costuma ser instrução: "divisão no meio da tela")
    const tidyCmp = (x) => String(x || '').replace(/\(.*?\)/g, '').split(/[.!?]\s/)[0].replace(/\s+([.,;!?])/g, '$1').replace(/[.]+$/, '').trim().slice(0, 50);
    const a = tidyCmp((parts[0] || '').replace(/antes\s*:?/i, '')) || 'Antes';
    const b = tidyCmp(parts[1]) || 'Depois';
    els.push({ type: 'shape', shape: 'rect', w: 1, h: 0.5, x: 0.5, y: 0.25, fill: pal.bg2, radius: 0, in: { fx: 'slide-right', dur: 0.5 }, fixed: true });
    els.push({ type: 'badge', text: 'ANTES', at: t(0.3), y: 0.12, fill: '#E5484D', size: 0.026 });
    els.push({ type: 'text', text: a, at: t(0.5), y: 0.27, size: 0.045, in: { fx: 'words', dur: 0.4 } });
    els.push({ type: 'icon', icon: 'x', at: t(0.9), y: 0.38, size: 0.05, bg: '#E5484D', color: '#FFFFFF', in: { fx: 'pop', dur: 0.4 } });
    els.push({ type: 'badge', text: 'DEPOIS', at: t(1.5), y: 0.6, fill: '#22C55E', size: 0.026 });
    els.push({ type: 'text', text: b, at: t(1.7), y: 0.75, size: 0.05, color: pal.text, in: { fx: 'words', dur: 0.4 } });
    els.push({ type: 'icon', icon: 'check', at: t(2.1), y: 0.87, size: 0.05, bg: '#22C55E', color: '#FFFFFF', in: { fx: 'pop', dur: 0.4 } });
  } else if (goal === 'showreel') {
    const ws = (quoted.length ? quoted : text.match(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\b/g) || text.split(/[,:—–]/).map((s) => s.trim()).filter(Boolean)).slice(0, 5);
    const step = (dur - 0.4) / Math.max(1, ws.length);
    const fx = ['zoom', 'letters', 'slide-left', 'blur', 'pop'];
    ws.forEach((w, i) => els.push({ type: 'text', text: w, upper: true, at: +(0.1 + i * step).toFixed(2), ...(i < ws.length - 1 ? { dur: +(step - 0.05).toFixed(2) } : {}), y: 0.48, size: 0.11, in: { fx: fx[i % fx.length], dur: 0.35 }, out: i < ws.length - 1 ? { fx: 'zoom', dur: 0.15 } : 'none', color: i % 2 ? pal.accent : pal.text }));
    return sanitizePromptSpec({ title, duration: dur, font: 'display', palette: pal, bg, shake: 0.4, camera: [{ at: 0, dur, zoom: 1.12, ease: 'linear' }], elements: els });
  } else if (goal === 'cta') {
    const main = quoted[0] || text.split(/[—–]/)[0].trim().slice(0, 50);
    const first = main.split(/\s+/)[0];
    els.push({ type: 'text', text: main, at: t(0.1), y: 0.4, size: 0.075, highlight: [first], highlightStyle: 'box', in: { fx: 'words', dur: 0.55 }, upper: look === 'bold' });
    els.push({ type: 'arrow', from: [0.25, 0.52], to: [0.5, 0.64], curve: 0.4, at: t(0.9), in: { fx: 'draw', dur: 0.5 }, color: pal.accent });
    els.push({ type: 'ui', kind: 'button', text: quoted[1] || 'Seguir', at: t(1.2), y: 0.7, accent: pal.accent, size: 0.032, in: { fx: 'pop', dur: 0.4 } });
  } else {
    // explicar / gancho: frase grande com destaque, câmera aproximando
    const busca = /pesquis|busca|google|digitando/i.test(text);
    if (busca) {
      els.push({ type: 'ui', kind: 'search', text: quoted[0] || 'como fazer', at: t(0.1), y: 0.38, size: 0.032, in: { fx: 'pop', dur: 0.4 } });
      els.push({ type: 'text', text: quoted[1] || 'a resposta está aqui', at: t(2.4), y: 0.55, size: 0.05, in: { fx: 'words', dur: 0.5 } });
    } else {
      const main = quoted[0] || title;
      const hi = (text.match(/destac\w*\s+(?:a\s+palavra\s+)?["“]?([\p{L}]+)/iu) || [])[1] || main.split(/\s+/).sort((x, y) => y.length - x.length)[0];
      els.push({ type: 'text', text: main, at: t(0.15), y: 0.46, size: 0.075, highlight: [hi], highlightStyle: look === 'editorial' ? 'underline' : look === 'minimal' ? 'marker' : 'color', in: { fx: goal === 'gancho' ? 'words' : 'mask-up', dur: 0.6 }, upper: look === 'bold' || look === 'neon', glow: look === 'neon' ? 0.6 : 0 });
      if (look === 'neon' || /brilh|faísc|estrel/i.test(text)) els.push({ type: 'particles', kind: 'sparkle', count: 30, at: 0 });
    }
  }
  if (!els.length) els.push({ type: 'text', text: title, at: 0.2, y: 0.46, size: 0.07, in: { fx: 'words', dur: 0.6 } });
  return sanitizePromptSpec({
    title, duration: dur, font, palette: pal, bg,
    camera: [{ at: 0, dur, zoom: look === 'minimal' ? 1.03 : 1.08, ease: 'inout' }],
    elements: els,
  });
}

// ─────────────────────────────── revisão visual (o Claude olha os quadros) ───────────────────────────────
/** Instantes (s) dos quadros que vão para a revisão: começo, meio, fim e o quadro final. Puro. */
export function reviewTimes(spec) {
  const d = spec.duration;
  return [0.22, 0.5, 0.78, 0.98].map((f) => +(d * f).toFixed(2));
}

/** Prompt de sistema da revisão: o mesmo vocabulário + o papel de diretor de arte. */
export function promptMotionReviewSystem() {
  return `${promptMotionSystem()}

REVISÃO VISUAL
Você agora é o diretor de arte revisando a cena acima. Você recebe o roteiro JSON e quadros RENDERIZADOS dele (com o instante de cada um). Olhe os quadros com atenção e corrija só problemas reais:
- texto cortado na borda, fora do quadro ou fora da área segura (y 0.15–0.85 em 9:16);
- peças sobrepostas atrapalhando a leitura; texto pequeno demais para celular; pouco contraste com o fundo;
- momento vazio ou com informação demais; a mensagem principal tem que estar clara no último quadro;
- algo do pedido que não apareceu.
Mantenha o que está bom (cores, ideia, ritmo). Responda só com o JSON do roteiro completo corrigido, com um campo extra "review": uma frase curta em português dizendo o que você ajustou (ou "sem ajustes").`;
}

// ─────────────────────────────── instruções para a IA ───────────────────────────────
/** Prompt de sistema: o vocabulário do roteiro e as regras de bom motion design. */
export function promptMotionSystem() {
  return `Você é um motion designer sênior. Você cria cenas curtas de motion graphics para vídeos (Reels/Shorts/TikTok, em geral 9:16) e responde SÓ com um JSON no formato abaixo — nada de código, nada de texto fora do JSON.

FORMATO
{
 "title": "nome curto",
 "duration": segundos (2–12),
 "font": ${Object.keys(PM_FONTS).map((f) => `"${f}"`).join('|')},
 "palette": {"bg":"#hex","bg2":"#hex","text":"#hex","accent":"#hex","accent2":"#hex","muted":"#hex"},
 "bg": {"kind": ${PM_BG.map((b) => `"${b}"`).join('|')}, "colors":["#hex","#hex","#hex"], "motion":"none|drift|pulse", "grain":bool, "vignette":bool, "leak":bool (vazamento de luz quente, cinematográfico)},
 "camera": [{"at":s,"dur":s,"zoom":0.5–3,"x":-0.5–0.5,"y":-0.5–0.5,"rotate":graus,"ease":"out|inout|back|spring|expo|linear"}],
 "shake": 0–1 (tremida de câmera, opcional),
 "elements": [ ...até 24 peças... ]
}
Cada peça: {"type":..., "at": segundo em que entra, "dur": quanto fica (opcional; sem = até o fim), "x":0–1, "y":0–1 (centro da peça, fração do quadro), "scale", "rotate", "color":"#hex", "opacity",
 "in": {"fx": ${PM_IN.map((f) => `"${f}"`).join('|')}, "dur": s, "ease": ..., "delay": s, "stagger": s},
 "out": {"fx": ${PM_OUT.map((f) => `"${f}"`).join('|')}, "dur": s},
 "loop": ${PM_LOOP.map((f) => `"${f}"`).join('|')}, "glow": 0–1, "fixed": true (não segue a câmera),
 "depth": -1–1 (paralaxe: positivo = mais perto, anda mais com a câmera; negativo = fundo), "trail": true (rastro de movimento na entrada)}
Tipos e campos próprios:
- "text": text, size (fração da ALTURA do quadro, 0.03–0.14), font, align, maxWidth (0–1), upper, stroke, highlight:[palavras], highlightColor, highlightStyle: ${PM_HIGHLIGHT.map((f) => `"${f}"`).join('|')}, gradient:["#hex","#hex"], shine:bool (faixa de brilho passando), shadow:bool. Efeitos: "words" (palavra a palavra), "letters", "typewriter", "mask-up", "scramble" (letras embaralhando até travar), "wave", "outline" (contorno e depois preenchimento), "glitch".
- "counter": from, to, prefix ("R$ "), suffix ("%", " mil"), decimals, size, count (segundos contando), label.
- "bars": values:[números], labels:[curtos], w, h, colors, showValues, prefix, suffix. "line": igual, mais area:bool (use in.fx "draw").
- "progress": value 0–100, kind "ring"|"bar", size, w, label, fill.
- "shape": shape ${PM_SHAPES.map((f) => `"${f}"`).join('|')}, w, h, fill, stroke, strokeWidth, radius. in.fx "draw" desenha o contorno.
- "icon": icon ${PM_ICONS.map((f) => `"${f}"`).join('|')}, size, bg (círculo atrás).
- "list": items:[até 6 frases curtas], size, bullet "check"|"dot"|"number"|"arrow"|"x", stagger, accent, align, w.
- "badge": text curto (selo/pílula), size, fill.
- "card": w, h, fill, radius, glass:bool, border, shadow (painel; loop "shimmer" faz brilho passar).
- "arrow": from:[x,y], to:[x,y] (frações do quadro), curve -1–1, width, head. Use in.fx "draw".
- "particles": kind ${PM_PARTICLES.map((f) => `"${f}"`).join('|')}, count, colors. "burst" explode a partir de x,y.
- "ui": kind ${PM_UI.map((f) => `"${f}"`).join('|')} (barra de busca digitando, notificação de celular, botão com cursor clicando, balão de conversa), text, title, w, size, accent.
- "transition": kind ${PM_TRANSITIONS.map((f) => `"${f}"`).join('|')}, fill, fill2, dur (0.4–0.9). Cobre a tela na 1ª metade e revela na 2ª: use ENTRE duas ideias (tire as peças antigas com "dur" terminando no meio da transição e faça as novas entrarem no meio dela).

REGRAS DE BOM MOTION
- Hierarquia: 1 mensagem principal por momento, no máximo 3–4 peças na tela ao mesmo tempo. Textos CURTOS, em português do Brasil.
- Ritmo: uma batida nova a cada 0,5–1,2 s. Use "out" para limpar a tela antes da próxima ideia. Termine com a mensagem principal na tela.
- 9:16: mantenha o conteúdo entre y=0.15 e y=0.85 (a interface do app cobre as bordas) e x entre 0.08 e 0.92.
- Câmera: um empurrão lento (zoom 1→1.08) dá vida; aproximação rápida no clímax; nada de girar demais.
- Easing: entradas com "out", "back" ou "spring"; nada de "linear" em texto.
- Cores: use a paleta pedida; contraste alto entre texto e fundo; destaque (accent) só no que importa.
- Números: use "counter" para valores, "bars"/"line" para evolução, "progress" para porcentagem.
- Respeite o pedido: se a pessoa pediu uma peça (ex.: botão, notificação, gráfico), ela tem que estar lá.

RECEITAS DE MOTION PREMIUM (o que separa o amador do profissional)
- Estrutura em batidas: gancho visual (0–1 s) → informação (1–N s) → fechamento com a ideia principal parada e legível no fim.
- Tipografia: título grande em "display"/"heavy" com "mask-up" ou "scramble"; palavra-chave com destaque "box" ou gradient+shine; texto de apoio pequeno em "sans" com cor muted.
- Camadas e profundidade: fundo "mesh" ou "radial" com leak e grain; cartões de vidro (card glass) atrás do conteúdo (depth -0.3); o número/palavra principal à frente (depth 0.5); a câmera faz um empurrão lento (zoom 1→1.08) e um punch rápido (zoom +0.12 em 0.25 s, ease "back") no clímax.
- Movimento: entradas com "spring" ou "back", rastro (trail) em entradas rápidas; nada entra todo de uma vez — stagger de 0.06–0.12 s; saídas rápidas (0.2–0.3 s) para limpar a tela.
- Transições entre ideias: "transition" (wipe/circle/bars) na cor de destaque, 0.5–0.7 s.
- Detalhes que dão acabamento: brilho (shine) no número final, partículas "sparkle"/"burst" na conquista, sublinhado que se desenha, ícone em círculo, glow leve no destaque em fundos escuros.
- Menos é mais: 2–4 cores, 1–2 fontes por cena, espaço livre em volta do que importa.`;
}

/** Mensagem do usuário para a IA: prompt + formulário (+ o roteiro atual, para ajustar). */
export function promptMotionUser(prompt, form = {}, current = null, change = '', speech = '') {
  const pal = PM_PALETTES[form.palette]?.palette || form.colors || null;
  const lines = [
    `Pedido: ${str(prompt, 1200)}`,
    speech ? `Fala do vídeo neste ponto (a cena entra enquanto a pessoa diz isto — combine com a fala, use as palavras e números dela quando fizer sentido): "${str(speech, 800)}"` : '',
    form.goal ? `Objetivo: ${PM_GOALS[form.goal] || form.goal}` : '',
    form.look ? `Estilo: ${PM_LOOKS[form.look] || form.look}` : '',
    form.pace ? `Ritmo: ${PM_PACES[form.pace] || form.pace}` : '',
    `Duração: ${num(form.duration, 2, 12, 5)} s`,
    `Formato: ${form.aspect || '9:16'}`,
    pal ? `Paleta (use estas cores): ${JSON.stringify(pal)}` : '',
    form.creativity === 'alta' ? 'Criatividade: alta — surpreenda com câmera, partículas e transições, sem perder a leitura.' : form.creativity === 'baixa' ? 'Criatividade: baixa — limpo, direto, poucas peças.' : '',
    form.brand ? `Marca: ${str(form.brand, 60)}` : '',
  ];
  if (current) lines.push(`\nRoteiro ATUAL (mantenha o que não foi pedido para mudar):\n${JSON.stringify(current)}`, `\nMudança pedida: ${str(change, 600)}`);
  lines.push('\nResponda só com o JSON do roteiro.');
  return lines.filter(Boolean).join('\n');
}

// ─────────────────────────────── desenho de som ───────────────────────────────
/**
 * Sons da cena (como um motion designer faria): ar nas entradas de texto, subida no contador
 * e batida quando ele chega, passagem nas transições, brilho na conquista, clique no botão,
 * notificação na notificação… Discretos, sem repetir colado, no máximo 7 por cena.
 * @param {object} spec roteiro validado
 * @param {number} start instante da cena no vídeo (s)
 * @param {Set<string>|null} available sons que existem (null = todos)
 * @returns {Array<{t:number,type:string,volume:number,why:string}>}
 */
export function promptMotionSfx(spec, start = 0, available = null) {
  const out = [];
  const add = (t, type, volume, why, alt = []) => {
    const pickType = [type, ...alt].find((x) => !available || available.has(x));
    if (!pickType || !(t >= 0) || t > spec.duration + 0.05) return;
    out.push({ t: +(start + t).toFixed(2), type: pickType, volume, why });
  };
  for (const e of spec.elements) {
    const at = e.at + (e.in?.delay || 0);
    switch (e.type) {
      case 'transition': add(at, 'whoosh', 0.55, 'transição', ['swoosh', 'pr-air']); break;
      case 'text':
        if (e.in.fx === 'typewriter') add(at, 'typing', 0.45, 'digitando', ['cn-key']);
        else if (e.in.fx === 'glitch' || e.in.fx === 'scramble') add(at, 'glitch', 0.4, 'texto embaralhando', ['pr-air']);
        else if (e.size >= 0.06) add(at, 'pr-air', 0.5, 'título entrando', ['whoosh']);
        break;
      case 'counter':
        add(at, 'riser', 0.35, 'contador subindo', ['pr-rise']);
        add(at + e.count, /R\$|\$/.test(e.prefix) ? 'cash' : 'pr-hit', 0.6, 'contador chegou', ['impact', 'pop']);
        break;
      case 'bars':
      case 'line': add(at, 'pr-rise', 0.45, 'gráfico crescendo', ['riser']); break;
      case 'progress': add(at + e.in.dur, 'ding', 0.45, 'progresso completo', ['mi-ding']); break;
      case 'badge': add(at, 'pop', 0.5, 'selo', ['mi-pop']); break;
      case 'icon': add(at, e.icon === 'x' ? 'error' : e.icon === 'check' ? 'ding' : 'pop', 0.45, `ícone ${e.icon}`, ['mi-pop']); break;
      case 'list': e.items.slice(0, 4).forEach((_, i) => add(at + i * e.stagger, 'mi-pop', 0.4, 'item da lista', ['pop'])); break;
      case 'particles':
        if (e.kind === 'burst' || e.kind === 'confetti') add(at, 'p-conquista-complete-glass', 0.55, 'conquista', ['success', 'sparkle']);
        else if (e.kind === 'sparkle') add(at, 'sparkle', 0.3, 'brilho', ['mi-shine']);
        break;
      case 'ui':
        if (e.kind === 'notification') add(at, 'p-notificacao-notification-glass', 0.55, 'notificação', ['notify', 'ding']);
        else if (e.kind === 'button') add(at + e.in.dur + 0.7, 'p-interface-press-glass', 0.55, 'clique', ['click']);
        else if (e.kind === 'search') add(at + e.in.dur * 0.6, 'typing', 0.4, 'digitando', ['cn-key']);
        else add(at, 'pop', 0.4, 'mensagem', ['bubble']);
        break;
      default: break;
    }
  }
  // punch de câmera (aproximação rápida): batida
  for (const k of spec.camera || []) if (k.dur <= 0.4 && k.zoom > 1.1) add(k.at, 'pr-hit', 0.5, 'punch de câmera', ['impact']);
  out.sort((a, b) => a.t - b.t);
  const kept = [];
  for (const m of out) {
    if (kept.some((k) => Math.abs(k.t - m.t) < 0.3)) continue;
    kept.push(m);
    if (kept.length >= 7) break;
  }
  return kept;
}

/** Cena de vitrine do "Premium com IA" (miniatura do estilo no assistente de criação). */
export const PM_SHOWCASE = sanitizePromptSpec({
  title: 'Premium com IA', duration: 4, font: 'display',
  palette: { bg: '#07070D', bg2: '#2A0F4F', text: '#FFFFFF', accent: '#FF6B35', accent2: '#7C3AED', muted: '#A1A1B5' },
  bg: { kind: 'mesh', grain: true, leak: true },
  camera: [{ at: 0, dur: 4, zoom: 1.08, ease: 'inout' }],
  elements: [
    { type: 'card', glass: true, at: 0.1, y: 0.5, w: 0.84, h: 0.36, depth: -0.3, in: { fx: 'rise', dur: 0.5, ease: 'spring' } },
    { type: 'counter', from: 0, to: 340, suffix: '%', at: 0.3, y: 0.45, size: 0.15, count: 1.2, shine: true, gradient: ['#FFFFFF', '#FF6B35'], in: { fx: 'zoom', dur: 0.4 } },
    { type: 'text', text: 'mais retenção', at: 0.8, y: 0.58, size: 0.05, font: 'heavy', in: { fx: 'outline', dur: 0.6 } },
    { type: 'particles', kind: 'sparkle', count: 24, at: 1 },
  ],
});
