import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {BUMP, HARE, JUMP} from "../config";
import {Wood} from "./wood";
import {PALETTE, paint, vertexToon} from "../render/materials";

const TAU = Math.PI * 2;

/** Wraps an angle difference into -PI..PI, so a turn always goes the short
 *  way round rather than the long way through three and a bit radians. */
function shortestAngle(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/**
 * The hare.
 *
 * The plan sets the rules and they are unusual ones: it is always running
 * forward, it slows down when nobody is touching the screen, it is very fast,
 * and it can jump high. So the stick is a throttle as much as a tiller —
 * holding it is running flat out, letting go drops you to a lope. There is no
 * stopping and no reverse, and there does not need to be: something is chasing
 * you.
 *
 * Fixed timestep with an interpolated render, the same as the other games:
 * update() moves it and render(alpha) draws it somewhere between where it was
 * and where it is.
 */
export class Hare {
  readonly group = new THREE.Group();

  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  heading = Math.PI;
  private prevHeading = Math.PI;

  /** Along the heading, in units a second. */
  speed = 0;
  /** Up and down, and whether there is any ground underneath. */
  vy = 0;
  grounded = true;

  /** Seconds before it can be caught by anything again, and how long it is
   *  still stumbling. Both cosmetic as far as steering goes — the controls
   *  never stop working. */
  rest = 0;
  private stumble = 0;

  /** A jump asked for a moment too early, kept until there is ground to jump
   *  from. See JUMP.remember. */
  private wanted = 0;

  /** How far through its bound it is: 0 to 1 and round again. Everything the
   *  body does hangs off this. */
  private stride = 0;
  private lean = 0;
  private prevLean = 0;
  private prevStride = 0;

  private readonly body = new THREE.Group();
  private readonly ears: Array<THREE.Object3D> = [];
  private readonly legs: Array<THREE.Object3D> = [];

  constructor() {
    this.build();
    this.group.add(this.body);
  }

  /**
   * Drops it on the ground at a spot, facing down the wood.
   *
   * Everything is put back, not just the position: this is what a restart uses
   * after the dogs have had you, and a hare that starts the next run still
   * carrying the last one's stumble is a hare with a limp nobody asked for.
   */
  place(wood: Wood, x: number, z: number): void {
    this.position.set(x, wood.heightAt(x, z) + HARE.ride, z);
    this.prevPosition.copy(this.position);
    this.heading = Math.PI;
    this.prevHeading = this.heading;
    this.speed = HARE.lope;
    this.vy = 0;
    this.grounded = true;
    this.rest = 0;
    this.stumble = 0;
    this.wanted = 0;
    this.lean = 0;
    this.prevLean = 0;
    this.group.scale.setScalar(1);
    this.group.visible = true;
  }

  /** The player has asked for a jump. Remembered for a moment if there is no
   *  ground to jump from yet — see JUMP.remember. */
  askJump(): void {
    this.wanted = JUMP.remember;
  }

  /**
   * One step.
   *
   * `want` is the direction the stick is asking for, in world axes and already
   * read against the camera; its length is how hard it is being pushed, which
   * is the throttle. Returns whether it landed this step, so the game can kick
   * up leaves and make a noise about it without the hare having to know either
   * exists.
   */
  update(dt: number, want: THREE.Vector3, wood: Wood): boolean {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;
    this.prevLean = this.lean;
    this.prevStride = this.stride;
    this.rest = Math.max(0, this.rest - dt);
    this.stumble = Math.max(0, this.stumble - dt);

    const push = Math.min(1, want.length());
    if (push > 1e-4) {
      // Turn toward the stick — but less and less of the turn survives as the
      // speed comes up. Even a hare cannot corner flat out, and letting it
      // made the whole wood feel like a corridor with no corners in it.
      const target = Math.atan2(want.x, want.z);
      const ease = Math.min(1, this.speed / HARE.topSpeed);
      const rate = HARE.turnRate * (1 - ease * (1 - HARE.turnAtSpeed));
      const diff = shortestAngle(this.heading, target);
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    }

    // The throttle. Hold the stick and it winds up to a gallop; let go and it
    // falls back to a lope, which is the plan's own rule and the reason the
    // dogs are worth being afraid of.
    const asked = HARE.lope + (HARE.topSpeed - HARE.lope) * push;
    const rate = asked > this.speed ? HARE.quicken : HARE.slacken;
    const step = rate * dt;
    this.speed +=
      Math.sign(asked - this.speed) *
      Math.min(Math.abs(asked - this.speed), step);

    const dirX = Math.sin(this.heading);
    const dirZ = Math.cos(this.heading);
    this.position.x += dirX * this.speed * dt;
    this.position.z += dirZ * this.speed * dt;

    // Up and down. Gravity is integrated whether or not there is ground under
    // the feet, and the ground gets a chance to interrupt it: if free fall
    // would still leave the hare above the grass then the grass has dropped
    // away and it is in the air.
    const groundY = wood.heightAt(this.position.x, this.position.z) + HARE.ride;
    this.wanted = Math.max(0, this.wanted - dt);
    if (this.grounded && this.wanted > 0) {
      this.vy = JUMP.speed;
      this.wanted = 0;
      this.grounded = false;
    }
    const freeVy = this.vy - JUMP.gravity * dt;
    const freeY = this.position.y + freeVy * dt;
    let landed = false;
    if (freeY > groundY) {
      this.position.y = freeY;
      this.vy = freeVy;
      this.grounded = false;
    } else {
      landed = !this.grounded;
      if (landed) {
        this.speed *= JUMP.landKeep;
      }
      // On the ground the vertical speed is the ground's, not gravity's, so
      // the hare follows a rise instead of pushing through it.
      this.vy = (groundY - this.position.y) / dt;
      this.position.y = groundY;
      this.grounded = true;
    }

    this.animate(dt, want);
    return landed;
  }

  /**
   * Pulled up short by a log or a bramble.
   *
   * No falling over: there is nothing to fall over for. Most of the speed is
   * gone and the dogs are a length closer than they were, and on a hill where
   * something is chasing you that is punishment enough.
   */
  bump(fromX: number, fromZ: number, reach: number, wood: Wood): void {
    let dx = this.position.x - fromX;
    let dz = this.position.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      dx = Math.sin(this.heading + Math.PI / 2);
      dz = Math.cos(this.heading + Math.PI / 2);
    } else {
      dx /= d;
      dz /= d;
    }
    const out = reach + BUMP.clear;
    this.position.x = fromX + dx * out;
    this.position.z = fromZ + dz * out;
    // Put back down on the ground where it now is, keeping the vertical speed
    // it already had: that is the rate the ground was falling away at, and
    // zeroing it would leave the hare hanging in the air after every stone.
    this.position.y =
      wood.heightAt(this.position.x, this.position.z) + HARE.ride;
    this.grounded = true;
    this.speed *= BUMP.keep;
    this.rest = BUMP.rest;
    this.stumble = BUMP.stumble;
  }

  /** How far down the wood it is, 0 to 1. */
  along(wood: Wood): number {
    return Math.min(1, Math.max(0, this.position.z / wood.homeZ));
  }

  private animate(dt: number, want: THREE.Vector3): void {
    // The bound. A hare does not trot: it gathers and springs, and the whole
    // animation is one phase running faster the faster it goes.
    this.stride += dt * (0.7 + this.speed / HARE.topSpeed) * 5.5;

    let wantLean = 0;
    if (want.lengthSq() > 1e-6) {
      const target = Math.atan2(want.x, want.z);
      const diff = shortestAngle(this.heading, target);
      wantLean = -Math.max(-1, Math.min(1, diff * 1.5)) * HARE.leanMax;
    }
    this.lean += (wantLean - this.lean) * Math.min(1, HARE.leanRate * dt);

    // The ears go back at speed and up when it is loping, which is the one
    // thing that shows the throttle without a dial on the screen.
    const rush = Math.min(
      1,
      (this.speed - HARE.lope) / (HARE.topSpeed - HARE.lope),
    );
    const flick = Math.sin(this.stride * 0.5) * 0.08;
    for (let i = 0; i < this.ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      // Back, but not flat back. Laid right along the spine the ears vanish
      // into the outline and the animal becomes a brown lump seen from behind,
      // which is the view a player has for the whole run.
      this.ears[i].rotation.x = -0.15 + rush * 0.85 + flick;
      this.ears[i].rotation.z = side * (0.18 + rush * 0.2);
    }

    // Front legs and back legs, half a phase apart, tucked in the air.
    const air = this.grounded ? 1 : 0.35;
    for (let i = 0; i < this.legs.length; i++) {
      const front = i < 2;
      const swing = Math.sin(this.stride + (front ? 0 : Math.PI)) * 0.9 * air;
      this.legs[i].rotation.x = swing + (front ? 0.2 : -0.2);
    }
  }

  /** Draws it somewhere between the last step and this one. */
  render(alpha: number): void {
    this.group.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.group.rotation.y =
      this.prevHeading + shortestAngle(this.prevHeading, this.heading) * alpha;
    const lean = this.prevLean + (this.lean - this.prevLean) * alpha;
    const stride = this.prevStride + (this.stride - this.prevStride) * alpha;

    // The body rises and falls through the bound, and pitches nose-up as it
    // leaves the ground and nose-down as it comes back — which is what turns
    // a bobbing egg into an animal running.
    const bound = this.grounded ? Math.abs(Math.sin(stride)) : 1;
    this.body.position.y = bound * 1.1;
    const pitch = this.grounded
      ? Math.cos(stride) * 0.16
      : Math.max(-0.5, Math.min(0.5, this.vy / 90));
    // A stumble rocks it for a moment. Fast and small, and it dies away on its
    // own — the steering never stops working, so this is all a bump costs.
    const shake = this.stumble > 0 ? Math.sin(this.stumble * 42) * 0.35 : 0;
    this.body.rotation.set(-pitch, 0, lean + shake, "XZY");
  }

  /**
   * The animal: a long body, a small head, two long ears and four legs.
   *
   * Everything is a squashed sphere or a cone, painted and merged into one
   * geometry — one draw call for the body, the way the other games here are
   * built. Only the ears and legs are kept out of the merge, because they are
   * the parts that have to move on their own.
   */
  private build(): void {
    const parts: Array<THREE.BufferGeometry> = [];

    // The body: a long egg, higher at the back than the front, which is the
    // shape of every hare ever drawn.
    const back = new THREE.SphereGeometry(2, 14, 11);
    back.scale(0.82, 0.86, 1.35);
    back.translate(0, 0.15, -0.5);
    parts.push(paint(back, PALETTE.fur));

    const chest = new THREE.SphereGeometry(1.55, 12, 10);
    chest.scale(0.85, 0.85, 1.1);
    chest.translate(0, -0.1, 1.5);
    parts.push(paint(chest, PALETTE.fur));

    // The pale underside, poking through beneath.
    const belly = new THREE.SphereGeometry(1.72, 12, 10);
    belly.scale(0.72, 0.62, 1.35);
    belly.translate(0, -0.72, 0.2);
    parts.push(paint(belly, PALETTE.furLight));

    // The head, low and forward.
    const head = new THREE.SphereGeometry(1.15, 12, 10);
    head.scale(0.88, 0.88, 1.1);
    head.translate(0, 0.5, 2.9);
    parts.push(paint(head, PALETTE.fur));

    const muzzle = new THREE.SphereGeometry(0.66, 10, 8);
    muzzle.scale(0.85, 0.8, 1.1);
    muzzle.translate(0, 0.16, 3.75);
    parts.push(paint(muzzle, PALETTE.furLight));

    const nose = new THREE.SphereGeometry(0.22, 8, 6);
    nose.translate(0, 0.3, 4.28);
    parts.push(paint(nose, PALETTE.nose));

    for (const side of [-1, 1]) {
      // Set well round the side of the head: a hare's eyes are on the corners,
      // which is how it sees what is behind it, and it is most of why a hare
      // looks like a hare and not like a cat.
      const eye = new THREE.SphereGeometry(0.28, 10, 8);
      eye.translate(side * 0.82, 0.78, 3.1);
      parts.push(paint(eye, PALETTE.eye));

      const glint = new THREE.SphereGeometry(0.1, 6, 5);
      glint.translate(side * 0.93, 0.92, 3.28);
      parts.push(paint(glint, 0xffffff));
    }

    // The scut: a little white ball of a tail.
    const tail = new THREE.SphereGeometry(0.6, 8, 6);
    tail.translate(0, 0.5, -2.5);
    parts.push(paint(tail, PALETTE.furLight));

    const merged = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, vertexToon());
    mesh.castShadow = true;
    this.body.add(mesh);

    // The ears, on their own pivots at the back of the head so they swing from
    // the root. They are the longest thing on the animal and they are what a
    // child will look at.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 1.2, 2.5);
      const ear = new THREE.SphereGeometry(1, 8, 8);
      ear.scale(0.26, 1.5, 0.42);
      ear.translate(0, 1.35, 0);
      const inner = new THREE.SphereGeometry(1, 8, 8);
      inner.scale(0.15, 1.25, 0.24);
      inner.translate(0, 1.35, 0.16);
      const mergedEar = mergeGeometries(
        [paint(ear, PALETTE.fur), paint(inner, PALETTE.nose)],
        false,
      );
      const mesh2 = new THREE.Mesh(mergedEar, vertexToon());
      mesh2.castShadow = true;
      pivot.add(mesh2);
      this.body.add(pivot);
      this.ears.push(pivot);
    }

    // Four legs. The back pair are the big ones — that is where a hare keeps
    // its engine — and they hang from further back.
    const legs = [
      {x: -0.85, y: -0.5, z: 1.9, r: 0.34, len: 1.7, big: false},
      {x: 0.85, y: -0.5, z: 1.9, r: 0.34, len: 1.7, big: false},
      {x: -1.05, y: -0.35, z: -1.2, r: 0.5, len: 2.3, big: true},
      {x: 1.05, y: -0.35, z: -1.2, r: 0.5, len: 2.3, big: true},
    ];
    for (const leg of legs) {
      const pivot = new THREE.Group();
      pivot.position.set(leg.x, leg.y, leg.z);
      const upper = new THREE.SphereGeometry(1, 8, 7);
      upper.scale(leg.r, leg.len * 0.55, leg.r * 1.5);
      upper.translate(0, -leg.len * 0.4, 0);
      const foot = new THREE.SphereGeometry(1, 8, 7);
      foot.scale(leg.r * 0.9, leg.r * 0.7, leg.len * 0.6);
      foot.translate(0, -leg.len * 0.85, leg.big ? -0.3 : 0.25);
      const mergedLeg = mergeGeometries(
        [paint(upper, PALETTE.furDark), paint(foot, PALETTE.fur)],
        false,
      );
      const mesh3 = new THREE.Mesh(mergedLeg, vertexToon());
      mesh3.castShadow = true;
      pivot.add(mesh3);
      this.body.add(pivot);
      this.legs.push(pivot);
    }
  }
}
