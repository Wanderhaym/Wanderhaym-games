import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // The legacy Mini App left a second, unused 4 MB soundtrack in public/.
  // Every runtime asset is imported by Vite now, so publishing public/ would
  // only make the VK bundle heavier without changing what visitors hear.
  publicDir: false,
  build: {
    emptyOutDir: true,
    target: 'es2020',
    // Do not ship source maps to the public VK static host. They are larger
    // than the complete optimized experience and are not used at runtime.
    sourcemap: false,
    rollupOptions: { input: 'index.html' },
  },
});
