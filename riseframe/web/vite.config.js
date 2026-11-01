import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// Versão do app = a do riseframe/package.json (a mesma do servidor e do app de PC):
// o selo "vX.Y.Z" no site nunca mais fica para trás.
const RF_VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  plugins: [react()],
  define: { __RF_VERSION__: JSON.stringify(RF_VERSION) },
  // Evita herdar a config PostCSS/Tailwind do repositório pai (RiseFlow).
  // O Riseframe usa apenas estilos inline.
  css: { postcss: {} },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
