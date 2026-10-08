import React from 'react';

/**
 * Conjunto de ícones em linha (premium), estilo coeso: viewBox 24, traço
 * arredondado, herda a cor via `currentColor`. Uso: <Icon name="scissors" size={18} />
 */
const PATHS = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  layers: (
    <>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
    </>
  ),
  brush: (
    <>
      <path d="M14.5 4.5 19.5 9.5 11 18l-5-5 8.5-8.5Z" />
      <path d="M6 13c-2 0-3 1.5-3 3.5V20h3.5C8.5 20 10 19 10 17" />
    </>
  ),
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" />
    </>
  ),
  tiktok: <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.4 2.6 2.1 4.2 5 4.4" />,
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="m10.5 9.5 4 2.5-4 2.5v-5Z" fill="currentColor" />
    </>
  ),
  linkedin: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 10.5V16M8 7.8v.1M11.5 16v-3.2c0-1.4.9-2.3 2.1-2.3s2 .9 2 2.3V16M11.5 10.5V16" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4h3l7 4V6L7 10H4Z" />
      <path d="M17.5 9a3.5 3.5 0 0 1 0 6M8 14l1 5h2.5l-1-4.2" />
    </>
  ),
  podcast: (
    <>
      <circle cx="12" cy="10" r="2.2" />
      <path d="M8.2 14.5a5.5 5.5 0 1 1 7.6 0M5.6 17.2a9 9 0 1 1 12.8 0M12 13.5V20" />
    </>
  ),
  star: <path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4Z" />,
  users: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.5 2.7 2 3 4.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  heart: <path d="M12 19s-7-4.4-7-9.5A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 2.5C19 14.6 12 19 12 19Z" />,
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4Z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M12 15l-4-4M12 15l4-4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
    </>
  ),
  play: <path d="M7 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  pause: <path d="M8.5 5v14M15.5 5v14" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </>
  ),
  folder: <path d="M4 7.5a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.6v2.4M12 18v2.4M5.1 7.3l2.1 1.2M16.8 15.5l2.1 1.2M5.1 16.7l2.1-1.2M16.8 8.5l2.1-1.2" />
    </>
  ),
  logout: (
    <>
      <path d="M15 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8" />
      <path d="M18 15l3-3-3-3M21 12H10" />
    </>
  ),
  clapper: (
    <>
      <path d="M3.5 9.5h17V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V9.5Z" />
      <path d="M3.8 6.2 20 8.2l-.4 1.3H3.5l.3-3.3Z" />
      <path d="M8 6.6 9.6 9.2M12.5 6.9 14 9.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5c.4 3.2 1.8 4.6 5 5-3.2.4-4.6 1.8-5 5-.4-3.2-1.8-4.6-5-5 3.2-.4 4.6-1.8 5-5Z" />
      <path d="M18.5 13.5c.2 1.5.9 2.2 2.4 2.4-1.5.2-2.2.9-2.4 2.4-.2-1.5-.9-2.2-2.4-2.4 1.5-.2 2.2-.9 2.4-2.4Z" />
    </>
  ),
  wand: (
    <>
      <path d="M15 7 6.5 15.5a2 2 0 0 0 0 2.8l.2.2a2 2 0 0 0 2.8 0L18 10" />
      <path d="M14 6.5 17.5 10M17 3.5v2M20.5 6h-2M19.6 3.9l-1.2 1.2" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6.5" cy="7" r="2.5" />
      <circle cx="6.5" cy="17" r="2.5" />
      <path d="M8.6 8.6 20 17M8.6 15.4 20 7M12 12l2.5 1.8" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0l4.2 4.2M13 15l2-2a2 2 0 0 1 2.8 0L21 15.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a4.5 4.5 0 0 0 4.5-4.5c0-3.9-3.8-6.7-8.5-6.7Z" />
      <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  captions: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7.5 11.2c-.9-.7-2.3-.4-2.3 1s1.4 1.7 2.3 1M13.5 11.2c-.9-.7-2.3-.4-2.3 1s1.4 1.7 2.3 1M16 13.3h2.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" />
      <path d="M14 6.5 17.5 10" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 6.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  undo: (
    <>
      <path d="M4 9h8.5a5.5 5.5 0 1 1 0 11H8" />
      <path d="M4 9l3.5-3M4 9l3.5 3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v4M15 3v4" />
      <path d="M7 7h10v3a5 5 0 0 1-10 0V7Z" />
      <path d="M12 15v3a2 2 0 0 1-2 2H8" />
    </>
  ),
  arrowLeft: <path d="M15 5l-7 7 7 7M8 12h11" />,
  mail: (
    <>
      <path d="M3.5 6.5h17v11h-17z" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  lock: (
    <>
      <path d="M6 10.5h12v9H6z" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <path d="M12 14v2.5" />
    </>
  ),
  zap: <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.9A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.6" />
      <path d="M6.4 7.9A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  maximize: (
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 14h18M14 4v10" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="2.6" />
    </>
  ),
  type: (
    <>
      <path d="M5 7V5h14v2M12 5v14M9 19h6" />
    </>
  ),
  prev: (
    <>
      <path d="M18 18 10 12l8-6v12ZM6 6v12" />
    </>
  ),
  next: (
    <>
      <path d="m6 6 8 6-8 6V6ZM18 6v12" />
    </>
  ),
  merge: (
    <>
      <path d="M5 6v4a4 4 0 0 0 4 4h10" />
      <path d="m15 10 4 4-4 4" />
      <path d="M5 18v.01" strokeWidth="2.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </>
  ),
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, color = 'currentColor', style }) {
  const glyph = PATHS[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

/** Logo do Riseframe: tira de filme (frame) em tons de laranja. */
export function Logo({ size = 36 }) {
  const gid = 'rfLogoGrad';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Riseframe">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9A5A" />
          <stop offset="0.5" stopColor="#FF6B35" />
          <stop offset="1" stopColor="#DD4A16" />
        </linearGradient>
      </defs>
      {/* tile */}
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill={`url(#${gid})`} />
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      {/* furos de película (frame de filme) */}
      <g fill="rgba(255,255,255,0.95)">
        <rect x="6.5" y="9" width="3.4" height="4.4" rx="1.1" />
        <rect x="6.5" y="17.8" width="3.4" height="4.4" rx="1.1" />
        <rect x="6.5" y="26.6" width="3.4" height="4.4" rx="1.1" />
        <rect x="30.1" y="9" width="3.4" height="4.4" rx="1.1" />
        <rect x="30.1" y="17.8" width="3.4" height="4.4" rx="1.1" />
        <rect x="30.1" y="26.6" width="3.4" height="4.4" rx="1.1" />
      </g>
      {/* play central (o frame) */}
      <path d="M17 14.5 26 20l-9 5.5V14.5Z" fill="#fff" />
    </svg>
  );
}
