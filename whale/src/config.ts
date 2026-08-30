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
  /** Nose up or down while climbing and diving, radians at the very top of
   *  the climb range. 1.3 is about seventy-five degrees — all but vertical,
   *  which is what a whale on its way up to a breach actually looks like. A
   *  gentle rise never gets near it, because the pitch is read off the climb
   *  rate and a gentle rise is a small fraction of it. */
  pitchMax: 1.3,
  pitchRate: 4.2,
  /**
   * How fast it rises or sinks toward the depth the slider asked for — and
   * then how much faster than that a whale that has been climbing for a while
   * is allowed to go.
   *
   * Holding the slider up is meant to build: the first second is a whale
   * rising, and the fourth is a whale coming up like a torpedo. `urgeRate` is
   * how long it takes to wind up (a second and four fifths to the top),
   * `urgeFall` how quickly it lets go once you stop asking.
   */
  climbSpeed: 17,
  urgeMax: 2.7,
  urgeRate: 0.55,
  urgeFall: 2.2,
  /**
   * How far below the depth it was asked for the whale has to be for the
   * wind-up to keep building.
   *
   * Small on purpose. It exists only so a slider parked at the top does not
   * hold a surfaced whale wound tight and breach it over and over on the spot
   * — at six it was doing real harm instead, unwinding over the last six units
   * of the climb, which is exactly the water the whale has to be quickest in
   * if it is ever going to leave it. It arrived at the surface at the breach
   * threshold to four significant figures and never once got out.
   */
  urgeGap: 1.5,
  /** The idle bob, so a whale holding still is still alive. */
  bobAmplitude: 0.5,
  bobRate: 1.1,
  /** Tail beats a second at full speed, and the smallest it ever beats — the
   *  fluke keeps moving when the whale is drifting. */
  fluke: 1.15,
  flukeIdle: 0.34,
} as const;

/**
 * Breathing.
 *
 * Not a timer and not a thing you can fail at — there is no drowning in this
 * game. It is what happens when a whale reaches the air: a spout, a sound, and
 * the shot coming up out of the water with it.
 */
export const BREATH = {
  /** How shallow counts as being up for air. */
  depth: 6,
  /** Seconds before it will blow again, so riding along the surface is one
   *  breath every few seconds and not a fountain. */
  cooldown: 3.2,
  /** Where the blowhole is on the model, in the whale's own coordinates. */
  hole: {x: 0, y: 5.8, z: 4.6},
} as const;

/**
 * The breach.
 *
 * Come up fast enough and the whale does not stop at the surface — it leaves
 * the water altogether, hangs, and comes down on its side in a great slap of
 * white. It is the one thing in this game that is purely for the doing of it:
 * there is nothing to win by it and nothing that needs it.
 */
export const BREACH = {
  /** Vertical speed at the surface needed to get out of the water at all.
   *  Reachable only with the climb wound most of the way up — see SWIM.urge. */
  speed: 26,
  /** How much of that speed carries into the air. */
  launch: 1.36,
  /**
   * What pulls it back.
   *
   * These two are a pair and were solved rather than guessed: the apex is
   * v²/2g and the airtime 2v/g, off a whale that arrives at the surface at
   * about 47 and so leaves it at 63. Measured in the running game, that is 27
   * units of air — four fifths of the whale's own length — and 2.1 seconds of
   * it. A real humpback clears about two thirds of itself. Going higher only
   * made it hang about in the sky.
   */
  gravity: 53,
  /** How far it can be past the surface before the splash counts as over. */
  land: 1,
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
  /**
   * The top of the slider, and it is the surface itself rather than a polite
   * distance under it. A whale is an air-breathing animal: it has to be able
   * to put its back and its blowhole out into the air, and a game that stopped
   * it nine units short would be a game about a fish.
   */
  minDepth: 2,
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
  /** Corals are the most expensive thing on the reef — each one is a branching
   *  structure of forty-odd twigs — so this is a triangle budget as much as a
   *  look. Measured: see the note in the README. */
  coral: 440,
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

  /** Above the water: the sky, and how much further you can see in air. The
   *  fog has to open right out or the world ends a few lengths from the
   *  whale's nose the moment its head is out. */
  skyColour: 0xc4ecf9,
  airFogNear: 260,
  airFogFar: 1500,

  /**
   * The surface, from the two sides.
   *
   * From underneath it is a bright ceiling you want to see the reef and the
   * finish arch through, so it is thin. From above it is the sea, and the sea
   * is not a window: at the underneath figure the whole reef showed through it
   * like a bleached aquarium. One material, swapped as the camera crosses.
   */
  fromBelowColour: 0xcaf6ff,
  fromBelowOpacity: 0.62,
  fromAboveColour: 0x3ea9c6,
  fromAboveOpacity: 0.95,

  /** Sunbeams: how many, how wide at the surface, how far apart. */
  shafts: 26,
  shaftWidth: 26,
  shaftSway: 0.16,
} as const;

/**
 * The sky, which you only ever see with your head out of the water.
 *
 * Clouds, gulls wheeling about above the waves, and gulls sitting on the water
 * that get up and go when a whale surfaces underneath them. All of it is
 * hidden while the camera is under, so none of it costs anything for the parts
 * of the game that happen down on the reef.
 */
export const SKY = {
  clouds: 16,
  /** How high they sit and how big they are. Big and far: a cloud the size of
   *  the whale reads as a balloon. */
  cloudLow: 150,
  cloudHigh: 320,
  cloudSize: 46,
  /** How far out clouds and gulls are scattered around the whale. The patch
   *  travels with it, the same as the water surface does. */
  spread: 900,
  /** Cloud drift, units a second. Barely. */
  cloudDrift: 2.2,

  /** Gulls in the air, and the circles they wheel in. */
  flying: 9,
  gullSize: 4.4,
  circleLow: 26,
  circleHigh: 95,
  circleRadius: 60,
  circleSpeed: 0.34,
  /** Wingbeats a second, gliding and flapping hard. */
  glideBeat: 0.9,
  flapBeat: 3.4,

  /** Gulls sitting on the water. */
  floating: 8,
  /** How near the whale can get before they go, and how fast they leave. */
  fleeRange: 62,
  takeOff: 26,
  climb: 11,
  /** How long they stay up before finding somewhere new to sit, and how far
   *  ahead of the whale they settle. */
  settle: 5.5,
  landAhead: 320,
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
  /** Never let the shot go under the sand. */
  floorClear: 9,
  /**
   * The surface, from both sides.
   *
   * Below `breachDepth` the shot is held under the water, because a camera
   * sitting in the plane of the surface shows half sky and half sea and reads
   * as a bug. As the whale comes up for air the shot comes with it, ending
   * `airClear` above the waves — which is the only time in the game you see
   * the sky, and worth the trip.
   */
  breachDepth: 16,
  surfaceClear: 4,
  airClear: 7,
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
