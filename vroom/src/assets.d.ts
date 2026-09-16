/**
 * Model files, the cow's. `vite/client` covers images and the rest of Vite's
 * built-in asset types, but not glTF — without this, importing one is a type
 * error even though the bundler handles it perfectly well. Named for what it
 * declares rather than `models.d.ts`, which would shadow `src/models/`.
 */
declare module "*.glb" {
  const src: string;
  export default src;
}
