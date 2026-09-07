import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CAR, ITEM} from "../config";
import {flatVertex, LAYER, order, tile} from "../render/sprites";
import {Patches} from "./patches";
import {Track} from "./track";

const TAU = Math.PI * 2;

/**
 * The two ways a car is driven, and they are genuinely different things.
 *
 * `aim` is the thumbstick: a direction on the screen and how hard it is over.
 * The car turns towards it, so pushing back on the stick turns the car round —
 * which is what a thumb expects and needs no reading of instructions.
 *
 * `wheel` is a keyboard: left and right of the car's own nose, and a pedal.
 * Holding left keeps turning left for as long as it is held, whatever the car
 * ends up pointing at, and back is a brake rather than a request to face the
 * other way. Feeding a keyboard through `aim` gave four fixed compass
 * directions, which is not driving.
 */
export type Drive =
  | {kind: "aim"; aim: THREE.Vector2}
  | {kind: "wheel"; steer: number; throttle: number};

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
 * sliding — which is what a skid is, and the whole point of the game.
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

  /**
   * How long is left in the air after a ramp.
   *
   * Seen from straight above there is no such thing as height, so a jump is
   * told entirely by the sprite growing and its shadow staying where it is.
   * While this is running the car keeps whatever it was doing: no grip, no
   * throttle, almost no steering. A jump is committed to.
   */
  air = 0;

  private readonly dir = new THREE.Vector2();
  private readonly side = new THREE.Vector2();
  private readonly sprite: THREE.Mesh;
  private readonly shadow: THREE.Mesh;

  constructor(colour: number) {
    this.sprite = new THREE.Mesh(carSprite(colour), flatVertex());
    // Under the car and only ever seen in mid-air. It stays the size the car
    // was on the ground, which is what makes the car look as though it has
    // left it rather than merely got bigger.
    this.shadow = new THREE.Mesh(
      tile(CAR.width * 1.05, CAR.length * 1.05, 0x000000),
      flatVertex(),
    );
    this.shadow.position.y = LAYER.shadow - LAYER.car;
    this.shadow.visible = false;
    this.shadow.renderOrder = order(LAYER.shadow);
    this.sprite.renderOrder = order(LAYER.car);
    this.group.add(this.shadow, this.sprite);
  }

  /** Off the ground, and how far through the jump. */
  get airborne(): boolean {
    return this.air > 0;
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
    this.air = 0;
  }

  /** How fast it is going, whichever way it happens to be pointing. */
  get speed(): number {
    return this.velocity.length();
  }

  /**
   * One step.
   *
   * `drive` is either the stick or the keys; see `Drive`. Returns how far off
   * the middle of the track it now is, since the caller wants that for the
   * surface and the barriers anyway.
   */
  update(dt: number, drive: Drive, track: Track, patches?: Patches): number {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;

    const found = track.nearest(this.position.x, this.position.z, this.hint);
    this.hint = found.index;
    const tarmac = track.onTarmac(found.offset);

    // What is under the wheels. Checked before the jump timer is spent, so a
    // ramp taken at walking pace does nothing and one taken at speed launches.
    const on = patches ? patches.at(this.position.x, this.position.z) : null;
    if (this.air > 0) {
      this.air = Math.max(0, this.air - dt);
    } else if (on === "ramp" && this.speed >= ITEM.ramp.minSpeed) {
      this.air = ITEM.ramp.airtime;
    }
    const flying = this.air > 0;

    // How fast the nose can come round. Less and less of the turn survives as
    // the speed comes up — a car that cornered as hard at a hundred as at a
    // walk would have no corners in it — and in mid-air there is barely any.
    const ease = Math.min(1, this.speed / CAR.top);
    let rate = CAR.turn * (1 - ease * (1 - CAR.turnAtSpeed));
    if (flying) {
      rate *= ITEM.ramp.steer;
    }

    let push: number;
    /** Asking to slow down, however this car is being driven. */
    let backwards: boolean;
    /** The stick's direction, kept so the brake test can be made below —
     *  after the nose has been turned, since it is asked against the nose. */
    let aim: THREE.Vector2 | null = null;

    if (drive.kind === "wheel") {
      push = Math.min(1, Math.abs(drive.throttle));
      backwards = drive.throttle < 0;
      // Steering is not throttle here: a coasting car still turns, so this is
      // outside the `push` test that the stick's version lives inside.
      this.heading += drive.steer * rate * dt;
    } else {
      aim = drive.aim;
      push = Math.min(1, aim.length());
      backwards = false;
      if (push > 1e-4) {
        const target = Math.atan2(aim.x, aim.y);
        const diff = shortestAngle(this.heading, target);
        this.heading += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
      }
    }

    this.dir.set(Math.sin(this.heading), Math.cos(this.heading));
    this.side.set(this.dir.y, -this.dir.x);

    if (aim && push > 1e-4) {
      // Pushing against the way you are already going is the brake. There is
      // no separate brake button and there does not need to be one — asking to
      // go the other way is asking to slow down, which is what a child does
      // without being told.
      backwards = (this.dir.x * aim.x + this.dir.y * aim.y) / push < -0.2;
    }

    // The two halves of the velocity: the way the nose points, and sideways.
    let along = this.velocity.dot(this.dir);
    let across = this.velocity.dot(this.side);

    if (flying) {
      // Nothing to push against up here: whatever the car had going into the
      // ramp is what it lands with.
    } else if (push > 1e-4) {
      if (backwards) {
        // Brake while it is still rolling forward, and reverse once it is not.
        // The stick never reaches the second case — pushing back on it turns
        // the car round instead — but a keyboard's down arrow should back out
        // of a wall rather than sit there.
        along -= (along > 0 ? CAR.brake : CAR.accel) * push * dt;
      } else {
        along += CAR.accel * push * dt;
      }
    } else {
      along -= Math.sign(along) * Math.min(Math.abs(along), CAR.coast * dt);
    }

    // Grip. Frame-rate independent decay rather than a fixed subtraction, so
    // the slide behaves the same on a 60Hz laptop and a 120Hz iPad.
    let grip = CAR.grip * (tarmac ? 1 : CAR.grassGrip);
    let top = CAR.top * (tarmac ? 1 : CAR.grassTop);
    if (on === "oil" && !flying) {
      // Almost no grip at all, which is what oil is for: the back end goes and
      // it stays gone until the car is off the slick.
      grip *= ITEM.oil.grip;
    }
    if (on === "mud" && !flying) {
      top *= ITEM.mud.top;
      along -= Math.sign(along) * Math.min(Math.abs(along), ITEM.mud.drag * dt);
    }
    if (flying) {
      // In the air the velocity is simply carried: no grip to pull it round,
      // and no surface to take it away.
      grip = 0;
    }
    across *= Math.exp(-grip * dt);

    along = Math.max(-top * 0.35, Math.min(top, along));

    this.velocity.set(
      this.dir.x * along + this.side.x * across,
      this.dir.y * along + this.side.y * across,
    );
    // No rubber in mid-air, which is both true and the only thing stopping a
    // jump from painting a stripe across the grass it flew over.
    this.slip = flying ? 0 : Math.abs(across);

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

    // The jump, drawn. A half-sine so the car swells off the ramp and settles
    // back onto its shadow rather than snapping between two sizes.
    const through = this.air > 0 ? 1 - this.air / ITEM.ramp.airtime : 0;
    const lift =
      this.air > 0 ? Math.sin(Math.PI * through) * ITEM.ramp.lift : 0;
    this.sprite.scale.setScalar(1 + lift);
    this.shadow.visible = this.air > 0;
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
