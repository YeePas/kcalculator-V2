import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'index.html',
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: '/',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: true,
    pool: 'threads',
  },
});
