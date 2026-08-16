import * as THREE from "three";
import {ISLANDS as I, ISLANDS_PALETTE as P} from "../config";
import type {Hop} from "../core/hopButtons";
import {Rng} from "../core/rng";
import {FIREWORK_PALETTE} from "../fx/particles";
import {
  createIslandsScene,
  type IslandsScene,
  type Rider,
} from "../render/geometry/islands";
import type {GameContext, Level} from "./level";

type Phase = "waiting" | "rising" | "playing" | "struck" | "won" | "done";

const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const blend = new THREE.Vector3();
const blendLook = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Forward is (sin yaw, cos yaw), so this faces her down the board at -z. */
const FACING_ACROSS = Math.PI;

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 7 — the Silent Islands.
 *
 * Frogger, with the frogs on the other side of it. Eight streams run in
 * alternate directions between two banks, carrying lilypads and alligators,
 * and the bee hops square by square across them. Share a stream with a frog
 * and come within one square and its tongue has you; meet an alligator and it
 * doesn't need a tongue.
 *
 * The board is the level: see ISLANDS in config.ts, where the streams are a
 * table of speed against how many things ride, and the note there gives the
 * arithmetic that keeps every one of them crossable.
 *
 * She is scripted throughout — the level writes her position every frame — so
 * the flight model, the stick and the altitude slider are all switched off in
 * `enter`. What replaces them is four buttons; see core/hopButtons.ts.
 */
export class IslandsLevel implements Level {
  readonly name = "Silent Islands";
  readonly completionTitle = "Across the water!";
  readonly completionBody =
    "Not one frog got you. The Silent Islands are yours.";
  /**
   * The last level in the game, so its card offers the map rather than "keep
   * flying" — the far bank is a strip of grass with nothing on it, and being
   * left standing there is a dead end rather than a reward.
   */
  readonly finishesGame = true;
  readonly failTitle = "Snap!";
  readonly failBody =
    "A frog got you. Watch which way each stream is going, and hop when the water beside you is empty. Want another go?";

  complete = false;
  failed = false;

  private scene!: IslandsScene;
  private phase: Phase = "waiting";
  private phaseTime = 0;

  /** Where she is on the board. Row 0 is the near bank. */
  private row = 0;
  private col = (I.cols - 1) / 2;
  /** The hop in progress: where it started, and how far through it is. */
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private hopT = 1;
  /** How far she has got, for the counter — her best row, not her current
      one, so hopping back doesn't read as losing ground. */
  private best = 0;
  private striker: Rider | null = null;
  private nextBurst = 0;
  private bursts = 0;

  get controlsLocked(): boolean {
    return this.phase !== "playing";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("islands");
    // Nothing here is flown. The buttons are turned on when play starts, not
    // now: pressing them during the opening shot would bank hops she then
    // takes the moment the camera settles.
    ctx.setFlightControls(false);

    this.scene = createIslandsScene(new Rng(0x15_1a_4d_51));
    ctx.islands.add(this.scene.group);

    ctx.configureFlight({
      // She is never handed to the flight model; these only have to be sane.
      boundsRadius: 4000,
      minHeight: 0,
      maxHeight: 40,
      cameraDistance: 13,
      cameraHeight: 6,
    });

    this.row = 0;
    this.col = (I.cols - 1) / 2;
    this.best = 0;
    this.hopT = 1;
    this.striker = null;
    this.complete = false;
    this.failed = false;
    this.phase = "waiting";
    this.phaseTime = 0;
    this.bursts = 0;
    this.nextBurst = 0;

    this.cell(this.row, this.col, tmp);
    ctx.placeBee(tmp, tmp.y, FACING_ACROSS);
    ctx.bee.setYaw(FACING_ACROSS);
    ctx.bee.setScale(I.beeScale);
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);

    // The opening shot: the ordinary over-the-shoulder view, from the bank,
    // looking at what she has to cross.
    const {back, up, side} = I.approachCamera;
    fromEye.set(tmp.x + side, tmp.y + up, tmp.z + back);
    fromLook.copy(tmp);
    ctx.setCameraCinematic(fromEye, fromLook);

    ctx.hud.setBanner(this.name);
    ctx.hud.setObjective("Hop across the eight streams to the far bank.");
    ctx.hud.setCounters([
      {
        key: "streams",
        label: "Streams",
        color: P.lily,
        value: 0,
        target: I.streams,
      },
    ]);
  }

  exit(ctx: GameContext): void {
    ctx.hopButtons.setVisible(false);
    ctx.hud.setCallout(null);
    ctx.islands.remove(this.scene.group);
    this.scene.dispose();
    ctx.bee.scripted = false;
    ctx.bee.setScale(1);
    ctx.bee.setCrown(false);
  }

  resumeAfterCompletion(ctx: GameContext): void {
    // Nothing to re-arm: the board has been crossed. Leave her on the far
    // bank with the camera where it is.
    ctx.hopButtons.setVisible(false);
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    // Above every phase's early return: the water runs whatever the camera is
    // doing, so the opening shot shows a board already in motion.
    this.scene.update(dt);

    switch (this.phase) {
      case "waiting":
        this.updateWaiting(ctx);
        break;
      case "rising":
        this.updateRising(ctx);
        break;
      case "playing":
        this.updatePlaying(dt, ctx);
        break;
      case "struck":
        this.updateStruck(ctx);
        break;
      case "won":
        this.updateWon(dt, ctx);
        break;
      case "done":
        break;
    }
  }

  // ---- the opening --------------------------------------------------------

  private updateWaiting(ctx: GameContext): void {
    ctx.setCameraCinematic(fromEye, fromLook);
    if (this.phaseTime >= I.waitTime) {
      this.phase = "rising";
      this.phaseTime = 0;
    }
  }

  /** Up and over, from behind her shoulder to looking down at the board. */
  private updateRising(ctx: GameContext): void {
    const t = ease(Math.min(1, this.phaseTime / I.riseTime));
    this.boardShot(ctx, eye, look);
    blend.copy(fromEye).lerp(eye, t);
    blendLook.copy(fromLook).lerp(look, t);
    ctx.setCameraCinematic(blend, blendLook);
    if (t >= 1) {
      this.phase = "playing";
      this.phaseTime = 0;
      ctx.hopButtons.setVisible(true);
      ctx.hopButtons.clear();
      ctx.hud.setCallout("Tap the arrows to hop!");
    }
  }

  /**
   * Where the camera stands to see the whole board.
   *
   * The whole of it, deliberately: this is a game about a gap four squares
   * away arriving in three seconds, and a shot that only showed the row she is
   * on would hide the entire decision.
   */
  private boardShot(
    ctx: GameContext,
    outEye: THREE.Vector3,
    outLook: THREE.Vector3,
  ): void {
    const depth = (I.streams + 1) * I.square;
    outLook.set(0, 0, -depth / 2);
    const half = Math.max(((I.cols + 1) / 2) * I.square, depth / 2);
    outEye.copy(ctx.framedCameraEye(outLook, half, I.boardPitch, I.boardFill));
  }

  // ---- play ---------------------------------------------------------------

  private updatePlaying(dt: number, ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);

    // A hop in the air finishes before another is taken, so she can never be
    // between two squares in two directions at once.
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / I.hopTime);
      this.placeAlongHop(ctx);
    } else {
      const hop = ctx.hopButtons.take();
      if (hop) {
        this.startHop(hop, ctx);
      }
    }

    // Reaching the far bank ends it, and has to be tested before the strike:
    // arriving on the same frame as a tongue is a win, not a death.
    if (this.row > I.streams) {
      this.win(ctx);
      return;
    }

    const striker = this.threat(ctx);
    if (striker) {
      this.striker = striker;
      this.phase = "struck";
      this.phaseTime = 0;
      ctx.hopButtons.setVisible(false);
      ctx.hud.setCallout(null);
      ctx.audio.sting();
    }
  }

  /**
   * Whatever on the board has her, or null.
   *
   * Distance rather than squares: she spends a fifth of every hop between two
   * of them, and a test that only looked at whole squares would let her pass
   * through a frog as long as she didn't stop on it.
   */
  private threat(ctx: GameContext): Rider | null {
    const bee = ctx.bee.position;
    for (const rider of this.scene.riders) {
      // Same stream: her middle inside the band of water this one rides.
      if (Math.abs(bee.z - this.scene.rowZ(rider.lane)) > I.square / 2) {
        continue;
      }
      const dx = Math.abs(bee.x - rider.x * I.square);
      if (dx <= rider.reach * I.square) {
        return rider;
      }
    }
    return null;
  }

  private startHop(hop: Hop, ctx: GameContext): void {
    const row = this.row + (hop === "up" ? 1 : hop === "down" ? -1 : 0);
    const col = this.col + (hop === "right" ? 1 : hop === "left" ? -1 : 0);
    // The edges of the board are walls, not deaths — a hop into one is simply
    // not taken. Being killed by the scenery for pressing a button that was
    // there to be pressed is the kind of thing that makes a child stop.
    if (row < 0 || row > I.streams + 1 || col < 0 || col > I.cols - 1) {
      return;
    }
    this.cell(this.row, this.col, this.hopFrom);
    this.cell(row, col, this.hopTo);
    this.row = row;
    this.col = col;
    this.hopT = 0;
    if (row > this.best) {
      this.best = row;
      ctx.hud.setCount("streams", Math.min(row, I.streams), I.streams, true);
      // The first hop off the bank is the one that says the buttons work.
      ctx.hud.setCallout(null);
    }
    // Facing the way she is going, which on a board seen from above is the
    // only thing telling you which end of her is the front.
    ctx.bee.setYaw(
      hop === "up"
        ? FACING_ACROSS
        : hop === "down"
          ? 0
          : hop === "left"
            ? -Math.PI / 2
            : Math.PI / 2,
    );
    ctx.audio.collect(0);
  }

  /** Along the hop, and over it: a flat slide reads as a drag, not a hop. */
  private placeAlongHop(ctx: GameContext): void {
    tmp.copy(this.hopFrom).lerp(this.hopTo, this.hopT);
    tmp.y += Math.sin(Math.PI * this.hopT) * I.hopArc;
    ctx.bee.teleport(tmp);
  }

  /** The middle of a square, at flying height. */
  private cell(row: number, col: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.scene.columnX(col),
      I.flightHeight,
      this.scene.rowZ(row),
    );
  }

  // ---- the two endings ----------------------------------------------------

  private updateStruck(ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);
    if (!this.striker) {
      return;
    }
    // The tongue goes out, catches her, and holds while it reads.
    const out = Math.min(1, this.phaseTime / I.strikeReach);
    this.scene.strike(this.striker, ctx.bee.position, out);
    if (this.phaseTime >= I.strikeReach + I.strikeHold) {
      this.scene.hideTongue();
      this.phase = "done";
      this.failed = true;
    }
  }

  private win(ctx: GameContext): void {
    this.phase = "won";
    this.phaseTime = 0;
    this.bursts = 0;
    this.nextBurst = 0;
    this.hopT = 1;
    ctx.hopButtons.setVisible(false);
    ctx.hud.setCallout(null);
    ctx.hud.setCount("streams", I.streams, I.streams, true);
  }

  private updateWon(dt: number, ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.bursts < I.winBursts) {
      this.nextBurst = I.winBurstEvery;
      this.bursts++;
      tmp.copy(ctx.bee.position);
      tmp.x += (this.bursts % 2 === 0 ? 1 : -1) * this.bursts * I.square * 0.35;
      tmp.y += 1.5 + this.bursts * 0.3;
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 26,
        speed: 9,
        spherical: 1,
        ttl: 1.5,
        size: 0.8,
      });
      ctx.audio.levelComplete();
    }
    if (this.bursts >= I.winBursts && this.nextBurst <= 0) {
      this.phase = "done";
      this.complete = true;
    }
  }
}
