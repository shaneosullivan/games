import * as THREE from 'three';
import {
  INTERIOR,
  LEVELS,
  POLLEN_COLOR,
  POLLEN_LABEL,
  type PollenKind,
} from '../config';
import type { PollenStore } from '../render/geometry/hiveInterior';
import { FIREWORK_PALETTE } from '../fx/particles';
import type { GameContext, Level } from './level';

const TOTAL_BABIES = LEVELS.babyCount;
/** Long enough for all six to leave their perches and get properly airborne. */
const CELEBRATION_TIME = 4.2;

type Phase = 'feeding' | 'celebrating' | 'done';

const tmp = new THREE.Vector3();
const FIREWORK_LIFT = new THREE.Vector3(0, 0.9, 0);

/**
 * Level 2 — The Royal Chamber.
 *
 * The queen is stationary on her dais with a ring of babies around her. The
 * player is now a worker: load pollen from one of the three wall stores, carry
 * it to a baby craving that colour, repeat. Three feeds and a baby grows up;
 * all six grown finishes the level.
 *
 * The bee carries one load at a time. That's deliberate — it keeps the loop a
 * legible there-and-back rather than a routing puzzle, and it gives the
 * beacon exactly one thing to point at.
 */
export class RoyalChamberLevel implements Level {
  readonly name = 'The Royal Chamber';
  readonly completionTitle = 'The brood is grown!';
  readonly completionBody =
    'Every baby bee has grown up strong, and the whole hive is flying. Wonderful work.';

  complete = false;
  private phase: Phase = 'feeding';
  private phaseTime = 0;
  private elapsed = 0;
  private nextFirework = 0;
  private fireworkIndex = 0;

  /** What the worker is holding, or null. */
  private carrying: PollenKind | null = null;

  /** Dwell progress while loading up at a store. */
  private loadTarget: PollenStore | null = null;
  private loadTime = 0;
  /** Last objective string state, so we only touch the DOM when it changes. */
  private objectiveKey = '';

  get controlsLocked(): boolean {
    return this.phase === 'celebrating';
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment('hive');
    ctx.configureFlight({
      boundsRadius: INTERIOR.boundsRadius,
      minHeight: INTERIOR.minHeight,
      maxHeight: INTERIOR.maxHeight,
      cameraDistance: INTERIOR.cameraDistance,
      cameraHeight: INTERIOR.cameraHeight,
    });
    ctx.placeBee(ctx.interior.entryPosition, 3.2);
    // The player is a worker in here — the crown belongs to the queen on the dais.
    ctx.bee.setCrown(false);

    ctx.hud.setBanner(this.name);
    ctx.hud.setCounters([
      {
        key: 'grown',
        label: 'Grown up',
        color: 0xffd23f,
        value: ctx.babies.grownCount,
        target: TOTAL_BABIES,
      },
    ]);
    this.phase = ctx.babies.allGrown ? 'done' : 'feeding';
    this.complete = false;
    this.carrying = null;
    ctx.hud.setCarrying(null);
    this.refreshObjective(ctx);
  }

  update(dt: number, ctx: GameContext): void {
    this.elapsed += dt;
    ctx.interior.update(this.elapsed);

    if (this.phase === 'celebrating') {
      this.updateCelebration(dt, ctx);
      return;
    }
    if (this.phase === 'done') {
      ctx.babies.update(dt, ctx.bee.position, null);
      return;
    }

    this.phaseTime += dt;
    this.updateLoading(dt, ctx);

    const fed = ctx.babies.update(dt, ctx.bee.position, this.carrying);
    if (fed) this.onFed(ctx, fed.position, fed.kind, fed.grewUp);
    // That last feed may have kicked off the celebration; if so, everything
    // below would immediately undo the HUD it just set up.
    if (this.phase !== 'feeding') return;

    // Dwell meter shows whichever action is in progress.
    const dwell = this.carrying
      ? ctx.babies.feedProgress
      : this.loadTarget
        ? Math.min(1, this.loadTime / INTERIOR.pickupSeconds)
        : 0;
    ctx.hud.setHarvest(dwell);

    this.updateBeacon(ctx);

    // Babies get hungry on their own clocks, so the objective has to track
    // what's wanted rather than only refreshing on pickups and feeds.
    const key = `${this.carrying ?? '-'}|${this.wantedElsewhere(ctx) ?? '-'}`;
    if (key !== this.objectiveKey) {
      this.objectiveKey = key;
      this.refreshObjective(ctx);
    }
  }

  /** Hovering over a store loads that colour, replacing anything held. */
  private updateLoading(dt: number, ctx: GameContext): void {
    const near = this.nearestStore(ctx);
    if (near !== this.loadTarget) {
      this.loadTarget = near;
      this.loadTime = 0;
    }
    if (!this.loadTarget) return;

    // Already holding this colour? Nothing to do.
    if (this.carrying === this.loadTarget.kind) return;

    this.loadTime += dt;
    if (this.loadTime < INTERIOR.pickupSeconds) return;

    this.carrying = this.loadTarget.kind;
    this.loadTime = 0;
    ctx.hud.setCarrying(this.carrying, POLLEN_LABEL[this.carrying]);
    ctx.audio.collect(1);
    ctx.puff.burst(tmp.copy(this.loadTarget.position).setY(this.loadTarget.position.y + 0.2), {
      color: POLLEN_COLOR[this.carrying],
      count: 14,
    });
    this.refreshObjective(ctx);
  }

  private onFed(ctx: GameContext, at: THREE.Vector3, kind: PollenKind, grewUp: boolean): void {
    this.carrying = null;
    ctx.hud.setCarrying(null);
    ctx.puff.burst(at, { color: POLLEN_COLOR[kind], count: 18, speed: 2.0 });
    ctx.hud.setCount('grown', ctx.babies.grownCount, TOTAL_BABIES, grewUp);

    // Spend the pollen the queen gathered in level 1, so the stores feel real.
    ctx.save.mutate((d) => {
      d.pollen[kind] = Math.max(0, d.pollen[kind] - 1);
    });

    if (grewUp) {
      ctx.audio.quotaComplete();
      ctx.fireworks.burst(tmp.copy(at).setY(at.y + 1.2), {
        color: FIREWORK_PALETTE,
        count: 26,
        speed: 3.2,
        lift: 0.6,
        gravity: 2.4,
        ttl: 1.2,
        spherical: 1,
      });
    } else {
      ctx.audio.collect(2);
    }

    if (ctx.babies.allGrown) this.beginCelebration(ctx);
    else this.refreshObjective(ctx);
  }

  private beginCelebration(ctx: GameContext): void {
    this.phase = 'celebrating';
    this.phaseTime = 0;
    this.nextFirework = 0;
    this.fireworkIndex = 0;
    this.carrying = null;
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);
    ctx.hud.setObjective('Everybody up!');
    ctx.setObjectiveMarker(null);
    ctx.audio.levelComplete();
    ctx.flashScreen();
    // Off the perches and into the air.
    ctx.babies.beginCelebration();
  }

  private updateCelebration(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    ctx.babies.update(dt, ctx.bee.position, null);

    this.nextFirework -= dt;
    if (this.nextFirework <= 0 && this.phaseTime < CELEBRATION_TIME - 0.4) {
      this.nextFirework = 0.24;
      // Alternate between bursting on a rising baby and somewhere overhead, so
      // the fireworks read as being *for* them rather than just decoration.
      if (this.fireworkIndex % 2 === 0) {
        tmp.copy(ctx.babies.positionOf(this.fireworkIndex >> 1)).add(FIREWORK_LIFT);
      } else {
        const a = this.phaseTime * 3.1 + Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 7;
        tmp.set(Math.cos(a) * r, 5 + Math.random() * 5, Math.sin(a) * r);
      }
      this.fireworkIndex++;
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 32,
        speed: 4.2,
        lift: 0.4,
        gravity: 2.2,
        ttl: 1.5,
        spherical: 1,
      });
    }

    if (this.phaseTime >= CELEBRATION_TIME) {
      this.phase = 'done';
      this.complete = true;
      ctx.save.mutate((d) => {
        d.level = 3;
      });
      this.refreshObjective(ctx);
    }
  }

  /**
   * Empty-handed, point at a hungry baby so the player learns what's wanted.
   * Holding pollen, point at whoever wants that colour — or back at a store if
   * nobody does, since the load can be swapped.
   */
  private updateBeacon(ctx: GameContext): void {
    if (this.carrying) {
      const target = ctx.babies.guidanceTarget(ctx.bee.position, this.carrying);
      if (target) {
        ctx.setObjectiveMarker(target);
        return;
      }
      const store = this.storeFor(ctx, this.wantedElsewhere(ctx));
      ctx.setObjectiveMarker(store ? store.position.clone() : null);
      return;
    }

    const wanted = this.wantedElsewhere(ctx);
    const store = this.storeFor(ctx, wanted);
    ctx.setObjectiveMarker(store ? store.position.clone() : null);
  }

  /** The colour the most babies are asking for right now. */
  private wantedElsewhere(ctx: GameContext): PollenKind | null {
    const cravings = ctx.babies.cravings();
    if (cravings.length === 0) return null;
    const tally = new Map<PollenKind, number>();
    for (const k of cravings) tally.set(k, (tally.get(k) ?? 0) + 1);
    let best: PollenKind | null = null;
    let bestN = 0;
    for (const [k, n] of tally) {
      if (n > bestN) {
        bestN = n;
        best = k;
      }
    }
    return best;
  }

  private storeFor(ctx: GameContext, kind: PollenKind | null): PollenStore | null {
    if (!kind) return null;
    return ctx.interior.stores.find((s) => s.kind === kind) ?? null;
  }

  private nearestStore(ctx: GameContext): PollenStore | null {
    let best: PollenStore | null = null;
    let bestDist = INTERIOR.pickupRadius * INTERIOR.pickupRadius;
    for (const store of ctx.interior.stores) {
      const d = store.position.distanceToSquared(ctx.bee.position);
      if (d < bestDist) {
        bestDist = d;
        best = store;
      }
    }
    return best;
  }

  private refreshObjective(ctx: GameContext): void {
    if (this.phase === 'done') {
      ctx.hud.setObjective('The whole brood is grown!');
      return;
    }
    if (this.carrying) {
      ctx.hud.setObjective(`Take the ${POLLEN_LABEL[this.carrying]} pollen to a hungry baby`);
      return;
    }
    const wanted = this.wantedElsewhere(ctx);
    ctx.hud.setObjective(
      wanted
        ? `A baby wants ${POLLEN_LABEL[wanted]} — collect some from the stores`
        : 'The babies are full for now',
    );
  }

  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== 'done') return;
    // Nothing left to feed, so just hand the chamber back for free flight.
    this.complete = false;
    ctx.hud.setObjective('Fly around your hive');
    ctx.setObjectiveMarker(null);
    ctx.bee.bounds.radius = INTERIOR.boundsRadius;
    ctx.bee.desiredHeight = Math.min(ctx.bee.desiredHeight, INTERIOR.maxHeight);
  }
}
