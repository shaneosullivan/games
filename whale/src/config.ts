/**
 * Every tunable number in Whale, grouped by system.
 *
 * The house rule in this repo: no magic numbers at the call site, and where a
 * number was arrived at rather than guessed, the arithmetic that produced it
 * is written down beside it.
 *
 * The unit of length is a tenth of a beluga. A real beluga is about four
 * metres, so one unit is roughly forty centimetres — which is why the reef is
 * over a thousand units long and the coral is a couple of units tall.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Longest frame the loop will believe. A tab that was in the background
   *  comes back with a huge one, and stepping it would teleport the whale. */
  maxFrame: 0.1,
} as const;

/**
 * The whale.
 *
 * Camera-space steering with acceleration toward the velocity the stick asks
 * for, exactly like the bee — the plan asks for the bee's controls by name,
 * and a child who has played that game should not have to learn anything.
 */
export const SWIM = {
  /** Units a second, flat out. The whale is 34 units long, so this is a bit
   *  under one body length a second — the unhurried cruise of something that
   *  weighs a ton and is in no rush. */
  maxSpeed: 30,
  /** How hard it gets up to speed, and how it coasts down when let go. A whale
   *  has a lot of water to shift, so both are gentle — and the acceleration is
   *  also what sets the turning circle. Holding the stick over is a sustained
   *  turn, and its radius is about v²/a: at 26 that was seven units, so a
   *  thirty-four-unit whale spun inside its own length like a top. */
  accel: 13,
  drag: 7,
  /** Radians a second the body swings round to face where it is going. Slow
   *  enough to read as a big animal leaning into a turn rather than a cursor
   *  snapping to a heading. */
  turnRate: 1.3,
  /** How far it leans into a turn, and how fast the lean arrives. */
  bankMax: 0.42,
  bankRate: 3.2,
  /** Nose up or down while climbing and diving, radians at full rate. */
  pitchMax: 0.5,
  pitchRate: 3.4,
  /** How fast it rises or sinks toward the depth the slider asked for. */
  climbSpeed: 17,
  /** The idle bob, so a whale holding still is still alive. */
  bobAmplitude: 0.5,
  bobRate: 1.1,
  /** Tail beats a second at full speed, and the smallest it ever beats — the
   *  fluke keeps moving when the whale is drifting. */
  fluke: 1.15,
  flukeIdle: 0.34,
} as const;

export const WHALE = {
  /** Scales the whole model. The body is drawn 34 units long at scale 1. */
  scale: 1,
  /** The mouth, as a sphere ahead of the middle of the body: how far forward
   *  of centre it sits, and how wide it reaches. Only what touches this gets
   *  eaten — the plan asks for fish that touch the whale's head, and a whale
   *  that hoovered up anything brushing its tail would be a different game. */
  mouthAhead: 14,
  mouthRadius: 7.5,
} as const;

/**
 * Where the whale is allowed to be.
 *
 * Depth is measured downward from the surface at y = 0, so `minDepth` is just
 * under the waves and `maxDepth` is as deep as the slider goes. The sea floor
 * is closer than that over the sandbanks, and the whale is held off it by
 * `floorClear` — which is what makes a shallow stretch feel shallow.
 */
export const DEPTH = {
  minDepth: 9,
  maxDepth: 76,
  /** Where the slider starts: a comfortable way down, with room either way. */
  start: 26,
  floorClear: 7,
  /** How briskly the whale closes on the depth the slider asked for, per
   *  second. Not "a share of the gap each frame" — that is a different curve
   *  on a 120Hz iPad than on a 60Hz laptop, and the whale would sink faster on
   *  the better machine. */
  followRate: 3.6,
} as const;

/**
 * The reef: a lane of open water running away down -Z, with a rocky ridge
 * either side and a floor that rises into sandbanks and drops into trenches.
 */
export const REEF = {
  /** How far it runs. The finish sits at -(length - 60). */
  length: 1560,
  /** Half-width of the swimmable lane. The ridges climb out of the floor
   *  beyond this, so the edge is something you can see rather than an
   *  invisible wall. */
  halfWidth: 122,
  /** How far past the edge the push lets you get before it wins, and how hard
   *  it pushes. Same soft boundary as the bee's: a push, then a clamp. */
  give: 6,
  push: 34,

  /** The floor, as a base depth plus two rolling terms. The long one makes the
   *  sandbanks and trenches you swim over; the short one is dunes on top. */
  floorBase: 62,
  floorRoll: 26,
  floorRollLength: 340,
  floorDune: 5,
  floorDuneLength: 71,
  /** The floor lifts toward the ridges, so the lane is a shallow valley. */
  floorEdgeLift: 26,

  /** The ridges: how tall above the floor and how thick. */
  ridgeHeight: 54,
  ridgeWidth: 46,

  /** Mesh resolution. 10 units a cell over 1600 x 340 is 160 x 34 cells, which
   *  is 5,440 quads — one draw call and no sign of the grid at these
   *  distances. */
  cell: 10,

  /** How many of each thing is scattered on the floor. */
  coral: 620,
  rocks: 190,
  weeds: 320,
} as const;

/** The water itself: what you see and how far. */
export const WATER = {
  /** Fog, which is what makes it water rather than air. Near is short: a reef
   *  you can see the whole of is a diorama, and one that fades is an ocean. */
  fogNear: 90,
  fogFar: 640,
  /** The two colours the fog moves between — bright green-blue at the surface,
   *  deep blue at the bottom — and the depth by which it is fully the deep
   *  one. Sky and fog are the same colour, always. */
  shallowColour: 0x46c2d6,
  deepColour: 0x11578a,
  colourDepth: 88,

  /** The surface plane: how big, how coarse, and the two wave trains crossing
   *  on it. Small waves, as the plan asks — this is a calm day. */
  surfaceSpan: 2200,
  surfaceCell: 40,
  waveHeight: 1.5,
  waveLength: 95,
  waveSpeed: 0.6,

  /** The dappled light. `causticScale` is how many times the pattern repeats
   *  over 100 units of floor; the drifts are how fast it slides. */
  causticScale: 0.055,
  causticDriftX: 0.011,
  causticDriftZ: 0.017,

  /** Sunbeams: how many, how wide at the surface, how far apart. */
  shafts: 26,
  shaftWidth: 26,
  shaftSway: 0.16,
} as const;

/**
 * The fish.
 *
 * They live in schools that swim slow loops over the reef. Some schools are
 * shy and break away when the whale gets close, which is the plan's "some fish
 * run away" — and it is what makes eating them a thing you do rather than a
 * thing that happens.
 */
export const FISH = {
  schools: 22,
  perSchool: 13,
  /** How wide a school spreads around its centre. */
  spread: 13,
  /** How fast a school's centre travels its loop, and how big the loop is. */
  driftSpeed: 5.5,
  loopRadius: 34,
  /** How fast a fish swims back to its place in the school. */
  gather: 2.4,
  /** Shy schools: what fraction of them are shy, how far off they notice the
   *  whale, and how hard they scatter. */
  shyShare: 0.45,
  fleeRange: 62,
  fleeSpeed: 30,
  /** How long a scattered school takes to lose interest. */
  calmTime: 2.4,
  /** Body length. Small enough that a school reads as a shimmer. */
  size: 3.4,
  palette: [0xffb03a, 0xff6f52, 0xffd85e, 0x6fd8ff, 0xff8fc4, 0x9be86a],
} as const;

/**
 * The plastic.
 *
 * Drifting rubbish — bottles, bags and six-pack rings. Touch one with your
 * mouth and the run starts again. It is the only way to lose, and the card
 * that says so is friendly about it: this is a game for a child.
 */
export const JUNK = {
  count: 34,
  /** How fast a piece drifts, and how fast it turns over as it goes. */
  drift: 2.6,
  tumble: 0.5,
  /** Nothing in the first stretch, so a child gets a swim before a scare. */
  clearStart: 240,
  size: 5,
} as const;

/** The camera: behind, a little above, looking where the whale is going. */
export const CAMERA = {
  fov: 62,
  /** How far behind and how far above. Close enough that the whale fills a
   *  useful part of the frame, far enough to see what is coming. */
  distance: 62,
  height: 12,
  /** How far ahead of the whale the shot looks. */
  lookAhead: 42,
  /** The camera's heading chases the whale's rather than its position being
   *  lerped — a soft positional chase on a close shot sits permanently behind.
   *  That one is written up in the squirrel game's notes. */
  headingLag: 3.4,
  pitchLag: 2.6,
  /** Never let the shot go under the sand or out through the surface. */
  floorClear: 9,
  surfaceClear: 4,
} as const;

/** The sound: ambience, and the two things that ever happen. */
export const SOUND = {
  loopSeconds: 4,
  /** Underwater is muffled, so the ambience is a lowpass on brown noise and
   *  the cutoff never gets bright. */
  cutoff: 320,
  gain: 0.055,
  /** How much louder it gets flat out, and how fast it follows. */
  gainFast: 0.11,
  rate: 1.6,
} as const;
