import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {Rng} from "../core/rng";
import {paint} from "../render/materials";

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The coral.
 *
 * Built by growing rather than by assembling: a trunk, which forks, whose
 * branches fork, four or five times down. That is the one thing every real
 * coral in the reference photographs has and no arrangement of primitives
 * does — a *dense* silhouette made of many fine twigs, where a handful of fat
 * arms reads as a plastic toy however well it is coloured.
 *
 * Everything here is painted in greys, from a dark trunk to white tips, and
 * the instance colour supplies the hue. So one shape is pink in one place and
 * orange twenty units along, and the shading inside it survives either way.
 * The rock each one stands on is a separate mesh for the same reason: it
 * shares the coral's transform but not its colour, because a bright magenta
 * boulder is not a thing.
 *
 * Each kind is seeded with its own fixed number, so a coral never changes
 * shape because something elsewhere in the reef asked the world's generator
 * for one more value.
 */

interface Growth {
  /** How many times a branch forks before the twigs stop. */
  depth: number;
  /** How many branches come off each fork. */
  forks: number;
  /** How far a child leans off its parent, radians. */
  spread: number;
  /** What a child keeps of its parent's length and thickness. */
  shorten: number;
  thin: number;
  /** Flat corals — the sea fans — keep every branch in one plane. */
  flat: boolean;
  /** A blob on the end of the finest twigs. Reads as the granular texture
   *  that a few hundred triangles cannot actually carry. */
  bud: number;
}

/**
 * One branch, and everything that grows off it.
 *
 * The cylinder is built along +Y and then turned to face `dir`, which is the
 * only sane way round: building it between two points means solving for the
 * rotation anyway, and this way the taper is the right way up.
 */
function grow(
  parts: Array<THREE.BufferGeometry>,
  base: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  radius: number,
  left: number,
  rng: Rng,
  g: Growth,
): void {
  const tipRadius = radius * g.thin;
  // Open-ended, and four sides. The caps are inside the joints where nothing
  // can see them, and they were a third of the coral's triangles — a reef of
  // six hundred bushes is not the place to pay for geometry nobody looks at.
  const geo = new THREE.CylinderGeometry(tipRadius, radius, length, 4, 1, true);
  geo.translate(0, length / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
  geo.translate(base.x, base.y, base.z);
  // Dark at the trunk, white at the tips. Real coral pales toward its growing
  // ends, and it is what stops a dense bush reading as one solid lump.
  const shade = 0.55 + 0.45 * (1 - left / g.depth);
  parts.push(paint(geo, grey(shade)));

  const tip = base.clone().addScaledVector(dir, length);

  if (left <= 0) {
    if (g.bud > 0) {
      const bud = new THREE.IcosahedronGeometry(radius * g.bud, 0);
      bud.translate(tip.x, tip.y, tip.z);
      parts.push(paint(bud, grey(1)));
    }
    return;
  }

  // A perpendicular to lean the children off. For a flat coral it is always
  // the same one, so the whole fan stays in its plane.
  const side = new THREE.Vector3();
  for (let i = 0; i < g.forks; i++) {
    const child = dir.clone();
    if (g.flat) {
      side.set(0, 0, 1);
      const lean = (i / Math.max(1, g.forks - 1) - 0.5) * 2 * g.spread;
      child.applyAxisAngle(side, lean * rng.range(0.75, 1.25));
    } else {
      // Any perpendicular will do as the tilt axis; rolling it round the
      // parent afterwards is what spreads the children evenly about it.
      side.set(dir.z, dir.x, dir.y).cross(dir).normalize();
      child.applyAxisAngle(side, g.spread * rng.range(0.7, 1.3));
      child.applyAxisAngle(dir, (i / g.forks) * TAU + rng.range(-0.4, 0.4));
    }
    // Always a little upward: coral grows toward the light, and branches that
    // only fork sideways droop into a mushroom.
    child.y += 0.22;
    child.normalize();
    grow(
      parts,
      tip,
      child,
      length * g.shorten * rng.range(0.82, 1.18),
      radius * g.thin,
      left - 1,
      rng,
      g,
    );
  }
}

function grey(v: number): number {
  const b = Math.max(0, Math.min(255, Math.round(v * 255)));
  return (b << 16) | (b << 8) | b;
}

function bush(
  seed: number,
  g: Growth,
  trunk: number,
  radius: number,
): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const parts: Array<THREE.BufferGeometry> = [];
  grow(
    parts,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(
      rng.range(-0.1, 0.1),
      1,
      rng.range(-0.1, 0.1),
    ).normalize(),
    trunk,
    radius,
    g.depth,
    rng,
    g,
  );
  return mergeGeometries(parts, false);
}

/**
 * A sea fan: flat, and far finer than the rest. Photograph one and it is
 * mostly holes — so it forks a step deeper than the bushes and its twigs are
 * half the thickness.
 */
function seaFan(): THREE.BufferGeometry {
  return bush(
    77001,
    {
      depth: 5,
      forks: 2,
      spread: 0.52,
      shorten: 0.76,
      thin: 0.66,
      flat: true,
      bud: 0,
    },
    2.6,
    0.34,
  );
}

/** The workhorse: a bushy tree, forking in every direction. */
function bushCoral(): THREE.BufferGeometry {
  return bush(
    77002,
    {
      depth: 4,
      forks: 2,
      spread: 0.66,
      shorten: 0.78,
      thin: 0.7,
      flat: false,
      bud: 1.4,
    },
    2.4,
    0.5,
  );
}

/** Thick blunt fingers, barely forking — the staghorn-ish one. */
function fingerCoral(): THREE.BufferGeometry {
  return bush(
    77003,
    {
      depth: 3,
      forks: 2,
      spread: 0.5,
      shorten: 0.8,
      thin: 0.78,
      flat: false,
      bud: 1.9,
    },
    2.8,
    0.85,
  );
}

/**
 * The folded plate coral: a rosette of curled lettuce-like leaves.
 *
 * Not grown — this one is not a branching animal, and the reference for it is
 * a stack of frilled plates leaning out of a common middle.
 */
function plateCoral(): THREE.BufferGeometry {
  const rng = new Rng(77004);
  const parts: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 8; i++) {
    const r = rng.range(1.5, 2.6);
    // Half a sphere, squashed flat: a curled leaf with a lip.
    const leaf = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 1.15, 0, 1.25);
    leaf.scale(1, 0.85, 0.22);
    leaf.rotateX(rng.range(-0.5, -0.1));
    leaf.rotateY(rng.range(0, TAU));
    const lift = 0.7 + (i / 8) * 3.4;
    const out = 1.5 - (i / 8) * 1.1;
    const a = rng.range(0, TAU);
    leaf.translate(Math.cos(a) * out, lift, Math.sin(a) * out);
    parts.push(paint(leaf, grey(i % 2 === 0 ? 1 : 0.78)));
  }
  return mergeGeometries(parts, false);
}

/** The four shapes, in the order the reef hands out its instances. */
export function coralKinds(): Array<THREE.BufferGeometry> {
  return [seaFan(), bushCoral(), fingerCoral(), plateCoral()];
}

/**
 * The lump of rock a coral stands on.
 *
 * Every coral in the reference is growing out of one, and without it they look
 * like cut flowers pushed into the sand. It takes the coral's transform and
 * its own colour — see the note at the top about magenta boulders.
 */
export function coralRock(): THREE.BufferGeometry {
  const rng = new Rng(77005);
  const parts: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 5; i++) {
    const lump = new THREE.IcosahedronGeometry(rng.range(0.9, 1.6), 0);
    lump.scale(1, 0.55, 1);
    const a = (i / 5) * TAU;
    const out = i === 0 ? 0 : rng.range(0.7, 1.5);
    lump.translate(Math.cos(a) * out, rng.range(-0.2, 0.3), Math.sin(a) * out);
    parts.push(paint(lump, grey(i % 2 === 0 ? 1 : 0.82)));
  }
  return mergeGeometries(parts, false);
}
