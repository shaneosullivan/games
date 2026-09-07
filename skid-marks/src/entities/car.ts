import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CAR} from "../config";
import {flatVertex, LAYER, tile} from "../render/sprites";
import {Track} from "./track";

const TAU = Math.PI * 2;

function shortestAngle(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/**
 * A car: a sprite, and the arcade drift model under it.
 *
 * The model is the whole game and it is two lines long in spirit: the car has
 * a **heading** and a **velocity**, and they are not the same thing. Split the
 * velocity into the part going the way the nose points and the part going
 * sideways; the engine works on the first, and grip eats the second. Turn the
 * nose faster than grip can drag the velocity round after it and the car is
 * sliding — which is what a skid is, and what the game is named after.
 *
 * Used for the player and for the rivals alike; what differs is who is holding
 * the stick.
 */
export class Car {
  readonly group = new THREE.Group();

  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  /** In units a second, in world axes. */
  readonly velocity = new THREE.Vector2();
  heading = 0;
  private prevHeading = 0;

  /** How fast it is going sideways. The skid marks and the tyre noise both
   *  read off this, and so does whether the player is being clever. */
  slip = 0;
  /** Where it was on the circuit last step, so `nearest` can search from a
   *  hint instead of from scratch. */
  hint = 0;
  /** How far round the lap, counted so it can pass 1 rather than wrapping. */
  lap = 0;

  private readonly dir = new THREE.Vector2();
  private readonly side = new THREE.Vector2();

  constructor(colour: number) {
    this.group.add(new THREE.Mesh(carSprite(colour), flatVertex()));
  }

  place(
    x: number,
    z: number,
    heading: number,
    hint: number,
    lap: number,
  ): void {
    this.position.set(x, LAYER.car, z);
    this.prevPosition.copy(this.position);
    this.heading = heading;
    this.prevHeading = heading;
    this.velocity.set(0, 0);
    this.slip = 0;
    this.hint = hint;
    this.lap = lap;
  }

  /** How fast it is going, whichever way it happens to be pointing. */
  get speed(): number {
    return this.velocity.length();
  }

  /**
   * One step.
   *
   * `want` is the direction the stick is asking for and how hard it is over —
   * which is both the tiller and the throttle. Returns how far off the middle
   * of the track it now is, since the caller wants that for the surface and
   * the barriers anyway.
   */
  update(dt: number, want: THREE.Vector2, track: Track): number {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;

    const found = track.nearest(this.position.x, this.position.z, this.hint);
    this.hint = found.index;
    const tarmac = track.onTarmac(found.offset);

    const push = Math.min(1, want.length());
    if (push > 1e-4) {
      // Turn toward the stick — but less and less of the turn survives as the
      // speed comes up. A car that cornered as hard at a hundred as at a walk
      // would have no corners in it.
      const target = Math.atan2(want.x, want.y);
      const ease = Math.min(1, this.speed / CAR.top);
      const rate = CAR.turn * (1 - ease * (1 - CAR.turnAtSpeed));
      const diff = shortestAngle(this.heading, target);
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    }

    this.dir.set(Math.sin(this.heading), Math.cos(this.heading));
    this.side.set(this.dir.y, -this.dir.x);

    // The two halves of the velocity: the way the nose points, and sideways.
    let along = this.velocity.dot(this.dir);
    let across = this.velocity.dot(this.side);

    if (push > 1e-4) {
      // Pushing against the way you are already going is the brake. There is
      // no separate brake button and there does not need to be one — asking to
      // go the other way is asking to slow down, which is what a child does
      // without being told.
      const facing = (this.dir.x * want.x + this.dir.y * want.y) / (push || 1);
      if (facing < -0.2 && along > 0) {
        along -= CAR.brake * push * dt;
      } else {
        along += CAR.accel * push * dt;
      }
    } else {
      along -= Math.sign(along) * Math.min(Math.abs(along), CAR.coast * dt);
    }

    // Grip. Frame-rate independent decay rather than a fixed subtraction, so
    // the slide behaves the same on a 60Hz laptop and a 120Hz iPad.
    const grip = CAR.grip * (tarmac ? 1 : CAR.grassGrip);
    across *= Math.exp(-grip * dt);

    const top = CAR.top * (tarmac ? 1 : CAR.grassTop);
    along = Math.max(-top * 0.35, Math.min(top, along));

    this.velocity.set(
      this.dir.x * along + this.side.x * across,
      this.dir.y * along + this.side.y * across,
    );
    this.slip = Math.abs(across);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.y * dt;

    return track.nearest(this.position.x, this.position.z, this.hint).offset;
  }

  /**
   * Puts the car back inside the barriers.
   *
   * The plan says you may go on the grass but no farther, so this is the "no
   * farther": the car is put back on the line and the part of its speed that
   * was carrying it outward is thrown away. The part carrying it *along* the
   * track is kept — scraping the wall should cost you time, not stop you dead
   * and leave a child stranded facing a fence.
   */
  keepIn(track: Track): boolean {
    const found = track.nearest(this.position.x, this.position.z, this.hint);
    const limit = Track.limit;
    if (Math.abs(found.offset) <= limit) {
      return false;
    }
    const over = Math.abs(found.offset) - limit;
    const sign = Math.sign(found.offset);
    const side = track.sideAt(found.t, tmp3);
    this.position.x -= side.x * over * sign;
    this.position.z -= side.z * over * sign;

    const outward = this.velocity.x * side.x + this.velocity.y * side.z;
    if (outward * sign > 0) {
      this.velocity.x -= side.x * outward;
      this.velocity.y -= side.z * outward;
    }
    this.velocity.multiplyScalar(0.86);
    return true;
  }

  /** Where the back wheels are, for laying rubber. */
  wheels(gauge: number, out: Array<THREE.Vector2>): void {
    const back = -CAR.length * 0.3;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      out[i].set(
        this.position.x + this.dir.x * back + this.side.x * s * gauge * 0.5,
        this.position.z + this.dir.y * back + this.side.y * s * gauge * 0.5,
      );
    }
  }

  /** Draws it somewhere between the last step and this one. */
  render(alpha: number): void {
    this.group.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.group.rotation.y =
      this.prevHeading + shortestAngle(this.prevHeading, this.heading) * alpha;
  }
}

const tmp3 = new THREE.Vector3();

/**
 * The sprite: a car seen from directly above.
 *
 * Bold and simple on purpose. At the camera's height a car is about twenty
 * pixels long, which is exactly what it was on an Amiga — so it is a body, a
 * dark cockpit, four black tyres and a light stripe up the nose, and anything
 * finer than that would be a smudge.
 *
 * Pointing +Z, so the group's Y rotation is the heading and nothing has to be
 * offset by a right angle anywhere else in the game.
 */
function carSprite(colour: number): THREE.BufferGeometry {
  const L = CAR.length;
  const W = CAR.width;
  const parts: Array<THREE.BufferGeometry> = [];

  // The tyres first, so the body is drawn over their inner edges.
  for (const along of [0.3, -0.28]) {
    for (const side of [-1, 1]) {
      const tyre = tile(W * 0.26, L * 0.22, 0x1b1b1f);
      tyre.translate(side * W * 0.52, 0, along * L);
      parts.push(tyre);
    }
  }

  const body = tile(W, L, colour);
  parts.push(body);

  // A nose that tapers, which is most of what says which way it is facing.
  const nose = tile(W * 0.62, L * 0.22, colour);
  nose.translate(0, 0, L * 0.5);
  parts.push(nose);

  const stripe = tile(W * 0.18, L * 0.66, 0xf2efe6);
  stripe.translate(0, 0.02, L * 0.06);
  parts.push(stripe);

  const cockpit = tile(W * 0.56, L * 0.3, 0x24252b);
  cockpit.translate(0, 0.03, -L * 0.02);
  parts.push(cockpit);

  // A wing across the tail: the one shape that stops it reading as a brick.
  const wing = tile(W * 1.15, L * 0.1, 0x24252b);
  wing.translate(0, 0.02, -L * 0.48);
  parts.push(wing);

  const merged = mergeGeometries(parts, false);
  return merged;
}
