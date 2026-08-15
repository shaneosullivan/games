import * as THREE from "three";
import {CAMERA, LAIR, LAIR_PALETTE} from "../config";
import {Rng} from "../core/rng";
import {FIREWORK_PALETTE} from "../fx/particles";
import {
  createLairScene,
  gateHit,
  type LairScene,
} from "../render/geometry/lair";
import type {GameContext, Level} from "./level";

type Phase =
  | "waiting"
  | "flyingIn"
  | "panning"
  | "playing"
  | "crashing"
  | "failed"
  | "celebrating"
  | "done";

const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const blendEye = new THREE.Vector3();
const blendLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Facing +x. Forward is (sin yaw, cos yaw), so this points her down the cave. */
const FACING_ALONG_CAVE = Math.PI / 2;

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 6 — The Bear's Lair.
 *
 * Flappy Bird in the bee's own world: tap and she flaps upward, gravity takes
 * it back off her, and she moves right whatever you do. The trick is that it is
 * not a 2D game at all — it is the same scene, the same bee and the same
 * renderer, with the camera parked off to her left and the cave laid out in one
 * plane so that it reads flat.
 *
 * The level drives the bee itself from the moment it starts (`scripted`), so
 * none of the ordinary flight model applies: no stick, no bounds, no altitude
 * slider. All the player has is `ctx.takePress()`.
 *
 * Failing is a phase, not an ending. She shakes, falls out of shot, and the
 * Game offers another go — nothing here is allowed to feel like a punishment.
 */
export class LairLevel implements Level {
  readonly name = "The Bear's Lair";
  readonly completionTitle = "Out the other side!";
  readonly completionBody =
    "You flew the whole Bear's Lair. Every spike, every boulder — straight through the middle of them all.";

  /** The last level there is, so finishing it hands back to the map. */
  readonly finishesGame = true;

  complete = false;
  failed = false;

  private phase: Phase = "waiting";
  private phaseTime = 0;
  private elapsed = 0;
  private scene: LairScene | null = null;
  /** Vertical speed — the only thing the player actually controls. */
  private climb = 0;
  private passed = 0;
  /** Which gate to test next. They're in x order, so there's no search. */
  private nextGate = 0;
  private nextFirework = 0;

  /** The whole level is a cutscene except while she's being flown. */
  get controlsLocked(): boolean {
    return this.phase !== "playing";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("lair");
    // Nothing here is flown with the stick, and the altitude slider would be a
    // second, contradictory way to go up.
    ctx.setFlightControls(false);

    // A fixed seed, unlike the maze: this cave is meant to be learned. Getting
    // further each go is the whole of the level's difficulty curve.
    this.scene = createLairScene(new Rng(0x1a12b0d5));
    ctx.lair.add(this.scene.group);

    ctx.configureFlight({
      // She is never handed to the flight model at all; these only have to be
      // sane, since the level drives the camera itself from the first frame.
      boundsRadius: 4000,
      minHeight: LAIR.floorY,
      maxHeight: LAIR.ceilingY,
      cameraDistance: 14,
      cameraHeight: 6,
    });

    // Outside the mouth, facing in. `placeBee` snaps the camera behind her, so
    // the opening is the game's ordinary over-the-shoulder shot.
    ctx.placeBee(
      tmp.set(LAIR.mouthX - LAIR.approachOut, LAIR.startHeight, LAIR.beeZ),
      LAIR.startHeight,
      FACING_ALONG_CAVE,
    );
    ctx.bee.setYaw(FACING_ALONG_CAVE);
    ctx.bee.setScale(LAIR.beeScale);
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);

    // The opening shot, held: see LAIR.approachCamera.
    const {back, up, side} = LAIR.approachCamera;
    fromEye.set(
      LAIR.mouthX - LAIR.approachOut - back,
      LAIR.startHeight + up,
      LAIR.beeZ + side,
    );
    fromLook.copy(ctx.bee.position);
    ctx.setCameraCinematic(fromEye, fromLook);

    this.phase = "waiting";
    this.phaseTime = 0;
    this.elapsed = 0;
    this.climb = 0;
    this.passed = 0;
    this.nextGate = 0;
    this.nextFirework = 0;
    this.complete = false;
    this.failed = false;

    ctx.hud.setBanner(this.name);
    ctx.hud.setCounters([
      {
        key: "gates",
        label: "Rocks",
        color: LAIR_PALETTE.crystal,
        value: 0,
        target: this.scene.gates.length,
      },
    ]);
    ctx.hud.setObjective("Into the cave…");
    ctx.setObjectiveMarker(null);
  }

  exit(ctx: GameContext): void {
    if (this.scene) {
      ctx.lair.remove(this.scene.group);
      this.scene.dispose();
    }
    this.scene = null;
    ctx.setCameraCinematic(null);
    ctx.bee.setClimb(0);
  }

  update(dt: number, ctx: GameContext): void {
    const scene = this.scene;
    if (!scene) {
      return;
    }
    this.elapsed += dt;
    this.phaseTime += dt;

    switch (this.phase) {
      case "waiting":
        this.updateWaiting(ctx);
        break;
      case "flyingIn":
        this.updateFlyingIn(ctx);
        break;
      case "panning":
        this.updatePanning(dt, ctx);
        break;
      case "playing":
        this.updatePlaying(dt, ctx, scene);
        break;
      case "crashing":
        this.updateCrashing(dt, ctx);
        break;
      case "celebrating":
        this.updateCelebrating(dt, ctx, scene);
        break;
      case "failed":
      case "done":
        break;
    }
  }

  /** A beat outside the mouth, looking at what she's about to fly into. */
  private updateWaiting(ctx: GameContext): void {
    ctx.setCameraCinematic(fromEye, ctx.bee.position);
    if (this.phaseTime < LAIR.approachPause) {
      return;
    }
    this.phase = "flyingIn";
    this.phaseTime = 0;
    ctx.hud.setObjective("Here we go!");
  }

  private updateFlyingIn(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / LAIR.flyInTime);
    // From outside the mouth to just inside it, where the side-on shot starts.
    ctx.bee.position.set(
      THREE.MathUtils.lerp(
        LAIR.mouthX - LAIR.approachOut,
        LAIR.mouthX + LAIR.runIn * 0.35,
        ease(t),
      ),
      LAIR.startHeight,
      LAIR.beeZ,
    );
    // The shot doesn't follow her in: she flies away from it, into the cave,
    // and the camera stays outside until the pan takes it round.
    ctx.setCameraCinematic(fromEye, ctx.bee.position);
    if (t >= 1) {
      this.phase = "panning";
      this.phaseTime = 0;
      fromLook.copy(ctx.bee.position);
    }
  }

  /** Swing from behind her round to her left, and the game is on. */
  private updatePanning(dt: number, ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / LAIR.panTime);
    // Already moving, so the pan lands on a bee that is flying rather than one
    // that starts from nothing the moment the shot settles.
    ctx.bee.position.x += LAIR.speed * t * dt;

    this.sideOnEye(ctx, eye);
    this.lookTarget(ctx, look);
    ctx.setCameraCinematic(
      blendEye.copy(fromEye).lerp(eye, ease(t)),
      blendLook.copy(fromLook).lerp(look, ease(t)),
    );

    if (t >= 1) {
      this.phase = "playing";
      this.phaseTime = 0;
      this.climb = 0;
      ctx.hud.setObjective("Tap anywhere to flap!");
    }
  }

  private updatePlaying(dt: number, ctx: GameContext, scene: LairScene): void {
    const bee = ctx.bee;
    bee.position.x += LAIR.speed * dt;

    // A flap, and then gravity. Each press throws her upward at `flapSpeed`
    // whatever she was doing before — including mid-fall, which is what makes
    // a late flap a save rather than a slow correction — and nothing about
    // holding the screen down keeps her there.
    if (ctx.takePress()) {
      this.climb = LAIR.flapSpeed;
      ctx.audio.flap();
    }
    this.climb = Math.max(-LAIR.maxFall, this.climb - LAIR.gravity * dt);
    bee.position.y += this.climb * dt;

    // Nose up out of a flap, down as it runs out. It reads as effort, and it
    // shows which way she is going before the height has visibly changed.
    bee.setClimb(this.climb / LAIR.flapSpeed);

    // Floor and roof are walls like any other. Without that, sitting on the
    // floor would be the safe way to play.
    if (
      bee.position.y - LAIR.hitHalfHeight <= LAIR.floorY ||
      bee.position.y + LAIR.hitHalfHeight >= LAIR.ceilingY
    ) {
      this.crash(ctx);
      return;
    }

    const gate = scene.gates[this.nextGate];
    if (gate) {
      if (
        gateHit(
          gate,
          bee.position.x,
          bee.position.y,
          LAIR.hitHalfLength,
          LAIR.hitHalfHeight,
        )
      ) {
        this.crash(ctx);
        return;
      }
      const clear = gate.obstacles[0].halfWidth + LAIR.hitHalfLength;
      if (bee.position.x > gate.x + clear) {
        this.nextGate++;
        this.passed++;
        ctx.hud.setCount("gates", this.passed, scene.gates.length, true);
        // Rising notes as they stack up, so getting further sounds like it.
        ctx.audio.collect(this.passed);
      }
    }

    this.frameSideOn(ctx);

    if (bee.position.x >= scene.endX) {
      this.beginCelebration(ctx);
    }
  }

  private crash(ctx: GameContext): void {
    this.phase = "crashing";
    this.phaseTime = 0;
    this.climb = 0;
    ctx.audio.sting();
    ctx.flashScreen();
    ctx.hud.setObjective("Oh no!");
  }

  /** The earthquake, and the bee dropping out of shot. */
  private updateCrashing(dt: number, ctx: GameContext): void {
    this.climb = Math.max(
      -LAIR.crashFallSpeed,
      this.climb - LAIR.crashFallAccel * dt,
    );
    ctx.bee.position.y += this.climb * dt;
    ctx.bee.setClimb(-1);

    // Shake hard, then settle. A constant rattle for a second and a half reads
    // as a broken camera rather than an impact.
    const k = Math.max(0, 1 - this.phaseTime / LAIR.shakeTime);
    const shake = LAIR.shakeAmplitude * k * k;
    this.sideOnEye(ctx, eye);
    eye.x += Math.sin(this.elapsed * LAIR.shakeRate * 1.7) * shake;
    eye.y += Math.sin(this.elapsed * LAIR.shakeRate) * shake;
    this.lookTarget(ctx, look);
    // The shot holds its height as she falls, so she leaves the bottom of the
    // frame instead of the camera following her down and hiding what happened.
    look.y = (LAIR.floorY + LAIR.ceilingY) / 2;
    ctx.setCameraCinematic(eye, look);

    if (ctx.bee.position.y < LAIR.floorY - LAIR.crashDepth) {
      this.phase = "failed";
      this.phaseTime = 0;
      // The Game watches this and puts the card up.
      this.failed = true;
    }
  }

  private beginCelebration(ctx: GameContext): void {
    this.phase = "celebrating";
    this.phaseTime = 0;
    this.nextFirework = 0;
    ctx.audio.levelComplete();
    ctx.flashScreen();
    ctx.hud.setObjective("You made it!");
  }

  private updateCelebrating(
    dt: number,
    ctx: GameContext,
    scene: LairScene,
  ): void {
    // Still flying, out into the open, with the shot holding on her.
    ctx.bee.position.x += LAIR.speed * dt;
    ctx.bee.position.y += (LAIR.startHeight - ctx.bee.position.y) * 2 * dt;
    ctx.bee.setClimb(0);
    this.frameSideOn(ctx);

    this.nextFirework -= dt;
    if (this.nextFirework <= 0 && this.phaseTime < LAIR.celebrationTime - 0.4) {
      this.nextFirework = 0.24;
      tmp
        .copy(ctx.bee.position)
        .add(
          tmpB.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 9,
            (Math.random() - 0.5) * 4,
          ),
        );
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 30,
        speed: 4.2,
        lift: 0.6,
        gravity: 2.2,
        ttl: 1.4,
        spherical: 1,
      });
    }

    if (this.phaseTime >= LAIR.celebrationTime) {
      this.phase = "done";
      this.complete = true;
      ctx.hud.setCount("gates", scene.gates.length, scene.gates.length);
    }
  }

  /** Point the camera at the bee from her left, and hold it there. */
  private frameSideOn(ctx: GameContext): void {
    this.sideOnEye(ctx, eye);
    this.lookTarget(ctx, look);
    ctx.setCameraCinematic(eye, look);
  }

  /** A little ahead of her, in the play plane, so there is road to read. */
  private lookTarget(ctx: GameContext, out: THREE.Vector3): THREE.Vector3 {
    return out.set(ctx.bee.position.x + LAIR.cameraLead, ctx.bee.position.y, 0);
  }

  /**
   * Where the side-on camera stands.
   *
   * Far enough back that the whole slot of cave fits vertically *and* enough of
   * it fits along the way she's flying — worked out from the real field of view
   * and the screen's shape rather than picked by eye, because a portrait phone
   * and a landscape iPad crop completely differently. Whichever axis needs the
   * camera further back wins.
   *
   * Its height is the middle of the cave, not hers. The cave is the frame: a
   * shot that rode up and down with the bee would move the floor and the roof,
   * and there would be nothing left to judge her height against.
   */
  private sideOnEye(ctx: GameContext, out: THREE.Vector3): THREE.Vector3 {
    const vFov = (CAMERA.fov * Math.PI) / 180;
    const forHeight = LAIR.frameHalfHeight / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * ctx.cameraAspect);
    const forLength = LAIR.frameHalfLength / Math.tan(hFov / 2);
    return out.set(
      ctx.bee.position.x + LAIR.cameraLead,
      (LAIR.floorY + LAIR.ceilingY) / 2,
      Math.max(forHeight, forLength),
    );
  }

  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== "done") {
      return;
    }
    this.complete = false;
    ctx.hud.setObjective("Out of the Bear's Lair");
  }
}
