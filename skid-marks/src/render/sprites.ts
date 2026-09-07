import * as THREE from "three";

/**
 * Flat things, seen from above.
 *
 * Everything in this game is a plane lying in the XZ plane with an unlit
 * material on it. There is no shading anywhere: the plan asks for the Amiga
 * game, and that game is flat colour and sprites.
 *
 * The height offsets are the layering. Nothing here is ever seen edge-on, so a
 * tenth of a unit is as good as a thousand — it is only ever deciding what is
 * drawn over what.
 */

/** How high off the ground each kind of thing sits. Bigger is nearer the eye. */
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

/**
 * Unlit flat colour. Every material in the game is one of these.
 *
 * Double-sided, and that is not a detail. Everything here is a flat thing
 * lying face-up, and half of it is built by hand as triangle strips along the
 * circuit — get the winding backwards on one of those and it is simply not
 * drawn, with nothing in the console to say so. The first build of this game
 * had no road in it for exactly that reason. Nothing is ever seen edge-on, so
 * there is nothing to lose by drawing both faces.
 */
export function flat(colour: number, opacity = 1): THREE.MeshBasicMaterial {
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

/** Unlit, vertex-coloured: one draw call for a whole merged assembly. See
 *  `flat` for why both sides are drawn. */
export function flatVertex(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
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
