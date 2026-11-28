// Pacote "Textos animados": títulos e componentes de texto em estilos que aparecem nos pacotes
// de modelos de texto para Premiere (minimalista com linhas, pílula de contorno, palavras
// empilhadas em duas cores, palavra quebrada, barra lateral, faixa inclinada, 3D em camadas,
// divisão RGB, neon, cartão colorido digitando, citações, balões e selos de promoção, barra de
// inscrever-se, nome com divisor). Desenhos PRÓPRIOS, feitos com as camadas de texto e forma do
// app — nenhum arquivo, texto ou arte dos pacotes de referência é usado.
// Ver docs/ANALISE-PACOTES-TEXTO.md. Puro.

/**
 * Monta os modelos com os ajudantes de shared/libraryPacks.js (passados aqui para não haver
 * importação circular). → { titles, components, fonts }
 */
export function textPacks({ T, S, textWidth, fitSize }) {
  const RED = '#E5253A';
  const YEL = '#F5C518';
  const CYAN = '#22D3EE';
  const PINK = '#FF4D8D';
  const PURPLE = '#5B3DF5';
  const DARK = '#111111';
  /** Círculo (elipse com a mesma medida na tela): d = diâmetro em fração da altura. */
  const circle = (c, o) => S({ shape: 'ellipse', ...o, w: o.d / c.ar, h: o.d, d: undefined });
  /** Quadrado girado 45° (o "rabinho" dos balões). */
  const tail = (c, o) => S({ ...o, w: o.s / c.ar, h: o.s, rot: 45, s: undefined });

  const titles = [
    {
      id: 'tt-entre-linhas', label: 'Entre linhas', dur: 4,
      build: (c) => {
        const text = 'SEU TÍTULO AQUI';
        const size = c.fit(text, c.sz(0.045), 'montserrat', 0.8, 120);
        const w = Math.min(0.9, textWidth(text, size, 'montserrat', c.ar, 120) * 1.04);
        return [
          S({ x: 0.5, y: 0.5 - size * 0.95, w, h: 0.003, color: '#FFFFFF', reveal: 'left' }),
          S({ at: 0.1, x: 0.5, y: 0.5 + size * 0.95, w, h: 0.003, color: '#FFFFFF', reveal: 'right' }),
          T({ at: 0.2, text, font: 'montserrat', size, color: '#FFFFFF', tracking: 120, x: 0.5, y: 0.5, animIn: 'letras-subir' }),
        ];
      },
    },
    {
      id: 'tt-pilula-contorno', label: 'Pílula de contorno', dur: 4,
      build: (c) => {
        const text = 'TÍTULOS ANIMADOS';
        const size = c.fit(text, c.sz(0.036), 'inter', 0.62, 60);
        const w = textWidth(text, size, 'inter', c.ar, 60) + (size * 1.8) / c.ar;
        const d = size * 1.9;
        const gap = 0.02;
        const x = 0.5 - (gap + d / c.ar) / 2;
        return [
          S({ x, y: 0.5, w, h: size * 1.9, fill: false, stroke: true, strokeColor: '#FFFFFF', strokeW: 0.0025, radius: 1, reveal: 'left' }),
          T({ at: 0.25, text, font: 'inter', size, color: '#FFFFFF', tracking: 60, x, y: 0.5, animIn: 'letras-desfoque' }),
          circle(c, { at: 0.45, x: x + w / 2 + gap + d / c.ar / 2, y: 0.5, d, fill: false, stroke: true, strokeColor: '#FFFFFF', strokeW: 0.0025, animIn: 'zoom' }),
        ];
      },
    },
    {
      id: 'tt-titulo-legenda', label: 'Título e legenda', dur: 4,
      build: (c) => {
        const big = c.fit('DINÂMICO', c.sz(0.08), 'montserrat', 0.7);
        const small = +(big * 0.32).toFixed(4);
        return [
          T({ text: 'DINÂMICO', font: 'montserrat', size: big, color: '#FFFFFF', x: 0.5, y: 0.5 - big * 0.2, animIn: 'letras-escala' }),
          T({ at: 0.35, text: 'tipografia animada', font: 'inter', size: small, color: '#D1D5DB', tracking: 150, x: 0.5, y: 0.5 + big * 0.62, animIn: 'palavras-subir' }),
        ];
      },
    },
    {
      id: 'tt-faixa-meio', label: 'Faixa no meio', dur: 4.5,
      build: (c) => {
        const s = c.fit('POR SUA MARCA', c.sz(0.045), 'montserrat', 0.7);
        const w = Math.max(textWidth('IDEIA CRIATIVA', s, 'montserrat', c.ar), textWidth('POR SUA MARCA', s, 'montserrat', c.ar));
        const sm = +(s * 0.42).toFixed(4);
        return [
          T({ text: 'IDEIA CRIATIVA', font: 'montserrat', size: s, color: '#FFFFFF', x: 0.5, y: 0.5 - s * 0.95, animIn: 'letras-subir' }),
          S({ at: 0.25, x: 0.5, y: 0.5, w, h: sm * 1.7, color: RED, reveal: 'center' }),
          T({ at: 0.4, text: 'TIPOGRAFIA ANIMADA', font: 'inter', size: sm, color: '#FFFFFF', tracking: 200, x: 0.5, y: 0.5, animIn: 'fade' }),
          T({ at: 0.3, text: 'POR SUA MARCA', font: 'montserrat', size: s, color: '#FFFFFF', x: 0.5, y: 0.5 + s * 0.95, animIn: 'letras-subir' }),
        ];
      },
    },
    {
      id: 'tt-empilhado-cores', label: 'Bloco em duas cores', dur: 4.5,
      build: (c) => {
        // cada linha do tamanho que ocupa a mesma largura (bloco "justificado")
        const W0 = c.land ? 0.34 : 0.62;
        const lines = [['CONFIE', RED], ['NO TEMPO', '#FFFFFF'], ['DA SUA', '#FFFFFF'], ['VIDA', RED]];
        const sizes = lines.map(([t]) => Math.min(c.sz(0.16), fitSize(t, 0.5, 'archivo', c.ar, W0)));
        const total = sizes.reduce((a, b) => a + b * 1.02, 0);
        let y = 0.5 - total / 2;
        return lines.map(([text, color], i) => {
          const size = +sizes[i].toFixed(4);
          const yc = y + size * 0.51;
          y += size * 1.02;
          return T({ at: i * 0.18, text, font: 'archivo', size, color, x: 0.5, y: yc, animIn: i % 2 ? 'letras-deslizar' : 'letras-subir', shadow: false });
        });
      },
    },
    {
      id: 'tt-palavra-quebrada', label: 'Palavra quebrada', dur: 4.5,
      build: (c) => {
        const size = c.sz(0.13);
        const s2 = +(size * 0.24).toFixed(4);
        const bw = textWidth('JUNTOS', s2, 'inter', c.ar, 100) + (s2 * 1.4) / c.ar;
        const y0 = 0.5 - size * 0.7;
        // a caixa fica embaixo de "MOS", alinhada pela direita
        const xB = 0.5 + textWidth('MOS', size, 'archivo', c.ar) / 2 - bw / 2;
        const yB = y0 + size * 1.02 + size * 0.75;
        return [
          T({ text: 'VA', font: 'archivo', size, color: '#FFFFFF', x: 0.5, y: y0, animIn: 'letras-queda' }),
          T({ at: 0.2, text: 'MOS', font: 'archivo', size, color: '#FFFFFF', x: 0.5, y: y0 + size * 1.02, animIn: 'letras-queda' }),
          S({ at: 0.5, x: xB, y: yB, w: bw, h: s2 * 1.8, fill: false, stroke: true, strokeColor: '#FFFFFF', strokeW: 0.002, reveal: 'left' }),
          T({ at: 0.65, text: 'JUNTOS', font: 'inter', size: s2, color: '#FFFFFF', tracking: 100, x: xB, y: yB, animIn: 'fade' }),
        ];
      },
    },
    {
      id: 'tt-barra-lateral', label: 'Barra lateral', dur: 4.5,
      build: (c) => {
        const xL = c.land ? 0.4 : 0.22;
        const big = c.sz(0.085);
        const sm = +(big * 0.36).toFixed(4);
        const rows = [['NOVAS', sm, '#FFFFFF'], ['REGRAS', big, RED], ['DESDE', sm, '#FFFFFF'], ['2026', +(big * 1.3).toFixed(4), RED]];
        const total = rows.reduce((a, r) => a + r[1] * 1.02, 0);
        let y = 0.5 - total / 2;
        const out = [S({ x: xL - 0.02, y: 0.5, w: 0.004 * (c.land ? 1 : 1.8), h: total * 1.02, color: '#FFFFFF', reveal: 'up' })];
        rows.forEach(([text, size, color], i) => {
          const yc = y + size * 0.51;
          y += size * 1.02;
          out.push(T({ at: 0.15 + i * 0.15, text, font: 'archivo', size, color, x: xL + textWidth(text, size, 'archivo', c.ar) / 2, y: yc, animIn: 'letras-deslizar' }));
        });
        return out;
      },
    },
    {
      id: 'tt-inclinado-faixa', label: 'Faixa inclinada', dur: 4,
      build: (c) => {
        const s1 = c.fit('O MELHOR', c.sz(0.055), 'archivo', 0.6);
        const s2 = c.fit('AINDA VEM', c.sz(0.08), 'archivo', 0.82);
        const w1 = textWidth('O MELHOR', s1, 'archivo', c.ar) + (s1 * 0.9) / c.ar;
        const y1 = 0.5 - s2 * 0.6;
        return [
          S({ x: 0.5 + 0.06, y: y1, w: w1, h: s1 * 1.5, color: RED, rot: -6, animIn: 'zoom' }),
          T({ at: 0.15, text: 'O MELHOR', font: 'archivo', size: s1, color: '#FFFFFF', rot: -6, x: 0.5 + 0.06, y: y1, animIn: 'palavras-mola' }),
          T({ at: 0.35, text: 'AINDA VEM', font: 'archivo', size: s2, color: '#7C6CFF', rot: -6, x: 0.5 - 0.02, y: 0.5 + s2 * 0.45, animIn: 'letras-elastico', stroke: true, strokeColor: '#FFFFFF', strokeW: 0.002 }),
        ];
      },
    },
    {
      id: 'tt-sublinhado-duas-cores', label: 'Duas linhas sublinhadas', dur: 4.5,
      build: (c) => {
        const s1 = c.fit('TRABALHE EM SILÊNCIO', c.sz(0.04), 'archivo', 0.7);
        const s2 = c.fit('DEIXE O SUCESSO FALAR', c.sz(0.05), 'archivo', 0.86);
        const w2 = textWidth('DEIXE O SUCESSO FALAR', s2, 'archivo', c.ar);
        return [
          T({ text: 'TRABALHE EM SILÊNCIO', font: 'archivo', size: s1, color: '#FFFFFF', x: 0.5, y: 0.5 - s2 * 0.75, animIn: 'palavras-subir' }),
          T({ at: 0.35, text: 'DEIXE O SUCESSO FALAR', font: 'archivo', size: s2, color: CYAN, x: 0.5, y: 0.5 + s2 * 0.2, animIn: 'palavras-deslizar' }),
          S({ at: 0.6, x: 0.5, y: 0.5 + s2 * 0.95, w: Math.min(0.92, w2 * 1.02), h: 0.003, color: '#FFFFFF', reveal: 'left' }),
        ];
      },
    },
    {
      id: 'tt-vermelho-etiqueta', label: 'Vermelho com etiqueta', dur: 4,
      build: (c) => {
        const big = c.fit('O SEGREDO', c.sz(0.08), 'archivo', 0.82);
        const sm = +(big * 0.3).toFixed(4);
        const w = textWidth('QUE NINGUÉM TE CONTA', sm, 'archivo', c.ar) + (sm * 1.4) / c.ar;
        return [
          T({ text: 'O SEGREDO', font: 'archivo', size: big, color: RED, x: 0.5, y: 0.5 - big * 0.25, animIn: 'letras-impacto', letterGap: 0.05 }),
          S({ at: 0.4, x: 0.5, y: 0.5 + big * 0.55, w, h: sm * 1.5, color: '#FFFFFF', reveal: 'center' }),
          T({ at: 0.55, text: 'QUE NINGUÉM TE CONTA', font: 'archivo', size: sm, color: DARK, x: 0.5, y: 0.5 + big * 0.55, animIn: 'fade' }),
        ];
      },
    },
    {
      id: 'tt-cartao-condensado', label: 'Cartão condensado', dur: 4.5,
      build: (c) => {
        const size = c.fit('SEU CAMINHO', c.sz(0.09), 'bebas', 0.7);
        const w = textWidth('SEU CAMINHO', size, 'bebas', c.ar) + (size * 1.6) / c.ar;
        return [
          S({ x: 0.5, y: 0.5, w, h: size * 2.7, color: '#263038', radius: 0.08, reveal: 'up' }),
          T({ at: 0.2, text: 'CADA UM TEM', font: 'bebas', size, color: '#FFFFFF', x: 0.5, y: 0.5 - size * 0.52, animIn: 'palavras-subir' }),
          T({ at: 0.5, text: 'SEU CAMINHO', font: 'bebas', size, color: YEL, x: 0.5, y: 0.5 + size * 0.52, animIn: 'palavras-subir' }),
        ];
      },
    },
    {
      id: 'tt-neon-linha', label: 'Neon com linhas', dur: 4.5,
      build: (c) => {
        const text = 'Aprendendo na prática';
        const size = c.fit(text, c.sz(0.042), 'poppins', 0.66);
        const tw = textWidth(text, size, 'poppins', c.ar);
        const sq = size * 1.3;
        const gap = 0.02;
        const total = sq / c.ar + gap + tw;
        const x0 = 0.5 - total / 2;
        const glow = (col) => ({ shadow: true, shadowColor: col, shadowOpacity: 1, shadowDist: 0, shadowBlur: 0.008 });
        return [
          S({ x: 0.5, y: 0.5 - size * 1.15, w: total * 0.85, h: 0.004, color: '#7DF9FF', ...glow(CYAN), reveal: 'left' }),
          S({ at: 0.15, x: x0 + sq / c.ar / 2, y: 0.5, w: sq / c.ar, h: sq, color: '#FF5A1F', radius: 0.15, ...glow('#FF5A1F'), animIn: 'zoom' }),
          T({ at: 0.25, text: '>', font: 'archivo', size: +(sq * 0.6).toFixed(4), color: '#FFFFFF', x: x0 + sq / c.ar / 2, y: 0.5, animIn: 'fade' }),
          T({ at: 0.3, text, font: 'poppins', size, color: '#FFFFFF', x: x0 + sq / c.ar + gap + tw / 2, y: 0.5, animIn: 'palavras-desfoque-subir', ...glow('#FFFFFF'), shadowBlur: 0.004, shadowOpacity: 0.6 }),
          S({ at: 0.45, x: x0 + sq / c.ar + gap + tw / 2, y: 0.5 + size * 0.85, w: tw, h: 0.004, color: '#FF7A3D', ...glow('#FF5A1F'), reveal: 'left' }),
        ];
      },
    },
    {
      id: 'tt-3d-camadas', label: '3D em camadas', dur: 3.5,
      build: (c) => {
        const text = 'UAU!';
        const size = c.fit(text, c.sz(0.15), 'luckiest', 0.7);
        const d = size * 0.05;
        const lay = (k, color, extra = {}) => T({ text, font: 'luckiest', size, color, rot: -5, x: 0.5 + (d * k) / c.ar, y: 0.5 + d * k, animIn: 'letras-mola', shadow: false, ...extra });
        return [lay(3, PURPLE), lay(2, PINK), lay(1, CYAN), lay(0, '#FFE24B', { stroke: true, strokeColor: DARK, strokeW: 0.003 })];
      },
    },
    {
      id: 'tt-rgb', label: 'Divisão RGB', dur: 3.5,
      build: (c) => {
        const text = 'SINAL';
        const size = c.fit(text, c.sz(0.12), 'archivo', 0.76);
        const d = size * 0.05;
        const lay = (dx, color, op) => T({ text, font: 'archivo', size, color, opacity: op, x: 0.5 + dx / c.ar, y: 0.5, animIn: 'letras-impacto', letterGap: 0.04, shadow: false });
        return [lay(-d, '#FF2D55', 0.85), lay(d, '#00E5FF', 0.85), lay(0, '#FFFFFF', 1)];
      },
    },
    {
      id: 'tt-fundo-branco', label: 'Palavra no fundo branco', dur: 3,
      build: (c) => [
        S({ x: 0.5, y: 0.5, w: 1, h: 1, color: '#FFFFFF', animIn: 'fade' }),
        T({ at: 0.15, text: 'Foco', font: 'inter', size: c.fit('Foco', c.sz(0.14), 'inter', 0.7), color: DARK, x: 0.5, y: 0.5, animIn: 'letras-escala', letterDur: 0.5 }),
      ],
    },
    {
      id: 'tt-frase-limpa', label: 'Frase limpa', dur: 4,
      build: (c) => {
        const text = 'Feito para títulos rápidos';
        return [T({ text, font: 'inter', size: c.fit(text, c.sz(0.048), 'inter', 0.86), color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'palavras-desfoque-subir' })];
      },
    },
    {
      id: 'tt-tipografia-inclinada', label: 'Tipografia inclinada', dur: 4,
      build: (c) => {
        const s1 = c.fit('TIPOGRAFIA', c.sz(0.075), 'archivo', 0.78);
        const s2 = c.fit('ANIMADA', c.sz(0.075), 'archivo', 0.66);
        return [
          T({ text: 'TIPOGRAFIA', font: 'archivo', size: s1, color: RED, rot: -8, x: 0.5 + 0.02, y: 0.5 - s1 * 0.5, animIn: 'letras-mola', stroke: true, strokeColor: '#FFFFFF', strokeW: 0.002 }),
          T({ at: 0.3, text: 'ANIMADA', font: 'archivo', size: s2, color: '#FFFFFF', rot: -8, x: 0.5 - 0.02, y: 0.5 + s2 * 0.6, animIn: 'letras-mola' }),
        ];
      },
    },
    {
      id: 'tt-cartao-digitando', label: 'Cartão colorido digitando', dur: 4.5,
      build: (c) => {
        const text = 'Tudo é possível.|';
        return [
          S({ x: 0.5, y: 0.5, w: 1, h: 1, color: PURPLE, animIn: 'fade' }),
          T({ at: 0.2, text, font: 'playfair', italic: true, size: c.fit(text, c.sz(0.06), 'playfair', 0.8), color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'typewriter' }),
        ];
      },
    },
  ];

  const components = [
    {
      id: 'cit-autor-topo', label: 'Citação com autor em cima', dur: 5,
      build: (c) => {
        const quote = '“UMA FRASE MARCANTE\nPARA O SEU VÍDEO.”';
        const size = c.fit(quote, c.sz(0.036), 'poppins', 0.8);
        return [
          T({ text: 'NOME DO AUTOR', font: 'inter', size: +(size * 0.5).toFixed(4), color: YEL, tracking: 200, x: 0.5, y: 0.5 - size * 1.6, animIn: 'fade' }),
          T({ at: 0.25, text: quote, font: 'poppins', size, color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'palavras-subir' }),
        ];
      },
    },
    {
      id: 'cit-nome-grande', label: 'Citação com nome grande', dur: 5.5,
      build: (c) => {
        const xL = c.land ? 0.28 : 0.1;
        const name = 'NOME\nDO AUTOR';
        const sn = c.fit(name, c.sz(0.06), 'archivo', 0.8);
        const body = 'SE QUISER IR RÁPIDO,\nVÁ SOZINHO. SE QUISER\nIR LONGE, VÁ JUNTO.';
        const sb = c.fit(body, c.sz(0.03), 'poppins', 0.62);
        const qs = +(sb * 3).toFixed(4);
        const qw = textWidth('”', qs, 'playfair', c.ar);
        const yN = 0.5 - sn * 1.05;
        const yB = 0.5 + sb * 1.4;
        return [
          T({ text: name, font: 'archivo', size: sn, color: YEL, align: 'left', x: xL + textWidth(name, sn, 'archivo', c.ar) / 2, y: yN, animIn: 'palavras-subir' }),
          T({ at: 0.35, text: '”', font: 'playfair', size: qs, color: YEL, x: xL + qw / 2, y: yB - sb * 0.4, animIn: 'pop' }),
          T({ at: 0.5, text: body, font: 'poppins', size: sb, color: '#FFFFFF', align: 'left', x: xL + qw + 0.02 + textWidth(body, sb, 'poppins', c.ar) / 2, y: yB, animIn: 'palavras-desfoque-subir' }),
        ];
      },
    },
    {
      id: 'cit-centro', label: 'Citação curta', dur: 4.5,
      build: (c) => {
        const q = '“UM SORRISO MUDA O DIA.”';
        const size = c.fit(q, c.sz(0.042), 'poppins', 0.86);
        return [
          T({ text: q, font: 'poppins', size, color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'palavras-subir' }),
          T({ at: 0.6, text: '— NOME DO AUTOR —', font: 'inter', italic: true, size: +(size * 0.42).toFixed(4), color: YEL, tracking: 80, x: 0.5, y: 0.5 + size * 1.05, animIn: 'fade' }),
        ];
      },
    },
    {
      id: 'balao-novo', label: 'Balão "Novo"', dur: 3.5,
      build: (c) => {
        const d = c.sz(0.16);
        return [
          tail(c, { x: 0.5 - (d * 0.32) / c.ar, y: 0.5 - d * 0.32, s: d * 0.3, color: '#0F9F9B', animIn: 'zoom' }),
          circle(c, { x: 0.5 + (d * 0.04) / c.ar, y: 0.5 + d * 0.04, d, color: '#0F9F9B', animIn: 'zoom' }),
          circle(c, { x: 0.5, y: 0.5, d, color: '#18D8D2', animIn: 'zoom' }),
          T({ at: 0.15, text: 'NOVO', font: 'anton', size: +(d * 0.32).toFixed(4), color: '#FFFFFF', x: 0.5, y: 0.5, animIn: 'pop' }),
        ];
      },
    },
    {
      id: 'balao-compre', label: 'Balão "Compre já"', dur: 3.5,
      build: (c) => {
        const s = c.sz(0.05);
        const w = textWidth('COMPRE', s, 'anton', c.ar) + (s * 1.4) / c.ar;
        const h = s * 2.9;
        return [
          S({ x: 0.5 + (s * 0.12) / c.ar, y: 0.5 + s * 0.12, w, h, color: '#B38A00', radius: 0.18, rot: -4, animIn: 'zoom' }),
          tail(c, { x: 0.5 + w * 0.34, y: 0.5 - h * 0.48, s: s * 0.7, color: YEL, animIn: 'zoom' }),
          S({ x: 0.5, y: 0.5, w, h, color: YEL, radius: 0.18, rot: -4, animIn: 'zoom' }),
          T({ at: 0.15, text: 'COMPRE\nJÁ!', font: 'anton', size: s, color: DARK, rot: -4, x: 0.5, y: 0.5, animIn: 'palavras-mola' }),
        ];
      },
    },
    {
      id: 'balao-preco', label: 'Balão de preço', dur: 3.5,
      build: (c) => {
        const d = c.sz(0.17);
        const sp = +(d * 0.26).toFixed(4);
        return [
          tail(c, { x: 0.5 - (d * 0.33) / c.ar, y: 0.5 - d * 0.33, s: d * 0.28, color: '#0A84FF', animIn: 'zoom' }),
          circle(c, { x: 0.5, y: 0.5, d, color: '#0A84FF', animIn: 'zoom' }),
          T({ at: 0.15, text: 'OFERTA', font: 'inter', size: +(d * 0.1).toFixed(4), color: '#FFFFFF', tracking: 150, x: 0.5, y: 0.5 - d * 0.2, animIn: 'fade' }),
          T({ at: 0.25, text: 'R$ 9,99', font: 'anton', size: fitSize('R$ 9,99', sp, 'anton', c.ar, (d * 0.86) / c.ar), color: '#FFFFFF', x: 0.5, y: 0.5 + d * 0.06, animIn: 'pop' }),
        ];
      },
    },
    {
      id: 'selo-mega-promo', label: 'Mega promoção', dur: 4,
      build: (c) => {
        const s1 = c.fit('Mega', c.sz(0.09), 'rubik', 0.6);
        const s2 = c.fit('Promo', c.sz(0.13), 'rubik', 0.8);
        const st = +(s1 * 0.5).toFixed(4);
        const tw = textWidth('-30%', st, 'archivo', c.ar) + (st * 1.2) / c.ar;
        return [
          T({ text: 'Mega', font: 'rubik', size: s1, color: RED, stroke: true, strokeColor: '#FFFFFF', strokeW: 0.005, rot: -8, x: 0.5 - 0.04, y: 0.5 - s2 * 0.55, animIn: 'letras-mola' }),
          T({ at: 0.2, text: 'Promo', font: 'rubik', size: s2, color: RED, stroke: true, strokeColor: '#FFFFFF', strokeW: 0.005, rot: -8, x: 0.5, y: 0.5 + s2 * 0.25, animIn: 'letras-mola' }),
          S({ at: 0.55, x: Math.min(0.97 - tw / 2, 0.5 + textWidth('Promo', s2, 'rubik', c.ar) * 0.3), y: 0.5 + s2 * 0.95, w: tw, h: st * 1.6, color: '#FDE047', radius: 0.2, rot: -12, animIn: 'zoom' }),
          T({ at: 0.65, text: '-30%', font: 'archivo', size: st, color: RED, rot: -12, x: Math.min(0.97 - tw / 2, 0.5 + textWidth('Promo', s2, 'rubik', c.ar) * 0.3), y: 0.5 + s2 * 0.95, animIn: 'pop' }),
        ];
      },
    },
    {
      id: 'selo-desconto', label: 'Desconto em destaque', dur: 4,
      build: (c) => {
        const big = c.sz(0.16);
        const nw = textWidth('30', big, 'bebas', c.ar);
        const sm = +(big * 0.26).toFixed(4);
        const xr = 0.5 + nw / 2 + 0.01;
        return [
          T({ text: '30', font: 'bebas', size: big, color: YEL, x: 0.5 - 0.03, y: 0.5, count: true, animIn: 'zoom' }),
          T({ at: 0.3, text: '%', font: 'archivo', size: sm, color: PINK, x: xr - 0.03 + textWidth('%', sm, 'archivo', c.ar) / 2, y: 0.5 - big * 0.28, animIn: 'pop' }),
          T({ at: 0.45, text: 'OFF', font: 'archivo', size: sm, color: PINK, x: xr - 0.03 + textWidth('OFF', sm, 'archivo', c.ar) / 2, y: 0.5 + big * 0.22, animIn: 'letras-deslizar' }),
        ];
      },
    },
    {
      id: 'barra-inscrever', label: 'Barra Inscrever-se', dur: 4,
      build: (c) => {
        const s = c.sz(0.022);
        const W = c.land ? 0.42 : 0.84;
        const h = s * 2.6;
        const pw = textWidth('Inscrever-se', s, 'poppins', c.ar) + (s * 1.6) / c.ar;
        const x0 = 0.5 - W / 2;
        const px = x0 + 0.012 + pw / 2;
        const rest = W - (px + pw / 2 - x0) - 0.012;
        const xc = px + pw / 2 + rest * 0.3;
        const xs = px + pw / 2 + rest * 0.72;
        const y = c.land ? 0.82 : 0.75;
        return [
          S({ x: 0.5, y, w: W, h, color: '#FFFFFF', radius: 1, reveal: 'center' }),
          S({ at: 0.25, x: px, y, w: pw, h: h * 0.72, color: '#E5E7EB', radius: 1, animIn: 'zoom', animOut: 'none', end: 1.5 }),
          T({ at: 0.3, text: 'Inscrever-se', font: 'poppins', size: s, color: DARK, x: px, y, animIn: 'fade', animOut: 'none', end: 1.5 }),
          S({ at: 1.5, x: px, y, w: pw, h: h * 0.72, color: '#E11D2E', radius: 1, animIn: 'none' }),
          T({ at: 1.5, text: 'Inscrito', font: 'poppins', size: s, color: '#FFFFFF', x: px, y, animIn: 'pop' }),
          T({ at: 0.4, text: 'Curtir', font: 'poppins', size: s, color: DARK, x: xc, y, animIn: 'fade' }),
          T({ at: 0.5, text: 'Compartilhar', font: 'poppins', size: fitSize('Compartilhar', s, 'poppins', c.ar, rest * 0.5), color: DARK, x: xs, y, animIn: 'fade' }),
        ];
      },
    },
    {
      id: 'nome-divisor', label: 'Nome com divisor', dur: 5,
      build: (c) => {
        const xd = c.land ? 0.5 : 0.56;
        const sn = c.fit('OLIVEIRA', c.sz(0.05), 'archivo', xd - 0.1);
        const sr = +(sn * 0.36).toFixed(4);
        const y = c.land ? 0.8 : 0.78;
        const nameW = (t) => textWidth(t, sn, 'archivo', c.ar);
        const roleW = (t) => textWidth(t, sr, 'poppins', c.ar);
        return [
          S({ x: xd, y, w: 0.003 * (c.land ? 1 : 1.8), h: sn * 2.3, color: '#FFFFFF', reveal: 'up' }),
          T({ at: 0.15, text: 'MARIA', font: 'archivo', italic: true, size: sn, color: '#D9F99D', x: xd - 0.02 - nameW('MARIA') / 2, y: y - sn * 0.52, animIn: 'letras-deslizar' }),
          T({ at: 0.3, text: 'OLIVEIRA', font: 'archivo', italic: true, size: sn, color: '#FFFFFF', x: xd - 0.02 - nameW('OLIVEIRA') / 2, y: y + sn * 0.52, animIn: 'letras-deslizar' }),
          T({ at: 0.45, text: 'Consultora\nfinanceira', font: 'poppins', size: sr, color: '#FFFFFF', align: 'left', x: xd + 0.02 + roleW('Consultora\nfinanceira') / 2, y: y - sn * 0.35, animIn: 'palavras-subir' }),
          T({ at: 0.6, text: 'Sua Empresa', font: 'poppins', size: sr, color: '#84CC16', x: xd + 0.02 + roleW('Sua Empresa') / 2, y: y + sn * 0.65, animIn: 'fade' }),
        ];
      },
    },
    {
      id: 'nome-sobrenome', label: 'Nome e sobrenome', dur: 5,
      build: (c) => {
        const big = c.fit('OLIVEIRA', c.sz(0.065), 'archivo', 0.8);
        const w = textWidth('OLIVEIRA', big, 'archivo', c.ar);
        const sm = +(big * 0.42).toFixed(4);
        const cap = +(big * 0.22).toFixed(4);
        const y = c.land ? 0.8 : 0.78;
        return [
          T({ text: 'ANA', font: 'inter', size: sm, color: PINK, x: 0.5 - w / 2 + textWidth('ANA', sm, 'inter', c.ar) / 2, y: y - big * 0.72, animIn: 'letras-subir' }),
          T({ at: 0.15, text: 'OLIVEIRA', font: 'archivo', size: big, color: '#FFFFFF', x: 0.5, y, animIn: 'letras-subir' }),
          T({ at: 0.45, text: 'ESCOLA DE DESIGN', font: 'inter', size: cap, color: '#FFFFFF', tracking: 100, x: 0.5 + w / 2 - textWidth('ESCOLA DE DESIGN', cap, 'inter', c.ar, 100) / 2, y: y + big * 0.68, animIn: 'fade' }),
        ];
      },
    },
    {
      id: 'selo-circulo', label: 'Selo redondo', dur: 4,
      build: (c) => {
        const d = c.sz(0.13);
        return [
          circle(c, { x: 0.5 + (d * 0.1) / c.ar, y: 0.5 + d * 0.08, d, color: '#FFFFFF', animIn: 'zoom' }),
          circle(c, { at: 0.1, x: 0.5, y: 0.5, d, color: YEL, animIn: 'zoom' }),
          T({ at: 0.25, text: 'VÍDEO\nNOVO\nHOJE', font: 'archivo', size: +(d * 0.15).toFixed(4), color: DARK, x: 0.5, y: 0.5, animIn: 'palavras-subir' }),
        ];
      },
    },
    {
      id: 'selo-inclinado', label: 'Selo inclinado', dur: 4,
      build: (c) => {
        const s = c.fit('DESIGN', c.sz(0.05), 'archivo', 0.6);
        const w = textWidth('DESIGN', s, 'archivo', c.ar) + (s * 1.6) / c.ar;
        const h = s * 2.6;
        return [
          S({ x: 0.5, y: 0.5, w, h, fill: false, stroke: true, strokeColor: YEL, strokeW: 0.003, radius: 0.25, rot: -8, animIn: 'zoom' }),
          T({ at: 0.15, text: 'EXCLUSIVO', font: 'archivo', italic: true, size: +(s * 0.45).toFixed(4), color: '#FFFFFF', rot: -8, x: 0.5, y: 0.5 - s * 0.62, animIn: 'fade' }),
          T({ at: 0.25, text: 'DESIGN', font: 'archivo', italic: true, size: s, color: '#FFFFFF', rot: -8, x: 0.5, y: 0.5 + s * 0.12, animIn: 'letras-mola' }),
          S({ at: 0.5, x: 0.5 + 0.006, y: 0.5 + s * 0.85, w: w * 0.5, h: s * 0.28, color: YEL, rot: -8, reveal: 'center' }),
        ];
      },
    },
    {
      id: 'cupom', label: 'Cupom digitando', dur: 4,
      build: (c) => {
        const text = 'Cupom: RISE10_';
        const size = c.fit(text, c.sz(0.045), 'inter', 0.8);
        return [T({ text, font: 'inter', size, color: '#FFFFFF', bg: true, bgColor: '#0B0F1A', bgOpacity: 0.9, bgMode: 'block', pad: 0.45, radius: 0.2, x: 0.5, y: 0.5, animIn: 'typewriter' })];
      },
    },
  ];

  const fonts = [
    { id: 'fa-serifa-italica', label: 'Serifa itálica', font: 'playfair', italic: true, animIn: 'palavras-desfoque-subir', color: '#FFFFFF', text: 'Seu texto aqui' },
    { id: 'fa-brilho-azul', label: 'Brilho azul', font: 'rubik', animIn: 'letras-impacto', color: '#E0FBFF', shadow: true, shadowColor: CYAN, shadowOpacity: 1, shadowDist: 0, shadowBlur: 0.012 },
    { id: 'fa-condensada-amarela', label: 'Condensada amarela', font: 'bebas', animIn: 'letras-subir', color: YEL, tracking: 40 },
    { id: 'fa-forte-inclinada', label: 'Forte itálica', font: 'archivo', italic: true, animIn: 'letras-deslizar', color: '#FFFFFF' },
  ];

  return { titles, components, fonts };
}
