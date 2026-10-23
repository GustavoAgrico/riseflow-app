/**
 * Transições nos cortes e nas entradas/saídas de B-roll — as mais usadas no CapCut
 * (Flash branco, Esmaecimento preto, Brilho, Travessia do Blur).
 *
 * São transições "no lugar": um efeito curto CENTRADO no ponto de corte, sem
 * sobrepor os dois trechos. Assim a duração do vídeo não muda e legendas, B-roll e
 * SFX continuam sincronizados. Viram um filtro -vf aplicado no render final, na
 * mesma passada da cor (sem recodificação extra).
 */

export const TRANSITIONS = {
  none: 'Sem transição',
  flash: 'Flash branco',
  dip: 'Esmaecimento preto',
  glow: 'Brilho',
  blur: 'Travessia do blur',
  zoomin: 'Zoom in',
  zoomout: 'Zoom out',
  slideleft: 'Deslizar para a esquerda',
  slideright: 'Deslizar para a direita',
  slideup: 'Deslizar para cima',
  slidedown: 'Deslizar para baixo',
  spin: 'Giro',
  shake: 'Tremor',
  glitch: 'Glitch',
  whiteout: 'Esmaecimento branco',
  iris: 'Íris (fecha em círculo)',
};
/** Transições de câmera (mexem no quadro): vão juntas num zoompan/rotate só. */
export const MOTION_TRANSITIONS = ['zoomin', 'zoomout', 'slideleft', 'slideright', 'slideup', 'slidedown', 'spin', 'shake'];

export const TRANSITION_TARGETS = {
  broll: 'Nas entradas de B-roll',
  cuts: 'Nos cortes',
  both: 'Cortes + B-roll',
};

/** Metade da duração de cada transição (s): o efeito vai de p-HALF a p+HALF. */
const HALF = { flash: 0.18, dip: 0.22, glow: 0.3, blur: 0.25, zoomin: 0.3, zoomout: 0.3, slideleft: 0.25, slideright: 0.25, slideup: 0.25, slidedown: 0.25, spin: 0.3, shake: 0.3, glitch: 0.2, whiteout: 0.3, iris: 0.3 };
/** Duração padrão (s) de cada transição — a mesma que a prévia usa. */
export const TRANSITION_DUR = Object.fromEntries(Object.entries(HALF).map(([k, h]) => [k, +(h * 2).toFixed(2)]));
const MAX_POINTS = 40; // a expressão do FFmpeg cresce com os pontos — teto de segurança
const MIN_GAP = 0.6; // dois cortes colados viram uma transição só

/**
 * Normaliza os pontos: dentro do vídeo (longe das pontas), ordenados, sem pontos colados.
 * @param {number[]} points tempos na timeline final
 */
export function transitionPoints(points, duration) {
  const sorted = (points || [])
    .map(Number)
    .filter((t) => Number.isFinite(t) && t > 0.25 && t < duration - 0.25)
    .sort((a, b) => a - b);
  const out = [];
  for (const t of sorted) if (!out.length || t - out[out.length - 1] >= MIN_GAP) out.push(t);
  return out.slice(0, MAX_POINTS);
}

/** Fronteiras entre os trechos mantidos, já na timeline cortada (onde há "jump cut"). */
export function cutJoins(keep) {
  const joins = [];
  let acc = 0;
  for (let i = 0; i < keep.length - 1; i++) {
    acc += keep[i].end - keep[i].start;
    joins.push(+acc.toFixed(3));
  }
  return joins;
}

/** Envelope 0→1→0 (triangular) em torno de cada ponto, como expressão do FFmpeg. */
function envelope(points, half) {
  const terms = points.map((p) => `max(0,1-abs(t-${p.toFixed(3)})/${half})`);
  return `min(1,${terms.join('+')})`;
}

/** Janela "estou a menos de `w` s de algum ponto" (para o enable= do blur). */
function windowExpr(points, w) {
  return points.map((p) => `between(t,${(p - w).toFixed(3)},${(p + w).toFixed(3)})`).join('+');
}

/**
 * Filtro -vf da transição escolhida nos pontos dados, ou null quando não há nada a fazer.
 * @param {keyof TRANSITIONS} type
 */
export function transitionVf(type, points, duration, half = null) {
  if (!type || type === 'none' || !HALF[type] || MOTION_TRANSITIONS.includes(type)) return null;
  const pts = transitionPoints(points, duration);
  if (!pts.length) return null;
  const h = half > 0 ? half : HALF[type];
  const E = envelope(pts, h);
  switch (type) {
    case 'flash':
      return `eq=brightness='0.9*${E}':saturation='1-0.6*${E}':eval=frame`;
    case 'dip':
      return `eq=brightness='-0.95*${E}':saturation='1-${E}':eval=frame`;
    case 'glow':
      // Brilho: clareia, abre o contraste para baixo e satura levemente — um "bloom" rápido.
      return `eq=brightness='0.32*${E}':contrast='1-0.18*${E}':saturation='1+0.35*${E}':eval=frame`;
    case 'blur':
      // Desfoque cresce até o corte e some depois: três degraus de intensidade.
      return [
        `gblur=sigma=4:enable='${windowExpr(pts, h)}'`,
        `gblur=sigma=8:enable='${windowExpr(pts, h * 0.6)}'`,
        `gblur=sigma=14:enable='${windowExpr(pts, h * 0.3)}'`,
      ].join(',');
    case 'glitch':
      // separação de cores + ruído e um leve borrão, em degraus (como o glitch do CapCut)
      return [
        `rgbashift=rh=14:bh=-14:gv=6:enable='${windowExpr(pts, h)}'`,
        `noise=alls=28:allf=t:enable='${windowExpr(pts, h * 0.6)}'`,
        `rgbashift=rh=-10:bv=10:enable='${windowExpr(pts, h * 0.3)}'`,
      ].join(',');
    case 'whiteout':
      // como o "Dip to White" do Premiere: clareia até o branco total no corte e volta
      return `eq=brightness='${E}':saturation='1-${E}':eval=frame`;
    case 'iris':
      // como a Íris do Premiere: a borda escurece fechando em círculo até o corte e reabre
      return `vignette=angle='1.5*${E}':eval=frame,eq=brightness='-0.6*(${E})^2':eval=frame`;
    default:
      return null;
  }
}

/**
 * Transições de câmera (como as do CapCut, num vídeo só): zoom, deslizar, giro e tremor
 * centrados em cada ponto. Todas juntas num rotate + zoompan (uma passada).
 * list: [{ t, type, half }] no tempo do vídeo final. meta: { width, height, fps }.
 */
export function motionTransitionVf(list, meta, duration) {
  const items = (list || [])
    .filter((x) => MOTION_TRANSITIONS.includes(x.type) && Number.isFinite(Number(x.t)) && x.t > 0.1 && x.t < duration - 0.1)
    .sort((a, b) => a.t - b.t)
    .slice(0, MAX_POINTS);
  if (!items.length) return null;
  const W = meta.width || 1080;
  const H = meta.height || 1920;
  const fps = Math.max(1, Math.round(meta.fps || 30));
  // zoompan conta quadros (on); rotate tem o tempo (t)
  const ZT = `(on/${fps})`;
  const f = (n) => Number(n).toFixed(3);
  // pre: sobe até o ponto; post: desce depois dele; E: os dois (triângulo)
  const pre = (p, h, T = ZT) => `(clip((${T}-${f(p - h)})/${f(h)},0,1)*lt(${T},${f(p)}))`;
  const post = (p, h, T = ZT) => `(clip(1-(${T}-${f(p)})/${f(h)},0,1)*gte(${T},${f(p)}))`;
  const env = (p, h, T = ZT) => `max(0,1-abs(${T}-${f(p)})/${f(h)})`;
  const T = ZT;
  const z = [];
  const xo = [];
  const yo = [];
  const rot = [];
  for (const it of items) {
    const p = Number(it.t);
    const h = it.half > 0 ? Number(it.half) : HALF[it.type];
    const E = env(p, h);
    switch (it.type) {
      case 'zoomin': z.push(`0.45*${E}`); break;
      case 'zoomout': z.push(`0.45*${post(p, h)}`, `0.12*${pre(p, h)}`); break;
      case 'slideleft': z.push(`0.5*${E}`); xo.push(`(${pre(p, h)}-${post(p, h)})`); break;
      case 'slideright': z.push(`0.5*${E}`); xo.push(`(${post(p, h)}-${pre(p, h)})`); break;
      case 'slideup': z.push(`0.5*${E}`); yo.push(`(${pre(p, h)}-${post(p, h)})`); break;
      case 'slidedown': z.push(`0.5*${E}`); yo.push(`(${post(p, h)}-${pre(p, h)})`); break;
      case 'spin': z.push(`0.7*${E}`); rot.push(`0.55*(${pre(p, h, 't')}-${post(p, h, 't')})`); break;
      case 'shake': z.push(`0.12*${E}`); xo.push(`0.7*sin(${T}*71)*${E}`); yo.push(`0.6*sin(${T}*53+1)*${E}`); rot.push(`0.035*sin(t*47)*${env(p, h, 't')}`); break;
      default: break;
    }
  }
  const parts = [];
  if (rot.length) parts.push(`rotate=a='${rot.join('+')}':c=black`);
  const Z = `(1+${z.length ? z.join('+') : '0'})`;
  const cx = 'iw/2-iw/zoom/2';
  const cy = 'ih/2-ih/zoom/2';
  const X = xo.length ? `${cx}+clip(${xo.join('+')},-1,1)*(${cx})` : cx;
  const Y = yo.length ? `${cy}+clip(${yo.join('+')},-1,1)*(${cy})` : cy;
  parts.push(`zoompan=z='${Z}':d=1:x='${X}':y='${Y}':s=${W}x${H}:fps=${fps}`);
  // borrão de movimento perto do ponto (deslizar/giro/zoom ficam mais "rápidos")
  const pts = items.filter((x) => x.type !== 'shake').map((x) => Number(x.t));
  if (pts.length) parts.push(`gblur=sigma=6:enable='${windowExpr(pts, 0.08)}'`);
  return parts.join(',');
}
