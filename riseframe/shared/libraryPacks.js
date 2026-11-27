import { textPacks } from './textPacks.js';
// Biblioteca de modelos prontos para a timeline (como os "packs" de um painel de motion no
// Premiere): Títulos, Componentes gráficos e Fontes animadas. Cada modelo é montado com as
// camadas que o app já sabe desenhar e renderizar (textos e formas de shared/textLayers.js),
// então a prévia e o vídeo final usam as mesmas contas e tudo continua editável depois.
// Puro: usado pelo editor (prévia e inserção) e pelos testes.

/** Largura média de uma letra, em "em", por fonte (para encaixar caixas e barras no texto). */
const CHAR_W = {
  bebas: 0.42, oswald: 0.5, anton: 0.5, barlow: 0.46, kanit: 0.62, archivo: 0.74, montserrat: 0.68,
  luckiest: 0.72, bangers: 0.5, lilita: 0.6, righteous: 0.62, playfair: 0.62, marker: 0.66, inter: 0.68, poppins: 0.64, rubik: 0.64,
};
const cw = (font) => CHAR_W[font] ?? 0.6;
/** Peso de cada letra em relação à média: maiúsculas/números mais largos, i/l/pontuação estreitos. */
function charWeight(ch) {
  if (ch === ' ') return 0.48;
  if (/[iljI.,:;!'|’]/.test(ch)) return 0.45;
  if (/[MWmw@%]/.test(ch)) return 1.45;
  if (/[A-ZÀ-ÖØ-Þ0-9$&?]/.test(ch)) return 1.18;
  return 0.95;
}
/** Largura de uma linha em "em" (sem o espaçamento entre letras). */
const lineEm = (ln, font, caps) => [...(caps ? ln.toUpperCase() : ln)].reduce((w, ch) => w + charWeight(ch) * cw(font), 0);

/**
 * Largura (fração da LARGURA do quadro) de um texto de tamanho `size` (fração da ALTURA).
 * `ar` = largura/altura do vídeo; `tracking` em 1/1000 em (como no textLook). Estimativa um
 * pouco folgada (as caixas e barras dos modelos se encaixam nela).
 */
export function textWidth(text, size, font, ar, tracking = 0, caps = false) {
  const lines = String(text).split('\n');
  const em = Math.max(0.5, ...lines.map((ln) => lineEm(ln, font, caps) + ([...ln].length * tracking) / 1000));
  return (em * size) / ar;
}
/** Tamanho que cabe na largura `maxW` (no máximo o `size` pedido). */
export function fitSize(text, size, font, ar, maxW = 0.86, tracking = 0, caps = false) {
  const w = textWidth(text, size, font, ar, tracking, caps);
  return w > maxW ? +(size * (maxW / w)).toFixed(4) : size;
}

const T = (o) => ({ kind: 'text', at: 0, animIn: 'fade', animOut: 'fade', ...o });
const S = (o) => ({ kind: 'shape', shape: 'rect', at: 0, animIn: 'fade', animOut: 'fade', ...o });

/**
 * Montagem de cada modelo: (c) => camadas. `c` traz ar (largura/altura), land (horizontal?) e
 * helpers: sz(tamanho vertical) dá o tamanho no formato atual; fit(texto, tamanho, fonte, …).
 * Camadas: at = segundos depois do começo do modelo; x/y/w/h em fração da tela.
 */
const TITLES = [
  {
    id: 'titulo-sublinhado', label: 'Título com sublinhado', dur: 4,
    build: (c) => {
      const size = c.fit('SEU TÍTULO', c.sz(0.075), 'montserrat');
      const w = Math.min(0.8, textWidth('SEU TÍTULO', size, 'montserrat', c.ar) * 0.6);
      return [
        T({ text: 'SEU TÍTULO', font: 'montserrat', size, color: '#FFFFFF', x: 0.5, y: 0.45, animIn: 'letras-desfoque-subir', shadow: true, shadowOpacity: 0.5 }),
        S({ at: 0.25, x: 0.5, y: 0.45 + size * 0.85, w, h: size * 0.09, color: '#FF6B35', radius: 1, reveal: 'center' }),
        T({ at: 0.45, text: 'Seu subtítulo aqui', font: 'inter', size: +(size * 0.42).toFixed(4), color: '#E5E7EB', x: 0.5, y: 0.45 + size * 1.45, animIn: 'slide-up' }),
      ];
    },
  },
  {
    id: 'titulo-impacto', label: 'Impacto', dur: 3,
    build: (c) => [T({ text: 'TÍTULO FORTE', font: 'anton', size: c.fit('TÍTULO FORTE', c.sz(0.11), 'anton'), color: '#FFE24B', stroke: true, strokeColor: '#000000', strokeW: 0.004, x: 0.5, y: 0.5, animIn: 'letras-impacto', letterGap: 0.05, animOut: 'zoom' })],
  },
  {
    id: 'titulo-cinema', label: 'Cinematográfico', dur: 5,
    build: (c) => {
      const big = c.fit('SEU FILME', c.sz(0.07), 'inter', 0.86, 350, true);
      return [
        T({ text: 'UM FILME DE', font: 'inter', size: +(big * 0.32).toFixed(4), color: '#D1D5DB', tracking: 500, x: 0.5, y: 0.5 - big * 0.95, animIn: 'blur-in', animOut: 'blur' }),
        T({ at: 0.4, text: 'SEU FILME', font: 'inter', size: big, color: '#FFFFFF', tracking: 350, x: 0.5, y: 0.5, animIn: 'letras-desfoque', letterDur: 0.6, animOut: 'blur' }),
      ];
    },
  },
  {
    id: 'titulo-caixa', label: 'Caixa que se abre', dur: 4,
    build: (c) => {
      const size = c.fit('NOVIDADE', c.sz(0.075), 'archivo', 0.7);
      const w = textWidth('NOVIDADE', size, 'archivo', c.ar) + size * 0.9 / c.ar;
      return [
        S({ x: 0.5, y: 0.5, w, h: size * 1.6, color: '#FF6B35', radius: 0.12, reveal: 'left' }),
        T({ at: 0.3, text: 'NOVIDADE', font: 'archivo', size, color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'letras-subir' }),
      ];
    },
  },
  {
    id: 'titulo-duas-cores', label: 'Duas cores', dur: 4,
    build: (c) => {
      const size = c.fit('SEU TÍTULO', c.sz(0.1), 'bebas');
      return [
        T({ text: 'O SEGREDO DO', font: 'bebas', size: +(size * 0.55).toFixed(4), color: '#FFFFFF', x: 0.5, y: 0.5 - size * 0.72, animIn: 'palavras-mola' }),
        T({ at: 0.35, text: 'SEU TÍTULO', font: 'bebas', size, color: '#FF6B35', x: 0.5, y: 0.5 + size * 0.1, animIn: 'letras-mola' }),
      ];
    },
  },
  {
    id: 'titulo-pilula', label: 'Etiqueta em pílula', dur: 3.5,
    build: (c) => {
      const size = c.sz(0.045);
      const w = textWidth('NOVO VÍDEO', size, 'poppins', c.ar, 80) + (size * 1.6) / c.ar;
      return [
        S({ x: 0.5, y: 0.3, w, h: size * 1.9, color: '#7C3AED', radius: 1, reveal: 'center' }),
        T({ at: 0.25, text: 'NOVO VÍDEO', font: 'poppins', size, color: '#FFFFFF', tracking: 80, x: 0.5, y: 0.3, animIn: 'palavras-subir' }),
      ];
    },
  },
  {
    id: 'titulo-elegante', label: 'Elegante (serifa)', dur: 4.5,
    build: (c) => {
      const size = c.fit('Bem-vindos', c.sz(0.075), 'playfair', 0.66);
      const tw = textWidth('Bem-vindos', size, 'playfair', c.ar);
      const lw = Math.min(0.12, (1 - tw) / 2 - 0.04);
      const gap = 0.025;
      return [
        S({ x: 0.5 - tw / 2 - gap - lw / 2, y: 0.5, w: lw, h: 0.0035, color: '#F5B700', reveal: 'right' }),
        S({ x: 0.5 + tw / 2 + gap + lw / 2, y: 0.5, w: lw, h: 0.0035, color: '#F5B700', reveal: 'left' }),
        T({ at: 0.2, text: 'Bem-vindos', font: 'playfair', size, color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'letras-desfoque-subir', letterDur: 0.55 }),
      ];
    },
  },
  {
    id: 'titulo-capitulo', label: 'Capítulo numerado', dur: 4,
    build: (c) => {
      const size = c.sz(0.16);
      return [
        T({ text: '01', font: 'anton', size, color: '#FFFFFF', fill: false, stroke: true, strokeColor: '#FFFFFF', strokeW: 0.003, x: 0.5, y: 0.42, animIn: 'zoom' }),
        S({ at: 0.3, x: 0.5, y: 0.42 + size * 0.62, w: 0.16, h: 0.004, color: '#FF6B35', reveal: 'center' }),
        T({ at: 0.45, text: 'CAPÍTULO UM', font: 'montserrat', size: +(size * 0.24).toFixed(4), color: '#FFFFFF', tracking: 300, x: 0.5, y: 0.42 + size * 0.85, animIn: 'letras-subir' }),
      ];
    },
  },
  {
    id: 'titulo-deslize', label: 'Deslize cruzado', dur: 4,
    build: (c) => {
      const size = c.fit('MUDANÇA', c.sz(0.09), 'oswald');
      return [
        T({ text: 'GRANDE', font: 'oswald', size, color: '#FFFFFF', x: 0.5, y: 0.5 - size * 0.58, animIn: 'letras-deslizar', animOut: 'slide-left' }),
        T({ at: 0.2, text: 'MUDANÇA', font: 'oswald', size, color: '#22D3EE', x: 0.5, y: 0.5 + size * 0.58, animIn: 'letras-empurrao', animOut: 'slide-right' }),
      ];
    },
  },
  {
    id: 'titulo-neon', label: 'Neon', dur: 4,
    build: (c) => [T({ text: 'NEON', font: 'righteous', size: c.fit('NEON', c.sz(0.12), 'righteous'), color: '#E0FBFF', shadow: true, shadowColor: '#22D3EE', shadowOpacity: 1, shadowDist: 0, shadowBlur: 0.012, x: 0.5, y: 0.5, animIn: 'letras-desfoque', letterDur: 0.5 })],
  },
  {
    id: 'titulo-empilhado', label: 'Empilhado', dur: 4.5,
    build: (c) => {
      const s1 = c.fit('FAÇA', c.sz(0.07), 'kanit');
      const s2 = c.fit('MAIS', c.sz(0.13), 'kanit');
      const s3 = c.fit('COM MENOS', c.sz(0.06), 'kanit');
      const y2 = 0.5;
      return [
        T({ text: 'FAÇA', font: 'kanit', size: s1, color: '#FFFFFF', x: 0.5, y: y2 - s2 * 0.62 - s1 * 0.5, animIn: 'palavras-subir' }),
        T({ at: 0.25, text: 'MAIS', font: 'kanit', size: s2, color: '#FFE24B', x: 0.5, y: y2, animIn: 'letras-elastico' }),
        T({ at: 0.55, text: 'COM MENOS', font: 'kanit', size: s3, color: '#FFFFFF', x: 0.5, y: y2 + s2 * 0.62 + s3 * 0.5, animIn: 'palavras-subir' }),
      ];
    },
  },
  {
    id: 'titulo-digitando', label: 'Digitando', dur: 4,
    build: (c) => [T({ text: 'Digitando seu título…', font: 'inter', size: c.fit('Digitando seu título…', c.sz(0.05), 'inter'), color: '#FFFFFF', bg: true, bgColor: '#111827', bgOpacity: 0.85, bgMode: 'block', pad: 0.4, radius: 0.25, x: 0.5, y: 0.5, animIn: 'typewriter' })],
  },
];

const COMPONENTS = [
  {
    id: 'nome-barra', label: 'Nome com barra', dur: 5,
    build: (c) => {
      const size = c.sz(0.042);
      const x0 = c.land ? 0.06 : 0.08;
      const y = c.land ? 0.8 : 0.78;
      const w1 = textWidth('Seu Nome', size, 'poppins', c.ar);
      const w2 = textWidth('Especialista em vídeo', size * 0.6, 'inter', c.ar);
      const bw = 0.007 * (c.land ? 1 : 1.8);
      return [
        S({ x: x0 + bw / 2, y, w: bw, h: size * 2.4, color: '#FF6B35', reveal: 'up' }),
        T({ at: 0.2, text: 'Seu Nome', font: 'poppins', size, color: '#FFFFFF', x: x0 + bw + 0.015 + w1 / 2, y: y - size * 0.45, animIn: 'letras-deslizar', shadow: true, shadowOpacity: 0.6 }),
        T({ at: 0.4, text: 'Especialista em vídeo', font: 'inter', size: +(size * 0.6).toFixed(4), color: '#E5E7EB', x: x0 + bw + 0.015 + w2 / 2, y: y + size * 0.62, animIn: 'slide-up', shadow: true, shadowOpacity: 0.6 }),
      ];
    },
  },
  {
    id: 'nome-caixas', label: 'Nome em caixas', dur: 5,
    build: (c) => {
      const size = c.sz(0.04);
      const x0 = c.land ? 0.06 : 0.08;
      const y = c.land ? 0.8 : 0.78;
      const w1 = textWidth('SEU NOME', size, 'montserrat', c.ar, 0, true) + (size * 1.0) / c.ar;
      const s2 = +(size * 0.62).toFixed(4);
      const w2 = textWidth('CARGO OU EMPRESA', s2, 'inter', c.ar, 60, true) + (s2 * 1.4) / c.ar;
      return [
        S({ x: x0 + w1 / 2, y: y - size * 0.55, w: w1, h: size * 1.5, color: '#FFFFFF', reveal: 'left' }),
        T({ at: 0.25, text: 'SEU NOME', font: 'montserrat', size, color: '#111111', x: x0 + w1 / 2, y: y - size * 0.55, animIn: 'letras-subir' }),
        S({ at: 0.2, x: x0 + w2 / 2, y: y + size * 0.62, w: w2, h: s2 * 1.6, color: '#FF6B35', reveal: 'left' }),
        T({ at: 0.45, text: 'CARGO OU EMPRESA', font: 'inter', size: s2, color: '#FFFFFF', tracking: 60, x: x0 + w2 / 2, y: y + size * 0.62, animIn: 'fade' }),
      ];
    },
  },
  {
    id: 'inscreva-se', label: 'Botão Inscreva-se', dur: 3.5,
    build: (c) => {
      const size = c.sz(0.04);
      const w = textWidth('INSCREVA-SE', size, 'montserrat', c.ar, 0, true) + (size * 1.6) / c.ar;
      const y = c.land ? 0.82 : 0.72;
      return [
        S({ x: 0.5, y, w, h: size * 2, color: '#E11D2E', radius: 0.35, animIn: 'fade', animOut: 'none', end: 1.6 }),
        T({ text: 'INSCREVA-SE', font: 'montserrat', size, color: '#FFFFFF', x: 0.5, y, animIn: 'pop', animOut: 'none', end: 1.6 }),
        S({ at: 1.6, x: 0.5, y, w, h: size * 2, color: '#3F3F46', radius: 0.35, animIn: 'none' }),
        T({ at: 1.6, text: 'INSCRITO', font: 'montserrat', size, color: '#FFFFFF', x: 0.5, y, animIn: 'pop' }),
      ];
    },
  },
  {
    id: 'siga-perfil', label: 'Siga o perfil', dur: 4,
    build: (c) => {
      const size = c.sz(0.045);
      const w = textWidth('@seuperfil', size, 'poppins', c.ar) + (size * 1.6) / c.ar;
      const y = c.land ? 0.84 : 0.8;
      return [
        T({ text: 'SIGA', font: 'inter', size: +(size * 0.5).toFixed(4), color: '#FFFFFF', tracking: 400, x: 0.5, y: y - size * 1.4, animIn: 'fade' }),
        S({ at: 0.1, x: 0.5, y, w, h: size * 1.8, color: '#FFFFFF', radius: 1, reveal: 'center' }),
        T({ at: 0.35, text: '@seuperfil', font: 'poppins', size, color: '#111111', x: 0.5, y, animIn: 'letras-subir' }),
      ];
    },
  },
  {
    id: 'chamada-seta', label: 'Chamada apontando', dur: 4,
    build: (c) => {
      const size = c.sz(0.035);
      const dot = 0.018;
      const x0 = 0.3;
      const y = 0.4;
      const lw = 0.14;
      const tw = textWidth('Olhe aqui', size, 'poppins', c.ar) + (size * 1.2) / c.ar;
      return [
        S({ shape: 'ellipse', x: x0, y, w: dot, h: dot * c.ar, color: '#FFFFFF', stroke: true, strokeColor: '#FF6B35', strokeW: 0.003, animIn: 'zoom' }),
        S({ at: 0.15, x: x0 + dot / 2 + lw / 2, y, w: lw, h: 0.003, color: '#FFFFFF', reveal: 'left' }),
        S({ at: 0.4, x: x0 + dot / 2 + lw + tw / 2, y, w: tw, h: size * 1.8, color: '#FF6B35', radius: 0.3, reveal: 'left' }),
        T({ at: 0.6, text: 'Olhe aqui', font: 'poppins', size, color: '#FFFFFF', x: x0 + dot / 2 + lw + tw / 2, y, animIn: 'fade' }),
      ];
    },
  },
  {
    id: 'preco', label: 'Etiqueta de preço', dur: 4,
    build: (c) => {
      const size = c.sz(0.09);
      const w = textWidth('R$ 97', size, 'anton', c.ar) + (size * 1.2) / c.ar;
      return [
        T({ text: 'POR APENAS', font: 'montserrat', size: +(size * 0.3).toFixed(4), color: '#FFFFFF', tracking: 200, x: 0.5, y: 0.5 - size * 1.05, animIn: 'slide-up' }),
        S({ at: 0.1, x: 0.5, y: 0.5, w, h: size * 1.45, color: '#FFE24B', radius: 0.15, rot: -3, animIn: 'zoom' }),
        T({ at: 0.25, text: 'R$ 97', font: 'anton', size, color: '#111111', rot: -3, x: 0.5, y: 0.5, count: true, animIn: 'pop' }),
      ];
    },
  },
  {
    id: 'numero-destaque', label: 'Número com contador', dur: 4,
    build: (c) => {
      const size = c.fit('+250%', c.sz(0.11), 'archivo', 0.66);
      const w = Math.max(textWidth('+250%', size, 'archivo', c.ar), textWidth('de crescimento', size * 0.3, 'inter', c.ar)) + (size * 1.4) / c.ar;
      return [
        S({ x: 0.5, y: 0.5, w, h: size * 2.1, color: '#111827', opacity: 0.85, radius: 0.25, animIn: 'zoom' }),
        T({ at: 0.15, text: '+250%', font: 'archivo', size, color: '#2ED47A', x: 0.5, y: 0.5 - size * 0.22, count: true, animIn: 'fade' }),
        T({ at: 0.35, text: 'de crescimento', font: 'inter', size: +(size * 0.3).toFixed(4), color: '#E5E7EB', x: 0.5, y: 0.5 + size * 0.6, animIn: 'slide-up' }),
      ];
    },
  },
  {
    id: 'urgente', label: 'Faixa de notícia', dur: 5,
    build: (c) => {
      const size = c.sz(0.032);
      const y = c.land ? 0.86 : 0.8;
      const lw = textWidth('URGENTE', size, 'archivo', c.ar) + (size * 1.2) / c.ar;
      const head = 'Sua manchete aparece aqui';
      const s2 = fitSize(head, size, 'poppins', c.ar, 0.94 - lw - 0.04);
      return [
        S({ x: 0.5, y, w: 1, h: size * 2.2, color: '#0B0F1A', opacity: 0.9, reveal: 'left' }),
        S({ at: 0.15, x: 0.03 + lw / 2, y, w: lw, h: size * 2.2, color: '#E11D2E', reveal: 'up' }),
        T({ at: 0.3, text: 'URGENTE', font: 'archivo', size, color: '#FFFFFF', x: 0.03 + lw / 2, y, animIn: 'fade' }),
        T({ at: 0.45, text: head, font: 'poppins', size: s2, color: '#FFFFFF', x: 0.03 + lw + 0.025 + textWidth(head, s2, 'poppins', c.ar) / 2, y, animIn: 'palavras-deslizar' }),
      ];
    },
  },
  {
    id: 'lista-3', label: 'Lista de 3 itens', dur: 5,
    build: (c) => {
      const size = c.sz(0.045);
      const items = ['Primeiro ponto', 'Segundo ponto', 'Terceiro ponto'];
      const x0 = c.land ? 0.3 : 0.15;
      const sq = size * 0.55;
      // um texto só, de 3 linhas alinhadas à esquerda (palavra por palavra): as linhas ficam
      // alinhadas de verdade; os marcadores entram junto com a 1ª palavra de cada linha
      const lead = +(size * 0.55).toFixed(4);
      const pitch = size * 1.15 + lead;
      const yc = 0.45;
      const gap = 0.15; // entre palavras (2 palavras por linha → 0,3 s por linha)
      const text = items.join('\n');
      const tw = textWidth(text, size, 'poppins', c.ar);
      return [
        ...items.map((_, i) => S({ at: i * 2 * gap, x: x0, y: yc + (i - 1) * pitch, w: sq / c.ar, h: sq, color: '#FF6B35', radius: 0.35, animIn: 'zoom' })),
        T({ text, font: 'poppins', size, color: '#FFFFFF', align: 'left', leading: lead, x: x0 + sq / c.ar / 2 + 0.025 + tw / 2, y: yc, animIn: 'palavras-deslizar', wordGap: gap }),
      ];
    },
  },
  {
    id: 'citacao', label: 'Cartão de citação', dur: 5,
    build: (c) => {
      const size = c.sz(0.04);
      const quote = 'Uma frase que\nmarca o vídeo';
      const w = Math.min(0.9, textWidth(quote, size, 'playfair', c.ar) + (size * 2.4) / c.ar);
      const h = size * 5.6;
      return [
        S({ x: 0.5, y: 0.5, w, h, color: '#FFFFFF', radius: 0.12, shadow: true, shadowOpacity: 0.35, shadowBlur: 0.01, animIn: 'zoom' }),
        T({ at: 0.15, text: '“', font: 'playfair', size: +(size * 2.2).toFixed(4), color: '#FF6B35', x: 0.5, y: 0.5 - h * 0.33, animIn: 'pop' }),
        T({ at: 0.3, text: quote, font: 'playfair', size, color: '#111111', x: 0.5, y: 0.5, animIn: 'palavras-desfoque-subir' }),
        T({ at: 0.6, text: '— Seu nome', font: 'inter', size: +(size * 0.55).toFixed(4), color: '#6B7280', x: 0.5, y: 0.5 + h * 0.33, animIn: 'fade' }),
      ];
    },
  },
  {
    id: 'local', label: 'Localização', dur: 4,
    build: (c) => {
      const size = c.sz(0.034);
      const text = 'São Paulo, Brasil';
      const tw = textWidth(text, size, 'poppins', c.ar);
      const dot = size * 0.6;
      const w = tw + dot / c.ar + (size * 1.8) / c.ar;
      const x0 = c.land ? 0.06 : 0.08;
      const y = c.land ? 0.1 : 0.12;
      return [
        S({ x: x0 + w / 2, y, w, h: size * 1.9, color: '#111827', opacity: 0.85, radius: 1, reveal: 'left' }),
        S({ at: 0.2, shape: 'ellipse', x: x0 + (size * 0.8) / c.ar + dot / c.ar / 2, y, w: dot / c.ar, h: dot, color: '#F0526B', animIn: 'zoom' }),
        T({ at: 0.3, text, font: 'poppins', size, color: '#FFFFFF', x: x0 + (size * 0.8) / c.ar + dot / c.ar + 0.012 + tw / 2, y, animIn: 'fade' }),
      ];
    },
  },
  {
    id: 'dica', label: 'Dica', dur: 4.5,
    build: (c) => {
      const size = c.sz(0.038);
      const text = fitSize('Escreva a sua dica aqui', size, 'poppins', c.ar, 0.8) === size ? 'Escreva a sua dica aqui' : 'Escreva a sua\ndica aqui';
      const bw = textWidth('DICA', size * 0.8, 'archivo', c.ar) + (size * 1.2) / c.ar;
      return [
        S({ x: 0.5, y: 0.42, w: bw, h: size * 1.6, color: '#FFE24B', radius: 0.3, rot: -4, animIn: 'zoom' }),
        T({ text: 'DICA', font: 'archivo', size: +(size * 0.8).toFixed(4), color: '#111111', rot: -4, x: 0.5, y: 0.42, animIn: 'pop' }),
        T({ at: 0.3, text, font: 'poppins', size, color: '#FFFFFF', x: 0.5, y: 0.42 + size * 2.1, animIn: 'palavras-subir', shadow: true, shadowOpacity: 0.65 }),
      ];
    },
  },
  {
    id: 'antes-depois', label: 'Antes e depois', dur: 4,
    build: (c) => {
      const size = c.sz(0.04);
      const w = textWidth('DEPOIS', size, 'archivo', c.ar) + (size * 1.2) / c.ar;
      return [
        S({ x: 0.05 + w / 2, y: 0.08, w, h: size * 1.7, color: '#111111', reveal: 'left' }),
        T({ at: 0.2, text: 'ANTES', font: 'archivo', size, color: '#FFFFFF', x: 0.05 + w / 2, y: 0.08, animIn: 'fade' }),
        S({ x: 0.95 - w / 2, y: 0.08, w, h: size * 1.7, color: '#FF6B35', reveal: 'right' }),
        T({ at: 0.2, text: 'DEPOIS', font: 'archivo', size, color: '#FFFFFF', x: 0.95 - w / 2, y: 0.08, animIn: 'fade' }),
      ];
    },
  },
];

/** Fontes animadas: uma fonte + uma animação por letra/palavra + a aparência. */
const FONTS = [
  { id: 'fa-mola', label: 'Mola', font: 'anton', animIn: 'letras-mola', color: '#FFE24B', stroke: true, strokeColor: '#000000', strokeW: 0.004 },
  { id: 'fa-queda', label: 'Queda', font: 'bebas', animIn: 'letras-queda', color: '#FFFFFF', shadow: true, shadowOpacity: 0.6 },
  { id: 'fa-impacto', label: 'Impacto', font: 'archivo', animIn: 'letras-impacto', color: '#FFFFFF', stroke: true, strokeColor: '#000000', strokeW: 0.004 },
  { id: 'fa-elastico', label: 'Elástico', font: 'rubik', animIn: 'letras-elastico', color: '#22D3EE' },
  { id: 'fa-deslizar', label: 'Deslizar', font: 'montserrat', animIn: 'letras-deslizar', color: '#FFFFFF', shadow: true, shadowOpacity: 0.6 },
  { id: 'fa-empurrao', label: 'Empurrão', font: 'oswald', animIn: 'letras-empurrao', color: '#FF6B35' },
  { id: 'fa-elegante', label: 'Elegante', font: 'playfair', animIn: 'letras-desfoque-subir', color: '#FFFFFF', text: 'Seu texto' },
  { id: 'fa-suave', label: 'Assentar suave', font: 'inter', animIn: 'letras-escala', color: '#FFFFFF', tracking: 120 },
  { id: 'fa-subir', label: 'Subir', font: 'kanit', animIn: 'letras-subir', color: '#FFFFFF', stroke: true, strokeColor: '#000000', strokeW: 0.003 },
  { id: 'fa-quadrinhos', label: 'Quadrinhos', font: 'bangers', animIn: 'letras-pop', color: '#FFE24B', stroke: true, strokeColor: '#111111', strokeW: 0.005 },
  { id: 'fa-cartoon', label: 'Cartoon', font: 'luckiest', animIn: 'letras-mola', color: '#FF5CA8', stroke: true, strokeColor: '#FFFFFF', strokeW: 0.004 },
  { id: 'fa-marcador', label: 'Marcador', font: 'marker', animIn: 'letras-desfoque', color: '#FFFFFF', text: 'Seu texto' },
  { id: 'fa-neon', label: 'Neon', font: 'righteous', animIn: 'letras-desfoque', color: '#E0FBFF', shadow: true, shadowColor: '#E040FB', shadowOpacity: 1, shadowDist: 0, shadowBlur: 0.012 },
  { id: 'fa-youtuber', label: 'YouTuber', font: 'lilita', animIn: 'palavras-mola', color: '#FFFFFF', stroke: true, strokeColor: '#000000', strokeW: 0.005, text: 'SEU TEXTO AQUI' },
  { id: 'fa-palavras', label: 'Palavras do desfoque', font: 'poppins', animIn: 'palavras-desfoque-subir', color: '#FFFFFF', text: 'Seu texto aqui' },
  { id: 'fa-maquina', label: 'Máquina de escrever', font: 'inter', animIn: 'typewriter', color: '#FFFFFF', bg: true, bgColor: '#000000', bgOpacity: 0.7, bgMode: 'block', pad: 0.35, text: 'Seu texto aqui' },
];

// Pacote "Textos animados" (shared/textPacks.js): entra nas mesmas categorias
const EXTRA = textPacks({ T, S, textWidth, fitSize });
TITLES.push(...EXTRA.titles);
COMPONENTS.push(...EXTRA.components);
FONTS.push(...EXTRA.fonts);

/** Os campos de aparência que uma fonte animada leva para o texto. */
export const FONT_LOOK_KEYS = ['font', 'animIn', 'italic', 'color', 'stroke', 'strokeColor', 'strokeW', 'shadow', 'shadowColor', 'shadowOpacity', 'shadowDist', 'shadowBlur', 'tracking', 'bg', 'bgColor', 'bgOpacity', 'bgMode', 'pad'];

export const PACK_CATEGORIES = [
  { id: 'titulos', label: 'Títulos' },
  { id: 'componentes', label: 'Componentes gráficos' },
  { id: 'fontes', label: 'Fontes animadas' },
];

/** Todos os modelos: { id, cat, label, dur }. */
export const PACK_ITEMS = [
  ...TITLES.map((x) => ({ id: x.id, cat: 'titulos', label: x.label, dur: x.dur })),
  ...COMPONENTS.map((x) => ({ id: x.id, cat: 'componentes', label: x.label, dur: x.dur })),
  ...FONTS.map((x) => ({ id: x.id, cat: 'fontes', label: x.label, dur: 3 })),
];
const BUILDERS = Object.fromEntries([...TITLES, ...COMPONENTS].map((x) => [x.id, x]));
const FONT_BY_ID = Object.fromEntries(FONTS.map((x) => [x.id, x]));

/** A aparência (campos de texto) de uma fonte animada, para aplicar num texto existente. */
export function fontPackLook(id) {
  const f = FONT_BY_ID[id];
  if (!f) return null;
  const out = {};
  for (const k of FONT_LOOK_KEYS) if (f[k] != null) out[k] = f[k];
  return out;
}

const r4 = (v) => +Number(v).toFixed(4);

/**
 * Camadas do modelo `id` prontas para a timeline (sem `key`): começam em `t` (segundos) e
 * duram o tempo do modelo, cortadas em `maxEnd`. `ar` = largura/altura do vídeo final.
 * Formato igual ao das camadas de texto/forma (cleanTextLayers aceita). [] se não existir.
 */
export function buildPackLayers(id, { t = 0, ar = 9 / 16, maxEnd = Infinity, dur: durOver } = {}) {
  const AR = Number(ar) > 0 ? Number(ar) : 9 / 16;
  const land = AR > 1.05;
  const item = PACK_ITEMS.find((x) => x.id === id);
  if (!item) return [];
  const dur = Number(durOver) > 0 ? Number(durOver) : item.dur;
  // tamanhos pensados para o vertical; no horizontal a altura é menor, então a letra cresce um pouco
  const ctx = {
    ar: AR,
    land,
    sz: (s) => r4(land ? s * 1.15 : AR > 0.9 ? s * 0.95 : s),
    fit: (text, size, font, maxW = 0.86, tracking = 0, caps = false) => fitSize(text, size, font, AR, maxW, tracking, caps),
  };
  let layers;
  if (FONT_BY_ID[id]) {
    const f = FONT_BY_ID[id];
    const text = f.text || 'SEU TEXTO';
    const { id: _i, label: _l, text: _t, ...look } = f;
    layers = [T({ ...look, text, size: fitSize(text, ctx.sz(0.08), f.font, AR, 0.86, f.tracking || 0), x: 0.5, y: 0.5, animOut: 'fade' })];
  } else {
    layers = BUILDERS[id].build(ctx);
  }
  const t0 = Math.max(0, Number(t) || 0);
  const out = [];
  for (const raw of layers) {
    const { at = 0, end: endOff, ...l } = raw;
    const start = t0 + at;
    const end = Math.min(maxEnd, t0 + (endOff != null ? endOff : dur));
    if (end - start < 0.2) continue;
    const lay = { ...l, start: +start.toFixed(2), end: +end.toFixed(2) };
    for (const k of ['x', 'y', 'w', 'h', 'size']) if (lay[k] != null) lay[k] = r4(lay[k]);
    out.push(lay);
  }
  // acabamento dos textos: sem o contorno preto antigo; sombra leve só no texto solto sobre o
  // vídeo (o que fica em cima de uma caixa/barra do próprio modelo não precisa)
  const shapes = out.filter((l) => l.kind === 'shape' && l.fill !== false);
  for (const l of out) {
    if (l.kind !== 'text') continue;
    delete l.kind;
    if (l.stroke == null) l.stroke = false;
    if (l.shadow == null) {
      const onBox = shapes.some((s) => s.start <= l.start + 0.05 && s.end >= l.end - 0.05 && Math.abs(l.x - s.x) <= s.w / 2 && Math.abs(l.y - s.y) <= s.h / 2);
      if (!onBox) Object.assign(l, { shadow: true, shadowOpacity: 0.55 });
    }
  }
  return out;
}
