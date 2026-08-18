import * as THREE from "three";
import {ASCENT as A, ASCENT_PALETTE as P} from "../config";
import {Rng} from "../core/rng";
import {aimInstruction} from "../core/pointerAim";
import {
  createFoeKit,
  Seeds,
  type Foe,
  type FoeKit,
} from "../entities/slopeFoes";
import {FIREWORK_PALETTE} from "../fx/particles";
import {createMountain, type Mountain} from "../render/geometry/mountain";
import {loadPreparedModel} from "../render/geometry/islandModels";
import frogUrl from "../assets/islands/mrfrog.glb";
import type {GameContext, Level} from "./level";

type Phase = "climbing" | "summit" | "sweep" | "done";

const tmp = new THREE.Vector3();
const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();

/**
 * What each thing throws out when it dies.
 *
 * Its own colours, so what burst is readable from the burst itself — a wasp
 * goes yellow and black, a rock goes grey, a can of pesticide throws its own
 * red and a cloud of the green it was spraying.
 */
const DEBRIS: Record<
  string,
  {colours: ReadonlyArray<number>; count: number; speed: number}
> = {
  rock: {colours: [P.rock, P.rockDark, P.slopeDark], count: 16, speed: 8},
  wasp: {colours: [P.wasp, P.waspDark], count: 14, speed: 9},
  frog: {colours: [P.frog, P.tongue], count: 18, speed: 8},
  can: {colours: [P.can, P.canDark, P.spray], count: 26, speed: 11},
  moss: {colours: [P.moss, P.mossGlow], count: 16, speed: 6},
  flower: {colours: [0xff6f9c, 0xffd84a], count: 22, speed: 8},
};

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 9 — Up the Mouldy Mountain.
 *
 * 1942, flown up a mountainside. She climbs at a fixed rate and everything
 * else comes down at her: rocks that tumble and bounce off the bumps, trains
 * of wasps, frogs that sit still and lash with their tongues, and cans of
 * pesticide that take some killing. Hold the screen and she spits seeds up the
 * hill; hover over a patch of glowing moss and she lifts it.
 *
 * Two things about how it is built.
 *
 * Everything is in *slope space* — x across the hill, -z up it, y off the
 * surface — inside one tilted group, so nothing here does trigonometry about
 * the mountain's pitch. See render/geometry/mountain.ts.
 *
 * And she is scripted: the level writes her position, because 1942 is not a
 * flight model. The stick says which way she is leaning and this moves her,
 * which is what makes the controls feel immediate at the pace the screen is
 * scrolling.
 */
export class AscentLevel implements Level {
  readonly name = "Up the Mountain";
  readonly completionTitle = "The summit!";
  readonly completionBody =
    "Snow, sky, and one enormous boulder. Nothing on that mountain stopped her.";
  readonly failTitle = "Down she goes";
  readonly failBody =
    "The mountain got the better of you that time. The moss you gathered is still yours. Another go?";

  /** There is one more level after this: the way back down. */
  readonly finishesGame = false;

  complete = false;
  failed = false;

  private mountain!: Mountain;
  private kit!: FoeKit;
  private seeds!: Seeds;
  private phase: Phase = "climbing";
  private phaseTime = 0;

  /** How far up the mountain she has come. The level's clock. */
  private climbed = 0;
  /** Where she is across the slope, and how far up it she has pushed. */
  private x = 0;
  /**
   * Positive is further up the mountain than the camera's own mark.
   *
   * Not the stick's own sign: forward on the stick is *negative* everywhere in
   * this game — the flight model reads `-stick.y` as forward — and taking it
   * at face value here flew her down the slope towards the camera and off the
   * bottom of the screen.
   */
  private ahead = 0;

  /** Which of the five weapons she is carrying; flowers raise it. */
  private weapon = 1;
  private health: number = A.health;
  private mercy = 0;
  private moss = 0;
  private sinceShot = 0;

  private readonly foes: Array<Foe> = [];
  /** Wasp trains still unbroken, by id, and how many of each are left. */
  private readonly trains = new Map<number, number>();
  private spawnedTo = 0;
  private nextTrain = 1;
  private rng = new Rng(0x9_04_17);

  /** Tongues and sprays in flight, drawn as one shaft each. */
  private readonly reaches: Array<{mesh: THREE.Mesh; foe: Foe}> = [];

  private bursts = 0;
  private nextBurst = 0;
  /** 0→1 as she climbs clear of the summit to her hover; see updateSummit. */
  private summitRise = 0;
  /** Where she was, in slope space, the instant she reached the top. */
  private readonly summitFrom = new THREE.Vector3();
  /** The forward limit, in units; see aheadLimit. */
  private limit: number = A.aheadLimit;
  /** False once the level is left, so a late model load doesn't touch the kit. */
  private alive = false;

  get controlsLocked(): boolean {
    return this.phase !== "climbing";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("mountain");
    this.rng = new Rng(0x9_04_17);
    this.mountain = createMountain(this.rng);
    ctx.mountain.add(this.mountain.group);

    this.kit = createFoeKit();
    this.seeds = new Seeds();
    this.mountain.slope.add(this.seeds.group);

    // The frog is a model, not a hand-built shape. It comes down asynchronously
    // and swaps into the kit when it lands — frogs spawned before then wear the
    // hand-built fallback, the same graceful swap the islands use. See
    // islandModels.loadPreparedModel and slopeFoes.frogGeometry.
    this.alive = true;
    void loadPreparedModel(frogUrl, A.frog.model.length, A.frog.model.yaw)
      .then(geo => {
        if (!this.alive) {
          geo.dispose();
          return;
        }
        this.kit.frog.dispose();
        this.kit.frog = geo;
      })
      .catch(() => {
        // The hand-built frog is already in the kit and will do.
      });

    this.foes.length = 0;
    this.reaches.length = 0;
    this.trains.clear();
    this.spawnedTo = 0;
    this.nextTrain = 1;
    this.climbed = 0;
    this.x = 0;
    this.ahead = 0;
    this.weapon = 1;
    this.health = A.health;
    this.mercy = 0;
    this.moss = 0;
    this.sinceShot = 0;
    this.phase = "climbing";
    this.phaseTime = 0;
    this.complete = false;
    this.failed = false;
    this.bursts = 0;
    this.nextBurst = 0;

    // Laid out now rather than as she climbs: where the upgrades are is the
    // level's shape, and the whole mountain's worth is eight flowers.
    this.plantFlowers();

    ctx.configureFlight({
      boundsRadius: 4000,
      minHeight: 0,
      maxHeight: 60,
      cameraDistance: A.camera.back,
      cameraHeight: A.camera.up,
    });
    // She is placed by hand every frame; the flight model never sees her.
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);
    /*
     * Nothing on the glass at all.
     *
     * She goes where the finger is — see `steer` — which leaves no stick to
     * plant, no slider to reach for and no button to miss. It also settles
     * what fires her seeds: she fires by herself, the whole way up. A trigger
     * would have to be a second finger or a held mouse button on top of the
     * steering, and neither is something to ask of a child playing this.
     */
    ctx.setFlightControls(false);
    ctx.aim.reset();
    // Bigger than she is in the meadow: the camera stands thirty units off
    // her here, and at her ordinary size she is a speck in her own level.
    ctx.bee.setScale(A.beeScale);
    this.placeBee(ctx);

    ctx.hud.setBanner(this.name);
    ctx.hud.setObjective("Up the mountain! She follows your finger.");
    ctx.hud.setCounters([
      {
        key: "moss",
        label: "Moss",
        color: P.moss,
        value: 0,
        target: A.moss.needed,
      },
    ]);
    ctx.hud.setHealth(1);
    ctx.hud.setCallout(aimInstruction());
  }

  exit(ctx: GameContext): void {
    this.alive = false;
    ctx.hud.setCallout(null);
    ctx.hud.setHealth(null);
    ctx.mountain.remove(this.mountain.group);
    this.mountain.dispose();
    this.seeds.dispose();
    this.kit.dispose();
    ctx.bee.scripted = false;
    ctx.bee.setCrown(false);
    ctx.bee.setScale(1);
  }

  resumeAfterCompletion(): void {
    // The summit is the end of the mountain; there is nothing to re-arm.
  }

  /** Another go, from the bottom, but the moss she gathered is hers. */
  retry(ctx: GameContext): void {
    const kept = this.moss;
    this.exit(ctx);
    this.enter(ctx);
    this.moss = kept;
    ctx.hud.setCount("moss", this.moss, A.moss.needed);
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    this.mountain.update(dt, this.climbed);

    switch (this.phase) {
      case "climbing":
        this.updateClimbing(dt, ctx);
        break;
      case "summit":
        this.updateSummit(dt, ctx);
        break;
      case "sweep":
        this.updateSweep(ctx);
        break;
      case "done":
        break;
    }
  }

  // ---- the climb ----------------------------------------------------------

  private updateClimbing(dt: number, ctx: GameContext): void {
    this.climbed += A.climbSpeed * dt;
    this.mercy = Math.max(0, this.mercy - dt);

    this.steer(dt, ctx);

    // She fires the whole way up; which weapon she is carrying decides what
    // comes out. See ASCENT.weapon.
    this.sinceShot += dt;
    const rate = A.seed.every / A.weapon.rate[this.weapon - 1];
    if (this.sinceShot >= rate) {
      this.sinceShot = 0;
      this.volley();
      ctx.audio.collect(0);
    }

    this.spawn();
    this.updateFoes(dt, ctx);
    this.seeds.update(dt, (x, z) => this.shoot(x, z, ctx));
    this.camera(ctx);

    if (this.climbed >= A.climb) {
      this.reachSummit(ctx);
    }
  }

  /**
   * Fly her to the finger.
   *
   * Two halves. Where the pointer is pointing has to be turned into a place on
   * the mountain, which `aimTarget` does; and then she is *walked* towards it
   * at her own speed rather than put there. The second half is what makes the
   * control feel like a bee and not a cursor — flick the finger across the
   * screen and she comes after it, arriving a moment later.
   *
   * With no pointer yet — a laptop nobody has touched the mouse on, or the
   * first frame of the level — she simply holds still. The alternative is
   * assuming the middle of the screen, which drags her off her mark before the
   * player has done anything at all.
   */
  private steer(dt: number, ctx: GameContext): void {
    const across = this.acrossLimit(ctx);
    const forward = this.aheadLimit(ctx);
    // What the foes are laid out against is a single half-width; take the
    // narrower side so nothing is placed off the edge she can't reach.
    this.playHalf = Math.min(across.left, across.right);

    if (ctx.aim.active) {
      const want = this.aimTarget(ctx, ctx.aim.x, ctx.aim.y + A.pointer.lead);
      const dx =
        THREE.MathUtils.clamp(want.x, -across.left, across.right) - this.x;
      const dz =
        THREE.MathUtils.clamp(want.y, -A.behindLimit, forward) - this.ahead;
      const gap = Math.hypot(dx, dz);
      const step = A.moveSpeed * dt;
      if (gap <= step || gap === 0) {
        this.x += dx;
        this.ahead += dz;
      } else {
        this.x += (dx / gap) * step;
        this.ahead += (dz / gap) * step;
      }
    }

    // The limits still apply when she isn't being steered: the screen changes
    // shape under her when a phone is turned, and the mark she is measured
    // against moves up the mountain every frame regardless.
    this.x = THREE.MathUtils.clamp(this.x, -across.left, across.right);
    this.ahead = THREE.MathUtils.clamp(this.ahead, -A.behindLimit, forward);
    this.placeBee(ctx);
  }

  /**
   * Where on the slope a point on the screen is — in her two coordinates,
   * across and ahead.
   *
   * Solved rather than unprojected. Unprojecting a screen point gives a ray,
   * and turning that ray into a place on the mountain means intersecting it
   * with the plane she flies in, which is a tilted plane in another group's
   * space: three or four transforms to keep straight, and every one of them a
   * chance to get the mountain's pitch backwards, which has happened here
   * before.
   *
   * Instead this asks the question the level can already answer — where does
   * *this* point on the slope land on the screen? — and inverts it
   * numerically. The map from (across, ahead) to screen is smooth and, over
   * the few units she can be from her mark, near enough linear, so two
   * Newton steps on a measured 2×2 Jacobian land within a fraction of a unit.
   * Nine projections a frame, and it cannot be wrong about the geometry
   * because it never assumes any.
   */
  private aimTarget(
    ctx: GameContext,
    ndcX: number,
    ndcY: number,
  ): {x: number; y: number} {
    /** A half-unit probe, big enough to measure and small enough to be local. */
    const h = 0.5;
    let x = this.x;
    let ahead = this.ahead;

    for (let step = 0; step < 2; step++) {
      const at = this.screenOf(ctx, x, ahead);
      const ex = ndcX - at.x;
      const ey = ndcY - at.y;
      const byX = this.screenOf(ctx, x + h, ahead);
      const byA = this.screenOf(ctx, x, ahead + h);
      // Columns of the Jacobian: how the screen point moves per unit of each.
      const a = (byX.x - at.x) / h;
      const b = (byA.x - at.x) / h;
      const c = (byX.y - at.y) / h;
      const d = (byA.y - at.y) / h;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-6) {
        break;
      }
      x += (ex * d - ey * b) / det;
      ahead += (a * ey - c * ex) / det;
      // Kept in the neighbourhood the linearisation is good for; the clamp in
      // `steer` is the one that decides where she may actually be.
      x = THREE.MathUtils.clamp(x, -A.halfWidth, A.halfWidth);
      ahead = THREE.MathUtils.clamp(ahead, -A.behindLimit * 2, 60);
    }
    return {x, y: ahead};
  }

  /** Where a place on the slope lands on the screen, in NDC. */
  private screenOf(
    ctx: GameContext,
    x: number,
    ahead: number,
  ): {x: number; y: number} {
    tmp.set(x, A.flightHeight, -(this.climbed + ahead));
    this.mountain.slope.localToWorld(tmp);
    const p = ctx.projectToScreen(tmp);
    return {x: p.x, y: p.y};
  }

  /**
   * How far the camera has to retreat for a playable width to be visible.
   *
   * One number, worked out from the camera's own projection rather than from
   * the aspect ratio directly, so it stays right whatever else changes about
   * the shot. Capped, because a camera far enough back to fit the whole strip
   * on a phone would draw the bee as a speck.
   */
  private pullBack(ctx: GameContext): number {
    /*
     * Worked out from the lens rather than by looking through it.
     *
     * Measuring the live camera and then moving it is a feedback loop: once it
     * has pulled back the measurement says it no longer needs to, and the
     * answer flips between the two every frame. Caching the first measurement
     * is no better — on the frame a level starts, the camera is still wherever
     * the last one left it.
     *
     * So: the visible half-width at distance d is d·tan(fov/2)·aspect, and the
     * distance scales with the pull-back. Rearranged, this is exactly the
     * factor that brings `wantHalfWidth` inside the screen's margin. It is 1
     * on an iPad and about two on a phone held upright.
     */
    const camera = this.standingDistance();
    const halfHeight = Math.tan((ctx.cameraFov * Math.PI) / 360);
    const visible = camera * halfHeight * ctx.cameraAspect * A.edgeMargin;
    return Math.min(
      A.camera.pullBack,
      Math.max(1, A.wantHalfWidth / Math.max(0.001, visible)),
    );
  }

  /** How far the camera stands from her at the standard distance. */
  private standingDistance(): number {
    return Math.hypot(A.camera.back, A.camera.up);
  }

  /**
   * How far across she may fly, in units — which is the edge of the screen.
   *
   * Measured, for the same reason and in the same way as the forward limit,
   * and unlike that one this *does* change with the shape of the screen: the
   * strip is twenty-six units either side of the middle and a phone held
   * upright shows nothing like that, so she flew straight off the side of the
   * glass and out of sight. Kept a little inside the edge, so she is never
   * half-cropped either.
   *
   * The two sides are measured separately, because the camera pans with her
   * (`this.x * 0.35` in `camera`). Measured on one side only and mirrored, the
   * pan made the range lopsided: sitting on the left, the camera has swung
   * left, so the *right* edge is far out in world x and the left edge is close
   * — and a single number taken off the right side then clamped the left to
   * that same far figure, leaving her unable to reach the left edge at all.
   */
  private acrossLimit(ctx: GameContext): {left: number; right: number} {
    return {left: this.edgeReach(ctx, -1), right: this.edgeReach(ctx, 1)};
  }

  /** Units she can travel one way — `dir` +1 to the right, -1 to the left. */
  private edgeReach(ctx: GameContext, dir: number): number {
    let limit = 4;
    for (let out = 4; out <= A.halfWidth; out += 0.5) {
      tmp.set(dir * out, A.flightHeight, this.slopeZ());
      this.mountain.slope.localToWorld(tmp);
      if (Math.abs(ctx.projectToScreen(tmp).x) > A.edgeMargin) {
        break;
      }
      limit = out;
    }
    return limit;
  }

  /**
   * How far up the slope she may fly, in units — which is half the screen.
   *
   * Measured rather than guessed: the rule is a screen rule ("she may not pass
   * the middle") and the answer has to be in world units, so it is found by
   * asking the camera where a few candidate distances actually land.
   *
   * Worked out every frame rather than cached. It costs a few dozen
   * projections and it is always right: cached on the first frame it was
   * measured against a camera that had not yet moved into position, and the
   * answer was whatever the fallback happened to be.
   *
   * It does not vary with the shape of the screen, which is worth knowing
   * before anyone tries to make it: three's field of view is the *vertical*
   * one, so where the middle of the screen falls on the slope is the same on a
   * wide iPad as on a tall phone — measured at aspects from 0.55 to 2.2, it is
   * 18.5 units in every one of them.
   */
  private aheadLimit(ctx: GameContext): number {
    this.limit = A.aheadLimit;
    // Walk out from her in half-unit steps and stop at the last one still in
    // the bottom half of the screen.
    for (let ahead = 0; ahead <= 60; ahead += 0.5) {
      tmp.set(this.x, A.flightHeight, -(this.climbed + ahead));
      this.mountain.slope.localToWorld(tmp);
      // Normalised device coordinates: +1 is the top of the screen, 0 the
      // middle. A bee at the middle is exactly the limit.
      if (ctx.projectToScreen(tmp).y >= 0) {
        break;
      }
      this.limit = ahead;
    }
    return this.limit;
  }

  /**
   * One pull of the trigger, in whichever shape this weapon fires.
   *
   * Two parallel streams, three in a fan, or one that chases — the numbers are
   * a table in ASCENT.weapon, so what each level does is one line to read
   * rather than a branch to follow.
   */
  private volley(): void {
    const level = this.weapon - 1;
    const nose = this.slopeZ() - 1.5;
    const streams = A.weapon.streams[level];
    const homing = this.weapon >= A.weapon.homingFrom;

    if (streams === 2) {
      // Two side by side: straight at level 3, and chasing at level 5.
      const left = homing ? this.acquire() : null;
      // The right-hand one takes a different target where there is one, so a
      // pair of chasers spreads across the hill instead of both piling into
      // the same wasp and leaving the one beside it alone.
      const right = homing ? this.acquire(left) : null;
      this.seeds.fire(this.x - A.weapon.apart / 2, nose, 0, left);
      this.seeds.fire(this.x + A.weapon.apart / 2, nose, 0, right ?? left);
      return;
    }
    if (streams === 3) {
      // Level 4: one up the middle and two leaning out, covering a triangle.
      this.seeds.fire(this.x, nose);
      this.seeds.fire(this.x, nose, -A.weapon.angle);
      this.seeds.fire(this.x, nose, A.weapon.angle);
      return;
    }
    this.seeds.fire(this.x, nose, 0, homing ? this.acquire() : null);
  }

  /**
   * Something for a chasing seed to follow.
   *
   * The nearest thing up the slope that can actually be killed — never moss or
   * a flower, which are hers, and never something behind her, which would send
   * the seed back down the mountain past her own ear.
   */
  private acquire(except: Foe | null = null): Foe | null {
    const from = this.slopeZ();
    let best: Foe | null = null;
    let bestD: number = A.weapon.homingRange;
    for (const foe of this.foes) {
      if (foe.dead || foe === except) {
        continue;
      }
      if (foe.kind === "moss" || foe.kind === "flower") {
        continue;
      }
      if (foe.z > from) {
        continue;
      }
      const d = Math.hypot(foe.x - this.x, foe.z - from);
      if (d < bestD) {
        bestD = d;
        best = foe;
      }
    }
    return best;
  }

  /** Where she is up the mountain, in the slope's own z. */
  private slopeZ(): number {
    return -(this.climbed + this.ahead);
  }

  private placeBee(ctx: GameContext): void {
    tmp.set(this.x, this.flightY(this.x, this.ahead), this.slopeZ());
    this.mountain.slope.localToWorld(tmp);
    ctx.bee.teleport(tmp);
    // Facing up the hill, tipped with the slope.
    ctx.bee.setYaw(Math.PI);
  }

  /**
   * How high off the slope she flies at a point — her ordinary flight height,
   * except where the summit rises past it, where she lifts to stay clear of
   * it. Continuous, so the final approach is a smooth crest rather than a
   * step: the moment the cap or the boulder is taller than her flight height
   * she starts rising, and the arrival dance carries on from there.
   */
  private flightY(x: number, ahead: number): number {
    const crest = this.mountain.crestAt(x, -(this.climbed + ahead));
    return Math.max(A.flightHeight, crest + A.summit.clearance);
  }

  /** Behind her and above, looking up the mountain. */
  private camera(ctx: GameContext): void {
    // Far enough back that a playable width of mountain is on the screen; see
    // pullBack, which is 1 on an iPad and retreats on a phone.
    const zoom = this.pullBack(ctx);
    tmp.set(
      this.x * 0.35,
      A.flightHeight,
      -this.climbed + A.camera.back * zoom,
    );
    this.mountain.slope.localToWorld(tmp);
    eye.copy(tmp);
    eye.y += A.camera.up * zoom;
    tmp.set(this.x * 0.35, 0, -(this.climbed + 34 * zoom));
    this.mountain.slope.localToWorld(tmp);
    look.copy(tmp);
    ctx.setCameraCinematic(eye, look);
  }

  /**
   * The hold on the dancing bee at the top.
   *
   * The climb camera looks at the slope (y=0); she is now hovering well above
   * it, so the look is lifted toward the perch to keep her centred rather than
   * clipped off the top of the screen while she dances.
   */
  private summitCamera(ctx: GameContext): void {
    const zoom = this.pullBack(ctx);
    tmp.set(0, A.flightHeight, -this.climbed + A.camera.back * zoom);
    this.mountain.slope.localToWorld(tmp);
    eye.copy(tmp);
    eye.y += A.camera.up * zoom;
    tmp.set(0, A.summit.perchY * 0.7, -(A.climb + 34 * zoom));
    this.mountain.slope.localToWorld(tmp);
    look.copy(tmp);
    ctx.setCameraCinematic(eye, look);
  }

  // ---- what is on the mountain -------------------------------------------

  /**
   * Stock the slope ahead of her.
   *
   * Seeded by how far up she has come rather than by a clock, so the mountain
   * is the same mountain however fast she flies it — and so the numbers in
   * ASCENT.perHundred mean what they say.
   */
  private spawn(): void {
    const ahead = this.climbed + 190;
    while (this.spawnedTo < ahead && this.spawnedTo < A.climb - 40) {
      const from = this.spawnedTo;
      this.spawnedTo += 100;
      const at = (n: number) => Math.round(n + this.rng.range(-0.4, 0.6));
      /*
       * How hard this stretch of mountain is.
       *
       * Applied to the hazards only, and to how many rather than to what they
       * do: a rock that hits for less is a rock that lies about itself, but a
       * mountain with fewer of them on it is simply a gentler mountain. The
       * flowers and the moss keep their own numbers — thinning the rewards at
       * the bottom would take her weapon away exactly when she is learning
       * the controls, which is the opposite of easier.
       */
      const hard = this.difficulty(from);
      for (let i = 0; i < at(A.perHundred.rocks * hard); i++) {
        this.addRock(from);
      }
      for (let i = 0; i < at(A.perHundred.waspTrains * hard); i++) {
        this.addTrain(from);
      }
      for (let i = 0; i < at(A.perHundred.frogs * hard); i++) {
        this.addFrog(from);
      }
      for (let i = 0; i < at(A.perHundred.moss); i++) {
        this.addMoss(from);
      }
      for (let i = 0; i < at(A.perHundred.cans * hard); i++) {
        this.addCan(from);
      }
    }
  }

  /**
   * How busy the mountain is this far up it: 0.4 at the foot, 1 at the summit.
   *
   * Squared on the way up, so the easy part is not a brief formality at the
   * start but most of the first half — the curve is still under two thirds at
   * the halfway mark and only steepens near the top, which is where the
   * weapon she has been collecting flowers for is meant to start earning
   * itself.
   */
  private difficulty(upTo: number): number {
    const t = THREE.MathUtils.clamp(upTo / A.climb, 0, 1);
    return A.ramp.from + (A.ramp.to - A.ramp.from) * t * t;
  }

  /**
   * How many hits a thing spawned at `from` takes, given its base cost.
   *
   * One at the foot, up to ASCENT.toughness.to of its base at the summit, on
   * the same squared curve as the density — so the reach of the upgraded seed
   * meets something that can stand up to it near the top. Rounded and never
   * below its base, so nothing is ever *easier* than the number that defines
   * it.
   */
  private toughen(base: number, from: number): number {
    const t = THREE.MathUtils.clamp(from / A.climb, 0, 1);
    return Math.max(
      base,
      Math.round(base * (1 + (A.toughness.to - 1) * t * t)),
    );
  }

  private place(foe: Foe, geo: THREE.BufferGeometry, scale = 1): Foe {
    const mesh = new THREE.Mesh(geo, this.kit.material);
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    foe.group.add(mesh);
    foe.group.position.set(foe.x, 0, foe.z);
    this.mountain.slope.add(foe.group);
    this.foes.push(foe);
    return foe;
  }

  /**
   * Somewhere across the slope to put something.
   *
   * Inside the width she can actually see and reach, not the width of the
   * mountain: a rock that tumbles down eight units off the side of the screen
   * is not an obstacle, it is a waste of a rock.
   */
  private acrossSlope(): number {
    const half = Math.max(6, this.playHalf);
    return this.rng.range(-half, half);
  }

  /** The half-width being played, kept up to date by the camera each frame. */
  private playHalf: number = A.wantHalfWidth;

  private addRock(from: number): void {
    const size = Math.floor(this.rng.range(0, A.rock.sizes.length));
    const radius = A.rock.sizes[size];
    this.place(
      {
        kind: "rock",
        group: new THREE.Group(),
        x: this.acrossSlope(),
        z: -(from + this.rng.range(60, 190)),
        radius,
        hits: this.toughen(A.rock.hits[size], from),
        dead: false,
        speed: this.rng.range(A.rock.speed[0], A.rock.speed[1]),
        lift: 0,
        rise: 0,
      },
      this.kit.rock,
      radius,
    );
  }

  private addTrain(from: number): void {
    const id = this.nextTrain++;
    const count = Math.round(
      this.rng.range(A.wasp.perTrain[0], A.wasp.perTrain[1]),
    );
    this.trains.set(id, count);
    // Each train flies its own shape across the slope as it comes down.
    const lane = this.acrossSlope();
    const sway = this.rng.range(6, 14);
    const wavelength = this.rng.range(18, 34);
    for (let i = 0; i < count; i++) {
      const z = -(from + this.rng.range(120, 190)) - i * A.wasp.spacing;
      const foe = this.place(
        {
          kind: "wasp",
          group: new THREE.Group(),
          x: lane,
          z,
          // The body is drawn bigger, so what she has to fly around is too.
          radius: 1.1 * A.wasp.scale,
          hits: this.toughen(A.wasp.hits, from),
          dead: false,
          train: id,
          speed: A.wasp.speed,
        },
        this.kit.wasp,
        A.wasp.scale,
      );
      // Remembered on the group, so every wasp in a train flies the same
      // curve a beat apart — which is what makes it read as a formation.
      foe.group.userData.sway = sway;
      foe.group.userData.wavelength = wavelength;
      foe.group.userData.lane = lane;
    }
  }

  private addFrog(from: number): void {
    this.place(
      {
        kind: "frog",
        group: new THREE.Group(),
        x: this.acrossSlope(),
        z: -(from + this.rng.range(80, 190)),
        radius: 2,
        hits: this.toughen(A.frog.hits, from),
        dead: false,
        next: this.rng.range(A.frog.every[0], A.frog.every[1]),
        firing: 0,
      },
      this.kit.frog,
    );
  }

  private addCan(from: number): void {
    this.place(
      {
        kind: "can",
        group: new THREE.Group(),
        x: this.acrossSlope(),
        z: -(from + this.rng.range(90, 190)),
        radius: 2.2,
        // Not toughened with altitude like the rest: the can is already the
        // tank of the mountain at nine hits, and scaling that up the climb
        // makes a damage sponge rather than a harder shot.
        hits: A.pesticide.hits,
        dead: false,
        next: this.rng.range(A.pesticide.every[0], A.pesticide.every[1]),
        firing: 0,
      },
      this.kit.can,
    );
  }

  private addMoss(from: number): void {
    this.place(
      {
        kind: "moss",
        group: new THREE.Group(),
        x: this.acrossSlope(),
        z: -(from + this.rng.range(70, 190)),
        radius: A.moss.radius,
        hits: 0,
        dead: false,
        picked: 0,
      },
      this.kit.moss,
    );
  }

  /**
   * Lay out every flower on the mountain, once, at the start.
   *
   * Placed rather than scattered, because which weapon she is carrying when
   * is the shape of the level and not something to leave to a per-hundred
   * rate. Each band carries a cap, so two flowers from the same band are
   * still only one upgrade — see ASCENT.flower.
   */
  private plantFlowers(): void {
    A.flower.bands.forEach((band, i) => {
      for (let c = 0; c < A.flower.chances; c++) {
        const at = band + (A.flower.spread * (c + 0.5)) / A.flower.chances;
        const up = A.climb * at + this.rng.range(-20, 20);
        this.place(
          {
            kind: "flower",
            group: new THREE.Group(),
            x: this.rng.range(-A.wantHalfWidth, A.wantHalfWidth),
            z: -up,
            radius: 2.6,
            hits: 0,
            dead: false,
            cap: i + 2,
          },
          this.kit.flower,
        );
      }
    });
  }

  // ---- moving them --------------------------------------------------------

  private updateFoes(dt: number, ctx: GameContext): void {
    const beeZ = this.slopeZ();
    for (let i = this.foes.length - 1; i >= 0; i--) {
      const foe = this.foes[i];
      if (foe.dead) {
        continue;
      }
      switch (foe.kind) {
        case "rock":
          this.tumble(foe, dt);
          break;
        case "wasp":
          this.flyWasp(foe, dt);
          break;
        case "frog":
        case "can":
          this.reach(foe, dt, ctx);
          break;
        case "moss":
          this.pick(foe, dt, ctx);
          break;
        case "flower":
          this.takeFlower(foe, ctx);
          break;
      }

      // Anything that has gone past her, behind the camera, is finished with.
      if (foe.z > beeZ + A.camera.back + 30) {
        this.retire(foe);
        this.foes.splice(i, 1);
        continue;
      }
      // Moss and flowers are hers to collect, not hazards — takeFlower and
      // pick handle them above. Without this a flower upgrades her weapon and
      // docks her health on the same frame she touches it.
      const hers = foe.kind === "moss" || foe.kind === "flower";
      if (!hers && this.touching(foe, ctx)) {
        this.hurt(ctx, foe.kind === "rock" ? A.damage.rock : A.damage.wasp);
        if (foe.kind === "wasp") {
          // A wasp that flies into her is spent.
          this.kill(foe, ctx, false);
        }
      }
    }
  }

  /** Down the hill, bouncing over anything in the way. */
  private tumble(foe: Foe, dt: number): void {
    foe.z += (foe.speed ?? 0) * dt;
    foe.rise = (foe.rise ?? 0) - A.rock.gravity * dt;
    foe.lift = Math.max(0, (foe.lift ?? 0) + (foe.rise ?? 0) * dt);
    if ((foe.lift ?? 0) <= 0) {
      foe.rise = 0;
      // On the ground: does it meet a bump?
      for (const bump of this.mountain.bumps) {
        if (
          Math.hypot(foe.x - bump.x, foe.z - bump.z) <
          bump.radius + foe.radius * 0.5
        ) {
          foe.rise = A.rock.bounce;
          foe.lift = 0.01;
          foe.speed = (foe.speed ?? 0) * A.rock.bounceCost;
          break;
        }
      }
    }
    foe.group.position.set(foe.x, foe.radius + (foe.lift ?? 0), foe.z);
    // Rolling: it turns about the axis across its own travel.
    foe.group.rotation.x += ((foe.speed ?? 0) / foe.radius) * dt;
  }

  /** Wasps fly their train's curve down the slope. */
  private flyWasp(foe: Foe, dt: number): void {
    foe.z += (foe.speed ?? 0) * dt;
    const {sway = 0, wavelength = 24, lane = 0} = foe.group.userData;
    foe.x = THREE.MathUtils.clamp(
      lane + Math.sin((foe.z / wavelength) * Math.PI) * sway,
      -A.halfWidth,
      A.halfWidth,
    );
    foe.group.position.set(foe.x, A.flightHeight, foe.z);
  }

  /** Frogs and cans stand still and reach down the hill for her. */
  private reach(foe: Foe, dt: number, ctx: GameContext): void {
    foe.group.position.set(foe.x, 0, foe.z);
    const isFrog = foe.kind === "frog";
    const spec = isFrog ? A.frog : A.pesticide;
    const beeZ = this.slopeZ();
    const inRange = beeZ > foe.z && beeZ - foe.z < spec.reach;

    if ((foe.firing ?? 0) > 0) {
      foe.firing = (foe.firing ?? 0) - dt;
      // Never drawn further than it reaches. The tongue used to be drawn to
      // wherever she was, however far that was, which is why a frog read as
      // having a laser rather than a tongue.
      const length = isFrog
        ? Math.min(spec.reach, Math.max(2, beeZ - foe.z))
        : // The gas billows out over the first part of the spray and then
          // hangs there for the rest of it.
          A.pesticide.reach *
          Math.min(1, 1 - (foe.firing ?? 0) / A.pesticide.sprayTime + 0.25);
      this.showReach(foe, length, isFrog);
      // Anything in the shaft is hit, once, on the frame it lands.
      // Only what the attack actually covers: within its width of the line,
      // below it on the slope, and inside the length it has reached by now.
      const across = Math.abs(this.x - foe.x);
      const hitWidth = isFrog ? A.frog.aim : A.pesticide.width;
      const down = beeZ - foe.z;
      if (across < hitWidth && down > 0 && down < length) {
        this.hurt(ctx, isFrog ? A.damage.tongue : A.damage.spray);
      }
      if ((foe.firing ?? 0) <= 0) {
        this.hideReach(foe);
        foe.next = this.rng.range(spec.every[0], spec.every[1]);
      }
      return;
    }

    foe.next = (foe.next ?? 0) - dt;
    if ((foe.next ?? 0) <= 0 && inRange) {
      // Only if she is somewhere near its line; a tongue thrown sideways at
      // nothing is a tongue you never learn to dodge.
      if (
        Math.abs(this.x - foe.x) <
        (isFrog ? A.frog.aim * 2.4 : A.pesticide.width * 3)
      ) {
        foe.firing = isFrog ? A.frog.lashTime : A.pesticide.sprayTime;
      } else {
        foe.next = this.rng.range(spec.every[0], spec.every[1]);
      }
    }
  }

  private showReach(foe: Foe, length: number, isFrog: boolean): void {
    let entry = this.reaches.find(r => r.foe === foe);
    if (!entry) {
      const mesh = new THREE.Mesh(
        isFrog ? this.kit.tongue : this.kit.spray,
        this.kit.material,
      );
      this.mountain.slope.add(mesh);
      entry = {mesh, foe};
      this.reaches.push(entry);
    }
    entry.mesh.visible = true;
    entry.mesh.position.set(foe.x, isFrog ? 1.6 : 3.2, foe.z);
    if (isFrog) {
      // A tongue: thin, and as long as it has reached.
      entry.mesh.scale.set(1, 1, Math.max(0.1, length));
      return;
    }
    // Gas: it swells sideways as well as forwards, and rolls as it goes, so
    // it reads as a cloud coming at you rather than a bar being extended.
    const grown = length / A.pesticide.reach;
    entry.mesh.scale.set(
      A.pesticide.width * (0.4 + grown * 0.6),
      2.2 + grown * 2.6,
      Math.max(0.1, length),
    );
    entry.mesh.rotation.z = this.phaseTime * 1.6;
  }

  private hideReach(foe: Foe): void {
    const entry = this.reaches.find(r => r.foe === foe);
    if (entry) {
      entry.mesh.visible = false;
    }
  }

  /** Moss is hovered over, like the meadow's flowers. */
  private pick(foe: Foe, dt: number, ctx: GameContext): void {
    foe.group.position.set(foe.x, 0.2, foe.z);
    // A glow that breathes, so it reads as the one thing here worth having.
    const pulse = 1 + Math.sin(this.phaseTime * 3 + foe.z) * 0.06;
    foe.group.scale.setScalar(pulse);
    const near =
      Math.hypot(this.x - foe.x, this.slopeZ() - foe.z) < A.moss.radius;
    if (!near) {
      foe.picked = Math.max(0, (foe.picked ?? 0) - dt);
      return;
    }
    foe.picked = (foe.picked ?? 0) + dt;
    ctx.hud.setHarvest(Math.min(1, (foe.picked ?? 0) / A.moss.dwell));
    if ((foe.picked ?? 0) >= A.moss.dwell) {
      this.moss++;
      ctx.hud.setCount("moss", this.moss, A.moss.needed, true);
      ctx.hud.setHarvest(0);
      ctx.audio.quotaComplete();
      this.mountain.slope.localToWorld(tmp.set(foe.x, 1, foe.z));
      ctx.puff.burst(tmp, {
        color: [P.moss, P.mossGlow],
        count: 16,
        speed: 6,
        ttl: 0.8,
      });
      this.kill(foe, ctx, false);
    }
  }

  /**
   * Flowers are taken by flying into them, not by hovering.
   *
   * Moss is the thing you go out of your way for and it costs you time; a
   * flower is a reward for being somewhere already, in the middle of a fight,
   * and stopping to hover over one would be the opposite of what it is for.
   */
  private takeFlower(foe: Foe, ctx: GameContext): void {
    foe.group.position.set(foe.x, 0, foe.z);
    // Turning and bobbing, because a still flower on a hillside of scenery is
    // scenery.
    foe.group.rotation.y += 0.02;
    foe.group.position.y = Math.sin(this.phaseTime * 2.4 + foe.z) * 0.25;
    if (Math.hypot(this.x - foe.x, this.slopeZ() - foe.z) > foe.radius) {
      return;
    }
    this.burst(ctx, foe, [0xff6f9c, 0xffd84a, P.mossGlow], 26, 9);
    this.kill(foe, ctx, false);
    const cap = Math.min(foe.cap ?? A.weapon.rate.length, A.weapon.rate.length);
    if (this.weapon >= cap) {
      // Already at the top: a flower is worth health instead, so it is never
      // a thing you are sorry to see.
      this.health = Math.min(A.health, this.health + 2);
      ctx.hud.setHealth(this.health / A.health);
      ctx.hud.setCallout("Patched up!");
    } else {
      this.weapon++;
      ctx.hud.setCallout(`Weapon ${this.weapon}!`);
    }
    ctx.audio.quotaComplete();
    window.setTimeout(() => ctx.hud.setCallout(null), 1200);
  }

  // ---- hitting and being hit ---------------------------------------------

  /** A seed has arrived somewhere: is anything there? */
  private shoot(x: number, z: number, ctx: GameContext): boolean {
    for (const foe of this.foes) {
      // The moss and the flowers are hers to collect, not to shoot. A flower
      // carries no hits, so before this it died to the first seed that touched
      // it — the weapon she was flying towards destroyed the thing that would
      // have upgraded it.
      if (foe.dead || foe.kind === "moss" || foe.kind === "flower") {
        continue;
      }
      if (Math.hypot(x - foe.x, z - foe.z) > foe.radius + A.seed.radius) {
        continue;
      }
      foe.hits -= A.seed.damage;
      if (foe.hits <= 0) {
        this.kill(foe, ctx, true);
      } else {
        // A flash of the surface, so a big rock reads as being worn down.
        foe.group.position.x += this.rng.range(-0.2, 0.2);
      }
      return true;
    }
    return false;
  }

  private kill(foe: Foe, ctx: GameContext, spark: boolean): void {
    foe.dead = true;
    foe.group.visible = false;
    this.hideReach(foe);
    if (spark) {
      // Everything that dies goes off in its own colours, and the bigger it
      // was the bigger the bang — a boulder bursting like a wasp reads as
      // nothing having happened. See DEBRIS.
      const kit = DEBRIS[foe.kind] ?? DEBRIS.rock;
      this.burst(ctx, foe, kit.colours, kit.count, kit.speed);
      ctx.audio.sting();
    }
    // The last wasp of a train pays for the whole train.
    if (foe.kind === "wasp" && foe.train !== undefined) {
      const left = (this.trains.get(foe.train) ?? 1) - 1;
      this.trains.set(foe.train, left);
      if (left === 0 && spark) {
        this.moss += A.wasp.trainBonus;
        ctx.hud.setCount("moss", this.moss, A.moss.needed, true);
        ctx.hud.setCallout("Whole swarm! Bonus moss!");
        window.setTimeout(() => ctx.hud.setCallout(null), 1400);
      }
    }
  }

  /** A little explosion where something was, in its own colours. */
  private burst(
    ctx: GameContext,
    foe: Foe,
    colours: ReadonlyArray<number>,
    count: number,
    speed: number,
  ): void {
    this.mountain.slope.localToWorld(
      tmp.set(foe.x, Math.max(1, foe.radius), foe.z),
    );
    // Scaled by how big the thing was, so a boulder throws more than a wasp.
    const size = Math.min(2.4, Math.max(0.8, foe.radius * 0.7));
    ctx.puff.burst(tmp, {
      color: colours,
      count: Math.round(count * size),
      speed: speed * (0.7 + size * 0.3),
      ttl: 0.55 + size * 0.2,
      size: size * 0.8,
      spherical: 0.8,
    });
  }

  private retire(foe: Foe): void {
    foe.group.removeFromParent();
    const entry = this.reaches.findIndex(r => r.foe === foe);
    if (entry >= 0) {
      this.reaches[entry].mesh.removeFromParent();
      this.reaches.splice(entry, 1);
    }
  }

  private touching(foe: Foe, ctx: GameContext): boolean {
    void ctx;
    const height =
      foe.kind === "rock" ? foe.radius + (foe.lift ?? 0) : A.flightHeight;
    if (Math.abs(height - A.flightHeight) > 3.5 && foe.kind === "rock") {
      // A rock in mid-bounce passes under her.
      return false;
    }
    return Math.hypot(this.x - foe.x, this.slopeZ() - foe.z) < foe.radius + 1.4;
  }

  private hurt(ctx: GameContext, amount: number): void {
    if (this.mercy > 0) {
      return;
    }
    this.mercy = A.invulnerable;
    this.health -= amount;
    ctx.hud.setHealth(Math.max(0, this.health / A.health));
    ctx.flashScreen();
    ctx.audio.sting();
    if (this.health <= 0) {
      this.phase = "done";
      this.failed = true;
    }
  }

  // ---- the summit ---------------------------------------------------------

  private reachSummit(ctx: GameContext): void {
    this.phase = "summit";
    this.phaseTime = 0;
    this.bursts = 0;
    this.nextBurst = 0;
    this.summitRise = 0;
    // Where she is the instant she tops out, so the hover eases up from there
    // rather than snapping to the perch. Her height is already lifted by the
    // crest on the way in, so read that rather than the flat flight height.
    this.summitFrom.set(
      this.x,
      this.flightY(this.x, this.ahead),
      this.slopeZ(),
    );
    ctx.hud.setCallout("The summit!");
    ctx.hud.setObjective("The top of the Mouldy Mountain!");
    fromEye.copy(ctx.cameraPosition);
    this.mountain.slope.localToWorld(fromLook.set(0, 4, -(A.climb + 26)));
  }

  private updateSummit(dt: number, ctx: GameContext): void {
    // She climbs clear of the snow cap — which has risen past her flight height
    // by now — and hovers over it, bobbing and twirling. Without this she sits
    // at flightHeight and is buried inside the summit dome, out of sight.
    this.summitRise = Math.min(1, this.summitRise + dt / A.summit.rise);
    const e = ease(this.summitRise);
    const t = this.phaseTime;
    // The dance rides in with the climb, so she doesn't jerk on the first frame.
    const bob = Math.sin(t * A.summit.danceRate) * A.summit.danceBob * e;
    const targetZ = -(A.climb + A.summit.perchFront);
    tmp.set(
      this.summitFrom.x + (0 - this.summitFrom.x) * e,
      this.summitFrom.y + (A.summit.perchY - this.summitFrom.y) * e + bob,
      this.summitFrom.z + (targetZ - this.summitFrom.z) * e,
    );
    this.mountain.slope.localToWorld(tmp);
    ctx.bee.teleport(tmp);
    // Facing the boulder, twirling side to side, nose up in delight.
    ctx.bee.setYaw(
      Math.PI +
        Math.sin(t * A.summit.danceRate * 1.3) * A.summit.danceSwing * e,
    );
    ctx.bee.setClimb(0.7 * e);
    this.summitCamera(ctx);

    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.bursts < A.summit.bursts) {
      this.nextBurst = A.summit.burstEvery;
      this.bursts++;
      this.mountain.slope.localToWorld(
        tmp.set(
          this.rng.range(-16, 16),
          this.rng.range(6, 20),
          -(A.climb + this.rng.range(6, 40)),
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
    if (this.bursts >= A.summit.bursts && this.nextBurst <= 0) {
      this.phase = "sweep";
      this.phaseTime = 0;
      ctx.hud.setCallout(null);
    }
  }

  /** The closing shot: out and up, until the whole mountain is in frame. */
  private updateSweep(ctx: GameContext): void {
    const t = ease(Math.min(1, this.phaseTime / A.summit.sweepTime));
    this.mountain.slope.localToWorld(look.set(0, 0, -(A.climb * 0.55)));
    // Round and back, so it reads as a camera leaving rather than a zoom.
    const angle = t * 1.1;
    eye.set(
      Math.sin(angle) * A.summit.sweepBack * t,
      20 + A.summit.sweepUp * t,
      Math.cos(angle) * A.summit.sweepBack * t + 40,
    );
    eye.z -= A.climb * 0.2 * t;
    ctx.setCameraCinematic(eye, look);
    if (t >= 1) {
      this.phase = "done";
      this.complete = true;
    }
  }
}
