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
  groundSize: 220,
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
   * Just under FLIGHT.maxSpeed (9.5). The bee has to be able to stay ahead —
   * but only barely, or a straight-line flee outruns the wasp's interest
   * entirely and the chase can never be held for the full countdown.
   */
  speed: 8.7,
  accel: 11,
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
