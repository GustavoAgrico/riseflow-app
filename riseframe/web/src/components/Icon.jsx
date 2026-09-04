import React from 'react';

/**
 * Conjunto de ícones em linha (premium), estilo coeso: viewBox 24, traço
 * arredondado, herda a cor via `currentColor`. Uso: <Icon name="scissors" size={18} />
 */
const PATHS = {
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
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
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
