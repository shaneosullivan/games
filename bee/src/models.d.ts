/**
 * The two model files in level 7. `vite/client` covers images and the rest of
 * Vite's built-in asset types, but not glTF — without this, importing one is a
 * type error even though the bundler handles it perfectly well.
 */
declare module "*.glb" {
  const src: string;
  export default src;
}
