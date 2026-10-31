// Link do YouTube → id do vídeo. O MESMO teste no site (campo "colar link") e no servidor
// (que baixa o vídeo com o yt-dlp): vídeo, Shorts, live gravada, youtu.be e embed.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/**
 * Link do YouTube → { id, url } (url canônica, sem playlist nem parâmetros) ou null.
 * Aceita watch?v=, youtu.be/, /shorts/, /live/, /embed/ e /v/.
 */
export function parseYoutubeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > 2000) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = u.pathname.split('/')[1] || null;
  } else if (HOSTS.has(host)) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) id = parts[1] || null;
  }
  if (!id || !ID_RE.test(id)) return null;
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** Miniatura do vídeo (para mostrar o link colado). */
export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
