import {defineConfig} from "vite";
import {viteSingleFile} from "vite-plugin-singlefile";

export default defineConfig({
  // Relative asset URLs so the built file works from any sub-path, not just
  // the host root. The images resolve against the document, which is
  // /games/bee/index.html once the gallery has staged it.
  base: "./",

  // The code — JS, CSS, the manifest — is inlined into one index.html. Images
  // are not: see build.assetsInlineLimit below.
  //
  // useRecommendedBuildConfig is off because the recommended config's whole
  // point is `assetsInlineLimit: () => true`, which base64s every image into
  // the bundle. The parts of it worth having are set by hand underneath.
  plugins: [viteSingleFile({useRecommendedBuildConfig: false})],

  // host: true binds 0.0.0.0 so the iPad on the same Wi-Fi can reach it.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },

  build: {
    target: "es2022",
    // One file is the point here, so the "chunk is large" advice doesn't apply.
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: false,
    /**
     * Never inline an asset.
     *
     * The three jpgs are 185 kB on disk and about 250 kB as base64, which was
     * most of the built index.html — and being part of the HTML meant they
     * were re-downloaded in full on every deploy, however untouched. As files
     * they get a content hash in the name instead: the URL only changes when
     * the bytes do, so they can be cached for a year and left alone by a new
     * version. See the immutable cache in site/build.mjs.
     */
    assetsInlineLimit: 0,
    /**
     * Assets at the root of dist, beside index.html, rather than in assets/.
     *
     * Vite writes the URL relative to the *chunk* that imports it, as
     * `new URL("name-hash.jpg", import.meta.url)`. That chunk then gets
     * inlined into index.html, so import.meta.url becomes the document's URL
     * — and a sibling path is only right if the image is a sibling of the
     * HTML. With the default assets/ directory the built game looks for its
     * pictures one level too high and renders black frames.
     */
    assetsDir: "",
    rollupOptions: {
      // One chunk, so there is a single script for the plugin to inline.
      output: {inlineDynamicImports: true},
    },
  },
});
