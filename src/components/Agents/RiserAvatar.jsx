// Mascotes dos agentes do RiseFlow ("Risers"). Desenho original da Rise.
// Uso: <RiserAvatar kind="comercial" size={40} />
// kinds: comercial | atendente | prospector | agenda | metas | analista
import React, { useId } from 'react'

const GRADIENTS = {
  comercial: ['#FFB347', '#FF5A1F'],
  atendente: ['#A78BFA', '#6D28D9'],
  prospector: ['#5EEAD4', '#0F9488'],
  agenda: ['#FFE08A', '#F0A10F'],
  metas: ['#7AEBA8', '#15A34A'],
  analista: ['#8CC0FF', '#2563EB'],
}

export const RISER_KINDS = Object.keys(GRADIENTS)

const INK = '#1B1410'
const Eyes = ({ lx, rx, y, r = 7, glint = 2.4 }) => (
  <g className="rf-riser-eyes">
    <circle cx={lx} cy={y} r={r} fill={INK} />
    <circle cx={rx} cy={y} r={r} fill={INK} />
    <circle cx={lx + 2.4} cy={y - 2.6} r={glint} fill="#fff" />
    <circle cx={rx + 2.4} cy={y - 2.6} r={glint} fill="#fff" />
  </g>
)
const Cheeks = ({ lx, rx, y, color = '#FF6F91', opacity = 0.35 }) => (
  <>
    <ellipse cx={lx} cy={y} rx="5" ry="3" fill={color} fillOpacity={opacity} />
    <ellipse cx={rx} cy={y} rx="5" ry="3" fill={color} fillOpacity={opacity} />
  </>
)
const RiseMark = ({ y }) => (
  <path d={`M45 ${y}L50 ${y - 5}L55 ${y}`} stroke="#fff" strokeOpacity="0.9" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round" fill="none" />
)
const Shine = ({ d }) => (
  <path d={d} stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" fill="none" />
)

function Body({ kind, fill }) {
  switch (kind) {
    case 'atendente':
      return (
        <>
          <path d="M28 78L19 93L46 82Z" fill="#6D28D9" />
          <rect x="11" y="24" width="78" height="62" rx="28" fill={fill} />
          <Shine d="M20 44C21 34 28 29 37 29" />
          <path d="M17 48C17 26 32 15 50 15C68 15 83 26 83 48" stroke="#3B1A7A" strokeWidth="5" strokeLinecap="round" fill="none" />
          <rect x="9" y="42" width="11" height="18" rx="5" fill="#3B1A7A" />
          <rect x="80" y="42" width="11" height="18" rx="5" fill="#3B1A7A" />
          <path d="M14 59Q16 73 33 72" stroke="#3B1A7A" strokeWidth="3" strokeLinecap="round" fill="none" />
          <circle cx="35" cy="72" r="3.4" fill="#3B1A7A" />
          <Cheeks lx={28} rx={72} y={64} opacity={0.4} />
          <Eyes lx={38} rx={62} y={52} />
          <path d="M42 62Q50 63 58 62Q57 72 50 72Q43 72 42 62Z" fill={INK} />
          <path d="M46 69Q50 66 54 69Q52 71.5 50 71.5Q48 71.5 46 69Z" fill="#FF6F91" />
          <RiseMark y={82} />
        </>
      )
    case 'prospector':
      return (
        <>
          <path d="M50 12C73 12 88 28 88 49C88 71 64 85 50 95C36 85 12 71 12 49C12 28 27 12 50 12Z" fill={fill} />
          <Shine d="M21 42C23 30 31 22 42 20" />
          <Cheeks lx={27} rx={71} y={60} />
          <Eyes lx={39} rx={63} y={48} />
          <path d="M33 37Q38 34 43 36" stroke="#0B4F48" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="52" cy="62" rx="3.4" ry="4" fill={INK} />
          <RiseMark y={78} />
          <path d="M84 80L93 89" stroke="#0B4F48" strokeWidth="6" strokeLinecap="round" />
          <circle cx="78" cy="72" r="11" fill="#E6FFFB" fillOpacity="0.55" stroke="#0B4F48" strokeWidth="4.5" />
          <path d="M73 68Q75 65 78 65" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      )
    case 'agenda':
      return (
        <>
          <rect x="12" y="22" width="76" height="70" rx="20" fill={fill} />
          <path d="M12 42V39C12 29 20 22 30 22H70C80 22 88 29 88 39V42Z" fill="#E08E0B" />
          <rect x="28" y="12" width="9" height="19" rx="4.5" fill="#6B4A0A" />
          <rect x="63" y="12" width="9" height="19" rx="4.5" fill="#6B4A0A" />
          <RiseMark y={37} />
          <Cheeks lx={27} rx={73} y={69} color="#FF6F61" />
          <Eyes lx={38} rx={62} y={58} />
          <path d="M43 70Q50 76 57 70" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <circle cx="80" cy="82" r="8" fill="#16A34A" stroke="#FFF6DC" strokeWidth="2.5" />
          <path d="M76.5 82L79 84.6L83.8 79.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )
    case 'metas':
      return (
        <>
          <path d="M50 18V3" stroke="#0E6B32" strokeWidth="3" strokeLinecap="round" />
          <path d="M50 3L64 7.5L50 12Z" fill="#FF6A1F" />
          <path d="M50 16C55 16 58 19 61 24L91 74C95 82 90 92 80 92L20 92C10 92 5 82 9 74L39 24C42 19 45 16 50 16Z" fill={fill} />
          <path d="M41 32L47 22" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" fill="none" />
          <Cheeks lx={29} rx={71} y={70} />
          <Eyes lx={39} rx={61} y={59} />
          <path d="M32 49L44 52" stroke="#0E6B32" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M68 49L56 52" stroke="#0E6B32" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M41 69Q50 70 59 69Q57 78 50 78Q43 78 41 69Z" fill={INK} />
          <path d="M43 69.6Q50 70.4 57 69.6L56.4 72Q50 72.6 43.6 72Z" fill="#fff" />
          <RiseMark y={88} />
        </>
      )
    case 'analista':
      return (
        <>
          <rect x="29" y="9" width="8" height="20" rx="4" fill="#1D4ED8" />
          <rect x="46" y="3" width="8" height="26" rx="4" fill="#FF6A1F" />
          <rect x="63" y="14" width="8" height="15" rx="4" fill="#1D4ED8" />
          <rect x="8" y="24" width="84" height="66" rx="32" fill={fill} />
          <Shine d="M19 44C21 35 27 30 36 29" />
          <Cheeks lx={25} rx={75} y={66} />
          <circle cx="37" cy="54" r="11" fill="#fff" fillOpacity="0.22" stroke="#102A6B" strokeWidth="3" />
          <circle cx="63" cy="54" r="11" fill="#fff" fillOpacity="0.22" stroke="#102A6B" strokeWidth="3" />
          <path d="M48 53Q50 51 52 53" stroke="#102A6B" strokeWidth="3" strokeLinecap="round" fill="none" />
          <Eyes lx={37} rx={63} y={54} r={5.6} glint={2} />
          <path d="M44 72Q50 76 56 72" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <RiseMark y={85} />
        </>
      )
    default: // comercial
      return (
        <>
          <path d="M50 22V11" stroke="#E2531A" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M43.5 13.5L50 7L56.5 13.5" stroke="#FF8A3D" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="13" y="22" width="74" height="70" rx="25" fill={fill} />
          <Shine d="M22 44C22 33 28 27 38 27" />
          <Cheeks lx={27} rx={73} y={64} color="#FF3D6E" />
          <Eyes lx={37} rx={63} y={54} r={7.5} glint={2.6} />
          <path d="M41 65Q50 74 59 65" stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <RiseMark y={85} />
        </>
      )
  }
}

// motion: undefined (parado) | 'idle' (respira e pisca) | 'talk' (pula ao falar)
//         | 'think' (balança pensando) | 'alert' (saltinhos pedindo atenção). delay desencontra os mascotes.
export function RiserAvatar({ kind = 'comercial', size = 40, label, shadow = true, style, motion, delay = 0 }) {
  const k = GRADIENTS[kind] ? kind : 'comercial'
  const gid = `riser-${k}-${useId().replace(/:/g, '')}`
  const [from, to] = GRADIENTS[k]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible', ...style, '--d': `${delay}s` }}
      className={motion ? `rf-riser rf-riser-${motion}` : undefined}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={gid} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {shadow && <ellipse className="rf-riser-shadow" cx="50" cy="95" rx="27" ry="3.6" fill="#000" fillOpacity="0.32" />}
      <g className="rf-riser-body"><Body kind={k} fill={`url(#${gid})`} /></g>
    </svg>
  )
}

export default RiserAvatar
