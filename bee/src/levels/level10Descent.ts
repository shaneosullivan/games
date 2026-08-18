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
import {createBear} from "../render/geometry/bear";
import {createDescent, type Descent} from "../render/geometry/descent";
import {solidToon} from "../render/materials";
import type {GameContext, Level} from "./level";

type Phase = "opening" | "rolling" | "party" | "sweep" | "done";

/** One line of the KATAMARI.items table. */
interface ItemSpec {
  kind: RollKind;
  size: readonly [number, number];
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
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const axis = new THREE.Vector3();
const spin = new THREE.Quaternion();
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
  readonly failTitle = "Not quite big enough";
  readonly failBody =
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
  private caught = 0;
  private bearCaught = false;

  /** Where the queen is across the hill; she leads by a fixed distance. */
  private beeX = 0;
  private tether!: THREE.Mesh;

  private readonly items: Array<Item> = [];
  private spawnedTo = 0;
  /** How wide the play is on this screen, measured every frame. */
  private playHalf: number = K.wantHalfWidth;

  /**
   * Whether the "slide your finger" card is still up.
   *
   * It goes the moment they do it, or after a few seconds if they don't. A
   * card in the middle of the screen is worth having on the first go and is
   * in the way on every one after it, and the player themselves is the only
   * reliable signal for which of those this is.
   */
  private bursts = 0;
  private nextBurst = 0;
  private shake = 0;

  get controlsLocked(): boolean {
    return this.phase !== "rolling";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("mountain");
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
    this.eaten = 0;
    this.caught = 0;
    this.bearCaught = false;
    this.bursts = 0;
    this.nextBurst = 0;
    this.shake = 0;
    this.phase = "opening";
    this.phaseTime = 0;
    this.complete = false;
    this.failed = false;

    this.addBear();

    ctx.configureFlight({
      boundsRadius: 4000,
      minHeight: 0,
      maxHeight: 60,
      cameraDistance: K.camera.back,
      cameraHeight: K.camera.up,
    });
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);
    ctx.bee.setScale(1.3);
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
    const across = this.acrossLimit(ctx);
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
      const step = K.bee.speed * dt;
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
    this.x = THREE.MathUtils.clamp(
      this.x + this.drift * dt,
      -K.halfWidth + this.radius,
      K.halfWidth - this.radius,
    );
    const travelled = this.speed * dt;
    this.rolled += travelled;

    this.roll(travelled, this.drift * dt);
    this.spawn();
    this.collide(dt, ctx);
    this.place(ctx);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.camera(ctx, 0);
    ctx.hud.setProgress("Ball", this.progress());

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
    spin.setFromAxisAngle(axis, dist / this.radius);
    this.ballSpin.quaternion.premultiply(spin);
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
        const z = from + this.rng.range(30, 130);
        if (z > K.run - 30) {
          continue;
        }
        this.addItem(z);
      }
    }
  }

  private addItem(down: number): void {
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
     * How big this one is, from how far down the hill it lies.
     *
     * The band is jittered by a fifth either way, so the hill isn't sorted:
     * a run of items that all grow in lockstep gives the player nothing to
     * read, whereas one unusually big goat among small ones is a decision.
     */
    const t = THREE.MathUtils.clamp(down / K.run, 0, 1);
    const size =
      (spec.size[0] + (spec.size[1] - spec.size[0]) * t) *
      this.rng.range(0.82, 1.18);

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
    const x = this.rng.range(-half, half);
    // Lifted by its own radius, because the shapes are built about their
    // centres — scaling one built standing on its feet would sink it.
    group.position.set(x, size * 0.92, -down);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    this.hill.slope.add(group);
    this.items.push({
      kind: spec.kind,
      group,
      x,
      z: -down,
      radius: size,
      stuck: false,
      shove: 0,
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

  // ---- eating and bouncing ------------------------------------------------

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
      const gap = Math.hypot(item.x - this.x, item.z - z);
      if (gap > item.radius + this.radius) {
        continue;
      }
      if (item.radius <= this.radius * K.ball.stickMargin) {
        this.stick(item, ctx);
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

    this.eaten += K.ball.growth * item.radius ** 3;
    this.radius = Math.cbrt(K.ball.start ** 3 + this.eaten);
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

  private progress(): number {
    return (this.radius - K.ball.start) / (K.ball.target - K.ball.start);
  }

  // ---- placing and framing ------------------------------------------------

  /** Put the ball, the queen and the line between them where they belong. */
  private place(ctx: GameContext): void {
    this.ballRoot.position.set(this.x, this.radius, -this.rolled);
    this.core.scale.setScalar(this.radius);

    // She flies ahead of the ball, clear of it by its own radius, so she is
    // never inside the thing she is towing however big it gets.
    const beeZ = -this.rolled - (K.bee.ahead + this.radius);
    this.hill.slope.localToWorld(
      tmp.set(this.beeX, K.bee.height + this.radius * 0.4, beeZ),
    );
    ctx.bee.teleport(tmp);
    ctx.bee.setYaw(Math.PI);

    // The tether: a cylinder is built along its own y, so it is stood between
    // the two points by pointing its axis at one of them.
    tmp.set(this.beeX, K.bee.height + this.radius * 0.4, beeZ);
    tmp2.set(this.x, this.radius, -this.rolled);
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
    for (let out = 5; out <= K.halfWidth; out += 0.5) {
      this.hill.slope.localToWorld(
        tmp.set(out, K.bee.height, -this.rolled - K.bee.ahead),
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
      this.hill.slope.localToWorld(tmp.set(x, K.bee.height, z));
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
   * `lift` runs the opening shot: at 1 the camera is well above and looking
   * down on the boulder, at 0 it is in its playing position, and the opening
   * eases between the two.
   */
  private camera(ctx: GameContext, lift: number): void {
    const zoom = this.pullBack(ctx);
    const back = (K.camera.back + this.radius * K.cameraPerRadius) * zoom;
    const up = (K.camera.up + this.radius * K.cameraPerRadius) * zoom;
    // A knock is worth a shake, and a shake is worth about a unit.
    const jolt = this.shake * this.shake;
    this.hill.slope.localToWorld(
      tmp.set(
        this.x * 0.4 + Math.sin(this.phaseTime * 47) * jolt,
        this.radius + up + lift * 30,
        -this.rolled + back * (1 + lift * 0.6),
      ),
    );
    eye.copy(tmp);
    /*
     * Looking just ahead of the ball, not far down the hill.
     *
     * Where this point is decides where the ball sits on the screen, and the
     * further ahead it is the lower the ball rides. At forty units it was half
     * off the bottom edge of a phone; at twenty it sits in the lower third,
     * with the hill it is about to hit above it — which is the part the player
     * is actually reading.
     */
    this.hill.slope.localToWorld(
      tmp.set(this.x * 0.4, this.radius * 0.5, -this.rolled - 20 * zoom),
    );
    look.copy(tmp);
    ctx.setCameraCinematic(eye, look);
  }

  /**
   * How far the camera has to retreat for a playable width to be visible.
   *
   * The same arithmetic as the climb, and for the same reason: the visible
   * half-width at distance d is d·tan(fov/2)·aspect, so this is the factor
   * that brings `wantHalfWidth` inside the screen's margin. Worked out from
   * the lens rather than by looking through it, because measuring the camera
   * and then moving it is a loop that flips between two answers every frame.
   */
  private pullBack(ctx: GameContext): number {
    const stand = Math.hypot(
      K.camera.back + this.radius * K.cameraPerRadius,
      K.camera.up + this.radius * K.cameraPerRadius,
    );
    const visible =
      stand *
      Math.tan((ctx.cameraFov * Math.PI) / 360) *
      ctx.cameraAspect *
      K.edgeMargin;
    return Math.min(
      K.camera.pullBack,
      Math.max(1, K.wantHalfWidth / Math.max(0.001, visible)),
    );
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
    this.speed = Math.max(0, this.speed - K.ball.gravity * 0.8 * dt);
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
          this.radius + this.rng.range(6, 22),
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
      tmp.set(0, this.radius + 20 + t * 150, -this.rolled + 40 + t * 220),
    );
    eye.copy(tmp);
    ctx.setCameraCinematic(eye, look);
    if (t >= 1) {
      this.phase = "done";
      this.complete = true;
    }
  }
}
