import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTION_FONT_FILES } from '../../../shared/captionStyle.js';

/**
 * Medidas das fontes empacotadas, lidas dos próprios arquivos .ttf, para o render (libass)
 * sair igual à prévia (navegador):
 *  - `cell`: no ASS o "tamanho da fonte" é a altura da célula (winAscent + winDescent),
 *    não o "em" do CSS. Ex.: Poppins tem célula de 1,76 em — com o mesmo número, a letra
 *    do vídeo final saía com 57% do tamanho da prévia. Tamanho ASS = em × cell.
 *  - `dy`: a linha de base fica em lugares diferentes no CSS (centra a altura hhea na
 *    linha) e no libass (centra a célula win): diferença em em, para corrigir a posição.
 *  - `width(texto)`: largura do texto em em (avanço de cada letra), para desenhar caixas,
 *    marca-texto e sublinhado do tamanho exato do texto.
 */
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

function parse(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt16BE(4);
  const t = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    t[b.toString('ascii', o, o + 4)] = b.readUInt32BE(o + 8);
  }
  const upem = b.readUInt16BE(t.head + 18);
  const os2 = t['OS/2'];
  const winA = b.readUInt16BE(os2 + 74) / upem;
  const winD = b.readUInt16BE(os2 + 76) / upem;
  const avg = b.readInt16BE(os2 + 2) / upem;
  const hA = b.readInt16BE(t.hhea + 4) / upem;
  const hD = -b.readInt16BE(t.hhea + 6) / upem;
  const numH = b.readUInt16BE(t.hhea + 34);
  const adv = (g) => b.readUInt16BE(t.hmtx + 4 * Math.min(g, numH - 1)) / upem;

  // cmap: formato 12 (Unicode completo) ou 4 (BMP)
  const glyph = new Map();
  const cm = t.cmap;
  const nSub = b.readUInt16BE(cm + 2);
  let best = null;
  for (let i = 0; i < nSub; i++) {
    const pid = b.readUInt16BE(cm + 4 + i * 8);
    const eid = b.readUInt16BE(cm + 6 + i * 8);
    const off = cm + b.readUInt32BE(cm + 8 + i * 8);
    const fmt = b.readUInt16BE(off);
    if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) {
      if (fmt === 12 || (fmt === 4 && !best)) best = { off, fmt };
    }
  }
  if (best?.fmt === 4) {
    const o = best.off;
    const segX2 = b.readUInt16BE(o + 6);
    const ends = o + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = b.readUInt16BE(ends + 2 * s);
      const start = b.readUInt16BE(starts + 2 * s);
      const delta = b.readInt16BE(deltas + 2 * s);
      const ro = b.readUInt16BE(ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          g = b.readUInt16BE(ranges + 2 * s + ro + 2 * (c - start));
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) glyph.set(c, g);
      }
    }
  } else if (best?.fmt === 12) {
    const o = best.off;
    const groups = b.readUInt32BE(o + 12);
    for (let i = 0; i < groups; i++) {
      const go = o + 16 + i * 12;
      const s = b.readUInt32BE(go);
      const e = b.readUInt32BE(go + 4);
      const g0 = b.readUInt32BE(go + 8);
      for (let c = s; c <= e && c - s < 70000; c++) glyph.set(c, g0 + (c - s));
    }
  }
  return {
    cell: winA + winD,
    // linha de base abaixo do centro da linha: no CSS (centra a altura hhea) e no libass
    // (centra a célula win), em em
    cssBase: (hA - hD) / 2,
    assBase: (winA - winD) / 2,
    dy: (hA - hD) / 2 - (winA - winD) / 2,
    width(text) {
      let w = 0;
      for (const ch of String(text)) {
        const g = glyph.get(ch.codePointAt(0));
        w += g != null ? adv(g) : avg;
      }
      return w;
    },
  };
}

const cache = new Map();
const FALLBACK = { cell: 1.4, cssBase: 0.25, assBase: 0.25, dy: 0, width: (t) => String(t).length * 0.58 };

/** Medidas da fonte pela família (nome interno). */
export function fontMetrics(family) {
  if (cache.has(family)) return cache.get(family);
  const f = CAPTION_FONT_FILES.find((x) => x.family === family);
  let m = FALLBACK;
  if (f) {
    try {
      m = parse(path.join(FONTS_DIR, f.file));
    } catch {
      m = FALLBACK;
    }
  }
  cache.set(family, m);
  return m;
}

/** Medidas de um arquivo de fonte qualquer (fonte própria do usuário). */
export function fontMetricsFile(file) {
  const key = `file:${file}`;
  if (cache.has(key)) return cache.get(key);
  let m = FALLBACK;
  try {
    m = parse(file);
  } catch {
    m = FALLBACK;
  }
  cache.set(key, m);
  return m;
}
