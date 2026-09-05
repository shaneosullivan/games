import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {BUMP, SLIDE} from "../config";
import {Hill} from "./hill";
import {PALETTE, paint, vertexToon} from "../render/materials";

const TAU = Math.PI * 2;

/** Wraps an angle difference into -PI..PI, so a turn always goes the short
 *  way round rather than the long way through three and a bit radians. */
function shortestAngle(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/**
 * The penguin, and the way it slides.
 *
 * A skier's model rather than a car's. The bird has a heading; gravity pushes
 * it along that heading by however much of the slope points that way; the snow
 * drags on it in proportion to how fast it is going. Turn across the hill and
 * you slow down, point it down the fall line and you go — which is the whole
 * game, and the reason there is no brake button. Pulling the stick back turns
 * you up the hill, and turning up the hill is how anything stops on snow.
 *
 * Fixed timestep with an interpolated render, the same as the other games:
 * update() moves it and render(alpha) draws it somewhere between where it was
 * and where it is.
 */
export class Penguin {
  readonly group = new THREE.Group();

  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  heading = Math.PI;
  private prevHeading = Math.PI;

  /** Along the heading, in units a second. Never negative — a penguin on its
   *  belly does not reverse. */
  speed = 0;
  /** Up and down, and whether there is any snow underneath. */
  vy = 0;
  grounded = true;

  /** Seconds of wobble left after a bump. Cosmetic only — the steering never
   *  stops working, which is the whole point of a bump rather than a fall. */
  shake = 0;

  /** How hard it is scraping sideways, 0..1. The snow spray reads off this. */
  carve = 0;
  /** How much of what is under the belly is frozen lake, 0..1, and whether
   *  there is enough of it to have taken the steering away. */
  ice = 0;
  onIce = false;
  /**
   * The way it is actually travelling while it is on a lake, which is not the
   * way it is pointing.
   *
   * Captured the moment the ice takes hold and held until it lets go. On snow
   * the two are the same thing and this is unused.
   */
  private readonly glide = new THREE.Vector2(0, 1);
  /** Up on its feet and walking, rather than sliding, and how fast that walk
   *  has got up to. See SLIDE.shuffle. */
  waddling = false;
  private waddleSpeed = 0;

  private pitch = 0;
  private lean = 0;
  private prevPitch = 0;
  private prevLean = 0;
  private paddle = 0;

  private readonly flippers: Array<THREE.Object3D> = [];
  /** The links of the scarf, nose to tip. Each one hangs off the one before,
   *  so a wave put into the first travels down the whole thing. */
  private readonly scarf: Array<THREE.Object3D> = [];
  private readonly body = new THREE.Group();

  private readonly grad = new THREE.Vector2();
  private readonly down = new THREE.Vector2();

  constructor() {
    this.build();
    this.group.add(this.body);
  }

  /** Drops it on the hill at a spot, facing down it. */
  place(hill: Hill, x: number, z: number): void {
    this.position.set(x, hill.heightAt(x, z) + SLIDE.ride, z);
    this.prevPosition.copy(this.position);
    this.heading = Math.PI;
    this.prevHeading = this.heading;
    this.speed = 0;
    this.vy = 0;
  }

  /**
   * One step.
   *
   * `want` is the direction the stick is asking for, in world axes and already
   * read against the camera — a zero vector means nobody is pushing. Returns
   * whether it landed this step, so the game can throw up snow and make a
   * noise about it without the penguin having to know either exists.
   */
  update(dt: number, want: THREE.Vector3, hill: Hill): boolean {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;
    this.prevPitch = this.pitch;
    this.prevLean = this.lean;

    // How much of what is underneath is frozen lake. Everything below reads
    // off this: the grip, the drag and how hard it can turn.
    this.ice = hill.iceAt(this.position.x, this.position.z);

    this.shake = Math.max(0, this.shake - dt);

    // On a frozen lake the bird still turns — you can spin it right round —
    // but turning does nothing to where it is going. It carries on along the
    // line it was on when the ice took hold, which is captured here, once.
    // See SLIDE.iceLock.
    const wasOnIce = this.onIce;
    this.onIce = this.ice > SLIDE.iceLock && this.speed > SLIDE.iceLockAbove;
    if (this.onIce && !wasOnIce) {
      this.glide.set(Math.sin(this.heading), Math.cos(this.heading));
    }

    if (want.lengthSq() > 1e-6) {
      // Turn toward the stick — but less and less of the turn survives as the
      // speed comes up. A bird doing fifty on its stomach cannot pivot like
      // one doing five, and letting it made the whole run feel weightless.
      const target = Math.atan2(want.x, want.z);
      const ease = Math.min(1, this.speed / (SLIDE.gravity / SLIDE.drag));
      const rate = SLIDE.turnRate * (1 - ease * (1 - SLIDE.turnAtSpeed));
      const diff = shortestAngle(this.heading, target);
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    }

    hill.slopeAt(this.position.x, this.position.z, this.grad);
    // Straight down the fall line. On genuinely flat ground there is no fall
    // line at all, and normalising a zero vector is how you get a penguin at
    // coordinates that are not numbers.
    this.down.set(-this.grad.x, -this.grad.y);
    const fall = this.down.length();
    if (fall > 1e-4) {
      this.down.multiplyScalar(1 / fall);
    } else {
      this.down.set(Math.sin(this.heading), Math.cos(this.heading));
    }

    // Which way it is going, which on the ice is not which way it is facing.
    const dirX = this.onIce ? this.glide.x : Math.sin(this.heading);
    const dirZ = this.onIce ? this.glide.y : Math.cos(this.heading);
    // How much of the slope is pointing that way. Positive downhill, negative
    // up it, which is what makes turning uphill a brake — and what makes
    // turning on the ice do nothing at all, since out there the direction of
    // travel is not the nose.
    const along = -(this.grad.x * dirX + this.grad.y * dirZ);

    if (this.grounded) {
      const pull = SLIDE.gravity * along;
      // Ice hardly holds you back at all, which is why you come off a lake
      // with what you took onto it and not a unit less.
      const drag = SLIDE.drag * (1 - this.ice * (1 - SLIDE.iceDrag));
      const stick = SLIDE.stickiness * (1 - this.ice);
      this.speed += (pull - drag * this.speed - stick) * dt;
    } else {
      // In the air nothing pushes and almost nothing holds it back. A jump
      // that scrubbed speed would be a jump nobody took twice.
      this.speed -= SLIDE.airDrag * this.speed * dt;
    }
    this.speed = Math.max(0, this.speed);

    // And the waddle, for a penguin that has stopped. See SLIDE.shuffle: there
    // must be no square foot of this mountain a child can come to rest on and
    // not get off again, and no fish they can go past and not go back for.
    //
    // It is its own speed, held from step to step, and the bird moves at
    // whichever of the two is greater. Adding it straight to `speed` did not
    // work: the slope takes the speed back to nothing every step, so all a
    // penguin facing up the hill managed was a fifth of a unit a second — its
    // feet going and the mountain winning, nine tenths of a unit in five
    // seconds.
    this.waddling =
      this.grounded && want.lengthSq() > 0 && this.speed <= SLIDE.shuffleBelow;
    if (this.waddling) {
      this.waddleSpeed = Math.min(
        SLIDE.shuffleBelow,
        this.waddleSpeed + SLIDE.shuffle * dt,
      );
      this.speed = Math.max(this.speed, this.waddleSpeed);
    } else {
      this.waddleSpeed = 0;
    }

    // Sideways wash. A traverse holds no perfect line on snow — you always
    // slide a little down the fall line — and how much depends on how far
    // across it you are pointing. Straight down the hill, none at all.
    const facing = dirX * this.down.x + dirZ * this.down.y;
    this.carve = Math.min(1, Math.max(0, 1 - Math.abs(facing)));
    const wash =
      this.speed *
      SLIDE.slip *
      (1 + this.ice * (SLIDE.iceSlip - 1)) *
      this.carve;

    this.position.x += (dirX * this.speed + this.down.x * wash) * dt;
    this.position.z += (dirZ * this.speed + this.down.y * wash) * dt;

    // Up and down. Gravity is integrated whether or not there is snow under
    // the belly, and the ground gets a chance to interrupt it: if free fall
    // would still leave the penguin above the snow then the snow has dropped
    // away and it is in the air. That one comparison is the whole of the
    // jumping — no ramp has to know it is a ramp.
    const groundY =
      hill.heightAt(this.position.x, this.position.z) + SLIDE.ride;
    const freeVy = this.vy - SLIDE.airGravity * dt;
    const freeY = this.position.y + freeVy * dt;
    let landed = false;
    if (freeY > groundY) {
      this.position.y = freeY;
      this.vy = freeVy;
      this.grounded = false;
    } else {
      landed = !this.grounded;
      // On the ground the vertical speed is the ground's, not gravity's —
      // which is what loads the penguin up on the way over a kicker and
      // launches it off the far side.
      this.vy = (groundY - this.position.y) / dt;
      this.position.y = groundY;
      this.grounded = true;
    }

    this.animate(dt, along, want);
    return landed;
  }

  /**
   * Bumped off something.
   *
   * Knocked sideways, most of the speed gone, still the right way up and still
   * steering. It used to knock the penguin into a tumble that took the
   * controls away for a second and a half, which on a hill you are still going
   * down is the game playing itself while a child watches.
   *
   * The three parts are: pushed clear of the thing, so the next step is not
   * another bump off the same tree; the nose knocked partly round toward
   * whichever way it glanced off; and the speed halved.
   */
  bump(fromX: number, fromZ: number, reach: number, hill: Hill): void {
    let dx = this.position.x - fromX;
    let dz = this.position.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      // Dead centre. Which way it goes does not matter, only that it goes.
      dx = Math.sin(this.heading + Math.PI / 2);
      dz = Math.cos(this.heading + Math.PI / 2);
    } else {
      dx /= d;
      dz /= d;
    }
    const out = reach + BUMP.clear;
    this.position.x = fromX + dx * out;
    this.position.z = fromZ + dz * out;
    // Put back down on the snow where it now is.
    //
    // Being shoved sideways lands the penguin on ground of a different height,
    // and the vertical step reads that as the snow having dropped away — so
    // every glancing blow off a tree threw the bird into the air. A bump is a
    // bump; it is not a jump.
    this.position.y =
      hill.heightAt(this.position.x, this.position.z) + SLIDE.ride;
    this.grounded = true;
    // The vertical speed is left alone, and that is the whole of it. Zeroing
    // it looked like the safe thing and was the bug: on a hill the ground
    // drops half a unit a frame under a bird doing forty-five, and one with no
    // downward speed cannot follow it — so it hung in the air for a fifth of a
    // second after every tree, which is exactly the little hop that had to go.
    // What it already had is the rate the snow was falling away at.

    // Partly round toward straight-away, never the whole way: being spun to
    // face back up the hill would be its own kind of stop.
    const away = Math.atan2(dx, dz);
    this.heading += shortestAngle(this.heading, away) * BUMP.turn;
    this.speed *= BUMP.keep;
    this.shake = BUMP.shakeTime;
  }

  /** The beak, which is what picks the fish up. */
  beak(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.position.x + Math.sin(this.heading) * 3.4,
      this.position.y + 1.4,
      this.position.z + Math.cos(this.heading) * 3.4,
    );
  }

  /** How far round the belly is from the middle of the run — used by nothing
   *  but the readouts, and kept here so the arithmetic lives with the thing
   *  it describes. */
  along(hill: Hill): number {
    return Math.min(1, Math.max(0, this.position.z / hill.bannerZ));
  }

  private animate(dt: number, along: number, want: THREE.Vector3): void {
    // Nose follows the slope it is on. Not the slope under it exactly — the
    // one it is heading into — so it tips into a drop before it goes over it.
    // Flat on the ice, where the nose has nothing to do with the direction of
    // travel and tipping it to a slope it is not going down looks wrong.
    const wantPitch = this.onIce
      ? 0
      : Math.atan(along) * (this.grounded ? 1 : 0.35);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, SLIDE.pitchRate * dt);

    // Lean into the turn: how far the stick is pointing across the nose.
    let wantLean = 0;
    if (want.lengthSq() > 1e-6) {
      const target = Math.atan2(want.x, want.z);
      const diff = shortestAngle(this.heading, target);
      wantLean = -Math.max(-1, Math.min(1, diff * 1.4)) * SLIDE.leanMax;
    }
    this.lean += (wantLean - this.lean) * Math.min(1, SLIDE.leanRate * dt);
    // And the wobble after a bump, rocking on top of the lean and dying away
    // with it. A fast sine rather than anything cleverer: it lasts half a
    // second and nobody is going to study it.
    if (this.shake > 0) {
      const fade = this.shake / BUMP.shakeTime;
      this.lean += Math.sin(this.shake * 34) * BUMP.shake * fade;
    }

    // The flippers paddle when you are working, and stick out when you are in
    // the air. A bird holds them out to balance, which is the one thing that
    // makes a jump read as a jump from behind.
    // The flippers go when it is working: carving hard, or up on its feet.
    this.paddle +=
      dt * SLIDE.paddleRate * (0.3 + this.carve + (this.waddling ? 1 : 0));
    // Flippers out on the ice as well as in the air — there is nothing else
    // to say "this is out of your hands now", and a bird with no grip does
    // exactly this.
    const spread = this.grounded && !this.onIce ? 0 : 0.9;
    const beat =
      Math.sin(this.paddle) * 0.35 * (this.waddling ? 1 : this.carve);
    for (let i = 0; i < this.flippers.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.flippers[i].rotation.z = side * (0.45 + spread + beat);
    }

    // The scarf streams out behind, and how hard it streams is the speed.
    // It is the one thing on the bird that tells you how fast you are going
    // without a number, which on a white hill with a white sky is worth more
    // than it sounds — there is nothing else out there to measure against.
    const rush = Math.min(1, this.speed / 40);
    for (let i = 0; i < this.scarf.length; i++) {
      const wave = Math.sin(this.paddle * 1.7 - i * 0.8);
      this.scarf[i].rotation.y = wave * 0.3 * rush;
      // Hangs down when you have stopped and lifts as you get going, which is
      // a scarf doing what a scarf does and costs one lerp. Negative, because
      // a positive rotation about X lifts the trailing end rather than
      // dropping it — the links point along -Z, not +Z.
      //
      // Small, because the links are nested and the angles add up: half a
      // radian each is two radians by the fourth, and the scarf curls under
      // the bird and comes back out through its chest.
      this.scarf[i].rotation.x = -0.14 * (1 - rush) + wave * 0.12 * rush;
    }
  }

  /** Draws it somewhere between the last step and this one. */
  render(alpha: number): void {
    this.group.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.group.rotation.y =
      this.prevHeading + shortestAngle(this.prevHeading, this.heading) * alpha;
    const pitch = this.prevPitch + (this.pitch - this.prevPitch) * alpha;
    const lean = this.prevLean + (this.lean - this.prevLean) * alpha;
    // Pitch about the body's own X and roll about its Z. Order matters: the
    // roll has to happen in the tipped frame, or a penguin nose-down on a
    // steep bit rolls about the wrong axis.
    this.body.rotation.set(-pitch, 0, lean, "XZY");
  }

  /**
   * The bird itself: an egg on its front with a face on it.
   *
   * Everything is a squashed sphere or a cone, painted and merged into one
   * geometry — one draw call for the whole animal, the way the bee and the
   * caterpillar are built. Only the flippers are kept out of the merge,
   * because they are the one part that has to move on its own.
   */
  private build(): void {
    const parts: Array<THREE.BufferGeometry> = [];

    // The back: a long egg lying down, nose at +Z.
    const back = new THREE.SphereGeometry(1.9, 16, 12);
    back.scale(0.92, 0.82, 1.55);
    parts.push(paint(back, PALETTE.back));

    // The white front, poking through the underside and up the chest. A second
    // ellipsoid rather than a painted patch: a patch on a sphere needs a
    // texture, and this game has none.
    const belly = new THREE.SphereGeometry(1.78, 16, 12);
    belly.scale(0.85, 0.78, 1.45);
    belly.translate(0, -0.34, 0.24);
    parts.push(paint(belly, PALETTE.belly));

    // The head.
    //
    // Bigger than a real penguin's, on purpose, and that is most of the
    // cuteness right there: a large head on a small body is the first thing
    // anyone reads as young, and everything else on this face is the same
    // trick applied smaller.
    const head = new THREE.SphereGeometry(1.34, 16, 12);
    head.scale(1, 0.94, 1);
    head.translate(0, 1.22, 1.56);
    parts.push(paint(head, PALETTE.back));

    // The white of the face, wide enough that the eyes sit on it rather than
    // beside it. A dark eye on a dark head is a hole; a dark eye on white is
    // an eye.
    const face = new THREE.SphereGeometry(1.12, 14, 10);
    face.scale(0.84, 0.9, 0.62);
    face.translate(0, 1.02, 2.3);
    parts.push(paint(face, PALETTE.belly));

    // A short, stubby beak, low and tipped down.
    //
    // It was longer and level, and a long level beak reads as a bird going
    // about its business. Short, blunt and pointing slightly at the floor is
    // the difference between a seabird and something a child wants to keep.
    const beak = new THREE.ConeGeometry(0.4, 0.86, 8);
    beak.rotateX(Math.PI / 2 + 0.22);
    beak.translate(0, 0.8, 2.98);
    parts.push(paint(beak, PALETTE.beak));

    for (const side of [-1, 1]) {
      // Big, and set low.
      //
      // Low is the important half. Eyes high on a head read as an adult and
      // eyes low on it read as a baby, and it is worth more than the size —
      // which is also doubled from what it was, because a small eye at this
      // distance is a full stop.
      const eye = new THREE.SphereGeometry(0.34, 12, 10);
      eye.translate(side * 0.46, 1.24, 2.72);
      parts.push(paint(eye, 0x161d26));

      // Two catchlights each, a big one up and out and a small one down and
      // in. One is a shine; two is the oldest trick in cartoon drawing and the
      // thing that makes an eye look wet and alive rather than painted on.
      const glint = new THREE.SphereGeometry(0.13, 8, 6);
      glint.translate(side * 0.58, 1.4, 2.97);
      parts.push(paint(glint, 0xffffff));

      const spark = new THREE.SphereGeometry(0.06, 6, 5);
      spark.translate(side * 0.32, 1.08, 2.99);
      parts.push(paint(spark, 0xffffff));

      // Cheeks, under the eyes and out to the side, where a full cheek
      // actually sits.
      const cheek = new THREE.SphereGeometry(0.36, 10, 8);
      cheek.scale(1, 0.72, 0.34);
      cheek.translate(side * 0.82, 0.88, 2.42);
      parts.push(paint(cheek, PALETTE.cheek));

      // The feet trail out behind. A penguin on its belly does not run; it
      // steers with its toes, and having them out is most of what says so.
      const foot = new THREE.ConeGeometry(0.42, 1.2, 6);
      foot.rotateX(-Math.PI / 2);
      foot.scale(1, 0.4, 1);
      foot.translate(side * 0.62, -0.94, -2.5);
      parts.push(paint(foot, PALETTE.foot));
    }

    // A bobble hat.
    //
    // Not decoration. Nine tenths of this game is spent looking at the back of
    // a dark bird on white snow, and from behind it read as a boulder — no
    // face, no beak, nothing to tell you which end was which. A red hat with a
    // white bobble on it is visible from any angle at any distance, and it is
    // the cheapest possible fix for the one thing a child has to be able to
    // see at all times.
    const brim = new THREE.CylinderGeometry(1.26, 1.3, 0.42, 14);
    brim.rotateX(0.18);
    brim.translate(0, 1.9, 1.5);
    parts.push(paint(brim, PALETTE.snow));

    const hat = new THREE.SphereGeometry(1.2, 12, 8, 0, TAU, 0, Math.PI / 2);
    hat.scale(1, 0.95, 1);
    hat.rotateX(0.18);
    hat.translate(0, 2, 1.48);
    parts.push(paint(hat, PALETTE.hat));

    // Clear of the top of the dome. At 3.02 it was inside it: the hat's own
    // crown reaches 3.14, so the bobble was a pom-pom nobody could see.
    const bobble = new THREE.SphereGeometry(0.44, 10, 8);
    bobble.translate(0, 3.38, 1.24);
    parts.push(paint(bobble, PALETTE.snow));

    const tail = new THREE.ConeGeometry(0.7, 1.3, 6);
    tail.rotateX(-Math.PI / 2);
    tail.scale(1, 0.45, 1);
    tail.translate(0, -0.2, -2.7);
    parts.push(paint(tail, PALETTE.back));

    // The scarf's collar. Part of the merge — only the trailing end moves.
    const collar = new THREE.CylinderGeometry(1.28, 1.28, 0.62, 12);
    collar.rotateX(0.25);
    collar.translate(0, 0.72, 1.02);
    parts.push(paint(collar, PALETTE.scarf));

    const merged = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, vertexToon());
    mesh.castShadow = true;
    this.body.add(mesh);

    // The flippers, one pivot each so they swing from the shoulder rather than
    // from the middle of the bird.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.5, 0.1, 0.3);
      const blade = new THREE.SphereGeometry(1.05, 10, 8);
      blade.scale(0.28, 0.72, 1.15);
      blade.translate(side * 0.55, -0.5, -0.2);
      const flipper = new THREE.Mesh(paint(blade, PALETTE.back), vertexToon());
      flipper.castShadow = true;
      pivot.add(flipper);
      this.body.add(pivot);
      this.flippers.push(pivot);
    }

    // The loose end of the scarf: four links, each hanging off the last, so a
    // wave started at the collar runs all the way to the tip. Nested rather
    // than four siblings given four phases — siblings would shear apart the
    // moment the bird turned, and a scarf in three pieces is a hard thing to
    // stop looking at.
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < 4; i++) {
      const link = new THREE.Group();
      // Off the side of the collar, not over the back.
      //
      // Over the back is where it was, and the back is a curve: an ellipsoid
      // 3.1 high at the shoulder and 1.5 at the tail. A straight chain laid
      // along it at one height starts above the bird and finishes inside it.
      // Out here it is clear of the body at every point — the shoulder is
      // already past the widest part of the ellipsoid — whatever the tail
      // does behind it.
      link.position.set(
        i === 0 ? 1.45 : 0,
        i === 0 ? 1.2 : 0,
        i === 0 ? 0.15 : -1.05,
      );
      const cloth = new THREE.BoxGeometry(0.62, 0.18, 1.05);
      cloth.translate(0, 0, -0.55);
      const mesh = new THREE.Mesh(
        paint(cloth, i % 2 === 0 ? PALETTE.scarf : PALETTE.belly),
        vertexToon(),
      );
      mesh.castShadow = true;
      link.add(mesh);
      parent.add(link);
      parent = link;
      this.scarf.push(link);
    }
  }
}
