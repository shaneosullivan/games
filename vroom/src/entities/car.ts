import * as THREE from "three";
import {CAR, CarDesign, ITEM, Sticker, TRAIL} from "../config";
import {flatVertex, LAYER, order, tile} from "../render/sprites";
import {car as carModel} from "../models/car";
import {Patches} from "./patches";
import type {ItemKind} from "../track/spec";
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

  /** How high off the ground, and how fast that is changing. A real arc now:
   *  the ramp throws the car up and gravity brings it back. */
  height = 0;
  private climb = 0;
  /** Which way up it is. Roll comes from a lopsided take-off and pitch from
   *  the lip of the ramp; both unwind once it is back on the ground. */
  roll = 0;
  pitch = 0;
  private rollRate = 0;
  /** Nose-over-tail, for a take-off with all four wheels on the ramp. */
  private pitchRate = 0;
  /** Whether it has already taken off from the ramp it is currently on, so a
   *  long ramp cannot launch the same car twice. */
  private launched = false;
  /** Whether the roll has been settled for the ramp being climbed. */
  private decided = false;
  /** Which front wheels were on the ramp last frame, so a car that brushes the
   *  very edge and never draws level with the middle still gets a jump. */
  private readonly lastFront = [false, false];
  /** On the slope of a ramp — on the ground, but above it. Not the same as
   *  airborne, and telling them apart is what lets a car keep its grip while
   *  it climbs. */
  private onSlope = false;
  /** What the roll will be when it leaves the lip, decided at the middle. */
  private pendingLean = 0;
  /** How long is left of the jolt as the nose comes down. */
  private landing = 0;

  /**
   * What each wheel is still carrying out of a patch, and for how long.
   *
   * Per wheel, because that is the point: clip a slick with the left-hand
   * wheels and one line of oil comes up the road, not two.
   */
  readonly carrying: Array<ItemKind | null> = [null, null, null, null];
  readonly carriedFor = [0, 0, 0, 0];

  /** How long the ramp's extra speed lingers. The ceiling is lifted while this
   *  runs and eased back as it empties. */
  private boost = 0;

  private readonly dir = new THREE.Vector2();
  private readonly side = new THREE.Vector2();
  private readonly sprite: THREE.Object3D;
  private readonly wheelAt = [
    new THREE.Vector2(),
    new THREE.Vector2(),
    new THREE.Vector2(),
    new THREE.Vector2(),
  ];
  private readonly shadow: THREE.Mesh;

  constructor(
    colour: number,
    design: CarDesign = "plain",
    stickers: ReadonlyArray<Sticker> = [],
  ) {
    this.sprite = carModel(colour, design, stickers);
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

  /**
   * Leaving the ramp.
   *
   * Whether it rolls is decided by the two front wheels at the moment the
   * front axle draws level with the middle of the ramp. Deciding it on first
   * contact was wrong — that is the frame the front wheels arrive, when a car
   * even slightly out of square has one down and the other not, so nearly
   * every jump came out as a half roll — and deciding it at the far lip was
   * wrong the other way, because by then the car had left the ramp behind.
   * The middle is where a ramp throws you, and the back wheels have nothing to
   * add: they go wherever the front ones went.
   */
  private launch(lean: number): void {
    const push = Math.min(1, this.speed / CAR.top);
    this.onSlope = false;
    this.air = ITEM.ramp.airtime;
    this.boost = ITEM.ramp.carry;
    // Straight onto the velocity, before it is split into along and across:
    // the shove is in the direction the car was actually travelling, which on
    // a ramp taken sideways is not where the nose is pointing.
    this.velocity.multiplyScalar(ITEM.ramp.boost);
    this.climb = ITEM.ramp.launch * push;

    this.rollRate = lean * ITEM.ramp.roll * push;
    // Over the front, always: square onto the boards it goes head first, and
    // caught down one side it rolls and still comes down nose first.
    const over = lean === 0 ? 1 : ITEM.ramp.diveRolling;
    this.pitchRate = -ITEM.ramp.dive * push * over;
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
    this.boost = 0;
    this.height = 0;
    this.climb = 0;
    this.roll = 0;
    this.pitch = 0;
    this.rollRate = 0;
    this.pitchRate = 0;
    this.landing = 0;
    this.launched = false;
    this.decided = false;
    this.onSlope = false;
    this.pendingLean = 0;
    this.lastFront[0] = false;
    this.lastFront[1] = false;
    this.carrying.fill(null);
    this.carriedFor.fill(0);
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

    // What is under each wheel. Four samples rather than one, because a car is
    // not a point: half on a slick and half on dry tarmac is the interesting
    // case, and it was not expressible before.
    this.corners(this.wheelAt);
    let leftGrip = 0;
    let rightGrip = 0;
    let slowest = 1;
    const frontOn = [false, false];
    for (let i = 0; i < 4; i++) {
      const w = this.wheelAt[i];
      const under = patches ? patches.at(w.x, w.y) : null;
      // One side of the car and the other. Which is which does not matter —
      // the model is symmetric — only that they are told apart.
      const nearSide = i % 2 === 0;

      // A wheel goes on carrying what it drove through for a while afterwards.
      if (under === "oil" || under === "mud") {
        this.carrying[i] = under;
        this.carriedFor[i] = TRAIL.carries;
      } else if (this.carriedFor[i] > 0) {
        this.carriedFor[i] = Math.max(0, this.carriedFor[i] - dt);
        if (this.carriedFor[i] === 0) {
          this.carrying[i] = null;
        }
      }

      let grip = 1;
      if (under === "oil") {
        grip = ITEM.oil.grip;
      } else if (under === "mud") {
        slowest = Math.min(slowest, ITEM.mud.top);
      }
      if (under === "ramp" && i < 2) {
        // Front wheels only. The back two follow wherever the front two went,
        // so they have nothing to add — and waiting for them is what made the
        // car take off long after it had left the ramp.
        frontOn[i] = true;
      }
      if (nearSide) {
        leftGrip += grip / 2;
      } else {
        rightGrip += grip / 2;
      }
    }

    if (this.air > 0) {
      this.air = Math.max(0, this.air - dt);
    } else if (frontOn[0] || frontOn[1]) {
      // Riding the wedge. The ramp is solid, so the car goes up it rather than
      // across a picture of it.
      // Level with the middle of the ramp, not off the far end of it.
      //
      // Waiting for the car to run out of ramp meant it took off well past the
      // thing that launched it. The middle is where a ramp actually throws you
      // and it is where the decision is made: whichever front wheels are on it
      // at that moment decide whether this is a jump or a roll.
      const which = patches
        ? patches.rampAt(
            (this.wheelAt[0].x + this.wheelAt[1].x) / 2,
            (this.wheelAt[0].y + this.wheelAt[1].y) / 2,
          )
        : -1;
      if (which >= 0 && !this.launched) {
        // How far along the ramp's *own* axis the car is, from the foot of the
        // slope to the lip.
        const yaw = patches!.yawOf(which);
        const ux = Math.sin(yaw);
        const uz = Math.cos(yaw);
        const dx = this.position.x - patches!.centreX(which);
        const dz = this.position.z - patches!.centreZ(which);
        const up = dx * ux + dz * uz;
        const half = ITEM.ramp.long / 2;
        const climbed = Math.max(0, Math.min(1, (up + half) / ITEM.ramp.long));

        // Whether it will roll is settled halfway up, on the front wheels —
        // by the lip the car is committed and both of them are on the boards
        // whatever line it took.
        const ax = (this.wheelAt[0].x + this.wheelAt[1].x) / 2;
        const az = (this.wheelAt[0].y + this.wheelAt[1].y) / 2;
        const axle =
          (ax - patches!.centreX(which)) * this.dir.x +
          (az - patches!.centreZ(which)) * this.dir.y;
        if (axle >= 0 && !this.decided) {
          this.decided = true;
          this.pendingLean =
            frontOn[0] === frontOn[1] ? 0 : frontOn[0] ? 1 : -1;
        }

        // Sitting on the surface: up the slope, nose up with it.
        this.onSlope = true;
        this.height = climbed * ITEM.ramp.rise;
        const slope = Math.atan2(ITEM.ramp.rise, ITEM.ramp.long);
        this.pitch = slope;
        // Climbing costs something, the way a hill does. A flat number of
        // units a second off the speed, not a fraction of it: a fraction is
        // enormous when the speed is small, and a car that crept onto the
        // wedge had every scrap of speed taken away every frame and sat there
        // at full throttle, stuck halfway up, for the rest of the race.
        const slowed = Math.max(0, this.speed - ITEM.ramp.drag * dt);
        if (this.speed > 0) {
          this.velocity.multiplyScalar(slowed / this.speed);
        }

        if (up >= half && this.speed >= ITEM.ramp.minSpeed) {
          this.launched = true;
          this.launch(this.pendingLean);
        }
      }
      this.lastFront[0] = frontOn[0];
      this.lastFront[1] = frontOn[1];
    } else {
      // Off the ramp. A car that brushed the very edge can leave without ever
      // drawing level with the middle — it still went over something, so it
      // still gets thrown, on whatever it was touching last.
      if (
        (this.lastFront[0] || this.lastFront[1]) &&
        !this.launched &&
        this.speed >= ITEM.ramp.minSpeed
      ) {
        const lean = this.decided
          ? this.pendingLean
          : this.lastFront[0] === this.lastFront[1]
            ? 0
            : this.lastFront[0]
              ? 1
              : -1;
        this.launch(lean);
      }
      this.lastFront[0] = false;
      this.lastFront[1] = false;
      this.launched = false;
      this.decided = false;
      this.onSlope = false;
    }
    this.boost = Math.max(0, this.boost - dt);
    // On the slope the car is *on the ground*, however high off it that is.
    // Without telling the two apart, a car climbing a ramp lost its grip and
    // its steering halfway up one.
    const flying = this.air > 0 || (this.height > 0 && !this.onSlope);

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
    if (!flying) {
      // Grip is the average of what the four wheels have; the top speed is set
      // by the worst of them, because one wheel in mud holds a whole car back.
      grip *= (leftGrip + rightGrip) / 2;
      top *= slowest;
      if (slowest < 1) {
        along -=
          Math.sign(along) * Math.min(Math.abs(along), ITEM.mud.drag * dt);
      }

      // And the part that makes a patch worth avoiding rather than merely
      // slow: if one side has grip and the other does not, the car turns
      // towards the side that still bites. Two wheels on oil is not "a bit
      // less grip", it is a spin — which is why clipping the edge of a slick
      // is worse than driving over the middle of it.
      const split = rightGrip - leftGrip;
      if (Math.abs(split) > 0.01) {
        this.heading +=
          split * CAR.spinFromSplit * Math.min(1, this.speed / CAR.top) * dt;
      }
    }
    if (flying) {
      // In the air the velocity is simply carried: no grip to pull it round,
      // and no surface to take it away.
      grip = 0;
    }
    across *= Math.exp(-grip * dt);

    // The ceiling, lifted by whatever is left of a ramp's boost and easing
    // back to the ordinary top speed as that runs out.
    const ceiling =
      top * (1 + (ITEM.ramp.boost - 1) * (this.boost / ITEM.ramp.carry));
    along = Math.max(-ceiling * 0.35, Math.min(ceiling, along));

    this.velocity.set(
      this.dir.x * along + this.side.x * across,
      this.dir.y * along + this.side.y * across,
    );
    // No rubber in mid-air, which is both true and the only thing stopping a
    // jump from painting a stripe across the grass it flew over.
    this.slip = flying ? 0 : Math.abs(across);

    // The arc. Gravity does this now rather than a timer, so a fast take-off
    // really does go further and land later than a slow one.
    if (this.onSlope) {
      // Held to the surface above; nothing to integrate.
    } else if (this.air > 0 || this.height > 0) {
      this.height += this.climb * dt;
      this.climb -= ITEM.ramp.gravity * dt;
      this.roll += this.rollRate * dt;
      if (this.pitchRate !== 0) {
        // Going over the front. Held once it is far enough round, so the car
        // hangs nose-down for the rest of the drop instead of spinning.
        this.pitch = Math.max(
          -ITEM.ramp.diveMost,
          this.pitch + this.pitchRate * dt,
        );
      } else {
        // The nose follows the climb: up while it is going up, down while it
        // is coming down. No timer, and the shape of a jump comes out free.
        this.pitch = ITEM.ramp.pitch * (this.climb / ITEM.ramp.launch);
      }
      if (this.height <= 0) {
        this.height = 0;
        this.climb = 0;
        this.air = 0;
        this.rollRate = 0;
        this.pitchRate = 0;
        // The bumper. It comes down on its nose, loses a little, and settles
        // back onto four wheels — which is the difference between landing a
        // jump and teleporting to the far side of one.
        this.landing = ITEM.ramp.landFor;
        this.pitch = -ITEM.ramp.landDip;
        this.velocity.multiplyScalar(ITEM.ramp.landKeep);
      }
    } else if (this.roll !== 0 || this.pitch !== 0) {
      this.landing = Math.max(0, this.landing - dt);
      // Back on the ground it rights itself — towards whichever whole turn it
      // is nearest, so a car that went all the way over lands the right way up
      // rather than winding a full revolution backwards.
      const settle = 1 - Math.exp(-CAR.rightsItself * dt);
      this.roll += (Math.round(this.roll / TAU) * TAU - this.roll) * settle;
      this.pitch -= this.pitch * settle;
      // Once it is upright, say so exactly. A car that has been over three
      // times is upright at 1080 degrees, and leaving it there would have the
      // number climbing for the whole race.
      if (Math.abs(this.roll - Math.round(this.roll / TAU) * TAU) < 0.01) {
        this.roll = 0;
      }
    }

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

  /**
   * Lifts the car above the flyover decks, or drops it back under them.
   *
   * A deck is drawn over every car, because a car on the road underneath a
   * bridge should not show through it. The car actually driving over the
   * bridge is the exception, and this is it.
   */
  setAbove(above: boolean): void {
    const lift = above ? 20 : 0;
    this.sprite.renderOrder = order(LAYER.car) + lift;
    this.shadow.renderOrder = order(LAYER.shadow) + lift;
  }

  /**
   * Where all four wheels are, in the order front-left, front-right,
   * rear-left, rear-right.
   *
   * The whole of the per-wheel physics reads off this. A car is not a point:
   * clipping the edge of an oil slick puts two wheels on it and two on dry
   * tarmac, and those are completely different things to be doing.
   */
  corners(out: Array<THREE.Vector2>): void {
    let k = 0;
    for (const along of [CAR.length * 0.33, -CAR.length * 0.31]) {
      for (const side of [-1, 1]) {
        out[k++].set(
          this.position.x +
            this.dir.x * along +
            this.side.x * side * HALF_TRACK,
          this.position.z +
            this.dir.y * along +
            this.side.y * side * HALF_TRACK,
        );
      }
    }
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

    // The jump, drawn — and it is drawn by actually being off the ground now
    // rather than by growing. A perspective camera does the rest: a car that
    // is genuinely eight units up looks eight units up.
    this.group.position.y = LAYER.car + this.height;
    this.sprite.rotation.set(this.pitch, 0, this.roll);
    // The shadow stays on the ground and shrinks with height, which is most of
    // what says how far up the car is.
    this.shadow.visible = this.height > 0.2;
    this.shadow.position.y = LAYER.shadow - LAYER.car - this.height;
    const shrink = 1 / (1 + this.height * 0.03);
    this.shadow.scale.set(shrink, 1, shrink);
  }
}

const tmp3 = new THREE.Vector3();

/** Half the track width of the car — how far a wheel sits from its middle. */
const HALF_TRACK = CAR.width * 0.56;
