import * as THREE from "three";
import type {GameContext} from "./level";

/** How close the bee must get to the doorway before it's drawn inside. */
export const ENTRY_RADIUS = 3.4;

const APPROACH_TIME = 0.8;
const INTO_DOOR_TIME = 0.85;

const tmp = new THREE.Vector3();

/** Smoothstep, so the cutscene eases in and out instead of jerking. */
function ease(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

/**
 * The "fly into the hive" cutscene: hold station just outside the door, then
 * go straight in along +Z, shrinking away into the hole.
 *
 * Shared by level 1 (founding the hive) and level 3 (heading home once the
 * wasp is gone) so both endings land the same way.
 */
export class HiveEntry {
  private running = false;
  private time = 0;
  private readonly start = new THREE.Vector3();
  private readonly approach = new THREE.Vector3();

  get active(): boolean {
    return this.running;
  }

  /** Is the bee close enough to the doorway to be drawn in? */
  static inRange(ctx: GameContext): boolean {
    return ctx.bee.position.distanceTo(ctx.hive.entrance) < ENTRY_RADIUS;
  }

  begin(ctx: GameContext): void {
    this.running = true;
    this.time = 0;
    this.start.copy(ctx.bee.position);
    this.approach.copy(ctx.hive.entrance).add(tmp.set(0, 0.1, 2.4));

    ctx.bee.scripted = true;
    ctx.bee.velocity.set(0, 0, 0);
    ctx.bee.setYaw(Math.PI); // face -Z, into the doorway
    ctx.setObjectiveMarker(null);
    ctx.hud.setHarvest(0);
  }

  /** @returns true on the frame the bee vanishes inside. */
  update(dt: number, ctx: GameContext): boolean {
    if (!this.running) {
      return false;
    }
    this.time += dt;

    if (this.time < APPROACH_TIME) {
      ctx.bee.position.lerpVectors(
        this.start,
        this.approach,
        ease(this.time / APPROACH_TIME),
      );
      ctx.bee.setScale(1);
      return false;
    }

    const u = Math.min(1, (this.time - APPROACH_TIME) / INTO_DOOR_TIME);
    // Slightly past the doorway plane so she genuinely goes inside.
    tmp.copy(ctx.hive.entrance).add(new THREE.Vector3(0, 0, -0.35));
    ctx.bee.position.lerpVectors(this.approach, tmp, ease(u));
    // Shrink into the hole; the last stretch drops away fast.
    ctx.bee.setScale(Math.max(0.001, 1 - u * u * 0.995));

    if (u < 1) {
      return false;
    }

    this.running = false;
    ctx.bee.object.visible = false;
    return true;
  }

  /**
   * Pop the bee back out on the doorstep, facing away and clear of
   * ENTRY_RADIUS so she doesn't instantly fly straight back in.
   */
  restore(ctx: GameContext): void {
    ctx.bee.scripted = false;
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    ctx.bee.position.copy(this.approach).add(tmp.set(0, 0.25, 2.8));
    ctx.bee.velocity.set(0, 0, 0);
    ctx.bee.setYaw(0); // nose pointing out of the doorway
    ctx.bee.desiredHeight = ctx.bee.position.y;
  }
}
