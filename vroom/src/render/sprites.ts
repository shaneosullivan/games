import * as THREE from "three";
import {fadeInFront, NearFade} from "../../../shared/fadeInFront";
import {material, Substance} from "./materials";

/**
 * The two kinds of thing in the scene, and how each is drawn.
 *
 * **Flats** lie in the XZ plane and are the ground and everything painted on
 * it: the road, its kerbs, the start line, the patches, the skid marks. They
 * do not write to the depth buffer, and what is drawn over what is decided
 * entirely by `order()` below — the LAYER heights exist only to stop coplanar
 * faces fighting.
 *
 * **Solids** have a top and sides: the cars, the tyre stacks, the trees, the
 * barrier walls. They do write depth, so they occlude each other properly, and
 * they are all drawn after the flats.
 *
 * Both are lit, and both are physically based. The flats were unlit for a
 * while, because the ribbons built by hand along the circuit were wound
 * face-down and lighting them turned the road black. They are wound the right
 * way now and carry their own upward normals, so tarmac gathers the sky the
 * way tarmac does — which is most of what stops a road looking like a stripe
 * of paint.
 */

/**
 * How high off the ground each kind of thing sits. Bigger is nearer the eye.
 *
 * The heights alone do not decide what is drawn over what, and it is worth
 * being clear about why: nothing in this game writes to the depth buffer, so
 * every one of these flat things passes the depth test and the *order* they
 * are drawn in is the whole of the stacking. Left to three's own sort that
 * order is near enough right by accident and wrong where it matters — the
 * car's shadow came out on top of the car in mid-air. So every mesh states
 * its place with `order()` below, and the heights are kept only to stop
 * coplanar faces fighting.
 */
export const LAYER = {
  grass: 0,
  sand: 0.1,
  tarmac: 0.2,
  kerb: 0.3,
  paint: 0.4,
  skid: 0.5,
  scenery: 0.8,
  shadow: 0.9,
  car: 1,
} as const;

/** A LAYER as a renderOrder: what is drawn over what, said out loud. */
export function order(height: number): number {
  return Math.round(height * 100);
}

/**
 * A flat, in one colour.
 *
 * Double-sided, and that is not a detail. Everything here lies face-up, and
 * half of it is built by hand as triangle strips along the circuit — get the
 * winding backwards on one of those and it is simply not drawn, with nothing
 * in the console to say so. The first build of this game had no road in it for
 * exactly that reason. A flat is never seen edge-on, so there is nothing to
 * lose by drawing both faces.
 */
export function flat(colour: number, opacity = 1): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: colour,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Paints every vertex one colour so the geometry can be merged with others.
 *
 * Also de-indexes: three's primitives are a mix of indexed and non-indexed and
 * mergeGeometries refuses to mix the two, so everything that might be merged
 * goes through here. The same helper the other games use.
 */
export function paint(
  source: THREE.BufferGeometry,
  colour: number,
): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  // Everything that might be merged has to carry the same set of attributes,
  // and three's own primitives do not agree: ConvexGeometry has no uv at all,
  // so a hull merged with a box is refused. Filling in the missing ones here
  // is one line and saves the caller ever thinking about it.
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  if (!geo.attributes.uv) {
    const count = geo.attributes.position.count;
    geo.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(count * 2), 2),
    );
  }
  /* No convertSRGBToLinear here. three converts a hex into the linear working
     space the moment the Color is constructed, and a vertex colour attribute
     is read as already-linear — converting again renders every piece of
     geometry at about a third of its brightness. The tell was that the grass
     looked right and nothing else did: the grass is the scene background,
     which the renderer writes out untouched. */
  const c = new THREE.Color(colour);
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

/** A flat, vertex-coloured: one draw call for a whole merged assembly. See
 *  `flat` for why both sides are drawn. */
export function flatVertex(
  substance: Substance = "verge",
): THREE.MeshStandardMaterial {
  return material(substance, {doubleSided: true, decal: true});
}

/**
 * A solid, vertex-coloured: something with a top and sides.
 *
 * Writes depth, unlike everything flat, because two solids can genuinely be in
 * front of one another and no amount of draw order will sort that out — a car
 * passing behind a tyre stack has to actually go behind it. Single-sided:
 * these are closed shapes and the inside of one is never seen.
 */
export function solidVertex(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({vertexColors: true});
}

/**
 * A solid that dissolves when it stands between the camera and the car.
 *
 * Needed the moment the shot went diagonal. Looking straight down, nothing
 * could ever be in the way; from a diagonal, a tree or a tyre stack on the
 * near side of the road is directly in front of the thing the child is
 * steering, and a player who cannot see their car is stuck.
 *
 * The shader is the shared one — it is a cone, an instance matrix and a
 * discard that all have to be right together, and a second copy is a second
 * thing to get wrong.
 */
export function fadingVertex(cacheKey: string): {
  material: THREE.MeshLambertMaterial;
  fade: NearFade<THREE.MeshLambertMaterial>;
} {
  const material = new THREE.MeshLambertMaterial({vertexColors: true});
  const fade = fadeInFront(material, {band: 26, cutoff: 0.28, cacheKey});
  return {material, fade};
}

/**
 * A box standing on the ground, in one colour, centred on the origin in X and
 * Z and sitting on y = base.
 *
 * The workhorse for everything with height, the way `tile` is for everything
 * without it.
 */
export function block(
  width: number,
  height: number,
  depth: number,
  base: number,
  colour: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth);
  geo.translate(0, base + height / 2, 0);
  return paint(geo, colour);
}

/** A round thing standing on the ground: a tyre stack, a tree trunk. */
export function post(
  radius: number,
  height: number,
  base: number,
  sides: number,
  colour: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, height, sides);
  geo.translate(0, base + height / 2, 0);
  return paint(geo, colour);
}

/**
 * A flat rectangle lying face-up at a height, centred on the origin.
 *
 * The workhorse: a car, a tyre stack, a skid mark and a start line are all
 * this with a different size and colour on them.
 */
export function tile(
  width: number,
  depth: number,
  colour: number,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  return paint(geo, colour);
}
