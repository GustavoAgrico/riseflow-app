// Sombra projetada da legenda, como no Photoshop: modo de mesclagem, cor, opacidade, ângulo,
// distância, expansão e tamanho. As medidas em px valem para um vídeo de 1080 px de altura
// (em outro tamanho escalam junto). A prévia e o render usam estas mesmas contas.

export const SHADOW_BLENDS = [['multiply', 'Multiplicação'], ['normal', 'Normal']];
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const hex6 = (v, d = '000000') => (/^#?[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).replace('#', '').toUpperCase() : d);

/**
 * Parâmetros da sombra a partir dos campos da legenda (captionShadow*). Projetos antigos
 * (só "distância %" e "intensidade") viram a sombra dura de antes, a 135°. Puro.
 */
export function shadowParams(o = {}) {
  const legacy = o.captionShadowDistance == null && o.captionShadowAngle == null;
  return {
    blend: SHADOW_BLENDS.some(([id]) => id === o.captionShadowBlend) ? o.captionShadowBlend : 'multiply',
    color: hex6(o.captionShadowColor),
    opacity: clamp(o.captionShadowOpacity, 0, 1, 0.6),
    angle: clamp(o.captionShadowAngle, -360, 360, 135),
    distance: legacy ? Math.round(5 * clamp(o.captionShadowSize, 0.3, 3, 1)) : clamp(o.captionShadowDistance, 0, 200, 6),
    spread: clamp(o.captionShadowSpread, 0, 100, 0),
    size: legacy ? 0 : clamp(o.captionShadowBlur, 0, 100, 6),
  };
}

/**
 * Deslocamento, borda extra e desfoque em px de um quadro com `k` = altura/1080, e a cor/
 * opacidade finais. Ângulo como no Photoshop: de onde vem a luz (120° = luz de cima à
 * esquerda → sombra para baixo à direita). "Multiplicação" escurece o que está atrás: preta
 * é igual à normal; quanto mais clara a cor, mais fraca fica. Puro.
 */
export function shadowGeometry(p, k = 1) {
  const a = (p.angle * Math.PI) / 180;
  const d = p.distance * k;
  const size = p.size * k;
  const spreadPx = (size * p.spread) / 100;
  const blur = Math.max(0, size - spreadPx);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(p.color.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const opacity = p.blend === 'multiply' ? p.opacity * (1 - lum * 0.85) : p.opacity;
  return { dx: -Math.cos(a) * d, dy: Math.sin(a) * d, spread: spreadPx, blur, color: p.color, opacity: Math.max(0, Math.min(1, opacity)) };
}

/**
 * Linha "Dialogue" do ASS → a mesma linha como SOMBRA: tudo na cor da sombra, deslocado,
 * com a borda engordada (expansão) e desfocado (tamanho), sem a sombra própria. Mantém o que
 * está escondido (alfa FF) e as animações (\t), então a sombra aparece junto com cada
 * palavra. Puro.
 */
export function shadowDialogue(line, { bgr, alpha, dx, dy, spread, blur, outline = 0, layer = 0 }) {
  const m = /^Dialogue: (\d+),([^,]*),([^,]*),([^,]*),(.*)$/.exec(line);
  if (!m) return null;
  const f = (n) => +Number(n).toFixed(1);
  const vis = 1 - parseInt(alpha, 16) / 255;
  const mixA = (xx) => {
    const v = parseInt(xx, 16);
    if (v >= 0xfe) return 'FF';
    return Math.round(255 - (1 - v / 255) * vis * 255).toString(16).padStart(2, '0').toUpperCase();
  };
  const fix = (tags) => tags
    .replace(/\\(1c|c|3c|4c)&H[0-9A-Fa-f]{6}&/g, (_, t) => `\\${t}&H${bgr}&`)
    .replace(/\\(1a|3a|4a|alpha)&H([0-9A-Fa-f]{2})&/g, (_, t, xx) => `\\${t}&H${mixA(xx)}&`)
    .replace(/\\bord([\d.]+)/g, (_, n) => `\\bord${f(Number(n) + spread)}`)
    .replace(/\\(?:x|y)?shad-?[\d.]+/g, '\\shad0')
    .replace(/\\(?:blur|be)[\d.]+/g, `\\blur${f(blur)}`)
    .replace(/\\pos\(([-\d.]+),([-\d.]+)\)/g, (_, x, y) => `\\pos(${f(Number(x) + dx)},${f(Number(y) + dy)})`)
    .replace(/\\move\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/g, (_, x1, y1, x2, y2) => `\\move(${f(Number(x1) + dx)},${f(Number(y1) + dy)},${f(Number(x2) + dx)},${f(Number(y2) + dy)}`)
    .replace(/\\org\(([-\d.]+),([-\d.]+)\)/g, (_, x, y) => `\\org(${f(Number(x) + dx)},${f(Number(y) + dy)})`);
  // Campos depois do estilo: Name, MarginL, MarginR, MarginV, Effect, Text
  const rest = m[5].split(',');
  const text = rest.slice(5).join(',');
  const lead = `{\\1c&H${bgr}&\\3c&H${bgr}&\\1a&H${alpha}&\\3a&H${alpha}&\\bord${f(outline + spread)}\\shad0\\blur${f(blur)}}`;
  const body = text.replace(/\{([^}]*)\}/g, (_, t) => `{${fix(t)}}`);
  return `Dialogue: ${layer},${m[2]},${m[3]},${m[4]},${rest.slice(0, 5).join(',')},${lead}${body}`;
}
