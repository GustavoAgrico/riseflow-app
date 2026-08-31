export const C = {
  bg: '#08080C',
  bgElev: '#0E0E14',
  // superfícies em vidro (translúcidas sobre o mesh de fundo)
  panel: 'rgba(255,255,255,0.04)',
  panelSolid: '#13131B',
  panel2: 'rgba(255,255,255,0.055)',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F4F4F8',
  muted: '#A6A6BC',
  faint: '#6E6E86',
  orange: '#FF6B35',
  orangeSoft: '#FF8A5C',
  purple: '#7C3AED',
  purpleSoft: '#9F67FF',
  green: '#2ED47A',
  red: '#F0526B',
};

// Gradiente-assinatura da marca (laranja → roxo).
export const GRAD = `linear-gradient(135deg, ${C.orange} 0%, ${C.purple} 100%)`;
export const GRAD_SOFT = `linear-gradient(135deg, ${C.orangeSoft}, ${C.purpleSoft})`;

/** Card em vidro premium: borda translúcida + brilho superior + sombra profunda. */
export function glass(extra = {}) {
  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))',
    border: `1px solid ${C.border}`,
    borderRadius: 18,
    boxShadow: '0 10px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    ...extra,
  };
}

/** Texto com preenchimento em gradiente. */
export const gradientText = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

export const FONT_DISPLAY = "'Sora', 'Inter', system-ui, sans-serif";

export const STAGE_ICONS = {
  queued: '⏳',
  starting: '⚙️',
  probe: '🔎',
  transcribe: '📝',
  analyze: '🧠',
  cut: '✂️',
  silence: '✂️',
  broll: '🎞️',
  captions: '💬',
  color: '🎨',
  render: '🎬',
  done: '✅',
  error: '⚠️',
};

export function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1e6) return `${(n / 1e3).toFixed(0)} KB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}

export function fmtDuration(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}m${String(sec).padStart(2, '0')}s` : `${sec}s`;
}
