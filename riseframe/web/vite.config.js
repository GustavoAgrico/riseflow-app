import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
