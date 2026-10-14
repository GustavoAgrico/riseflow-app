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
  captionHighlightStyle: '', // destaque da palavra falada ('' = do estilo)
  logo: null, // data URL (PNG/JPG/WebP pequeno)
  watermark: false,
  logoPosition: 'tr',
  logoSize: 0.14,
  logoOpacity: 0.85,
};

// Várias marcas (agência com vários clientes): cada uma com logo, legenda, cores e fonte.
// Uma fica ATIVA e é aplicada nos vídeos novos. A marca antiga (única) vira a 1ª da lista.
const KEY_LIST = 'riseframe_brands';
const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readStore() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_LIST) || 'null');
    if (v && Array.isArray(v.brands) && v.brands.length) return v;
  } catch {
    /* lista corrompida: recomeça a partir da marca antiga */
  }
  let old = null;
  try {
    old = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    old = null;
  }
  const first = { ...DEFAULT_BRAND, ...(old || {}), id: newId(), name: old?.name || 'Minha marca' };
  const st = { activeId: first.id, brands: [first] };
  writeStore(st); // grava já: o id da marca tem que ser o mesmo em toda leitura
  return st;
}

function writeStore(st) {
  try {
    localStorage.setItem(KEY_LIST, JSON.stringify(st));
    return true;
  } catch {
    return false; // ex.: logos grandes demais para o armazenamento do navegador
  }
}

/** Todas as marcas cadastradas. */
export function listBrands() {
  return readStore().brands.map((b) => ({ ...DEFAULT_BRAND, ...b }));
}

export function activeBrandId() {
  const st = readStore();
  return st.brands.some((b) => b.id === st.activeId) ? st.activeId : st.brands[0].id;
}

/** A marca ativa (ou a do id pedido). */
export function loadBrand(id) {
  const st = readStore();
  const want = id || st.activeId;
  return { ...DEFAULT_BRAND, ...(st.brands.find((b) => b.id === want) || st.brands[0]) };
}

export function saveBrand(b) {
  const st = readStore();
  const brand = { ...b, id: b.id || newId() };
  const i = st.brands.findIndex((x) => x.id === brand.id);
  if (i < 0) st.brands.push(brand);
  else st.brands[i] = brand;
  return writeStore(st);
}

export function setActiveBrand(id) {
  const st = readStore();
  if (!st.brands.some((b) => b.id === id)) return false;
  st.activeId = id;
  return writeStore(st);
}

/** Nova marca (em branco) ou cópia de outra (duplicar as configurações). Fica ativa. */
export function createBrand(from = null) {
  const st = readStore();
  const brand = from
    ? { ...DEFAULT_BRAND, ...from, id: newId(), name: `${from.name || 'Marca'} (cópia)`.slice(0, 60) }
    : { ...DEFAULT_BRAND, id: newId(), name: `Marca ${st.brands.length + 1}` };
  st.brands.push(brand);
  st.activeId = brand.id;
  return writeStore(st) ? brand : null;
}

/** Exclui uma marca (a última que sobra só volta ao padrão). */
export function deleteBrand(id) {
  const st = readStore();
  if (st.brands.length <= 1) {
    st.brands = [{ ...DEFAULT_BRAND, id: newId(), name: 'Minha marca' }];
  } else {
    st.brands = st.brands.filter((b) => b.id !== id);
  }
  if (!st.brands.some((b) => b.id === st.activeId)) st.activeId = st.brands[0].id;
  return writeStore(st);
}

/** As opções de legenda do Brand Kit, para somar às opções de um vídeo novo. */
export function brandOptions(b = loadBrand()) {
  if (!b.enabled) return {};
  return {
    ...(b.preset ? presetPatch(b.preset) : {}),
    ...(b.captionColor ? { captionColor: b.captionColor } : {}),
    ...(b.captionFont ? { captionFont: b.captionFont } : {}),
    ...(b.captionPosition ? { captionPosition: b.captionPosition } : {}),
    ...(b.captionHighlightStyle ? { captionHighlightStyle: b.captionHighlightStyle } : {}),
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
