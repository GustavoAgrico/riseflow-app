import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
 * executável `yt-dlp` no PATH ou em YTDLP_BIN. Se o YouTube pedir login para o IP do
 * servidor ("confirme que não é um robô"), aponte YTDLP_COOKIES para um cookies.txt.
 */

export { parseYoutubeUrl };

/** Limite de duração do vídeo baixado (horas). 0 = sem limite. */
const maxHours = () => {
  const n = Number(process.env.YOUTUBE_MAX_HOURS);
  return Number.isFinite(n) && n >= 0 ? n : 4;
};

function works(bin, args) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { stdio: 'ignore' });
    } catch {
      return resolve(false);
    }
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* já saiu */ } resolve(false); }, 20000);
    proc.on('error', () => { clearTimeout(t); resolve(false); });
    proc.on('close', (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

let cached; // { bin, pre } | null
/**
 * Como chamar o yt-dlp aqui: YTDLP_BIN → `yt-dlp` no PATH → `python -m yt_dlp`.
 * → { bin, pre: [args antes dos do yt-dlp] } ou null (indisponível). Memoizado.
 */
export async function resolveYtDlp() {
  if (cached !== undefined) return cached;
  const tries = [];
  if (process.env.YTDLP_BIN) tries.push({ bin: process.env.YTDLP_BIN, pre: [] });
  tries.push({ bin: 'yt-dlp', pre: [] });
  const py = await resolvePython();
  if (py) tries.push({ bin: py, pre: ['-m', 'yt_dlp'] });
  for (const t of tries) {
    // eslint-disable-next-line no-await-in-loop
    if (await works(t.bin, [...t.pre, '--version'])) {
      cached = t;
      log.info(`yt-dlp disponível (${[t.bin, ...t.pre].join(' ')})`);
      return t;
    }
  }
  cached = null;
  log.warn('yt-dlp indisponível — importar vídeo pelo link do YouTube fica desligado (pip install yt-dlp)');
  return null;
}

/** Argumentos comuns: cookies/proxy do servidor (se configurados). */
function commonArgs() {
  const a = ['--no-playlist', '--no-warnings', '--no-color', '--newline'];
  const cookies = process.env.YTDLP_COOKIES;
  if (cookies && fs.existsSync(cookies)) a.push('--cookies', cookies);
  if (process.env.YTDLP_PROXY) a.push('--proxy', process.env.YTDLP_PROXY);
  return a;
}

/** Erro do yt-dlp → mensagem clara para a pessoa. */
export function friendlyYtError(stderr) {
  const s = String(stderr || '');
  if (/confirm you.?re not a bot|sign in to confirm|cookies/i.test(s)) {
    return 'o YouTube bloqueou o download a partir do servidor (pediu login). Tente de novo mais tarde ou baixe o vídeo e envie o arquivo.';
  }
  if (/private video/i.test(s)) return 'este vídeo do YouTube é privado — só dá para usar vídeos públicos ou não listados.';
  if (/members.only|join this channel/i.test(s)) return 'este vídeo é só para membros do canal — não dá para baixar.';
  if (/age.?restrict|confirm your age|inappropriate for some users/i.test(s)) return 'este vídeo tem restrição de idade no YouTube — baixe o vídeo e envie o arquivo.';
  if (/is not available in your country|geo.?restrict/i.test(s)) return 'este vídeo não está disponível na região do servidor.';
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

/** Dados do vídeo (título, duração…) sem baixar. */
export async function youtubeInfo(url, tool) {
  const t = tool || (await resolveYtDlp());
  if (!t) throw new Error('importar do YouTube não está disponível neste servidor');
  const out = await run(t, [...commonArgs(), '--skip-download', '--dump-single-json', url], { timeoutMs: 90_000 });
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

  const info = await youtubeInfo(parsed.url, tool);
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
