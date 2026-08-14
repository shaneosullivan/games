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
  /**
   * How far past the edge of the playable disc the bee may get.
   *
   * The boundary is a push, not a wall, so it has to be strong enough to stop
   * `maxSpeed` within this distance or the stick simply wins: the push balances
   * the stick at `boundsGive * maxSpeed / boundsPush` past the edge, which is
   * 0.43 units here. The position is hard-clamped at `boundsGive` as well, so
   * a shove or a dive can't do better than the stick can.
   *
   * It used to ramp over 6 units, which balanced 2.6 units out — far enough to
   * put the bee inside the meadow's boundary hedge and inside the royal
   * chamber's honeycomb, both of which sit just past the edge of play.
   */
  boundsGive: 1.0,
  boundsPush: 22,
  /**
   * How fast the bee spins on the spot under tank steering, radians a second.
   * A right angle in about two thirds of a second — brisk enough that lining
   * up with a corridor is a flick rather than a manoeuvre.
   */
  tankTurnRate: 2.4,
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
   * Yaw follow, while the player is steering. Because the stick is read in the
   * camera's frame, a camera that snaps to the bee's heading feeds back into
   * the input and the bee spins in a tight circle. A dead zone plus a hard rate
   * cap turns that into a wide, deliberate arc instead.
   *
   * Note what this can and can't do. Holding the stick off-forward puts the
   * bee's heading at exactly that angle from the camera, and turning the camera
   * turns the heading with it — the offset is a fixed point of the loop, so no
   * gain here will close it. That is why the numbers below only have to be
   * gentle, and why the real re-centring is the idle case.
   */
  yawDeadzone: 0.38,
  yawGain: 1.5,
  yawMaxRate: 0.75,
  /**
   * Yaw follow when nobody is touching the stick — much brisker, because the
   * feedback loop above only exists while the player is steering. Let go after
   * a turn and the camera comes round behind the bee within about a second,
   * instead of stopping wherever it happened to be and leaving her side-on.
   */
  yawIdleGain: 1.8,
  yawIdleMaxRate: 1.4,
  /**
   * Extra pull-back on a small screen, keyed off the *shorter* side of the
   * viewport so it catches a phone either way up and leaves an iPad alone.
   * The world is the same size whatever it's shown on, so a phone gets a much
   * smaller window onto it; widening the shot is what makes it steerable.
   */
  smallScreen: {
    /** Shorter side at or below which the full amount applies. */
    narrow: 380,
    /** ...and at or above which none of it does. */
    wide: 760,
    zoom: 1.35,
  },
  fov: 55,
  near: 0.1,
  /**
   * Past the cottage fog's far distance (320), so nothing still visible is
   * clipped. The chase home is 168 units long and looks down the length of it.
   */
  far: 420,
} as const;

export const WORLD = {
  /** Playable radius; the bee is softly pushed back inside. */
  radius: 52,
  /**
   * Diameter of the ground disc. It has to reach past the cottage clearing at
   * the north end — |COTTAGE.yardOffsetZ| + clearingRadius = 244 — with enough
   * to spare that the edge is never the nearest thing on the horizon.
   */
  groundSize: 640,
  /** How far outside `radius` the boundary hedge is planted. */
  hedgeOffset: 2.5,
  /**
   * The mouth of the lane north: the meadow's hedge and treeline both step
   * aside within this many radians of due north, and the gate stands across
   * the gap they leave.
   */
  laneGap: 0.6,
  /**
   * The lane north to Caramel Cottage: the corridor between the meadow's
   * treeline and the clearing's hedge, which the bear chase runs the length of.
   *
   * Left bare it is a hundred units of flat green, and at that scale speed
   * stops reading — the bee looks becalmed however hard you fly. Trees down
   * either side give the flight something to sweep past, and the bear
   * something to corner badly around.
   */
  lane: {
    /** Trees per side. */
    trees: 15,
    /** Distance from the lane's centreline to a trunk, before jitter. */
    halfWidth: 17,
    /** Jitter on that, so the rows aren't an avenue of telegraph poles. */
    spread: 7,
  },
  flowerCount: {white: 22, yellow: 22, orange: 22},
  /** Seconds before a harvested flower blooms again. */
  regrowSeconds: 18,
  /** Horizontal distance at which a flower can be harvested. */
  harvestRadius: 2.3,
  /** Vertical distance at which a flower can be harvested. */
  harvestHeight: 3.2,
  /** How long the bee must hover over a flower to harvest it. */
  harvestSeconds: 0.55,
} as const;

export type PollenKind = "white" | "yellow" | "orange";

export const POLLEN_KINDS: ReadonlyArray<PollenKind> = [
  "white",
  "yellow",
  "orange",
] as const;

/*
 * What the player calls them. The `orange` key keeps its name because it is in
 * every save file (`pollen.orange`), but the flower on screen is 0xff8a3d under
 * toon shading, which reads red — so red is what it's called.
 */
export const POLLEN_LABEL: Record<PollenKind, string> = {
  white: "White Rose",
  yellow: "Yellow Flower",
  orange: "Red Flower",
};

/*
 * The swatch for each pollen: the HUD's counter dot, the puff of motes when
 * you collect it, a baby's craving bubble, and the food cells in the larder
 * wall. It stands for the flower, so it has to look like the flower does.
 *
 * That's why red isn't the petal's own 0xff8a3d. A material colour is what the
 * flower would be under a flat white light; the toon ramp then shades it down
 * across three bands, and the petals actually come out at a mean of 0xdd4814
 * on screen — read off the canvas, not guessed. Shown flat on a HUD chip the
 * material colour has none of that shading and reads peach, which is how the
 * dot ended up looking orange beside a flower that plainly isn't.
 */
export const POLLEN_COLOR: Record<PollenKind, number> = {
  white: 0xfff3f6,
  yellow: 0xffd23f,
  orange: 0xe04517,
};

/** Level 2: the royal chamber inside the hive. */
export const INTERIOR = {
  /**
   * The shell. The play area reaches almost to it, because the food is in the
   * honeycomb lining it — what keeps the camera from ending up outside is the
   * enclosure below, not a gap between the two.
   */
  domeRadius: 34,
  /**
   * How far from the centre the player may fly.
   *
   * Out to the wall, near enough: the food is in the honeycomb lining it, and
   * the hover point for a cell is FOOD.hoverOut in from the shell. What keeps
   * the camera out of the wall is not this number but the rig's enclosure —
   * see cameraEnclosure below.
   */
  boundsRadius: 31.5,
  /**
   * The domed ceiling, as a distance from the centre.
   *
   * `boundsRadius` is a disc and `maxHeight` a flat lid, which together make a
   * cylinder — and a cylinder's top rim stands outside a dome. At the bounds
   * at full altitude the bee was 33.4 out with the shell at 34, and the soft
   * edge's overshoot took her through it. This rounds the corner off.
   *
   * Matched to boundsRadius + FLIGHT.boundsGive so it costs nothing down at
   * floor level and only tapers the reach as you climb. The comb's inner face
   * is at 33.45, which leaves the bee a clear unit of air at every height.
   */
  boundsSphere: 32.5,
  minHeight: 1.0,
  /** Above the highest food, so the top of the wall is still flyable. */
  maxHeight: 11,
  /**
   * The sphere the camera may not leave. Just inside the comb's inner face
   * (33.45), and outside everywhere the bee can reach, so the rig always has
   * somewhere legal to stand.
   */
  cameraEnclosure: 33.2,
  /**
   * Pulled back 1.5x from where it started: feeding is about spotting which
   * baby wants what colour, and the close rig had you nose-to-nose with one
   * of them with the rest of the ring off-screen.
   */
  cameraDistance: 9.6,
  cameraHeight: 6.3,
  babyRingRadius: 4.8,
  babyHeight: 2.3,
  queenHeight: 2.5,
  /**
   * How close to a baby counts as delivering, and how long the hand-over takes.
   *
   * Measured across the floor, with `feedHeight` allowed on top of it — the
   * same split the meadow uses to harvest a flower. A single 3D distance meant
   * hovering over a baby at any sensible cruising height was out of range
   * however well lined up you were, so every feed needed a descent first: the
   * babies perch at 2.3 and the reach was 2.5, so at 5 up you were already too
   * far away to touch one directly underneath you.
   */
  feedRadius: 3,
  /**
   * The whole flyable column and then some: babies perch at 2.3 and the
   * ceiling is 11, so 8.7 is the most she can ever be above one. Anything less
   * than that leaves a dead band at the top of the room where being directly
   * over a baby doesn't count, which is exactly the surprise this replaced.
   */
  feedHeight: 9.5,
  feedSeconds: 0.5,
  /**
   * How close the bee has to be for a baby to rear up at her — comfortably
   * further than feedRadius, so the beg comes first and the feed answers it.
   * Split the same way, or they would only notice her once she came down.
   */
  noticeRadius: 6,
  noticeHeight: 10,
  /** How far a fully reared baby lifts off its perch as it stretches up. */
  rearLift: 0.35,
  /** Seconds a fed baby stays content before wanting its next meal. */
  hungerDelay: 5.5,
  /** Hex cells lining the dome wall. */
  wallCells: 320,
} as const;

/**
 * The food in the walls.
 *
 * Some of the honeycomb lining the dome is full: those cells are coloured for
 * the pollen they hold and ringed with a glow that pulses. They are the same
 * instances as the rest of the comb — the wall *is* the larder — so taking one
 * empties it and it fills again a few seconds later.
 *
 * They're spread from just above the floor to near the top of the flight
 * ceiling, so getting the colour a baby wants often means climbing for it.
 */
export const FOOD = {
  /** How many cells hold food. Divided evenly between the pollen colours. */
  cells: 12,
  /**
   * The band of the dome they're placed in, as a height in world units. The
   * top of the range is what makes the level a climb; keep it under
   * INTERIOR.maxHeight or the highest food can't be reached at all.
   */
  minHeight: 1.6,
  maxHeight: 9.6,
  /** How far in from the wall the bee hovers to take one. */
  hoverOut: 2.6,
  /** Close enough to take it. Generous: this is a tap-free, one-handed game. */
  takeRadius: 3.4,
  /**
   * ...and closer still to swap one you're already carrying for it.
   *
   * A loaded bee can trade her hexagon for a different colour, which is what
   * stops a wrong guess ending the level. Tighter than `takeRadius` because
   * both happen on proximity alone: at the full radius she would swap her load
   * for whatever she skimmed on the way back to the brood.
   */
  swapRadius: 2.2,
  /** Seconds before an emptied cell fills again. */
  refillSeconds: 6.0,
  /** Rate and depth of the glow pulse around a full cell. */
  pulseRate: 2.2,
  pulseDepth: 0.35,
  /** The rope the taken hexagon swings on under the bee. */
  ropeLength: 1.5,
  gravity: 26,
  damping: 0.82,
  /** How long the hexagon takes to fly from the bee into a baby. */
  deliverTime: 0.42,
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
  /**
   * The shot while you're on the mat: locked off, square to the board, close.
   *
   * This stage isn't about flying, it's about reading nine squares and hitting
   * them, so the chase rig is the wrong tool — following the bee's bob and
   * her hops out to the pads swims the whole board around under the targets
   * you're trying to tap. The camera is parked instead, and the distance is
   * computed from the real FOV and aspect (see `CameraRig.framedEye`) so the
   * board is as large on a phone as it is on an iPad.
   *
   * `cameraPitch` is radians above the horizontal. It has to be steep: the bee
   * waits over the centre pad, and from a low angle she stands directly in
   * front of the pad behind her — measured at 1.0 rad it was 100% hidden, so a
   * cue landing there was unanswerable. By 1.25 the worst any target is
   * covered is 22%, and nothing else reaches a quarter.
   *
   * `boardFill` is where the board's worst corner lands, with 1 being the edge
   * of the screen; the rest is margin for the HUD along the top.
   */
  cameraPitch: 1.25,
  boardFill: 0.88,
  /**
   * And the shot once the door opens.
   *
   * The board framing is tight on nine squares; the doorway is 27 units behind
   * the mat and six up, so the whole of her flight into the house happened off
   * the side of it. This opens out to hold the mat and the door together, and
   * drops to a shallower angle because a door is a vertical thing — from the
   * board's steep pitch you would be looking at the roof.
   */
  exitPitch: 0.72,
  exitFill: 0.95,
  /** Margin around the mat-to-door span, for the house standing above it. */
  exitMargin: 1.5,
  /** How fast the shot opens out. Over about a second, under the door swing. */
  exitRate: 2.6,
} as const;

/**
 * Level 5: the Windy Woods.
 *
 * A maze of trees, generated fresh every time so it can't be learned. Getting
 * lost is the point, so the level hands out help rather than punishment: every
 * dead end holds a flower, and eating one shows you the maze from above and
 * leaves a scent on the correct way out.
 */
export const MAZE = {
  /** Cells across and down. Odd numbers centre the grid on the origin. */
  cols: 9,
  rows: 9,
  /**
   * Middle of one corridor to the middle of the next.
   *
   * Wider than the grid needs, because the walls are hedges as well as trees:
   * a bush is 1.6 across before it's scaled, and two of them face each other
   * over every corridor. Nine cells of eleven is the same 99 units across as
   * eleven of nine, so the maze is no smaller — the lanes are just broader and
   * there are fewer turns, which suits who this is for.
   */
  cellSize: 14.5,
  /**
   * How far off a corridor's centre line the bee may stray — half the width of
   * the flyable lane, which is 10.2 across.
   *
   * Read off the maze rather than worked out from the wall's parts: raycast
   * sideways from every corridor centre at every height she can fly and the
   * nearest leaf is 5.66 away, so this leaves half a unit for her own body.
   * `cellSize` is set from that rather than the other way round: the lane's
   * width is what was asked for, and the wall has to fit outside it.
   * Derived on paper from the bush's radius it came out a unit and a third
   * short of anything, which reads as an invisible wall with daylight beyond
   * it — a squashed blob is much narrower at flying height than at its waist.
   */
  corridorHalfWidth: 5.1,
  minHeight: 1.2,
  /** Under the canopy, which starts at `canopyBase`. */
  maxHeight: 3.6,
  /**
   * Lower and a little further back than the meadow rig, as the brief asks:
   * you sit behind the bee looking down the corridor rather than over the top
   * of the woods. Even at a phone's 1.35 pull-back the eye stays under
   * `canopyBase`, which is what keeps the shot out of the leaves.
   */
  cameraDistance: 8,
  cameraHeight: 3.2,
  /**
   * How much faster she flies in here than anywhere else.
   *
   * The corridors are eighteen units long and taken in a straight line, so at
   * the meadow's 9.5 the level is mostly waiting for her to cross a cell. This
   * puts it at 16.2, which turns a 70-second optimal route into about 45.
   */
  speedScale: 1.7,
  /** Well outside the maze: the corridor clamp is the real boundary. */
  boundsRadius: 110,

  /** Wall trees. Bare to `canopyBase` so the shot can see down a corridor. */
  trunkRadius: 0.5,
  canopyBase: 8,
  /**
   * Canopy spread. Two of these face each other across a 9-unit corridor and
   * still leave 4.6 units of daylight between them, which is what makes the
   * maze legible from the survey shot instead of a solid green roof.
   */
  canopyRadius: 2.2,
  /** Trees along each walled cell edge, on top of the posts at its corners. */
  treesPerWall: 2,

  /**
   * The hedge between the trunks.
   *
   * Bare trunks alone left the walls see-through at flying height, which reads
   * as a wood you happen to be in rather than a maze you have to solve. Bushes
   * fill them in to a proper leafy corridor.
   *
   * `bushHeight` is deliberately just above the camera's eye at 5.4: you can
   * see a suggestion of the tops going by, but never over them into the next
   * lane, or the maze would solve itself.
   */
  bushRadius: 1.6,
  bushHeight: 5.6,
  bushesPerWall: 5,

  /** The breeze. Trees lean on it; leaves come off it. */
  swayAmplitude: 0.045,
  swayRate: 0.85,
  leaves: 150,
  /** Leaves are recycled within this radius of the bee, so they're never gone. */
  leafRadius: 45,
  leafFallSpeed: 1.2,
  leafDrift: 0.9,
  leafSize: 0.34,

  /** The pollen she drops to mark where she's already been. */
  crumbSpacing: 1.5,
  crumbCount: 900,
  crumbSize: 0.17,

  /** Flowers at the dead ends. */
  eatRadius: 2.6,
  eatTime: 0.5,

  /**
   * How many cells of the correct route a flower reveals.
   *
   * Deliberately not all of it. The brief asks for a nudge "in the right
   * direction for a bit, but not too long" — and if one flower solved the
   * maze, the other dead ends would have nothing left to offer.
   */
  scentCells: 9,
  /** Spacing of the scent motes along the route, and how big they are. */
  scentSpacing: 0.7,
  scentSize: 0.22,
  scentHeight: 1.9,
  /** Pulses run along the scent this fast, one every `pulseGap` units. */
  pulseSpeed: 4.5,
  pulseGap: 5,

  /** The look at the whole maze after a flower. */
  surveyRise: 1.4,
  surveyHold: 5,
  surveyFall: 1.4,
  /** Nearly straight down, and how much of the screen the maze fills. */
  surveyPitch: 1.35,
  surveyFill: 0.92,
  /**
   * How far the fog is pushed back at the top of the survey.
   *
   * The woods fog out at 62 units so you can't see across the maze from inside
   * it — that's what makes it a maze. The survey shot stands about 110 above
   * the middle and the far corner is 130 away, so without lifting the fog the
   * big reveal is a flat wash of nothing. Eased in with the rise, which also
   * reads as the mist thinning as she climbs out of it.
   */
  surveyFogScale: 4,
  /**
   * How much bigger the scent motes get at the top of the survey. From 110
   * units up a mote is about two pixels across, and the whole point of going
   * up there is to see where the trail goes.
   */
  scentSurveyScale: 7,

  /**
   * Wall that comes between the camera and the bee is faded out of the way.
   *
   * The alternative was moving the camera — swinging it up over the hedge when
   * the way behind her was blocked — and a maze blocks it constantly, so the
   * shot spent its life climbing and dropping. Fading is steadier: the camera
   * stays where the rig wants it and the trunk in front of it isn't there.
   *
   * What gets faded is decided by depth, not by distance from the eye. Plain
   * distance can't tell a bush blocking the view from the bush right beside
   * her — they are both a few units away — so at a long range the whole maze
   * washed out and at a short one the bee stayed hidden. Measuring against her
   * own depth separates the two exactly: solid from `fadeMargin` in front of
   * her outwards, gone `fadeBand` before that.
   */
  fadeMargin: 1.4,
  fadeBand: 2.6,
  /** Below this the fragment is dropped, so a ghost can't hide the bee behind
   *  it by writing depth. */
  fadeCutoff: 0.06,

  /** Close enough to the way out to have finished. */
  exitRadius: 3.2,
} as const;

/*
 * Autumn, but a bright one. These are much lighter than a photograph of bark
 * would be: the toon ramp's darkest band is 0.47, a vertical trunk catches
 * mostly the horizon of the hemisphere light, and the corridor walls stand
 * three metres from the camera — a realistic brown came out as a black
 * silhouette against the sky.
 */
export const MAZE_PALETTE = {
  bark: 0xa8825c,
  bush: 0x5f9a44,
  bushDark: 0x487c34,
  bushLight: 0x77b155,
  canopy: 0xc4692f,
  canopyDark: 0x9c4826,
  ground: 0x7d8c52,
  leaf: [0xb4462a, 0xc9662f, 0x8c3a22, 0xd08a3e] as ReadonlyArray<number>,
  crumb: 0xffd23f,
  scent: 0xcaff70,
  exit: 0x9ef7c4,
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
   * It now stands at the far north end of the same world as the hive, so the
   * flight home is one continuous flight rather than a cut: mat at z = -168,
   * gate at z = -154, hive at the origin.
   *
   * That run is deliberately long. The whole of stage 3 is the flight from the
   * mat to the hive with the bear behind you, and at the old offset of -78 it
   * was over in a few seconds. Four times the distance (42 units of escape,
   * now 168) is four times the chase. The lane between the meadow and the
   * clearing is planted to match — see WORLD.lane.
   */
  yardOffsetZ: -204,
  /** The mown clearing around the house. Sits inside the meadow's ground. */
  clearingRadius: 40,
  /** Gap in the hedge, in radians either side of due south (+Z). */
  gateGap: 0.24,
  /** Half-width of the gateway itself. */
  gateHalfWidth: 4.5,
  /**
   * Bounds for the flight home: has to hold the yard and the hive both. The
   * far side of the yard is the doorway at |z| = 194, so this clears it.
   */
  flightRadius: 240,
  /**
   * Half the width of the lane home, for the flight with the bear behind you.
   *
   * The lane is planted with fifteen trees a side over a hundred and twelve
   * units, which is far too sparse to be a wall — measured, the nearest trunk
   * to the centre line is 12.3 and for most of the length there is nothing
   * within sixty. So the corridor is a rule rather than geometry: without it
   * you can simply fly out of the side of the chase and take the long way
   * round, which is neither a chase nor what the trees are telling you.
   *
   * Eleven keeps her inside the treeline where there are trees and defines the
   * lane where there aren't. It only applies between the yard and the meadow —
   * both of those open out to their own discs, so the shape is a corridor with
   * a clearing at each end rather than a tube.
   */
  laneHalfWidth: 11,
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
 * it up and it hangs from the bee on a rope — see entities/danglingLoad.ts for the
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
  /**
   * How close it comes before the chase proper starts. A bear at 2.6 scale is
   * bigger than the mat; any nearer than this during the reveal and it is the
   * only thing on screen.
   */
  ambushStandoff: 16,
  fleeSeconds: 4.0,
  /**
   * How far from the hive it backs off to when the brood mobs it.
   *
   * It arrives at the hive doorstep, and at this size that means standing on
   * top of the hive and hiding it completely. Giving ground to the swarm reads
   * as recoiling from them and puts both it and the hive in shot.
   */
  distractStandoff: 10,
  /**
   * The camera circles the reared bear while the puzzle is being solved.
   * A shade under six degrees a second: a slow look around the standoff, not a
   * carousel. One full turn takes about forty seconds.
   */
  orbitRate: 0.1,
  orbitRadius: 26,
  orbitHeight: 14,
  /** Height of the point it circles, between the bear's chest and the hive. */
  orbitLookHeight: 5.5,
} as const;

export const PUZZLE = {
  /**
   * Scramble depth for the 3x3 sliding puzzle.
   *
   * These are random *walk* steps, not distance from solved — the blank
   * backtracks over itself, so the state ends up no further away than the
   * count and usually nearer.
   *
   * Measured against a full breadth-first search of the board: 12 steps lands
   * a median of 7 optimal moves from finished (2-12 across 40 shuffles), which
   * is a puzzle a child can see their way through. The second gap did most of
   * that work — the same 12 steps on the one-gap 3x3 sat at a median of 12.
   */
  scrambleMoves: 12,
} as const;

export const LEVELS = {
  /** Level 1: found the hive by gathering this much of each pollen. */
  foundingQuota: {white: 10, yellow: 10, orange: 10} satisfies Record<
    PollenKind,
    number
  >,
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
