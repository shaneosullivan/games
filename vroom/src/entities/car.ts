import * as THREE from "three";
import {
  CAR,
  CarDesign,
  CarShape,
  DriverKit,
  ITEM,
  LIGHT,
  PHYSICS,
  SHADOW,
  SIM,
  Sticker,
  SURFACE,
  TRAIL,
} from "../config";
import {LAYER, order, tile} from "../render/sprites";
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
 *
 * Neither of them reverses. Holding the brake at a standstill is standing
 * still; the one thing that goes backwards is a rival backing out of a wall,
 * which asks for it by name.
 */
export type Drive =
  | {kind: "aim"; aim: THREE.Vector2}
  | {kind: "wheel"; steer: number; throttle: number; reverse?: boolean};

export function shortestAngle(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

function clamp(v: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, v));
}

/**
 * The friction circle: a tyre's grip spent in any direction at all.
 *
 * An axle has one budget — what the weight on it and the surface under it will
 * hold — and it does not get a separate one for turning and for driving. Ask
 * for more than the budget in total and both are scaled back together, which
 * is why a car cannot brake and turn at full strength at once, and why full
 * throttle out of a corner lets the back end go.
 */
function circle(fx: number, fy: number, limit: number): [number, number] {
  const asked = Math.hypot(fx, fy);
  if (asked <= limit || asked < 1e-6) {
    return [fx, fy];
  }
  const share = limit / asked;
  return [fx * share, fy * share];
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
  /** Radians a second the car is turning, and where the front wheels point.
   *  Both are state now: a car has angular momentum and a steering rack, and
   *  neither of them is instant. */
  yawRate = 0;
  steer = 0;
  /** Last step's forward acceleration, in m/s², which is what moves the weight
   *  fore and aft. */
  private lastPush = 0;
  /** The lateral force each axle is actually making, which lags what the slip
   *  angle asks for; see `PHYSICS.relax`. */
  private fyFront = 0;
  private fyRear = 0;
  private prevHeading = 0;
  /** Which way a U-turn is going round, once it has started: 1, -1, or 0 for
   *  not in one. Held, because with the stick straight behind the car the
   *  shorter way round flips from one side to the other with every wobble of
   *  a thumb, and the wheels would saw between the two locks. */
  private uTurn = 0;

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
   * throttle, no steering. A jump is committed to.
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
  /** What it is painted, kept because the minimap draws a dot per car and the
   *  dot has to be the colour of the car it stands for — whoever built it. */
  readonly paint: number;

  constructor(
    colour: number,
    design: CarDesign = "plain",
    stickers: ReadonlyArray<Sticker> = [],
    kit?: DriverKit,
    shape: CarShape = "racer",
  ) {
    this.paint = colour;
    this.sprite = carModel(colour, design, stickers, kit, shape);
    // Only ever seen in mid-air; on the ground the sun casts a real one. Its
    // own material rather than the shared flat one, because it fades with
    // height and the shared materials are cached — turning this one down would
    // turn down everything else drawn with it.
    this.shadow = new THREE.Mesh(
      tile(CAR.width * 1.05, CAR.length * 1.05, 0x000000),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: SHADOW.dark,
        // Flat on the ground and stacked by draw order, like every other decal
        // in the game — see `material`.
        depthWrite: false,
      }),
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
    this.onSlope = false;
    this.yawRate = 0;

    // The launch is arithmetic, not a number: a car leaving a slope of angle
    // θ at speed v leaves with v·sinθ going up and v·cosθ going on. Nothing
    // is added and nothing is scaled — how far it flies is decided by how fast
    // it arrived, exactly as it is on a real ramp, and the airtime is however
    // long gravity takes to bring that back down.
    // The wedge rises `rise` over its whole length, so that — and not half of
    // it — is the angle the car leaves at.
    const slope = Math.atan2(ITEM.ramp.rise, ITEM.ramp.long);
    const speed = this.speed;
    this.climb = speed * Math.sin(slope);
    if (speed > 1e-4) {
      this.velocity.multiplyScalar(Math.cos(slope));
    }
    this.air = (2 * this.climb) / (PHYSICS.gravity * PHYSICS.scale);

    // The one thing that is not physics: a car caught down one side of the
    // ramp is thrown into a roll. Two wheels lifted before the other two is a
    // real moment about a real axis, and modelling it properly would need a
    // suspension and a roll centre; this is that moment, as a rate.
    this.rollRate = lean * ITEM.ramp.roll * Math.min(1, this.speed / CAR.top);
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
    this.yawRate = 0;
    this.steer = 0;
    this.lastPush = 0;
    this.fyFront = 0;
    this.fyRear = 0;
    this.uTurn = 0;
    this.slip = 0;
    this.hint = hint;
    this.lap = lap;
    this.air = 0;
    this.height = 0;
    this.climb = 0;
    this.roll = 0;
    this.pitch = 0;
    this.rollRate = 0;
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
    // What each wheel is standing on, as physics: how much of dry-tarmac grip
    // it has, and how hard it is to roll through. Per axle, because the front
    // and the rear can be on different things and that is the interesting
    // case — and because the two axles are what the model is built from.
    const off = !tarmac ? SURFACE.grass : SURFACE.tarmac;
    let gripFront = 0;
    let gripRear = 0;
    let rollMult: number = off.roll;
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

      const on =
        under === "oil"
          ? SURFACE.oil
          : under === "mud"
            ? SURFACE.mud
            : under === "ramp"
              ? SURFACE.tarmac
              : off;
      // A tyre still laying a line of oil has oil on it, and oil on a tyre is
      // oil between the tyre and the road. It wears off as the trail does.
      const oily =
        under === null && this.carrying[i] === "oil"
          ? (1 - SURFACE.oilyTyre) * (this.carriedFor[i] / TRAIL.carries)
          : 0;
      const grip = on.grip * (1 - oily);
      if (i < 2) {
        gripFront += grip / 2;
      } else {
        gripRear += grip / 2;
      }
      rollMult = Math.max(rollMult, on.roll);
      if (under === "ramp" && i < 2) {
        // Front wheels only. The back two follow wherever the front two went,
        // so they have nothing to add — and waiting for them is what made the
        // car take off long after it had left the ramp.
        frontOn[i] = true;
      }
      void nearSide;
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
        // Climbing costs what climbing costs: gravity down the slope. A car
        // that arrives slowly does not get up, which is correct, and one that
        // arrives quickly barely notices — both of which used to be a single
        // fixed number of units a second.
        const pull =
          PHYSICS.gravity * PHYSICS.scale * Math.sin(this.pitch) * dt;
        const slowed = Math.max(0, this.speed - pull);
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
    // On the slope the car is *on the ground*, however high off it that is.
    // Without telling the two apart, a car climbing a ramp lost its grip and
    // its steering halfway up one.
    const flying = this.air > 0 || (this.height > 0 && !this.onSlope);

    // ---- what the driver is asking for -------------------------------------
    //
    // Two numbers out of either control: where the front wheels should point,
    // and what the pedals are doing. Everything after this is the same for a
    // thumb and for a keyboard, which is the point of turning both into a
    // steering angle rather than into a rate of turn.
    const s = PHYSICS.scale;
    const speed = this.velocity.length() / s;
    const fast = Math.min(1, speed / (CAR.top / s));
    const lock = PHYSICS.steerMax * (1 - fast * (1 - PHYSICS.steerAtSpeed));

    this.dir.set(Math.sin(this.heading), Math.cos(this.heading));
    this.side.set(this.dir.y, -this.dir.x);
    // Body axes, in metres a second: along the nose, and out of the door.
    let vx = this.velocity.dot(this.dir) / s;
    let vy = this.velocity.dot(this.side) / s;

    // Which way the car is actually travelling, against where it points: the
    // angle of the slide. Faded in from a crawl, where a car barely moving has
    // a direction of travel that means nothing.
    const drifting =
      Math.atan2(vy, Math.max(Math.abs(vx), 0.5)) *
      Math.min(1, speed / PHYSICS.crawl);

    let wantSteer = 0;
    let throttle = 0;
    let braking = 0;
    // How much lock this step may use, either side of straight along the
    // slide. See PHYSICS.steerAtSpeed and PHYSICS.driftLock.
    let reach = lock;
    if (drive.kind === "wheel") {
      wantSteer = drive.steer * lock;
      throttle = Math.max(0, drive.throttle);
      braking = Math.max(0, -drive.throttle);
      this.uTurn = 0;
    } else {
      const push = Math.min(1, drive.aim.length());
      if (push > 1e-4) {
        const target = Math.atan2(drive.aim.x, drive.aim.y);
        // Steered for where the nose is about to be, not where it is. A car
        // swinging round at two radians a second will go on swinging for a
        // moment after the wheels straighten, and steering until the nose
        // is on target is steering until it is past it: the swing overshot,
        // the back came round the other way, and the next correction made it
        // worse. A driver unwinds the lock before they get there.
        const diff = shortestAngle(
          this.heading + this.yawRate * PHYSICS.anticipate,
          target,
        );
        // Behind the car is a U-turn, driven forwards. Pulling back used to
        // be the brake, which stopped the car and then drove it backwards the
        // way the stick pointed — and a car going backwards is not what a
        // child pointing the other way wants. They want it turned round.
        if (Math.abs(diff) > PHYSICS.uTurn) {
          if (this.uTurn === 0 || Math.abs(diff) < Math.PI - 0.4) {
            this.uTurn = Math.sign(diff) || 1;
          }
          wantSteer = this.uTurn * PHYSICS.steerMax;
          // Off the throttle and on the brakes until it is slow enough to go
          // round, then round on the throttle. Nobody takes a hairpin flat.
          const over = speed - PHYSICS.uTurnSpeed;
          throttle = over > 0 ? 0 : push * PHYSICS.uTurnThrottle;
          braking = over > 0 ? push * Math.min(1, over / 6) : 0;
        } else {
          this.uTurn = 0;
          // More lock than the angle left to turn, so the last of a turn is
          // steered into rather than crept up on.
          wantSteer = diff * PHYSICS.steerGain;
          // Off the throttle in proportion to how far round the stick is:
          // a sharp corner is taken by lifting, the way anybody drives one.
          // Flat out, the car gained speed all the way round the bend, the
          // weight it threw on the back wheels took grip off the front ones,
          // and a right-angle turn at walking pace swung thirty metres wide.
          //
          // Measured against the way the car is actually travelling, not the
          // way its nose is about to point: steering for the nose, the turn
          // looked finished the moment the nose began to swing, the brakes
          // came off, and the car ran wide on the throttle.
          const path =
            speed > 1
              ? Math.atan2(this.velocity.x, this.velocity.y)
              : this.heading;
          const sharp = clamp(
            (Math.abs(shortestAngle(path, target)) - PHYSICS.turnFrom) /
              (PHYSICS.turnFull - PHYSICS.turnFrom),
            0,
            1,
          );
          // Not at a crawl, though, or a car pulling away with the stick to one
          // side would sit there.
          const moving = Math.min(1, speed / PHYSICS.turnLiftFrom);
          throttle = push * (1 - sharp * moving * PHYSICS.turnLift);
          // And on the brakes, if it is going too fast to turn that sharply at
          // all. A tyre can only pull a car round so hard — at sixteen metres
          // a second the tightest circle this one can hold is four car lengths
          // across — so the only way to turn sharply is slowly, and asking for
          // a sharp turn is asking to slow down for it.
          const corner =
            PHYSICS.uTurnSpeed +
            (CAR.top / s - PHYSICS.uTurnSpeed) * (1 - sharp) ** 2;
          const over = speed - corner;
          if (over > 1) {
            throttle = 0;
            braking = push * Math.min(1, over / 8) * PHYSICS.turnBrake;
          }
        }
        // Yanking the stick well round at speed gets more lock than the rack
        // would otherwise allow, which is how a drift is started: more angle
        // than the tyres can hold, so the back steps out. A gentle push gets
        // the rack as it is and simply goes round.
        //
        // Only until the car is sliding, though. Once the back is out as far
        // as a drift should go, the extra lock is taken away again and the
        // wheels are left to follow the slide — or a second yank the other
        // way, mid-drift, winds a slide that is already big into a spin.
        const held = clamp(
          (PHYSICS.driftMost - Math.abs(drifting)) /
            (PHYSICS.driftMost - PHYSICS.driftEnough),
          0,
          1,
        );
        // And less of it where there is less grip to catch it with. On oil
        // that is almost none, which is fine: oil is supposed to be trouble.
        const yank =
          held *
          Math.min(1, gripRear) *
          clamp(
            (Math.abs(diff) - PHYSICS.driftFrom) /
              (PHYSICS.driftFull - PHYSICS.driftFrom),
            0,
            1,
          );
        reach = lock + (PHYSICS.steerMax - lock) * PHYSICS.driftLock * yank;
      } else {
        this.uTurn = 0;
      }
    }
    // The lock is measured from the direction of travel, not from the nose.
    // A car that is sliding needs its front wheels pointed down the slide to
    // catch it — which is what opposite lock is — and a rack that only turns a
    // few degrees either side of the nose cannot get them there: the slide
    // got bigger than the lock, and the car went round with its wheels turned
    // as far as they would go the wrong way. Every spin that was reported
    // started like that, usually on the grass.
    const low = Math.max(-PHYSICS.steerMax, drifting - reach);
    const high = Math.min(PHYSICS.steerMax, drifting + reach);
    wantSteer = clamp(wantSteer, low, high);
    // The rack takes time to turn, which is most of why a car feels like it
    // has weight. Instant lock is a mouse pointer.
    // In the air the wheels stay where they were: nothing touches the road,
    // and a wheel wound round up there would snap the car round the moment it
    // landed.
    if (!flying) {
      const swing = PHYSICS.steerRate * dt;
      this.steer += Math.max(-swing, Math.min(swing, wantSteer - this.steer));
      this.steer = clamp(this.steer, low, high);
    }

    // ---- the tyres ---------------------------------------------------------

    const b = PHYSICS.toFront;
    const c = PHYSICS.toRear;
    const L = b + c;
    const M = PHYSICS.mass;
    const g = PHYSICS.gravity;

    if (flying) {
      // Nothing to push against up here. Only drag, which is why a jump lands
      // at very nearly the speed it left at.
      const air = Math.exp((-PHYSICS.drag / M) * Math.abs(vx) * dt);
      vx *= air;
      vy *= air;
      // And no turning. Whatever the car was doing when it left the ramp, it
      // flies straight and lands pointing where it took off: a car that went
      // on swinging round in mid-air looked, to anybody holding the stick, as
      // though it was being steered up there.
      this.yawRate = 0;
    } else {
      // Weight on each axle: the static split, plus what the last step's
      // acceleration threw forward or back. This is why braking gives the
      // front tyres more to work with and lifting mid-corner unsettles a car.
      const shift = (PHYSICS.cgHeight / L) * M * this.lastPush;
      const loadFront = Math.max(0, (c / L) * M * g - shift);
      const loadRear = Math.max(0, (b / L) * M * g + shift);
      const muFront = PHYSICS.grip * gripFront;
      const muRear = PHYSICS.grip * PHYSICS.rearGrip * gripRear;

      // Slip angles: where each axle points against where it is going. The
      // guard on the forward speed is not a fudge — the arithmetic genuinely
      // has no answer at a standstill, which is why a crawling car is steered
      // geometrically instead, below.
      const fwd = Math.max(Math.abs(vx), 0.8);
      const turn = Math.sign(vx || 1);
      const slipFront =
        Math.atan2(vy + this.yawRate * b, fwd) - this.steer * turn;
      const slipRear = Math.atan2(vy - this.yawRate * c, fwd);

      // The tyre: force proportional to slip until it saturates at what the
      // surface will hold. That saturation *is* the skid.
      //
      // Faded out as the car comes to rest, which is both true and necessary.
      // True, because a tyre's grip comes from tread being dragged sideways
      // and a stationary tyre is not being dragged anywhere. Necessary,
      // because at a crawl the slip angle of a car pointing even slightly
      // across its own path is enormous, and a saturated lateral force leaves
      // nothing in the friction circle for the engine — a car nudged sideways
      // at walking pace sat there with the wheels spinning and could not move.
      const bite = Math.min(1, speed / PHYSICS.crawl);
      const wantFront =
        -clamp(PHYSICS.stiffFront * slipFront, -1, 1) *
        muFront *
        loadFront *
        bite;
      const wantRear =
        -clamp(PHYSICS.stiffRear * slipRear, -1, 1) * muRear * loadRear * bite;

      // Relaxation: the force follows what the slip angle asks for over about
      // half a metre of rolling rather than arriving whole. See PHYSICS.relax
      // — this is the difference between a back end that lets go and one that
      // starts to let go.
      const catchUp = 1 - Math.exp(-(speed * dt) / PHYSICS.relax);
      this.fyFront += (wantFront - this.fyFront) * catchUp;
      this.fyRear += (wantRear - this.fyRear) * catchUp;
      let fyFront = this.fyFront;
      let fyRear = this.fyRear;

      // Longitudinal. Drive at the rear, brakes at both ends, and the two
      // resistances that decide the top speed between them.
      // Force from power, which is what an engine actually has: hard at the
      // bottom of the range and fading with speed. Capped, because no tyre
      // takes an infinite shove at a standstill.
      const pull = Math.min(
        PHYSICS.drive,
        PHYSICS.power / Math.max(2, Math.abs(vx)),
      );
      let fxRear = throttle * pull;
      let fxFront = 0;
      const reverse = drive.kind === "wheel" && drive.reverse === true;
      if (braking > 0 && Math.abs(vx) > 0.5 && !(reverse && vx < 0)) {
        // Brakes, against whichever way it is rolling. They stop a car; they
        // do not then drive it the other way.
        const brake = -Math.sign(vx) * braking * PHYSICS.brake;
        fxRear += brake * (1 - PHYSICS.brakeFront);
        fxFront = brake * PHYSICS.brakeFront;
      } else if (braking > 0 && reverse) {
        fxRear -= braking * PHYSICS.drive * 0.36;
      }

      // The friction circle. An axle has one budget of grip and spends it on
      // whatever is asked of it first — so a rear tyre already at full
      // throttle has nothing left to hold the back end in, which is a power
      // slide, and one under full braking cannot also turn.
      //
      // Except at the back under braking, where the *lateral* force is served
      // first and the brake gets what is left. That is not a cheat; it is what
      // every car built in the last thirty years does, and what the valve
      // before that did: rear brake pressure is given up to keep the back end
      // stable, because a rear axle that locks while the car is turning puts
      // the car round. Without it, full brakes and full lock at a hundred and
      // twenty spun it a hundred and eighty degrees every time.
      //
      // And the same under power, which is traction control, and which every
      // road car has too. The engine has far more shove than a tyre on grass
      // can use, and spending the whole budget on wheelspin left nothing to
      // hold the back end: a car turning on the grass at walking pace went
      // round. So the grip goes to holding the line first and the engine gets
      // what is left — never less than `traction` of it, or a car in a slide
      // could not drive out of one.
      const rearGrip = muRear * loadRear;
      fyRear = clamp(fyRear, -rearGrip, rearGrip);
      const spare = Math.sqrt(Math.max(0, rearGrip ** 2 - fyRear ** 2));
      if (fxRear < 0) {
        fxRear = Math.max(fxRear, -spare);
      } else {
        fxRear = Math.min(fxRear, Math.max(spare, PHYSICS.traction * rearGrip));
        [fxRear, fyRear] = circle(fxRear, fyRear, rearGrip);
      }
      [fxFront, fyFront] = circle(fxFront, fyFront, muFront * loadFront);

      const resist =
        -PHYSICS.drag * vx * Math.abs(vx) - PHYSICS.rollResist * rollMult * vx;
      const fx = fxRear + fxFront * Math.cos(this.steer) + resist;
      const fy = fyRear + fyFront * Math.cos(this.steer);

      const ax = fx / M;
      const ay = fy / M;
      this.lastPush = ax;

      // The centripetal terms: in the car's own turning frame, going forward
      // while yawing *is* a sideways acceleration.
      vx += (ax + this.yawRate * vy) * dt;
      vy += (ay - this.yawRate * vx) * dt;

      const torque = fyFront * Math.cos(this.steer) * b - fyRear * c;
      const spin = torque / PHYSICS.inertia;
      // Under about walking pace the slip-angle model is dividing by nothing
      // and says nonsense, so the car turns the way a shopping trolley does:
      // geometry, not forces. Blended across, or the changeover is a jolt.
      const rolling = Math.min(1, Math.max(0, speed / PHYSICS.crawl - 1));
      const kinematic = (vx * Math.tan(this.steer)) / L;
      this.yawRate =
        rolling * (this.yawRate + spin * dt) + (1 - rolling) * kinematic;

      // Stability control, as every car sold in Europe since 2014 has it. A
      // path can only bend as fast as the tyres can pull it round — grip over
      // speed — and a nose turning much faster than that is a car starting to
      // spin. It is caught by braking one wheel, which is a turning moment, and
      // a braked wheel can only push as hard as its grip: so this is strong on
      // tarmac, weaker on grass, and next to nothing on oil, where the car is
      // meant to be in trouble.
      //
      // And it leaves a drift alone. It only steps in once the car is further
      // sideways than a drift should go — until then a sliding car at full
      // lock in a sharp bend is exactly what was asked for, and catching every
      // one of them took the drifting out of the game along with the spins.
      const grip = Math.min(gripFront, gripRear);
      const bends = (PHYSICS.grip * grip * g) / Math.max(speed, 3);
      const excess = Math.abs(this.yawRate) - PHYSICS.escMargin * bends;
      if (excess > 0 && Math.abs(drifting) > PHYSICS.driftEnough) {
        this.yawRate -=
          Math.sign(this.yawRate) *
          Math.min(excess, PHYSICS.escRate * grip * dt);
      }
    }

    this.heading += this.yawRate * dt;
    this.dir.set(Math.sin(this.heading), Math.cos(this.heading));
    this.side.set(this.dir.y, -this.dir.x);
    this.velocity.set(
      (this.dir.x * vx + this.side.x * vy) * s,
      (this.dir.y * vx + this.side.y * vy) * s,
    );
    // A skid is sideways travel, and there is no rubber on the road in mid-air.
    this.slip = flying ? 0 : Math.abs(vy) * s;

    // ---- the air, which is only ever gravity -------------------------------
    if (this.onSlope) {
      // Held to the surface above; nothing to integrate.
    } else if (this.air > 0 || this.height > 0) {
      this.height += this.climb * dt;
      this.climb -= PHYSICS.gravity * s * dt;
      this.roll += this.rollRate * dt;
      // The nose follows the trajectory, because that is where the car is
      // going: up off the lip, over at the top, down on the way in. Nothing
      // schedules this and nothing clamps it.
      this.pitch = Math.atan2(this.climb, Math.max(20, this.speed));
      if (this.height <= 0) {
        this.height = 0;
        // Landing. The vertical speed is absorbed by the suspension and a
        // share of the horizontal goes with it, which is the difference
        // between landing a jump and teleporting to the far side of one.
        const bump = Math.min(1, -this.climb / (ITEM.ramp.landHard * s));
        this.velocity.multiplyScalar(1 - bump * (1 - ITEM.ramp.landKeep));
        this.climb = 0;
        this.air = 0;
        this.rollRate = 0;
        this.landing = ITEM.ramp.landFor * bump;
        this.pitch = -ITEM.ramp.landDip * bump;
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
  keepIn(track: Track, dt = SIM.step): boolean {
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

    // The wall takes the speed that was going into it and nothing else, and
    // then rubs along it. Written as a rate rather than as a fraction per
    // frame: it used to take fourteen per cent of *everything* every step,
    // which at sixty steps a second is a car that can never leave a wall it
    // has touched — the rivals ended up pinned to the barrier at walking pace,
    // steering at a track they could not get back to.
    const outward = this.velocity.x * side.x + this.velocity.y * side.z;
    if (outward * sign > 0) {
      this.velocity.x -= side.x * outward;
      this.velocity.y -= side.z * outward;
    }
    this.velocity.multiplyScalar(Math.exp(-CAR.wallDrag * dt));
    return true;
  }

  /**
   * Puts the car where another screen says it is.
   *
   * This is how somebody else's car moves: not driven, placed. None of the
   * physics above runs for it — that already ran, on the iPad of the child
   * holding the stick, and running it again here on a stale idea of what they
   * asked for would only produce a second, different car.
   *
   * `prevPosition` and `prevHeading` are kept honestly, which is what lets the
   * render interpolate between steps exactly as it does for a car that is
   * being driven. The velocity is not ornamental either: the collisions read
   * it, so a bump from a car that arrived over the network shoves as hard as
   * one from a rival beside you.
   */
  follow(
    x: number,
    z: number,
    heading: number,
    vx: number,
    vz: number,
    height: number,
    roll: number,
    pitch: number,
    slip: number,
  ): void {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;
    this.position.x = x;
    this.position.z = z;
    this.heading = heading;
    this.velocity.set(vx, vz);
    this.height = height;
    this.roll = roll;
    this.pitch = pitch;
    this.slip = slip;
    this.dir.set(Math.sin(heading), Math.cos(heading));
    this.side.set(this.dir.y, -this.dir.x);
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
    // The shadow, thrown where the sun would actually throw it.
    //
    // Down onto the ground, and *sideways* — by the height times how far the
    // sun leans, which is the same arithmetic as a stick in the ground. That
    // displacement is what says how high the car is; the shadow itself stays
    // the size the car is, because the sun is a long way away and a directional
    // light does not make things bigger as they approach it.
    this.shadow.visible = this.height > 0.2;
    if (this.shadow.visible) {
      this.shadow.position.y = LAYER.shadow - LAYER.car - this.height;
      const lean = this.height / LIGHT.from.y;
      const awayX = -LIGHT.from.x * lean;
      const awayZ = -LIGHT.from.z * lean;
      // Into the car's own frame: the shadow hangs off the group, and the
      // group is turned to face wherever the car is pointing.
      const turn = this.group.rotation.y;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      this.shadow.position.x = awayX * cos - awayZ * sin;
      this.shadow.position.z = awayX * sin + awayZ * cos;
      // And softer the further it is thrown: a little wider, a little lighter.
      const up = Math.min(1, this.height / SHADOW.fades);
      const spread = 1 + this.height * SHADOW.spread;
      this.shadow.scale.set(spread, 1, spread);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity =
        SHADOW.dark + (SHADOW.least - SHADOW.dark) * up;
    }
  }
}

const tmp3 = new THREE.Vector3();

/** Half the track width of the car — how far a wheel sits from its middle. */
const HALF_TRACK = CAR.width * 0.56;
