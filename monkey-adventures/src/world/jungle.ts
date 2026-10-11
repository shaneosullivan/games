import {CLIMB, JUNGLE, SWING, WIND, WORLD} from "../config";

/** A vine hanging from the canopy, with a swing of its own. */
export interface Vine {
  /** Where it is tied on. */
  x: number;
  y: number;
  long: number;
  /** Which way it is hanging, in radians from straight down, and how fast
   *  that is changing. While nobody is holding it this is a gentle sway;
   *  while the monkey is on it, it is the monkey's swing. */
  angle: number;
  spin: number;
  /** Where in its idle sway it started, so a row of vines is not a chorus
   *  line all swinging together. */
  phase: number;
}

export interface Tree {
  x: number;
  tall: number;
  wide: number;
}

export interface Dapple {
  x: number;
  y: number;
  size: number;
}

/**
 * One jungle, made to a seed.
 *
 * Made rather than drawn by hand so the level can be as long as it likes and
 * so the spacing can be reasoned about: every vine is within reach of the one
 * before it at a sensible swing, which is the only thing that makes the game
 * playable rather than a series of falls.
 */
export class Jungle {
  readonly vines: Array<Vine> = [];
  readonly nearTrees: Array<Tree> = [];
  readonly farTrees: Array<Tree> = [];
  readonly dapples: Array<Dapple> = [];
  /** Where home is: the end of the jungle. */
  readonly homeX = WORLD.far;

  constructor(seed = 1) {
    const rng = made(seed);
    for (
      let x = JUNGLE.vineEvery;
      x < WORLD.far - JUNGLE.vineEvery;
      x += JUNGLE.vineEvery + (rng() - 0.5) * 2 * JUNGLE.vineVaries
    ) {
      this.vines.push({
        x,
        y: JUNGLE.canopy,
        long: JUNGLE.vineLong + (rng() - 0.5) * 2 * JUNGLE.vineVaries2,
        angle: 0,
        spin: 0,
        phase: rng() * Math.PI * 2,
      });
    }
    for (let x = -60; x < WORLD.far + 200; x += JUNGLE.treeEvery) {
      this.nearTrees.push({
        x: x + (rng() - 0.5) * 40,
        tall: 70 + rng() * 50,
        wide: 26 + rng() * 16,
      });
    }
    for (let x = -60; x < WORLD.far + 200; x += JUNGLE.farTreeEvery) {
      this.farTrees.push({
        x: x + (rng() - 0.5) * 50,
        tall: 56 + rng() * 40,
        wide: 20 + rng() * 14,
      });
    }
    for (let i = 0; i < JUNGLE.dapples; i++) {
      this.dapples.push({
        x: rng() * WORLD.far,
        y: 10 + rng() * (WORLD.floor - 10),
        size: JUNGLE.dappleSize * (0.5 + rng()),
      });
    }
  }

  /** The idle sway of every vine nobody is on. Ticked rather than drawn from
   *  the clock so that a vine the monkey lets go of carries on from where it
   *  was, instead of snapping back to wherever the clock says it should be. */
  update(dt: number, time: number, held: Vine | null): void {
    for (const vine of this.vines) {
      if (vine === held) {
        continue;
      }
      // Eased towards where the wind says it should be, so a vine that has
      // just been let go of swings down to the breeze rather than jumping
      // to it. Each vine has its own phase, so a row of them is a jungle
      // moving rather than a chorus line.
      const breeze =
        Math.sin(time * WIND.slow + vine.phase) * (1 - WIND.rustle) +
        Math.sin(time * WIND.quick + vine.phase * 1.7) * WIND.rustle;
      const want = breeze * WIND.sways;
      const settle = 1 - Math.exp(-SWING.settles * dt);
      vine.angle += (want - vine.angle) * settle;
      vine.spin = 0;
    }
  }

  /**
   * The trunk a point is against, if it is against one.
   *
   * Only the near trees: the far ones are a painted backdrop, and a monkey
   * climbing something it is drawn behind would be a puzzle rather than a
   * game. The climbable part is the bare trunk between the floor and the
   * leaves — there is nothing to hold on to inside the crown.
   */
  trunkAt(x: number, y: number): Tree | null {
    for (const tree of this.nearTrees) {
      if (Math.abs(x - tree.x) > CLIMB.reach) {
        continue;
      }
      const top = WORLD.floor - tree.tall + CLIMB.stopsBelow;
      if (y >= top && y <= WORLD.floor) {
        return tree;
      }
    }
    return null;
  }

  /** How high up a trunk a monkey may go. */
  topOf(tree: Tree): number {
    return WORLD.floor - tree.tall + CLIMB.stopsBelow;
  }

  /** Where the far end of a vine is. */
  tip(vine: Vine): {x: number; y: number} {
    return {
      x: vine.x + Math.sin(vine.angle) * vine.long,
      y: vine.y + Math.cos(vine.angle) * vine.long,
    };
  }

  /** Where a point a fraction of the way down a vine is. */
  along(vine: Vine, at: number): {x: number; y: number} {
    return {
      x: vine.x + Math.sin(vine.angle) * vine.long * at,
      y: vine.y + Math.cos(vine.angle) * vine.long * at,
    };
  }
}

/** A small, repeatable random. The jungle has to come out the same every
 *  time it is played, or a level that is possible once is impossible next
 *  time and nobody can learn it. */
function made(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
