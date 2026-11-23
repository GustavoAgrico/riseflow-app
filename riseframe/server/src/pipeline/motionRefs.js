// Referências de motion: a pessoa guarda numa PASTA vídeos e imagens de motions de que ela
// gosta; o Claude (Opus 5.5, com visão) olha quadros delas e escreve um GUIA DE ESTILO no
// vocabulário do motion do app (cores, fontes, fundos, efeitos, ritmo, câmera, regras). O
// diretor de motion automático e o motion por prompt seguem esse guia.
//
// App de PC: a pasta é <dados do app>/referencias-motion (dá para abrir e soltar arquivos
// nela). Servidor do site: uma subpasta por pessoa.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { remoteAccount } from '../account.js';
import { ffmpegPath, probe } from './ffmpeg.js';
import { askClaude, parseJsonLoose } from './llm.js';
import { makeLogger } from '../logger.js';
import { PM_FONTS, PM_BG, PM_IN, PM_OUT, PM_TRANSITIONS, PM_TYPES } from '../../../shared/promptMotion.js';

const log = makeLogger('motion-refs');
const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VID = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);
export const REFS_FOLDER = 'referencias-motion';

const safe = (s) => String(s || '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'x';

/** Pasta das referências (app de PC: uma só; site: uma por pessoa). */
export function refsDir(userId) {
  const base = path.join(config.paths.data, REFS_FOLDER);
  // app de PC (servidor rodando dentro do Electron, ou ligado à conta do site): a pasta é uma
  // só — a mesma que o botão "Abrir a pasta" abre
  const desktop = process.env.ELECTRON_RUN_AS_NODE === '1' || remoteAccount();
  return desktop || !userId ? base : path.join(base, safe(userId));
}

const kindOf = (name) => {
  const ext = path.extname(name).toLowerCase();
  return IMG.has(ext) ? 'image' : VID.has(ext) ? 'video' : null;
};

/** Arquivos de referência na pasta (imagens e vídeos) e o guia aprendido. */
export async function listRefs(userId) {
  const dir = refsDir(userId);
  await fs.mkdir(dir, { recursive: true });
  const names = await fs.readdir(dir).catch(() => []);
  const files = [];
  for (const name of names) {
    const kind = kindOf(name);
    if (!kind) continue;
    const st = await fs.stat(path.join(dir, name)).catch(() => null);
    if (st?.isFile()) files.push({ name, kind, size: st.size, mtime: st.mtimeMs });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return { dir, files, guide: await loadGuide(userId) };
}

/** Copia um arquivo (enviado pelo app) para a pasta. → nome salvo */
export async function addRef(userId, src, filename) {
  const kind = kindOf(filename || src);
  if (!kind) throw new Error('use imagens (png, jpg, webp, gif) ou vídeos (mp4, mov, webm)');
  const dir = refsDir(userId);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(filename || src).toLowerCase();
  const base = safe(path.basename(filename || src, ext));
  let name = `${base}${ext}`;
  for (let i = 2; fsSync.existsSync(path.join(dir, name)); i++) name = `${base}-${i}${ext}`;
  await fs.copyFile(src, path.join(dir, name));
  return name;
}

export async function removeRef(userId, name) {
  const n = path.basename(String(name || ''));
  if (!kindOf(n)) return false;
  await fs.rm(path.join(refsDir(userId), n), { force: true });
  return true;
}

export async function loadGuide(userId) {
  try {
    return sanitizeGuide(JSON.parse(await fs.readFile(path.join(refsDir(userId), 'guia.json'), 'utf8')));
  } catch {
    return null;
  }
}

const HEX = /^#[0-9a-f]{6}$/i;
const strs = (v, n, max) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max)).filter(Boolean).slice(0, n);
const only = (v, list, n) => [...new Set((Array.isArray(v) ? v : []).filter((x) => list.includes(x)))].slice(0, n);

/** Guia de estilo com só o que o motion do app entende. Puro. */
export function sanitizeGuide(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw.palette && typeof raw.palette === 'object' ? raw.palette : {};
  const palette = Object.fromEntries(['bg', 'bg2', 'text', 'accent', 'accent2', 'muted'].map((k) => [k, HEX.test(String(p[k] || '')) ? p[k] : null]).filter(([, v]) => v));
  const g = {
    summary: String(raw.summary || '').replace(/\s+/g, ' ').trim().slice(0, 600),
    ...(Object.keys(palette).length ? { palette } : {}),
    fonts: only(raw.fonts, Object.keys(PM_FONTS), 2),
    bg: only(raw.bg, PM_BG, 3),
    leak: Boolean(raw.leak),
    grain: Boolean(raw.grain),
    inFx: only(raw.inFx, PM_IN, 6),
    outFx: only(raw.outFx, PM_OUT, 3),
    transitions: only(raw.transitions, PM_TRANSITIONS, 3),
    elements: only(raw.elements, PM_TYPES, 8),
    pace: ['calmo', 'medio', 'rapido'].includes(raw.pace) ? raw.pace : 'medio',
    camera: String(raw.camera || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    layout: String(raw.layout || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    rules: strs(raw.rules, 10, 160),
    avoid: strs(raw.avoid, 6, 160),
    ...(raw.learnedAt ? { learnedAt: String(raw.learnedAt).slice(0, 30) } : {}),
    ...(Array.isArray(raw.from) ? { from: strs(raw.from, 40, 120) } : {}),
  };
  return g.summary || g.rules.length || g.palette ? g : null;
}

/** O guia em texto para o Claude seguir (diretor e motion por prompt). Puro. */
export function guideText(g) {
  if (!g) return '';
  const lines = [
    'GUIA DE ESTILO DO USUÁRIO (aprendido das referências de motion dele — siga, é a identidade visual que ele quer):',
    g.summary,
    g.palette ? `Paleta: ${JSON.stringify(g.palette)}` : '',
    g.fonts?.length ? `Fontes: ${g.fonts.join(', ')}` : '',
    g.bg?.length ? `Fundos: ${g.bg.join(', ')}${g.leak ? ' + leak' : ''}${g.grain ? ' + grain' : ''}` : '',
    g.inFx?.length ? `Entradas preferidas: ${g.inFx.join(', ')}` : '',
    g.outFx?.length ? `Saídas: ${g.outFx.join(', ')}` : '',
    g.transitions?.length ? `Transições: ${g.transitions.join(', ')}` : '',
    g.elements?.length ? `Peças típicas: ${g.elements.join(', ')}` : '',
    `Ritmo: ${g.pace}`,
    g.camera ? `Câmera: ${g.camera}` : '',
    g.layout ? `Composição: ${g.layout}` : '',
    ...(g.rules || []).map((r) => `- ${r}`),
    ...(g.avoid || []).map((r) => `- Evitar: ${r}`),
  ];
  return lines.filter(Boolean).join('\n');
}

function run(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(); else reject(new Error(err.trim().split('\n').pop() || `ffmpeg ${code}`)); });
  });
}

/**
 * Imagens para o Claude olhar: cada imagem (até 640 px) e, de cada vídeo, 3 tiras com 3
 * quadros seguidos (0,12 s entre eles) — dá para ver o MOVIMENTO, não só o visual parado.
 * @returns {Promise<Array<{label:string, data:string}>>} PNG em base64
 */
export async function referenceFrames(dir, files, tmp, maxImages = 18) {
  await fs.mkdir(tmp, { recursive: true });
  const out = [];
  for (const f of files) {
    if (out.length >= maxImages) break;
    const src = path.join(dir, f.name);
    try {
      if (f.kind === 'image') {
        const dst = path.join(tmp, `${out.length}.png`);
        await run(['-v', 'error', '-y', '-i', src, '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", dst]);
        out.push({ label: `Imagem "${f.name}"`, data: (await fs.readFile(dst)).toString('base64') });
      } else {
        const dur = Number((await probe(src).catch(() => null))?.format?.duration) || 6;
        for (const at of [0.18, 0.5, 0.8]) {
          if (out.length >= maxImages) break;
          const dst = path.join(tmp, `${out.length}.png`);
          await run(['-v', 'error', '-y', '-ss', (dur * at).toFixed(2), '-i', src, '-vf', 'fps=8,scale=300:-2,tile=3x1', '-frames:v', '1', dst]);
          out.push({ label: `Vídeo "${f.name}" em ${(dur * at).toFixed(1)} s (3 quadros seguidos, 0,12 s entre eles, da esquerda para a direita)`, data: (await fs.readFile(dst)).toString('base64') });
        }
      }
    } catch (err) {
      log.warn(`referência "${f.name}" não abriu (${err.message})`);
    }
  }
  return out;
}

export function refsSystem() {
  return `Você é um diretor de arte de motion design. Você recebe quadros de referências de motion graphics de que o usuário gosta (imagens e tiras de 3 quadros seguidos de vídeos, para ver o movimento). Escreva um GUIA DE ESTILO para um motor de motion que tem este vocabulário:
- fontes: ${Object.keys(PM_FONTS).join(', ')} (display = condensada alta tipo Anton; heavy = sem serifa pesada; geometric = Montserrat; serif = Playfair itálico; elegant = Playfair fina; italic = Garamond itálico; sporty = Barlow itálica; punchy = Poppins itálica)
- fundos: ${PM_BG.join(', ')} (+ leak = vazamento de luz, grain = granulado)
- entradas: ${PM_IN.join(', ')}; saídas: ${PM_OUT.join(', ')}; transições: ${PM_TRANSITIONS.join(', ')}
- peças: ${PM_TYPES.join(', ')}
Responda SÓ com JSON:
{"summary":"3–5 frases em português descrevendo o estilo (clima, tipografia, cor, movimento, ritmo)",
 "palette":{"bg":"#hex","bg2":"#hex","text":"#hex","accent":"#hex","accent2":"#hex","muted":"#hex"},
 "fonts":[até 2], "bg":[até 3], "leak":bool, "grain":bool, "inFx":[até 6], "outFx":[até 3], "transitions":[até 3], "elements":[até 8],
 "pace":"calmo|medio|rapido", "camera":"como a câmera se mexe", "layout":"composição, margens, hierarquia",
 "rules":["até 10 regras concretas e acionáveis"], "avoid":["até 6 coisas que esse estilo não faz"]}
Baseie tudo no que você VÊ nos quadros (cores reais, peso das letras, quanto espaço, como as coisas entram).`;
}

/**
 * Lê as referências da pasta e pede o guia ao Claude (precisa da chave: usa imagens).
 * @param {(system, content, cfg, opts) => Promise<string>} ask
 */
export async function learnGuide(userId, cfg, ask = askClaude) {
  const { dir, files } = await listRefs(userId);
  if (!files.length) throw new Error('a pasta de referências está vazia — adicione vídeos ou imagens de motions de que você gosta');
  const tmp = path.join(config.paths.work, `refs-${safe(userId || 'local')}-${Date.now()}`);
  try {
    const frames = await referenceFrames(dir, files.slice(0, 12), tmp);
    if (!frames.length) throw new Error('nenhuma referência pôde ser lida (formato não suportado?)');
    const content = [
      ...frames.flatMap((f) => [{ type: 'text', text: f.label }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: f.data } }]),
      { type: 'text', text: 'Escreva o guia de estilo (só o JSON).' },
    ];
    const text = await ask(refsSystem(), content, cfg, { maxTokens: 16000, task: 'review' });
    const guide = sanitizeGuide({ ...parseJsonLoose(text), learnedAt: new Date().toISOString(), from: files.map((f) => f.name) });
    if (!guide) throw new Error('o Claude não devolveu um guia utilizável');
    await fs.writeFile(path.join(dir, 'guia.json'), JSON.stringify(guide, null, 2));
    log.ok(`guia de estilo aprendido de ${files.length} referência(s), ${frames.length} quadros`);
    return guide;
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
