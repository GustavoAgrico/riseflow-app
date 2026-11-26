// Audiograma: a onda/espectro do áudio desenhada na tela, sincronizada com a fala (como o
// "Audio Spectrum" / "Audio Waveform" dos programas de motion). Muito usado em cortes de
// podcast. Puro: validação e o filtro FFmpeg (o render e os testes usam o mesmo).

export const AUDIOGRAM_STYLES = {
  wave: 'Onda',
  line: 'Linha',
  bars: 'Barras (espectro)',
  dots: 'Pontos',
};
export const AUDIOGRAM_POSITIONS = { bottom: 'Embaixo', middle: 'No meio', top: 'Em cima' };

/** Opções válidas ou null. Puro. */
export function cleanAudiogram(a) {
  if (!a || typeof a !== 'object' || a.enabled === false) return null;
  const style = Object.hasOwn(AUDIOGRAM_STYLES, a.style) ? a.style : 'wave';
  const position = Object.hasOwn(AUDIOGRAM_POSITIONS, a.position) ? a.position : 'bottom';
  const color = /^#[0-9a-f]{6}$/i.test(String(a.color || '')) ? String(a.color).toUpperCase() : '#FFFFFF';
  const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : def);
  return { style, position, color, height: +num(a.height, 0.06, 0.4, 0.14).toFixed(3), opacity: +num(a.opacity, 0.2, 1, 0.9).toFixed(2) };
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * filter_complex do audiograma sobre o vídeo [0:v] com o áudio [0:a] → [v]. Puro.
 * Fundo transparente; a faixa ocupa a largura toda (com margem) na altura escolhida.
 */
export function audiogramFilter(a, { W, H, fps = 30 }) {
  const o = cleanAudiogram(a);
  if (!o) return null;
  const w = even(W * 0.9);
  const h = even(H * o.height);
  const x = Math.round((W - w) / 2);
  const y = o.position === 'top' ? Math.round(H * 0.08) : o.position === 'middle' ? Math.round((H - h) / 2) : Math.round(H * 0.92 - h);
  const col = `0x${o.color.slice(1)}`;
  const r = Math.max(10, Math.min(60, Math.round(Number(fps) || 30)));
  let src;
  if (o.style === 'bars') {
    // 16 kHz: o espectro cobre 0–8 kHz (onde está a voz), sem barras vazias nos agudos
    src = `aresample=16000,showfreqs=s=${w}x${h}:mode=bar:ascale=log:fscale=log:win_size=1024:overlap=0:averaging=2:colors=${col},fps=${r}`;
  } else {
    const mode = { wave: 'cline', line: 'line', dots: 'p2p' }[o.style];
    src = `showwaves=s=${w}x${h}:mode=${mode}:rate=${r}:scale=sqrt:draw=full:colors=${col}`;
  }
  const alpha = o.opacity < 0.999 ? `,colorchannelmixer=aa=${o.opacity}` : '';
  return `[0:a]aformat=channel_layouts=mono,${src},format=rgba${alpha}[ag];[0:v][ag]overlay=${x}:${y}:shortest=1:eof_action=pass,format=yuv420p[v]`;
}
