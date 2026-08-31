export const C = {
  bg: '#0B0B0F',
  panel: '#15151C',
  panel2: '#1D1D27',
  border: '#2A2A38',
  text: '#EDEDF2',
  muted: '#9A9AB0',
  faint: '#6C6C82',
  orange: '#FF6B35',
  purple: '#7C3AED',
  green: '#22C55E',
  red: '#EF4444',
};

export const STAGE_ICONS = {
  queued: '⏳',
  starting: '⚙️',
  probe: '🔎',
  transcribe: '📝',
  analyze: '🧠',
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
