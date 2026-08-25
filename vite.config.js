import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
    rollupOptions: { input: 'index.html' },
  },
});
