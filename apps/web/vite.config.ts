/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // En desarrollo, /api se reenvía a la API: el navegador ve un solo origen (igual que en
    // producción), así las cookies SameSite=Strict funcionan sin configurar CORS.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    // En Windows el arranque de forks agotó el plazo antes de cargar los tests.
    // La suite de componentes usa un worker thread; no cambia aserciones ni timeouts.
    pool: 'threads',
    maxWorkers: 1,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
