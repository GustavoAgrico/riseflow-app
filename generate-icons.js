// Gera placeholders de ícones PWA copiando o SVG base para cada tamanho .png.
// Uso: node generate-icons.js
// NOTA: em produção, substitua os .png por PNGs rasterizados reais
// (ex.: `npx pwa-asset-generator public/icons/icon.svg public/icons`).
import { copyFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), 'public', 'icons')
const src = join(iconsDir, 'icon.svg')
const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

for (const size of sizes) {
  copyFileSync(src, join(iconsDir, `icon-${size}.png`))
}
console.log(`✓ ${sizes.length} ícones gerados em public/icons/`)
