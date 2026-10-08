// Brand Kit: a identidade visual da pessoa, guardada neste navegador e aplicada em todo
// vídeo novo — estilo/cor/fonte da legenda, posição e (opcional) o logo como marca d'água.
import { uploadMedia } from './api.js';
import { presetPatch } from './components/CaptionGallery.jsx';

const KEY = 'riseframe_brandkit';

export const DEFAULT_BRAND = {
  enabled: true,
  name: '',
  preset: '', // modelo de legenda ('' = o padrão do app)
  captionColor: '',
  captionFont: '',
  captionPosition: '',
  logo: null, // data URL (PNG/JPG/WebP pequeno)
  watermark: false,
  logoPosition: 'tr',
  logoSize: 0.14,
  logoOpacity: 0.85,
};

export function loadBrand() {
  try {
    return { ...DEFAULT_BRAND, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

export function saveBrand(b) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
    return true;
  } catch {
    return false; // ex.: logo grande demais para o armazenamento do navegador
  }
}

/** As opções de legenda do Brand Kit, para somar às opções de um vídeo novo. */
export function brandOptions(b = loadBrand()) {
  if (!b.enabled) return {};
  return {
    ...(b.preset ? presetPatch(b.preset) : {}),
    ...(b.captionColor ? { captionColor: b.captionColor } : {}),
    ...(b.captionFont ? { captionFont: b.captionFont } : {}),
    ...(b.captionPosition ? { captionPosition: b.captionPosition } : {}),
  };
}

/** Se o Brand Kit pede o logo no vídeo: sobe a imagem e devolve a opção `watermark`. */
export async function brandWatermark(b = loadBrand()) {
  if (!b.enabled || !b.watermark || !b.logo) return null;
  const blob = await (await fetch(b.logo)).blob();
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const info = await uploadMedia(new File([blob], `logo.${ext}`, { type: blob.type || 'image/png' }));
  return { mediaId: info.id, position: b.logoPosition, scale: b.logoSize, opacity: b.logoOpacity };
}
