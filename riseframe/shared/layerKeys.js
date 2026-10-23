// Quadros-chave das camadas (Propriedades, como no Premiere): cada propriedade tem a
// própria lista de quadros — posição (cx, cy), escala, rotação e opacidade. O tempo `t`
// de cada quadro é contado a partir do começo da camada (anda junto quando a camada é
// movida). Entre dois quadros a mudança segue a interpolação de cada quadro, como no
// Premiere: linear; `eo` (Ease Out) sai devagar do quadro; `ei` (Ease In) chega devagar
// nele; os dois = Bezier (suave); `hold` segura o valor até o próximo quadro. Antes do 1º
// vale o 1º e depois do último, o último. A prévia e o render usam estas mesmas contas.

/** Interpolações do menu do quadro (Premiere › Interpolação temporal). */
export const KF_INTERPS = { linear: 'Linear', bezier: 'Bezier (suave)', easeIn: 'Ease In (chega devagar)', easeOut: 'Ease Out (sai devagar)', hold: 'Manter (Hold)' };
/** Interpolação de um quadro, para o menu. Puro. */
export function kfInterpOf(k) {
  if (k?.hold) return 'hold';
  if (k?.ei && k?.eo) return 'bezier';
  if (k?.ei) return 'easeIn';
  if (k?.eo) return 'easeOut';
  return 'linear';
}
/** O quadro com a interpolação escolhida (sem os campos antigos). Puro. */
export function withInterp(k, id) {
  const { ease, ei, eo, hold, ...rest } = k;
  if (id === 'hold') return { ...rest, hold: true };
  if (id === 'bezier') return { ...rest, ei: true, eo: true };
  if (id === 'easeIn') return { ...rest, ei: true };
  if (id === 'easeOut') return { ...rest, eo: true };
  return rest;
}

export const LAYER_KF_PROPS = ['pos', 'scale', 'rot', 'opacity'];
const LIMITS = { scale: [0.05, 3], rot: [-720, 720], opacity: [0.1, 1], pos: [-1, 2] };
const MAX_KEYS = 30;

const num = (v, [lo, hi]) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};

/** Limpa os quadros de uma camada: { pos:[{t,v:[cx,cy],ease?}], scale:[{t,v}], … }. Puro. */
export function cleanLayerKf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const p of LAYER_KF_PROPS) {
    if (!Array.isArray(raw[p])) continue;
    const list = [];
    for (const k of raw[p]) {
      const t = Number(k?.t);
      if (!Number.isFinite(t) || t < 0 || t > 100000) continue;
      let v;
      if (p === 'pos') {
        const a = Array.isArray(k.v) ? num(k.v[0], LIMITS.pos) : null;
        const b = Array.isArray(k.v) ? num(k.v[1], LIMITS.pos) : null;
        if (a == null || b == null) continue;
        v = [+a.toFixed(4), +b.toFixed(4)];
      } else {
        const n = num(k.v, LIMITS[p]);
        if (n == null) continue;
        v = +n.toFixed(4);
      }
      list.push({ t: +t.toFixed(3), v, ...(k.ease ? { ease: true } : {}), ...(k.ei ? { ei: true } : {}), ...(k.eo ? { eo: true } : {}), ...(k.hold ? { hold: true } : {}) });
    }
    list.sort((a, b) => a.t - b.t);
    const dedup = list.filter((k, i) => i === 0 || k.t - list[i - 1].t >= 0.02).slice(0, MAX_KEYS);
    // `ease` antigo (trecho suave até o próximo) = sai devagar deste e chega devagar no próximo
    dedup.forEach((k, i) => {
      if (!k.ease) return;
      delete k.ease;
      k.eo = true;
      if (dedup[i + 1]) dedup[i + 1].ei = true;
    });
    if (dedup.length) out[p] = dedup;
  }
  return Object.keys(out).length ? out : null;
}

/** Curva do trecho a → b (q de 0 a 1): sai devagar de a (eo), chega devagar em b (ei). Puro. */
export function kfCurve(a, b, q) {
  const slowStart = !!(a.eo || a.ease);
  const slowEnd = !!(b.ei || a.ease);
  if (slowStart && slowEnd) return q * q * (3 - 2 * q);
  if (slowStart) return q * q;
  if (slowEnd) return q * (2 - q);
  return q;
}

/** Valor de uma lista de quadros no tempo t (relativo à camada). Número ou [a, b]. Puro. */
export function kfValue(track, t) {
  if (!track?.length) return null;
  if (t <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (t >= a.t && t <= b.t) {
      if (a.hold) return a.v;
      const q = kfCurve(a, b, (t - a.t) / Math.max(1e-6, b.t - a.t));
      return Array.isArray(a.v) ? [a.v[0] + (b.v[0] - a.v[0]) * q, a.v[1] + (b.v[1] - a.v[1]) * q] : a.v + (b.v - a.v) * q;
    }
  }
  return last.v;
}

/** A camada como está no instante tAbs (tempo do vídeo): valores animados aplicados. Puro. */
export function layerAt(m, tAbs) {
  const kf = m?.kf;
  if (!kf) return m;
  const t = Number(tAbs) - (Number(m.start) || 0);
  const out = { ...m };
  // posição/escala animadas deixam a camada livre (igual ao render)
  if ((kf.pos?.length || kf.scale?.length) && m.mode !== 'pip') Object.assign(out, { mode: 'pip', scale: 1, cx: m.cx ?? 0.5, cy: m.cy ?? 0.5 });
  if (kf.pos?.length) { const [cx, cy] = kfValue(kf.pos, t); out.cx = cx; out.cy = cy; out.mode = 'pip'; }
  if (kf.scale?.length) { out.scale = kfValue(kf.scale, t); out.mode = 'pip'; }
  if (kf.rot?.length) out.rot = kfValue(kf.rot, t);
  if (kf.opacity?.length) out.opacity = kfValue(kf.opacity, t);
  return out;
}

const f4 = (n) => (+Number(n).toFixed(4)).toString();

/**
 * Expressão do FFmpeg para uma lista de quadros: o valor no tempo `tv` (variável do
 * filtro: `t` ou `T`) de uma camada que começa em `start`. `idx` escolhe o componente da
 * posição (0 = x, 1 = y). Linear entre quadros (suave com ease). Puro.
 */
export function kfExpr(track, { tv = 't', start = 0, idx = null } = {}) {
  const val = (k) => (idx == null ? k.v : k.v[idx]);
  if (!track?.length) return '0';
  const R = `(${tv}-${f4(start)})`;
  if (track.length === 1) return f4(val(track[0]));
  let expr = f4(val(track[track.length - 1]));
  for (let i = track.length - 2; i >= 0; i--) {
    const a = track[i];
    const b = track[i + 1];
    const d = Math.max(1e-3, b.t - a.t);
    const q = `((${R}-${f4(a.t)})/${f4(d)})`;
    const slowStart = !!(a.eo || a.ease);
    const slowEnd = !!(b.ei || a.ease);
    const qq = slowStart && slowEnd ? `(${q}*${q}*(3-2*${q}))` : slowStart ? `(${q}*${q})` : slowEnd ? `(${q}*(2-${q}))` : q;
    const seg = a.hold ? f4(val(a)) : `${f4(val(a))}+(${f4(val(b) - val(a))})*${qq}`;
    expr = `if(lt(${R},${f4(b.t)}),${seg},${expr})`;
  }
  return `if(lt(${R},${f4(track[0].t)}),${f4(val(track[0]))},${expr})`;
}

/** O maior valor da lista (escala-base do render: não amplia a imagem e perde nitidez). Puro. */
export function kfMax(track) {
  return track?.length ? Math.max(...track.map((k) => k.v)) : null;
}

/** Põe (ou troca) o quadro no tempo t de uma lista. Puro. */
export function upsertKey(track, t, v) {
  const old = (track || []).find((k) => Math.abs(k.t - t) < 0.04);
  const list = (track || []).filter((k) => Math.abs(k.t - t) >= 0.04);
  // trocar o valor mantém a interpolação escolhida para o quadro
  list.push({ ...(old ? withInterp({}, kfInterpOf(old)) : {}), t: +Math.max(0, t).toFixed(3), v });
  return list.sort((a, b) => a.t - b.t);
}

/**
 * Quadros quando o começo da camada anda `dt` segundos (aparar a esquerda, dividir): os
 * quadros ficam no mesmo ponto do vídeo; o que ficou antes do novo começo vira um quadro
 * em 0 com o valor daquele instante. Puro.
 */
export function shiftKf(kf, dt) {
  if (!kf || !dt) return kf;
  const out = {};
  for (const p of LAYER_KF_PROPS) {
    const tr = kf[p];
    if (!tr?.length) continue;
    const moved = tr.map((k) => ({ ...k, t: +(k.t - dt).toFixed(3) }));
    const keep = moved.filter((k) => k.t >= 0);
    if (moved.some((k) => k.t < 0) && !keep.some((k) => k.t < 0.02)) keep.unshift({ t: 0, v: kfValue(tr, dt) });
    out[p] = keep;
  }
  return Object.keys(out).length ? out : null;
}


/**
 * Quadros-chave depois de cortar o vídeo: cada quadro vai para o mesmo ponto do vídeo
 * cortado (`mapT` = tempo original → tempo cortado). Sem isso, com pausas cortadas dentro da
 * camada, a animação ficava nos tempos antigos (parava no meio ou pulava). Puro.
 */
export function remapKf(kf, oldStart, newStart, mapT) {
  if (!kf || typeof kf !== 'object') return kf;
  const out = {};
  for (const p of LAYER_KF_PROPS) {
    const tr = kf[p];
    if (!Array.isArray(tr) || !tr.length) continue;
    out[p] = tr.map((k) => ({ ...k, t: +Math.max(0, mapT(Number(oldStart) + Number(k.t)) - newStart).toFixed(3) }));
  }
  return Object.keys(out).length ? out : null;
}
