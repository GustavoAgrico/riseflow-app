import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p) => fileURLToPath(new URL(p, import.meta.url))

// Config separada do vite.config.js (o build de produção não é afetado).
// Espelha os aliases de caminho do projeto.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': r('./src'),
      '@components': r('./src/components'),
      '@pages': r('./src/pages'),
      '@context': r('./src/context'),
      '@constants': r('./src/constants'),
      '@lib': r('./src/lib'),
      '@services': r('./src/services'),
      '@hooks': r('./src/hooks'),
      '@utils': r('./src/utils'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
