import * as THREE from "three";
import * as THREETypes from "three";
import {CAMERA, DOME, LAIR, LAIR_PALETTE} from "../config";
import {Rng} from "../core/rng";
import {DanceTrail} from "../entities/danceTrail";
import {FIREWORK_PALETTE} from "../fx/particles";
import {
  createLairScene,
  gateHit,
  type LairScene,
} from "../render/geometry/lair";
import {createLairDome, type LairDome} from "../render/geometry/lairDome";
import type {GameContext, Level} from "./level";

type Phase =
  | "waiting"
  | "flyingIn"
  | "panning"
  | "playing"
  | "crashing"
  | "failed"
  // The cut scene at the end, in order.
  | "arriving"
  | "dancing"
  | "gathering"
  | "looting"
  | "climbing"
  | "homing"
  | "done";

const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const blendEye = new THREE.Vector3();
const blendLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const prevBee = new THREE.Vector3();
/**
 * Scratch for `exitPath` alone.
 *
 * It must not share with `tmp`/`tmpB`: callers pass those in as the output,
 * and a function that lerps between its own scratch vectors while writing into
 * one of them returns nonsense.
 */
const pathA = new THREE.Vector3();
const pathB = new THREE.Vector3();
/** Where the flight home starts: high over the meadow, out past the flowers. */
const homeFrom = new THREE.Vector3(-70, 34, 70);

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
  /** The chamber at the end, and the cut scene's props. */
  private dome: LairDome | null = null;
  /** Seconds since the cut scene started, for the slow camera drift. */
  private domeTime = 0;
  private readonly trail = new DanceTrail();
  /** Jars taken off the hoard, one per bee, carried home. */
  private readonly carried: Array<THREETypes.Group> = [];

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
    // Shut until the pan: the mouth should be a dark hole in a cliff, not a
    // diagram of the level you are about to fly.
    this.scene.setMouthCover(1);

    // The chamber at the end, and the map she will draw in it.
    this.dome = createLairDome(new Rng(0x5eed0e), this.scene.endX);
    this.scene.group.add(this.dome.group);
    this.scene.group.add(this.trail.mesh);
    this.trail.reset();
    this.carried.length = 0;

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
    this.dome?.dispose();
    this.dome = null;
    for (const jar of this.carried) {
      jar.removeFromParent();
    }
    this.carried.length = 0;
    // The brood belong to the hive; the cut scene only borrows them.
    ctx.babies.group.removeFromParent();
    ctx.interior.group.add(ctx.babies.group);
    ctx.babies.reset();
    ctx.setScreenFade(0);
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

    // Above the phase switch: the water keeps running whatever else is going
    // on, including behind the wall during the opening shot, and the hoard
    // keeps glinting through every beat of the cut scene.
    scene.update(this.elapsed);
    const dome = this.dome;
    if (!dome) {
      return;
    }
    dome.update(this.elapsed);
    this.trail.update(this.elapsed);
    // The brood are the Game's, so nothing ticks them unless the level using
    // them does it — see bee/README.md. Without this they hang at the point
    // they were released and never fly at all.
    //
    // Except on the way out, where the level is flying them itself in a line:
    // their own wandering would pull them straight back off it and into the
    // roof. Their wings still need ticking.
    if (this.phase === "climbing") {
      ctx.babies.tickModels(dt);
    } else {
      ctx.babies.update(dt, ctx.bee.position, null);
    }
    if (this.phase !== "playing" && this.phase !== "crashing") {
      this.domeTime += dt;
    }

    switch (this.phase) {
      case "waiting":
        this.updateWaiting(ctx);
        break;
      case "flyingIn":
        this.updateFlyingIn(ctx);
        break;
      case "panning":
        this.updatePanning(dt, ctx, scene);
        break;
      case "playing":
        this.updatePlaying(dt, ctx, scene);
        break;
      case "crashing":
        this.updateCrashing(dt, ctx);
        break;
      case "arriving":
        this.updateArriving(ctx, dome);
        break;
      case "dancing":
        this.updateDancing(ctx, dome);
        break;
      case "gathering":
        this.updateGathering(dt, ctx, dome);
        break;
      case "looting":
        this.updateLooting(ctx, dome);
        break;
      case "climbing":
        this.updateClimbing(ctx, dome);
        break;
      case "homing":
        this.updateHoming(ctx, dome);
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
  private updatePanning(dt: number, ctx: GameContext, scene: LairScene): void {
    const t = Math.min(1, this.phaseTime / LAIR.panTime);
    // The cave opens up as the shot comes round — gone by halfway, so the
    // second half of the swing is already showing the level she is in.
    scene.setMouthCover(1 - Math.min(1, t / LAIR.coverFade));
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

    // Every gate she is anywhere near, not just the next one.
    //
    // A stair puts two gates seven units apart, which is less than the width
    // of the rocks either side of them — so she can be inside both at once,
    // and testing only `nextGate` would let her fly through the second one's
    // rock while the first was still current.
    const reach = LAIR.rockHalfWidth + LAIR.hitHalfLength;
    for (let i = this.nextGate; i < scene.gates.length; i++) {
      const gate = scene.gates[i];
      if (gate.x - bee.position.x > reach) {
        // In x order, so everything past this one is further ahead still.
        break;
      }
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
    }

    // ...and count off the ones she has left behind. A `while`, because a
    // stair's two gates can both fall behind her within one step.
    while (this.nextGate < scene.gates.length) {
      const gate = scene.gates[this.nextGate];
      // The widest of them: a gate can hold a slim spike and a fat rock, and
      // it isn't behind her until she is past both.
      const clear =
        Math.max(...gate.obstacles.map(o => o.halfWidth)) + LAIR.hitHalfLength;
      if (bee.position.x <= gate.x + clear) {
        break;
      }
      this.nextGate++;
      this.passed++;
      ctx.hud.setCount("gates", this.passed, scene.gates.length, true);
      // Rising notes as they stack up, so getting further sounds like it.
      ctx.audio.collect(this.passed);
    }

    this.frameSideOn(ctx);

    if (bee.position.x >= scene.endX) {
      this.beginArriving(ctx);
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

  // ---- the cut scene ------------------------------------------------------
  //
  // She flies out of the corridor into the bear's own chamber: a dome with a
  // hole in the roof, a hoard of stolen honey under the shaft of daylight that
  // comes through it, and bones all over the floor. She dances the shape of
  // the route she just flew, which leaves a glowing map of it hanging in the
  // air; the brood arrive, take a jar each, and everyone leaves through the
  // roof and flies home.

  private beginArriving(ctx: GameContext): void {
    this.phase = "arriving";
    this.phaseTime = 0;
    this.domeTime = 0;
    ctx.audio.levelComplete();
    ctx.hud.setObjective("The bear's treasure!");
    ctx.bee.setClimb(0);
    fromEye.copy(ctx.cameraPosition);
    fromLook.copy(ctx.bee.position);
  }

  /** Out of the corridor and into the room, with the shot opening up. */
  private updateArriving(ctx: GameContext, dome: LairDome): void {
    const t = Math.min(1, this.phaseTime / DOME.arriveTime);
    const k = ease(t);
    // She glides to the front of the hoard, still moving, and turns to face it.
    tmp
      .copy(dome.centre)
      .add(tmpB.set(-DOME.danceSize * 0.5, DOME.danceFloor, 0));
    ctx.bee.position.lerpVectors(dome.entry, tmp, k);
    ctx.bee.setYaw(Math.PI / 2);

    this.domeEye(dome, eye);
    ctx.setCameraCinematic(
      blendEye.copy(fromEye).lerp(eye, k),
      blendLook.copy(fromLook).lerp(dome.centre, k),
    );

    if (t >= 1) {
      this.phase = "dancing";
      this.phaseTime = 0;
      this.trail.reset();
      ctx.hud.setObjective("Show them the way!");
    }
  }

  /**
   * The dance: she flies the shape of her own route through the cave.
   *
   * This is what a bee's waggle dance actually is — a flown description of
   * where she has been, for the others to follow — so the shape is not
   * invented. It is the real gate-by-gate path, scaled down to fit the room.
   */
  private updateDancing(ctx: GameContext, dome: LairDome): void {
    const t = Math.min(1, this.phaseTime / DOME.danceTime);
    this.dancePoint(dome, t, tmp);
    // Facing the way she is going, so the dance reads as flying rather than
    // sliding: the direction is taken from a point just ahead on the path.
    this.dancePoint(dome, Math.min(1, t + 0.02), tmpB);
    ctx.bee.position.copy(tmp);
    ctx.bee.setYaw(Math.atan2(tmpB.x - tmp.x, tmpB.z - tmp.z));
    this.trail.mark(tmp);

    this.domeEye(dome, eye);
    ctx.setCameraCinematic(eye, dome.centre);

    if (t >= 1) {
      this.phase = "gathering";
      this.phaseTime = 0;
      this.nextFirework = 0;
      // Out of the hive and into the chamber: they arrive where she is.
      ctx.babies.group.removeFromParent();
      dome.group.add(ctx.babies.group);
      ctx.babies.swarm(dome.centre);
      ctx.hud.setObjective("Here come the babies!");
    }
  }

  /** The brood arriving, each in a burst of sparks. */
  private updateGathering(dt: number, ctx: GameContext, dome: LairDome): void {
    this.domeEye(dome, eye);
    ctx.setCameraCinematic(eye, dome.centre);

    this.nextFirework -= dt;
    if (this.nextFirework <= 0) {
      this.nextFirework = 0.18;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 14;
      ctx.fireworks.burst(
        tmp.set(
          dome.centre.x + Math.cos(a) * r,
          2 + Math.random() * 12,
          dome.centre.z + Math.sin(a) * r,
        ),
        {
          color: FIREWORK_PALETTE,
          count: 30,
          speed: 4.4,
          lift: 0.7,
          gravity: 2.2,
          ttl: 1.5,
          spherical: 1,
        },
      );
    }

    if (this.phaseTime >= DOME.gatherTime) {
      this.phase = "looting";
      this.phaseTime = 0;
      ctx.hud.setObjective("A jar each!");
    }
  }

  /** Everyone dives into the pile and comes up carrying a jar. */
  private updateLooting(ctx: GameContext, dome: LairDome): void {
    const t = Math.min(1, this.phaseTime / DOME.lootTime);
    // In, then straight back out: they mob the pile for the first half and
    // are already rising with the loot for the second.
    ctx.babies.mobAround(dome.centre);
    tmp.copy(dome.centre).setY(DOME.danceFloor * (0.4 + 0.8 * t));
    ctx.bee.position.lerp(tmp, 0.05);

    this.domeEye(dome, eye);
    ctx.setCameraCinematic(eye, dome.centre);

    this.carryJars(ctx);

    // Hand out the jars as they reach the pile, one at a time rather than all
    // at once, so the hoard visibly comes apart from the top down.
    const wanted = Math.floor(t * (ctx.babies.count + 1));
    while (this.carried.length < wanted) {
      const jar = dome.takeJar(this.carried.length);
      if (!jar) {
        break;
      }
      dome.group.add(jar);
      this.carried.push(jar);
    }

    if (t >= 1) {
      this.phase = "climbing";
      this.phaseTime = 0;
      ctx.hud.setObjective("Out through the roof!");
    }
  }

  /**
   * Everyone's jar, hung under whoever is carrying it.
   *
   * The queen takes the first one and the brood the rest, and they swing a
   * little as they fly — a jar held dead still under a moving bee looks
   * welded on.
   */
  private carryJars(ctx: GameContext): void {
    for (let i = 0; i < this.carried.length; i++) {
      const jar = this.carried[i];
      const owner = i === 0 ? ctx.bee.position : ctx.babies.positionOf(i - 1);
      const swing = Math.sin(this.elapsed * 2.4 + i) * DOME.jarSwing;
      jar.position.set(
        owner.x + swing,
        owner.y - DOME.jarHang,
        owner.z + swing * 0.6,
      );
      jar.rotation.z = -swing * 0.5;
      jar.scale.setScalar(DOME.jarCarryScale);
    }
  }

  /**
   * A point on the way out: over the hoard, up through the hole, into the sky.
   *
   * Every bee flies this same line, one behind the other. The hole is thirteen
   * units across and the room is sixty-eight, so anything with the spread of a
   * swarm in it sends most of the brood through solid rock — the way out is
   * single file or it is nothing.
   */
  private exitPath(
    dome: LairDome,
    u: number,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    // Clamped at the bottom only. Past the hole the last leg is allowed to
    // extrapolate, so the leader keeps climbing into the sky while the tail is
    // still coming up — clamping there would stack the whole line on the exit.
    const t = Math.max(0, u);
    // Two legs: across the room to under the hole, then straight up through it.
    // The corner is eased so the turn isn't a hinge.
    const turn = DOME.exitTurn;
    // Measured off the hole itself rather than off the dome's peak: the hole
    // is off-centre, where the roof is lower.
    pathB.copy(dome.holeCentre).setY(dome.holeCentre.y - 6);
    if (t <= turn) {
      pathA.set(dome.centre.x, DOME.climbFrom, dome.centre.z);
      return out.lerpVectors(pathA, pathB, ease(t / turn));
    }
    pathA.copy(dome.holeCentre).setY(dome.holeCentre.y + 55);
    return out.lerpVectors(pathB, pathA, (t - turn) / (1 - turn));
  }

  /** Up through the hole in the roof, in single file, camera behind the last. */
  private updateClimbing(ctx: GameContext, dome: LairDome): void {
    const t = Math.min(1, this.phaseTime / DOME.climbTime);
    // The queue is strung out along the path from the first frame: the queen a
    // whole line-length ahead of the tail, and the tail starting at the near
    // end of it. Starting everyone at zero instead piles the brood up on the
    // spot the camera is about to fly through.
    const line = DOME.lineGap * ctx.babies.count;
    const lead = line + ease(t);

    // The queen first, then the brood strung out behind her.
    this.exitPath(dome, lead, tmp);
    ctx.bee.position.copy(tmp);
    this.exitPath(dome, lead - 0.012, tmpB);
    ctx.bee.setYaw(Math.atan2(tmp.x - tmpB.x, tmp.z - tmpB.z));
    ctx.bee.setClimb(1);

    for (let i = 0; i < ctx.babies.count; i++) {
      this.exitPath(dome, lead - DOME.lineGap * (i + 1), tmp);
      ctx.babies.flyTo(i, tmp);
    }
    this.carryJars(ctx);

    // What is left of the hoard settles to two thirds as they lift off with
    // it. A jar each is a handful off a pile of forty, so the pile is scaled
    // down bodily rather than counted out — the shot is meant to say they made
    // off with the treasure.
    dome.setHoardScale(
      1 - (1 - DOME.hoardLeft) * ease(Math.min(1, this.phaseTime / 1.2)),
    );

    // Directly behind the last one, on the line itself, so the camera goes out
    // through the hole after them rather than past it — and looking at the
    // queen at the head of the queue, so what is in frame is the whole line
    // and the daylight it is heading for rather than one bee's back.
    const tailU = lead - DOME.lineGap * ctx.babies.count;
    this.exitPath(dome, tailU, tmp);
    this.exitPath(dome, tailU - 0.02, tmpB);
    // The direction she is travelling, as a unit vector; the shot is built
    // along it so the camera goes out through the hole after her.
    tmpB.subVectors(tmp, tmpB).normalize();
    eye.copy(tmp).addScaledVector(tmpB, -DOME.climbChase);
    look.copy(tmp).addScaledVector(tmpB, DOME.climbLookAhead);
    ctx.setCameraCinematic(eye, look);

    // A wash over the last of it, to carry the cut outside.
    ctx.setScreenFade(Math.max(0, (t - 0.86) / 0.14));

    if (t >= 1) {
      this.beginHoming(ctx);
    }
  }

  /** Outside: over the meadow, home to the hive, and in. */
  private beginHoming(ctx: GameContext): void {
    this.phase = "homing";
    this.phaseTime = 0;
    ctx.setEnvironment("meadow");
    // The jars come out of the cave with them. They were part of the hoard, so
    // they live in the lair's group — which `setEnvironment` has just hidden.
    // Straight onto the scene rather than into the meadow: they belong to the
    // cut scene, not to the world, and `exit` takes them away again.
    for (const jar of this.carried) {
      ctx.scene.add(jar);
    }
    // High over the meadow, a little way out, heading for the hive.
    ctx.bee.teleport(homeFrom);
    ctx.bee.setYaw(Math.atan2(-homeFrom.x, -homeFrom.z));
    ctx.releaseBabies(homeFrom);
    // The hive is only built by level 1, and nothing since has needed it to be
    // standing. It is the last thing this cut scene flies into, so it had
    // better be there — finished, and with its halo on.
    ctx.hive.setProgress(1);
    ctx.hive.setGlow(true);
    // Loose and spread out, not mobbing: they fly home in formation.
    ctx.babies.mobAround(null);
    ctx.hud.setObjective("Home!");
  }

  private updateHoming(ctx: GameContext, dome: LairDome): void {
    void dome;
    const t = Math.min(1, this.phaseTime / DOME.homeTime);
    const k = ease(t);
    // Down and in. The doorway is the hive's own, so this lands wherever the
    // hive actually is rather than at a number written down here.
    tmp.copy(homeFrom);
    tmpB.copy(ctx.hive.entrance);
    prevBee.copy(ctx.bee.position);
    ctx.bee.position.lerpVectors(tmp, tmpB, k);
    ctx.bee.setYaw(Math.atan2(tmpB.x - tmp.x, tmpB.z - tmp.z));
    ctx.babies.driftSwarm(
      ctx.bee.position.x - prevBee.x,
      ctx.bee.position.z - prevBee.z,
    );
    ctx.babies.setSwarmHeight(ctx.bee.position.y);
    this.carryJars(ctx);
    // Everyone shrinks into the doorway at the very end, the way level 1 ends.
    const gone = Math.max(0, (t - 0.88) / 0.12);
    ctx.bee.setScale(LAIR.beeScale * (1 - gone));
    for (const jar of this.carried) {
      jar.scale.setScalar(DOME.jarCarryScale * (1 - gone));
    }

    // Trailing behind and above, and looking at the hive rather than at her
    // once she is nearly home: the point of the last shot is the hive.
    eye
      .copy(ctx.bee.position)
      .add(
        tmpB.set(
          DOME.chaseDistance * 0.9,
          DOME.chaseDistance * 0.5,
          DOME.chaseDistance,
        ),
      );
    look.copy(ctx.bee.position).lerp(ctx.hive.entrance, k);
    ctx.setCameraCinematic(eye, look);
    ctx.setScreenFade(Math.max(0, 1 - this.phaseTime / 0.6));

    if (t >= 1) {
      this.phase = "done";
      this.complete = true;
      ctx.bee.setScale(1);
      ctx.bee.object.visible = false;
      ctx.hud.setObjective("Home with the honey!");
    }
  }

  /**
   * Where the chamber is watched from.
   *
   * Across the room and above head height, on the opposite side from the hole,
   * so the shaft of light comes toward the camera and the hoard is between the
   * two. It drifts slowly the whole way round the cut scene, because a still
   * camera on a still room for twenty seconds reads as a photograph.
   */
  private domeEye(dome: LairDome, out: THREE.Vector3): THREE.Vector3 {
    const swing = this.domeTime * DOME.cameraDrift;
    return out.set(
      dome.centre.x - Math.cos(swing) * DOME.cameraBack,
      DOME.cameraHeight,
      dome.centre.z + Math.sin(swing) * DOME.cameraBack,
    );
  }

  /**
   * A point on the dance, 0 to 1 along it.
   *
   * The shape is her own route: gate by gate, exactly what she just flew,
   * squeezed into the width of the room and stood up on its end so it reads as
   * a map rather than a lap of the chamber. Standing it up is the point — the
   * route is a long thin thing, and drawn flat on the floor from a camera at
   * head height it would be a line.
   */
  private dancePoint(
    dome: LairDome,
    t: number,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const gates = this.scene?.gates ?? [];
    if (gates.length < 2) {
      return out.copy(dome.centre);
    }
    const at = Math.min(gates.length - 1.001, t * (gates.length - 1));
    const i = Math.floor(at);
    const f = at - i;
    const x0 = gates[i].x,
      x1 = gates[i + 1].x;
    const y0 = gates[i].pathY,
      y1 = gates[i + 1].pathY;
    const runFrom = gates[0].x;
    const runTo = gates[gates.length - 1].x;
    const alongRun = (x0 + (x1 - x0) * f - runFrom) / (runTo - runFrom);
    const height =
      (y0 + (y1 - y0) * f - LAIR.floorY) / (LAIR.ceilingY - LAIR.floorY);
    // Drawn across z, not across x.
    //
    // The chamber is watched from along the cave's own axis, so a map laid out
    // the way the cave runs is seen end-on and reads as a single line. Turned a
    // quarter turn it faces the camera, which is the whole point of drawing it.
    return out.set(
      dome.centre.x - DOME.danceStandoff,
      DOME.danceFloor + (height - 0.5) * DOME.danceHeight,
      dome.centre.z + (alongRun - 0.5) * DOME.danceSize,
    );
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
