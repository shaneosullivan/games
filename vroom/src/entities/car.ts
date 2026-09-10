import * as THREE from "three";
import {
  CAR,
  CarDesign,
  CarShape,
  DriverKit,
  ITEM,
  PHYSICS,
  SIM,
  Sticker,
  SURFACE,
  TRAIL,
} from "../config";
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

  constructor(
    colour: number,
    design: CarDesign = "plain",
    stickers: ReadonlyArray<Sticker> = [],
    kit?: DriverKit,
    shape: CarShape = "racer",
  ) {
    this.sprite = carModel(colour, design, stickers, kit, shape);
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
    this.onSlope = false;

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
      if (i < 2) {
        gripFront += on.grip / 2;
      } else {
        gripRear += on.grip / 2;
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

    let wantSteer = 0;
    let throttle = 0;
    let braking = 0;
    if (drive.kind === "wheel") {
      wantSteer = drive.steer * lock;
      throttle = Math.max(0, drive.throttle);
      braking = Math.max(0, -drive.throttle);
    } else {
      const push = Math.min(1, drive.aim.length());
      if (push > 1e-4) {
        const target = Math.atan2(drive.aim.x, drive.aim.y);
        const diff = shortestAngle(this.heading, target);
        wantSteer = Math.max(-lock, Math.min(lock, diff));
        // Pushing against the way the car is pointing is the brake. There is
        // no separate brake button and there does not need to be one: asking
        // to go the other way is asking to slow down, which is what a child
        // does without being told.
        const facing =
          (this.dir.x * drive.aim.x + this.dir.y * drive.aim.y) / push;
        if (facing < -0.2) {
          braking = push;
        } else {
          throttle = push;
        }
      }
    }
    // The rack takes time to turn, which is most of why a car feels like it
    // has weight. Instant lock is a mouse pointer.
    const swing = PHYSICS.steerRate * dt * (flying ? ITEM.ramp.steer : 1);
    this.steer += Math.max(-swing, Math.min(swing, wantSteer - this.steer));
    this.steer = Math.max(-lock, Math.min(lock, this.steer));

    // ---- the tyres ---------------------------------------------------------
    this.dir.set(Math.sin(this.heading), Math.cos(this.heading));
    this.side.set(this.dir.y, -this.dir.x);
    // Body axes, in metres a second: along the nose, and out of the door.
    let vx = this.velocity.dot(this.dir) / s;
    let vy = this.velocity.dot(this.side) / s;

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
      this.yawRate *= Math.exp(-dt);
    } else {
      // Weight on each axle: the static split, plus what the last step's
      // acceleration threw forward or back. This is why braking gives the
      // front tyres more to work with and lifting mid-corner unsettles a car.
      const shift = (PHYSICS.cgHeight / L) * M * this.lastPush;
      const loadFront = Math.max(0, (c / L) * M * g - shift);
      const loadRear = Math.max(0, (b / L) * M * g + shift);
      const muFront = PHYSICS.grip * gripFront;
      const muRear = PHYSICS.grip * gripRear;

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
      let fyFront =
        -clamp(PHYSICS.stiffFront * slipFront, -1, 1) *
        muFront *
        loadFront *
        bite;
      let fyRear =
        -clamp(PHYSICS.stiffRear * slipRear, -1, 1) * muRear * loadRear * bite;

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
      if (braking > 0) {
        fxRear -=
          braking * (vx > 0.5 ? PHYSICS.brake : PHYSICS.drive * 0.6) * 0.6;
      }
      let fxFront =
        braking > 0 && vx > 0.5 ? -braking * PHYSICS.brake * 0.4 : 0;

      // The friction circle. An axle has one budget of grip and spends it on
      // whatever is asked of it first — so a rear tyre already at full
      // throttle has nothing left to hold the back end in, which is a
      // power slide, and one under full braking cannot also turn.
      [fxRear, fyRear] = circle(fxRear, fyRear, muRear * loadRear);
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
