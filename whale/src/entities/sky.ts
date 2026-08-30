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
  /** Standing on the whale. See perchOn(). */
  perched: boolean;
  /** 0 wings out, 1 wings folded away. Eased, so the fold is watchable. */
  fold: number;
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
  /** The wings' scale, which is not uniform once they start folding. */
  private readonly span = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();
  /** Where a gull should come and stand, or null. See perchOn(). */
  private readonly perch = new THREE.Vector3();
  private perching = false;
  private perchHeading = 0;

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
        perched: false,
        fold: 0,
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
   * Ask for a gull to come down and stand somewhere — the back of a whale that
   * has stopped swimming.
   *
   * Pass null and whichever gull took the offer gets up and goes back to
   * wheeling. The spot is handed in fresh every frame rather than remembered,
   * so a perched gull rides a whale that is bobbing on the swell without the
   * sky having to know anything about whales.
   */
  perchOn(spot: THREE.Vector3 | null, heading: number): void {
    this.perching = spot !== null;
    if (spot) {
      this.perch.copy(spot);
      this.perchHeading = heading;
    }
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
      if (i === 0 && (this.perching || gull.perched)) {
        this.visit(gull, dt);
      } else if (i < SKY.flying) {
        this.wheel(gull, dt, time, centre);
      } else {
        this.paddle(gull, dt, centre, seaAt);
      }
      gull.beat +=
        (SKY.glideBeat + gull.flap * (SKY.flapBeat - SKY.glideBeat)) * TAU * dt;
      // Wings away when it is standing on something, out the rest of the time.
      const want = gull.perched ? 1 : 0;
      gull.fold += (want - gull.fold) * (1 - Math.exp(-SKY.foldRate * dt));
      this.drawGull(i, gull);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }

  /**
   * The gull that comes down to stand on a waiting whale.
   *
   * One nominated bird — the first of the wheeling ones — peels out of its
   * circle, flies over and lands, and rides along until the whale moves off.
   * It flaps hard on the way in and not at all once it is down, which is the
   * whole of what makes it read as a landing.
   */
  private visit(gull: Gull, dt: number): void {
    if (!this.perching) {
      // Told to go: straight up off the whale's back and back to its circle,
      // which `wheel` will take over as soon as this flag clears.
      gull.perched = false;
      gull.flap = 1;
      gull.position.y += SKY.climb * dt;
      return;
    }

    this.flat.copy(this.perch).sub(gull.position);
    const gap = this.flat.length();
    if (gap < SKY.perchNear) {
      gull.perched = true;
    }

    if (gull.perched) {
      gull.position.copy(this.perch);
      gull.flap = 0;
      // Settling to face the same way as whatever it is standing on.
      let turn = this.perchHeading - gull.heading;
      while (turn > Math.PI) {
        turn -= TAU;
      }
      while (turn < -Math.PI) {
        turn += TAU;
      }
      gull.heading += turn * Math.min(1, dt * 2.4);
      return;
    }

    gull.flap = 1;
    gull.position.addScaledVector(
      this.flat.multiplyScalar(1 / Math.max(gap, 0.001)),
      Math.min(gap, SKY.perchSpeed * dt),
    );
    gull.heading = Math.atan2(this.flat.x, this.flat.z);
  }

  /** Gulls in the air: slow circles at their own heights, drifting along with
   *  the whale so there are always some overhead. */
  private wheel(
    gull: Gull,
    dt: number,
    time: number,
    centre: THREE.Vector3,
  ): void {
    const c = gull.circle;
    const a = c.phase + time * c.rate;
    this.here.set(
      centre.x + Math.cos(a) * c.radius,
      c.height + Math.sin(time * 0.4 + c.phase) * 4,
      centre.z + Math.sin(a) * c.radius,
    );
    // Eased rather than set. For a gull already on its circle this is a no-op
    // — the point it is chasing is the point it is at — but it is what lets a
    // bird that has just got up off a whale's back fly back up to its circle
    // instead of appearing in it.
    gull.position.lerp(this.here, 1 - Math.exp(-2.2 * dt));
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

    // A wingbeat: both tips up together, then both down, which is the only
    // way a bird flies.
    //
    // The wing is modelled along +X and the left one is turned right round to
    // face -X, so it is tempting to flip the sign of its flap as well. That is
    // wrong, and it is what had these gulls rowing along like a pair of oars.
    // In this order the flap (about Z) is applied to the wing *before* the
    // turn (about Y) — and a rotation about Y preserves height. The tip goes
    // up, then gets carried to the other side still up. Same sign, both sides.
    //
    // Folding runs on the same Y axis as the turn: sweeping the wing back
    // means adding to it on the right and subtracting on the left, since the
    // left one is already pointing the other way. Away from the beat, too —
    // a folded wing is still, so the flap fades out as it goes.
    const out = 1 - gull.fold;
    const lift =
      Math.sin(gull.beat) * (0.28 + gull.flap * 0.95) * out +
      SKY.foldDrop * gull.fold;
    const sweep = SKY.foldSweep * gull.fold;
    for (const side of [0, 1]) {
      const sign = side === 0 ? 1 : -1;
      this.e.set(0, (side === 0 ? 0 : Math.PI) + sign * sweep, lift, "YZX");
      this.qFlap.setFromEuler(this.e);
      this.qFlap.premultiply(this.q);
      // Shortened along its own span as it folds: a wing tucked away bunches
      // up, and one that kept its full length reached past the tail.
      this.span.set(
        SKY.gullSize * (1 - SKY.foldIn * gull.fold),
        SKY.gullSize,
        SKY.gullSize,
      );
      this.m.compose(gull.position, this.qFlap, this.span);
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

/**
 * A gull's body: white, grey-backed, with an orange beak. Points +Z.
 *
 * Slim and drawn out, not a ball. A gull is a long low body with a rounded
 * head at one end and a wedge of tail at the other, and the first version was
 * a fat sphere — which next to a proper wing made the bird look like a duck.
 */
function gullBody(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  // Plump and round rather than streamlined. Everything below leans the same
  // way: a big head, big eyes, a short beak and a small body — which is the
  // whole recipe for cute and is exactly what a real gull is not.
  const body = new THREE.SphereGeometry(0.34, 12, 9);
  body.scale(0.74, 0.8, 1.18);
  parts.push(paint(body, 0xffffff));

  // The grey mantle across the back and shoulders, a shell just inside the
  // body's surface — coplanar faces z-fight, so it sits 0.01 in.
  const back = new THREE.SphereGeometry(0.33, 12, 7, 0, TAU, 0, 0.8);
  back.scale(0.74, 0.8, 1.08);
  back.translate(0, 0.02, -0.03);
  parts.push(paint(back, 0xbfccd6));

  // Head: nearly as wide as the body and sat right on it, no neck to speak
  // of. A gull's head is a third of this size and further forward.
  const head = new THREE.SphereGeometry(0.235, 12, 9);
  head.scale(1, 0.96, 0.96);
  head.translate(0, 0.23, 0.3);
  parts.push(paint(head, 0xffffff));

  // A short, deep, slightly upturned beak — a stub rather than a dagger.
  const beak = new THREE.ConeGeometry(0.085, 0.2, 6);
  beak.rotateX(Math.PI / 2);
  beak.rotateX(-0.22);
  beak.scale(1, 0.8, 1);
  beak.translate(0, 0.185, 0.53);
  parts.push(paint(beak, 0xf6a521));

  for (const side of [-1, 1]) {
    // Big, round and set well forward, which is what makes a face read as
    // young. Set proud of the head rather than sunk into it.
    const eye = new THREE.SphereGeometry(0.072, 8, 7);
    eye.translate(side * 0.135, 0.275, 0.44);
    parts.push(paint(eye, 0x24303a));
    // The catchlight. One small white dot up and out, and the whole bird goes
    // from beady to friendly.
    const spark = new THREE.SphereGeometry(0.026, 6, 5);
    spark.translate(side * 0.16, 0.315, 0.485);
    parts.push(paint(spark, 0xffffff));
  }

  // The tail: short and cocked up a little, the way a bird stands.
  const tail = new THREE.ConeGeometry(0.17, 0.44, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.24, 1);
  tail.rotateX(0.28);
  tail.translate(0, 0.09, -0.56);
  parts.push(paint(tail, 0xeef4f8));

  // Feet, tucked under. Barely visible in the air and exactly what is wanted
  // when the bird is standing on a whale.
  for (const side of [-1, 1]) {
    const foot = new THREE.SphereGeometry(0.06, 6, 5);
    foot.scale(0.7, 0.45, 1.5);
    foot.translate(side * 0.09, -0.24, 0.08);
    parts.push(paint(foot, 0xf6a521));
  }

  return mergeGeometries(parts, false);
}

/**
 * One wing, reaching along +X from the shoulder.
 *
 * Drawn as an outline and then extruded, rather than assembled out of squashed
 * spheres — a gull in the air is almost entirely silhouette, so the shape of
 * the *edge* is the whole of what makes it read as a bird. The three earlier
 * blobs gave a rounded paddle, and a gull's wing is nothing like a paddle:
 * long, narrow, swept hard back, and drawn out to a point.
 *
 * The outline runs out along the leading edge, round the tip as four separated
 * primary feathers — the spread fingers you can see against the sky on any
 * gull — and back along the trailing edge to the body.
 */
function gullWing(): THREE.BufferGeometry {
  const outline = new THREE.Shape();
  // Leading edge, out from the shoulder. It bulges forward at the wrist and
  // then sweeps back, which is where the wing's whole character lives.
  outline.moveTo(0.02, 0.22);
  outline.lineTo(0.26, 0.26);
  outline.lineTo(0.58, 0.23);
  outline.lineTo(0.94, 0.16);
  outline.lineTo(1.28, 0.06);
  outline.lineTo(1.49, -0.02);

  // The primaries: four fingers fanning back off the tip, each notched in
  // before the next reaches out. This is the detail that says gull.
  outline.lineTo(1.7, -0.09);
  outline.lineTo(1.46, -0.15);
  outline.lineTo(1.62, -0.22);
  outline.lineTo(1.37, -0.26);
  outline.lineTo(1.49, -0.32);
  outline.lineTo(1.24, -0.34);
  outline.lineTo(1.31, -0.4);
  outline.lineTo(1.1, -0.38);

  // Trailing edge, back in to the body.
  outline.lineTo(0.78, -0.36);
  outline.lineTo(0.47, -0.32);
  outline.lineTo(0.21, -0.26);
  outline.lineTo(0.02, -0.22);
  outline.closePath();

  // Thin, but not flat. A wing with no thickness at all disappears completely
  // when the bird turns edge-on to you, which for gulls wheeling in circles is
  // several times a lap.
  const geo = new THREE.ExtrudeGeometry(outline, {
    depth: 0.035,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.translate(0, 0, -0.0175);
  // Built in the XY plane and laid flat: the shape's y, which is the chord,
  // becomes the world's z, which is the direction the gull is facing.
  geo.rotateX(Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const span = pos.getX(i);
    // A gull holds its wings in a shallow arch rather than a flat board, and
    // the tip is lower than the wrist. Squared, so it is all in the outer half.
    const arch = 0.3 * span * span - 0.19 * span * span * span;
    pos.setY(i, pos.getY(i) + arch);
  }
  geo.computeVertexNormals();

  return paintBySpan(geo);
}

/**
 * White at the shoulder, grey through the middle, near-black at the primaries.
 *
 * Painted per vertex off how far out the vertex is, because the wingtip is one
 * of the two things that make a bird look like a herring gull and it cannot be
 * a separate mesh — it is the same triangles as the rest of the wing.
 */
function paintBySpan(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  const pos = geo.attributes.position;
  const pale = new THREE.Color(0xfbfdfe).convertSRGBToLinear();
  const grey = new THREE.Color(0xc3d0d8).convertSRGBToLinear();
  const dark = new THREE.Color(0x4a545e).convertSRGBToLinear();
  const c = new THREE.Color();
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const span = Math.min(1, Math.max(0, pos.getX(i) / 1.7));
    if (span < 0.62) {
      c.copy(pale).lerp(grey, span / 0.62);
    } else {
      // Hard-ish, because the black on a gull's wing starts abruptly.
      c.copy(grey).lerp(dark, Math.min(1, (span - 0.62) / 0.16));
    }
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}
