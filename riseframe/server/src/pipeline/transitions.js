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
};

export const TRANSITION_TARGETS = {
  broll: 'Nas entradas de B-roll',
  cuts: 'Nos cortes',
  both: 'Cortes + B-roll',
};

/** Metade da duração de cada transição (s): o efeito vai de p-HALF a p+HALF. */
const HALF = { flash: 0.18, dip: 0.22, glow: 0.3, blur: 0.25 };
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
export function transitionVf(type, points, duration) {
  if (!type || type === 'none' || !HALF[type]) return null;
  const pts = transitionPoints(points, duration);
  if (!pts.length) return null;
  const h = HALF[type];
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
    default:
      return null;
  }
}
