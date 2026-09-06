import * as THREE from "three";

/**
 * The look of the whole game, in one place: flat bands of colour instead of a
 * smooth falloff, which is what makes it read as cartoon rather than as a
 * rendering. The same approach as the other games here, so art moves between
 * them.
 */

/** The gradient ramp MeshToonMaterial samples instead of a smooth Lambert
 *  falloff. Three bands, and a shaded end that stays warm — a wood in the
 *  evening has no cold shadows in it. */
function makeToonRamp(): THREE.DataTexture {
  const bands = new Uint8Array([146, 192, 230, 255]);
  const tex = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  ramp ??= makeToonRamp();
  return ramp;
}

/** Toon material driven by per-vertex colour, so a whole merged prop is one
 *  draw call however many colours it uses. */
export function vertexToon(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp(),
  });
}

export function solidToon(colour: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({color: colour, gradientMap: toonRamp()});
}

/**
 * Paints every vertex one colour so the geometry can be merged with others.
 *
 * Also de-indexes. Three's primitives are a mix of indexed (Cylinder, Sphere,
 * Torus) and non-indexed (Icosahedron), and mergeGeometries refuses to mix the
 * two — so everything that might be merged goes through here.
 */
export function paint(
  source: THREE.BufferGeometry,
  colour: number,
): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  const c = new THREE.Color(colour).convertSRGBToLinear();
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** The palette, so the same brown is the same brown everywhere. */
export const PALETTE = {
  grass: 0x6faa52,
  grassDeep: 0x548a41,
  earth: 0xa98a63,
  earthDark: 0x6d5238,
  bark: 0x77563d,
  barkDark: 0x5d4230,
  leaf: 0x4f9440,
  leafDeep: 0x3d7a34,
  leafLight: 0x74b95a,
  stone: 0x9aa0a6,
  stoneDark: 0x7d848b,
  bramble: 0x3f6b39,
  berry: 0x8b3f7a,
  /** The hare. */
  fur: 0xc79a63,
  furLight: 0xe8cfa6,
  furDark: 0x9d7548,
  nose: 0xd98c9a,
  eye: 0x2a2118,
  /** The dogs: Irish wolfhounds, which are grey and shaggy and enormous. */
  dog: 0x8d8a83,
  dogDark: 0x6f6c66,
  dogLight: 0xc9c4b8,
  /** Not red. A wolfhound with a scarlet collar on read as a pet in a costume,
   *  and the red was the loudest thing in a wood full of greens and browns. */
  tongue: 0xdf9aa6,
  drool: 0xeef6f7,
  /** The magic. */
  cap: 0xe2634f,
  capGlow: 0x9ee8ff,
  stalk: 0xf3e8d6,
  fly: 0xfff2a8,
} as const;

/**
 * The rainbow the burrow goes off in.
 *
 * Saturated and no white, which is the shared fireworks' rule: a white spark
 * against a bright sky is a spark nobody sees.
 */
export const RAINBOW = [
  0xff4d5a, 0xff9c3d, 0xffe14d, 0x5ee06a, 0x4bc8ff, 0x7a6bff, 0xff6bd6,
] as const;

/**
 * A soft round glow, drawn once into a canvas and reused.
 *
 * For the fireflies and the shafts of light coming down through the leaves.
 * A sprite with a gradient in it is the whole of the trick — there is no bloom
 * pass in this game, and adding one for a few hundred motes would cost every
 * frame of the wood to light up a handful of them.
 */
let glow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glow) {
    return glow;
  }
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context for the glow");
  }
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Falls away fast at first and then slowly: a hard core with a wide, faint
  // halo, which is what reads as light rather than as a painted disc.
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(0.55, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}
