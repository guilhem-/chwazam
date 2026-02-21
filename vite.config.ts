import { defineConfig } from 'vite';

export default defineConfig({
  base: '/chwazam/',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
  },
});
