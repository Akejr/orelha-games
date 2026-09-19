import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const SERVER_URL = process.env.ORELHA_SERVER_URL ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@shared': path.resolve(here, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: SERVER_URL, ws: true, changeOrigin: true },
      '/api': { target: SERVER_URL, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/socket.io': { target: SERVER_URL, ws: true, changeOrigin: true },
      '/api': { target: SERVER_URL, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
