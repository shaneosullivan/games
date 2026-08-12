/**
 * Every tunable number in the game lives here so balance changes never
 * require hunting through systems.
 */

export const SIM = {
  /** Fixed simulation step. Render interpolates between steps. */
  step: 1 / 60,
  /** Never simulate more than this much wall-clock in one frame (tab-restore guard). */
  maxFrame: 0.25,
} as const;

export const FLIGHT = {
  maxSpeed: 9.5,
  accel: 34,
  /** Deceleration applied when the stick is released. */
  drag: 7.5,
  /** Default cruising altitude above the ground. */
  hoverHeight: 2.2,
  /** Skimming the grass. */
  minHeight: 1.0,
  /**
   * Just above the tallest thing in the meadow. A tree's crown tops out at
   * (7.2 + 1.2 * 0.82) * 1.5 = 12.3 units — see createTrees in
   * render/geometry/world.ts. Keep these in step if the trees change.
   */
  maxHeight: 13.5,
  /** How fast the bee climbs or dives toward the altitude the player set. */
  climbSpeed: 4.2,
  /** Amplitude / rate of the idle up-down bob. */
  bobAmplitude: 0.12,
  bobRate: 2.4,
  /** How fast the bee's nose swings to face its velocity, radians/sec-ish. */
  yawLerp: 9,
  /** Bank angle at full lateral acceleration. */
  maxBank: 0.55,
  bankLerp: 6,
  /** Wing flap cycles per second. */
  flapHz: 22,
} as const;

export const CAMERA = {
  /** Offset behind/above the bee, in the camera's yaw frame. */
  distance: 7.6,
  height: 5.2,
  /** Look target height above the bee. */
  lookHeight: 1.1,
  /** How far ahead of the bee the camera looks, scaled by speed. */
  lookAhead: 0.28,
  /** Position spring stiffness (higher = tighter follow). */
  followLerp: 5.5,
  /**
   * Yaw follow. Because the stick is interpreted in the camera's frame,
   * a camera that snaps to the bee's heading feeds back into the input and
   * the bee spins in a tight circle. A dead zone plus a hard rate cap turns
   * that into a wide, deliberate arc instead.
   */
  yawDeadzone: 0.38,
  yawGain: 1.5,
  yawMaxRate: 0.75,
  fov: 55,
  near: 0.1,
  far: 300,
} as const;

export const WORLD = {
  /** Playable radius; the bee is softly pushed back inside. */
  radius: 52,
  groundSize: 320,
  flowerCount: { white: 22, yellow: 22, orange: 22 },
  /** Seconds before a harvested flower blooms again. */
  regrowSeconds: 18,
  /** Horizontal distance at which a flower can be harvested. */
  harvestRadius: 2.3,
  /** Vertical distance at which a flower can be harvested. */
  harvestHeight: 3.2,
  /** How long the bee must hover over a flower to harvest it. */
  harvestSeconds: 0.55,
} as const;

export type PollenKind = 'white' | 'yellow' | 'orange';

export const POLLEN_KINDS: readonly PollenKind[] = ['white', 'yellow', 'orange'] as const;

export const POLLEN_LABEL: Record<PollenKind, string> = {
  white: 'White Rose',
  yellow: 'Yellow Flower',
  orange: 'Orange Flower',
};

export const POLLEN_COLOR: Record<PollenKind, number> = {
  white: 0xfff3f6,
  yellow: 0xffd23f,
  orange: 0xff8a3d,
};

/**
 * Level 2: the royal chamber inside the hive.
 *
 * The dome has to be a good deal wider than the player's bounds, because the
 * chase camera sits behind and above the bee — at the far edge of the play
 * area the *camera* is what would clip through the wall.
 */
export const INTERIOR = {
  domeRadius: 30,
  /** How far from the centre the player may fly. */
  boundsRadius: 15,
  minHeight: 1.0,
  maxHeight: 11,
  /** Tighter camera than outdoors, so it stays clear of the dome shell. */
  cameraDistance: 6.4,
  cameraHeight: 4.2,
  /** Pollen stores sit against the wall; babies ring the queen at the centre. */
  storeRingRadius: 13.0,
  storeHeight: 1.5,
  babyRingRadius: 4.8,
  babyHeight: 2.3,
  queenHeight: 2.5,
  /** Hover distances and dwell times for picking up and feeding. */
  pickupRadius: 2.8,
  pickupSeconds: 0.45,
  feedRadius: 2.5,
  feedSeconds: 0.5,
  /** Seconds a fed baby stays content before wanting its next meal. */
  hungerDelay: 5.5,
  /** Hex cells lining the dome wall. */
  wallCells: 320,
} as const;

/**
 * Level 3: the wasp at the hive.
 *
 * The design brief is "you are faster than the wasp — fly in front of it and
 * run away". So the wasp is genuinely slower than the bee's top speed, and it
 * only locks on when the bee crosses its field of view. The countdown then
 * runs *only while it's chasing*, which turns the level into a bait-and-flee
 * loop rather than a waiting game.
 */
export const WASP = {
  scale: 1.35,
  /**
   * Slightly *faster* than FLIGHT.maxSpeed (9.5), so you can't simply outrun
   * it in a straight line. What saves you is that it corners badly: see
   * `chaseTurnRate` and `reactionLag`. Escape is about turning, not speed.
   */
  speed: 10.2,
  accel: 11,
  /**
   * Radians per second its heading may swing while chasing. At 10.2 units/s
   * that's a turning circle of about 7 units — change direction sharply and it
   * sails past before it can come around.
   */
  chaseTurnRate: 1.5,
  /** It turns normally when it isn't locked on to anything. */
  turnRate: 3.2,
  /**
   * Seconds of lag on where it thinks you are. Combined with the turn cap this
   * is what makes it keep going the old way for a moment after you cut away.
   */
  reactionLag: 0.5,
  /** Cruise altitude; it climbs and dives toward the bee within limits. */
  height: 3.4,
  minHeight: 1.4,
  maxHeight: 11,
  /** It only takes the bait if the bee is this close AND in front of it. */
  baitRadius: 18,
  /** cos(55°): how wide "in front of it" is. */
  baitCone: 0.574,
  /**
   * Get further than this and it gives up. Generous on purpose: the bee only
   * gains ~0.8 units a second, and the meadow boundary forces turns that let
   * the wasp close again, so a competent flee sustains the chase.
   */
  loseRadius: 38,
  /** Close enough to bump the bee. */
  catchRadius: 1.9,
  /** After a bump: the wasp veers off and the bee is knocked back. */
  veerSeconds: 2.2,
  stunSeconds: 0.9,
  knockbackSpeed: 12,
  /** Radius it circles the hive at when it has nothing better to do. */
  hiveOrbitRadius: 5.0,
  hiveOrbitRate: 0.55,
  /** How long the fly-in takes, and how long the fly-off takes. */
  arriveSeconds: 3.0,
  leaveSeconds: 3.2,
} as const;

/**
 * Level 4, stage 1: the dance mat outside Caramel Cottage.
 *
 * A 3x3 mat. The bee hovers over the centre pad; the eight around it light up
 * and you tap each before it goes dark. The beat is deliberately unhurried —
 * this is a rhythm game for a child, so the window to react is most of a beat
 * rather than a few frames.
 *
 * It starts one pad at a time and then steps up to two per cue, offset by
 * `pairOffset` beats. The difficulty is deliberately in *how many* pads you're
 * tracking rather than in how fast you have to be.
 */
export const DANCE = {
  /** Beats per minute of the backing track. */
  bpm: 96,
  /** Cues land on every Nth beat, so there's a rest between them. */
  beatsPerCue: 2,
  /** How long a pad stays lit, as a fraction of the gap between cues. */
  litFraction: 0.85,
  /** Cues in a full round. */
  cues: 20,
  /**
   * How many cues are a single pad before it steps up to two at a time.
   *
   * The round has to teach itself before it tests you: eight cues is enough to
   * learn where to look and how long you have.
   */
  soloCues: 8,
  /**
   * Beats between the two pads of a pair.
   *
   * Deliberately not zero — two pads lighting together read as one wide
   * target, whereas a beat apart they read as "that one, then that one", which
   * is the thing that's actually harder. Each pad keeps the full window, so
   * what's added is having to watch two places, not having to be quicker.
   */
  pairOffset: 0.6,
  /** Fraction of pads you must hit to open the door. */
  passRatio: 0.9,
  /** Beats of lead-in before the first cue, so the beat is established. */
  countInBeats: 8,

  /** Mat geometry. */
  padSize: 1.5,
  padGap: 0.16,
  padHeight: 0.12,
  /** How high the bee hovers over the mat. */
  hoverHeight: 1.5,
  /** Seconds for one hop out to a pad and back. */
  hopTime: 0.42,
  hopArc: 1.1,
} as const;

export const COTTAGE = {
  /**
   * The house is authored small and scaled up bodily. A bee is ~1.5 units
   * long, so a cottage has to be tens of units tall to read as a building.
   * At 6x the walls stand 26 units and the ridge nearly 40 — the bee is a
   * speck at the door, which is the point.
   */
  houseScale: 5,
  boundsRadius: 50,
  minHeight: 1.0,
  maxHeight: 10,
  // Well back and high: the whole 3x3 mat has to be visible and tappable.
  cameraDistance: 13,
  cameraHeight: 11,
  /**
   * Well clear of the scaled-up house front (z = 10.5 at 5x), so the camera
   * can frame the mat and still show the door it is going to open — and far
   * enough out that the 3x pull-back when the bear arrives doesn't reverse the
   * camera into the gingerbread wall.
   */
  matOffsetZ: 36,
  /**
   * Where the whole clearing sits in the meadow's world.
   *
   * The cottage used to be its own scene at the origin, swapped in and out.
   * It now stands at the north end of the same world as the hive, so the flight
   * home is one continuous flight rather than a cut: mat at z = -48, gate at
   * z = -28, hive at the origin.
   */
  yardOffsetZ: -78,
  /** The mown clearing around the house. Sits inside the meadow's ground. */
  clearingRadius: 40,
  /** Gap in the hedge, in radians either side of due south (+Z). */
  gateGap: 0.24,
  /** Half-width of the gateway itself. */
  gateHalfWidth: 4.5,
  /** Bounds for the flight home: has to hold the yard and the hive both. */
  flightRadius: 115,
  /**
   * How far back the camera pulls once the bear turns up. A bear this size
   * needs the room — at normal framing it fills the screen or sits off it.
   */
  chaseZoom: 3,
} as const;

/**
 * Level 4, stage 2: inside Caramel Cottage.
 *
 * A room you can actually fly around, with a jar of honey on the counter. Pick
 * it up and it hangs from the bee on a rope — see entities/honeyJar.ts for the
 * pendulum that gives it weight.
 */
export const INSIDE = {
  /**
   * Sized around the *camera*, not the bee: the chase rig sits behind and
   * above, so the room has to be wider than boundsRadius + cameraDistance or
   * the camera ends up embedded in a wall looking at nothing.
   */
  roomSize: 34,
  roomHeight: 11,
  counterHeight: 3.0,
  jarHeight: 1.5,
  /** Height of the framed picture's centre on the back wall. */
  pictureHeight: 5.7,
  /** Fly this close to take the jar. Generous: the counter is against the
   *  back wall, just past where the bee is allowed to fly. */
  pickupRadius: 3.2,

  boundsRadius: 10.5,
  minHeight: 1.2,
  maxHeight: 7,
  cameraDistance: 6.0,
  cameraHeight: 3.4,

  /** Rope length from the bee's belly to the jar. Long enough that the jar
   *  hangs clear of the bee rather than covering her from a high camera. */
  ropeLength: 2.6,
  /** Gravity on the hanging jar. Higher swings faster and settles harder. */
  jarGravity: 22,
  /** Per-second velocity retained; below 1 the swing dies down. */
  jarDamping: 0.86,
} as const;

/**
 * Level 4, stage 3: the bear chase home, and the puzzle that sees it off.
 *
 * The bear works like the wasp — faster than the bee but slow to corner — so
 * the same trick saves you: turn, and it sails past before it can come round.
 */
export const BEAR = {
  scale: 2.6,
  speed: 10.6,
  accel: 14,
  /** Radians/sec its heading may swing while chasing. Worse than the wasp. */
  chaseTurnRate: 1.2,
  turnRate: 2.4,
  /** Seconds of lag on where it thinks the bee is. */
  reactionLag: 0.6,
  /** Close enough to swipe at the bee and knock her spinning. */
  swipeRadius: 3.2,
  stunSeconds: 0.9,
  knockbackSpeed: 13,
  /** How long it stays winded after a swipe before chasing again. */
  recoverSeconds: 2.0,
  /** How close to the hive the bee must get to deliver the honey. */
  deliverRadius: 4.0,
  /** Where it waits outside the cottage, relative to the door. */
  ambushOffset: 14,
  fleeSeconds: 4.0,
} as const;

export const PUZZLE = {
  /**
   * Scramble depth for the 3x3 sliding puzzle.
   *
   * These are random *walk* steps, not distance from solved — the blank
   * backtracks over itself, so the state ends up no further away than the
   * count and usually nearer.
   *
   * Measured against a full breadth-first search of the 8-puzzle: 12 steps
   * lands 6-12 optimal moves from finished, which is a puzzle a child can see
   * their way through. The board's own ceiling is 31, and 30 steps very nearly
   * reaches it — so this number matters much more than it looks.
   */
  scrambleMoves: 12,
} as const;

export const LEVELS = {
  /** Level 1: found the hive by gathering this much of each pollen. */
  foundingQuota: { white: 10, yellow: 10, orange: 10 } satisfies Record<PollenKind, number>,
  /** Level 2: how many baby bees ring the queen. */
  babyCount: 6,
  /** Level 2: feeds each baby needs before it grows up. */
  feedsToGrow: 3,
  /** Hexagons needed to finish the comb — folded into level 2's decor. */
  hexTarget: 20,
  /** Pollen consumed per hexagon. */
  pollenPerHex: 5,
  /** Not yet used: one in-game day, in real seconds. */
  daySeconds: 12 * 60,
  babyDays: 5,
  /** Level 3: seconds of held chase needed to see the wasp off. */
  waspSeconds: 30,
} as const;

export const RENDER = {
  /** iPad Pro's native DPR will melt fill rate; 2 is plenty for this look. */
  maxPixelRatio: 2,
  shadowMapSize: 1024,
  fogNear: 45,
  fogFar: 150,
} as const;

export const INTERIOR_PALETTE = {
  /** Warm amber gloom beyond the lit cells. */
  background: 0x2e1a08,
  fog: 0x4a2c10,
  wax: 0xc98a2e,
  waxDark: 0x8a5a18,
  cellFull: 0xffcf5e,
  cellEmpty: 0x6b4412,
  floor: 0xa8701f,
  dais: 0xf0b93f,
} as const;

export const PALETTE = {
  sky: 0x9fdcf0,
  fog: 0xcfeaf2,
  grass: 0x86c96b,
  grassDark: 0x63ad55,
  stem: 0x4e9a45,
  beeBody: 0xf7c948,
  beeStripe: 0x3a2b1a,
  beeHead: 0x3a2b1a,
  wing: 0xeaf7ff,
} as const;
