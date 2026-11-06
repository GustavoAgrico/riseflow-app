// Análise de vídeos de REFERÊNCIA (Meu fluxo → Referências): mede o jeito de editar que a
// pessoa gosta — ritmo de corte, movimento na tela e câmera (zoom, punch, aproximação
// lenta e a curva de cada movimento) — para virar o perfil de estilo dela.
//
// Mede o JEITO DE MOVER, nunca copia o desenho. FFmpeg sempre (cortes + atividade);
// OpenCV quando houver (câmera). Sem OpenCV, a câmera fica de fora com elegância.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFfmpeg, probeSummary } from './ffmpeg.js';
import { resolvePython } from './python.js';
import { easeValue } from '../../../shared/easing.js';
import { makeLogger } from '../logger.js';

const log = makeLogger('refs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Amostras por segundo usadas nas medidas (fixas: os números ficam comparáveis). */
export const SCENE_FPS = 15;
export const CAMERA_FPS = 15;
/** Limite de cada referência: trechos curtos (5–30 s) são o ideal; acima disso, só o começo. */
export const MAX_REF_SECONDS = 90;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Lê o arquivo do filtro `metadata=print` do FFmpeg.
 * @returns {Array<{t:number, score:number}>}
 */
export function parseSceneScores(text) {
  const out = [];
  let t = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/pts_time:([0-9.eE+-]+)/);
    if (m) {
      t = Number(m[1]);
      continue;
    }
    const s = line.match(/lavfi\.scene_score=([0-9.eE+-]+)/);
    if (s && Number.isFinite(t)) out.push({ t, score: Number(s[1]) });
  }
  return out;
}

/**
 * Cortes de cena e quanto a tela se mexe.
 * - cortes: quadros com score de cena acima do limiar (com folga mínima entre eles);
 * - atividade: média do score nos quadros que NÃO são corte (0 = parado).
 */
export function sceneStats(scores, duration, { threshold = 0.3, minGap = 0.25 } = {}) {
  const dur = Number(duration) > 0 ? Number(duration) : scores.length ? scores[scores.length - 1].t : 0;
  const cuts = [];
  let still = 0;
  let stillN = 0;
  for (const { t, score } of scores) {
    if (score >= threshold && t > 0.05) {
      if (!cuts.length || t - cuts[cuts.length - 1] >= minGap) cuts.push(r3(t));
    } else if (Number.isFinite(score)) {
      still += score;
      stillN++;
    }
  }
  const shots = cuts.length + 1;
  return {
    cuts,
    shots,
    avgShot: dur > 0 ? r2(dur / shots) : null,
    cutsPerMin: dur > 0 ? r2((cuts.length / dur) * 60) : null,
    activity: stillN ? Math.round((still / stillN) * 10000) / 10000 : 0,
  };
}

const CURVES = ['linear', 'out', 'inout', 'back'];

/** Curva (das do app) mais parecida com o progresso medido de um movimento. */
export function closestCurve(progress) {
  if (!Array.isArray(progress) || progress.length < 3) return null;
  let best = null;
  for (const id of CURVES) {
    let err = 0;
    progress.forEach((v, k) => {
      const p = (k + 1) / progress.length;
      err += (v - easeValue(id, p)) ** 2;
    });
    if (!best || err < best.err) best = { id, err };
  }
  return best.id;
}

/**
 * Câmera a partir das amostras do ref_camera.py (escala/deslocamento entre amostras).
 * - punch: zoom rápido (≥ 4% em até 0,6 s), inclusive o punch "de corte" (um salto só);
 * - aproximação lenta: zoom contínuo por ≥ 1,2 s;
 * - movingFraction: parte do tempo em que a câmera se mexe (zoom ou pan ≥ 3%/s).
 */
export function cameraStats(samples, fps = CAMERA_FPS, { duration } = {}) {
  const list = (Array.isArray(samples) ? samples : []).filter((x) => x && Number.isFinite(x.s));
  const ok = list.filter((x) => x.ok);
  if (ok.length < 4 || ok.length < list.length * 0.3) return { available: false };
  const f = Math.max(1, Number(fps) || CAMERA_FPS);
  const z = list.map((x) => (x.ok ? Math.log(x.s) : 0));
  const pan = list.map((x) => (x.ok ? Math.hypot(x.tx || 0, x.ty || 0) : 0));
  const moving = ok.filter((x) => Math.abs(Math.log(x.s)) * f > 0.03 || Math.hypot(x.tx || 0, x.ty || 0) * f > 0.03).length;

  // movimentos de zoom: amostras seguidas no mesmo sentido acima do mínimo
  const ZMIN = 0.02 / f; // 2%/s
  const events = [];
  let cur = null;
  z.forEach((v, i) => {
    const sign = Math.sign(v);
    if (list[i].ok && Math.abs(v) >= ZMIN && (!cur || cur.sign === sign)) {
      if (!cur) cur = { sign, from: i, vals: [] };
      cur.vals.push(v);
    } else {
      if (cur) events.push(cur);
      cur = list[i].ok && Math.abs(v) >= ZMIN ? { sign, from: i, vals: [v] } : null;
    }
  });
  if (cur) events.push(cur);

  const punches = [];
  const pushes = [];
  for (const e of events) {
    const total = e.vals.reduce((a, b) => a + b, 0);
    const dur = e.vals.length / f;
    if (Math.abs(total) >= 0.04 && dur <= 0.6) punches.push({ total, dur, vals: e.vals });
    else if (Math.abs(total) >= 0.03 && dur >= 1.2) pushes.push({ total, dur, vals: e.vals });
  }
  const span = Number(duration) > 0 ? Number(duration) : list.length / f;
  const perMin = (n) => (span > 0 ? r2((n / span) * 60) : 0);
  const med = (xs) => {
    const v = [...xs].sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  // curva: só nos movimentos com amostras suficientes para ver a forma
  const curveVotes = {};
  for (const e of [...punches, ...pushes]) {
    if (e.vals.length < 3) continue;
    let acc = 0;
    const prog = e.vals.map((v) => (acc += v) / e.total);
    const c = closestCurve(prog);
    if (c) curveVotes[c] = (curveVotes[c] || 0) + 1;
  }
  const curve = Object.entries(curveVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const punchZoom = punches.length ? Math.exp(med(punches.map((p) => Math.abs(p.total)))) - 1 : 0;
  return {
    available: true,
    movingFraction: r2(moving / ok.length),
    punches: punches.length,
    punchesPerMin: perMin(punches.length),
    punchZoom: r3(punchZoom),
    punchSeconds: punches.length ? r2(med(punches.map((p) => p.dur))) : null,
    pushes: pushes.length,
    pushesPerMin: perMin(pushes.length),
    panPerSec: r3((pan.reduce((a, b) => a + b, 0) / Math.max(1, ok.length)) * f),
    curve,
  };
}

function runCameraScript(file, maxSeconds) {
  return resolvePython().then((py) => {
    if (!py) throw new Error('Python não encontrado');
    const script = path.join(__dirname, 'ref_camera.py');
    return new Promise((resolve, reject) => {
      const proc = spawn(py, [script, file, String(CAMERA_FPS), String(maxSeconds)]);
      let out = '';
      let err = '';
      const timer = setTimeout(() => proc.kill('SIGKILL'), 180_000);
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.stderr.on('data', (d) => (err += d.toString()));
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(err.trim().split('\n').pop() || `câmera code ${code}`));
        try {
          resolve(JSON.parse(out));
        } catch (e) {
          reject(new Error(`JSON inválido da câmera: ${e.message}`));
        }
      });
    });
  });
}

/**
 * Mede uma referência. Nunca lança por falta do OpenCV: a câmera vem `available:false`.
 * @returns {Promise<{duration:number, sourceDuration:number, cuts:number[], shots:number,
 *   avgShot:number, cutsPerMin:number, activity:number, camera:object}>}
 */
export async function analyzeReference(input, { maxSeconds = MAX_REF_SECONDS } = {}) {
  const file = path.resolve(input); // o FFmpeg roda dentro da pasta temporária (cwd)
  const meta = await probeSummary(file);
  if (!meta.hasVideo) throw new Error('a referência precisa ter vídeo');
  const span = Math.min(Number(meta.duration) || maxSeconds, maxSeconds);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-ref-'));
  try {
    await runFfmpeg(
      ['-t', String(span), '-i', file, '-an', '-vf', `fps=${SCENE_FPS},scale=320:-2,select='gte(scene,0)',metadata=print:file=scenes.txt`, '-f', 'null', '-'],
      { cwd: dir, label: 'ref-scenes', quiet: true },
    );
    const scores = parseSceneScores(fs.readFileSync(path.join(dir, 'scenes.txt'), 'utf8'));
    const scenes = sceneStats(scores, span);
    let camera = { available: false };
    try {
      const data = await runCameraScript(file, span);
      camera = cameraStats(data.samples, data.fps, { duration: span });
    } catch (err) {
      log.warn(`câmera da referência não medida (${err.message})`);
      camera = { available: false, reason: 'sem OpenCV no servidor' };
    }
    return {
      duration: r2(span),
      sourceDuration: r2(Number(meta.duration) || span),
      width: meta.width,
      height: meta.height,
      ...scenes,
      camera,
    };
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}
