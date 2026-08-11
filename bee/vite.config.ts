import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Relative asset URLs so the built file works from any sub-path, not just
  // the host root.
  base: './',

  // Everything — JS, CSS, the manifest — ends up inlined in one index.html.
  plugins: [viteSingleFile()],

  // host: true binds 0.0.0.0 so the iPad on the same Wi-Fi can reach it.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },

  build: {
    target: 'es2022',
    // One file is the point here, so the "chunk is large" advice doesn't apply.
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
});
