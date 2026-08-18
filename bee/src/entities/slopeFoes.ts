import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ASCENT as A, ASCENT_PALETTE as P} from "../config";
import {paint, vertexToon} from "../render/materials";

/** A cone's own axis in three, which is what a flame is aimed from. */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Everything that comes down the Mouldy Mountain at her.
 *
 * One file, because they are one idea seen five ways: a thing at a place on
 * the slope, with some amount of life in it, that either travels down or sits
 * still and reaches for her. The level owns them; this owns what they look
 * like and how they move.
 *
 * All of it is in slope space — x across, -z up the hill — so nothing here
 * knows the mountain is tilted. See render/geometry/mountain.ts.
 */
export type FoeKind = "rock" | "wasp" | "frog" | "can" | "moss" | "flower";

export interface Foe {
  kind: FoeKind;
  group: THREE.Group;
  /** Position on the slope, and how big a target it is. */
  x: number;
  z: number;
  radius: number;
  /** What is left of it. Moss is picked up rather than shot, and has none. */
  hits: number;
  dead: boolean;
  /** Which train a wasp belongs to, for the clear-the-lot bonus. */
  train?: number;
  /** Rocks: how fast down the hill, and how far off the ground. */
  speed?: number;
  lift?: number;
  rise?: number;
  /** Frogs and cans: when the next attack is due, and how far through it is. */
  next?: number;
  firing?: number;
  /** Moss: how much of its dwell has been served. */
  picked?: number;
}

/** What a seed is doing: where it is going, and what it is chasing. */
export interface Shot {
  vx: number;
  vz: number;
  /** The thing it has decided to follow, if this weapon chases. */
  target: Foe | null;
  /** How long it has been in the air; a chaser flies straight at first. */
  age: number;
}

/** The shapes, built once each and shared by every foe that wears one. */
export interface FoeKit {
  material: THREE.Material;
  rock: THREE.BufferGeometry;
  wasp: THREE.BufferGeometry;
  frog: THREE.BufferGeometry;
  can: THREE.BufferGeometry;
  moss: THREE.BufferGeometry;
  flower: THREE.BufferGeometry;
  tongue: THREE.BufferGeometry;
  spray: THREE.BufferGeometry;
  dispose(): void;
}

export function createFoeKit(): FoeKit {
  const material = vertexToon();
  const kit: FoeKit = {
    material,
    rock: rockGeometry(),
    wasp: waspGeometry(),
    frog: frogGeometry(),
    can: canGeometry(),
    moss: mossGeometry(),
    flower: flowerGeometry(),
    tongue: reachGeometry(0.22, P.tongue),
    spray: reachGeometry(1, P.spray),
    dispose() {
      for (const geo of [
        kit.rock,
        kit.wasp,
        kit.frog,
        kit.can,
        kit.moss,
        kit.flower,
        kit.tongue,
        kit.spray,
      ]) {
        geo.dispose();
      }
      material.dispose();
    },
  };
  return kit;
}

/** A rough boulder. Built at radius 1 and scaled to the size it wants. */
function rockGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.DodecahedronGeometry(1, 0);
  parts.push(paint(body, P.rock));
  // A couple of darker facets, so a tumbling rock reads as turning.
  for (const [x, y, z] of [
    [0.55, 0.4, 0.3],
    [-0.4, -0.5, 0.45],
  ] as const) {
    const facet = new THREE.DodecahedronGeometry(0.5, 0);
    facet.translate(x, y, z);
    parts.push(paint(facet, P.rockDark));
  }
  return merge(parts);
}

/** A wasp, seen from behind and above: body, stripes, wings. */
function waspGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(0.62, 10, 8);
  body.scale(0.85, 0.7, 1.25);
  parts.push(paint(body, P.wasp));
  for (const z of [-0.15, 0.3]) {
    const stripe = new THREE.TorusGeometry(0.5, 0.13, 6, 12);
    stripe.rotateX(Math.PI / 2);
    stripe.scale(0.9, 1, 0.9);
    stripe.translate(0, 0, z);
    parts.push(paint(stripe, P.waspDark));
  }
  const head = new THREE.SphereGeometry(0.34, 8, 6);
  head.translate(0, 0.05, -0.78);
  parts.push(paint(head, P.waspDark));
  for (const side of [-1, 1]) {
    const wing = new THREE.SphereGeometry(0.5, 8, 5);
    wing.scale(1.5, 0.1, 0.72);
    wing.translate(side * 0.85, 0.3, 0.1);
    parts.push(paint(wing, 0xeaf7ff));
  }
  return merge(parts);
}

/** A fat frog sitting on the slope, facing down it at her. */
function frogGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(1.5, 12, 9);
  body.scale(1.15, 0.8, 1);
  body.translate(0, 1.1, 0);
  parts.push(paint(body, P.frog));
  const belly = new THREE.SphereGeometry(1, 10, 7);
  belly.scale(1.1, 0.5, 0.9);
  belly.translate(0, 0.6, 0.5);
  parts.push(paint(belly, 0xdff0b8));
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.42, 8, 6);
    eye.translate(side * 0.62, 2.1, 0.35);
    parts.push(paint(eye, 0xfdfdf5));
    const pupil = new THREE.SphereGeometry(0.22, 6, 5);
    pupil.translate(side * 0.68, 2.2, 0.62);
    parts.push(paint(pupil, 0x1d1a12));
    const leg = new THREE.SphereGeometry(0.6, 8, 6);
    leg.scale(0.7, 0.5, 1.3);
    leg.translate(side * 1.35, 0.5, 0.3);
    parts.push(paint(leg, P.frog));
  }
  return merge(parts);
}

/** A tin of pesticide, standing on the slope. */
function canGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.CylinderGeometry(1.5, 1.5, 3.6, 14);
  body.translate(0, 1.8, 0);
  parts.push(paint(body, P.can));
  for (const y of [1, 2.6]) {
    const band = new THREE.CylinderGeometry(1.56, 1.56, 0.4, 14);
    band.translate(0, y, 0);
    parts.push(paint(band, P.canDark));
  }
  const neck = new THREE.CylinderGeometry(0.5, 0.9, 0.8, 10);
  neck.translate(0, 3.9, 0);
  parts.push(paint(neck, P.canDark));
  // The nozzle, pointing down the hill at her.
  const nozzle = new THREE.CylinderGeometry(0.3, 0.42, 1.4, 8);
  nozzle.rotateX(Math.PI / 2);
  nozzle.translate(0, 3.6, 1.2);
  parts.push(paint(nozzle, P.rockDark));
  return merge(parts);
}

/** A patch of glowing moss: low, lumpy, and bright. */
function mossGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 1.5;
    const blob = new THREE.SphereGeometry(i === 0 ? 1.5 : 1, 8, 6);
    blob.scale(1, 0.45, 1);
    blob.translate(Math.cos(angle) * r, 0.2, Math.sin(angle) * r);
    parts.push(paint(blob, i % 2 === 0 ? P.moss : P.mossGlow));
  }
  return merge(parts);
}

/**
 * The flower that buys the next weapon.
 *
 * Big petals and a bright middle, on a short stem: it has to be picked out
 * from a hillside of moss and mould at a glance and at speed, because taking
 * one is the best thing that happens in this level.
 */
function flowerGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const stem = new THREE.CylinderGeometry(0.16, 0.2, 1.6, 6);
  stem.translate(0, 0.8, 0);
  parts.push(paint(stem, 0x4e9a45));
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.62, 8, 6);
    petal.scale(1, 0.34, 0.62);
    petal.translate(Math.cos(angle) * 0.78, 1.75, Math.sin(angle) * 0.78);
    parts.push(paint(petal, i % 2 === 0 ? 0xff6f9c : 0xffa7c4));
  }
  const middle = new THREE.SphereGeometry(0.46, 10, 8);
  middle.scale(1, 0.6, 1);
  middle.translate(0, 1.9, 0);
  parts.push(paint(middle, 0xffd84a));
  return merge(parts);
}

/**
 * A tongue or a jet of spray: a unit-long shaft along +z from the origin, so
 * it can be aimed by scaling alone.
 */
function reachGeometry(radius: number, colour: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius * 0.7, radius, 1, 8);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 0.5);
  return paint(geo, colour);
}

function merge(parts: Array<THREE.BufferGeometry>): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return merged ?? new THREE.BufferGeometry();
}

/**
 * The seeds she spits, as two instanced meshes.
 *
 * A pool rather than objects: at six a second for a minute of climbing there
 * are hundreds of them, and they are identical little balls. Two draw calls
 * for the lot — the seeds, and the flames behind the ones that are chasing —
 * and a dead seed is scaled to nothing rather than removed, because an
 * InstancedMesh cannot skip an instance.
 */
export class Seeds {
  /** Both meshes: the seeds, and the exhaust behind the locked ones. */
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;

  private readonly x: Array<number> = [];
  private readonly z: Array<number> = [];
  private readonly shot: Array<Shot> = [];
  private readonly from: Array<number> = [];
  private readonly live: Array<boolean> = [];

  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  /** No rotation: the seeds are little balls. */
  private readonly still = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly flameScale = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly plain = new THREE.Color(P.seed);
  private readonly locked = new THREE.Color(A.weapon.lockedColour);
  private next = 0;

  constructor(max = 260) {
    // Painted flat white and coloured per instance: a seed that has taken a
    // target turns red, and vertex colours multiply — a yellow seed tinted red
    // comes out a muddy orange rather than red.
    const geo = paint(new THREE.SphereGeometry(A.seed.radius, 7, 5), 0xffffff);
    this.mesh = new THREE.InstancedMesh(geo, vertexToon(), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(max * 3),
      3,
    );
    const flame = paint(
      new THREE.ConeGeometry(A.seed.radius * 1.1, A.seed.radius * 3, 6),
      A.weapon.flameColour,
    );
    this.flames = new THREE.InstancedMesh(flame, vertexToon(), max);
    this.flames.frustumCulled = false;
    this.group.add(this.mesh, this.flames);

    for (let i = 0; i < max; i++) {
      this.x.push(0);
      this.z.push(0);
      this.from.push(0);
      this.live.push(false);
      this.shot.push({vx: 0, vz: -A.seed.speed, target: null, age: 0});
    }
    this.hideAll();
  }

  private hideAll(): void {
    this.matrix.compose(
      this.at.set(0, -50, 0),
      this.still,
      this.flameScale.setScalar(0.0001),
    );
    for (let i = 0; i < this.live.length; i++) {
      this.mesh.setMatrixAt(i, this.matrix);
      this.flames.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.plain);
    }
    this.touched();
  }

  private touched(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Loose one seed.
   *
   * @param angle off straight up the slope, in radians
   * @param target something for it to chase, for the last weapon
   */
  fire(x: number, z: number, angle = 0, target: Foe | null = null): void {
    const i = this.next;
    this.next = (this.next + 1) % this.live.length;
    this.x[i] = x;
    this.z[i] = z;
    this.from[i] = z;
    this.live[i] = true;
    const shot = this.shot[i];
    shot.vx = Math.sin(angle) * A.seed.speed;
    shot.vz = -Math.cos(angle) * A.seed.speed;
    shot.target = target;
    shot.age = 0;
  }

  /**
   * Walk the live seeds, letting the level decide what each one hits.
   *
   * A chaser flies straight out of her first and only then starts to turn —
   * see ASCENT.weapon.homingAfter, which is what keeps the shot hers — and it
   * steers rather than snapping round, so something crossing fast can still
   * beat it.
   */
  update(dt: number, hit: (x: number, z: number) => boolean): void {
    for (let i = 0; i < this.live.length; i++) {
      if (!this.live[i]) {
        continue;
      }
      const shot = this.shot[i];
      shot.age += dt;
      const chasing =
        !!shot.target && !shot.target.dead && shot.age >= A.weapon.homingAfter;

      if (chasing && shot.target) {
        const want = Math.atan2(
          shot.target.x - this.x[i],
          -(shot.target.z - this.z[i]),
        );
        const now = Math.atan2(shot.vx, -shot.vz);
        let delta = want - now;
        while (delta > Math.PI) {
          delta -= Math.PI * 2;
        }
        while (delta < -Math.PI) {
          delta += Math.PI * 2;
        }
        const turn = Math.max(
          -A.weapon.homingTurn * dt,
          Math.min(A.weapon.homingTurn * dt, delta),
        );
        const heading = now + turn;
        shot.vx = Math.sin(heading) * A.seed.speed;
        shot.vz = -Math.cos(heading) * A.seed.speed;
      }

      this.x[i] += shot.vx * dt;
      this.z[i] += shot.vz * dt;

      if (
        Math.abs(this.from[i] - this.z[i]) > A.seed.range ||
        hit(this.x[i], this.z[i])
      ) {
        this.live[i] = false;
        shot.target = null;
        this.matrix.compose(
          this.at.set(0, -50, 0),
          this.still,
          this.flameScale.setScalar(0.0001),
        );
        this.mesh.setMatrixAt(i, this.matrix);
        this.flames.setMatrixAt(i, this.matrix);
        continue;
      }

      this.at.set(this.x[i], A.flightHeight * 0.7, this.z[i]);
      this.matrix.compose(this.at, this.still, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, chasing ? this.locked : this.plain);

      if (chasing) {
        // The exhaust: behind it, pointing back down its own travel, and
        // flickering. The cone is built along +y, so aiming it is one rotation
        // from there onto the direction it should point.
        const speed = Math.hypot(shot.vx, shot.vz) || 1;
        const backX = -shot.vx / speed;
        const backZ = -shot.vz / speed;
        this.at.set(
          this.x[i] + backX * A.seed.radius * 1.9,
          A.flightHeight * 0.7,
          this.z[i] + backZ * A.seed.radius * 1.9,
        );
        this.aim.set(backX, 0, backZ);
        this.quat.setFromUnitVectors(UP, this.aim);
        const flicker =
          A.weapon.flameSize * (0.75 + Math.sin(shot.age * 40) * 0.25);
        this.flameScale.set(flicker, flicker * 1.4, flicker);
        this.matrix.compose(this.at, this.quat, this.flameScale);
      } else {
        this.matrix.compose(
          this.at.set(0, -50, 0),
          this.still,
          this.flameScale.setScalar(0.0001),
        );
      }
      this.flames.setMatrixAt(i, this.matrix);
    }
    this.touched();
  }

  clear(): void {
    for (let i = 0; i < this.live.length; i++) {
      this.live[i] = false;
      this.shot[i].target = null;
    }
    this.hideAll();
  }

  dispose(): void {
    for (const mesh of [this.mesh, this.flames]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
