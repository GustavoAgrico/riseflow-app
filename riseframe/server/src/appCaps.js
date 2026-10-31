// Recursos ligados (capabilities) vistos pelo app de PC/Mac: sem chaves próprias de banco de
// imagens, as buscas de B-roll vão pela conta do site — então as fontes do site entram.
import { capabilities, config } from './config.js';
import { siteCapabilities } from './account.js';
import { googleConfig, googleReady, searchesViaSite } from './pipeline/broll.js';
import { resolveYtDlp } from './pipeline/youtube.js';

/**
 * App de PC sem chaves de banco de imagens: as buscas de B-roll vão pela conta do site,
 * então as fontes que aparecem (Pexels, Pixabay, Google) são as ligadas no site.
 */
export async function appCapabilities() {
  // importar vídeo pelo link do YouTube (precisa do yt-dlp no servidor)
  const caps = { ...capabilities(), youtubeImport: Boolean(await resolveYtDlp()) };
  if (!searchesViaSite({ apiKey: config.broll.pexelsKey, pixabayKey: config.broll.pixabayKey, googleReady: googleReady(googleConfig()) })) return caps;
  const site = await siteCapabilities();
  // O site (plano grátis) pode estar "dormindo" e demorar para responder: enquanto isso as
  // fontes dele (Pexels e Google Imagens) aparecem mesmo assim — antes o app de PC/Mac
  // mostrava só "Tudo" e "Wikimedia". A busca vai pela conta do site quando a pessoa usa.
  if (!site) return { ...caps, brollReady: true, googleImagesReady: true, brollViaSite: true };
  return { ...caps, brollReady: Boolean(site.brollReady), pixabayReady: Boolean(site.pixabayReady), googleImagesReady: Boolean(site.googleImagesReady), brollViaSite: true };
}

