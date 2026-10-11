import {CLIMB, CROC, JUNGLE, LAKE, SWING, WIND, WORLD} from "../config";

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

/** A banana hanging between two vines, worth a point to whoever swings
 *  through it. */
export interface Banana {
  x: number;
  y: number;
  taken: boolean;
}

/** A crocodile in the lake: swims, watches, and snaps at nothing. */
export interface Croc {
  x: number;
  /** Where it started, so it wanders about that rather than drifting off. */
  from: number;
  /** Which way it is swimming, and how open its jaws are, 0 to 1. */
  dir: number;
  jaw: number;
  /** How far through a bite it is, in seconds, and whether the jaws came
   *  together on this tick — which is when the noise is made. */
  bite: number;
  bit: boolean;
  /** Its own clock, so four of them do not snap in time with each other. */
  phase: number;
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
  readonly bananas: Array<Banana> = [];
  readonly crocs: Array<Croc> = [];
  /** Where home is: the end of the jungle. */
  readonly homeX = WORLD.far;
  /** The water, halfway along. */
  readonly lakeFrom = LAKE.from;
  readonly lakeTo = LAKE.from + LAKE.wide;

  constructor(seed = 1) {
    const rng = made(seed);
    // Walked along rather than stepped by a fixed amount, because the gap
    // changes over the water: the vines bunch up where falling costs the
    // crossing. The step is taken from where the *next* vine would land, so
    // the bunching starts a little before the bank rather than at it —
    // there is no use in a close vine you had to make a long swing to reach.
    for (
      let x = JUNGLE.vineEvery;
      x < WORLD.far - JUNGLE.vineEvery;
      x +=
        (this.overWater(x + JUNGLE.vineEvery)
          ? JUNGLE.vineEveryLake
          : JUNGLE.vineEvery) +
        (rng() - 0.5) *
          2 *
          (this.overWater(x + JUNGLE.vineEvery)
            ? JUNGLE.vineVariesLake
            : JUNGLE.vineVaries)
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
    // Bananas between the vines, not on them: hung in the gap, at about the
    // height a monkey passes through at the bottom of a swing. That is the
    // point of them — they are not a detour, they are a reason to swing low
    // and long instead of letting go early and safe.
    for (let i = 0; i + 1 < this.vines.length; i++) {
      if (rng() > JUNGLE.bananaOdds) {
        continue;
      }
      const left = this.vines[i];
      const right = this.vines[i + 1];
      const mid = (left.x + right.x) / 2;
      const hang = Math.max(left.long, right.long);
      this.bananas.push({
        x: mid,
        y: JUNGLE.canopy + hang * JUNGLE.bananaHigh + rng() * 10,
        taken: false,
      });
    }
    for (let x = -60; x < WORLD.far + 200; x += JUNGLE.treeEvery) {
      // Nothing grows in the lake — tested against where the tree actually
      // ends up, not against the spacing it started from. Jittering first
      // and asking afterwards put trees up to twenty pixels into the water,
      // which is exactly far enough to look like a mistake.
      const at = x + (rng() - 0.5) * 40;
      if (
        this.overWater(at) ||
        this.overWater(at - 16) ||
        this.overWater(at + 16)
      ) {
        continue;
      }
      this.nearTrees.push({
        x: at,
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
    // Crocodiles, spread along the water with room to swim between them.
    for (let i = 0; i < CROC.count; i++) {
      const at =
        LAKE.from + ((i + 0.5) / CROC.count) * LAKE.wide + (rng() - 0.5) * 30;
      this.crocs.push({
        x: at,
        from: at,
        dir: rng() < 0.5 ? -1 : 1,
        jaw: 0,
        bite: rng() * (CROC.gapes + CROC.holds + CROC.snaps + CROC.rests),
        bit: false,
        phase: rng() * Math.PI * 2,
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
  update(dt: number, time: number, held: Vine | null, monkeyX = -1e9): void {
    for (const croc of this.crocs) {
      croc.x += croc.dir * CROC.speed * dt;
      // Turning at the end of its beat, and never out of the water.
      if (
        Math.abs(croc.x - croc.from) > CROC.roams ||
        croc.x < LAKE.from + 10 ||
        croc.x > LAKE.from + LAKE.wide - 10
      ) {
        croc.dir = -croc.dir;
        croc.x += croc.dir * CROC.speed * dt;
      }
      // The bite, while somebody is overhead; shut again once they are not.
      // It has nothing to catch — see `CROC` — so this is pure theatre, and
      // the theatre is in the timing.
      croc.bit = false;
      const overhead = Math.abs(monkeyX - croc.x) < CROC.notices;
      if (overhead) {
        const whole = CROC.gapes + CROC.holds + CROC.snaps + CROC.rests;
        const was = croc.bite;
        croc.bite = (croc.bite + dt) % whole;
        if (croc.bite < was) {
          // Wrapped: a new bite is starting.
          croc.bit = false;
        }
        const t = croc.bite;
        if (t < CROC.gapes) {
          // Opening, slowing as it goes, the way a hinge with weight on it
          // does.
          const u = t / CROC.gapes;
          croc.jaw = 1 - (1 - u) * (1 - u);
        } else if (t < CROC.gapes + CROC.holds) {
          croc.jaw = 1;
        } else if (t < CROC.gapes + CROC.holds + CROC.snaps) {
          croc.jaw = 1 - (t - CROC.gapes - CROC.holds) / CROC.snaps;
        } else {
          // Shut. The frame it first becomes shut is the one that makes the
          // noise.
          if (croc.jaw > 0) {
            croc.bit = true;
          }
          croc.jaw = 0;
        }
      } else {
        croc.bite = 0;
        croc.jaw += (0 - croc.jaw) * (1 - Math.exp(-CROC.closes * dt));
      }
    }

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

  /** Whether a point is over the water. A little inside the banks, so the
   *  edge of the lake is a bank to stand on rather than a line to fall off. */
  overWater(x: number): boolean {
    return x > LAKE.from && x < LAKE.from + LAKE.wide;
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
