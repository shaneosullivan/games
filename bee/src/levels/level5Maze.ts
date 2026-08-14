import * as THREE from "three";
import {MAZE, MAZE_PALETTE, POLLEN_COLOR} from "../config";
import {Rng} from "../core/rng";
import {PollenTrail} from "../entities/pollenTrail";
import {ScentTrail} from "../entities/scentTrail";
import {FIREWORK_PALETTE} from "../fx/particles";
import {
  createMazeScene,
  type MazeFlower,
  type MazeScene,
} from "../render/geometry/maze";
import type {GameContext, Level} from "./level";
import {EAST, generateMaze, isOpen, NORTH, solve, SOUTH, WEST} from "./maze";

const CELEBRATION_TIME = 3.4;

type Phase = "exploring" | "eating" | "surveying" | "celebrating" | "done";

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const surveyEye = new THREE.Vector3();

/** Which way each side of a cell faces, for pointing the bee down a corridor. */
const FACING: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 5 — The Windy Woods.
 *
 * A maze of trees, generated fresh on every entry so it can't be learned. The
 * level's whole design is about being lost gracefully: the bee drops pollen
 * behind her so a corridor she's already tried looks different from one she
 * hasn't, and every dead end holds a flower. Eating one lifts the camera up
 * over the woods for a look at the whole maze and leaves a scent along the
 * correct way out — enough of a nudge to get going again, not enough to solve
 * it, which is why the other dead ends still have something to offer.
 *
 * The maze is rebuilt in `enter()` rather than owned by the Game, because a
 * fresh one every time is the point. It lives in the Game's `woods` group,
 * which is what `setEnvironment` toggles, and `exit()` empties it again.
 */
export class MazeLevel implements Level {
  readonly name = "The Windy Woods";
  readonly completionTitle = "Out of the woods!";
  readonly completionBody =
    "You found your way through every twist and turn of the Windy Woods. Not one wrong turn could stop you.";

  complete = false;

  private phase: Phase = "exploring";
  private phaseTime = 0;
  private elapsed = 0;
  private scene: MazeScene | null = null;
  private readonly crumbs = new PollenTrail();
  private readonly scent = new ScentTrail();
  private eating: MazeFlower | null = null;
  private eaten = 0;
  private nextFirework = 0;
  /** How much the scent motes are grown for the survey shot. 1 on the ground. */
  private scentScale = 1;
  /**
   * How far the shot has swung up out of a tree: 0 behind her, 1 overhead.
   *
   * `wanted` is decided by the confine below, which is the only thing that
   * knows where the rig was trying to stand; `overhead` chases it in `update`,
   * which is the only thing with a `dt`. One frame of lag between the two, and
   * invisible at these rates.
   */
  private overhead = 0;
  private overheadWanted = 0;
  /** Set by the confine each frame; turned into `overheadWanted` in update. */
  private blocked = false;
  /** How long it has been blocked, for MAZE.overheadDwell. */
  private blockedFor = 0;

  /**
   * When the way behind the bee is a trunk, swing the boom up and look down on
   * her from above until she's clear again.
   *
   * Shortening the boom instead is the obvious move and it isn't good enough
   * here: a maze is full of blocked shots, and creeping the eye toward her
   * only presses it against the bark — you spend a dead end looking at a tree
   * with the bee somewhere underneath it. Rotating the boom up escapes through
   * the one direction that is always open, which in a corridor is the sky.
   *
   * The swing carries the length with it: at `overheadPitch` a full-length
   * boom would put the eye in the canopy, so it shortens to `overheadBoom` on
   * the way up. The corridor clamp at the end is the backstop for the case
   * where she is hard against a wall and even the short offset leans into it.
   *
   * Bound once, so the rig is handed the same function for the whole level.
   */
  private readonly confine = (eye: THREE.Vector3, bee: THREE.Vector3): void => {
    const scene = this.scene;
    if (!scene) {
      return;
    }
    const w = MAZE.corridorHalfWidth - 0.7;
    // Asked of the shot the rig *wanted*, not of where we've put it, so it
    // keeps reporting whether behind has become clear again. And asked as a
    // line from the bee, not as a point: a point eight units back sits happily
    // inside the next cell's corridor even with a wall in between.
    this.blocked = !scene.clearBetween(bee, eye, w);
    if (this.overhead < 0.001) {
      return;
    }

    const boom = tmp.copy(eye).sub(bee);
    const length = boom.length();
    if (length < 1e-4) {
      return;
    }
    // Split the boom into "which way back" and "how far up", so the swing is a
    // rotation about the bee rather than a slide across the corridor.
    const flat = Math.hypot(boom.x, boom.z);
    const pitch = Math.atan2(boom.y, flat);
    const k = this.overhead;
    const nextPitch = pitch + (MAZE.overheadPitch - pitch) * k;
    const nextLength = length + (MAZE.overheadBoom - length) * k;
    const back = flat < 1e-4 ? 0 : (Math.cos(nextPitch) * nextLength) / flat;

    eye.set(
      bee.x + boom.x * back,
      bee.y + Math.sin(nextPitch) * nextLength,
      bee.z + boom.z * back,
    );
    scene.confine(eye, w);
  };

  get controlsLocked(): boolean {
    return this.phase !== "exploring";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("woods");

    // A new maze every time, seeded off the clock — the brief is explicit that
    // it must not be learnable, and a fixed seed would make it a memory test.
    const rng = new Rng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    const maze = generateMaze(MAZE.cols, MAZE.rows, rng);
    this.scene = createMazeScene(maze, rng);
    ctx.woods.add(this.scene.group);
    this.scene.group.add(this.crumbs.mesh, this.scent.mesh);
    this.crumbs.reset();
    this.scent.reset();

    ctx.configureFlight({
      boundsRadius: MAZE.boundsRadius,
      // Corridors are narrow and the camera is often part-way round a corner,
      // so "the way the stick points" stops meaning anything useful. Turning
      // on the spot always does.
      steering: "tank",
      minHeight: MAZE.minHeight,
      maxHeight: MAZE.maxHeight,
      cameraDistance: MAZE.cameraDistance,
      cameraHeight: MAZE.cameraHeight,
    });
    // configureFlight clears the confine, so this has to follow it.
    ctx.setCameraConfine(this.confine);

    this.scene.cellCentre(maze.start, tmp);
    ctx.placeBee(
      tmp.clone().setY(MAZE.minHeight + 0.8),
      MAZE.minHeight + 0.8,
      startYaw(this.scene),
    );
    ctx.bee.setCrown(true);
    ctx.bee.scripted = false;

    this.phase = "exploring";
    this.phaseTime = 0;
    this.elapsed = 0;
    this.eating = null;
    this.eaten = 0;
    this.complete = false;

    ctx.hud.setBanner(this.name);
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);
    ctx.hud.setCounters([
      {
        key: "flowers",
        label: "Flowers",
        color: MAZE_PALETTE.scent,
        value: 0,
        target: this.scene.flowers.length,
      },
    ]);
    ctx.hud.setObjective("Find your way out of the woods!");
    ctx.setObjectiveMarker(null);
  }

  /** The woods are rebuilt on entry, so nothing here outlives the level. */
  exit(ctx: GameContext): void {
    ctx.setCameraConfine(null);
    if (!this.scene) {
      return;
    }
    // The trails are ours and get reused, so take them out before the group
    // they were parented to is thrown away with everything in it.
    this.scene.group.remove(this.crumbs.mesh, this.scent.mesh);
    ctx.woods.remove(this.scene.group);
    this.scene.dispose();
    this.scene = null;
  }

  update(dt: number, ctx: GameContext): void {
    const scene = this.scene;
    if (!scene) {
      return;
    }
    this.elapsed += dt;
    this.phaseTime += dt;

    // Above the phase switch: the woods keep blowing and the scent keeps
    // pulsing whatever else is going on, including from the survey shot.
    scene.update(this.elapsed, dt, ctx.bee.position);
    this.scent.update(this.elapsed, this.scentScale);

    // A corner blocks the shot for a moment every time; only a blockage that
    // outstays `overheadDwell` is worth swinging up for.
    this.blockedFor = this.blocked ? this.blockedFor + dt : 0;
    this.overheadWanted = this.blockedFor >= MAZE.overheadDwell ? 1 : 0;

    // Chase the swing. Up fast, down gently — see the note on MAZE.overheadIn.
    const rate =
      this.overheadWanted > this.overhead ? MAZE.overheadIn : MAZE.overheadOut;
    this.overhead +=
      (this.overheadWanted - this.overhead) * (1 - Math.exp(-rate * dt));

    switch (this.phase) {
      case "exploring":
        this.updateExploring(ctx, scene);
        break;
      case "eating":
        this.updateEating(ctx);
        break;
      case "surveying":
        this.updateSurvey(ctx, scene);
        break;
      case "celebrating":
        this.updateCelebration(dt, ctx);
        break;
      case "done":
        break;
    }
  }

  private updateExploring(ctx: GameContext, scene: MazeScene): void {
    // The walls. Doing this here rather than in the flight model keeps the
    // maze's shape in the maze: BeeActor only knows about a disc and a ceiling.
    if (scene.confine(ctx.bee.position, MAZE.corridorHalfWidth)) {
      // Shed the speed she was carrying into the trunk, or she'd grind along
      // the wall at full tilt with the stick still pushed at it.
      ctx.bee.velocity.multiplyScalar(0.45);
    }

    this.crumbs.update(ctx.bee.position);

    for (const flower of scene.flowers) {
      if (flower.eaten) {
        continue;
      }
      if (flower.position.distanceTo(ctx.bee.position) < MAZE.eatRadius) {
        this.beginEating(ctx, scene, flower);
        return;
      }
    }

    if (
      tmpB
        .copy(scene.exitPosition)
        .setY(ctx.bee.position.y)
        .distanceTo(ctx.bee.position) < MAZE.exitRadius
    ) {
      this.beginCelebration(ctx);
    }
  }

  /**
   * She takes the flower, and it shows her the way.
   *
   * The scent is laid at the same moment so it's already there when the survey
   * shot rises — the point of going up is to see it, and a trail that appeared
   * afterwards would read as a cutaway rather than as something she found.
   */
  private beginEating(
    ctx: GameContext,
    scene: MazeScene,
    flower: MazeFlower,
  ): void {
    this.phase = "eating";
    this.phaseTime = 0;
    this.eating = flower;
    flower.eaten = true;
    this.eaten++;

    // Hold her still for the beat — `scripted` hands her position to us.
    ctx.bee.scripted = true;
    ctx.bee.velocity.set(0, 0, 0);

    ctx.audio.collect(2);
    ctx.puff.burst(flower.position, {
      color: POLLEN_COLOR[flower.kind],
      count: 22,
      speed: 2.4,
      spherical: 0.6,
    });
    ctx.fireworks.burst(tmp.copy(flower.position).add(tmpB.set(0, 0.8, 0)), {
      color: FIREWORK_PALETTE,
      count: 26,
      speed: 3.4,
      lift: 0.7,
      gravity: 2.6,
      ttl: 1.2,
      spherical: 1,
    });

    this.layScent(scene, flower);

    ctx.hud.setCount("flowers", this.eaten, scene.flowers.length, true);
    ctx.hud.setObjective("The flower shows you the way…");
  }

  /** Mark the next stretch of the only route out, starting at this flower. */
  private layScent(scene: MazeScene, flower: MazeFlower): void {
    const route = solve(scene.maze, flower.cell, scene.maze.exit);
    if (route.length < 2) {
      return;
    }
    const shown = route.slice(0, MAZE.scentCells + 1);
    this.scent.reveal(
      shown.map(cell => scene.cellCentre(cell, new THREE.Vector3())),
    );
  }

  private updateEating(ctx: GameContext): void {
    const flower = this.eating;
    if (!flower) {
      this.beginSurvey(ctx);
      return;
    }
    const t = Math.min(1, this.phaseTime / MAZE.eatTime);
    // The bloom shrinks away and leans toward her as she takes it.
    flower.head.scale.setScalar(Math.max(0.001, 1 - t));
    flower.head.position.lerpVectors(tmp.set(0, 0, 0), tmpB.set(0, 0.25, 0), t);
    if (t >= 1) {
      flower.head.visible = false;
      this.eating = null;
      this.beginSurvey(ctx);
    }
  }

  private beginSurvey(ctx: GameContext): void {
    this.phase = "surveying";
    this.phaseTime = 0;
    // The survey drives the camera itself, so the confine stops being called
    // and the swing would otherwise still be part-way up when it hands back.
    this.overhead = 0;
    this.overheadWanted = 0;
    this.blockedFor = 0;
    // Where the shot is now, so the rise starts from it and the fall comes
    // back to it — she can't have moved, the controls are locked.
    fromEye.copy(ctx.cameraPosition);
    fromLook.copy(ctx.bee.position);
    ctx.hud.setObjective("Follow the scent!");
  }

  /** Up over the woods, a long look at the whole maze, then back down. */
  private updateSurvey(ctx: GameContext, scene: MazeScene): void {
    surveyEye.copy(
      ctx.framedCameraEye(
        scene.centre,
        scene.halfWidth,
        MAZE.surveyPitch,
        MAZE.surveyFill,
      ),
    );

    const {surveyRise: rise, surveyHold: hold, surveyFall: fall} = MAZE;
    const t = this.phaseTime;
    let k: number;
    if (t < rise) {
      k = ease(t / rise);
    } else if (t < rise + hold) {
      k = 1;
    } else if (t < rise + hold + fall) {
      k = 1 - ease((t - rise - hold) / fall);
    } else {
      // Hand it back to the follow rig, which glides in from here.
      ctx.setCameraCinematic(null);
      ctx.setFogScale(1);
      this.scentScale = 1;
      ctx.bee.scripted = false;
      this.phase = "exploring";
      this.phaseTime = 0;
      ctx.hud.setObjective("Find your way out of the woods!");
      return;
    }

    this.scentScale = 1 + (MAZE.scentSurveyScale - 1) * k;
    eye.lerpVectors(fromEye, surveyEye, k);
    look.lerpVectors(fromLook, scene.centre, k);
    ctx.setCameraCinematic(eye, look);

    // Lift the fog as the shot rises, or there is nothing to see up there: the
    // woods are fogged out by 62 units precisely so you can't see across the
    // maze from inside it, and the survey stands 110 above the middle of it.
    ctx.setFogScale(1 + (MAZE.surveyFogScale - 1) * k);
  }

  private beginCelebration(ctx: GameContext): void {
    this.phase = "celebrating";
    this.phaseTime = 0;
    this.nextFirework = 0;
    ctx.bee.scripted = true;
    ctx.bee.velocity.set(0, 0, 0);
    ctx.audio.levelComplete();
    ctx.flashScreen();
    ctx.hud.setObjective("You're out!");
  }

  private updateCelebration(dt: number, ctx: GameContext): void {
    this.nextFirework -= dt;
    if (this.nextFirework <= 0 && this.phaseTime < CELEBRATION_TIME - 0.5) {
      this.nextFirework = 0.22;
      const a = this.phaseTime * 2.7 + Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 7;
      tmp
        .copy(ctx.bee.position)
        .add(
          tmpB.set(Math.cos(a) * r, 1.5 + Math.random() * 5, Math.sin(a) * r),
        );
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 34,
        speed: 4.4,
        lift: 0.5,
        gravity: 2.2,
        ttl: 1.5,
        spherical: 1,
      });
    }

    if (this.phaseTime >= CELEBRATION_TIME) {
      this.phase = "done";
      this.complete = true;
      ctx.bee.scripted = false;
      ctx.hud.setObjective("Out of the woods!");
    }
  }

  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== "done") {
      return;
    }
    // Nothing left to find, so hand the woods back for a free fly-around.
    this.complete = false;
    ctx.hud.setObjective("Fly around the woods");
  }
}

/** Face the bee down whichever corridor leaves the start cell. */
function startYaw(scene: MazeScene): number {
  for (const side of [NORTH, EAST, SOUTH, WEST]) {
    if (isOpen(scene.maze, scene.maze.start, side)) {
      const [dx, dz] = FACING[side];
      return Math.atan2(dx, dz);
    }
  }
  return 0;
}
