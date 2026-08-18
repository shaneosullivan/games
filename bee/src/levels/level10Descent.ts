import * as THREE from "three";
import {KATAMARI as K, ASCENT_PALETTE as P} from "../config";
import {aimInstruction} from "../core/pointerAim";
import {Rng} from "../core/rng";
import {
  createRollKit,
  type RollKind,
  type RollKit,
} from "../entities/rollItems";
import {FIREWORK_PALETTE} from "../fx/particles";
import {createBear, type BearModel} from "../render/geometry/bear";
import {
  createCage,
  createDescent,
  type Cage,
  type Descent,
} from "../render/geometry/descent";
import {createBaby, type BabyModel} from "../render/geometry/bee";
import {solidToon} from "../render/materials";
import type {GameContext, Level} from "./level";

type Phase =
  "opening" | "rolling" | "roar" | "smash" | "party" | "sweep" | "done";

/** One line of the KATAMARI.items table. */
interface ItemSpec {
  kind: RollKind;
  /** Its size as a fraction of the ball a player on the pace would have. */
  of: number;
  /** A ceiling in units, for the kinds that stay small enough to rescue you. */
  max?: number;
  weight: number;
}

/** Something lying on the hill, waiting to be eaten or bounced off. */
interface Item {
  kind: RollKind | "bear";
  group: THREE.Group;
  x: number;
  z: number;
  radius: number;
  stuck: boolean;
  /** How long it has been wobbling since it shrugged the ball off. */
  shove: number;
  /** Animals only: how fast it is walking across the hill, and its own beat. */
  walk?: number;
  beat?: number;
  /** Animals: where it started, and how far either side it patrols. */
  home?: number;
  range?: number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const axis = new THREE.Vector3();
const below = new THREE.Vector3();
const lean = new THREE.Vector3();
const spin = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 10 — Down the Mouldy Mountain.
 *
 * Katamari Damacy on the hillside she has just climbed. The queen tows the
 * summit boulder on a line of light; anything the ball touches that is smaller
 * than the ball sticks to it and rolls on with it, and anything bigger knocks
 * it back. Everything on the hill gets bigger the further down it lies, so the
 * ball is always racing its own scale — and the last thing in the way is the
 * bear from the Bear's Lair.
 *
 * Three things about how it is built.
 *
 * There is no physics engine. A rolling *sphere* is the one case where there
 * doesn't need to be: the contact point is directly under the centre, so the
 * spin is exactly distance-over-radius about an axis square to the direction
 * of travel, with no solver and nothing to tune. That is the whole simulation.
 *
 * Sticking is reparenting. An item that is eaten is moved from the hillside
 * into the ball's spinning group with its world transform preserved, which
 * puts it exactly where it was touched and then costs nothing at all for the
 * rest of the level — it rides the same matrix as the ball.
 *
 * And it is in slope space, x across and -z downhill, like the climb. See
 * render/geometry/descent.ts.
 */
export class DescentLevel implements Level {
  readonly name = "Down the Mountain";
  readonly completionTitle = "All the way down!";
  readonly completionBody =
    "One small boulder at the top, and half the mountain by the bottom. Even the bear came along.";
  /*
   * Not readonly, unlike every other level's: there are two ways to lose this
   * one and they are not the same disappointment. Reaching the bottom small is
   * a level you played badly; being turned away by the bear is a level you
   * nearly won, and it should say so.
   */
  failTitle = "Not quite big enough";
  failBody =
    "The ball reached the bottom too small to matter. Roll over more of the hillside on the way down — the little things first.";

  /** The last level in the game. */
  readonly finishesGame = true;

  complete = false;
  failed = false;

  private hill!: Descent;
  private kit!: RollKit;
  private phase: Phase = "opening";
  private phaseTime = 0;
  private rng = new Rng(0x10_04_22);

  /** The ball: where it is, how big, and how fast down and across. */
  private ballRoot!: THREE.Group;
  private ballSpin!: THREE.Group;
  private core!: THREE.Mesh;
  private x = 0;
  private rolled = 0;
  private speed = 0;
  private drift = 0;
  private radius: number = K.ball.start;
  /** Everything eaten so far, as volume; the radius is derived from it. */
  private eaten = 0;
  /**
   * The shape of the thing, as opposed to its size.
   *
   * `com` is where its weight actually is, in the spinning group's own frame,
   * and `lift` is how far the ground is from its centre *in the direction it
   * is currently leaning* — which is what a lumpy ball rides on. Both are the
   * whole of the lumpy-rolling model; see `reshape` and `ride`.
   */
  private readonly com = new THREE.Vector3();
  private lift: number = K.ball.start;
  /**
   * The camera's idea of how big the ball is, which lags the truth.
   *
   * Eased rather than read straight, so the shot pulls out slowly over the
   * whole descent instead of twitching backwards on every mouthful.
   */
  private shown: number = K.ball.start;
  private caught = 0;
  private bearCaught = false;

  /** Where the queen is across the hill; she leads by a fixed distance. */
  private beeX = 0;
  private tether!: THREE.Mesh;

  private readonly items: Array<Item> = [];
  private spawnedTo = 0;
  /** How wide the play is on this screen, measured every frame. */
  private playHalf: number = K.wantHalfWidth;

  private bursts = 0;
  private nextBurst = 0;
  private shake = 0;

  /** The cage of babies behind the bear, and the babies in it. */
  private cage!: Cage;
  private babies: Array<{model: BabyModel; a: number; r: number; y: number}> =
    [];
  private cageGroup!: THREE.Group;
  /** How long the smash has been playing, in its own slowed-down seconds. */
  private smashed = 0;
  /** Set when the bear turns her away, so the level ends the right way. */
  private blocked = 0;
  /** The bear himself, for the moment he stands up. */
  private bear!: BearModel;
  /** Whether he has already had his moment; he only gets the one. */
  private roared = false;

  get controlsLocked(): boolean {
    return this.phase !== "rolling";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("mountain");
    // The whole hill has to be visible from the top of it; see KATAMARI.fogScale.
    ctx.setFogScale(K.fogScale);
    // The camera ends up five hundred units back from a ball this size, and
    // the game's own far plane is four hundred — see Stage.setViewDistance.
    ctx.setViewDistance(K.viewDistance);
    this.rng = new Rng(0x10_04_22);
    this.hill = createDescent(this.rng);
    ctx.mountain.add(this.hill.group);
    this.kit = createRollKit();

    // ---- the ball -------------------------------------------------------
    //
    // Two groups, and the difference matters. `ballRoot` is *placed* and never
    // turned; `ballSpin` is turned and never placed. Everything the ball eats
    // becomes a child of the spinning one, so it rides round with it for free
    // — and the core sphere is scaled on its own rather than by scaling that
    // group, which would grow everything stuck to it as well.
    this.ballRoot = new THREE.Group();
    this.ballSpin = new THREE.Group();
    this.ballRoot.add(this.ballSpin);
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 2),
      solidToon(P.rock),
    );
    this.core.castShadow = true;
    this.ballSpin.add(this.core);
    this.hill.slope.add(this.ballRoot);

    this.tether = new THREE.Mesh(
      new THREE.CylinderGeometry(K.tether.width, K.tether.width, 1, 6),
      solidToon(K.tether.colour),
    );
    // A line of light, not a rope: it should glow rather than be shaded, and
    // it should never be hidden by the ball it is tied to.
    (this.tether.material as THREE.MeshToonMaterial).transparent = true;
    (this.tether.material as THREE.MeshToonMaterial).opacity = 0.8;
    this.tether.renderOrder = 2;
    this.hill.slope.add(this.tether);

    this.items.length = 0;
    this.spawnedTo = 0;
    this.x = 0;
    this.beeX = 0;
    this.rolled = 0;
    this.speed = 0;
    this.drift = 0;
    this.radius = K.ball.start;
    this.shown = K.ball.start;
    this.com.set(0, 0, 0);
    this.lift = K.ball.start;
    this.eaten = 0;
    this.caught = 0;
    this.bearCaught = false;
    this.bursts = 0;
    this.nextBurst = 0;
    this.shake = 0;
    this.smashed = 0;
    this.blocked = 0;
    this.roared = false;
    this.failTitle = "Not quite big enough";
    this.failBody =
      "The ball reached the bottom too small to matter. Roll over more of the hillside on the way down — the little things first.";
    this.phase = "opening";
    this.phaseTime = 0;
    this.complete = false;
    this.failed = false;

    this.addBear();
    this.buildCage();

    ctx.configureFlight({
      boundsRadius: 4000,
      minHeight: 0,
      maxHeight: 60,
      cameraDistance: K.camera.back,
      cameraHeight: K.camera.up,
    });
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);
    // Nothing on the glass, as on the way up: she goes where the finger goes.
    ctx.setFlightControls(false);
    ctx.aim.reset();

    this.place(ctx);
    ctx.hud.setBanner(this.name);
    ctx.hud.setObjective("Roll it all the way down — everything sticks!");
    ctx.hud.setCounters([]);
    ctx.hud.setHealth(null);
    ctx.hud.setProgress("Ball", 0);
    ctx.hud.setCallout(aimInstruction());
  }

  exit(ctx: GameContext): void {
    ctx.setFogScale(1);
    ctx.setViewDistance(null);
    ctx.hud.setCallout(null);
    ctx.hud.setProgress(null);
    ctx.mountain.remove(this.hill.group);
    // Anything stuck to the ball is disposed with the ball, so the items are
    // walked before it rather than after.
    for (const item of this.items) {
      item.group.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry && !this.shared(mesh.geometry)) {
          mesh.geometry.dispose();
        }
      });
    }
    this.items.length = 0;
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.tether.geometry.dispose();
    (this.tether.material as THREE.Material).dispose();
    this.cage.dispose();
    this.babies.length = 0;
    this.hill.dispose();
    this.kit.dispose();
    ctx.bee.scripted = false;
    ctx.bee.setCrown(false);
    ctx.bee.setScale(1);
  }

  /** Geometry owned by the kit, which disposes of it itself. */
  private shared(geo: THREE.BufferGeometry): boolean {
    return Object.values(this.kit.shapes).includes(geo);
  }

  resumeAfterCompletion(): void {
    // The bottom of the mountain is the end of the game.
  }

  retry(ctx: GameContext): void {
    this.exit(ctx);
    this.enter(ctx);
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    this.hill.update(dt, this.rolled);
    switch (this.phase) {
      case "opening":
        this.updateOpening(ctx);
        break;
      case "rolling":
        this.updateRolling(dt, ctx);
        break;
      case "roar":
        this.updateRoar(ctx);
        break;
      case "smash":
        this.updateSmash(dt, ctx);
        break;
      case "party":
        this.updateParty(dt, ctx);
        break;
      case "sweep":
        this.updateSweep(ctx);
        break;
      case "done":
        break;
    }
  }

  // ---- the opening --------------------------------------------------------

  /**
   * Two seconds looking at the boulder before anything moves.
   *
   * She is hovering over a rock on a line of light, which is a thing nobody
   * has seen in this game before. Given a moment to look at it, the first
   * thing the player does is steer; without one, the first thing they do is
   * work out what they are looking at while the hill goes past.
   */
  private updateOpening(ctx: GameContext): void {
    this.place(ctx);
    this.camera(ctx, 1 - ease(Math.min(1, this.phaseTime / 2.2)));
    if (this.phaseTime >= 2.2) {
      this.phase = "rolling";
      this.phaseTime = 0;
    }
  }

  // ---- the roll -----------------------------------------------------------

  private updateRolling(dt: number, ctx: GameContext): void {
    /*
     * How far across she may be: the edge of the screen, or the funnel closing
     * in on the bear, whichever is tighter.
     *
     * The same function the banks were built from, so the wall she can see is
     * exactly the wall that is there — see Descent.corridorAt.
     */
    const across = Math.min(
      this.acrossLimit(ctx),
      this.hill.corridorAt(this.rolled),
    );
    this.playHalf = across;

    // Where the queen has got to. She is flown exactly as level 9 is flown —
    // to the pointer, at her own speed — but only across the hill: how far
    // down she is, is the ball's business.
    if (ctx.aim.active) {
      const want = THREE.MathUtils.clamp(
        this.aimAcross(ctx, ctx.aim.x),
        -across,
        across,
      );
      /*
       * She crosses the hill at a speed measured in *screens*, not in units.
       *
       * The shot pulls out as the ball grows, so by the bottom the playable
       * width is three times what it was at the top. A fixed speed in units
       * would mean she took three times as long to cross the same picture,
       * and the control would go dead in the hand exactly when the level is
       * asking the most of it.
       */
      const step = K.bee.speed * Math.max(1, across / K.wantHalfWidth) * dt;
      const gap = want - this.beeX;
      this.beeX += Math.abs(gap) <= step ? gap : Math.sign(gap) * step;
    }
    this.beeX = THREE.MathUtils.clamp(this.beeX, -across, across);

    // The ball: gravity down the hill against a drag, so it has a terminal
    // speed rather than accelerating for eighteen hundred units; and a pull
    // across towards wherever she has got to, damped, so it leans after her
    // instead of tracking her.
    this.speed += (K.ball.gravity - K.ball.drag * this.speed) * dt;
    this.speed = Math.max(K.ball.minSpeed, this.speed);
    this.drift += (this.beeX - this.x) * K.ball.pull * dt;
    this.drift -= this.drift * Math.min(1, K.ball.steerDamp * dt);
    // The ball is held inside the funnel too, less its own radius, so a
    // full-sized one is walked back towards the middle rather than clipping
    // through the bank it is leaning on.
    const walls = Math.max(
      this.radius * 0.6,
      Math.min(K.halfWidth, this.hill.corridorAt(this.rolled)) - this.radius,
    );
    this.x = THREE.MathUtils.clamp(this.x + this.drift * dt, -walls, walls);
    const travelled = this.speed * dt;
    this.rolled += travelled;

    this.ride(dt);
    this.shown += (this.radius - this.shown) * Math.min(1, K.zoomEase * dt);
    this.roll(travelled, this.drift * dt);
    this.spawn();
    this.retire();
    this.walkAnimals(dt);
    this.flyBabies(dt);
    this.collide(dt, ctx);
    this.place(ctx);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.camera(ctx, 0);
    ctx.hud.setProgress("Ball", this.progress());

    // He stands up as she comes into range — once, and only on the way to
    // meeting him.
    if (!this.roared && this.rolled > this.bearAt() - K.roar.at) {
      this.beginRoar(ctx);
      return;
    }

    // Turned away by the bear: she rolls on for a moment so the player sees
    // what happened, and then the level is over.
    if (this.blocked > 0) {
      this.blocked -= dt;
      if (this.blocked <= 0) {
        this.failTitle = "The bear won't budge";
        this.failBody =
          "He is bigger than your ball, so he simply will not stick — and behind him is a cage full of baby bees. Gather more on the mountain on the way down and come back for him.";
        this.failed = true;
        this.phase = "done";
        ctx.hud.setCallout(null);
        return;
      }
    }

    // The cage. She has the bear, so nothing is in the way of it.
    if (this.bearCaught && this.rolled + this.radius >= this.cageAt()) {
      this.beginSmash(ctx);
      return;
    }

    if (this.rolled >= K.run) {
      this.reachBottom(ctx);
    }
  }

  /**
   * Turn the ball by the distance it has just covered.
   *
   * Exact, for a sphere: the contact point is directly beneath the centre, so
   * one turn of the ball is one circumference of ground, whatever it has stuck
   * to itself. The axis is square to the direction of travel — `up × heading`
   * — and it is applied in the *parent's* frame with a premultiply, because
   * the ball's own frame has already been turned by everything before it.
   */
  private roll(down: number, sideways: number): void {
    const dist = Math.hypot(down, sideways);
    if (dist < 1e-5) {
      return;
    }
    // Heading in slope space: downhill is -z.
    tmp.set(sideways / dist, 0, -down / dist);
    axis.copy(UP).cross(tmp).normalize();
    // Turned about whatever it is actually standing on, not about its radius.
    // A ball riding over a swallowed tree is briefly a bigger wheel, and a
    // bigger wheel turns less for the same ground covered.
    spin.setFromAxisAngle(axis, dist / Math.max(0.5, this.lift));
    this.ballSpin.quaternion.premultiply(spin);
  }

  /**
   * Where the weight is, in the spinning group's own frame.
   *
   * Recomputed whole rather than accumulated, because the core's own mass
   * changes every time the ball grows and a running average would drift. It
   * costs one pass over what has been eaten, on the frame something is eaten.
   */
  private reshape(): void {
    // The core sits at the origin and weighs what a ball of its radius weighs;
    // everything else weighs its own cube, which is the same currency the
    // growth is counted in.
    let mass = this.radius ** 3;
    this.com.set(0, 0, 0);
    for (const item of this.items) {
      if (!item.stuck) {
        continue;
      }
      const m = item.radius ** 3;
      this.com.addScaledVector(item.group.position, m);
      mass += m;
    }
    this.com.divideScalar(Math.max(0.001, mass));
  }

  /**
   * How the shape of it rides, this frame.
   *
   * Two things come out of the same question — where does the ground touch it?
   * The answer is its furthest point in the direction of "down", found by
   * asking every lump on it, and it gives both the height it rides at and the
   * wheel size it turns on. And because the weight is not at the middle any
   * more, whichever way the weight is leaning pulls it along or holds it back.
   *
   * This is not a rigid-body simulation and cannot tip over or jam. It is the
   * honest answer to "what is under it", which is most of what a lumpy ball
   * looks like from the outside.
   */
  private ride(dt: number): void {
    // Which way is down, in the ball's own turning frame.
    turn.copy(this.ballSpin.quaternion).invert();
    below.set(0, -1, 0).applyQuaternion(turn);

    let reach = this.radius;
    for (const item of this.items) {
      if (!item.stuck) {
        continue;
      }
      const out = item.group.position.dot(below) + item.radius;
      if (out > reach) {
        reach = out;
      }
    }
    reach = Math.min(reach, this.radius * K.ball.wobble);
    // Eased, so a lump coming under it is a heave and not a jump.
    this.lift += (reach - this.lift) * Math.min(1, K.ball.settle * dt);

    /*
     * And its own weight, pushing it along or holding it back.
     *
     * The centre of mass is in the ball's frame, so it has to be turned back
     * into the hill's to ask which way it is leaning. Past the contact point
     * and it is falling into the hill; behind and it is being dragged up out
     * of it — which is exactly the surge and drag of something lopsided
     * rolling downhill.
     */
    lean.copy(this.com).applyQuaternion(this.ballSpin.quaternion);
    this.speed += (-lean.z / Math.max(1, this.radius)) * K.ball.rock * dt;
    this.speed = Math.max(K.ball.minSpeed, this.speed);
  }

  // ---- what is on the hill ------------------------------------------------

  /**
   * Stock the hill ahead of the ball.
   *
   * By distance rather than by time, so the hillside is the same hillside
   * however fast it is rolled — and the sizes come from how far down each item
   * lies, which is the level's whole difficulty curve. See KATAMARI.items.
   */
  private spawn(): void {
    const ahead = this.rolled + 260;
    while (this.spawnedTo < ahead && this.spawnedTo < K.run - 40) {
      const from = this.spawnedTo;
      this.spawnedTo += 100;
      const count = Math.round(K.items.perHundred + this.rng.range(-1.4, 1.4));
      for (let i = 0; i < count; i++) {
        // Spread evenly down the stretch rather than sprinkled over it: a
        // hundred units with nothing in them followed by six things at once
        // is a level you sit still for and then cannot steer through.
        const z = from + ((i + this.rng.range(0.1, 0.9)) / count) * 100;
        // Nothing in the bear's clearing: he is the last thing in the game
        // and he is met alone. See KATAMARI.cage.clearing.
        if (z > K.run - K.bear.from - K.cage.clearing) {
          continue;
        }
        this.addItem(z, this.lane++);
      }
    }
  }

  /** Is there room here, or is something already standing in it? */
  private clearOf(x: number, z: number, radius: number): boolean {
    for (const item of this.items) {
      if (item.stuck || Math.abs(item.z - z) > 90) {
        continue;
      }
      if (
        Math.hypot(item.x - x, item.z - z) <
        item.radius + radius + K.items.apart
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Which strip across the hill the next item goes in.
   *
   * Counted rather than drawn at random, so consecutive items land in
   * different lanes and a run of them is a zigzag she has to chase. Random
   * placement clusters — that is what random does — and a cluster is one
   * sweep of the finger rather than a hillside to work.
   */
  private lane = 0;

  /**
   * How big the ball ought to be this far down the hill.
   *
   * A straight line from the summit boulder to what counts as big enough at
   * the bottom. Nothing enforces it — it is the yardstick everything on the
   * hill is sized against, so that "can I eat this?" means "am I keeping up?"
   */
  private pace(down: number): number {
    /*
     * Measured against the *stocked* part of the hill, not the whole run.
     *
     * The last few hundred units are the bear's clearing and there is nothing
     * to eat in them. Spreading the pace over the full length meant the ball
     * ran out of food while the yardstick was still climbing, so it topped out
     * a fifth under the size the level was designed around — and the bear,
     * sized against the design, could not be beaten by anybody.
     */
    const stocked = K.run - K.bear.from - K.cage.clearing;
    const t = THREE.MathUtils.clamp(down / stocked, 0, 1);
    return K.ball.start + (K.ball.target - K.ball.start) * t;
  }

  private addItem(down: number, lane: number): void {
    // Weighted pick: the small things are commoner, so there is always
    // something a struggling ball can eat.
    const kinds = K.items.kinds as ReadonlyArray<ItemSpec>;
    let total = 0;
    for (const k of kinds) {
      total += k.weight;
    }
    let roll = this.rng.range(0, total);
    let spec: ItemSpec = kinds[0];
    for (const k of kinds) {
      roll -= k.weight;
      if (roll <= 0) {
        spec = k;
        break;
      }
    }

    /*
     * How big this one is: its kind's fraction of the pace at this point.
     *
     * Jittered by a sixth either way, so the hill isn't sorted — a run of
     * items all growing in lockstep gives the player nothing to read, whereas
     * one unusually big goat among small ones is a decision.
     */
    const size =
      Math.min(this.pace(down) * spec.of, spec.max ?? Infinity) *
      this.rng.range(0.84, 1.16);

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.kit.shapes[spec.kind], this.kit.material);
    mesh.castShadow = true;
    mesh.scale.setScalar(size);
    group.add(mesh);
    /*
     * Across the width being *played*, not the width of the hill.
     *
     * The same rule as the climb: something placed eight units off the side of
     * the screen is not an obstacle and not a pickup, it is a thing the player
     * never learns was there. See `acrossLimit`.
     */
    const half = Math.max(8, this.playHalf) - size;
    const lanes = K.wander.lanes;
    /*
     * The lane's own slot, plus a little slop so the lanes aren't visible as
     * lanes, stepped by two each time so a run of items crosses the hill
     * rather than sliding along it — and moved on again if it lands on top of
     * something already there.
     */
    let x = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const slot = (((lane + attempt * 3) * 2) % lanes) + 0.5;
      x = THREE.MathUtils.clamp(
        ((slot / lanes) * 2 - 1) * half +
          this.rng.range(-half / lanes, half / lanes),
        -half,
        half,
      );
      if (this.clearOf(x, -down, size)) {
        break;
      }
    }
    // Lifted by its own radius, because the shapes are built about their
    // centres — scaling one built standing on its feet would sink it.
    group.position.set(x, size * 0.92, -down);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    this.hill.slope.add(group);
    const speed =
      spec.kind === "rabbit"
        ? K.wander.rabbit
        : spec.kind === "goat"
          ? K.wander.goat
          : null;
    this.items.push({
      kind: spec.kind,
      group,
      x,
      z: -down,
      radius: size,
      stuck: false,
      shove: 0,
      walk: speed
        ? this.rng.range(speed[0], speed[1]) * (this.rng.next() < 0.5 ? -1 : 1)
        : undefined,
      home: x,
      range: (half / K.wander.lanes) * K.wander.patrol,
      beat: this.rng.range(0, 6.28),
    });
  }

  /**
   * The bear, placed by hand at the bottom.
   *
   * Scaled by measuring him rather than by a number, because he is a model
   * built to his own scale and the only thing that matters here is his radius
   * — that is what the game compares against the ball.
   */
  private addBear(): void {
    const model = createBear();
    this.bear = model;
    const group = new THREE.Group();
    group.add(model.group);
    const box = new THREE.Box3().setFromObject(model.group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const spread = Math.max(size.x, size.z) / 2;
    model.group.scale.multiplyScalar(K.bear.radius / Math.max(0.001, spread));
    // Standing on the ground, facing up the hill at whatever is coming.
    model.group.position.y = -K.bear.radius * 0.5;
    group.position.set(0, K.bear.radius * 0.5, -(K.run - K.bear.from));
    this.hill.slope.add(group);
    this.items.push({
      kind: "bear",
      group,
      x: 0,
      z: -(K.run - K.bear.from),
      radius: K.bear.radius,
      stuck: false,
      shove: 0,
    });
  }

  // ---- the bear's warning --------------------------------------------------

  /** Where the bear stands, as a distance down the run. */
  private bearAt(): number {
    return K.run - K.bear.from;
  }

  /**
   * He stands up.
   *
   * The ball is stopped for it rather than left rolling. A cutscene the player
   * is still steering through is a cutscene they do not watch — and worse,
   * they lose ground they cannot see themselves losing. It is under three
   * seconds and it ends with the camera exactly where it started, so what they
   * get back is the picture they had.
   */
  private beginRoar(ctx: GameContext): void {
    this.roared = true;
    this.phase = "roar";
    this.phaseTime = 0;
    this.speed = 0;
    this.drift = 0;
    ctx.audio.roar();
  }

  private updateRoar(ctx: GameContext): void {
    const inTime = K.roar.in;
    const holdTo = inTime + K.roar.hold;
    const total = holdTo + K.roar.out;
    const t = this.phaseTime;

    /*
     * Up on his hind legs, a swipe at the air, and down again.
     *
     * `rear` is a ramp up and back down over the whole beat and `swat` is a
     * pair of paws inside it — the bear model takes both and does the rest.
     * The swipes are timed to the middle so they land while he is at his full
     * height rather than on the way up.
     */
    const rear =
      t < inTime
        ? ease(t / inTime)
        : t < holdTo
          ? 1
          : 1 - ease((t - holdTo) / K.roar.out);
    const swat =
      t > inTime * 0.8 && t < holdTo
        ? Math.max(0, Math.sin((t - inTime * 0.8) * 5.2))
        : 0;
    this.bear.animate(this.phaseTime * 4, 0, rear, swat);

    // In on him, hold, and back out to the shot she had.
    const push =
      t < inTime
        ? ease(t / inTime)
        : t < holdTo
          ? 1
          : 1 - ease((t - holdTo) / K.roar.out);
    // `camera` leaves the playing shot in `eye` and `look`, which is what is
    // being lerped away from — the call it makes to the camera itself is
    // immediately overwritten by the one below.
    this.camera(ctx, 0);
    this.hill.slope.localToWorld(
      tmp.set(0, K.roar.height, -this.bearAt() + K.roar.standoff),
    );
    eye.lerp(tmp, push);
    this.hill.slope.localToWorld(
      tmp.set(0, K.bear.radius * 1.25, -this.bearAt()),
    );
    look.lerp(tmp, push);
    ctx.setCameraCinematic(eye, look);

    if (t >= total) {
      this.bear.animate(0, 0, 0, 0);
      this.phase = "rolling";
      this.phaseTime = 0;
      this.speed = K.ball.minSpeed;
    }
  }

  // ---- the cage -----------------------------------------------------------

  /** Where the cage stands, as a distance down the run. */
  private cageAt(): number {
    return K.run - K.cage.from;
  }

  /**
   * Stand the cage on the hill, with the babies flying about inside it.
   *
   * Built at the start rather than when she gets near it, because it is the
   * thing she is coming down the mountain *for* — it should be visible from up
   * the hill, over the bear's shoulder, long before she reaches it.
   */
  private buildCage(): void {
    this.cage = createCage(K.cage.radius);
    this.cageGroup = new THREE.Group();
    this.cageGroup.add(this.cage.group);
    this.cageGroup.position.set(0, 0, -this.cageAt());
    this.hill.slope.add(this.cageGroup);

    this.babies = [];
    for (let i = 0; i < K.cage.babies; i++) {
      const model = createBaby();
      model.group.scale.setScalar(K.cage.radius * 0.13);
      this.cageGroup.add(model.group);
      this.babies.push({
        model,
        a: (i / K.cage.babies) * Math.PI * 2,
        r: this.rng.range(K.cage.radius * 0.25, K.cage.radius * 0.72),
        y: this.rng.range(K.cage.radius * 0.3, K.cage.radius * 1.15),
      });
    }
  }

  /**
   * Fly the babies round inside the cage — and out of it, once it is open.
   *
   * The same code both times. What changes when the cage breaks is that their
   * ring grows and rises without limit, so they spiral up and away rather than
   * needing a second flight of their own.
   */
  private flyBabies(dt: number): void {
    const out = this.phase === "smash" ? this.smashed : 0;
    for (const baby of this.babies) {
      baby.a += dt * (0.6 + baby.r * 0.02);
      const r = baby.r + out * 12;
      const y = baby.y + out * 9 + Math.sin(baby.a * 2.2) * 1.4;
      baby.model.group.position.set(
        Math.cos(baby.a) * r,
        y,
        Math.sin(baby.a) * r,
      );
      // Facing the way it is going, which round a circle is a quarter turn on
      // from where it is.
      baby.model.group.rotation.y = -baby.a + Math.PI / 2;
      baby.model.animate(baby.a * 3, 1);
    }
  }

  /**
   * Break it open.
   *
   * Every piece is thrown out from where the ball met the cage, hardest at the
   * front and hardest low down, with a turn on it. Nothing here is a
   * simulation — the pieces never meet each other again — because what is
   * being animated is one moment of it, played slowly.
   */
  private beginSmash(ctx: GameContext): void {
    this.phase = "smash";
    this.phaseTime = 0;
    this.smashed = 0;
    this.speed *= 0.35;
    ctx.hud.setCallout("The babies are free!");
    ctx.audio.levelComplete();
    for (const piece of this.cage.pieces) {
      const at = piece.mesh.position;
      // Away from the middle, and away from the ball, and upwards.
      tmp.set(at.x, at.y * 0.35 + 4, at.z).normalize();
      const force = K.cage.burst * this.rng.range(0.6, 1.4);
      piece.velocity.set(
        tmp.x * force,
        tmp.y * force + this.rng.range(4, 16),
        tmp.z * force - force * 0.5,
      );
      piece.spin.set(
        this.rng.range(-K.cage.spin, K.cage.spin),
        this.rng.range(-K.cage.spin, K.cage.spin),
        this.rng.range(-K.cage.spin, K.cage.spin),
      );
    }
  }

  private updateSmash(dt: number, ctx: GameContext): void {
    // Everything in here runs on its own slow clock; the camera pulls out on
    // the real one, so the shot keeps moving while the pieces hang.
    const slow = dt * K.cage.slowMo;
    this.smashed += slow;

    for (const piece of this.cage.pieces) {
      piece.velocity.y -= K.cage.gravity * slow;
      piece.mesh.position.addScaledVector(piece.velocity, slow);
      piece.mesh.rotation.x += piece.spin.x * slow;
      piece.mesh.rotation.y += piece.spin.y * slow;
      piece.mesh.rotation.z += piece.spin.z * slow;
    }

    this.speed = Math.max(0, this.speed - K.ball.gravity * 0.5 * slow);
    const travelled = this.speed * slow;
    this.rolled += travelled;
    this.roll(travelled, 0);
    this.flyBabies(dt);
    this.place(ctx);

    // Out and up over the whole thing, on the real clock.
    const t = ease(Math.min(1, this.phaseTime / K.cage.time));
    this.camera(ctx, t * 0.9);

    this.nextBurst -= dt;
    if (this.nextBurst <= 0) {
      this.nextBurst = K.finish.burstEvery * 1.6;
      this.hill.slope.localToWorld(
        tmp.set(
          this.rng.range(-K.cage.radius, K.cage.radius),
          this.rng.range(6, K.cage.radius * 1.6),
          -this.cageAt() + this.rng.range(-20, 20),
        ),
      );
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 26,
        speed: 11,
        spherical: 1,
        ttl: 2.2,
        size: 0.9,
      });
    }

    if (this.phaseTime >= K.cage.time) {
      ctx.hud.setCallout(null);
      this.phase = "sweep";
      this.phaseTime = 0;
    }
  }

  // ---- eating and bouncing ------------------------------------------------

  /**
   * Walk the rabbits and the goats about.
   *
   * Only the ones near enough to be seen: the list is the whole hillside by
   * the end and there is no reason to walk an animal four hundred units behind
   * her. They turn round at the edge of the play rather than at the edge of
   * the hill, so nothing she is chasing wanders somewhere she is not allowed
   * to follow.
   */
  private walkAnimals(dt: number): void {
    const z = -this.rolled;
    const edge = Math.max(8, this.playHalf);
    for (const item of this.items) {
      if (item.stuck || item.walk === undefined) {
        continue;
      }
      if (Math.abs(item.z - z) > 260) {
        continue;
      }
      item.x += item.walk * dt;
      // Turning back at the edge of its own patch, and at the edge of the
      // play — whichever it meets first.
      const home = item.home ?? 0;
      const range = item.range ?? 10;
      const low = Math.max(-edge + item.radius, home - range);
      const high = Math.min(edge - item.radius, home + range);
      if (item.x > high || item.x < low) {
        item.walk = -item.walk;
        item.x = THREE.MathUtils.clamp(item.x, low, high);
      }
      item.group.position.x = item.x;
      // Facing the way it is going. The models are built looking down +z, so
      // a quarter turn either way points them across the hill.
      item.group.rotation.y = item.walk > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (item.kind === "rabbit") {
        // Rabbits hop rather than walk, which at this distance is the only
        // thing that tells them apart from the goats at a glance.
        item.beat = (item.beat ?? 0) + dt * K.wander.hopRate;
        const hop = Math.abs(Math.sin(item.beat)) * K.wander.hop;
        item.group.position.y = item.radius * 0.92 + hop * item.radius;
      }
    }
  }

  /**
   * Forget what is well behind her.
   *
   * The hill is four thousand units long and carries three hundred things;
   * without this every one of them stays in the scene and in the collision
   * loop for the rest of the level, on a device that is an iPad. Only what she
   * has already gone past is dropped, and never anything stuck to the ball —
   * that belongs to her now.
   */
  private retire(): void {
    const behind = -this.rolled + this.radius + 140;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.stuck || item.z < behind) {
        continue;
      }
      this.hill.slope.remove(item.group);
      this.items.splice(i, 1);
    }
  }

  private collide(dt: number, ctx: GameContext): void {
    const z = -this.rolled;
    for (const item of this.items) {
      if (item.stuck) {
        continue;
      }
      if (item.shove > 0) {
        item.shove = Math.max(0, item.shove - dt);
        item.group.rotation.z = Math.sin(item.shove * 34) * item.shove * 0.4;
        // Still rocking from the last knock. One obstacle should cost one
        // bounce, not one a frame for as long as the ball is scraping past it.
        if (item.shove > 0.2) {
          continue;
        }
      }
      // Only what is near enough to matter; the list runs the whole hill.
      if (Math.abs(item.z - z) > item.radius + this.radius + 4) {
        continue;
      }
      /*
       * The bear is a wall, not an obstacle.
       *
       * Everything else on the hill is met where it happens to be standing and
       * can be steered around. He cannot: he is what is between her and the
       * cage, so he is met across the whole width of the play whatever line
       * she came down. Otherwise the climax of the game is something a ball
       * can miss by rolling wide of it.
       */
      const gap =
        item.kind === "bear"
          ? Math.abs(item.z - z)
          : Math.hypot(item.x - this.x, item.z - z);
      if (gap > item.radius + this.radius) {
        continue;
      }
      if (item.radius <= this.radius * K.ball.stickMargin) {
        this.stick(item, ctx);
      } else if (item.kind === "bear") {
        this.turnedAway(item, ctx);
      } else {
        this.bounce(item, ctx, gap);
      }
    }
  }

  /** Eat it: reparent it into the spin, and grow. */
  private stick(item: Item, ctx: GameContext): void {
    item.stuck = true;
    item.group.rotation.z = 0;
    // `attach` keeps the world transform, so it lands exactly where it was
    // touched rather than jumping to the ball's nose.
    this.ballSpin.attach(item.group);
    // Then pulled in until it is sitting on the surface rather than floating
    // off it — the contact was between two circles, and the item's own centre
    // is further out than the point they met at.
    const local = item.group.position;
    const out = local.length();
    if (out > 0.001) {
      local.multiplyScalar(
        Math.min(out, this.radius + item.radius * 0.35) / out,
      );
    }

    // Worth less and less as the ball approaches the ceiling above the pace;
    // see KATAMARI.ball.lead for why there is a ceiling at all.
    const ceiling = this.pace(this.rolled) * K.ball.lead;
    const room = Math.max(0, 1 - (this.radius / ceiling) ** 4);
    this.eaten += K.ball.growth * item.radius ** 3 * room;
    this.radius = Math.cbrt(K.ball.start ** 3 + this.eaten);
    this.reshape();
    this.caught++;
    if (item.kind === "bear") {
      this.bearCaught = true;
      ctx.hud.setCallout("You got the bear!");
      window.setTimeout(() => ctx.hud.setCallout(null), 2600);
    }

    this.hill.slope.localToWorld(tmp.set(item.x, this.radius, item.z));
    ctx.puff.burst(tmp, {
      color: [P.mossGlow, 0xffd84a, 0xffffff],
      count: 12,
      speed: 5,
      ttl: 0.5,
      size: 0.7,
      spherical: 0.9,
    });
    ctx.audio.collect(Math.min(4, Math.floor(this.progress() * 5)));
  }

  /**
   * Too big: bounce off it.
   *
   * The ball is pushed back out of the thing it hit rather than being allowed
   * to overlap and re-trigger the same collision every frame, and it loses
   * some of its speed — which the hill gives straight back, so this costs
   * ground rather than ending anything.
   */
  private bounce(item: Item, ctx: GameContext, gap: number): void {
    /*
     * Shoved aside, never backwards.
     *
     * The ball keeps every unit of hill it has covered, and that is a rule
     * about the level rather than about physics. Bouncing it back up the
     * slope reads better for about two seconds and then hangs the game: a
     * ball with nobody steering it rolls into the next thing too big for it,
     * is pushed back, rolls into the same thing again, and the bottom of the
     * mountain never arrives — eight thousand bounces and no fail card, which
     * is exactly the way the Silent Islands once froze. Deflecting sideways
     * costs the same speed, looks like scraping past, and always ends.
     *
     * A ball that hits something dead-centre has no side to be pushed to, so
     * one is picked for it.
     */
    let nx = this.x - item.x;
    if (Math.abs(nx) < 0.25) {
      nx = this.rng.next() < 0.5 ? -0.25 : 0.25;
    }
    const side = Math.sign(nx);
    const overlap = item.radius + this.radius - gap;
    this.x += side * (overlap + K.ball.bounceBack * 0.2);
    this.drift = side * K.ball.bounceBack;
    this.speed *= 1 - K.ball.bounceCost;
    item.shove = 0.5;
    this.shake = 1;
    ctx.audio.sting();
  }

  /**
   * Too small for the bear.
   *
   * He shrugs the ball off and the level is over — not at once, because a card
   * that appears on the same frame as the bump reads as a bug rather than as a
   * consequence. She is knocked back, told why, and the fail card follows a
   * couple of seconds later with the bear still on the screen.
   */
  private turnedAway(item: Item, ctx: GameContext): void {
    if (this.blocked > 0) {
      return;
    }
    this.blocked = 2.2;
    item.shove = 1.2;
    this.shake = 1;
    this.speed *= 0.2;
    this.rolled -= this.radius * 0.5;
    ctx.hud.setCallout("Too small for the bear!");
    ctx.audio.sting();
  }

  private progress(): number {
    return (this.radius - K.ball.start) / (K.ball.target - K.ball.start);
  }

  // ---- placing and framing ------------------------------------------------

  /** Put the ball, the queen and the line between them where they belong. */
  private place(ctx: GameContext): void {
    // Zero all the way down the hill and rising once past the finish, where
    // the ground goes flat — see Descent.groundAt. Everything that stands on
    // the ground adds it, or the run-out drives the ball through the floor.
    const under = this.hill.groundAt(this.rolled);
    // On whatever it is standing on, which is only its radius while it is
    // still round. See `ride`.
    this.ballRoot.position.set(this.x, this.lift + under, -this.rolled);
    this.core.scale.setScalar(this.radius);

    // She flies ahead of the ball, clear of it by its own radius, so she is
    // never inside the thing she is towing however big it gets.
    const beeAt =
      this.rolled + K.bee.ahead + this.radius * K.bee.aheadPerRadius;
    const beeZ = -beeAt;
    const beeY =
      K.bee.height +
      this.radius * K.bee.heightPerRadius +
      this.hill.groundAt(beeAt);
    // Drawn bigger as the camera retreats, so she is the same size on the
    // glass at the bottom of the hill as she was at the top.
    ctx.bee.setScale(K.bee.scale * (1 + this.shown * K.bee.scalePerRadius));
    this.hill.slope.localToWorld(tmp.set(this.beeX, beeY, beeZ));
    ctx.bee.teleport(tmp);
    ctx.bee.setYaw(Math.PI);

    // The tether: a cylinder is built along its own y, so it is stood between
    // the two points by pointing its axis at one of them.
    tmp.set(this.beeX, beeY, beeZ);
    tmp2.set(this.x, this.lift + under, -this.rolled);
    this.tether.position.copy(tmp).add(tmp2).multiplyScalar(0.5);
    const span = tmp.distanceTo(tmp2);
    this.tether.scale.set(1, Math.max(0.01, span), 1);
    this.tether.quaternion.setFromUnitVectors(UP, tmp.sub(tmp2).normalize());
  }

  /**
   * How far across the hill she may fly — which is the edge of the screen.
   *
   * Measured against the camera every frame, exactly as on the way up: the
   * hill is thirty units either side of the middle and a phone held upright
   * shows nothing like that.
   */
  private acrossLimit(ctx: GameContext): number {
    let limit = 5;
    // In strides rather than half-units: this walks out to a hundred and more
    // by the bottom of the hill, and every step is a projection.
    for (let out = 5; out <= K.halfWidth; out += 1.5) {
      const at = this.rolled + K.bee.ahead;
      this.hill.slope.localToWorld(
        tmp.set(out, K.bee.height + this.hill.groundAt(at), -at),
      );
      if (Math.abs(ctx.projectToScreen(tmp).x) > K.edgeMargin) {
        break;
      }
      limit = out;
    }
    return limit;
  }

  /**
   * Where across the hill a point on the screen is.
   *
   * One axis only, and so one Newton step on a measured gradient rather than
   * the 2×2 solve the climb needs — here she only steers sideways, because how
   * far down the hill she is, is the ball's to decide.
   */
  private aimAcross(ctx: GameContext, ndcX: number): number {
    const z = -this.rolled - (K.bee.ahead + this.radius);
    const at = (x: number): number => {
      this.hill.slope.localToWorld(
        tmp.set(x, K.bee.height + this.hill.groundAt(-z), z),
      );
      return ctx.projectToScreen(tmp).x;
    };
    let x = this.beeX;
    for (let step = 0; step < 2; step++) {
      const here = at(x);
      const slope = (at(x + 0.5) - here) / 0.5;
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      x = THREE.MathUtils.clamp(
        x + (ndcX - here) / slope,
        -K.halfWidth,
        K.halfWidth,
      );
    }
    return x;
  }

  /**
   * Behind the ball and above it, retreating as the ball grows.
   *
   * `lift` runs the opening shot and the smash: at 1 the camera is well above
   * and looking down on the whole thing, at 0 it is in its playing position.
   */
  private camera(ctx: GameContext, lift: number): void {
    const stand = this.standoff(ctx);
    const back = K.camera.back * stand;
    const up = K.camera.up * stand;
    // A knock is worth a shake, and a shake is worth about a unit.
    const jolt = this.shake * this.shake;
    const under = this.hill.groundAt(this.rolled);
    this.hill.slope.localToWorld(
      tmp.set(
        this.x * 0.4 + Math.sin(this.phaseTime * 47) * jolt,
        this.radius + under + up + lift * (30 + this.shown * 2),
        -this.rolled + back * (1 + lift * 0.6),
      ),
    );
    eye.copy(tmp);
    /*
     * Looking ahead of the ball by a fraction of how far back the camera is.
     *
     * Where this point is decides where the ball sits on the screen and how
     * steeply the shot tips. A fraction rather than a distance, so the framing
     * is the same at every size the ball reaches — see KATAMARI.camera.aim.
     */
    const aheadAt = this.rolled + back * K.camera.aim;
    this.hill.slope.localToWorld(
      tmp.set(
        this.x * 0.4,
        this.radius * 0.5 + this.hill.groundAt(aheadAt),
        -aheadAt,
      ),
    );
    look.copy(tmp);
    ctx.setCameraCinematic(eye, look);
  }

  /**
   * How far back the camera has to stand, as a multiple of its base distance.
   *
   * Worked back from what the shot has to *contain* rather than set as a
   * distance: the visible half-width at distance d is d·tan(fov/2)·aspect, so
   * this is exactly the distance that holds `viewRadii` ball-radii of hill
   * either side of her, or `wantHalfWidth` while the ball is still small.
   *
   * Doing it from the lens rather than by looking through it matters. A camera
   * that measures what it can see and then moves is a feedback loop — once it
   * has retreated the measurement says it needn't have — and the answer flips
   * between two values every frame.
   *
   * It is why the descent needs no separate pull-back for phones: a narrow
   * screen simply needs a bigger number out of the same arithmetic.
   */
  private standoff(ctx: GameContext): number {
    const want = Math.max(K.wantHalfWidth, this.shown * K.viewRadii);
    const visible =
      Math.tan((ctx.cameraFov * Math.PI) / 360) *
      ctx.cameraAspect *
      K.edgeMargin;
    const need = want / Math.max(0.001, visible);
    const base = Math.hypot(K.camera.back, K.camera.up);
    return Math.max(1, need / base);
  }

  // ---- the bottom ---------------------------------------------------------

  private reachBottom(ctx: GameContext): void {
    if (this.radius < K.ball.target) {
      this.failed = true;
      this.phase = "done";
      ctx.hud.setCallout(null);
      return;
    }
    this.phase = "party";
    this.phaseTime = 0;
    this.bursts = 0;
    this.nextBurst = 0;
    ctx.hud.setCallout(
      this.bearCaught ? "The whole mountain, and the bear!" : "Look at it go!",
    );
  }

  /** Fireworks over the ball while it runs itself out on the flat. */
  private updateParty(dt: number, ctx: GameContext): void {
    // It is still moving, and slowing: a katamari that stopped dead the
    // instant the level ended would throw away every bit of weight it earned.
    // Slowly, so it gets right out onto the flat and rolls to a stop there
    // rather than stopping on the last few feet of the hill.
    this.speed = Math.max(0, this.speed - K.ball.gravity * 0.28 * dt);
    const travelled = this.speed * dt;
    this.rolled += travelled;
    this.roll(travelled, 0);
    this.place(ctx);
    this.camera(ctx, 0);

    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.bursts < K.finish.bursts) {
      this.nextBurst = K.finish.burstEvery;
      this.bursts++;
      this.hill.slope.localToWorld(
        tmp.set(
          this.rng.range(-18, 18),
          this.radius + this.hill.groundAt(this.rolled) + this.rng.range(6, 22),
          -this.rolled - this.rng.range(0, 40),
        ),
      );
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 30,
        speed: 12,
        spherical: 1,
        ttl: 1.8,
        size: 0.9,
      });
      ctx.audio.levelComplete();
    }
    if (this.bursts >= K.finish.bursts && this.speed <= 0.01) {
      this.phase = "sweep";
      this.phaseTime = 0;
      ctx.hud.setCallout(null);
    }
  }

  /** The closing shot: out and up, until the whole descent is in frame. */
  private updateSweep(ctx: GameContext): void {
    const t = ease(Math.min(1, this.phaseTime / K.finish.sweepTime));
    this.hill.slope.localToWorld(look.set(0, 0, -K.run * 0.55));
    this.hill.slope.localToWorld(
      tmp.set(
        0,
        this.radius + this.hill.groundAt(this.rolled) + 20 + t * 150,
        -this.rolled + 40 + t * 220,
      ),
    );
    eye.copy(tmp);
    ctx.setCameraCinematic(eye, look);
    if (t >= 1) {
      this.phase = "done";
      this.complete = true;
    }
  }
}
