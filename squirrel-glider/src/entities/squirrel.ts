import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {GLIDE, SQUIRREL} from "../config";
import {paint, vertexToon} from "../render/materials";

const FUR = 0xb4703a;
const FUR_DARK = 0x8f5528;
const BELLY = 0xe8cfa8;
const EYE = 0x241a1a;
const NOSE = 0x3b2a24;

/**
 * The flying squirrel, and the glide.
 *
 * A wingsuit with fur on, as the plan asks, and flown as physics rather than
 * as a set of rules: the squirrel has a speed, a flight path angle and a
 * heading, and forces move all three. Nothing here scripts "diving is fast" —
 * it falls out, because a glider pointed down has gravity pulling along its
 * own direction of travel.
 *
 * Fixed-timestep like the rest of the repo, so it keeps a prevPosition and the
 * render interpolates between steps.
 */
export class Squirrel {
  readonly group = new THREE.Group();

  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();

  /** Which way it is pointed, radians about Y. Pi is down the valley. */
  heading = Math.PI;
  /** Climb angle of the *path*, radians. Negative is descending. */
  gamma = 0;
  speed = 0;

  /** Standing on the ledge, before the jump. */
  perched = true;
  /** Down: the flight is over and nothing steers any more. */
  landed = false;

  /** How hard the membrane is being asked to work. See GLIDE.clTrim. */
  private cl: number = GLIDE.clTrim;
  private bank = 0;
  private prevGamma = 0;
  private prevBank = 0;
  private prevCl: number = GLIDE.clTrim;
  /** The stick, lagged. The gap between it and the stick is the snap. */
  private stickLag = 0;
  private bob = 0;

  private readonly body: THREE.Group;
  private readonly limbs: Array<THREE.Group> = [];
  private readonly tail: THREE.Group;

  constructor() {
    this.body = new THREE.Group();
    this.group.add(this.body);

    const parts: Array<THREE.BufferGeometry> = [];

    // A flattened body, because a gliding squirrel is a flattened squirrel:
    // the whole animal spreads to make a wing of itself.
    const torso = new THREE.SphereGeometry(1, 12, 9);
    torso.scale(1.15, 0.62, 1.7);
    parts.push(paint(torso, FUR));

    const belly = new THREE.SphereGeometry(0.94, 12, 9);
    belly.scale(1.05, 0.5, 1.55);
    belly.translate(0, -0.18, 0);
    parts.push(paint(belly, BELLY));

    const head = new THREE.SphereGeometry(0.62, 12, 9);
    head.scale(1, 0.92, 1.05);
    head.translate(0, 0.16, 1.62);
    parts.push(paint(head, FUR));

    const snout = new THREE.SphereGeometry(0.3, 9, 7);
    snout.scale(1, 0.8, 1.2);
    snout.translate(0, 0.02, 2.08);
    parts.push(paint(snout, BELLY));

    const nose = new THREE.SphereGeometry(0.11, 7, 6);
    nose.translate(0, 0.06, 2.34);
    parts.push(paint(nose, NOSE));

    for (const side of [-1, 1]) {
      const ear = new THREE.SphereGeometry(0.22, 8, 6);
      ear.scale(0.6, 1.1, 0.5);
      ear.translate(side * 0.34, 0.62, 1.5);
      parts.push(paint(ear, FUR_DARK));

      const white = new THREE.SphereGeometry(0.19, 8, 7);
      white.translate(side * 0.33, 0.26, 2.02);
      parts.push(paint(white, 0xfdfdfd));

      const eye = new THREE.SphereGeometry(0.11, 7, 6);
      eye.translate(side * 0.36, 0.27, 2.16);
      parts.push(paint(eye, EYE));
    }

    const merged = mergeGeometries(parts);
    if (!merged) {
      throw new Error("could not merge the squirrel");
    }
    this.body.add(new THREE.Mesh(merged, vertexToon()));

    // The four limbs, each its own group so the spread can be animated: a
    // wingsuit tucks to go fast and spreads to go slow, and that is the
    // clearest read a player gets of what their own stick is doing.
    for (const side of [-1, 1]) {
      for (const front of [true, false]) {
        const limb = new THREE.Group();
        limb.position.set(side * 0.7, -0.1, front ? 0.9 : -0.95);
        limb.add(new THREE.Mesh(limbShape(side, front), vertexToon()));
        this.body.add(limb);
        this.limbs.push(limb);
      }
    }

    // The membrane: one sheet each side, front paw to back.
    for (const side of [-1, 1]) {
      this.body.add(new THREE.Mesh(membraneShape(side), membraneMaterial()));
    }

    // The tail, hinged at the back so it can steer.
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.06, -1.6);
    this.tail.add(new THREE.Mesh(tailShape(), vertexToon()));
    this.body.add(this.tail);

    this.group.scale.setScalar(SQUIRREL.scale);
  }

  /** Puts it on the ledge, facing down the valley, not yet flying. */
  place(at: THREE.Vector3): void {
    this.position.copy(at);
    this.prevPosition.copy(at);
    this.heading = Math.PI;
    this.gamma = 0;
    this.prevGamma = 0;
    this.speed = 0;
    this.cl = GLIDE.clTrim;
    this.prevCl = GLIDE.clTrim;
    this.stickLag = 0;
    this.bank = 0;
    this.prevBank = 0;
    this.perched = true;
    this.landed = false;
  }

  /** Off the edge. Forward and a little up, and then it is flying. */
  jump(): void {
    if (!this.perched) {
      return;
    }
    this.perched = false;
    this.speed = GLIDE.jumpSpeed;
    // Upward at first: a squirrel leaves a branch by pushing off it, and
    // starting the glide already pointing down takes the leap out of it.
    this.gamma = Math.atan2(GLIDE.jumpUp, GLIDE.jumpSpeed);
    this.prevGamma = this.gamma;
  }

  /** How fast it is falling, units a second. For the HUD and the landing. */
  get sinkRate(): number {
    return -this.speed * Math.sin(this.gamma);
  }

  /** The nose: the path, plus however far above it the animal is flying. */
  get pitch(): number {
    return this.gamma + this.angleOfAttack();
  }

  /**
   * One step of the glide.
   *
   * `dir.x` banks — left and right, as the plan asks, with the turn arriving
   * as a consequence rather than as its own control. `dir.y` is the stick's
   * own axis, positive when pulled back: back raises the nose and slows it
   * down, forward drops the nose and lets it run.
   *
   * The model is the standard three-degree-of-freedom glider:
   *
   *     dv     = -g sin(gamma) - drag
   *     dgamma = (lift cos(bank) - g cos(gamma)) / v
   *     dpsi   =  lift sin(bank) / (v cos(gamma))
   *
   * Everything the game feels — the speed a dive builds, the float of a
   * pull-up, turns that tighten as they slow — comes out of those three lines
   * rather than being written down anywhere.
   */
  update(dt: number, dir: THREE.Vector3): void {
    this.prevPosition.copy(this.position);
    this.prevGamma = this.gamma;
    this.prevBank = this.bank;
    this.prevCl = this.cl;
    if (this.landed || this.perched) {
      return;
    }

    // What the player is asking the membrane for. Pulling back asks for more
    // lift, which is also more drag: the trade is the whole game.
    const reach =
      dir.y > 0 ? GLIDE.clMax - GLIDE.clTrim : GLIDE.clTrim - GLIDE.clMin;
    const wantCl = THREE.MathUtils.clamp(
      GLIDE.clTrim + dir.y * reach,
      GLIDE.clMin,
      GLIDE.clMax,
    );
    this.cl += (wantCl - this.cl) * Math.min(1, GLIDE.clRate * dt);

    // The snap. See GLIDE.snap: this is what *moving* the stick is worth, as
    // against where it is being held. The lag chases the stick, and the gap
    // between them is how hard it was just moved — so it is large the instant
    // the stick goes over and gone half a second later, however long the stick
    // is held there.
    this.stickLag += (dir.y - this.stickLag) * Math.min(1, GLIDE.washRate * dt);
    const snap = (dir.y - this.stickLag) * GLIDE.snap;

    // How far it is leaning. The bank *is* the turn: a wing that is not level
    // puts part of its lift sideways, and that is what pulls it round.
    const wantBank = -dir.x * GLIDE.bankMax;
    const toBank = Math.abs(dir.x) > 0.02 ? GLIDE.bankRate : GLIDE.bankReturn;
    this.bank += (wantBank - this.bank) * Math.min(1, toBank * dt);

    // Below the stall the wing stops working. Not a cliff edge: lift falls
    // off, the nose drops on its own and the speed comes back — a stall a
    // child can fly out of without ever knowing what one is.
    const flying = this.speed / GLIDE.stallSpeed;
    const stalled = flying < 1 ? 1 - (1 - flying) * GLIDE.stallLoss : 1;

    const v = Math.max(this.speed, 0.5);

    // The most lift it will let itself make, as a limit on g rather than on
    // the coefficient. Lift goes with the square of the speed, so a full pull
    // that is a firm turn at forty is ten g at a hundred and five: the same
    // stick would snap the pull-out round in a couple of frames and read as
    // the game glitching rather than as the squirrel doing something. This
    // only ever bites in a fast dive.
    const lifting = GLIDE.liftPerV2 * v * v;
    const gCap = (GLIDE.nMax * GLIDE.gravity) / lifting;
    const gFloor = (-GLIDE.nMin * GLIDE.gravity) / lifting;

    // In a bank, the squirrel instinctively pulls.
    //
    // A wing that is leaning over puts only cos(bank) of its lift against
    // gravity, so a hard turn held flat is a spiral dive — measured, twenty
    // seconds of full left put it in the ground 35 units from where it
    // started. A pilot answers that by pulling back through the turn, and so
    // does an animal that has been doing this all its life. Without it the
    // honest physics makes the left half of the stick a way to die.
    const held = Math.max(
      Math.max(GLIDE.clFloor, gFloor),
      Math.min(
        GLIDE.clMax,
        gCap,
        (this.cl + snap) / Math.max(GLIDE.bankHold, Math.cos(this.bank)),
      ),
    );
    const lift = lifting * held * stalled;
    const drag = (GLIDE.dragPerV2 + GLIDE.inducedDrag * held * held) * v * v;

    const g = GLIDE.gravity;
    this.speed += (-g * Math.sin(this.gamma) - drag) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, 0.5, GLIDE.maxSpeed);

    // Nothing here but the aerodynamics. The quickness the game needed comes
    // from the snap above, which arrives as lift and is charged for as lift —
    // a pitch rate bolted on here instead was free height, and it broke the
    // whole economy of the glide. See GLIDE.snap.
    this.gamma +=
      ((lift * Math.cos(this.bank) - g * Math.cos(this.gamma)) / v) * dt;
    this.gamma = THREE.MathUtils.clamp(this.gamma, -1.45, 1);

    const level = Math.max(0.2, Math.cos(this.gamma));
    this.heading += ((lift * Math.sin(this.bank)) / (v * level)) * dt;

    const along = this.speed * Math.cos(this.gamma) * dt;
    this.position.x += Math.sin(this.heading) * along;
    this.position.z += Math.cos(this.heading) * along;
    this.position.y += this.speed * Math.sin(this.gamma) * dt;

    this.bob += dt * SQUIRREL.bobRate;
  }

  /**
   * How far the animal's nose sits above the path it travels along.
   *
   * Read back out of the lift it is making, which is what an angle of attack
   * is. It only drives the look of the thing — the physics above works in lift
   * coefficients — but without it a diving squirrel would be drawn flat to its
   * own descent, which is not what a wing does.
   */
  private angleOfAttack(): number {
    return (this.cl / GLIDE.clMax) * 0.42;
  }

  /** `alpha` is how far between the last two simulation steps we are. */
  render(alpha: number): void {
    this.group.position.lerpVectors(this.prevPosition, this.position, alpha);
    const gamma = THREE.MathUtils.lerp(this.prevGamma, this.gamma, alpha);
    const bank = THREE.MathUtils.lerp(this.prevBank, this.bank, alpha);
    const cl = THREE.MathUtils.lerp(this.prevCl, this.cl, alpha);
    const pitch = gamma + (cl / GLIDE.clMax) * 0.42;

    // YXZ so the yaw goes on first and the pitch is about the squirrel's own
    // axis, not the world's — otherwise a banked turn also pitches it.
    this.group.rotation.order = "YXZ";
    this.group.rotation.y = this.heading;
    this.group.rotation.x = pitch;
    // Negated, and only here.
    //
    // The physics needs the bank signed the way it is: the turn comes out of
    // lift x sin(bank), and flipping it there would turn the stick round with
    // it. What was wrong was only the picture — the squirrel leaned out of its
    // turns instead of into them — so the roll is flipped where it is drawn
    // and nowhere else.
    this.group.rotation.z = -bank;

    this.body.position.y = Math.sin(this.bob) * SQUIRREL.bobAmount;

    // The limbs tuck as the membrane is asked for less: that is the player's
    // own dive, shown on the animal. Tucked it is a dart; spread, a kite.
    const tucked = 1 - (cl - GLIDE.clMin) / (GLIDE.clMax - GLIDE.clMin);
    const spread = SQUIRREL.spread - tucked * SQUIRREL.tuck;
    for (const limb of this.limbs) {
      limb.scale.setScalar(spread);
    }

    // The tail steers with the turn and trims with the nose.
    this.tail.rotation.y = bank * SQUIRREL.tailSwing;
    this.tail.rotation.x = -pitch * 0.3;
  }
}

/** One limb: a stubby leg with a paw, pointing out from the body. */
function limbShape(side: number, front: boolean): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const len = front ? 0.85 : 0.95;

  const leg = new THREE.CylinderGeometry(0.16, 0.13, len, 6);
  leg.rotateZ(Math.PI / 2);
  leg.translate((side * len) / 2, 0, 0);
  parts.push(paint(leg, FUR));

  const paw = new THREE.SphereGeometry(0.19, 7, 6);
  paw.scale(1, 0.7, 1.2);
  paw.translate(side * len, 0, 0);
  parts.push(paint(paw, FUR_DARK));

  const merged = mergeGeometries(parts);
  if (!merged) {
    throw new Error("could not merge a limb");
  }
  return merged;
}

/**
 * The membrane, one side: the sheet of skin between front and back limbs that
 * makes the whole animal a wing.
 */
function membraneShape(side: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.6, 1.05);
  s.quadraticCurveTo(1.5, 0.4, 1.55, -0.2);
  s.quadraticCurveTo(1.4, -0.9, 0.62, -1.1);
  s.lineTo(0.6, 1.05);

  const geo = new THREE.ShapeGeometry(s, 8);
  // Laid flat: the shape is drawn in x, out from the body, and y along it.
  geo.rotateX(Math.PI / 2);
  if (side < 0) {
    geo.scale(-1, 1, 1);
  }
  geo.translate(0, -0.12, 0);
  return paint(geo, FUR);
}

/**
 * Double-sided, and it matters twice over: a membrane is a flat sheet, so from
 * underneath — where the whole valley is — a front-facing one is not there at
 * all, and the left one is the right one mirrored, which reverses its winding.
 */
function membraneMaterial(): THREE.Material {
  const material = vertexToon();
  material.side = THREE.DoubleSide;
  return material;
}

/** The tail: long, flat and bushy, hinged at the body. */
function tailShape(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const puff = new THREE.SphereGeometry(0.34 + t * 0.16, 8, 6);
    puff.scale(1, 0.55, 1);
    puff.translate(0, t * 0.18, -0.3 - i * 0.46);
    parts.push(paint(puff, i % 2 === 0 ? FUR : FUR_DARK));
  }
  const merged = mergeGeometries(parts);
  if (!merged) {
    throw new Error("could not merge the tail");
  }
  return merged;
}
