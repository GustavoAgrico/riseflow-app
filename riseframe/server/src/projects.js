import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { cloudPutObject, cloudGetObject, cloudListObjects, cloudDeleteObjects } from './cloudSync.js';
import { makeLogger } from './logger.js';
import { templateMediaIds } from './userTemplates.js';

const log = makeLogger('projetos');

/**
 * Projetos do editor (como os rascunhos do CapCut): tudo o que foi feito na timeline —
 * edições, transcrição, mídias usadas — salvo pelo editor a cada 30 s. Ficam no disco
 * (data/projects/<usuário>/<id>.json) e, no servidor online sem disco permanente, também
 * na nuvem (Supabase). O id do projeto é o id do vídeo de origem (sourceId).
 */
const MAX_BYTES = 4 * 1024 * 1024;
const SAFE = /^[A-Za-z0-9_-]{4,64}$/;

const dirOf = (userId) => path.join(config.paths.data, 'projects', String(userId).replace(/[^A-Za-z0-9_-]/g, '_'));
const fileOf = (userId, id) => path.join(dirOf(userId), `${id}.json`);
const cloudName = (userId, id) => `projects/${String(userId).replace(/[^A-Za-z0-9_-]/g, '_')}/${id}.json`;

export const validProjectId = (id) => typeof id === 'string' && SAFE.test(id);

/** Grava o projeto (disco + nuvem). `data` = { state, meta } vindo do editor. */
export async function saveProject(userId, id, data) {
  if (!validProjectId(id)) throw Object.assign(new Error('id de projeto inválido'), { status: 400 });
  const doc = { id, savedAt: Date.now(), meta: data.meta || {}, state: data.state || {} };
  const buf = Buffer.from(JSON.stringify(doc));
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('projeto grande demais para salvar'), { status: 413 });
  fs.mkdirSync(dirOf(userId), { recursive: true });
  const file = fileOf(userId, id);
  fs.writeFileSync(`${file}.tmp`, buf);
  fs.renameSync(`${file}.tmp`, file);
  cloudPutObject(cloudName(userId, id), buf).catch((err) => log.warn(`não subiu o projeto ${id} para a nuvem: ${err.message}`));
  return { id, savedAt: doc.savedAt };
}

/** Lê o projeto: do disco, ou da nuvem (e guarda no disco) quando o disco foi zerado. */
export async function loadProject(userId, id) {
  if (!validProjectId(id)) return null;
  const file = fileOf(userId, id);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* não está no disco */
  }
  const buf = await cloudGetObject(cloudName(userId, id)).catch(() => null);
  if (!buf) return null;
  fs.mkdirSync(dirOf(userId), { recursive: true });
  fs.writeFileSync(file, buf);
  return JSON.parse(buf.toString('utf8'));
}

/** Lista os projetos do usuário (mais recentes primeiro), só com os dados do cartão. */
export async function listProjects(userId) {
  const dir = dirOf(userId);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  // servidor sem disco: traz da nuvem os que não estão aqui
  const remote = await cloudListObjects(`projects/${String(userId).replace(/[^A-Za-z0-9_-]/g, '_')}`).catch(() => []);
  for (const r of remote) {
    const id = path.basename(r, '.json');
    if (!names.includes(`${id}.json`)) await loadProject(userId, id).catch(() => null);
  }
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  const out = [];
  for (const n of names) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
      out.push({ id: doc.id, savedAt: doc.savedAt, meta: doc.meta || {} });
    } catch {
      /* arquivo corrompido: ignora */
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteProject(userId, id) {
  if (!validProjectId(id)) return;
  fs.rmSync(fileOf(userId, id), { force: true });
  await cloudDeleteObjects([cloudName(userId, id)]).catch(() => {});
}

/**
 * Nomes de arquivo (uploads/jobs) que algum projeto salvo ainda usa — a limpeza
 * automática não apaga esses (o vídeo de origem e as mídias continuam no projeto).
 */
export function referencedFiles() {
  const keep = new Set();
  const root = path.join(config.paths.data, 'projects');
  let users = [];
  try {
    users = fs.readdirSync(root);
  } catch {
    for (const id of templateMediaIds()) keep.add(id);
    return keep;
  }
  for (const u of users) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(root, u)).filter((n) => n.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(root, u, f), 'utf8'));
        keep.add(doc.id); // jobs/<id>.json e o upload de origem (prefixo = id)
        for (const m of doc.state?.media || []) if (m?.mediaId) keep.add(String(m.mediaId));
        if (doc.meta?.sourceFile) keep.add(path.parse(String(doc.meta.sourceFile)).name);
      } catch {
        /* ignora */
      }
    }
  }
  // mídias usadas nos "Meus modelos" também não expiram
  for (const id of templateMediaIds()) keep.add(id);
  return keep;
}
