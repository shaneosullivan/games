import * as THREE from "three";

/**
 * 3-band gradient ramp. MeshToonMaterial samples this instead of a smooth
 * Lambert falloff, which is what gives the chunky "toy plastic" look in the
 * reference art.
 */
function makeToonRamp(): THREE.DataTexture {
  const bands = new Uint8Array([120, 190, 236, 255]);
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

/** Toon material driven by per-vertex colour, so a whole merged prop is one draw call. */
export function vertexToon(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp(),
  });
}

export function solidToon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({color, gradientMap: toonRamp()});
}

/**
 * Paints every vertex a single colour so the geometry can be merged with
 * others. Also de-indexes: three's primitives are a mix of indexed
 * (Cylinder, Sphere, Torus) and non-indexed (Icosahedron), and
 * mergeGeometries refuses to mix the two.
 */
export function paint(
  source: THREE.BufferGeometry,
  color: number,
): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  const c = new THREE.Color(color).convertSRGBToLinear();
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
