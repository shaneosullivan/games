import * as THREE from "three";

/**
 * Every material in the game, by what a thing is made of.
 *
 * The game used to be unlit flat colour, which was right when the camera
 * looked straight down at it and is not right now. These are physically based:
 * they have a metalness and a roughness, they take the environment map the
 * stage builds, and they respond to the lights in the scene — which is what
 * makes a car look like it is made of painted metal rather than coloured
 * paper.
 *
 * Colour comes from the geometry rather than the material. Everything is
 * vertex-coloured so a whole assembly of one substance — all the painted parts
 * of a car, every trunk in a wood — is a single draw call whatever colours are
 * in it. `paint()` in sprites.ts is what writes those colours.
 *
 * Materials are shared and cached by kind. Two hundred trees want one material
 * between them, not two hundred.
 */
export type Substance =
  | "bodywork"
  | "rubber"
  | "chrome"
  | "glass"
  | "matte"
  | "road"
  | "verge"
  | "concrete"
  | "foliage";

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * The recipes.
 *
 * Roughness is the number that does the work in every one of them: it decides
 * how much of the environment a surface gathers, and it is the whole
 * difference between wet tarmac and dry, between a polished wing and a painted
 * one.
 */
const RECIPES: Record<Substance, THREE.MeshStandardMaterialParameters> = {
  // Car paint: a clear-coat look without the cost of one. Enough metalness to
  // catch the sky, enough roughness not to be a mirror.
  bodywork: {metalness: 0.55, roughness: 0.28},
  // Tyres, and anything else that gathers no light at all.
  rubber: {metalness: 0.0, roughness: 0.92},
  chrome: {metalness: 1.0, roughness: 0.18},
  // Not real glass. Transmission costs a second render of the whole scene and
  // buys almost nothing on a windscreen four pixels tall; a dark, very smooth,
  // slightly metallic surface reads as glass from here and is free.
  glass: {metalness: 0.85, roughness: 0.06},
  matte: {metalness: 0.0, roughness: 0.85},
  // Tarmac. Rough, but not so rough that it stops reflecting the sky
  // altogether — a road with no sheen at all looks like felt.
  road: {metalness: 0.0, roughness: 0.72},
  verge: {metalness: 0.0, roughness: 0.95},
  concrete: {metalness: 0.05, roughness: 0.8},
  // Leaves are lit from inside a bit, or a wood at this scale reads as a hole.
  foliage: {metalness: 0.0, roughness: 0.88},
};

export function material(
  kind: Substance,
  options: {flat?: boolean; doubleSided?: boolean; decal?: boolean} = {},
): THREE.MeshStandardMaterial {
  const key = `${kind}|${options.flat ? "f" : ""}|${options.doubleSided ? "d" : ""}|${options.decal ? "x" : ""}`;
  const had = cache.get(key);
  if (had) {
    return had;
  }
  const made = new THREE.MeshStandardMaterial({
    ...RECIPES[kind],
    vertexColors: true,
    flatShading: options.flat ?? false,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    // A decal lies on the ground and is stacked by draw order rather than by
    // depth — the road, its markings, the rubber laid on top of them. They are
    // coplanar by design, so letting them write depth would set them fighting.
    depthWrite: !options.decal,
  });
  cache.set(key, made);
  return made;
}

/**
 * Something that gives off light: a neon tube, a brake light, a headlight.
 *
 * Emissive white with the colour carried by the vertices, so one material
 * serves a whole city of signs in every colour there is. The strength is well
 * over one on purpose — the bloom pass keys off values above the display range
 * and that is what makes a tube glow rather than merely being bright.
 */
export function glow(strength: number): THREE.MeshStandardMaterial {
  const key = `glow|${strength}`;
  const had = cache.get(key);
  if (had) {
    return had;
  }
  const made = new THREE.MeshStandardMaterial({
    vertexColors: true,
    emissive: 0xffffff,
    emissiveIntensity: strength,
    // The emissive is tinted by the vertex colour through the map slot below;
    // three multiplies emissive by emissiveMap only, so the base colour is
    // what carries the tint and the material is left black otherwise.
    color: 0x000000,
    roughness: 1,
    metalness: 0,
  });
  // Vertex colours modulate the diffuse, which is black here, so the tint has
  // to be put on the emissive by hand. One line of shader rather than one
  // material per colour.
  made.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec3 totalEmissiveRadiance = emissive;",
      "vec3 totalEmissiveRadiance = emissive * vColor.rgb;",
    );
  };
  made.customProgramCacheKey = () => `glow${strength}`;
  cache.set(key, made);
  return made;
}

/** Forgets every material. Called when a race is torn down, so a second race
 *  does not inherit the first one's environment map on a disposed context. */
export function clearMaterials(): void {
  for (const m of cache.values()) {
    m.dispose();
  }
  cache.clear();
}

/** Hands every cached material the stage's environment map. */
export function setEnvironment(map: THREE.Texture, intensity: number): void {
  for (const m of cache.values()) {
    m.envMap = map;
    m.envMapIntensity = intensity;
    m.needsUpdate = true;
  }
}
