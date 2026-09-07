/**
 * Every tunable number in Skid Marks, grouped by system.
 *
 * The house rule in this repo: no magic numbers at the call site, and where a
 * number was arrived at rather than guessed, the arithmetic that produced it
 * is written down beside it.
 *
 * The unit of length is a quarter of a metre. A race car is four metres long,
 * which is why it is drawn sixteen units, and a lap is about a kilometre.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Longest frame the loop will believe. A tab that was in the background
   *  comes back with a huge one, and stepping it would teleport the car
   *  through the barriers. */
  maxFrame: 0.1,
} as const;

/**
 * The look.
 *
 * The plan asks for the Amiga game by name and points at pictures of it: seen
 * from straight above, flat colours, cars as sprites, a kerbed track with
 * scenery either side. So there is no perspective and no lighting anywhere in
 * this game — an orthographic camera looking down and unlit materials, which
 * between them are exactly what a 2D game made of sprites is.
 *
 * Every colour lives in ENVIRONMENTS below rather than in one global palette,
 * because a track carries its world with it.
 */

/**
 * The three worlds a track can be set in.
 *
 * The plan for the track builder asks for green hills, a desert and a
 * futuristic city with lots of neon, so a palette is a whole environment:
 * every colour in the game comes out of one of these, and nothing anywhere
 * else reaches for a colour of its own. Swapping the palette swaps the world.
 *
 * `ground` is the scene background rather than a mesh — the world is
 * unbounded and there is nothing to be gained by drawing a floor the size of a
 * county — so it is the one colour that reaches the screen untouched.
 */
export const ENVIRONMENTS = {
  hills: {
    name: "Green hills",
    ground: 0x4f9a44,
    tarmac: 0x6b6d76,
    tarmacDark: 0x5c5e66,
    /** The two colours of the kerb, alternating. */
    kerbA: 0xd6473c,
    kerbB: 0xf2efe6,
    /** The run-off band inside the barrier. */
    sand: 0xd8c48b,
    line: 0xf2efe6,
    /** The scenery: two shades of the tall thing, its stem, and a stack. */
    treeA: 0x2f6b34,
    treeB: 0x3b7d3c,
    trunk: 0x4a3524,
    tyre: 0x1f1f23,
    crowd: [0xe0b13c, 0x3f7fd6, 0xd6473c, 0xf2efe6, 0x49b45a],
  },
  desert: {
    name: "Desert",
    ground: 0xd9b072,
    tarmac: 0x8a8577,
    tarmacDark: 0x767162,
    kerbA: 0xc9502f,
    kerbB: 0xf6efdd,
    sand: 0xe6cd9c,
    line: 0xf6efdd,
    /* Cactus green and a paler scrub, on sand rather than grass. */
    treeA: 0x4c7a3f,
    treeB: 0x7f9153,
    trunk: 0x6b5334,
    tyre: 0x2a2622,
    crowd: [0xe8d16a, 0xd0663c, 0xf6efdd, 0x8fb07a, 0xb44a3a],
  },
  neon: {
    name: "Neon city",
    /* Near-black, because everything else in this palette is a light. A neon
       city that is not dark is just a bright city. */
    ground: 0x141024,
    tarmac: 0x2b2740,
    tarmacDark: 0x211d33,
    kerbA: 0xff2d95,
    kerbB: 0x2de2ff,
    sand: 0x3a2f5c,
    line: 0xf4eaff,
    treeA: 0x7b3cff,
    treeB: 0x2de2ff,
    trunk: 0xff2d95,
    tyre: 0x0d0a18,
    crowd: [0xff2d95, 0x2de2ff, 0xfaff5c, 0x7b3cff, 0xf4eaff],
  },
} as const;

export type Environment = keyof typeof ENVIRONMENTS;

export type Palette = (typeof ENVIRONMENTS)[Environment];

export const CAMERA = {
  /**
   * How much of the world is on screen, measured across the short side.
   *
   * Two hundred and eighty units is seventy metres: about three and a half
   * road-widths, which puts the car on screen at roughly the size the Amiga
   * game draws it. Six hundred was two and a half seconds of road ahead and
   * looked right on paper, but a four-metre car inside a hundred and fifty
   * metres of view is eleven pixels on an iPad — a speck, not a sprite.
   */
  view: 280,
  /** How fast the shot chases the car, per second. Frame-rate independent
   *  easing, so this is a rate and not a fraction. */
  ease: 6,
  /**
   * How far ahead of the car the shot leads, at full speed.
   *
   * Straight down the car's own heading rather than its velocity: leading on
   * the velocity means a sideways slide swings the whole picture, and this is
   * a game about sideways slides.
   */
  lead: 52,
} as const;

/**
 * The circuit.
 *
 * A closed loop through a handful of control points, smoothed into a curve.
 * Everything else asks the curve: the tarmac is a ribbon sampled along it, the
 * kerbs are two more, the rivals drive it, and how far round the lap you are
 * is your position along it.
 */
export const TRACK = {
  /**
   * Half the width of the tarmac, and how much grass there is either side
   * before the barrier.
   *
   * Seventy-six units across is about ten car widths — wide enough that a
   * child has room to get a corner wrong and narrow enough to be a road. At
   * forty-six a side it was a motorway.
   *
   * The plan asks for grass you can go on "but no farther", so the grass is a
   * real place with a real edge, and that edge is the wall.
   */
  half: 38,
  grass: 34,
  /** How many points the ribbon is built from. One every few metres: enough
   *  that a corner is a curve rather than a polygon. */
  segments: 900,
  /**
   * The corners.
   *
   * Hand-placed rather than generated. A circuit is the one thing in a racing
   * game that is worth laying out by hand — it wants a long straight to build
   * up on, a hairpin to be slow in, and a couple of sweepers you can hold the
   * throttle through, and no amount of noise gives you that.
   */
  shape: [
    {x: 0, z: -520},
    {x: 300, z: -470},
    {x: 470, z: -250},
    {x: 430, z: 20},
    {x: 560, z: 210},
    {x: 470, z: 430},
    {x: 200, z: 470},
    {x: 60, z: 330},
    {x: -110, z: 330},
    {x: -250, z: 470},
    {x: -520, z: 380},
    {x: -560, z: 120},
    {x: -400, z: -60},
    {x: -430, z: -300},
    {x: -230, z: -520},
  ] as ReadonlyArray<{x: number; z: number}>,
  /** Where the start line sits, as a fraction round the lap. Just before the
   *  first corner, so the grid is on a straight. */
  startAt: 0.02,
} as const;

/**
 * The car.
 *
 * An arcade drift model, which is the whole game: the car has a heading and a
 * velocity, and they are not the same thing. Grip pulls the velocity round
 * toward the heading, and when you ask for more than the grip can give, the
 * car slides — and leaves the marks the game is named after.
 */
export const CAR = {
  /** Sixteen units long and seven wide: four metres by one and three quarters,
   *  which is a real racing car. */
  length: 16,
  width: 7,
  /** Units a second flat out on tarmac, and how hard it gets there. A hundred
   *  and ten is twenty-seven metres a second, or a hundred kilometres an hour
   *  — quick enough to be exciting and slow enough for a child to hold a line. */
  top: 110,
  accel: 105,
  /** How hard it slows with nothing pressed, and how hard the brakes are when
   *  the stick is pushed against the way you are going. */
  coast: 26,
  brake: 130,
  /** Radians a second the nose comes round, and how much of that survives at
   *  full speed. A car that turned as hard at a hundred as at a walk would
   *  have no corners in it. */
  turn: 3,
  turnAtSpeed: 0.42,
  /**
   * Grip: how fast sideways speed is scrubbed off, per second.
   *
   * This is the number the game lives or dies by. High and the car is on
   * rails; low and it is a hovercraft. Six means a hard corner taken flat out
   * steps the back end out and holds it there for about a second, which is a
   * drift you can see, steer and be pleased with.
   */
  grip: 6,
  /** How much of that grip is left on grass. A third: the car understeers wide
   *  and will not stop, which is what makes running wide cost you. */
  grassGrip: 0.34,
  grassTop: 0.55,
  /**
   * How fast it has to be sliding sideways before it lays rubber.
   *
   * Measured, not guessed: an autopilot holding a tidy racing line peaks at a
   * sideways 16.6, and a hard yank of the stick at speed reaches the thirties.
   * Eighteen sits between the two, so a clean lap marks only the tightest
   * corners and throwing the car about blacks the road — which is the game.
   * Twenty-six was above everything driving normally ever produced, and the
   * game named after the marks made none.
   */
  skidAt: 18,
} as const;

/** The marks themselves, which the game is named after. */
export const SKID = {
  /** How many are kept. The oldest is overwritten, so the trail is always the
   *  last few seconds of driving — and a lap of a thousand metres of unbroken
   *  rubber would be a lap where none of it meant anything. */
  max: 1400,
  /** How often one is laid while the car is sliding, in seconds. */
  every: 0.018,
  /** How wide a tyre is, and how far apart the two of them are. */
  width: 2.6,
  gauge: 6,
  /** How long a mark takes to fade away, and how dark it starts. */
  life: 7,
  darkness: 0.55,
} as const;

/**
 * The other cars.
 *
 * A race wants somebody to race. They drive the racing line at a pace a child
 * can beat if they drive well and cannot if they spin — the plan does not ask
 * for them by name, but "a car racing game" with nobody else on the track is
 * a time trial.
 */
export const RIVALS = {
  count: 3,
  /** How fast they go, as a fraction of the player's top speed, and how much
   *  they differ from one another. */
  pace: 0.78,
  spread: 0.05,
  /** How far off the centre line each one runs, so they are not a train. */
  offset: 22,
  /** How far ahead of the player they start, in fractions of a lap. */
  gridGap: 0.008,
  /** The colours, in the order they are handed out. */
  colours: [0x3f7fd6, 0x49b45a, 0xe0b13c] as const,
} as const;

/** The player's car, and how the grid is laid out. */
export const PLAYER = {
  colour: 0xd6473c,
  /** How far off the centre line the player starts, and how far back. */
  offset: -22,
} as const;

/**
 * The scenery either side.
 *
 * Trees, tyre stacks and crowds. None of it is ever touched — the barrier is
 * at the edge of the grass and all of this is beyond it — so it is there
 * purely to give the track somewhere to be.
 */
export const SCENERY = {
  seed: 20260907,
  trees: 420,
  tyres: 90,
  crowd: 260,
  /** How far out from the barrier things are scattered. */
  band: 260,
} as const;

/**
 * The sound.
 *
 * Made rather than loaded, like the other games here — a self-contained html
 * file has no room for a minute of engine as an mp3. The engine is a sawtooth
 * whose pitch rides on the speed, which is the whole of what an engine is.
 */
export const SOUND = {
  /** The engine's pitch at a standstill and flat out, and how loud it is. */
  idleHz: 60,
  fullHz: 240,
  level: 0.05,
  /** How fast the pitch follows the speed. Lazily, or every kerb is a rev. */
  follow: 4,
  /** The tyres, which come in only when the car is actually sliding. */
  skidLevel: 0.14,
  skidCutoff: 2600,
} as const;

/**
 * The things a child can drop on a track.
 *
 * All three are a circle of paint on the road with a rule attached, and the
 * rules are deliberately the three different ways a racing game can interfere
 * with a car: one takes your grip away, one takes your speed away, and one
 * takes the road away from under you for a second.
 */
export const ITEM = {
  /** How big each patch is, and how far apart two of them must be dropped. */
  radius: 26,
  minGap: 34,
  oil: {
    colour: 0x1a1a20,
    /* A ring round it, because the slick itself is nearly black and the neon
       city's road is nearly black too — on that track the patch simply was not
       there. Every patch is drawn on a rim so it reads on any tarmac. */
    rim: 0x8d7bd6,
    /** What is left of the car's grip on oil. Six per cent: the back end goes
     *  and stays gone, which is the joke, and it is survivable because a spin
     *  on a wide track costs a second and not the race. */
    grip: 0.06,
  },
  mud: {
    colour: 0x6b4a2c,
    rim: 0xb08b56,
    /** Top speed and drag on mud. Slow, but it never stops you dead — a child
     *  stuck still in a puddle has nothing to do about it. */
    top: 0.45,
    drag: 34,
  },
  ramp: {
    colour: 0xe8b23c,
    stripe: 0x2b2b31,
    /** How long the car is in the air, and how much bigger it looks at the top
     *  of the arc. Seen from straight above there is no other way to say
     *  "off the ground": the sprite grows and its shadow stays put. */
    airtime: 1,
    lift: 0.55,
    /** How slow you can be and still take off. Roll onto it and nothing
     *  happens, which is the right lesson. */
    minSpeed: 40,
    /** What is left of the steering in mid-air. Almost nothing: a jump is
     *  committed to, and being able to fly a corner would make the ramps a
     *  short cut rather than a risk. */
    steer: 0.15,
  },
} as const;

/**
 * The track builder.
 *
 * The drawing surface is a fixed square of the world, so a track drawn on a
 * phone and one drawn on an iPad come out the same size — the canvas stretches
 * and the world does not.
 */
export const EDITOR = {
  /** Half the width of the world the canvas shows, in game units. */
  reach: 760,
  /** How far the finger must travel before another point is kept, and how many
   *  points the finished loop is reduced to. Raw touch points are far too
   *  many and far too jittery to be corners. */
  sampleEvery: 26,
  corners: 26,
  /** The smallest loop worth racing, as a fraction of the drawing area, and
   *  the fewest corners. Below either, the drawing is a scribble and is
   *  rejected with a word rather than saved as an unplayable track. */
  minSpan: 0.22,
  minCorners: 6,
} as const;
