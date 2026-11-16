import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { config } from '../config.js';
import { ffmpegPath } from './ffmpeg.js';
import { resolvePython } from './python.js';
import { trackChild } from '../jobContext.js';
import { makeLogger } from '../logger.js';
import { parseYoutubeUrl } from '../../../shared/youtubeUrl.js';

const log = makeLogger('youtube');

/**
 * Vídeo pelo LINK do YouTube (em vez de enviar o arquivo): o servidor baixa com o
 * yt-dlp e o vídeo segue o mesmo caminho de um upload — Shorts, vídeo longo → curto e
 * Podcast/Cortes. Só links do YouTube (vídeo, Shorts, live gravada, youtu.be).
 *
 * Servidor: `pip install yt-dlp` (já vem no requirements.txt / Docker). Também serve o
 * executável `yt-dlp` no PATH ou em YTDLP_BIN; sem nenhum (app de PC/Mac, servidor sem
 * Docker), o executável oficial é baixado sozinho (YTDLP_AUTO_DOWNLOAD=0 desliga). Se o YouTube pedir login para o IP do
 * servidor ("confirme que não é um robô"), aponte YTDLP_COOKIES para um cookies.txt (ou, no
 * app de PC, YTDLP_COOKIES_FROM_BROWSER=firefox para usar o login do navegador).
 *
 * O yt-dlp precisa de um motor JavaScript (Deno ou Node 22+) para o YouTube: sem ele o
 * download é bloqueado com frequência. O app baixa o Deno oficial sozinho (ver abaixo).
 */

export { parseYoutubeUrl };

/** Limite de duração do vídeo baixado (horas). 0 = sem limite. */
const maxHours = () => {
  const n = Number(process.env.YOUTUBE_MAX_HOURS);
  return Number.isFinite(n) && n >= 0 ? n : 4;
};

function works(bin, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { stdio: 'ignore', windowsHide: true });
    } catch {
      return resolve(false);
    }
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* já saiu */ } resolve(false); }, timeoutMs);
    proc.on('error', () => { clearTimeout(t); resolve(false); });
    proc.on('close', (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

/**
 * Executável oficial do yt-dlp (release do GitHub) para este sistema. No app de PC/Mac não
 * há Python com yt-dlp: o app baixa o executável sozinho na 1ª vez (e confere o SHA-256).
 */
function standaloneAsset() {
  if (process.platform === 'win32') return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  return null;
}
const RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const binDir = () => path.join(config.paths.cache, 'bin');
const localBin = () => path.join(binDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

async function downloadStandalone() {
  const asset = standaloneAsset();
  if (!asset || process.env.YTDLP_AUTO_DOWNLOAD === '0') return null;
  log.info(`${fs.existsSync(localBin()) ? 'atualizando o yt-dlp' : 'yt-dlp não encontrado'} — baixando o executável oficial (${asset})…`);
  const get = async (url) => {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const sums = (await get(`${RELEASE}/SHA2-256SUMS`)).toString('utf8');
  const want = sums.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1] === asset)?.[0];
  if (!want) throw new Error(`sem a soma SHA-256 de ${asset} na release`);
  const bin = await get(`${RELEASE}/${asset}`);
  const got = crypto.createHash('sha256').update(bin).digest('hex');
  if (got !== want.toLowerCase()) throw new Error('o executável baixado não confere com a soma SHA-256 da release');
  fs.mkdirSync(binDir(), { recursive: true });
  const tmp = `${localBin()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, bin, { mode: 0o755 });
  fs.renameSync(tmp, localBin());
  log.ok(`yt-dlp baixado (${(bin.length / 1024 ** 2).toFixed(1)} MB) em ${localBin()}`);
  return { bin: localBin(), pre: [] };
}

/** O executável baixado pelo app está velho? O YouTube muda sempre: versão antiga para de funcionar. */
const STALE_DAYS = 10;
function localBinAgeDays() {
  try {
    return (Date.now() - fs.statSync(localBin()).mtimeMs) / 86_400_000;
  } catch {
    return Infinity;
  }
}

// ─── Motor JavaScript (Deno) ───────────────────────────────────────────────
// O yt-dlp atual só resolve os desafios do YouTube com um motor JavaScript externo: Deno
// (o único ligado por padrão) ou Node 22+. Sem nenhum, ele cai num modo limitado — e é
// esse modo que o YouTube bloqueia com "Sign in to confirm you're not a bot". O app de
// PC (Electron com Node 20) e o servidor (Node 20) não tinham nenhum: o app baixa o Deno
// oficial sozinho, confere o SHA-256 da release e passa a usar.
const DENO_RELEASE = 'https://github.com/denoland/deno/releases/latest/download';
const localDeno = () => path.join(binDir(), process.platform === 'win32' ? 'deno.exe' : 'deno');

function denoAsset() {
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : null;
  if (!arch) return null;
  if (process.platform === 'win32') return 'deno-x86_64-pc-windows-msvc.zip'; // no ARM roda emulado
  if (process.platform === 'darwin') return `deno-${arch}-apple-darwin.zip`;
  if (process.platform === 'linux') return `deno-${arch}-unknown-linux-gnu.zip`;
  return null;
}

/**
 * Tira UM arquivo de um .zip (o do Deno traz só o executável). Lê o diretório central, sem
 * biblioteca: métodos 0 (guardado) e 8 (deflate). Puro.
 * @returns {Buffer|null}
 */
export function unzipOne(zip, wanted) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(at + 10);
    const csize = zip.readUInt32LE(at + 20);
    const usize = zip.readUInt32LE(at + 24);
    const nlen = zip.readUInt16LE(at + 28);
    const xlen = zip.readUInt16LE(at + 30);
    const clen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nlen);
    at += 46 + nlen + xlen + clen;
    if (path.posix.basename(name.replace(/\\/g, '/')) !== wanted) continue;
    if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + csize);
    if (method === 0) return Buffer.from(data);
    if (method !== 8) return null;
    const out = zlib.inflateRawSync(data);
    return out.length === usize ? out : null;
  }
  return null;
}

/** Soma SHA-256 de um arquivo .sha256sum (formato do sha256sum ou do PowerShell). Puro. */
export function parseSha256(text) {
  const m = /\b([a-f0-9]{64})\b/i.exec(String(text || ''));
  return m ? m[1].toLowerCase() : null;
}

async function downloadDeno() {
  const asset = denoAsset();
  if (!asset || process.env.YTDLP_AUTO_DOWNLOAD === '0') return null;
  log.info(`motor JavaScript do yt-dlp não encontrado — baixando o Deno oficial (${asset})…`);
  const get = async (url) => {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const want = parseSha256((await get(`${DENO_RELEASE}/${asset}.sha256sum`)).toString('utf8'));
  if (!want) throw new Error(`sem a soma SHA-256 de ${asset} na release do Deno`);
  const zip = await get(`${DENO_RELEASE}/${asset}`);
  if (crypto.createHash('sha256').update(zip).digest('hex') !== want) throw new Error('o Deno baixado não confere com a soma SHA-256 da release');
  const exe = unzipOne(zip, path.basename(localDeno()));
  if (!exe) throw new Error('o pacote do Deno veio num formato inesperado');
  fs.mkdirSync(binDir(), { recursive: true });
  const tmp = `${localDeno()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, exe, { mode: 0o755 });
  fs.renameSync(tmp, localDeno());
  log.ok(`Deno baixado (${(exe.length / 1024 ** 2).toFixed(0)} MB) em ${localDeno()}`);
  return localDeno();
}

let jsCached; // string[] (argumentos do yt-dlp) | undefined
let jsFailedAt = 0;
let jsPending = null;
const jsStatus = { ready: false, how: null, error: null };

async function findJsRuntime() {
  // Deno no PATH: o yt-dlp já acha sozinho
  if (await works('deno', ['--version'], 20000)) return { args: [], how: 'deno (PATH)' };
  if (fs.existsSync(localDeno()) && (await works(localDeno(), ['--version'], 20000))) return { args: ['--js-runtimes', `deno:${localDeno()}`], how: localDeno() };
  // Node 22+ (o yt-dlp não aceita mais antigo): o próprio Node que roda o servidor
  if (Number(process.versions.node.split('.')[0]) >= 22) return { args: ['--js-runtimes', `node:${process.execPath}`], how: `node ${process.versions.node}` };
  const deno = await downloadDeno();
  if (deno && (await works(deno, ['--version'], 20000))) return { args: ['--js-runtimes', `deno:${deno}`], how: deno };
  return null;
}

/**
 * Argumentos do yt-dlp para o motor JavaScript ([] quando não há — o yt-dlp segue no modo
 * limitado, como antes). Achou: fica guardado; não achou: tenta de novo depois de 5 min.
 */
export async function resolveJsRuntime() {
  if (jsCached) return jsCached;
  if (!jsPending && Date.now() - jsFailedAt < 5 * 60_000) return [];
  if (!jsPending) {
    jsPending = findJsRuntime()
      .catch((err) => { jsStatus.error = err.message; return null; })
      .then((r) => {
        jsPending = null;
        if (r) {
          jsCached = r.args;
          Object.assign(jsStatus, { ready: true, how: r.how, error: null });
          log.info(`motor JavaScript do yt-dlp: ${r.how}`);
          return r.args;
        }
        jsFailedAt = Date.now();
        Object.assign(jsStatus, { ready: false, how: null, error: jsStatus.error || 'sem Deno nem Node 22+' });
        log.warn(`yt-dlp sem motor JavaScript (${jsStatus.error}) — o YouTube pode bloquear o download; tento de novo em 5 min`);
        return [];
      });
  }
  return jsPending;
}

let cached; // { bin, pre } | null
let failedAt = 0;
let pending = null;
const status = { ready: false, how: null, error: null };
/** Estado do yt-dlp (para o /api/health): { ready, how, error }. */
export const ytdlpStatus = () => ({ ...status, checking: Boolean(pending), js: { ...jsStatus, checking: Boolean(jsPending) } });
/**
 * Dá para importar pelo link? Responde na hora (não espera o download do executável):
 * enquanto procura/baixa, diz que sim — o envio do link espera o resultado.
 */
export function ytdlpAvailableNow() {
  if (cached) return true;
  if (cached === null && !pending && Date.now() - failedAt < 5 * 60_000) return false;
  resolveYtDlp().catch(() => {});
  return true;
}

async function findYtDlp() {
  const tries = [];
  if (process.env.YTDLP_BIN) tries.push({ bin: process.env.YTDLP_BIN, pre: [] });
  // o executável que o app baixou envelhece (o YouTube muda sempre): renova de tempos em
  // tempos; se não der para baixar agora, segue com o que tem
  if (fs.existsSync(localBin()) && !process.env.YTDLP_BIN && localBinAgeDays() > STALE_DAYS) {
    await downloadStandalone().catch((err) => log.warn(`não deu para atualizar o yt-dlp agora (${err.message})`));
  }
  if (fs.existsSync(localBin())) tries.push({ bin: localBin(), pre: [] });
  tries.push({ bin: 'yt-dlp', pre: [] });
  const py = await resolvePython();
  if (py) tries.push({ bin: py, pre: ['-m', 'yt_dlp'] });
  for (const t of tries) {
    // eslint-disable-next-line no-await-in-loop
    if (await works(t.bin, [...t.pre, '--version'])) return t;
  }
  // nada instalado: baixa o executável oficial (servidor sem Docker, app de PC/Mac)
  const dl = await downloadStandalone();
  if (dl && (await works(dl.bin, ['--version']))) return dl;
  return null;
}

/**
 * Como chamar o yt-dlp aqui: YTDLP_BIN → o baixado pelo app → `yt-dlp` no PATH →
 * `python -m yt_dlp` → baixa o executável oficial. → { bin, pre } ou null.
 * Achou: fica guardado. Não achou: tenta de novo depois de 5 min (não desiste para sempre).
 */
export async function resolveYtDlp() {
  if (cached) return cached;
  if (cached === null && Date.now() - failedAt < 5 * 60_000) return null;
  if (!pending) {
    pending = findYtDlp()
      .catch((err) => { status.error = err.message; return null; })
      .then((t) => {
        pending = null;
        cached = t;
        if (t) {
          Object.assign(status, { ready: true, how: [t.bin, ...t.pre].join(' '), error: null });
          log.info(`yt-dlp disponível (${status.how})`);
          resolveJsRuntime().catch(() => {}); // já deixa o motor JavaScript pronto
        } else {
          failedAt = Date.now();
          Object.assign(status, { ready: false, how: null, error: status.error || 'yt-dlp não encontrado' });
          log.warn(`yt-dlp indisponível (${status.error}) — tento de novo em 5 min`);
        }
        return t;
      });
  }
  return pending;
}

/** Argumentos comuns: cookies/proxy do servidor (se configurados). */
function commonArgs() {
  const a = ['--no-playlist', '--no-warnings', '--no-color', '--newline'];
  const cookies = process.env.YTDLP_COOKIES;
  if (cookies && fs.existsSync(cookies)) a.push('--cookies', cookies);
  // opcional (app de PC): usar o login do YouTube de um navegador deste computador, ex.: firefox
  const browser = String(process.env.YTDLP_COOKIES_FROM_BROWSER || '').trim();
  if (!a.includes('--cookies') && /^[a-z]+(?:[+:][\w .:+-]+)?$/i.test(browser)) a.push('--cookies-from-browser', browser);
  if (process.env.YTDLP_PROXY) a.push('--proxy', process.env.YTDLP_PROXY);
  // país informado ao YouTube (ex.: BR) para vídeos liberados só em alguns países
  const geo = String(process.env.YTDLP_GEO_COUNTRY || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(geo)) a.push('--xff', geo);
  return a;
}

/** Erro do yt-dlp → mensagem clara para a pessoa. */
/** O YouTube pediu login / "confirme que não é um robô"? (vale tentar de outro jeito) */
export function isBotBlock(stderr) {
  return /confirm you.?re not a bot|sign in to confirm|use --cookies/i.test(String(stderr || ''));
}

export function friendlyYtError(stderr) {
  const s = String(stderr || '');
  if (isBotBlock(s) || /cookies/i.test(s)) {
    // no app de PC o download sai do computador da pessoa, não de um servidor
    const where = process.versions.electron ? 'neste computador' : 'a partir do servidor';
    return `o YouTube bloqueou o download ${where} (pediu login). Tente de novo mais tarde ou baixe o vídeo e envie o arquivo.`;
  }
  if (/private video/i.test(s)) return 'este vídeo do YouTube é privado — só dá para usar vídeos públicos ou não listados.';
  if (/members.only|join this channel/i.test(s)) return 'este vídeo é só para membros do canal — não dá para baixar.';
  if (/age.?restrict|confirm your age|inappropriate for some users/i.test(s)) return 'este vídeo tem restrição de idade no YouTube — baixe o vídeo e envie o arquivo.';
  if (/available in your (?:country|region)|geo.?restrict|not available in your location/i.test(s)) {
    return 'o dono deste vídeo bloqueou o país de onde o servidor baixa (restrição de região do YouTube). Teste com outro vídeo, ou baixe este e envie o arquivo.';
  }
  if (/live event will begin|premieres in|is_upcoming/i.test(s)) return 'esta live/estreia ainda não começou.';
  if (/video unavailable|has been removed|does not exist|not available/i.test(s)) return 'vídeo do YouTube indisponível (removido, privado ou link errado).';
  if (/HTTP Error 429|too many requests/i.test(s)) return 'o YouTube limitou os downloads do servidor agora. Tente de novo em alguns minutos.';
  const last = s.split('\n').map((l) => l.trim()).filter((l) => /^ERROR:/i.test(l)).pop();
  return last ? `não foi possível baixar do YouTube: ${last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, '').slice(0, 200)}` : 'não foi possível baixar o vídeo do YouTube.';
}

function run(tool, args, { onLine, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = trackChild(spawn(tool.bin, [...tool.pre, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }));
    let out = '';
    let err = '';
    let buf = '';
    const t = timeoutMs ? setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* já saiu */ } }, timeoutMs) : null;
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      if (out.length > 4_000_000) out = out.slice(-2_000_000);
      if (!onLine) return;
      buf += s;
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      for (const l of lines) onLine(l);
    });
    proc.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    proc.on('error', (e) => { if (t) clearTimeout(t); reject(e); });
    proc.on('close', (code, signal) => {
      if (t) clearTimeout(t);
      if (code === 0) return resolve(out);
      const e = new Error(signal ? 'download do YouTube interrompido' : friendlyYtError(err));
      e.stderr = err;
      reject(e);
    });
  });
}

/**
 * Argumentos do motor JavaScript para esta chamada. O yt-dlp do `pip` pode não trazer os
 * scripts que rodam no motor (pacote yt-dlp-ejs): deixa buscar os oficiais no GitHub.
 */
async function runtimeArgs(tool) {
  const js = await resolveJsRuntime();
  return tool.pre.length ? [...js, '--remote-components', 'ejs:github'] : js;
}

/**
 * Jeitos de pedir o vídeo quando o YouTube bloqueia ("confirme que não é um robô"): o
 * normal e, depois, outros "aparelhos" (clientes) que o YouTube trata de forma diferente.
 */
export const YT_FALLBACK_CLIENTS = ['tv,web_safari,mweb', 'android_vr,tv_simply,web_embedded'];

/** Dados do vídeo (título, duração…) sem baixar. */
export async function youtubeInfo(url, tool, extra = null) {
  const t = tool || (await resolveYtDlp());
  if (!t) throw new Error('importar do YouTube não está disponível neste servidor');
  const more = extra || (await runtimeArgs(t));
  const out = await run(t, [...commonArgs(), ...more, '--skip-download', '--dump-single-json', url], { timeoutMs: 120_000 });
  let info = null;
  // uma linha de JSON (o normal); se vier algo antes, a última linha é o JSON
  for (const txt of [out.trim(), out.trim().split('\n').pop()]) {
    try { info = JSON.parse(txt); break; } catch { /* tenta a próxima */ }
  }
  if (!info || typeof info !== 'object') throw new Error('o YouTube devolveu uma resposta inesperada para este link');
  return {
    id: info.id,
    title: String(info.title || '').trim() || 'Vídeo do YouTube',
    duration: Number(info.duration) || 0,
    isLive: info.is_live === true || info.live_status === 'is_live' || info.live_status === 'is_upcoming',
    channel: info.channel || info.uploader || '',
  };
}

/** Nome de arquivo legível a partir do título do vídeo. */
export function titleToFilename(title) {
  const base = String(title || 'Vídeo do YouTube')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${base || 'Vídeo do YouTube'}.mp4`;
}

/**
 * Baixa o vídeo do YouTube em `outPath` (.mp4, até 1080p, H.264 quando houver — o
 * navegador toca direto na prévia do editor). onProgress(0..1).
 * → { title, duration, filename }
 */
export async function downloadYoutube(rawUrl, outPath, onProgress = () => {}) {
  const parsed = parseYoutubeUrl(rawUrl);
  if (!parsed) throw new Error('link do YouTube inválido');
  const tool = await resolveYtDlp();
  if (!tool) throw new Error('importar do YouTube não está disponível neste servidor (falta o yt-dlp)');

  const base0 = await runtimeArgs(tool);
  // 1ª tentativa normal; bloqueado ("não é um robô"): atualiza o yt-dlp se estiver velho e
  // tenta de novo; depois, com outros clientes do YouTube. Outros erros não repetem.
  const plans = [{ label: 'normal', extra: base0 }, ...YT_FALLBACK_CLIENTS.map((c) => ({ label: `clientes ${c}`, extra: [...base0, '--extractor-args', `youtube:player_client=${c}`] }))];
  let lastErr = null;
  for (let i = 0; i < plans.length; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await downloadOnce(parsed, tool, outPath, onProgress, plans[i].extra);
    } catch (err) {
      lastErr = err;
      if (!isBotBlock(err.stderr)) throw err;
      log.warn(`o YouTube pediu login (tentativa ${plans[i].label})${i + 1 < plans.length ? ' — tentando de outro jeito' : ''}`);
      if (i === 0 && tool.bin === localBin() && localBinAgeDays() > 1) {
        // eslint-disable-next-line no-await-in-loop
        const fresh = await downloadStandalone().catch(() => null);
        if (fresh) plans.splice(1, 0, { label: 'yt-dlp atualizado', extra: base0 });
      }
    }
  }
  throw lastErr;
}

async function downloadOnce(parsed, tool, outPath, onProgress, extra) {
  const info = await youtubeInfo(parsed.url, tool, extra);
  if (info.isLive) throw new Error('este vídeo é uma live em andamento — espere ela terminar para usar o link.');
  const lim = maxHours();
  if (lim && info.duration > lim * 3600) {
    throw new Error(`o vídeo tem ${(info.duration / 3600).toFixed(1)} h e o limite é ${lim} h.`);
  }
  log.info(`baixando do YouTube: "${info.title}" (${Math.round(info.duration)} s)`);

  const dir = path.dirname(outPath);
  const base = path.basename(outPath, path.extname(outPath));
  fs.mkdirSync(dir, { recursive: true });
  const tmpl = path.join(dir, `${base}.dl.%(ext)s`);

  // Vídeo e áudio vêm separados (2 downloads) e depois são juntados: o vídeo é a maior
  // parte do tempo. Cada vez que a % volta para perto de zero, é o arquivo seguinte.
  let part = 0;
  let last = 0;
  const onLine = (line) => {
    const m = /^\[download\]\s+([\d.]+)%/.exec(line);
    if (m) {
      const p = Math.min(100, Number(m[1])) / 100;
      if (p + 0.2 < last) part = Math.min(part + 1, 1);
      last = p;
      onProgress(part === 0 ? p * 0.85 : 0.85 + p * 0.12);
    } else if (/^\[(Merger|VideoRemuxer|FixupM3u8|FixupM4a)\]/.test(line)) {
      onProgress(0.97);
    }
  };
  const leftovers = () => {
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`${base}.dl.`)) fs.rmSync(path.join(dir, f), { force: true });
  };
  try {
    await run(tool, [
      ...commonArgs(),
      ...extra,
      // melhor qualidade até 1080p; prefere H.264 + AAC (mp4) — toca no navegador
      '-f', 'bv*+ba/b',
      '-S', 'res:1080,vcodec:h264,acodec:aac,ext:mp4:m4a',
      '--merge-output-format', 'mp4',
      '--remux-video', 'mp4',
      '--ffmpeg-location', ffmpegPath,
      '--no-mtime',
      '--no-part',
      '-o', tmpl,
      parsed.url,
    ], { onLine });
  } catch (err) {
    leftovers();
    throw err;
  }

  // o arquivo final (yt-dlp escolhe a extensão; com o remux, é .mp4)
  const made = fs.readdirSync(dir)
    .filter((f) => f.startsWith(`${base}.dl.`) && !/\.(part|ytdl|temp)$/i.test(f) && !/\.f\d+\./.test(f))
    .map((f) => path.join(dir, f));
  const file = made.find((f) => f.endsWith('.mp4')) || made[0];
  if (!file || !fs.existsSync(file)) throw new Error('o download do YouTube terminou sem gerar o vídeo');
  for (const f of made) if (f !== file) fs.rmSync(f, { force: true });
  fs.renameSync(file, outPath);
  onProgress(1);
  log.ok(`YouTube baixado: "${info.title}" (${(fs.statSync(outPath).size / 1024 ** 2).toFixed(1)} MB)`);
  return { title: info.title, duration: info.duration, filename: titleToFilename(info.title) };
}
