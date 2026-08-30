import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {Rng} from "../core/rng";
import {paint} from "../render/materials";

const TAU = Math.PI * 2;

/**
 * The things that grow out of the sand: giant kelp, and the seaweed under it.
 *
 * Kelp is not coral and is not built like it. A coral is a branching skeleton;
 * a kelp is one long rope from the floor to the light with leaves hung off it,
 * every leaf carrying a gas-filled bulb at its base to hold the whole plant
 * up. That bulb is the thing that makes it read as kelp rather than as a very
 * tall weed, and it is why the blades all point *upward* from where they join.
 *
 * Both are painted in greys with the hue on the instance, like the coral —
 * except the kelp, where the gradient from olive at the holdfast to gold at the
 * top is most of what it looks like, so that is baked into the vertices and the
 * instance only shifts it.
 */

/** Blades are flat, so they need to be lit from both sides. */
export function bladeMaterial(ramp: THREE.Texture): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: ramp,
    side: THREE.DoubleSide,
  });
}

/** How tall a kelp plant is built, in world units. The reef scales each one
 *  by a single number off this, never separately in Y — see kelpPlant. */
export const KELP_HEIGHT = 60;

/**
 * One kelp plant, growing from the origin up +Y.
 *
 * Built at a real size and scaled **uniformly**, which matters more than it
 * sounds. The first version was built at unit height so the reef could stretch
 * each plant in Y to fit the water above it — and that stretched the blades
 * with it, by a factor of seventy, into threads a fraction of a unit wide and
 * sixty long. A kelp forest came out as a stand of bare wires.
 *
 * So the fitting is done with one scale for all three axes, and a plant in
 * shallow water is a smaller plant rather than a squashed one. Real kelp comes
 * to the same thing: it grows until it reaches the light and then stops.
 */
export function kelpPlant(): THREE.BufferGeometry {
  const rng = new Rng(99001);
  const parts: Array<THREE.BufferGeometry> = [];
  const blades = 15;

  // The stipe: one rope, leaning as it climbs. Eight segments, because it has
  // to bend and a straight one reads as a pole.
  const lean = rng.range(-0.06, 0.06);
  const points: Array<THREE.Vector3> = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    points.push(
      new THREE.Vector3(
        Math.sin(t * 2.1) * lean * 3,
        t,
        Math.cos(t * 1.4) * lean * 2,
      ),
    );
  }
  const stipe = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    8,
    0.009,
    4,
    false,
  );
  parts.push(paint(stipe, 0xcfcfcf));

  // The holdfast: the knot of roots it grips the rock with.
  const hold = new THREE.IcosahedronGeometry(0.035, 0);
  hold.scale(1.4, 0.6, 1.4);
  parts.push(paint(hold, 0x8a8a8a));

  for (let i = 0; i < blades; i++) {
    // Up the stipe, alternating round it — kelp puts its blades out in a
    // spiral rather than in ranks.
    const t = 0.14 + (i / blades) * 0.84;
    const a = i * 2.4 + rng.range(-0.3, 0.3);
    const at = new THREE.Vector3(
      Math.sin(t * 2.1) * lean * 3,
      t,
      Math.cos(t * 1.4) * lean * 2,
    );

    // The float: a little gas bladder where the blade joins the stipe.
    const bulb = new THREE.IcosahedronGeometry(0.021, 0);
    bulb.scale(1, 1.35, 1);
    bulb.translate(at.x + Math.cos(a) * 0.02, at.y, at.z + Math.sin(a) * 0.02);
    parts.push(paint(bulb, 0xf0f0f0));

    parts.push(blade(rng, at, a, rng.range(0.17, 0.29)));
  }

  const geo = mergeGeometries(parts, false);
  // Built at unit height for the arithmetic above, and blown up to a real one
  // here — so everything downstream can scale it by a single number.
  geo.scale(KELP_HEIGHT, KELP_HEIGHT, KELP_HEIGHT);
  return geo;
}

/**
 * One kelp blade: a long ribbon leaving the stipe and curving up toward the
 * light, twisting as it goes.
 *
 * A grid rather than a quad, because the whole character of it is the bend.
 */
function blade(
  rng: Rng,
  at: THREE.Vector3,
  around: number,
  length: number,
): THREE.BufferGeometry {
  const steps = 5;
  const width = rng.range(0.038, 0.062);
  const geo = new THREE.PlaneGeometry(width, length, 1, steps);
  geo.translate(0, length / 2, 0);

  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const droop = rng.range(0.5, 1.1);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / length;
    // Out from the stipe and then over: it leaves almost horizontally, rises,
    // and the tip falls away again. Kelp hangs.
    const out = Math.sin(t * 1.5) * length * 0.85;
    const up = t * length * 0.75 - droop * t * t * length * 0.5;
    // A twist along the ribbon, so it is never edge-on for its whole length.
    const twist = t * rng.range(-1.2, 1.2);
    const x = pos.getX(i);
    pos.setXYZ(i, out + x * Math.cos(twist), up, x * Math.sin(twist));

    // Olive where it joins, pale gold at the tip. The gradient is baked in
    // because it is most of what a kelp forest looks like — and it starts high
    // rather than at nothing, because this multiplies an already-dark gold and
    // the first version came out as a stand of brown rags.
    const v = 0.74 + 0.26 * t;
    colours[i * 3] = v;
    colours[i * 3 + 1] = v;
    colours[i * 3 + 2] = v;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geo.rotateY(around);
  geo.translate(at.x, at.y, at.z);
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

/**
 * A tuft of seaweed for the sand: broad ribbons rather than blades of grass.
 *
 * The first version was seven thin cylinders, which from any distance was a
 * green smudge. Weed in shallow water is *leafy* — wide, floppy, overlapping —
 * and the width is what makes it read as a plant.
 */
export function weedTuft(): THREE.BufferGeometry {
  const rng = new Rng(99002);
  const parts: Array<THREE.BufferGeometry> = [];
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const h = rng.range(3.4, 7.2);
    const w = rng.range(0.7, 1.5);
    const geo = new THREE.PlaneGeometry(w, h, 1, 4);
    geo.translate(0, h / 2, 0);
    const pos = geo.attributes.position;
    const bend = rng.range(0.25, 0.8);
    for (let v = 0; v < pos.count; v++) {
      const t = pos.getY(v) / h;
      // Leaning over, more the higher up it goes.
      pos.setZ(v, pos.getZ(v) + bend * t * t * h * 0.45);
      // Narrowing to a point.
      pos.setX(v, pos.getX(v) * (1 - t * 0.55));
    }
    geo.rotateY((i / fronds) * TAU + rng.range(-0.4, 0.4));
    geo.translate(rng.range(-0.8, 0.8), 0, rng.range(-0.8, 0.8));
    geo.computeVertexNormals();
    parts.push(paint(geo.toNonIndexed(), i % 3 === 0 ? 0xffffff : 0xc0c0c0));
  }
  return mergeGeometries(parts, false);
}
