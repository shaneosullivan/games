import {BUMP, CAR, PHYSICS} from "../config";
import type {Car} from "./car";

/**
 * Two cars hitting each other, as rigid bodies.
 *
 * Each car is what it looks like from above: a rectangle sixteen long and
 * seven wide, with a mass and a resistance to being turned (`PHYSICS.mass`
 * and `PHYSICS.inertia`, the same numbers the tyres work against). Where two
 * rectangles overlap, the corner that went in says where they touched and the
 * side it went through says which way they push, and the push is the impulse
 * that stops them closing at that point — plus a share back as a bounce, and
 * a rub along the touching faces for the friction of metal on metal.
 *
 * Because the push lands at the point of contact rather than at the middle,
 * everything else follows by itself. Nudge a car square from behind and it
 * is shoved forward. Clip its back corner and the back swings out. Hit it at
 * the nose from the side and the nose goes round and the car you hit with
 * turns the other way. The tyres take over from there, which is how a car
 * knocked sideways slides and then catches itself — or does not.
 *
 * It replaced two round discs that could only push each other apart along the
 * line between their middles, with a spin added by rule. A disc has no
 * corners, and a car mostly hits another car with one.
 *
 * Returns whether the two actually struck, rather than merely touched.
 */
export function collide(a: Car, b: Car): boolean {
  const dx = b.position.x - a.position.x;
  const dz = b.position.z - a.position.z;
  if (dx * dx + dz * dz > REACH * REACH * 4) {
    return false;
  }
  // Two cars at different heights — one in the air off a ramp — pass over.
  if (Math.abs(a.height - b.height) > BUMP.clears) {
    return false;
  }

  const boxA = box(a);
  const boxB = box(b);

  // Separating axes: the two sides of each box. The one they overlap least
  // along is the one they are pushed apart along.
  let depth = Infinity;
  let nx = 0;
  let nz = 0;
  for (const [ax, az] of [boxA.u, boxA.w, boxB.u, boxB.w]) {
    const [minA, maxA] = project(boxA, ax, az);
    const [minB, maxB] = project(boxB, ax, az);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= 0) {
      return false;
    }
    if (overlap < depth) {
      depth = overlap;
      nx = ax;
      nz = az;
    }
  }
  // Pointing from A towards B.
  if (dx * nx + dz * nz < 0) {
    nx = -nx;
    nz = -nz;
  }

  // Where they touch: the corners of each that are inside the other, or, when
  // two edges cross with no corner in, the middle of the overlap.
  let px = 0;
  let pz = 0;
  let count = 0;
  for (const [cx, cz] of corners(boxB)) {
    if (inside(boxA, cx, cz)) {
      px += cx;
      pz += cz;
      count++;
    }
  }
  for (const [cx, cz] of corners(boxA)) {
    if (inside(boxB, cx, cz)) {
      px += cx;
      pz += cz;
      count++;
    }
  }
  if (count > 0) {
    px /= count;
    pz /= count;
  } else {
    px = (a.position.x + b.position.x) / 2;
    pz = (a.position.z + b.position.z) / 2;
  }

  // Apart, half each: neither car is a wall.
  a.position.x -= nx * depth * 0.5;
  a.position.z -= nz * depth * 0.5;
  b.position.x += nx * depth * 0.5;
  b.position.z += nz * depth * 0.5;

  // The rest in metres and metres a second, where the mass and the inertia
  // mean something.
  const s = PHYSICS.scale;
  const rax = (px - a.position.x) / s;
  const raz = (pz - a.position.z) / s;
  const rbx = (px - b.position.x) / s;
  const rbz = (pz - b.position.z) / s;
  // How fast each car's touching point is moving: the car's own velocity, plus
  // the spin carrying that point round. A point r from the middle of a car
  // turning at ω moves at ω·(r.z, −r.x) in these axes, which is the way the
  // heading itself turns.
  const va = {
    x: a.velocity.x / s + a.yawRate * raz,
    z: a.velocity.y / s - a.yawRate * rax,
  };
  const vb = {
    x: b.velocity.x / s + b.yawRate * rbz,
    z: b.velocity.y / s - b.yawRate * rbx,
  };
  const rvx = vb.x - va.x;
  const rvz = vb.z - va.z;
  const closing = rvx * nx + rvz * nz;
  if (closing >= 0) {
    return false;
  }

  const m = PHYSICS.mass;
  const I = PHYSICS.inertia;
  // How much a push along a direction turns each car, per unit of push.
  const turnA = (dirX: number, dirZ: number): number => raz * dirX - rax * dirZ;
  const turnB = (dirX: number, dirZ: number): number => rbz * dirX - rbx * dirZ;

  const kA = turnA(nx, nz);
  const kB = turnB(nx, nz);
  const push =
    (-(1 + BUMP.bounce) * closing) / (2 / m + (kA * kA) / I + (kB * kB) / I);
  apply(a, b, nx, nz, push, kA, kB);

  // The rub: friction along the faces, no more than the push allows.
  const tx = -nz;
  const tz = nx;
  const sliding = rvx * tx + rvz * tz;
  const tA = turnA(tx, tz);
  const tB = turnB(tx, tz);
  const stop = -sliding / (2 / m + (tA * tA) / I + (tB * tB) / I);
  const rub = Math.max(-BUMP.rub * push, Math.min(BUMP.rub * push, stop));
  apply(a, b, tx, tz, rub, tA, tB);
  return true;
}

/** An impulse along (x, z) — on B, and the opposite on A — in SI units. */
function apply(
  a: Car,
  b: Car,
  x: number,
  z: number,
  impulse: number,
  kA: number,
  kB: number,
): void {
  const s = PHYSICS.scale;
  const dv = (impulse / PHYSICS.mass) * s;
  a.velocity.x -= x * dv;
  a.velocity.y -= z * dv;
  b.velocity.x += x * dv;
  b.velocity.y += z * dv;
  a.yawRate -= (impulse * kA) / PHYSICS.inertia;
  b.yawRate += (impulse * kB) / PHYSICS.inertia;
}

/** Half the car's length and width — a touch inside the bodywork, so two
 *  cars side by side in a lane are not rubbing the whole way down it. */
const HALF = {long: CAR.length / 2 - 0.3, wide: CAR.width / 2 - 0.2};
/** The furthest a corner is from the middle. */
const REACH = Math.hypot(HALF.long, HALF.wide);

interface Box {
  x: number;
  z: number;
  /** Along the car, and across it. */
  u: [number, number];
  w: [number, number];
}

function box(car: Car): Box {
  const ux = Math.sin(car.heading);
  const uz = Math.cos(car.heading);
  return {x: car.position.x, z: car.position.z, u: [ux, uz], w: [uz, -ux]};
}

function project(b: Box, ax: number, az: number): [number, number] {
  const centre = b.x * ax + b.z * az;
  const extent =
    HALF.long * Math.abs(b.u[0] * ax + b.u[1] * az) +
    HALF.wide * Math.abs(b.w[0] * ax + b.w[1] * az);
  return [centre - extent, centre + extent];
}

function corners(b: Box): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const along of [-1, 1]) {
    for (const across of [-1, 1]) {
      out.push([
        b.x + b.u[0] * HALF.long * along + b.w[0] * HALF.wide * across,
        b.z + b.u[1] * HALF.long * along + b.w[1] * HALF.wide * across,
      ]);
    }
  }
  return out;
}

function inside(b: Box, x: number, z: number): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  return (
    Math.abs(dx * b.u[0] + dz * b.u[1]) <= HALF.long &&
    Math.abs(dx * b.w[0] + dz * b.w[1]) <= HALF.wide
  );
}
