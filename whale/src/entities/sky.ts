import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {SKY} from "../config";
import {Rng} from "../core/rng";
import {paint, toonRamp} from "../render/materials";

const TAU = Math.PI * 2;

interface Gull {
  position: THREE.Vector3;
  heading: number;
  /** Where it is in its wingbeat, and how hard it is beating. */
  beat: number;
  flap: number;
  /** Wheeling gulls only: the circle they are flying. */
  circle: {radius: number; height: number; phase: number; rate: number};
  /** Sitting gulls only. */
  sitting: boolean;
  /** Seconds left in the air before it looks for somewhere to land. */
  airborne: number;
  /** Where it is heading while it is up. */
  away: THREE.Vector3;
}

/**
 * Everything above the water: clouds, gulls in the air, and gulls sitting on
 * the sea that leave when a whale comes up underneath them.
 *
 * All of it hangs off one group whose visibility follows the camera, so a game
 * spent down on the reef never draws any of it. The clouds and the wheeling
 * gulls travel with the whale the same way the water surface does — this is a
 * patch of sky rather than a sky, and it only has to be right where you are.
 *
 * The gulls are two InstancedMeshes and not one group each: a body mesh, and a
 * wing mesh with two instances per bird so the pair can beat. Fifteen birds as
 * three meshes apiece would have been forty-five draw calls for scenery.
 */
export class Sky {
  readonly group = new THREE.Group();

  private readonly clouds: THREE.InstancedMesh;
  private readonly cloudAt: Array<THREE.Vector3> = [];
  private readonly cloudSpin: Array<number> = [];
  private readonly cloudSize: Array<number> = [];

  private readonly bodies: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private readonly gulls: Array<Gull> = [];

  private readonly cloudMat: THREE.MeshBasicMaterial;
  private readonly gullMat: THREE.MeshToonMaterial;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qFlap = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly here = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();

  constructor(rng: Rng) {
    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      // Off, because a cloud three hundred units up and eight hundred out
      // would otherwise be the fog's colour and nothing else.
      fog: false,
    });
    this.clouds = new THREE.InstancedMesh(cloud(), this.cloudMat, SKY.clouds);
    this.clouds.frustumCulled = false;
    for (let i = 0; i < SKY.clouds; i++) {
      this.cloudAt.push(
        new THREE.Vector3(
          rng.range(-SKY.spread, SKY.spread),
          rng.range(SKY.cloudLow, SKY.cloudHigh),
          rng.range(-SKY.spread, SKY.spread),
        ),
      );
      this.cloudSpin.push(rng.range(0, TAU));
      this.cloudSize.push(rng.range(0.7, 1.7));
    }
    this.group.add(this.clouds);

    this.gullMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: toonRamp(),
      transparent: true,
      opacity: 1,
      fog: false,
    });
    const count = SKY.flying + SKY.floating;
    this.bodies = new THREE.InstancedMesh(gullBody(), this.gullMat, count);
    this.wings = new THREE.InstancedMesh(gullWing(), this.gullMat, count * 2);
    this.bodies.frustumCulled = false;
    this.wings.frustumCulled = false;
    this.group.add(this.bodies, this.wings);

    for (let i = 0; i < count; i++) {
      const flying = i < SKY.flying;
      this.gulls.push({
        position: new THREE.Vector3(
          rng.range(-SKY.spread * 0.4, SKY.spread * 0.4),
          flying ? rng.range(SKY.circleLow, SKY.circleHigh) : 0.9,
          rng.range(-SKY.spread * 0.4, SKY.spread * 0.4),
        ),
        heading: rng.range(0, TAU),
        beat: rng.range(0, TAU),
        flap: flying ? 0.5 : 0,
        circle: {
          radius: rng.range(SKY.circleRadius * 0.5, SKY.circleRadius * 1.6),
          height: rng.range(SKY.circleLow, SKY.circleHigh),
          phase: rng.range(0, TAU),
          rate:
            SKY.circleSpeed * rng.range(0.6, 1.5) * (rng.next() < 0.5 ? -1 : 1),
        },
        sitting: !flying,
        airborne: 0,
        away: new THREE.Vector3(),
      });
    }
  }

  /**
   * Nothing above the water is drawn while the camera is under it.
   *
   * Faded rather than switched, because the crossing happens over about a
   * second as the whale comes up and a flock of gulls appearing in one frame
   * would read as a glitch.
   */
  setAir(air: number): void {
    const a = Math.min(1, Math.max(0, air));
    this.group.visible = a > 0.01;
    this.cloudMat.opacity = 0.9 * a;
    this.gullMat.opacity = a;
  }

  /**
   * `centre` is the whale. `sea` is the height of the water where a gull is
   * sitting — passed in rather than worked out here, so the birds ride the
   * same waves the surface is drawing.
   */
  update(
    dt: number,
    time: number,
    centre: THREE.Vector3,
    seaAt: (x: number, z: number) => number,
  ): void {
    if (!this.group.visible) {
      return;
    }
    this.drawClouds(dt, centre);

    for (let i = 0; i < this.gulls.length; i++) {
      const gull = this.gulls[i];
      if (i < SKY.flying) {
        this.wheel(gull, time, centre);
      } else {
        this.paddle(gull, dt, centre, seaAt);
      }
      gull.beat +=
        (SKY.glideBeat + gull.flap * (SKY.flapBeat - SKY.glideBeat)) * TAU * dt;
      this.drawGull(i, gull);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }

  /** Gulls in the air: slow circles at their own heights, drifting along with
   *  the whale so there are always some overhead. */
  private wheel(gull: Gull, time: number, centre: THREE.Vector3): void {
    const c = gull.circle;
    const a = c.phase + time * c.rate;
    gull.position.set(
      centre.x + Math.cos(a) * c.radius,
      c.height + Math.sin(time * 0.4 + c.phase) * 4,
      centre.z + Math.sin(a) * c.radius,
    );
    // Facing along the circle. The tangent, which is the derivative of the
    // position — get this wrong and the gulls fly sideways round their own
    // circles, which is a thing seagulls do not do.
    const tx = -Math.sin(a) * Math.sign(c.rate);
    const tz = Math.cos(a) * Math.sign(c.rate);
    gull.heading = Math.atan2(tx, tz);
    // Mostly gliding, with the odd burst of flapping.
    gull.flap = Math.max(0, Math.sin(time * 0.6 + c.phase * 3)) * 0.8;
  }

  /**
   * Gulls on the water, and the whole point of them: they sit there until a
   * whale comes up underneath, and then they go.
   */
  private paddle(
    gull: Gull,
    dt: number,
    centre: THREE.Vector3,
    seaAt: (x: number, z: number) => number,
  ): void {
    this.flat.set(gull.position.x - centre.x, 0, gull.position.z - centre.z);
    const near = this.flat.length();

    if (gull.sitting) {
      gull.position.y = seaAt(gull.position.x, gull.position.z) + 0.9;
      gull.flap = 0;
      // Turning gently on the spot, the way a bird on water does.
      gull.heading += dt * 0.25;
      if (near < SKY.fleeRange) {
        gull.sitting = false;
        gull.airborne = SKY.settle;
        // Straight away from the whale, and never straight up: a gull leaving
        // the water runs along it first.
        gull.away.copy(this.flat).setY(0);
        if (gull.away.lengthSq() < 0.01) {
          gull.away.set(1, 0, 0);
        }
        gull.away.normalize();
      }
      return;
    }

    gull.airborne -= dt;
    gull.flap = 1;
    gull.position.addScaledVector(gull.away, SKY.takeOff * dt);
    gull.heading = Math.atan2(gull.away.x, gull.away.z);

    if (gull.airborne > SKY.settle * 0.45) {
      gull.position.y += SKY.climb * dt;
    } else {
      // Coming back down, somewhere well ahead of the whale so it gets to
      // startle the same birds twice on a long swim.
      const sea = seaAt(gull.position.x, gull.position.z) + 0.9;
      gull.position.y = Math.max(sea, gull.position.y - SKY.climb * dt);
      if (gull.airborne <= 0) {
        gull.position.x = centre.x + (gull.position.x - centre.x) * 0.2;
        gull.position.z = centre.z - SKY.landAhead;
        gull.position.y = seaAt(gull.position.x, gull.position.z) + 0.9;
        gull.sitting = true;
      }
    }
  }

  private drawClouds(dt: number, centre: THREE.Vector3): void {
    for (let i = 0; i < this.cloudAt.length; i++) {
      const at = this.cloudAt[i];
      at.x += SKY.cloudDrift * dt;
      // Wrapped about the whale, so the patch of sky travels with it.
      const dx = at.x - centre.x;
      if (dx > SKY.spread) {
        at.x -= SKY.spread * 2;
      }
      const dz = at.z - centre.z;
      if (dz > SKY.spread) {
        at.z -= SKY.spread * 2;
      } else if (dz < -SKY.spread) {
        at.z += SKY.spread * 2;
      }
      this.here.set(at.x, at.y, at.z);
      this.e.set(0, this.cloudSpin[i], 0);
      this.q.setFromEuler(this.e);
      this.one.setScalar(this.cloudSize[i] * SKY.cloudSize);
      this.m.compose(this.here, this.q, this.one);
      this.clouds.setMatrixAt(i, this.m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  private drawGull(i: number, gull: Gull): void {
    this.one.setScalar(SKY.gullSize);
    this.e.set(0, gull.heading, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(gull.position, this.q, this.one);
    this.bodies.setMatrixAt(i, this.m);

    // A wingbeat: both tips up together, then both down. The wing geometry
    // points along +X, so the left one is turned right round before it is
    // flapped — and its flap has to run the other way, or turning it round
    // would have it beating downward while its partner beats up.
    const lift = Math.sin(gull.beat) * (0.28 + gull.flap * 0.95);
    for (const side of [0, 1]) {
      const sign = side === 0 ? 1 : -1;
      this.e.set(0, side === 0 ? 0 : Math.PI, sign * lift, "YZX");
      this.qFlap.setFromEuler(this.e);
      this.qFlap.premultiply(this.q);
      this.m.compose(gull.position, this.qFlap, this.one);
      this.wings.setMatrixAt(i * 2 + side, this.m);
    }
  }
}

/** A cloud: a heap of soft lumps, built at radius 1 and scaled per instance. */
function cloud(): THREE.BufferGeometry {
  const rng = new Rng(88001);
  const parts: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.IcosahedronGeometry(rng.range(0.45, 0.8), 1);
    puff.scale(1.3, 0.7, 1);
    puff.translate(
      rng.range(-1, 1),
      rng.range(-0.12, 0.2),
      rng.range(-0.5, 0.5),
    );
    parts.push(paint(puff, 0xffffff));
  }
  return mergeGeometries(parts, false);
}

/** A gull's body: white, grey-backed, with an orange beak. Points +Z. */
function gullBody(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(0.34, 10, 8);
  body.scale(0.8, 0.85, 1.5);
  parts.push(paint(body, 0xffffff));

  const back = new THREE.SphereGeometry(0.33, 10, 6, 0, TAU, 0, 0.9);
  back.scale(0.8, 0.85, 1.45);
  back.translate(0, 0.02, 0);
  parts.push(paint(back, 0xc7d2da));

  const head = new THREE.SphereGeometry(0.22, 8, 6);
  head.translate(0, 0.2, 0.42);
  parts.push(paint(head, 0xffffff));

  const beak = new THREE.ConeGeometry(0.07, 0.28, 5);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.17, 0.68);
  parts.push(paint(beak, 0xf5a623));

  // The tail, and the black wingtips a herring gull is known by — on the tail
  // here because the wings are a separate mesh and get their own.
  const tail = new THREE.ConeGeometry(0.24, 0.42, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.35, 1);
  tail.translate(0, 0.02, -0.62);
  parts.push(paint(tail, 0xe8eef2));

  return mergeGeometries(parts, false);
}

/** One wing, reaching along +X from the shoulder, swept back a little. */
function gullWing(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const inner = new THREE.SphereGeometry(0.5, 8, 5);
  inner.scale(1.5, 0.1, 0.5);
  inner.translate(0.6, 0.08, 0);
  parts.push(paint(inner, 0xf2f7fa));

  const outer = new THREE.SphereGeometry(0.42, 8, 5);
  outer.scale(1.5, 0.09, 0.36);
  outer.rotateY(-0.42);
  outer.translate(1.7, 0.08, -0.22);
  parts.push(paint(outer, 0xdfe8ee));

  const tip = new THREE.SphereGeometry(0.22, 6, 4);
  tip.scale(1.4, 0.1, 0.5);
  tip.rotateY(-0.5);
  tip.translate(2.4, 0.08, -0.42);
  parts.push(paint(tip, 0x6b7681));

  return mergeGeometries(parts, false);
}
