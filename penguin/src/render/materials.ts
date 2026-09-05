import * as THREE from "three";

/**
 * The look of the whole game, in one place: flat bands of colour instead of a
 * smooth falloff, which is what makes it read as cartoon rather than as a
 * rendering. The same approach as the bee and the caterpillar, so art moves
 * between them.
 */

/**
 * The gradient ramp MeshToonMaterial samples instead of a smooth Lambert
 * falloff.
 *
 * Brighter at the dark end than the other games' ramps, but not by as much as
 * it first was. Snow in shadow is still snow — it goes blue, not grey — and a
 * ramp that took the shaded side of a drift down to 130 turned every hollow on
 * the hill into a hole. At 176 it had the opposite problem: a white hill under
 * a white sky with no shading in it at all, where a child could not see the
 * rolls in the ground until they were airborne off one.
 */
function makeToonRamp(): THREE.DataTexture {
  const bands = new Uint8Array([164, 200, 234, 255]);
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

/** The palette, so the same white is the same white everywhere. */
export const PALETTE = {
  snow: 0xf6fbff,
  snowShade: 0xd3e4f2,
  ice: 0xdcf0f9,
  rock: 0x8e97a3,
  rockDark: 0x76808d,
  bark: 0x6b4a35,
  pine: 0x2f6b46,
  pineDeep: 0x24553a,
  belly: 0xfdfdfb,
  back: 0x4a5d80,
  beak: 0xf2a03d,
  foot: 0xe98b2f,
  cheek: 0xffc9d4,
  fish: 0xa9c4d6,
  fishBelly: 0xe9f2f7,
  flagRed: 0xe2554c,
  flagBlue: 0x4a86c9,
  sea: 0x2f7fa8,
  scarf: 0xd94f4f,
  hat: 0xe2554c,
} as const;
