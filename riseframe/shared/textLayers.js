// Texto livre na timeline (como o "Texto" do CapCut) e efeitos de vídeo por momento.
// Compartilhado pelo site (editor + prévia) e pelo servidor (render).

/** Animações de entrada e saída de um texto. */
export const TEXT_ANIMS_IN = { none: 'Nenhuma', fade: 'Fade', pop: 'Pop', zoom: 'Zoom', 'slide-up': 'Subir', 'slide-left': 'Entrar da direita' };
export const TEXT_ANIMS_OUT = { none: 'Nenhuma', fade: 'Fade', zoom: 'Encolher' };
/** Fundo do texto: só contorno, caixa sólida ou nada. */
export const TEXT_BOXES = { outline: 'Contorno', box: 'Caixa', none: 'Sem fundo' };

/**
 * Modelos de texto prontos (os mais usados em Reels/Shorts). Cada um é só um conjunto
 * de valores iniciais — depois tudo pode ser mudado no texto.
 * x/y: centro do texto em fração da tela · size: altura da letra em fração da altura.
 */
export const TEXT_TEMPLATES = {
  titulo: { label: 'Título de capítulo', text: 'CAPÍTULO 1', font: 'montserrat', size: 0.062, color: '#FFFFFF', box: 'box', boxColor: '#111111', x: 0.5, y: 0.16, animIn: 'slide-up', animOut: 'fade' },
  episodio: { label: 'Episódio', text: 'EPISÓDIO 1', font: 'bebas', size: 0.05, color: '#111111', box: 'box', boxColor: '#FFFFFF', x: 0.5, y: 0.1, animIn: 'pop', animOut: 'fade' },
  chamada: { label: 'Chamada (CTA)', text: 'Comenta AQUI 👇', font: 'anton', size: 0.06, color: '#FFE24B', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.74, animIn: 'pop', animOut: 'zoom' },
  destaque: { label: 'Número em destaque', text: '3 DICAS', font: 'archivo', size: 0.09, color: '#FF6B35', box: 'outline', boxColor: '#FFFFFF', x: 0.5, y: 0.3, animIn: 'zoom', animOut: 'fade' },
  nome: { label: 'Nome (lower third)', text: 'Seu Nome\nEspecialista', font: 'poppins', size: 0.04, color: '#FFFFFF', box: 'box', boxColor: '#FF6B35', x: 0.32, y: 0.84, animIn: 'slide-left', animOut: 'fade' },
  citacao: { label: 'Citação', text: '“Uma frase marcante”', font: 'playfair', size: 0.05, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: 'fade', animOut: 'fade' },
  neon: { label: 'Neon', text: 'NOVIDADE', font: 'righteous', size: 0.07, color: '#22D3EE', box: 'outline', boxColor: '#0B3B47', x: 0.5, y: 0.4, animIn: 'fade', animOut: 'fade' },
  simples: { label: 'Texto simples', text: 'Seu texto aqui', font: 'poppins', size: 0.045, color: '#FFFFFF', box: 'outline', boxColor: '#000000', x: 0.5, y: 0.5, animIn: 'fade', animOut: 'fade' },
};

/** Efeitos de vídeo aplicados só nos momentos escolhidos (faixa EFEITOS da timeline). */
export const VIDEO_FX = {
  bw: 'Preto e branco',
  retro: 'Retrô',
  nostalgic: 'Nostálgico (sépia)',
  grain: 'Grão de filme',
  vignette: 'Vinheta',
  film: 'Moldura de filme',
  blur: 'Desfoque',
  glow: 'Brilho',
};
/** Aproximação do efeito na prévia do editor (CSS). O render usa FFmpeg. */
export const VIDEO_FX_CSS = {
  bw: 'grayscale(1)',
  retro: 'sepia(0.35) contrast(1.1) saturate(0.85)',
  nostalgic: 'sepia(0.85) contrast(1.05)',
  grain: 'contrast(1.05)',
  vignette: 'brightness(0.92)',
  film: 'contrast(1.08)',
  blur: 'blur(6px)',
  glow: 'brightness(1.12) saturate(1.35)',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : def);
const pickOf = (obj, v, def) => (Object.hasOwn(obj, v) ? v : def);

/** Normaliza as camadas de texto (vindas do cliente). `fonts` = ids de fonte válidos. */
export function cleanTextLayers(raw, fonts = null, max = 30) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    const text = String(l?.text ?? '').replace(/\r/g, '').slice(0, 200);
    const start = Number(l?.start);
    const end = Number(l?.end);
    if (!text.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.2) continue;
    out.push({
      text,
      start: Math.max(0, start),
      end: Math.min(start + 600, end),
      font: typeof l.font === 'string' && (!fonts || fonts.includes(l.font)) ? l.font : 'poppins',
      size: num(l.size, 0.015, 0.2, 0.05),
      color: HEX.test(l.color) ? l.color : '#FFFFFF',
      box: pickOf(TEXT_BOXES, l.box, 'outline'),
      boxColor: HEX.test(l.boxColor) ? l.boxColor : '#000000',
      x: num(l.x, 0, 1, 0.5),
      y: num(l.y, 0, 1, 0.5),
      animIn: pickOf(TEXT_ANIMS_IN, l.animIn, 'fade'),
      animOut: pickOf(TEXT_ANIMS_OUT, l.animOut, 'fade'),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Normaliza os momentos de efeito de vídeo. */
export function cleanFxMoments(raw, max = 40) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    const start = Number(m?.start);
    const end = Number(m?.end);
    if (!Object.hasOwn(VIDEO_FX, m?.effect) || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.15) continue;
    out.push({ start: Math.max(0, start), end: Math.min(start + 600, end), effect: m.effect });
    if (out.length >= max) break;
  }
  return out;
}
