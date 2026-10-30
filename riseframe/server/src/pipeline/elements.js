// Elementos prontos que vão com o app (objetos 3D e rabiscos das cenas de motion).
// O cliente manda só o id ("hourglass", "doodles/underline"); o arquivo sai daqui.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENT_ASSETS, elementExt } from '../../../shared/sceneElements.js';
import { SCENE_BACKGROUNDS } from '../../../shared/kinetic.js';
import { DECORATIVE_STICKERS } from '../../../shared/elementMotion.js';

export const ELEMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'elements');

const ALLOWED = new Set([...ELEMENT_ASSETS, ...DECORATIVE_STICKERS.map((s) => `doodles/${s.id}`), ...SCENE_BACKGROUNDS.map((b) => `backgrounds/${b}`)]);

/** Id válido de elemento (ou null). */
export function cleanElementId(id) {
  return typeof id === 'string' && ALLOWED.has(id) ? id : null;
}

/** Caminho do PNG do elemento (ou null se o id não vale ou o arquivo não existe). */
export function elementFile(id) {
  const ok = cleanElementId(id);
  if (!ok) return null;
  const file = path.join(ELEMENTS_DIR, `${ok}.${elementExt(ok)}`);
  return fs.existsSync(file) ? file : null;
}
