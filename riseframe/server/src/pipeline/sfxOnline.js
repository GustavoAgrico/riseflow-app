// Biblioteca online de efeitos sonoros (como a do CapCut):
// - Openverse (api.openverse.org): busca aberta, SEM chave — funciona no site e no app de
//   PC direto. Só sons de domínio público (CC0 e "Public Domain Mark"): dá para usar em
//   qualquer vídeo, até comercial, sem dar crédito. Quase todos vêm do Freesound e do
//   Wikimedia Commons.
// - Freesound direto (com FREESOUND_API_KEY no servidor), também só CC0.
// Os sons são baixados uma vez para o cache e servidos dali (prévia e render iguais).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeLogger } from '../logger.js';
import { runFfmpeg } from './ffmpeg.js';

const log = makeLogger('sfx-online');

export const freesoundKey = () => process.env.FREESOUND_API_KEY || '';
const UA = 'Riseframe/1.0 (editor de video; contato@riseframe.com.br)';

const FREESOUND_RE = /^https:\/\/(cdn\.)?freesound\.org\/(data\/)?previews\/[\w/.-]+\.(mp3|ogg)$/;
const WIKI_RE = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:transcoded\/)?[0-9a-f]\/[0-9a-f]{2}\/[\w%().,'!~+-]+\.(ogg|oga|opus|mp3|wav|flac)(?:\/[\w%().,'!~+-]+\.(?:mp3|ogg))?$/i;
/** Só endereços de som dos acervos aceitos (o servidor nunca baixa outro endereço). */
export const okSfxUrl = (u) => typeof u === 'string' && u.length < 600 && (FREESOUND_RE.test(u) || WIKI_RE.test(u));

/** Busca sons CC0 de até 20 s no Freesound. → [{ id, name, dur, preview, tags, src }] */
export async function searchFreesound(query, { page = 1, key = freesoundKey() } = {}) {
  if (!key) throw new Error('biblioteca online de sons desligada (falta a chave do Freesound no servidor)');
  const q = String(query || '').trim().slice(0, 80) || 'whoosh';
  const u = new URL('https://freesound.org/apiv2/search/text/');
  u.searchParams.set('query', toEnglish(q));
  u.searchParams.set('filter', 'license:"Creative Commons 0" duration:[0 TO 20]');
  u.searchParams.set('fields', 'id,name,duration,previews,tags');
  u.searchParams.set('page_size', '24');
  u.searchParams.set('page', String(Math.max(1, Math.min(20, Number(page) || 1))));
  u.searchParams.set('token', key);
  const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Freesound respondeu ${r.status}`);
  const data = await r.json();
  return (data.results || []).map((x) => ({
    id: x.id,
    name: String(x.name || '').replace(/\.(wav|mp3|aif+|flac|ogg)$/i, '').slice(0, 80),
    dur: +Number(x.duration || 0).toFixed(2),
    preview: x.previews?.['preview-hq-mp3'] || x.previews?.['preview-lq-mp3'] || '',
    tags: (x.tags || []).slice(0, 6),
    src: 'freesound',
  })).filter((x) => okSfxUrl(x.preview));
}

// Busca em português → termos em inglês (o acervo é quase todo em inglês).
const PT_EN = {
  dinheiro: 'cash register', moeda: 'coin', moedas: 'coins', caixa: 'cash register', compra: 'purchase', venda: 'cash register',
  sucesso: 'success', conquista: 'achievement', vitoria: 'win fanfare', vitória: 'win fanfare', aplauso: 'applause', aplausos: 'applause',
  erro: 'error buzzer', alerta: 'alert', alarme: 'alarm', notificacao: 'notification', notificação: 'notification', sino: 'bell', campainha: 'doorbell',
  passagem: 'whoosh', transicao: 'whoosh', transição: 'whoosh', vento: 'wind', impacto: 'impact', soco: 'punch', explosao: 'explosion', explosão: 'explosion',
  batida: 'hit', estalo: 'snap', clique: 'click', teclado: 'typing keyboard', digitando: 'typing', camera: 'camera shutter', câmera: 'camera shutter', foto: 'camera shutter',
  risada: 'laugh', risadas: 'laughter', grito: 'scream', suspense: 'suspense', tensao: 'tension', tensão: 'tension', coração: 'heartbeat', coracao: 'heartbeat',
  magia: 'magic', brilho: 'sparkle', relogio: 'clock ticking', relógio: 'clock ticking', tique: 'tick', bolha: 'bubble', estouro: 'pop', porta: 'door',
  passos: 'footsteps', chuva: 'rain', trovao: 'thunder', trovão: 'thunder', fogo: 'fire', agua: 'water', água: 'water', carro: 'car', buzina: 'horn',
  cachorro: 'dog', gato: 'cat', passaro: 'bird', pássaro: 'bird', telefone: 'phone ring', celular: 'phone vibrate', mensagem: 'message notification',
  falha: 'fail', fracasso: 'fail trombone', drama: 'dramatic', subida: 'riser', descida: 'downlifter', glitch: 'glitch', laser: 'laser', tiro: 'gunshot',
};
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export function toEnglish(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return words.map((w) => PT_EN[w] || PT_EN[strip(w)] || w).join(' ').slice(0, 80);
}

// Token do Openverse (opcional: OPENVERSE_CLIENT_ID/SECRET dão mais buscas por dia).
let ovToken = null;
async function openverseToken() {
  const id = process.env.OPENVERSE_CLIENT_ID;
  const secret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return '';
  if (ovToken && ovToken.until > Date.now()) return ovToken.value;
  try {
    const r = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`token ${r.status}`);
    const d = await r.json();
    ovToken = { value: d.access_token, until: Date.now() + Math.max(60, (Number(d.expires_in) || 3600) - 120) * 1000 };
    return ovToken.value;
  } catch (err) {
    log.warn(`Openverse sem token (${err.message}); segue sem`);
    return '';
  }
}

const ovCache = new Map(); // busca → { at, results } (economiza o limite de buscas)
const OV_TTL = 60 * 60 * 1000;

/** Um resultado do Openverse no formato da biblioteca (ou null se não serve). */
export function fromOpenverse(x) {
  const lic = String(x?.license || '').toLowerCase();
  if (lic !== 'cc0' && lic !== 'pdm') return null;
  const files = [{ url: x.url, filetype: x.filetype }, ...(Array.isArray(x.alt_files) ? x.alt_files : [])];
  const pick = files.find((f) => okSfxUrl(f?.url) && /\.mp3$/i.test(f.url)) || files.find((f) => okSfxUrl(f?.url));
  if (!pick) return null;
  const dur = Number(x.duration) > 0 ? Number(x.duration) / 1000 : 0;
  if (dur > 30) return null;
  return {
    id: String(x.id || '').slice(0, 64),
    name: String(x.title || 'Som').replace(/\.(wav|mp3|aif+|flac|ogg|oga)$/i, '').replace(/_/g, ' ').slice(0, 80),
    dur: +dur.toFixed(2) || 1,
    preview: pick.url,
    tags: (x.tags || []).map((t) => String(t?.name || '')).filter(Boolean).slice(0, 6),
    src: 'openverse',
    credit: [x.creator, x.source || x.provider, lic === 'cc0' ? 'CC0' : 'Domínio público'].filter(Boolean).join(' · ').slice(0, 120),
  };
}

/**
 * Busca efeitos sonoros no Openverse (sem chave), só CC0/domínio público, curtos.
 * @param {string} query
 * @param {{page?:number, fetchImpl?:typeof fetch}} [opts]
 */
export async function searchOpenverse(query, { page = 1, fetchImpl = fetch } = {}) {
  const q = toEnglish(String(query || '').trim().slice(0, 80) || 'whoosh') || 'whoosh';
  const pg = Math.max(1, Math.min(20, Number(page) || 1));
  const ck = `${q}|${pg}`;
  const hit = ovCache.get(ck);
  if (hit && Date.now() - hit.at < OV_TTL) return hit.results;
  const token = await openverseToken();
  const ask = async (extra) => {
    const u = new URL('https://api.openverse.org/v1/audio/');
    u.searchParams.set('q', q);
    u.searchParams.set('license', 'cc0,pdm');
    u.searchParams.set('page_size', '20');
    u.searchParams.set('page', String(pg));
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return fetchImpl(u, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(20_000) });
  };
  // primeiro só efeitos sonoros curtos; se o filtro não for aceito, busca sem ele
  let r = await ask({ category: 'sound_effect', length: 'shortest' });
  if (r.status === 400) r = await ask({});
  if (r.status === 429) throw Object.assign(new Error('Muitas buscas de som agora — espere um minuto e tente de novo.'), { status: 429 });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Openverse respondeu ${r.status}`);
  const data = await r.json();
  const results = (data.results || []).map(fromOpenverse).filter(Boolean);
  ovCache.set(ck, { at: Date.now(), results });
  if (ovCache.size > 300) ovCache.delete(ovCache.keys().next().value);
  return results;
}

/** Arquivo local do som (baixado uma vez para o cache, sempre em mp3). null se o endereço não vale. */
export async function onlineSfxFile(url, cacheDir) {
  if (!okSfxUrl(url)) return null;
  const dir = path.join(cacheDir, 'sfx-online');
  const id = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);
  const file = path.join(dir, `${id}.mp3`);
  try {
    await fs.access(file);
    return file;
  } catch { /* ainda não baixado */ }
  await fs.mkdir(dir, { recursive: true });
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`não deu para baixar o som (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new Error('som grande demais');
  if (/\.mp3$/i.test(url)) {
    await fs.writeFile(file, buf);
  } else {
    // ogg/wav/flac do Wikimedia → mp3 (toca igual em qualquer navegador e no render), até 20 s
    const raw = path.join(dir, `${id}.src${path.extname(new URL(url).pathname).slice(0, 6)}`);
    await fs.writeFile(raw, buf);
    try {
      await runFfmpeg(['-y', '-i', raw, '-t', '20', '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '3', file], { quiet: true });
    } finally {
      await fs.rm(raw, { force: true });
    }
  }
  log.ok(`som da biblioteca online: ${decodeURIComponent(path.basename(url)).slice(0, 60)}`);
  return file;
}
