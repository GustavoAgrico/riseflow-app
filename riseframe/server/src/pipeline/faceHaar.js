// Detector de rosto em JavaScript puro (Viola–Jones / Haar), sem Python nem OpenCV.
//
// O enquadramento pelo rosto (tela dividida, reframe) usa o track_subject.py (OpenCV). No app
// de PC, sem Python/OpenCV instalados, ele não rodava e a metade da pessoa caía num chute que
// cortava a cabeça. Este módulo é a reserva: lê o MESMO classificador do OpenCV
// (haar/haarcascade_frontalface_default.xml, licença Intel/BSD no cabeçalho) e repete a conta
// do CascadeClassifier.detectMultiScale + groupRectangles do OpenCV 4.
//
// Os quadros vêm do ffmpeg (que o app já tem) em tons de cinza (PGM).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath, probe } from './ffmpeg.js';
import { trackChild } from '../jobContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASCADE_FILE = path.join(__dirname, 'haar', 'haarcascade_frontalface_default.xml');

let cascade = null;

/** Lê o classificador (stumps HAAR, formato novo do OpenCV). Memoizado. */
export function loadCascade(file = CASCADE_FILE) {
  if (cascade && file === CASCADE_FILE) return cascade;
  const xml = fs.readFileSync(file, 'utf8');
  const num = (tag, s) => Number((s.match(new RegExp(`<${tag}>\\s*([^<]+)</${tag}>`)) || [])[1]);
  const W = num('width', xml);
  const H = num('height', xml);
  const stagesXml = xml.slice(xml.indexOf('<stages>'), xml.indexOf('</stages>'));
  const featXml = xml.slice(xml.indexOf('<features>'), xml.indexOf('</features>'));
  // cada estágio começa com <maxWeakCount>; os nós ficam em ordem dentro dele
  const stages = stagesXml.split('<maxWeakCount>').slice(1).map((chunk) => {
    const thr = num('stageThreshold', chunk) - 1e-5; // THRESHOLD_EPS do OpenCV
    const nodes = [...chunk.matchAll(/<internalNodes>\s*([^<]+)<\/internalNodes>\s*<leafValues>\s*([^<]+)<\/leafValues>/g)].map((m) => {
      const n = m[1].trim().split(/\s+/).map(Number);
      const l = m[2].trim().split(/\s+/).map(Number);
      if (n.length !== 4) throw new Error('classificador não suportado (só stumps)');
      return { f: n[2], thr: n[3], a: l[0], b: l[1] };
    });
    return { thr, nodes };
  });
  const features = [...featXml.matchAll(/<rects>([\s\S]*?)<\/rects>/g)].map((m) =>
    [...m[1].matchAll(/<_>\s*([^<]+)<\/_>/g)].map((r) => r[1].trim().split(/\s+/).map(Number)));
  if (!(W > 0 && H > 0) || !stages.length || !features.length) throw new Error('classificador inválido');
  const c = { W, H, stages, features };
  if (file === CASCADE_FILE) cascade = c;
  return c;
}

/** Equalização de histograma (cv2.equalizeHist). */
export function equalizeHist(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let i0 = 0;
  while (i0 < 256 && !hist[i0]) i0++;
  const total = gray.length;
  if (i0 === 256 || hist[i0] === total) return gray.slice();
  const scale = 255 / (total - hist[i0]);
  const lut = new Uint8Array(256);
  let sum = 0;
  for (let i = i0 + 1; i < 256; i++) {
    sum += hist[i];
    lut[i] = Math.min(255, Math.max(0, Math.round(sum * scale)));
  }
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]];
  return out;
}

/** Redimensiona (bilinear, centro do pixel — como o INTER_LINEAR do OpenCV). */
function resize(gray, W, H, w, h) {
  if (w === W && h === H) return gray;
  const out = new Uint8Array(w * h);
  const sx = W / w;
  const sy = H / h;
  for (let y = 0; y < h; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    let y0 = Math.floor(fy);
    if (y0 > H - 1) y0 = H - 1;
    const y1 = Math.min(H - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      let fx = (x + 0.5) * sx - 0.5;
      if (fx < 0) fx = 0;
      let x0 = Math.floor(fx);
      if (x0 > W - 1) x0 = W - 1;
      const x1 = Math.min(W - 1, x0 + 1);
      const wx = fx - x0;
      const top = gray[y0 * W + x0] * (1 - wx) + gray[y0 * W + x1] * wx;
      const bot = gray[y1 * W + x0] * (1 - wx) + gray[y1 * W + x1] * wx;
      out[y * w + x] = Math.round(top * (1 - wy) + bot * wy);
    }
  }
  return out;
}

/** Imagens integrais (soma e soma dos quadrados), com uma linha/coluna de zeros. */
function integrals(img, w, h) {
  const s = new Float64Array((w + 1) * (h + 1));
  const q = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 1; x <= w; x++) {
      const v = img[(y - 1) * w + (x - 1)];
      rs += v;
      rq += v * v;
      const i = y * (w + 1) + x;
      s[i] = s[i - (w + 1)] + rs;
      q[i] = q[i - (w + 1)] + rq;
    }
  }
  return { s, q };
}

/** Agrupa as janelas (cv::groupRectangles com eps 0,2). */
export function groupRectangles(rects, minNeighbors = 5, eps = 0.2) {
  const n = rects.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const similar = (a, b) => {
    const d = eps * (Math.min(a[2], b[2]) + Math.min(a[3], b[3])) * 0.5;
    return Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d
      && Math.abs(a[0] + a[2] - b[0] - b[2]) <= d && Math.abs(a[1] + a[3] - b[1] - b[3]) <= d;
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (similar(rects[i], rects[j])) parent[find(i)] = find(j);
  const cls = new Map();
  for (let i = 0; i < n; i++) {
    const k = find(i);
    const c = cls.get(k) || { r: [0, 0, 0, 0], n: 0 };
    for (let t = 0; t < 4; t++) c.r[t] += rects[i][t];
    c.n++;
    cls.set(k, c);
  }
  const avg = [...cls.values()].map((c) => ({ r: c.r.map((v) => Math.round(v / c.n)), n: c.n }));
  const out = [];
  for (const a of avg) {
    if (a.n <= minNeighbors) continue;
    // descarta janela pequena dentro de uma maior mais confiável
    const inside = avg.some((b) => {
      if (b === a || b.n <= minNeighbors) return false;
      const dx = Math.round(b.r[2] * eps);
      const dy = Math.round(b.r[3] * eps);
      return a.r[0] >= b.r[0] - dx && a.r[1] >= b.r[1] - dy && a.r[0] + a.r[2] <= b.r[0] + b.r[2] + dx
        && a.r[1] + a.r[3] <= b.r[1] + b.r[3] + dy && (b.n > Math.max(3, a.n) || a.n < 3);
    });
    if (!inside) out.push(a.r);
  }
  return out;
}

/**
 * Rostos numa imagem em cinza (cv2.CascadeClassifier.detectMultiScale).
 * @returns {Array<[number,number,number,number]>} [x, y, w, h] em pixels
 */
export function detectMultiScale(gray, W, H, { scaleFactor = 1.1, minNeighbors = 5, minSize = 0, cascade: c = loadCascade() } = {}) {
  const cw = c.W;
  const ch = c.H;
  const area = (cw - 2) * (ch - 2); // retângulo de normalização (1,1,W-2,H-2)
  const raw = [];
  for (let factor = 1; ; factor *= scaleFactor) {
    const winW = Math.round(cw * factor);
    const winH = Math.round(ch * factor);
    const w = Math.round(W / factor);
    const h = Math.round(H / factor);
    if (w < cw || h < ch || winW > W || winH > H) break;
    if (winW < minSize || winH < minSize) continue;
    const img = resize(gray, W, H, w, h);
    const { s, q } = integrals(img, w, h);
    const stride = w + 1;
    const step = factor > 2 ? 1 : 2;
    // retângulos das características já em deslocamentos da integral desta escala
    const feats = c.features.map((rs) => rs.map(([x, y, rw, rh, wt]) => [y * stride + x, y * stride + x + rw, (y + rh) * stride + x, (y + rh) * stride + x + rw, wt]));
    const n0 = stride + 1;
    const n1 = stride + 1 + (cw - 2);
    const n2 = (ch - 1) * stride + 1;
    const n3 = (ch - 1) * stride + 1 + (cw - 2);
    for (let y = 0; y + ch <= h; y += step) {
      for (let x = 0; x + cw <= w; x += step) {
        const p = y * stride + x;
        const vs = s[p + n0] - s[p + n1] - s[p + n2] + s[p + n3];
        const vq = q[p + n0] - q[p + n1] - q[p + n2] + q[p + n3];
        let nf = area * vq - vs * vs;
        if (!(nf > 0)) continue;
        nf = Math.sqrt(nf);
        if (area / nf >= 0.1) continue; // janela lisa (sem variação): o OpenCV também pula
        const inv = 1 / nf;
        let stage = 0;
        for (; stage < c.stages.length; stage++) {
          const st = c.stages[stage];
          let sum = 0;
          for (const node of st.nodes) {
            let v = 0;
            for (const r of feats[node.f]) v += (s[p + r[0]] - s[p + r[1]] - s[p + r[2]] + s[p + r[3]]) * r[4];
            sum += v * inv < node.thr ? node.a : node.b;
          }
          if (sum < st.thr) break;
        }
        if (stage === c.stages.length) raw.push([Math.round(x * factor), Math.round(y * factor), winW, winH]);
        else if (stage === 0) x += step; // como o OpenCV: falhou no 1º estágio, pula uma janela
      }
    }
  }
  return groupRectangles(raw, minNeighbors);
}

/** Lê uma sequência de PGM (P5) do ffmpeg. */
export function parsePgmStream(buf) {
  const frames = [];
  let i = 0;
  const token = () => {
    for (;;) {
      while (i < buf.length && /\s/.test(String.fromCharCode(buf[i]))) i++;
      if (buf[i] === 0x23) { while (i < buf.length && buf[i] !== 0x0a) i++; continue; } // comentário
      break;
    }
    let t = '';
    while (i < buf.length && !/\s/.test(String.fromCharCode(buf[i]))) t += String.fromCharCode(buf[i++]);
    return t;
  };
  while (i < buf.length) {
    if (token() !== 'P5') break;
    const w = Number(token());
    const h = Number(token());
    const max = Number(token());
    i++; // um espaço depois do maxval
    if (!(w > 0 && h > 0) || max > 255 || i + w * h > buf.length) break;
    frames.push({ w, h, gray: new Uint8Array(buf.buffer, buf.byteOffset + i, w * h) });
    i += w * h;
  }
  return frames;
}

function grabFrames(input, { fps, width, maxFrames, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-i', input, '-an', '-sn',
      '-vf', `${fps ? `fps=${fps},` : ''}scale=${width}:-2:flags=area,format=gray`,
      '-frames:v', String(maxFrames), '-f', 'image2pipe', '-c:v', 'pgm', '-'];
    const proc = trackChild(spawn(ffmpegPath, args));
    const chunks = [];
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const frames = parsePgmStream(Buffer.concat(chunks));
      if (!frames.length) return reject(new Error(err.trim().split('\n').pop() || `ffmpeg code ${code}`));
      resolve(frames);
    });
  });
}

/** Rostos de um quadro: os 3 maiores, sem os minúsculos perto de um grande (como o tracker). */
function facesOf(frame, opts = {}) {
  const { w, h } = frame;
  const gray = opts.equalize ? equalizeHist(frame.gray) : frame.gray;
  // mínimo como nos scripts Python: 3,5% da largura (vídeo) ou 6% do lado menor (imagem)
  const minSide = Math.max(20, Math.floor((opts.minOfSides ? Math.min(w, h) : w) * (opts.minFrac ?? 0.035)));
  const found = detectMultiScale(gray, w, h, { scaleFactor: opts.scaleFactor ?? 1.12, minNeighbors: 5, minSize: minSide })
    .sort((a, b) => b[2] * b[3] - a[2] * a[3]);
  const out = [];
  for (const f of found) {
    if (out.length >= 3) break;
    if (out.length && f[2] * f[3] < out[0]._a * 0.12) continue;
    out.push({ _a: f[2] * f[3], x: f[0], y: f[1], w: f[2], h: f[3] });
  }
  return out.map(({ x, y, w: fw, h: fh }) => ({ x, y, w: fw, h: fh }));
}

/**
 * Rastreamento simples (só rosto) no formato do track_subject.py: { points, samples }.
 * Amostra até `maxFrames` quadros espalhados pelo vídeo.
 */
export async function trackFacesJs(input, { maxFrames = 24, width = 480, timeoutMs = 120000 } = {}) {
  let duration = 0;
  try {
    const p = await probe(input);
    duration = Number(p?.format?.duration) || 0;
  } catch { /* sem duração: amostra do começo */ }
  const fps = duration > 0 ? Math.min(2, maxFrames / duration) : 1;
  const frames = await grabFrames(input, { fps: +fps.toFixed(4), width, maxFrames, timeoutMs });
  const points = [];
  const samples = [];
  frames.forEach((fr, k) => {
    const t = +(k / fps).toFixed(3);
    const faces = facesOf(fr).map((f) => ({
      x: +((f.x + f.w / 2) / fr.w).toFixed(4), y: +((f.y + f.h / 2) / fr.h).toFixed(4),
      w: +(f.w / fr.w).toFixed(4), h: +(f.h / fr.h).toFixed(4), act: 0,
    }));
    samples.push({ t, faces });
    if (faces.length) points.push({ t, x: faces[0].x, y: faces[0].y, src: 'face' });
  });
  return { inW: frames[0].w, inH: frames[0].h, duration, points, samples, engine: 'js' };
}

/**
 * Rostos de uma imagem (ou do quadro em `at` s de um vídeo) — formato do broll_faces.py:
 * { aspect, faces: [{x, y, w, h}] } com x/y do canto de cima, normalizados.
 */
export async function detectFacesJs(file, { at = 0.5, timeoutMs = 20000 } = {}) {
  const grab = (ss) => new Promise((resolve, reject) => {
    const args = ['-v', 'error', ...(ss > 0 ? ['-ss', String(ss)] : []), '-i', file, '-frames:v', '1',
      '-vf', "scale='if(gt(iw,ih),min(640,iw),-2)':'if(gt(iw,ih),-2,min(640,ih))':flags=area,format=gray", '-f', 'image2pipe', '-c:v', 'pgm', '-'];
    const proc = trackChild(spawn(ffmpegPath, args));
    const chunks = [];
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', () => { clearTimeout(timer); resolve(parsePgmStream(Buffer.concat(chunks))[0] || null); });
  });
  const fr = (await grab(at)) || (at > 0 ? await grab(0) : null);
  if (!fr) return null;
  const faces = facesOf(fr, { equalize: true, minFrac: 0.06, minOfSides: true, scaleFactor: 1.1 });
  return {
    aspect: +(fr.w / fr.h).toFixed(5),
    faces: faces.map((f) => ({ x: +(f.x / fr.w).toFixed(4), y: +(f.y / fr.h).toFixed(4), w: +(f.w / fr.w).toFixed(4), h: +(f.h / fr.h).toFixed(4) })),
  };
}
