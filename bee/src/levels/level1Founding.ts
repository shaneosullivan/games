import * as THREE from 'three';
import {
  CAMERA,
  FLIGHT,
  LEVELS,
  POLLEN_COLOR,
  POLLEN_KINDS,
  POLLEN_LABEL,
  WORLD,
  type PollenKind,
} from '../config';
import type { HarvestEvent } from '../entities/flowerField';
import { FIREWORK_PALETTE } from '../fx/particles';
import { HiveEntry, ENTRY_RADIUS } from './hiveEntry';
import type { GameContext, Level } from './level';

const QUOTA = LEVELS.foundingQuota;
const TOTAL = QUOTA.white + QUOTA.yellow + QUOTA.orange;

/** Cutscene timing, in seconds. */
const CELEBRATION_TIME = 2.4;

/** Golds and pinks picked to match the crown's band and jewels. */
const CROWN_SPARKLE = [0xffe066, 0xffd23f, 0xfff3c4, 0xff5b8a, 0xffb347] as const;

type Phase = 'gathering' | 'ready' | 'entering' | 'celebrating' | 'done';

const tmpA = new THREE.Vector3();

/**
 * Level 1 — Founding the hive.
 *
 * The queen gathers a quota of each of the three flowers. Every collection
 * grows the hive on its branch, so the goal is legible from the air without a
 * tutorial. Progress is read from the save's lifetime `gathered` totals, so
 * closing the tab mid-level loses nothing.
 *
 * When the quota is met the hive finishes, lights up with a rainbow halo, and
 * the level waits: it isn't over until the player flies the bee into the
 * doorway, which shrinks her inside and sets off fireworks.
 */
export class FoundingLevel implements Level {
  readonly name = 'Sunny Meadow';
  readonly completionTitle = 'The hive is built!';
  readonly completionBody =
    'Your hive is founded. Next you become a worker bee and start filling the comb with honey hexagons.';

  complete = false;

  private phase: Phase = 'gathering';
  private phaseTime = 0;
  private readonly entry = new HiveEntry();
  private nextFirework = 0;

  /** Cycles the beacon between kinds still needed, so it never nags about one. */
  private beaconTimer = 0;
  private beaconKind: PollenKind = 'white';
  private streak = 0;
  private streakTimer = 0;

  get controlsLocked(): boolean {
    return this.phase === 'entering' || this.phase === 'celebrating';
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment('meadow');
    ctx.configureFlight({
      boundsRadius: WORLD.radius,
      minHeight: FLIGHT.minHeight,
      maxHeight: FLIGHT.maxHeight,
      cameraDistance: CAMERA.distance,
      cameraHeight: CAMERA.height,
    });
    // Out in the meadow facing the hive. Every level places the bee itself, so
    // arriving here from anywhere else is always well-defined.
    ctx.placeBee(tmpA.set(0, FLIGHT.hoverHeight, 14), FLIGHT.hoverHeight);

    ctx.hud.setBanner(this.name);
    ctx.hud.setCounters(
      POLLEN_KINDS.map((kind) => ({
        key: kind,
        label: POLLEN_LABEL[kind],
        color: POLLEN_COLOR[kind],
        value: Math.min(this.got(ctx, kind), QUOTA[kind]),
        target: QUOTA[kind],
      })),
    );
    ctx.hud.setCarrying(null);
    const p = this.progress(ctx);
    ctx.hive.setProgress(p);

    // Resuming a save where the quota was already met: hive lit, doorway open,
    // but the level still wants the player to fly in.
    this.phase = p >= 1 ? 'ready' : 'gathering';
    this.complete = false;
    ctx.hive.setGlow(p >= 1);
    ctx.bee.scripted = false;
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    // Resuming with the hive already built means she's already earned the
    // crown — restore it silently; no sparkle for something that isn't new.
    ctx.bee.setCrown(p >= 1);
    this.refreshObjective(ctx);
  }

  update(dt: number, ctx: GameContext, harvest: HarvestEvent | null): void {
    switch (this.phase) {
      case 'gathering':
        if (harvest) this.onHarvest(ctx, harvest);
        this.updateBeacon(dt, ctx);
        break;

      case 'ready':
        // Beacon points at the door now, not at flowers.
        ctx.setObjectiveMarker(tmpA.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 1.4));
        if (ctx.bee.position.distanceTo(ctx.hive.entrance) < ENTRY_RADIUS) {
          this.beginEntry(ctx);
        }
        break;

      case 'entering':
        this.updateEntry(dt, ctx);
        break;

      case 'celebrating':
        this.updateCelebration(dt, ctx);
        break;

      case 'done':
        break;
    }

    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.streak = 0;
  }

  // ---- gathering ----------------------------------------------------------

  private updateBeacon(dt: number, ctx: GameContext): void {
    this.beaconTimer -= dt;
    if (this.beaconTimer <= 0) {
      this.beaconTimer = 4;
      const needed = POLLEN_KINDS.filter((k) => this.got(ctx, k) < QUOTA[k]);
      if (needed.length > 0) {
        const i = (needed.indexOf(this.beaconKind) + 1) % needed.length;
        this.beaconKind = needed[i];
      }
    }
    if (this.got(ctx, this.beaconKind) < QUOTA[this.beaconKind]) {
      ctx.setObjectiveMarker(ctx.flowers.nearestOfKind(this.beaconKind, ctx.bee.position));
    } else {
      ctx.setObjectiveMarker(null);
    }
  }

  private onHarvest(ctx: GameContext, harvest: HarvestEvent): void {
    const { kind, position } = harvest;
    const already = this.got(ctx, kind);

    ctx.puff.burst(position, { color: POLLEN_COLOR[kind], count: 16 });

    // Over-quota flowers still bank pollen for level 2, they just don't count here.
    ctx.save.mutate((d) => {
      d.pollen[kind] += 1;
      d.gathered[kind] += 1;
    });

    const now = this.got(ctx, kind);
    ctx.hud.setCount(kind, Math.min(now, QUOTA[kind]), QUOTA[kind], true);

    if (already >= QUOTA[kind]) {
      ctx.audio.collect(0);
      return;
    }

    ctx.audio.collect(this.streak);
    this.streak = Math.min(this.streak + 1, 5);
    this.streakTimer = 2.4;

    ctx.hive.setProgress(this.progress(ctx));
    if (now === QUOTA[kind]) {
      ctx.audio.quotaComplete();
      this.streak = 0;
    }

    if (this.progress(ctx) >= 1) {
      this.onHiveFinished(ctx);
    } else {
      this.refreshObjective(ctx);
    }
  }

  /** Quota met: the hive is whole, lights up, and the queen gets her crown. */
  private onHiveFinished(ctx: GameContext): void {
    this.phase = 'ready';
    ctx.hive.setProgress(1);
    ctx.hive.setGlow(true);
    ctx.audio.quotaComplete();
    ctx.puff.burst(tmpA.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 0.6), {
      color: FIREWORK_PALETTE,
      count: 26,
      speed: 2.4,
      ttl: 1.1,
    });

    // She's founded a hive — she's a queen now, and wears it.
    ctx.bee.setCrown(true);
    this.sparkleCrown(ctx);
    this.refreshObjective(ctx);
    // Note: the save does NOT advance to level 2 here. The level isn't over
    // until the queen is actually inside, so quitting now resumes at 'ready'.
  }

  /**
   * Gold sparkle bursting off the crown as it appears. Two rings — a tight
   * bright one right on the head and a slower halo drifting outward — so the
   * moment reads even if the player is looking at the hive instead.
   */
  private sparkleCrown(ctx: GameContext): void {
    ctx.bee.headPosition(tmpA);
    ctx.puff.burst(tmpA, {
      color: CROWN_SPARKLE,
      count: 26,
      speed: 1.9,
      lift: 1.1,
      gravity: 3.2,
      ttl: 0.85,
      size: 0.85,
      spherical: 1,
    });
    ctx.fireworks.burst(tmpA, {
      color: CROWN_SPARKLE,
      count: 18,
      speed: 3.4,
      lift: 0.5,
      gravity: 1.6,
      ttl: 1.3,
      size: 0.7,
      spherical: 1,
    });
  }

  // ---- flying into the hive ----------------------------------------------

  private beginEntry(ctx: GameContext): void {
    this.phase = 'entering';
    this.entry.begin(ctx);
    // The glow advertises an enterable doorway; she's already going in.
    ctx.hive.setGlow(false);
    ctx.hud.setObjective('Welcome home!');
  }

  private updateEntry(dt: number, ctx: GameContext): void {
    if (this.entry.update(dt, ctx)) this.beginCelebration(ctx);
  }

  // ---- fireworks ----------------------------------------------------------

  private beginCelebration(ctx: GameContext): void {
    this.phase = 'celebrating';
    this.phaseTime = 0;
    this.nextFirework = 0;
    ctx.bee.object.visible = false;
    ctx.audio.levelComplete();
    ctx.flashScreen();
    this.launchFirework(ctx, 0);
  }

  private updateCelebration(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;

    this.nextFirework -= dt;
    if (this.nextFirework <= 0 && this.phaseTime < CELEBRATION_TIME - 0.5) {
      this.nextFirework = 0.28;
      this.launchFirework(ctx, this.phaseTime);
    }

    if (this.phaseTime >= CELEBRATION_TIME) {
      // Back out on the doorstep. Dismissing the card hands over to level 2.
      this.entry.restore(ctx);

      this.phase = 'done';
      this.complete = true;
      ctx.save.mutate((d) => {
        d.level = 2;
      });
      this.refreshObjective(ctx);
    }
  }

  /** One burst at a random spot in a shell around the hive. */
  private launchFirework(ctx: GameContext, seed: number): void {
    const a = seed * 2.7 + Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 2.6;
    tmpA.set(
      ctx.hive.entrance.x + Math.cos(a) * r,
      ctx.hive.entrance.y + 0.4 + Math.random() * 3.4,
      ctx.hive.entrance.z + Math.sin(a) * r * 0.7,
    );
    ctx.fireworks.burst(tmpA, {
      color: FIREWORK_PALETTE,
      count: 34,
      speed: 4.6,
      lift: 0.4,
      gravity: 2.2,
      ttl: 1.5,
      size: 1,
      spherical: 1,
    });
  }

  /**
   * The player tapped "Keep flying" after the completion card. Re-arm the
   * doorway so flying in works again — otherwise the finished hive just sits
   * there and approaching it does nothing.
   */
  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== 'done') return;
    this.phase = 'ready';
    this.complete = false;
    ctx.hive.setGlow(true);
    ctx.bee.scripted = false;
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    ctx.bee.setCrown(true);
    this.refreshObjective(ctx);
  }

  // ---- shared -------------------------------------------------------------

  private refreshObjective(ctx: GameContext): void {
    if (this.phase === 'ready') {
      ctx.hud.setObjective('Fly into your new hive!');
      return;
    }
    if (this.phase === 'done') {
      ctx.hud.setObjective('Hive complete');
      return;
    }
    const outstanding = POLLEN_KINDS.filter((k) => this.got(ctx, k) < QUOTA[k]);
    if (outstanding.length === 0) {
      ctx.hud.setObjective('Fly into your new hive!');
      return;
    }
    const remaining = outstanding
      .map((k) => `${QUOTA[k] - this.got(ctx, k)} ${POLLEN_LABEL[k]}`)
      .join(' · ');
    ctx.hud.setObjective(`Gather ${remaining}`);
  }

  private got(ctx: GameContext, kind: PollenKind): number {
    return ctx.save.data.gathered[kind];
  }

  private progress(ctx: GameContext): number {
    let sum = 0;
    for (const kind of POLLEN_KINDS) sum += Math.min(this.got(ctx, kind), QUOTA[kind]);
    return THREE.MathUtils.clamp(sum / TOTAL, 0, 1);
  }
}
