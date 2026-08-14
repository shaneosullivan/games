import * as THREE from "three";
import {
  INTERIOR,
  LEVELS,
  POLLEN_COLOR,
  POLLEN_LABEL,
  type PollenKind,
} from "../config";
import {FIREWORK_PALETTE} from "../fx/particles";
import type {GameContext, Level} from "./level";

const TOTAL_BABIES = LEVELS.babyCount;
/** Long enough for all six to leave their perches and get properly airborne. */
const CELEBRATION_TIME = 4.2;

type Phase = "feeding" | "celebrating" | "done";

const tmp = new THREE.Vector3();
const FIREWORK_LIFT = new THREE.Vector3(0, 0.9, 0);

/**
 * Level 2 — The Royal Chamber.
 *
 * The queen is stationary on her dais with a ring of babies around her. The
 * player is now a worker, and the food is in the wall: the larder is a band of
 * honeycomb ringing the chamber, and the cells with something in them are
 * coloured and ringed with a pulsing glow. Fly to one and the hexagon comes
 * away with you, swinging under the bee on a rope; carry it to a baby craving
 * that colour and it rears up like a chick to take it.
 *
 * The bee carries one hexagon at a time. That's deliberate — it keeps the loop
 * a legible there-and-back rather than a routing puzzle, and it gives the
 * beacon exactly one thing to point at. Three feeds and a baby grows up; all
 * six grown finishes the level.
 */
export class RoyalChamberLevel implements Level {
  readonly name = "The Royal Chamber";
  readonly completionTitle = "The brood is grown!";
  readonly completionBody =
    "Every baby bee has grown up strong, and the whole hive is flying. Wonderful work.";

  complete = false;
  private phase: Phase = "feeding";
  private phaseTime = 0;
  private elapsed = 0;
  private nextFirework = 0;
  private fireworkIndex = 0;

  /**
   * A feed that has landed on a baby but whose hexagon is still in the air.
   *
   * The sparks, the counter and the celebration all wait for it to arrive, so
   * they answer the delivery rather than going off half a second before the
   * food gets there.
   */
  private pending: {
    at: THREE.Vector3;
    kind: PollenKind;
    grewUp: boolean;
  } | null = null;
  /** Last objective string state, so we only touch the DOM when it changes. */
  private objectiveKey = "";

  get controlsLocked(): boolean {
    return this.phase === "celebrating";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("hive");
    ctx.configureFlight({
      boundsRadius: INTERIOR.boundsRadius,
      boundsSphere: INTERIOR.boundsSphere,
      minHeight: INTERIOR.minHeight,
      maxHeight: INTERIOR.maxHeight,
      cameraDistance: INTERIOR.cameraDistance,
      cameraHeight: INTERIOR.cameraHeight,
      // The food is in the wall, so the bee flies right up to it — without
      // this the camera would spend every pickup outside the dome.
      cameraEnclosure: INTERIOR.cameraEnclosure,
    });
    ctx.placeBee(ctx.interior.entryPosition, 3.2);
    // The player is a worker in here — the crown belongs to the queen on the dais.
    ctx.bee.setCrown(false);
    // Both of these outlive any one level instance, so entering restarts them.
    ctx.babies.reset();
    ctx.larder.reset();

    ctx.hud.setBanner(this.name);
    ctx.hud.setCounters([
      {
        key: "grown",
        label: "Grown up",
        color: 0xffd23f,
        value: ctx.babies.grownCount,
        target: TOTAL_BABIES,
      },
    ]);
    this.phase = ctx.babies.allGrown ? "done" : "feeding";
    this.complete = false;
    this.pending = null;
    ctx.hud.setCarrying(null);
    this.refreshObjective(ctx);
  }

  update(dt: number, ctx: GameContext): void {
    this.elapsed += dt;
    ctx.interior.update(this.elapsed);

    // Above the phase branches: the hexagon's flight into a baby has to finish
    // even if that feed was the one that started the celebration, or it hangs
    // in the air over the party.
    if (ctx.larder.update(dt, ctx.bee.position) === "delivered") {
      this.onDelivered(ctx);
    }

    if (this.phase === "celebrating") {
      this.updateCelebration(dt, ctx);
      return;
    }
    if (this.phase === "done") {
      ctx.babies.update(dt, ctx.bee.position, null);
      return;
    }

    this.phaseTime += dt;
    this.updateTaking(ctx);

    const fed = ctx.babies.update(dt, ctx.bee.position, ctx.larder.carrying);
    if (fed) {
      this.onFed(ctx, fed.position, fed.kind, fed.grewUp);
    }

    // Dwell meter follows the hand-over.
    ctx.hud.setHarvest(ctx.babies.feedProgress);
    this.updateBeacon(ctx);

    // Babies get hungry on their own clocks, so the objective has to track
    // what's wanted rather than only refreshing on pickups and feeds.
    const key = `${ctx.larder.carrying ?? "-"}|${this.wantedElsewhere(ctx) ?? "-"}`;
    if (key !== this.objectiveKey) {
      this.objectiveKey = key;
      this.refreshObjective(ctx);
    }
  }

  /**
   * Flying up to a glowing cell takes its hexagon — or trades the one she's
   * already carrying for it, if it's a different colour.
   */
  private updateTaking(ctx: GameContext): void {
    const took = ctx.larder.tryTake(ctx.bee.position);
    if (!took) {
      return;
    }
    ctx.hud.setCarrying(took.kind, POLLEN_LABEL[took.kind]);
    ctx.audio.collect(1);
    // On a swap, two puffs: the colour going back into the wall as well as the
    // one coming out, so it reads as a trade and not as a pick-up she didn't
    // ask for.
    if (took.swapped) {
      ctx.puff.burst(took.at, {
        color: POLLEN_COLOR[took.swapped],
        count: 10,
        speed: 1.2,
      });
    }
    ctx.puff.burst(took.at, {color: POLLEN_COLOR[took.kind], count: 14});
    this.refreshObjective(ctx);
  }

  /**
   * The baby has taken it: send the hexagon on its way and hold everything
   * else until it lands.
   */
  private onFed(
    ctx: GameContext,
    at: THREE.Vector3,
    kind: PollenKind,
    grewUp: boolean,
  ): void {
    ctx.larder.deliverTo(at);
    this.pending = {at: at.clone(), kind, grewUp};
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);
  }

  /** The hexagon has reached the baby and vanished into it. */
  private onDelivered(ctx: GameContext): void {
    const fed = this.pending;
    if (!fed) {
      return;
    }
    this.pending = null;
    const {at, kind, grewUp} = fed;
    ctx.puff.burst(at, {color: POLLEN_COLOR[kind], count: 18, speed: 2.0});
    ctx.hud.setCount("grown", ctx.babies.grownCount, TOTAL_BABIES, grewUp);

    // Spend the pollen the queen gathered in level 1, so the larder feels real.
    ctx.save.mutate(d => {
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

    if (ctx.babies.allGrown) {
      this.beginCelebration(ctx);
    } else {
      this.refreshObjective(ctx);
    }
  }

  private beginCelebration(ctx: GameContext): void {
    this.phase = "celebrating";
    this.phaseTime = 0;
    this.nextFirework = 0;
    this.fireworkIndex = 0;
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);
    ctx.hud.setObjective("Everybody up!");
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
        tmp
          .copy(ctx.babies.positionOf(this.fireworkIndex >> 1))
          .add(FIREWORK_LIFT);
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
      this.phase = "done";
      this.complete = true;
      ctx.save.mutate(d => {
        d.level = 3;
      });
      this.refreshObjective(ctx);
    }
  }

  /**
   * Holding a hexagon, point at whoever wants that colour. Empty-handed —
   * or holding one nobody wants — point at a cell in the wall holding the
   * colour that is being asked for.
   */
  private updateBeacon(ctx: GameContext): void {
    const carrying = ctx.larder.carrying;
    if (carrying) {
      const target = ctx.babies.guidanceTarget(ctx.bee.position, carrying);
      if (target) {
        ctx.setObjectiveMarker(target);
        return;
      }
    }
    const wanted = this.wantedElsewhere(ctx);
    ctx.setObjectiveMarker(
      wanted ? ctx.larder.nearestFull(wanted, ctx.bee.position) : null,
    );
  }

  /** The colour the most babies are asking for right now. */
  private wantedElsewhere(ctx: GameContext): PollenKind | null {
    const cravings = ctx.babies.cravings();
    if (cravings.length === 0) {
      return null;
    }
    const tally = new Map<PollenKind, number>();
    for (const k of cravings) {
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
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

  private refreshObjective(ctx: GameContext): void {
    if (this.phase === "done") {
      ctx.hud.setObjective("The whole brood is grown!");
      return;
    }
    const carrying = ctx.larder.carrying;
    if (carrying) {
      ctx.hud.setObjective(
        `Take the ${POLLEN_LABEL[carrying]} food to a hungry baby`,
      );
      return;
    }
    const wanted = this.wantedElsewhere(ctx);
    ctx.hud.setObjective(
      wanted
        ? `A baby wants ${POLLEN_LABEL[wanted]} — fetch it from the glowing wall`
        : "The babies are full for now",
    );
  }

  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== "done") {
      return;
    }
    // Nothing left to feed, so just hand the chamber back for free flight.
    this.complete = false;
    ctx.hud.setObjective("Fly around your hive");
    ctx.setObjectiveMarker(null);
    ctx.bee.bounds.radius = INTERIOR.boundsRadius;
    ctx.bee.bounds.sphereRadius = INTERIOR.boundsSphere;
    ctx.bee.desiredHeight = Math.min(ctx.bee.desiredHeight, INTERIOR.maxHeight);
  }
}
