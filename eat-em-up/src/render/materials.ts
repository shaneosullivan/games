import * as THREE from "three";

/**
 * The look of the whole game, in one place: flat bands of colour instead of a
 * smooth falloff, which is what makes it read as cartoon rather than as a
 * rendering. Same approach as the bee game, so art moves between the two.
 */

/** 3-band gradient ramp. MeshToonMaterial samples this instead of a smooth
 *  Lambert falloff. */
function makeToonRamp(): THREE.DataTexture {
  const bands = new Uint8Array([130, 195, 238, 255]);
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
