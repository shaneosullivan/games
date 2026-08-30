import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {SWIM, WHALE} from "../config";
import {paint, toonRamp} from "../render/materials";

const TAU = Math.PI * 2;

/**
 * The beluga.
 *
 * Built in code out of merged primitives with vertex colours, like everything
 * else in these games — no model file, no rig, one draw call for the hull.
 * What is a beluga rather than a generic whale: the round melon forehead, no
 * dorsal fin at all (a low ridge instead), short paddle flippers, and white
 * from nose to fluke.
 *
 * Forward is +Z, so the heading and forward vector agree with the bee's
 * `(sin yaw, cos yaw)`.
 *
 * The outer `group` is what the game positions and yaws. Everything the
 * animation touches hangs off `body` inside it — a model that writes to the
 * group its caller placed is the oldest bug in this repo.
 */
export class Whale {
  readonly group = new THREE.Group();

  readonly position = new THREE.Vector3();
  /** Where it was at the last simulation step, so the render can interpolate
   *  between the two. */
  readonly prevPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  /** Radians. 0 faces +Z. */
  heading = Math.PI;
  private prevHeading = Math.PI;

  /** The lean into a turn and the nose-up of a climb, both eased. */
  private bank = 0;
  private pitch = 0;
  /** Where the tail is in its beat, and the bob that keeps a still whale
   *  alive. */
  private stroke = 0;
  private bob = 0;
  /** Counts down after a mouthful, so the jaw closes again. */
  private chomp = 0;

  private readonly body = new THREE.Group();
  private readonly jaw = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly flippers: Array<THREE.Group> = [];

  constructor() {
    const mat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: toonRamp(),
    });

    this.body.add(new THREE.Mesh(hull(), mat));

    // The jaw hinges under the melon, so a mouthful is a visible thing rather
    // than a number changing in the corner.
    this.jaw.position.set(0, -1.9, 11.6);
    this.jaw.add(new THREE.Mesh(lowerJaw(), mat));
    this.body.add(this.jaw);

    // The fluke on its own stock. A whale swims with the whole back half, not
    // with a paddle bolted to the end, so the stock is part of what moves.
    this.tail.position.set(0, 0, -12.5);
    this.tail.add(new THREE.Mesh(fluke(), mat));
    this.body.add(this.tail);

    for (const side of [-1, 1]) {
      const flipper = new THREE.Group();
      flipper.position.set(side * 4.6, -1.6, 5.2);
      flipper.add(new THREE.Mesh(pectoral(side), mat));
      this.flippers.push(flipper);
      this.body.add(flipper);
    }

    this.group.add(this.body);
    this.group.scale.setScalar(WHALE.scale);
  }

  place(at: THREE.Vector3, heading: number): void {
    this.position.copy(at);
    this.prevPosition.copy(at);
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.prevHeading = heading;
    this.bank = 0;
    this.pitch = 0;
    this.stroke = 0;
    this.chomp = 0;
    this.group.position.copy(at);
    this.group.rotation.y = heading;
  }

  /** Unit vector the nose points along. */
  facing(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Where the mouth is, which is the only part of the whale that eats. */
  mouth(out: THREE.Vector3): THREE.Vector3 {
    this.facing(out);
    return out.multiplyScalar(WHALE.mouthAhead).add(this.position);
  }

  /** A mouthful. Opens the jaw; it shuts itself. */
  gulp(): void {
    this.chomp = 1;
  }

  /**
   * One simulation step.
   *
   * `want` is the horizontal velocity the stick is asking for and `climb` the
   * vertical speed the depth slider is asking for. The whale accelerates
   * toward the first and simply takes the second: water gives a whale all the
   * lift it needs, so rising and sinking is a decision, not a manoeuvre.
   */
  update(
    dt: number,
    want: THREE.Vector3,
    climb: number,
    driving: boolean,
  ): void {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;

    // Accelerate toward what was asked for; coast when the stick is let go.
    const rate = driving ? SWIM.accel : SWIM.drag;
    const dvx = want.x - this.velocity.x;
    const dvz = want.z - this.velocity.z;
    const change = Math.hypot(dvx, dvz);
    const most = rate * dt;
    if (change > most && change > 0) {
      this.velocity.x += (dvx / change) * most;
      this.velocity.z += (dvz / change) * most;
    } else {
      this.velocity.x = want.x;
      this.velocity.z = want.z;
    }
    this.velocity.y = climb;

    this.position.addScaledVector(this.velocity, dt);

    // Turn toward where it is actually going, at a rate a big animal manages.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    let turn = 0;
    if (speed > 0.4) {
      const wanted = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = wanted - this.heading;
      // The short way round. Without this a heading crossing ±π sends the
      // whale the long way and it pirouettes.
      while (delta > Math.PI) {
        delta -= TAU;
      }
      while (delta < -Math.PI) {
        delta += TAU;
      }
      turn = Math.max(-1, Math.min(1, delta / (SWIM.turnRate * dt)));
      this.heading += turn * SWIM.turnRate * dt;
    }

    // Lean into the turn and lift the nose on the climb. Both eased, and both
    // frame-rate independent — a fixed share per frame is a different curve on
    // a 120Hz iPad than on a 60Hz laptop.
    const wantBank = -turn * SWIM.bankMax;
    const wantPitch =
      Math.max(-1, Math.min(1, climb / SWIM.climbSpeed)) * SWIM.pitchMax;
    this.bank += (wantBank - this.bank) * ease(SWIM.bankRate, dt);
    this.pitch += (wantPitch - this.pitch) * ease(SWIM.pitchRate, dt);

    // The tail beats faster the harder it is working, and never stops.
    const effort = Math.min(1, speed / SWIM.maxSpeed);
    this.stroke +=
      (SWIM.flukeIdle + effort * (SWIM.fluke - SWIM.flukeIdle)) * TAU * dt;
    this.bob += SWIM.bobRate * TAU * dt;
    this.chomp = Math.max(0, this.chomp - dt * 3.4);
  }

  /** How fast it is swimming, for the HUD and the ambience. */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * Draw it, `alpha` of the way from the last step to this one.
   *
   * The heading is interpolated the short way round for the same reason the
   * turn is: at ±π the two ends of the interpolation are next to each other in
   * the world and a whole turn apart in the number.
   */
  render(alpha: number): void {
    this.group.position.lerpVectors(this.prevPosition, this.position, alpha);
    let delta = this.heading - this.prevHeading;
    while (delta > Math.PI) {
      delta -= TAU;
    }
    while (delta < -Math.PI) {
      delta += TAU;
    }
    this.group.rotation.y = this.prevHeading + delta * alpha;

    const effort = Math.min(1, this.speed / SWIM.maxSpeed);
    const beat = Math.sin(this.stroke);

    this.body.rotation.z = this.bank;
    this.body.rotation.x = -this.pitch;
    // The bob is the whale breathing rather than the whale swimming, so it
    // fades out as the tail takes over.
    this.body.position.y =
      Math.sin(this.bob) * SWIM.bobAmplitude * (1 - effort * 0.7);
    // A whale's whole body snakes; the head leads the tail by a beat.
    this.body.rotation.y = Math.sin(this.stroke - 1.1) * 0.05 * (0.3 + effort);

    // Vertical beats, not side to side — that is the one thing that says whale
    // rather than fish.
    this.tail.rotation.x = beat * (0.16 + effort * 0.5);

    for (let i = 0; i < this.flippers.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.flippers[i].rotation.x = Math.sin(this.stroke - 0.5) * 0.16;
      this.flippers[i].rotation.z =
        side * (0.22 + this.bank * side * 0.6 + beat * 0.08);
    }

    this.jaw.rotation.x = this.chomp * 0.42;
  }
}

/** 1 - exp(-rate*dt): the same easing at any frame rate. */
function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

// ---- the model -------------------------------------------------------------

const SKIN = 0xf4f8fa;
const BACK = 0xdde9f0;
const BELLY = 0xffffff;
const FIN = 0xe6eff4;

/**
 * Everything that does not move: body, melon, ridge, eyes and mouth line.
 *
 * The melon is a separate sphere sitting proud of the body rather than a
 * bulge in it, because that hard round forehead over a narrower snout is the
 * whole silhouette of a beluga and a smooth taper loses it.
 */
function hull(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const barrel = new THREE.SphereGeometry(6, 22, 16);
  barrel.scale(1, 1.02, 2.15);
  parts.push(paint(barrel, SKIN));

  // A paler belly and a greyer back, as two shells just inside the body's
  // surface. Coplanar faces z-fight; these are set 0.04 in.
  const belly = new THREE.SphereGeometry(5.96, 20, 12, 0, TAU, 1.5, 1.2);
  belly.scale(1, 1.02, 2.13);
  parts.push(paint(belly, BELLY));
  const back = new THREE.SphereGeometry(5.96, 20, 12, 0, TAU, 0, 0.85);
  back.scale(1, 1.02, 2.13);
  parts.push(paint(back, BACK));

  // The melon: big, round and set high and proud of the body. This is the
  // whole silhouette of a beluga — a smooth taper would be a dolphin — so it
  // is deliberately a size larger than the head underneath it.
  const melon = new THREE.SphereGeometry(5.6, 20, 16);
  melon.scale(0.98, 1, 0.9);
  melon.translate(0, 1.4, 9.4);
  parts.push(paint(melon, SKIN));

  // The snout, short and blunt, tucked under the front of the melon.
  const snout = new THREE.SphereGeometry(3.2, 16, 12);
  snout.scale(1, 0.7, 1.15);
  snout.translate(0, -1.3, 12.4);
  parts.push(paint(snout, SKIN));

  // The dorsal ridge. A beluga has no fin — it swims under ice, and a fin
  // would be no use to it — so this is a low bumpy line instead.
  for (let i = 0; i < 5; i++) {
    const bump = new THREE.SphereGeometry(1.05 - i * 0.1, 8, 6);
    bump.scale(0.5, 0.55, 1.7);
    bump.translate(0, 5.6 - i * 0.12, -1 - i * 3.1);
    parts.push(paint(bump, BACK));
  }

  // The neck crease. Belugas have unfused neck bones and a visible fold, and
  // it is the detail that stops the body reading as a plain lozenge. Thin, and
  // set where the body has already narrowed: a fat ring round the widest part
  // reads as a rubber band round a balloon.
  const crease = new THREE.TorusGeometry(5.02, 0.18, 6, 22);
  crease.translate(0, 0, 7.2);
  parts.push(paint(crease, BACK));

  // The eyes, placed *on* the melon rather than at a guessed offset — an
  // ellipsoid's surface is not where a sphere's would be, and the first pair
  // went straight inside the head and were never seen again. For radii
  // (a, b, c) and a unit direction u, the surface point is (a·ux, b·uy, c·uz).
  const mx = 5.6 * 0.98;
  const my = 5.6;
  const mz = 5.6 * 0.9;
  const u = new THREE.Vector3(0.68, -0.08, 0.73).normalize();
  const ex = mx * u.x;
  const ey = 1.4 + my * u.y;
  const ez = 9.4 + mz * u.z;
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.66, 10, 8);
    eye.translate(side * ex, ey, ez);
    parts.push(paint(eye, 0x23323c));
    // A brow just above it, so the eye reads as friendly rather than as a
    // hole punched in a white balloon.
    const brow = new THREE.TorusGeometry(1.15, 0.17, 6, 12, Math.PI);
    brow.rotateZ(side * 0.3);
    brow.translate(side * ex, ey + 0.95, ez - 0.3);
    parts.push(paint(brow, BACK));
  }

  // The smile, across the front of the snout. Belugas have one for real; this
  // only leans on it a little. A plain torus arc lies in the XY plane already,
  // which is the plane it is wanted in — the first version rotated it into the
  // YZ plane and the whale wore its mouth down one cheek.
  const smile = new THREE.TorusGeometry(2.15, 0.24, 6, 20, Math.PI * 0.78);
  smile.rotateZ(Math.PI * 1.11);
  smile.translate(0, -0.7, 14.9);
  parts.push(paint(smile, 0xbccdd8));

  return mergeGeometries(parts, false);
}

/** The lower jaw, which drops when a fish goes in. */
function lowerJaw(): THREE.BufferGeometry {
  const jaw = new THREE.SphereGeometry(2.9, 14, 8, 0, TAU, Math.PI / 2, 1.1);
  jaw.scale(1, 0.8, 1.3);
  return paint(jaw, SKIN);
}

/** The fluke: two swept lobes with a notch between them. */
function fluke(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const stock = new THREE.CylinderGeometry(2.6, 1.1, 6, 10);
  stock.rotateX(Math.PI / 2);
  stock.translate(0, 0, -3);
  parts.push(paint(stock, SKIN));
  for (const side of [-1, 1]) {
    const lobe = new THREE.SphereGeometry(4.4, 12, 8);
    lobe.scale(1.15, 0.16, 0.72);
    lobe.rotateY(side * 0.42);
    lobe.translate(side * 4.2, 0, -6.4);
    parts.push(paint(lobe, FIN));
  }
  return mergeGeometries(parts, false);
}

/** A pectoral flipper: a short, broad, upturned paddle. */
function pectoral(side: number): THREE.BufferGeometry {
  const paddle = new THREE.SphereGeometry(3.4, 12, 8);
  paddle.scale(0.9, 0.16, 0.58);
  paddle.rotateZ(side * 0.2);
  paddle.translate(side * 2.6, 0, -0.6);
  return paint(paddle, FIN);
}
