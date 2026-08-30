import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Only the portable loader is served verbatim. Keep the legacy public/
  // soundtrack out of the release bundle.
  publicDir: 'static',
  build: {
    emptyOutDir: true,
    target: 'es2020',
    // Do not ship source maps to the public VK static host. They are larger
    // than the complete optimized experience and are not used at runtime.
    sourcemap: false,
    rollupOptions: { input: 'index.html' },
  },
});
