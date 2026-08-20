import {defineConfig} from "vite";
import {viteSingleFile} from "vite-plugin-singlefile";

// The same single-file setup the gallery expects of every game: one built
// index.html with the JS and CSS inlined, images and models left as siblings
// with content-hashed names. See bee/vite.config.ts for the full reasoning.
export default defineConfig({
  // Relative URLs so the built file works from any sub-path, not just a root.
  base: "./",

  plugins: [viteSingleFile({useRecommendedBuildConfig: false})],

  // Vite's built-in asset list doesn't include models, so a bare `.glb` import
  // would be handed to the JS parser and the build would die. This treats them
  // as assets — content-hashed, never inlined, beside index.html.
  assetsInclude: ["**/*.glb"],

  // host: true binds 0.0.0.0 so a tablet on the same Wi-Fi can reach it.
  server: {
    host: true,
    port: 5173,
  },

  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: false,
    // Never inline an asset; each gets a content hash so it caches for good.
    assetsInlineLimit: 0,
    // Assets beside index.html, not under assets/, because the inlined chunk
    // resolves their URLs against the document.
    assetsDir: "",
    rollupOptions: {
      output: {inlineDynamicImports: true},
    },
  },
});
