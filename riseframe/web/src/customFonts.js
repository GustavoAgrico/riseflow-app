import { useEffect, useState } from 'react';
import { listCustomFontsApi, uploadCustomFontApi, deleteCustomFontApi, customFontFileUrl, authFetch } from './api.js';

/**
 * Fontes próprias do usuário (enviadas por ele: .ttf/.otf/.woff). A lista é carregada uma
 * vez e compartilhada entre os seletores; cada fonte é registrada no navegador (FontFace)
 * com o mesmo nome único do servidor ("RFU <id>"), então prévia e vídeo usam o mesmo arquivo.
 */
let fonts = null;
let loading = null;
const listeners = new Set();
const loaded = new Set();
const notify = () => listeners.forEach((fn) => fn(fonts || []));

async function register(f) {
  if (loaded.has(f.id) || typeof FontFace === 'undefined') return;
  loaded.add(f.id);
  try {
    const r = await authFetch(customFontFileUrl(f.id));
    if (!r.ok) throw new Error(String(r.status));
    const face = new FontFace(f.family, await r.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    notify();
  } catch {
    loaded.delete(f.id);
  }
}

async function refresh() {
  try {
    fonts = await listCustomFontsApi();
  } catch {
    fonts = fonts || [];
  }
  fonts.forEach(register);
  notify();
  return fonts;
}

export const customFontFamily = (id) => `RFU ${id}`;

export function useCustomFonts() {
  const [list, setList] = useState(fonts || []);
  useEffect(() => {
    listeners.add(setList);
    if (!fonts && !loading) loading = refresh().finally(() => { loading = null; });
    return () => listeners.delete(setList);
  }, []);
  return {
    fonts: list,
    async upload(file) {
      const f = await uploadCustomFontApi(file);
      await refresh();
      return f;
    },
    async remove(id) {
      await deleteCustomFontApi(id);
      await refresh();
    },
  };
}
