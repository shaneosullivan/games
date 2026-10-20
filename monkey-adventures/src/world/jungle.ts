import {
  CLIMB,
  COCONUT,
  CROC,
  HOME,
  MONKEY,
  JUNGLE,
  LAKE,
  RAIN,
  RIVER,
  ROPE,
  VOLCANO,
  WIND,
  WORLD,
} from "../config";

/**
 * One knot of a rope.
 *
 * Verlet: where it is and where it was, and the difference between those is
 * its speed. Nothing stores a velocity, which is exactly why the rope never
 * fights its own constraints — move a knot and it has, by definition, been
 * moving.
 */
/** How far below its hands the middle of the monkey is, which is the part
 *  a banana is measured against. */
const MONKEY_MIDDLE = MONKEY.tall / 2 - 2;

export interface Knot {
  x: number;
  y: number;
  /** Where it was last step. */
  px: number;
  py: number;
  /** How hard it is to shift. One for a bare knot, more for the one with a
   *  monkey on it. */
  mass: number;
}

/** A vine: a line of knots, the first tied to the branch. */
export interface Vine {
  /** True if this is not a vine at all. It hangs like one and it is caught
   *  like one, which is the point: in the river level a few of them are
   *  snakes, and taking hold of one costs a life. */
  snake?: boolean;
  /** Where it is tied on. */
  x: number;
  y: number;
  long: number;
  knots: Array<Knot>;
  /** How long each link wants to be. */
  link: number;
  /**
   * The knot somebody is holding, if anybody is, and where they are holding
   * it. Set by the monkey each step before the rope is worked out.
   *
   * A held rope is two different things at once and has to be treated as
   * such: above the hand it is pulled straight by the weight on it, and
   * below the hand it is a loose end swinging about. Simulating the whole
   * thing freely and then insisting on the length fought the swing to a
   * standstill — the length came out right and the monkey could not get
   * going, because re-deriving every knot from the branch each frame threw
   * away the push that had just been given to it.
   */
  pinned: number | null;
  pinX: number;
  pinY: number;
  /** Where in the breeze it started, so a row of vines is not a chorus line
   *  all swinging together. */
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
  /** How far out of the water its head is, 0 to 1, and whether it broke the
   *  surface on this tick — which is when the water is thrown about. */
  rise: number;
  rose: boolean;
  /** Its own clock, so four of them do not snap in time with each other. */
  phase: number;
}

/**
 * A coconut in the canopy, and what it does when somebody walks underneath.
 *
 * It hangs until the monkey is near, shakes on its stalk for a warning, and
 * then falls. Once it has burst on the mud another grows in its place, so
 * the walk back after a mistake is the same walk and not an easier one.
 */
export interface Coconut {
  x: number;
  /** The middle of the stretch of canopy this one belongs to. The next one
   *  grows somewhere else along the same stretch, so the level is never
   *  twice the same walk. */
  slot: number;
  /** Where it is now, and where it hangs. */
  y: number;
  from: number;
  falling: boolean;
  vy: number;
  /** True on the one frame it hits the ground, for whoever makes the
   *  noise. The jungle has no sound of its own — it says what happened
   *  and the game says it out loud. */
  landed: boolean;
  /** Seconds of shaking left before it lets go, and of splat left after it
   *  lands; `back` is the wait before the next one grows. */
  wobble: number;
  splat: number;
  back: number;
}

/**
 * An elephant, standing in the river to be jumped on.
 *
 * Its back is above the water and the rest of it is in: a stepping stone
 * with a trunk. Landing on one sets it spouting, and the spout is what
 * throws the monkey on to the next one.
 */
export interface Elephant {
  x: number;
  /** Seconds of spouting left, and the bob that keeps it alive while it
   *  waits. */
  spurt: number;
  phase: number;
  facingLeft: boolean;
}

/** A mushroom: where the rain level puts you back when a coconut gets you. */
export interface Mushroom {
  x: number;
  /** True once it has been passed, which is what makes it the one you come
   *  back to. It sparkles either way — a revive point nobody can see is not
   *  a kindness. */
  lit: boolean;
}

/** A vent in the crater, which fires on its own beat. */
export interface Vent {
  x: number;
  /** Where it is in its cycle, in seconds. */
  at: number;
  /** How far the column is up, 0 to 1, and whether it is still only
   *  grumbling. */
  up: number;
  warning: boolean;
}

/** One of the monkeys waiting at home. */
export interface Family {
  x: number;
  /** Which coat it is wearing, and its own clock so three of them do not
   *  fidget in step. */
  coat: number;
  phase: number;
  facingLeft: boolean;
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
  readonly family: Array<Family> = [];
  readonly vents: Array<Vent> = [];
  readonly coconuts: Array<Coconut> = [];
  readonly mushrooms: Array<Mushroom> = [];
  /**
   * Whether this is the rain level.
   *
   * One class for both courses rather than two, because they are the same
   * jungle: the same vines, the same trees, the same way home. What the
   * rain changes is the weather, the floor and what falls out of the sky,
   * and all three are better as answers this one jungle gives than as a
   * second copy of it that would drift.
   */
  readonly raining: boolean;
  /** And whether this is the river one. */
  readonly river: boolean;
  readonly elephants: Array<Elephant> = [];
  /** Where the water is in this level, if it has any. One pair of numbers
   *  rather than three constants read in six places: the dry jungle's
   *  lake, the river, or nothing at all. */
  readonly waterFrom: number;
  readonly waterTo: number;
  /** How long this level is. The rain one is shorter: everything in it is
   *  slower, so the same length would be a longer walk. */
  readonly far: number;
  readonly volcanoFrom = VOLCANO.from;
  readonly volcanoTo = VOLCANO.from + VOLCANO.wide;
  /** The lava itself, inside the two slopes: the rim is where it stops. */
  readonly craterFrom = VOLCANO.from + VOLCANO.wide * VOLCANO.slope;
  readonly craterTo = VOLCANO.from + VOLCANO.wide * (1 - VOLCANO.slope);
  /** Where home is: the end of the level. */
  readonly homeX: number;
  /** The water, halfway along. */
  readonly lakeFrom = LAKE.from;
  readonly lakeTo = LAKE.from + LAKE.wide;

  /** Kept for the things that go on happening: a coconut grows back
   *  somewhere new, and "somewhere new" needs a number at the time rather
   *  than at the beginning. */
  private readonly rng: () => number;

  constructor(seed = 1, kind: "jungle" | "rain" | "river" = "jungle") {
    const rng = made(seed);
    this.rng = rng;
    const raining = kind === "rain";
    const river = kind === "river";
    this.raining = raining;
    this.river = river;
    this.far = raining ? RAIN.far : river ? RIVER.far : WORLD.far;
    this.homeX = this.far;
    this.waterFrom = river ? RIVER.from : raining ? 0 : LAKE.from;
    this.waterTo = river
      ? RIVER.from + RIVER.wide
      : raining
        ? 0
        : LAKE.from + LAKE.wide;
    // Walked along rather than stepped by a fixed amount, because the gap
    // changes over the water: the vines bunch up where falling costs the
    // crossing. The step is taken from where the *next* vine would land, so
    // the bunching starts a little before the bank rather than at it —
    // there is no use in a close vine you had to make a long swing to reach.
    for (
      let x = JUNGLE.vineEvery;
      x < this.far - JUNGLE.vineEvery;
      x += this.vineGap(x + JUNGLE.vineEvery, rng)
    ) {
      // Over the crater the vines are the long ones, and they are the same
      // length as each other: a crossing where every vine is a different
      // height is a crossing nobody can learn.
      const long = this.overCrater(x)
        ? VOLCANO.vineLong
        : JUNGLE.vineLong + (rng() - 0.5) * 2 * JUNGLE.vineVaries2;
      const many = Math.max(4, Math.round((long / 100) * ROPE.knotsPer100));
      const link = long / (many - 1);
      const knots: Array<Knot> = [];
      for (let k = 0; k < many; k++) {
        // Hung straight down to start with. One breath of wind and it is
        // not straight any more.
        const y = JUNGLE.canopy + k * link;
        knots.push({x, y, px: x, py: y, mass: 1});
      }
      this.vines.push({
        x,
        y: JUNGLE.canopy,
        long,
        knots,
        link,
        pinned: null,
        pinX: x,
        pinY: JUNGLE.canopy,
        phase: rng() * Math.PI * 2,
      });
    }
    // Bananas on the arcs the vines swing through.
    //
    // On a vine's arc rather than in the gap between two, because the gap
    // is the one place a swing never reaches — over the midpoint the
    // monkey is at the bottom of its swing and low, and by the time it is
    // high it is past. The high ones sit far enough round that only a
    // properly pumped swing sweeps them, and far too high for a jump.
    for (const vine of this.vines) {
      if (rng() > JUNGLE.bananaOdds) {
        continue;
      }
      const high = rng() < JUNGLE.bananaHighOdds;
      const angle =
        (high ? JUNGLE.bananaHighAt2 : JUNGLE.bananaAt) *
        (rng() < 0.5 ? -1 : 1);
      // Where the monkey's middle is when it passes through that part of
      // the arc: hanging by its hands, so half a body below the rope's end.
      const reach = vine.long;
      this.bananas.push({
        x: vine.x + Math.sin(angle) * reach,
        y: JUNGLE.canopy + Math.cos(angle) * reach + MONKEY_MIDDLE,
        taken: false,
      });
    }

    for (let x = -60; x < this.far + 200; x += JUNGLE.treeEvery) {
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
      // Some of them are giants that carry on up into the canopy; see
      // `JUNGLE.giants`. Measured from the leaves downwards rather than
      // picked, so a giant reaches them whatever height the picture is.
      const giant = rng() < JUNGLE.giants;
      this.nearTrees.push({
        x: at,
        tall: giant
          ? WORLD.floor - JUNGLE.canopy + JUNGLE.giantInto + rng() * 6
          : 70 + rng() * 50,
        wide: giant ? 30 + rng() * 14 : 26 + rng() * 16,
      });
    }
    for (let x = -60; x < this.far + 200; x += JUNGLE.farTreeEvery) {
      this.farTrees.push({
        x: x + (rng() - 0.5) * 50,
        tall: 56 + rng() * 40,
        wide: 20 + rng() * 14,
      });
    }
    // The vents, spread across the crater. None of this in the rain: that
    // level has no volcano and no lake, because its hazard is the sky.
    const craterFrom = this.craterFrom;
    const craterWide = this.craterTo - this.craterFrom;
    for (let i = 0; raining || river ? false : i < VOLCANO.vents; i++) {
      this.vents.push({
        x: craterFrom + ((i + 0.5) / VOLCANO.vents) * craterWide,
        // Spread round the cycle so they do not all go off together.
        at: (i / VOLCANO.vents) * VOLCANO.every + rng() * 0.3,
        up: 0,
        warning: false,
      });
    }

    // The ones waiting at home, either side of the hut.
    for (let i = 0; i < HOME.family; i++) {
      const at =
        this.far +
        ((i + 0.5) / HOME.family - 0.5) * 2 * HOME.spread +
        (rng() - 0.5) * 8;
      this.family.push({
        x: at,
        coat: 1 + Math.floor(rng() * 3),
        phase: rng() * Math.PI * 2,
        // Looking back down the jungle, which is where you are coming from.
        facingLeft: at > this.far,
      });
    }

    // Crocodiles, spread along the water with room to swim between them.
    for (let i = 0; raining || river ? false : i < CROC.count; i++) {
      const at =
        LAKE.from + ((i + 0.5) / CROC.count) * LAKE.wide + (rng() - 0.5) * 30;
      this.crocs.push({
        x: at,
        from: at,
        dir: rng() < 0.5 ? -1 : 1,
        jaw: 0,
        bite: rng() * (CROC.gapes + CROC.holds + CROC.snaps + CROC.rests),
        bit: false,
        rise: 0,
        rose: false,
        phase: rng() * Math.PI * 2,
      });
    }
    // Dapples are sunlight through the leaves, and there is no sun in the
    // rain level. The rain itself is drawn instead, and the canopy gives it
    // coconuts and the ground gives it mushrooms.
    for (let i = 0; raining ? false : i < JUNGLE.dapples; i++) {
      this.dapples.push({
        x: rng() * this.far,
        y: 10 + rng() * (WORLD.floor - 10),
        size: JUNGLE.dappleSize * (0.5 + rng()),
      });
    }
    if (river) {
      // The stepping stones: elephants standing in the water, the first
      // one a short hop off the bank and the rest evenly across. Counted
      // out of the width rather than written down, so moving the river
      // or widening it does not leave a gap nobody can jump.
      for (
        let x = this.waterFrom + RIVER.firstBy;
        x < this.waterTo - RIVER.firstBy / 2;
        x += RIVER.every
      ) {
        this.elephants.push({
          x,
          spurt: 0,
          phase: rng() * Math.PI * 2,
          // The far ones look back the way you came, which is where you
          // are coming from.
          facingLeft: x > (this.waterFrom + this.waterTo) / 2,
        });
      }
      // A few of the vines are snakes — but never over the water, where
      // there is nothing else to take hold of, and never two in a row.
      let wasSnake = false;
      for (const vine of this.vines) {
        const over = this.overWater(vine.x);
        vine.snake = !over && !wasSnake && rng() < RIVER.snakes;
        wasSnake = vine.snake;
      }
    }
    if (raining) {
      for (
        let x = COCONUT.every;
        x < this.far - COCONUT.every;
        x += COCONUT.every
      ) {
        const at = x + (rng() - 0.5) * 40;
        this.coconuts.push({
          x: at,
          slot: x,
          y: JUNGLE.canopy + 4,
          from: JUNGLE.canopy + 4,
          falling: false,
          vy: 0,
          landed: false,
          wobble: 0,
          splat: 0,
          back: 0,
        });
      }
      // Spread evenly, and never at the end: a revive point in sight of
      // home would hand over the last of the level.
      for (let i = 1; i <= RAIN.posts; i++) {
        this.mushrooms.push({
          x: (this.far * i) / (RAIN.posts + 1),
          lit: false,
        });
      }
    }
  }

  /**
   * The coconuts: hanging, shaking, falling, bursting, growing back.
   *
   * The monkey is what shakes them loose, so a stretch of jungle nobody is
   * under stays quiet and the level has as many hazards as there are
   * places you have walked. The shake is the warning and the warning is
   * the hazard: a coconut that simply dropped would be a trap, and this is
   * a game for a child.
   */
  /** The elephants: the bob that keeps them alive, and the spout running
   *  down after somebody has bounced off one. */
  private standInTheRiver(dt: number): void {
    for (const one of this.elephants) {
      one.phase += dt;
      one.spurt = Math.max(0, one.spurt - dt);
    }
  }

  private shakeTheCanopy(dt: number, monkeyX: number): void {
    for (const nut of this.coconuts) {
      nut.landed = false;
      if (nut.splat > 0) {
        nut.splat = Math.max(0, nut.splat - dt);
        continue;
      }
      if (nut.back > 0) {
        nut.back -= dt;
        if (nut.back <= 0) {
          // Grown again, back on its stalk — and somewhere else along its
          // stretch of canopy. A coconut that always fell from the same
          // place would be learned once and never looked at again, and
          // the walk back after a mistake would be the easy walk.
          nut.x = nut.slot + (this.rng() - 0.5) * COCONUT.every * 0.8;
          nut.y = nut.from;
          nut.vy = 0;
          nut.wobble = 0;
          nut.falling = false;
        }
        continue;
      }
      if (nut.falling) {
        nut.vy += COCONUT.falls * dt;
        nut.y += nut.vy * dt;
        if (nut.y >= this.floorAt(nut.x)) {
          nut.y = this.floorAt(nut.x);
          nut.falling = false;
          nut.landed = true;
          nut.splat = COCONUT.splats;
          nut.back = COCONUT.rests;
        }
        continue;
      }
      if (nut.wobble > 0) {
        nut.wobble -= dt;
        if (nut.wobble <= 0) {
          nut.falling = true;
        }
        continue;
      }
      if (Math.abs(monkeyX - nut.x) < COCONUT.notices) {
        nut.wobble = COCONUT.wobbles;
      }
    }
  }

  /** The idle sway of every vine nobody is on. Ticked rather than drawn from
   *  the clock so that a vine the monkey lets go of carries on from where it
   *  was, instead of snapping back to wherever the clock says it should be. */
  update(dt: number, time: number, held: Vine | null, monkeyX = -1e9): void {
    this.shakeTheCanopy(dt, monkeyX);
    this.standInTheRiver(dt);
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
      croc.rose = false;
      const wasUp = croc.rise;
      const overhead = Math.abs(monkeyX - croc.x) < CROC.notices;
      if (overhead) {
        const whole = CROC.gapes + CROC.holds + CROC.snaps + CROC.rests;
        const was = croc.bite;
        croc.bite = (croc.bite + dt) % whole;
        if (croc.bite < was) {
          croc.bit = false;
        }
        const t = croc.bite;
        if (t < CROC.gapes) {
          // Coming up and opening together, slowing as it goes.
          const u = t / CROC.gapes;
          croc.jaw = 1 - (1 - u) * (1 - u);
          croc.rise = croc.jaw;
        } else if (t < CROC.gapes + CROC.holds) {
          croc.jaw = 1;
          croc.rise = 1;
        } else if (t < CROC.gapes + CROC.holds + CROC.snaps) {
          croc.jaw = 1 - (t - CROC.gapes - CROC.holds) / CROC.snaps;
          croc.rise = 1;
        } else {
          if (croc.jaw > 0) {
            croc.bit = true;
          }
          croc.jaw = 0;
          // Sinking back while it waits, which is the warning for next time.
          const down = (t - CROC.gapes - CROC.holds - CROC.snaps) / CROC.rests;
          croc.rise = Math.max(0, 1 - down);
        }
      } else {
        croc.bite = 0;
        const shut = 1 - Math.exp(-CROC.closes * dt);
        croc.jaw += (0 - croc.jaw) * shut;
        croc.rise += (0 - croc.rise) * shut;
      }
      // The moment the head breaks the surface, so the water can be thrown
      // about exactly once rather than every frame it is up.
      if (wasUp <= 0.25 && croc.rise > 0.25) {
        croc.rose = true;
      }
    }

    for (const vent of this.vents) {
      vent.at = (vent.at + dt) % VOLCANO.every;
      const firing = VOLCANO.warns + VOLCANO.spurts;
      if (vent.at < VOLCANO.warns) {
        // Grumbling: glowing, bubbling, not yet dangerous. A hazard a
        // child cannot see coming is a trick rather than a hazard.
        vent.warning = true;
        vent.up = 0;
      } else if (vent.at < firing) {
        vent.warning = false;
        // Up fast and down slower, the way a thrown thing goes.
        const t = (vent.at - VOLCANO.warns) / VOLCANO.spurts;
        vent.up = Math.sin(t * Math.PI);
      } else {
        vent.warning = false;
        vent.up = 0;
      }
    }

    for (const vine of this.vines) {
      this.sway(vine, dt, time);
    }
    void held;
  }

  /**
   * One rope, one step.
   *
   * Verlet on every knot but the first, then the distances put back several
   * times over. The order matters: integrate first and correct afterwards,
   * because a constraint applied to a position is also a correction to the
   * speed — the knot's "previous position" is left where it was, so pulling
   * a knot back into line slows it down exactly as a taut rope would.
   */
  private sway(vine: Vine, dt: number, time: number): void {
    // The wind, as a push rather than as a shape. A rope shoved sideways
    // and left to sort itself out bends the way a rope bends; a rope posed
    // into a curve is a drawing of one.
    const breeze =
      Math.sin(time * WIND.slow + vine.phase) * (1 - WIND.rustle) +
      Math.sin(time * WIND.quick + vine.phase * 1.7) * WIND.rustle;
    const push = breeze * ROPE.breeze;
    const keep = Math.exp(Math.log(ROPE.keeps) * dt);
    const from = vine.pinned ?? 0;

    // The part of the rope that hangs free: everything below the hand, or
    // the whole thing if nobody is on it.
    for (let i = from + 1; i < vine.knots.length; i++) {
      const knot = vine.knots[i];
      const vx = (knot.x - knot.px) * keep;
      const vy = (knot.y - knot.py) * keep;
      knot.px = knot.x;
      knot.py = knot.y;
      const share = i / (vine.knots.length - 1);
      // Verlet: the step is the last step plus the acceleration times the
      // square of the time.
      knot.x += vx + push * share * dt * dt;
      knot.y += vy + WORLD.gravity * dt * dt;
    }

    const top = vine.knots[0];
    top.x = vine.x;
    top.y = vine.y;
    top.px = vine.x;
    top.py = vine.y;

    if (vine.pinned !== null) {
      // Taut from the branch to the hand, because that is what a rope with
      // a monkey hanging on it does: the knots in between are strung along
      // the straight line between the two, evenly.
      const hand = vine.knots[vine.pinned];
      hand.px = hand.x;
      hand.py = hand.y;
      hand.x = vine.pinX;
      hand.y = vine.pinY;
      for (let i = 1; i < vine.pinned; i++) {
        const t = i / vine.pinned;
        const knot = vine.knots[i];
        knot.x = vine.x + (hand.x - vine.x) * t;
        knot.y = vine.y + (hand.y - vine.y) * t;
        knot.px = knot.x;
        knot.py = knot.y;
      }
    }

    for (let pass = 0; pass < ROPE.solves; pass++) {
      for (let i = from; i < vine.knots.length - 1; i++) {
        const a = vine.knots[i];
        const b = vine.knots[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const apart = Math.hypot(dx, dy) || 0.0001;
        if (apart <= vine.link) {
          continue;
        }
        const off = (apart - vine.link) / apart;
        // The branch and the hand do not move for anybody.
        const fixed = i === from;
        const total = a.mass + b.mass;
        const toA = fixed ? 0 : b.mass / total;
        const toB = fixed ? 1 : a.mass / total;
        a.x += dx * off * toA;
        a.y += dy * off * toA;
        b.x -= dx * off * toB;
        b.y -= dy * off * toB;
      }
    }

    // And one pass down the free part that will not be argued with, so the
    // vine is exactly as long as it is and never a pixel more or less.
    // Solving converges but never quite arrives, and the leftover reads as
    // the vine stretching — or sinking.
    for (let i = from + 1; i < vine.knots.length; i++) {
      const a = vine.knots[i - 1];
      const b = vine.knots[i];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const apart = Math.hypot(dx, dy);
      if (apart < 0.0001) {
        dx = 0;
        dy = 1;
      } else {
        dx /= apart;
        dy /= apart;
      }
      b.x = a.x + dx * vine.link;
      b.y = a.y + dy * vine.link;
    }

    // Nothing hangs into the water or through the floor. A vine that dips
    // into the lake looks like it is sinking, and a rope lying through the
    // ground looks like nothing at all.
    for (let i = from + 1; i < vine.knots.length; i++) {
      const knot = vine.knots[i];
      const limit = this.surfaceAt(knot.x);
      if (knot.y > limit) {
        knot.y = limit;
        knot.py = limit;
      }
    }
  }

  /** How high an elephant's back is. One answer for the drawing and for
   *  the landing, with the bob in it, or the monkey stands in the air. */
  backOf(one: Elephant): number {
    return WORLD.floor - RIVER.backs + Math.round(Math.sin(one.phase) * 1.4);
  }

  /** How low anything may hang at this point: the ground, or the top of the
   *  water where there is water. */
  surfaceAt(x: number): number {
    if (this.overWater(x)) {
      return WORLD.floor + LAKE.deep - 5;
    }
    return this.floorAt(x);
  }

  /** How far apart the next vine should be, which depends on what is under
   *  it: close over the water, closer still over the lava. */
  private vineGap(x: number, rng: () => number): number {
    if (this.overCrater(x)) {
      return VOLCANO.vineEvery;
    }
    if (this.overWater(x)) {
      // The lake is crossed by swinging, so its vines bunch up. The river
      // is crossed on elephants, so its do the opposite: a vine every
      // other elephant or so, there to be caught if you fancy it rather
      // than to be relied on. Bunched vines over the river caught the
      // monkey at the top of every bounce and the elephants never got a
      // second turn.
      if (this.river) {
        return JUNGLE.vineEvery * 1.7;
      }
      return JUNGLE.vineEveryLake + (rng() - 0.5) * 2 * JUNGLE.vineVariesLake;
    }
    return JUNGLE.vineEvery + (rng() - 0.5) * 2 * JUNGLE.vineVaries;
  }

  /**
   * How high the ground is here.
   *
   * Flat jungle, except where the volcano lifts it: up one slope, across
   * the crater, down the other. Eased rather than ramped, so the hill has
   * shoulders instead of corners.
   */
  floorAt(x: number): number {
    return WORLD.floor - this.hillAt(x);
  }

  /** How far the volcano lifts the ground at this point. */
  hillAt(x: number): number {
    if (
      this.raining ||
      this.river ||
      x <= VOLCANO.from ||
      x >= VOLCANO.from + VOLCANO.wide
    ) {
      return 0;
    }
    const along = (x - VOLCANO.from) / VOLCANO.wide;
    const up = Math.min(along / VOLCANO.slope, (1 - along) / VOLCANO.slope, 1);
    // Eased, so the slopes meet the flat without a crease.
    const eased = up * up * (3 - 2 * up);
    return VOLCANO.hill * eased;
  }

  /** Whether a point is over the lava in the crater. */
  overCrater(x: number): boolean {
    return (
      !this.raining && !this.river && x > this.craterFrom && x < this.craterTo
    );
  }

  /** Whether a point is over the water. A little inside the banks, so the
   *  edge of the lake is a bank to stand on rather than a line to fall off. */
  overWater(x: number): boolean {
    return x > this.waterFrom && x < this.waterTo;
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
      const top = this.floorAt(tree.x) - tree.tall + CLIMB.stopsBelow;
      if (y >= top && y <= this.floorAt(tree.x)) {
        return tree;
      }
    }
    return null;
  }

  /** How high up a trunk a monkey may go. */
  topOf(tree: Tree): number {
    return this.floorAt(tree.x) - tree.tall + CLIMB.stopsBelow;
  }

  /** Where the far end of a vine is. */
  tip(vine: Vine): {x: number; y: number} {
    const last = vine.knots[vine.knots.length - 1];
    return {x: last.x, y: last.y};
  }

  /** Where a point a fraction of the way down a vine is. */
  along(vine: Vine, at: number): {x: number; y: number} {
    const i = Math.max(
      0,
      Math.min(vine.knots.length - 1, Math.round(at * (vine.knots.length - 1))),
    );
    return {x: vine.knots[i].x, y: vine.knots[i].y};
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
