import fs from 'node:fs';
import { defineConfig } from 'vite';

// The app compares this with its cached product database and downloads it again on change.
// Stamped by scripts/validate_products.mjs.
const productsVersion = (() => {
  try { return JSON.parse(fs.readFileSync('public/products.json', 'utf8')).version || ''; } catch { return ''; }
})();

export default defineConfig({
  root: '.',
  define: {
    __PRODUCTS_VERSION__: JSON.stringify(productsVersion),
  },
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
