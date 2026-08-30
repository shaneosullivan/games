import * as THREE from "three";
import {WATER} from "../config";

/**
 * The look of the whole game, in one place: flat bands of colour instead of a
 * smooth falloff, which is what makes it read as cartoon rather than as a
 * rendering. Same approach as the bee and squirrel games, so art moves between
 * the three.
 */

/** 3-band gradient ramp. MeshToonMaterial samples this instead of a smooth
 *  Lambert falloff. */
function makeToonRamp(): THREE.DataTexture {
  const bands = new Uint8Array([140, 200, 240, 255]);
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

/**
 * The dappled light: sunlight bent by the waves and thrown on the sand.
 *
 * A tiling texture drawn once into a canvas, multiplied over whatever it lands
 * on, and scrolled. The pattern is the sum of three sine gratings at angles
 * that don't divide into each other, pushed hard through a curve — summed
 * sines give smooth hills, and caustics are not hills: they are thin bright
 * lines with wide dark gaps, which is what the exponent buys.
 *
 * Every frequency is a whole number of cycles across the canvas, so the tile
 * repeats seamlessly. It is the one thing that stops a hundred-unit sandbank
 * from reading as a flat brown wall.
 */
let caustic: THREE.Texture | null = null;
export function causticTexture(): THREE.Texture {
  if (caustic) {
    return caustic;
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context for the caustics");
  }
  const image = ctx.createImageData(size, size);
  const waves: Array<[number, number, number]> = [
    // [cycles across x, cycles across y, phase]
    [3, 1, 0],
    [-1, 3, 1.9],
    [2, -2, 3.7],
  ];
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (const [fx, fy, phase] of waves) {
        sum += Math.sin(((x * fx + y * fy) / size) * tau + phase);
      }
      // -3..3 folded to 0..1, then squeezed toward the bright ridges.
      const ridge = Math.pow(Math.abs(sum) / 3, 2.6);
      // Never fully dark: this multiplies the sand, and a black tile would
      // punch holes in the sea floor rather than dapple it.
      const v = 150 + ridge * 105;
      const i = (y * size + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  caustic = new THREE.CanvasTexture(canvas);
  caustic.wrapS = THREE.RepeatWrapping;
  caustic.wrapT = THREE.RepeatWrapping;
  caustic.colorSpace = THREE.SRGBColorSpace;
  return caustic;
}

/**
 * Slides the dapple along — which is the whole of the animation, and now the
 * whole of what ties it to the water overhead.
 *
 * It travels in the leading wave's direction at that wave's own speed, and
 * surges back and forth with its phase. Before this it slid at a constant rate
 * of its own choosing, which meant the light on the sand and the swell casting
 * it were two animations that merely shared a scene. Locking them is the
 * cheapest real gain available here: nobody can name what changed, and
 * everybody can see that it did.
 *
 * The speed is turned into texture space by `causticScale`, which is how many
 * times the tile repeats over a unit of floor — so the pattern slides across
 * the sand exactly as fast as the crests slide across the sky.
 */
export function driftCaustics(
  texture: THREE.Texture,
  time: number,
  swell: {dx: number; dz: number; speed: number; k: number},
  phase: number,
): void {
  const travelled = (swell.speed / swell.k) * time * WATER.causticScale;
  const surge = Math.sin(phase) * WATER.causticSurge;
  texture.offset.set(
    swell.dx * travelled + surge,
    swell.dz * travelled + Math.cos(phase) * WATER.causticSurge,
  );
}

/**
 * A sunbeam, drawn once into a canvas and reused.
 *
 * Bright along its middle and gone at its edges, bright at the top and gone at
 * the bottom: light coming through the surface and running out of strength on
 * the way down. The first version put a radial glow on the side of a cylinder,
 * which gave a vague haze with no direction in it — a beam needs the fade to
 * be *along* it, and that is a gradient in the texture rather than a shape in
 * the geometry.
 */
let shaft: THREE.Texture | null = null;
export function shaftTexture(): THREE.Texture {
  if (shaft) {
    return shaft;
  }
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context for the sunbeams");
  }
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // Full strength at the top, nothing by the bottom, and cubed so most of
    // the length is already faint — a beam that stayed bright all the way down
    // reads as a wall.
    const down = Math.pow(1 - y / (h - 1), 2.4);
    for (let x = 0; x < w; x++) {
      const across = Math.abs(x / (w - 1) - 0.5) * 2;
      const core = Math.pow(Math.max(0, 1 - across), 2.2);
      const v = Math.round(255 * core * down);
      const i = (y * w + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = v;
    }
  }
  ctx.putImageData(image, 0, 0);
  shaft = new THREE.CanvasTexture(canvas);
  shaft.colorSpace = THREE.SRGBColorSpace;
  return shaft;
}

/**
 * A soft round glow, drawn once into a canvas and reused. The bubbles are
 * built out of it.
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
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Falls away fast at first and then slowly: a hard core with a wide, faint
  // halo, which is what reads as light rather than as a painted disc.
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.14)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}
