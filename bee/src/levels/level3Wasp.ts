import * as THREE from "three";
import {CAMERA, FLIGHT, LEVELS, WASP, WORLD} from "../config";
import {FIREWORK_PALETTE} from "../fx/particles";
import {HiveEntry} from "./hiveEntry";
import type {GameContext, Level} from "./level";

const HOLD_TARGET = LEVELS.waspSeconds;
const CELEBRATION_TIME = 3.2;

type Phase = "defending" | "returning" | "entering" | "celebrating" | "done";

const tmp = new THREE.Vector3();

/**
 * Level 3 — Wasp at the Hive.
 *
 * Back in the meadow. A wasp turns up and circles the hive, and the only way
 * to shift it is to make yourself the more interesting target: cross its field
 * of view to hook it, then stay ahead of it. The countdown only runs while
 * it's actually chasing you, so hiding doesn't work — but neither does getting
 * clipped, which knocks you spinning and sends the wasp back to the hive.
 *
 * There's no losing. The worst case is that the wasp goes back to circling and
 * you have to bait it again.
 */
export class WaspLevel implements Level {
  readonly name = "Wasp at the Hive";
  readonly completionTitle = "The wasp is gone!";
  readonly completionBody =
    "You led it away and outflew it all the way home. The hive is safe, and it is all thanks to you.";

  complete = false;

  private phase: Phase = "defending";
  private phaseTime = 0;
  /** Seconds of chase held so far. */
  private held = 0;
  private shownSeconds = -1;
  private nextFirework = 0;
  private objectiveKey = "";
  /** True once the brood is out of the hive and needs ticking each frame. */
  private released = false;

  private readonly entry = new HiveEntry();

  get controlsLocked(): boolean {
    return this.phase === "entering" || this.phase === "celebrating";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("meadow");
    ctx.configureFlight({
      boundsRadius: WORLD.radius,
      minHeight: FLIGHT.minHeight,
      maxHeight: FLIGHT.maxHeight,
      cameraDistance: CAMERA.distance,
      cameraHeight: CAMERA.height,
    });

    // Her hive is built — that's what's being threatened. No glow yet though:
    // the glow means "you can fly in here", and right now you can't.
    ctx.hive.setProgress(1);
    ctx.hive.setGlow(false);
    ctx.placeBee(
      tmp.copy(ctx.hive.position).add(new THREE.Vector3(0, 3.2, 11)),
      3.2,
    );
    ctx.bee.setCrown(true);

    ctx.hud.setBanner(this.name);
    ctx.hud.setCounters([
      {
        key: "wasp",
        label: "Wasp leaving",
        color: 0xff6b6b,
        value: 0,
        target: HOLD_TARGET,
      },
    ]);
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);

    this.phase = "defending";
    this.complete = false;
    this.held = 0;
    this.shownSeconds = -1;
    this.objectiveKey = "";
    this.released = false;

    ctx.wasp.spawn(ctx.hive.position, 0.8);
  }

  update(dt: number, ctx: GameContext): void {
    // The brood needs ticking in every phase once it's out, and this has to
    // come before the early returns below or they hang motionless in the air.
    if (this.released) {
      ctx.babies.update(dt, ctx.bee.position, null);
    }

    if (this.phase === "celebrating") {
      this.updateCelebration(dt, ctx);
      return;
    }
    if (this.phase === "entering") {
      if (this.entry.update(dt, ctx)) {
        this.beginCelebration(ctx);
      }
      return;
    }
    if (this.phase === "returning") {
      // Same beat as level 1: the door is lit, fly in to finish.
      ctx.setObjectiveMarker(
        tmp.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 1.4),
      );
      if (HiveEntry.inRange(ctx)) {
        this.phase = "entering";
        this.entry.begin(ctx);
        ctx.hive.setGlow(false); // she's on her way in; nothing left to enter
        ctx.hud.setObjective("Home safe!");
      }
      return;
    }

    const event = ctx.wasp.update(dt, ctx.bee.position);
    if (this.phase === "done") {
      return;
    }

    switch (event) {
      case "bumped":
        this.onBumped(ctx);
        break;
      case "locked-on":
        ctx.audio.collect(0);
        break;
      default:
        break;
    }

    // The clock only runs while it's actually after you.
    if (ctx.wasp.phase === "chasing") {
      this.held = Math.min(HOLD_TARGET, this.held + dt);
      const whole = Math.floor(this.held);
      if (whole !== this.shownSeconds) {
        this.shownSeconds = whole;
        ctx.hud.setCount("wasp", whole, HOLD_TARGET, true);
      }
      if (this.held >= HOLD_TARGET) {
        ctx.wasp.leave();
        ctx.hud.setObjective("It has had enough — it is leaving!");
        ctx.setObjectiveMarker(null);
      }
    }

    if (event === "departed") {
      this.beginReturn(ctx);
      return;
    }

    // Pull the shot back while it's on your tail, so you can see it behind you
    // and judge the gap. Eases both ways.
    ctx.setCameraZoom(ctx.wasp.phase === "chasing" ? 2 : 1);

    // Menace rises as it closes in, and only while it's interested in you.
    const distance = ctx.wasp.position.distanceTo(ctx.bee.position);
    const closeness = THREE.MathUtils.clamp(
      1 - (distance - WASP.catchRadius) / 18,
      0,
      1,
    );
    ctx.audio.setThreat(
      ctx.wasp.phase === "chasing" ? closeness : closeness * 0.25,
    );

    this.updateGuidance(ctx);
  }

  private onBumped(ctx: GameContext): void {
    ctx.bee.knockBackFrom(
      ctx.wasp.position,
      WASP.knockbackSpeed,
      WASP.stunSeconds,
    );
    ctx.audio.sting();
    ctx.flashScreen();
    ctx.puff.burst(tmp.copy(ctx.bee.position).setY(ctx.bee.position.y + 0.3), {
      color: [0xff6b6b, 0xffd23f, 0xffffff],
      count: 18,
      speed: 2.6,
      ttl: 0.7,
      spherical: 1,
    });
  }

  /** Beacon and wording follow whatever the wasp is currently doing. */
  private updateGuidance(ctx: GameContext): void {
    const phase = ctx.wasp.phase;

    if (phase === "chasing") {
      ctx.setObjectiveMarker(null);
    } else if (
      phase === "seeking" ||
      phase === "arriving" ||
      phase === "veering"
    ) {
      ctx.setObjectiveMarker(
        tmp.copy(ctx.wasp.position).setY(ctx.wasp.position.y + 0.6),
      );
    } else {
      ctx.setObjectiveMarker(null);
    }

    if (this.held >= HOLD_TARGET) {
      return;
    } // "it is leaving" message stands

    const key = `${phase}|${ctx.bee.stunned}`;
    if (key === this.objectiveKey) {
      return;
    }
    this.objectiveKey = key;

    switch (phase) {
      case "arriving":
        ctx.hud.setObjective("A wasp is coming for the hive!");
        break;
      case "seeking":
        ctx.hud.setObjective("Fly in front of the wasp so it chases you");
        break;
      case "chasing":
        ctx.hud.setObjective("Now run! Keep ahead of it");
        break;
      case "veering":
        ctx.hud.setObjective("It knocked you back — go and bait it again");
        break;
      default:
        ctx.hud.setObjective("");
        break;
    }
  }

  /**
   * The wasp is gone. Rather than ending on the spot, send her home — the same
   * "fly into the hive" beat that closes level 1, so the meadow levels bookend
   * each other.
   */
  private beginReturn(ctx: GameContext): void {
    this.phase = "returning";
    ctx.setCameraZoom(1);
    ctx.audio.setThreat(0);
    ctx.audio.quotaComplete();
    ctx.hud.setObjective("The wasp is gone — fly back into your hive!");
    // The glow means "you can fly in here", so it comes on only now.
    ctx.hive.setGlow(true);
    // A puff over the door so the eye goes there.
    ctx.puff.burst(
      tmp.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 0.6),
      {
        color: FIREWORK_PALETTE,
        count: 26,
        speed: 2.4,
        ttl: 1.1,
      },
    );
    // The whole brood pours out to celebrate the all-clear.
    ctx.releaseBabies(ctx.hive.entrance);
    this.released = true;
  }

  private beginCelebration(ctx: GameContext): void {
    this.phase = "celebrating";
    this.phaseTime = 0;
    this.nextFirework = 0;
    ctx.hud.setObjective("The hive is safe!");
    ctx.setObjectiveMarker(null);
    ctx.setCameraZoom(1);
    ctx.audio.setThreat(0);
    ctx.audio.levelComplete();
    ctx.flashScreen();
  }

  private updateCelebration(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;

    this.nextFirework -= dt;
    if (this.nextFirework <= 0 && this.phaseTime < CELEBRATION_TIME - 0.4) {
      this.nextFirework = 0.26;
      const a = this.phaseTime * 2.7 + Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 6;
      tmp.set(
        ctx.hive.position.x + Math.cos(a) * r,
        6 + Math.random() * 5,
        ctx.hive.position.z + Math.sin(a) * r,
      );
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 32,
        speed: 4.4,
        lift: 0.4,
        gravity: 2.2,
        ttl: 1.5,
        spherical: 1,
      });
    }

    if (this.phaseTime >= CELEBRATION_TIME) {
      // Back out on the doorstep, as level 1 does.
      this.entry.restore(ctx);
      this.phase = "done";
      this.complete = true;
      ctx.save.mutate(d => {
        d.level = 4;
      });
    }
  }

  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== "done") {
      return;
    }
    this.complete = false;
    // The level is over: nothing to fly into, so no glow. Free flight with the
    // brood swarming around, and 🏠 to move on.
    ctx.hive.setGlow(false);
    ctx.hud.setObjective("Fly around your meadow");
    ctx.setObjectiveMarker(null);
    ctx.audio.setThreat(0);
  }
}
