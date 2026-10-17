// Velocidade por trecho e congelar quadro (como no CapCut), no render final.
// Tudo (legendas, textos, sons) já está no vídeo nesse ponto, então cada pedaço acelera,
// desacelera ou congela junto e continua sincronizado.

const MIN_PIECE = 0.05;

/** Velocidade aceita por trecho (0,25× a 4×). */
export function clampSpeed(k) {
  const n = Number(k);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.25, Math.min(4, n));
}

/**
 * Pedaços do vídeo final, em ordem: trechos com a sua velocidade (`k` já multiplicado pela
 * velocidade geral) e congelamentos (`freeze` s parado no quadro `at`). Null quando não há
 * nada a mudar (sem trechos nem congelamentos). Puro.
 * @param {{start:number,end:number,speed:number}[]} ranges
 * @param {{t:number,dur:number}[]} freezes
 */
export function retimePieces(ranges, freezes, duration, globalSpeed = 1) {
  const D = Number(duration) || 0;
  const g = Number(globalSpeed) > 0 ? Number(globalSpeed) : 1;
  const rs = (Array.isArray(ranges) ? ranges : [])
    .map((r) => ({ a: Math.max(0, Number(r.start)), b: Math.min(D, Number(r.end)), k: clampSpeed(r.speed) }))
    .filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b) && r.b - r.a >= MIN_PIECE && Math.abs(r.k - 1) > 0.01)
    .sort((x, y) => x.a - y.a);
  // sem sobreposição: o trecho que começa depois perde a parte que já está coberta
  const clean = [];
  for (const r of rs) {
    const last = clean[clean.length - 1];
    const a = last ? Math.max(r.a, last.b) : r.a;
    if (r.b - a >= MIN_PIECE) clean.push({ ...r, a });
  }
  const fz = (Array.isArray(freezes) ? freezes : [])
    .map((f) => ({ at: Number(f.t), dur: Math.max(0.2, Math.min(10, Number(f.dur) || 0)) }))
    .filter((f) => Number.isFinite(f.at) && f.at >= 0 && f.at < D - 0.02 && Number.isFinite(f.dur))
    .sort((x, y) => x.at - y.at);
  if (!clean.length && !fz.length) return null;

  // pontos de corte: bordas dos trechos e congelamentos
  const cuts = new Set([0, D]);
  for (const r of clean) { cuts.add(r.a); cuts.add(r.b); }
  for (const f of fz) cuts.add(f.at);
  const pts = [...cuts].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    for (const f of fz) if (Math.abs(f.at - a) < 1e-6) out.push({ freeze: f.dur, at: a });
    const b = pts[i + 1];
    if (b == null || b - a < 1e-6) continue;
    const r = clean.find((x) => a >= x.a - 1e-6 && b <= x.b + 1e-6);
    out.push({ a: +a.toFixed(3), b: +b.toFixed(3), k: +((r ? r.k : 1) * g).toFixed(4) });
  }
  return out;
}

/** Duração do vídeo depois de aplicar os pedaços. Puro. */
export function retimedDuration(pieces) {
  return pieces.reduce((s, p) => s + (p.freeze != null ? p.freeze : (p.b - p.a) / p.k), 0);
}

/** Cadeia de atempo para qualquer velocidade (cada atempo aceita 0,5–2). Puro. */
export function atempoChain(k) {
  const parts = [];
  let r = k;
  while (r > 2) { parts.push('atempo=2'); r /= 2; }
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  if (Math.abs(r - 1) > 1e-4 || !parts.length) parts.push(`atempo=${+r.toFixed(4)}`);
  return parts.join(',');
}

/**
 * Filtro complexo que monta o vídeo final com os pedaços: entrada [0:v]/[0:a], `baseVf`
 * aplicado antes de dividir, saídas [rtv] e [rta]. Puro.
 */
export function retimeGraph(pieces, { fps = 30, hasAudio = true, baseVf = null } = {}) {
  const rate = Number(fps) > 0 ? Math.round(Number(fps) * 1000) / 1000 : 30;
  const n = pieces.length;
  const chains = [];
  const vIn = [...Array(n)].map((_, i) => `[rtvs${i}]`).join('');
  chains.push(`[0:v]${baseVf ? `${baseVf},` : ''}fps=${rate},split=${n}${vIn}`);
  if (hasAudio) chains.push(`[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=${n}${[...Array(n)].map((_, i) => `[rtas${i}]`).join('')}`);
  const cat = [];
  pieces.forEach((p, i) => {
    if (p.freeze != null) {
      const fr = 1 / rate;
      chains.push(`[rtvs${i}]trim=start=${p.at.toFixed(3)}:duration=${fr.toFixed(4)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${p.freeze.toFixed(3)},trim=duration=${p.freeze.toFixed(3)},setpts=PTS-STARTPTS[rtv${i}]`);
      if (hasAudio) chains.push(`[rtas${i}]atrim=start=0:duration=0.001,asetpts=PTS-STARTPTS,apad=whole_dur=${p.freeze.toFixed(3)},volume=0[rta${i}]`);
    } else {
      chains.push(`[rtvs${i}]trim=start=${p.a.toFixed(3)}:end=${p.b.toFixed(3)},setpts=(PTS-STARTPTS)/${p.k}[rtv${i}]`);
      if (hasAudio) chains.push(`[rtas${i}]atrim=start=${p.a.toFixed(3)}:end=${p.b.toFixed(3)},asetpts=PTS-STARTPTS${Math.abs(p.k - 1) > 1e-4 ? `,${atempoChain(p.k)}` : ''}[rta${i}]`);
    }
    cat.push(`[rtv${i}]${hasAudio ? `[rta${i}]` : ''}`);
  });
  chains.push(`${cat.join('')}concat=n=${n}:v=1:a=${hasAudio ? 1 : 0}[rtvc]${hasAudio ? '[rta]' : ''}`);
  chains.push(`[rtvc]fps=${rate}[rtv]`);
  return chains.join(';');
}
