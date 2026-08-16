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
  /**
   * A leaf's plane, in world units.
   *
   * Bigger than the square it replaced: the drawn leaves sit inside a square
   * image with transparent margin all round, so the same number renders a
   * noticeably smaller leaf.
   */
  leafSize: 1.3,
  /**
   * How much of a leaf's image counts as leaf.
   *
   * Low enough to keep the soft edge the drawings are painted with, high
   * enough that the transparent margin never shows as a square.
   */
  leafAlphaTest: 0.35,

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
  crumb: 0xffd23f,
  scent: 0xcaff70,
  exit: 0x9ef7c4,
} as const;

/**
 * Level 6 — The Bear's Lair.
 *
 * A side-on flight through a cave, played the way Flappy Bird is: hold the
 * screen and she climbs, let go and she sinks, and she goes right whatever you
 * do. It is still the same 3D scene — the camera simply stands off to her left
 * and everything is laid out in one plane so it reads flat.
 *
 * The numbers below are set for a child who has never played one of these. The
 * gap is wide, the first gates are wider still, and the run is a minute at a
 * pace that gives about two and a half seconds to line each one up.
 */
export const LAIR = {
  // ---- the cave -----------------------------------------------------------
  /** Floor and roof of the playable slot. The bee may not leave it. */
  floorY: 0,
  /**
   * How tall the flown slot is.
   *
   * It has to be a good deal more than the gap, or there is nowhere for the
   * way through to move: with a 15-unit opening in a 24-unit cave the path had
   * a four-unit band to live in, so alternating it up and down produced moves
   * of a tenth of a unit and a flat run of gates you could hold one height
   * through. Room to move is `ceilingY - 2 * gapMargin - gap`.
   */
  ceilingY: 29,
  /**
   * The plane everything is played in.
   *
   * The bee flies a little in front of the obstacles rather than among them:
   * at z 0 a rock whose front face reached past her would draw over her, and a
   * player who cannot see the bee cannot fly her. The offset is far smaller
   * than the camera's standoff, so the parallax doesn't show.
   */
  beeZ: 2,
  obstacleFrontZ: 0.4,
  obstacleBackZ: -7,

  // ---- the run ------------------------------------------------------------
  /** Where the cave mouth stands; the bee starts outside it. */
  mouthX: 0,
  /** How far past the mouth the first gate is — a beat to settle before one. */
  runIn: 34,
  gateCount: 40,
  /**
   * How far apart the gates are at the mouth, and at the far end.
   *
   * It tightens the whole way rather than reaching its real difficulty in the
   * first few gates and staying there. The far end is Flappy Bird's own pitch
   * — 1.19s between gates — and the start is half again as much room.
   */
  spacingStart: 19,
  spacingEnd: 13,
  /**
   * How much the distance between gates wanders, as a fraction of the spacing.
   * A fixed pitch reads as a grid rather than a cave.
   */
  spacingJitter: 0.28,
  /**
   * A stair: two gates close together with the second one lower, so the way
   * through the pair is a diagonal she has to fall down rather than two
   * openings she can line up on separately.
   *
   * The spacing has to clear both obstacles' own width — they are up to 3.4
   * across — or there is no air *between* them to fall through, and the pair
   * stops being a diagonal and becomes a single slot you have to thread. At
   * six units apart the way through was a window 1.5 units tall; ten and a
   * half leaves three units of clear air between the rocks and a real descent
   * to fly down.
   *
   * The drop is not a free fall. A free fall over this distance is 27 units,
   * far more than the cave is tall — so a stair is a *controlled* dive, still
   * flapping, just less than usual. It is bigger than `gapStep` allows
   * anywhere else, which is what makes it the hardest thing in the level.
   *
   * The bottom gate is always the roof coming down with open air beneath it,
   * so being too low costs nothing and the diagonal is enforced from above.
   */
  stairSpacing: 10.5,
  /**
   * How much lower the second gate of a stair sits.
   *
   * Slight, and deliberately less than a gap: the two openings still overlap,
   * so the diagonal is the natural line through the pair rather than the only
   * one that fits. An offset big enough to leave no overlap at all makes the
   * descent compulsory — and makes what hangs over it reach from the ceiling
   * to below the previous gate's floor, which is a spike half the height of
   * the cave.
   */
  stairOffset: 4.5,
  /**
   * The hanging obstacle at the bottom of a stair is always the slim kind.
   *
   * It is the one thing in the level you are forced to dive under, so it is
   * the last place for a wide rock: a spike is a third narrower and much
   * clearer about where its point is. Still a real obstacle — the descent is
   * compulsory either way — just a fairer one to read at speed.
   */
  stairSpikeHalfWidth: 1.6,
  /**
   * Pillars: a tall stalagmite from the floor with nothing above it, so the
   * only way past is hard against the roof.
   *
   * Every other gate leaves the way through somewhere in the middle of the
   * cave. This is the one shape that asks for a long climb, which is why it is
   * worth having and why there are not many of them.
   *
   * `pillarClimbShare` is how much of the climb she could actually manage in
   * the distance available it will ask for — flat out she rises at about half
   * her flap speed, and a gate that jumps to the roof right after a low one is
   * a wall rather than a climb.
   */
  pillarsFrom: 0.2,
  pillarChanceEnd: 0.55,
  pillarClimbShare: 0.75,
  /** How much more run-up than usual a pillar gets, to climb in. */
  pillarRunUp: 1.5,

  /** How often a stair starts. Nothing at the mouth, ramping to this. */
  stairChanceEnd: 0.6,
  /** How far in before the first one can appear, as a fraction of the run. */
  stairsFrom: 0.3,
  /**
   * How often a gate is a matched pair, rather than a spike from the floor
   * with open air above it or the roof coming down with open air below.
   *
   * A one-sided gate leaves exactly the clearance a pair would, on the side
   * she has to be — the shapes vary, the flying doesn't get harder.
   */
  pairChance: 0.5,
  /**
   * Gates at the start that are pairs whatever the dice say. A pair is the
   * shape that teaches the level, and a one-sided gate only reads as a
   * variation once you know what it is varying from.
   */
  pairsToStart: 3,
  /** Clear air past the last gate, then she's out. */
  runOut: 30,
  /**
   * The opening, floor-to-roof.
   *
   * `gapEasy` is what the first gate gets and `gap` the last, closing steadily
   * the whole way: a child needs a few goes at a forgiving one before the real
   * thing, and the far end should be something to work up to. For scale, the
   * bee is drawn 1.74 tall and Flappy Bird's gap is 5.0 of its bird's heights.
   */
  gap: 9.5,
  gapEasy: 13,
  /** How close to floor or roof the opening's edge may come. */
  gapMargin: 2,
  /**
   * How far the way through moves from one gate to the next.
   *
   * It alternates — up, then down, then up — rather than wandering, so there
   * is never a stretch of gates at the same height to coast along. The move
   * starts at `gapStepStart` of this and reaches all of it by the far end.
   */
  gapStep: 6,
  gapStepStart: 0.55,
  /**
   * Water off the stalactites.
   *
   * A cave that is completely still reads as a diagram. A few slow drips are
   * the cheapest thing that makes it feel like somewhere — and slow is the
   * point: anything quick enough to catch the eye competes with the rocks the
   * player is trying to read.
   */
  dripChance: 0.65,
  dripSpeed: 6,
  dripSize: 0.17,
  /** How long a drop hangs and swells at the tip before it lets go. */
  dripHang: 1.3,
  /** Seconds between one drop and the next, per stalactite. */
  dripPeriod: [3, 7.5],

  /**
   * Where a signature sits on its boulder, as a fraction of the rock's height,
   * and how much of the rock's width it takes there. Only the two tallest
   * floor boulders get one; see SIGNATURES in render/geometry/lair.ts.
   */
  signatureHeight: 0.45,
  signatureFill: 0.72,

  /** Half-width of a spike at its base, and of a rock at its widest. */
  spikeHalfWidth: 2.6,
  rockHalfWidth: 3.4,

  // ---- flying -------------------------------------------------------------
  /**
   * Rightward pace. The run works out at about the minute asked for.
   *
   * Flappy Bird runs at 4.41 body lengths a second (150 px/s against a 34px
   * bird). The bee is a longer animal than that bird — 1.9 long per tall
   * against 1.42 — so matching lengths would have made her slower than the
   * original feels; this matches the *height* scale, like everything else here.
   */
  speed: 10.9,
  /**
   * The flap, and the falling.
   *
   * A real flap, as the game this is modelled on has: each press throws her
   * upward at `flapSpeed` whatever she was doing before, and gravity takes it
   * back off her. Nothing about holding the screen down keeps her up.
   *
   * The two numbers are one decision, not two, and they are Flappy Bird's own,
   * converted from its per-frame values at 30fps (gravity 1 px/frame², flap 9
   * px/frame) and scaled by body height — a 24px bird against a bee drawn 1.74
   * tall. A flap carries her 1.69 body heights up and takes 0.30s to get
   * there, which is the arc the original has in the hand.
   *
   * What is *not* copied is the course. Flappy's gap is 5.0 body heights and
   * its pipes are 1.21s apart; this cave gives 5.75 and 1.65s, and starts
   * wider still. The hands are the real thing, the room to use them isn't.
   */
  flapSpeed: 19.6,
  gravity: 65,
  /** How fast she can end up falling, however long she's left it. */
  maxFall: 21.8,
  /**
   * Her hit box, half-extents, along the cave and up it.
   *
   * Measured off the model she is drawn from rather than picked: at this
   * level's scale her body reaches 1.66 along and 0.87 up (98th percentile of
   * its vertices, so a whisker of antenna doesn't count as her). These shave a
   * little off both, which is the only forgiveness left in the test and is
   * small enough to look like contact when it fires.
   *
   * It replaces a single radius of 0.9. A circle can only match one axis of
   * something drawn twice as long as it is tall, and that one let her nose
   * three quarters of a unit into a rock before anything happened.
   */
  hitHalfLength: 1.45,
  hitHalfHeight: 0.78,
  /**
   * How flat the obstacles are, and how far behind her they stand.
   *
   * What the player judges is two silhouettes, and silhouettes at different
   * depths don't measure the same: three units of separation projected the
   * obstacles about 11% narrower than collision tested them. Thin cut-outs
   * standing just behind her bring that under 3% — a pixel or two — while
   * still keeping them behind, so nothing can ever draw over the bee.
   */
  obstacleFlatten: 0.14,
  obstacleStandoff: 0.75,
  /**
   * How much bigger the bee is drawn here.
   *
   * The side-on shot stands nearly thirty units back to fit the cave in, and
   * at that range she is a thumbnail — too small for a child to read her
   * height against a gap, which is the whole game. Nothing else scales with
   * her: `radius` is set against the cave, not against how she looks.
   */
  beeScale: 1.5,
  /** Where she enters, and the height the first gap is centred on. */
  startHeight: 14,

  // ---- the shot -----------------------------------------------------------
  /**
   * How much cave the side-on camera has to show, as half-extents. The height
   * is the whole slot plus a margin; the length decides how much warning of the
   * next gate you get, and is the number to raise if the level plays tight.
   */
  frameHalfHeight: 16.5,
  frameHalfLength: 17,
  /** How far ahead of the bee the shot is centred, so there's road to read. */
  cameraLead: 6,

  // ---- the way in ---------------------------------------------------------
  /** Facing the mouth from outside, before anything happens. */
  approachPause: 2,
  /**
   * The stand-in corridor seen through the arch before she flies in.
   *
   * Long enough that its end is lost in the dark — the point is that the mouth
   * has depth and still gives nothing away about the level behind it.
   */
  tunnelLength: 80,
  /** Rings of boulders receding into it, and how much they close in. */
  tunnelRings: 8,
  tunnelTaper: 0.18,
  /** Distance outside the mouth she waits at. */
  approachOut: 26,
  /**
   * Where the opening shot stands, relative to the bee: back, up, and off to
   * her left.
   *
   * A held shot rather than the follow rig. The rig sits directly behind her,
   * and "directly behind" is a straight line through the arch she is flying
   * into — it ended up inside the boulders the moment she moved. This camera
   * doesn't move at all while she flies in; she recedes into the cave, which
   * is a better shot anyway.
   */
  approachCamera: {back: 20, up: 9, side: 30},
  flyInTime: 2.4,
  /** The swing from behind her round to her left. */
  panTime: 1.5,
  /**
   * How much of the swing the wall across the mouth takes to disappear. Gone
   * before the shot settles, so the reveal belongs to the camera move rather
   * than happening in front of a static frame.
   */
  coverFade: 0.55,

  // ---- crashing -----------------------------------------------------------
  /** The earthquake. Rate is in shakes per second. */
  shakeTime: 1.1,
  shakeAmplitude: 1.5,
  shakeRate: 26,
  /** Straight down and out of shot, then the card. */
  crashFallSpeed: 17,
  crashFallAccel: 30,
  /** How far below the floor is off the bottom of the screen. */
  crashDepth: 16,

  // ---- getting out --------------------------------------------------------
  celebrationTime: 3.2,
} as const;

/**
 * "Draw the map" — the task at the end of the Bear's Lair.
 *
 * The queen has flown the whole cave and has to leave a map of it behind, and
 * the player draws it rather than watching her draw it. See ui/mapDraw.ts.
 */
export const MAP_DRAW = {
  /** How faint the route shows through underneath: something to trace. */
  guideOpacity: 0.5,
  /**
   * The pen, in the artwork's own pixels, and the rubber as a multiple of it.
   *
   * The route is drawn with strokes a median of 9 pixels thick, so a pen this
   * size lays down a line a shade narrower than the one it is tracing. Twice
   * that — where this started — covered the route in one pass but put half its
   * ink down either side of it, which counts against you. Under the line is
   * the better way round: the thick parts of the route take a second pass,
   * which is work rather than a wall, and nothing spills.
   */
  penRadius: 4,
  rubber: 1.6,
  /**
   * What counts as finished: nine tenths of the route covered, and not much
   * more than a twentieth of that again in ink that missed it.
   *
   * Both are shares of the route's own size, so they can be shown as one bar.
   */
  /**
   * How far ink may sit from the route before it counts as wrong, in the
   * artwork's pixels.
   *
   * Measured, because it is the number that decides whether the red bar means
   * anything. A pen centred on the line still spills a pixel or two either
   * side of it wherever the line narrows, and that must not read as a
   * mistake — at 0 it scores 20% wrong. But every pixel of slack widens the
   * route: at 10 the forgiven zone was half the sheet, and almost nothing a
   * hand did could turn the bar red. At 4 a steady hand and an ordinary one
   * both come out clean, and a hand wandering three pixels further is at 46%.
   */
  strayTolerance: 4,
  needRight: 90,
  allowWrong: 5,
  /** Alpha above which a pixel counts as drawn on. */
  inkThreshold: 24,
  /**
   * Milliseconds between scores while a stroke is being drawn.
   *
   * Scoring reads three canvases the size of the artwork, which is too much to
   * do on every pointermove; on letting go it always runs.
   */
  scoreEvery: 120,
} as const;

/**
 * The chamber at the end of the Bear's Lair, and the cut scene played in it.
 *
 * Nothing here is flown through or collided with — it is the one room in the
 * game that exists purely to be looked at, so the numbers are all framing and
 * timing rather than gameplay.
 */
export const DOME = {
  // ---- the room -----------------------------------------------------------
  /**
   * The room. It has to stand well clear of the corridor that arrives in it:
   * the doorway is cut as everything below the corridor's own roof, so a dome
   * only as tall as the corridor loses its whole near wall and you see out
   * through the back of it.
   */
  radius: 38,
  height: 44,
  /**
   * The straight wall the dome sits on, and how much of the surface it takes.
   *
   * A pure dome meets the floor at its rim, and a level look from a camera
   * inside at head height passes over that rim and out of the room — the top
   * of every shot was sky. A room has walls.
   */
  wallHeight: 17,
  wallFraction: 0.3,
  /**
   * Where the hole in the roof sits, from the middle of the room.
   *
   * Deliberately off-centre. Straight above the hoard would put the light, the
   * treasure and the way out all on one axis with nowhere for the shot to
   * move; off to one side the climb out is a diagonal across the room, and the
   * light rakes across the jars instead of sitting flat on them.
   */
  holeOffsetX: 13,
  holeOffsetZ: -9,
  holeRadius: 6.5,
  /**
   * The doorway the corridor arrives through: everything on the near side of
   * this fraction of the radius, below the corridor's own roof plus a little
   * headroom, is left out of the shell.
   */
  doorwaySpan: 0.5,
  doorwayHeadroom: 2,
  /** How wide the doorway is, either side of the corridor's own centre. */
  doorwayHalfWidth: 11,
  /**
   * The disc of daylight in the roof. Saturated, because the shaft of light is
   * drawn additively over it and washes anything paler out to white.
   */
  skyColor: 0x6ab8ff,
  /**
   * How big the ball of sky around the hole is.
   *
   * Big enough to be well outside the dome and to stay ahead of the swarm all
   * the way up: they climb fifty-five units past the roof, and the camera goes
   * with them.
   */
  skyRadius: 170,
  lightColor: 0xffe08a,
  shaftOpacity: 0.14,

  // ---- the hoard ----------------------------------------------------------
  /** Layers in the pyramid; the bottom one is this many jars a side. */
  hoardLayers: 5,
  jarSpacing: 1.5,
  jarRise: 1.35,
  /** Bones start this far out, so the pile itself stays clear. */
  hoardClear: 7,
  boneSpread: 22,
  bones: 34,
  boneColor: 0xfbf8f2,
  boneShade: 0xe8e3d8,
  sparkleCount: 40,
  sparkleSize: 0.16,
  sparkleColor: 0xfff6d0,

  // ---- the cut scene ------------------------------------------------------
  /** Flying in from the corridor and settling into the room. */
  arriveTime: 3,
  /**
   * Where she waits while the map is drawn: to one side of the hoard, and how
   * high she hovers over it.
   */
  arriveOffset: 13,
  danceFloor: 13,
  /** The brood arriving, in a burst each. */
  gatherTime: 2.6,
  /** Diving into the pile and coming up with a jar each. */
  lootTime: 3.2,
  /** Up through the hole, camera trailing. */
  climbTime: 5,
  /**
   * The gap between one bee and the next on the way out, as a fraction of the
   * path. They leave in single file: the hole is thirteen units across in a
   * room of sixty-eight, so a swarm with any spread in it flies through rock.
   */
  lineGap: 0.075,
  /**
   * Where the way out stops crossing the room and starts going up, as a
   * fraction of the path. The corner is eased, so the turn isn't a hinge.
   */
  exitTurn: 0.45,
  /** Out over the meadow and home to the hive. */
  homeTime: 5.5,
  /** How far behind the swarm the camera follows on the way out. */
  chaseDistance: 16,
  /**
   * The shot on the way up through the roof: how far behind the last bee the
   * camera sits, and how far ahead of her it looks.
   *
   * Further back than the chase elsewhere, and aimed between the tail and the
   * queen rather than at the queen herself. Pointed all the way up the line
   * the last bee ends up at the very bottom of the frame with her jar cut off
   * by the edge; this leaves her whole, with air around her, and still has the
   * hole and the rest of the queue ahead.
   */
  /** How much of the hoard is left once they have flown off with it. */
  hoardLeft: 2 / 3,
  climbChase: 27,
  climbLookAhead: 34,
  /**
   * How high above the floor the climb starts.
   *
   * Well clear of the hoard, which tops out around seven. The camera sits a
   * long way back along the line from the first bee, so a climb that starts
   * just above the pile is shot from inside it — and clamping the camera's
   * height instead fixes the jars but tips the last bee out of frame, which is
   * the thing the shot is of.
   */
  climbFrom: 16,
  /**
   * Where the chamber is watched from: back from the middle, and how high.
   *
   * It drifts slowly right through the cut scene — a still camera on a still
   * room for twenty seconds reads as a photograph rather than a place.
   */
  /**
   * Where the chamber is watched from. Inside it: the room is 34 across, and a
   * shot standing further back than that is outside the wall looking at rock.
   */
  cameraBack: 29,
  cameraHeight: 17,
  cameraDrift: 0.055,
  /**
   * Which way round the room the shot starts, in radians.
   *
   * Not zero, which is the bearing the corridor arrives on: the doorway is a
   * hole in the wall, so a camera standing on that bearing is standing in the
   * gap, with the room's wall missing all around it and daylight where the
   * rock should be. Off to one side it looks back across the chamber with the
   * way in at the edge of frame.
   */
  cameraStart: 1.15,
  /**
   * How far above the floor the chamber shots look.
   *
   * Aimed at the floor, the map the queen draws — which hangs above the hoard,
   * clear of it — rides off the top of the frame.
   */
  lookHeight: 7,
  /**
   * How far under its carrier a jar hangs, how much it swings, and how big it
   * is once someone is carrying it.
   *
   * The hoard is drawn at the cottage's own jar size, which is right for a
   * pile on the floor and much too big slung under a baby bee — she is smaller
   * than the jar. Shrunk on pick-up rather than in the pile, so the treasure
   * still looks like treasure.
   */
  jarHang: 0.85,
  jarSwing: 0.18,
  jarCarryScale: 0.5,
} as const;

/**
 * The meadow outside the cave mouth.
 *
 * The level opens on it: two seconds of somewhere pleasant, with the hole in
 * the hill sitting in the middle of it. The contrast is the point — the cave
 * has to look like somewhere you would rather not go, and it only does if what
 * you are leaving is somewhere you would rather stay.
 */
export const LAIR_OUTSIDE = {
  /** How far out from the mouth the grass runs, and how wide. */
  depth: 70,
  /** The ball of daylight around it all. Big enough to hold the cliff too. */
  skyRadius: 200,
  halfWidth: 46,
  /** Tufts of grass and little flowers standing in it. */
  tufts: 260,
  flowers: 34,
  butterflies: 4,
  /** How big a butterfly's wing is, and how fast it beats. */
  wingSize: 0.55,
  wingBeat: 9,
  /** How far a butterfly wanders, and how briskly. */
  roam: 13,
  roamRate: 0.5,
  /** Height band they fly in. */
  flyLow: 2.5,
  flyHigh: 7,
} as const;

export const LAIR_OUTSIDE_PALETTE = {
  grass: 0x6fbf4a,
  grassDark: 0x53a337,
  grassLight: 0x92d966,
  sky: 0x9fd8f5,
  petals: [0xffd23f, 0xff8ac1, 0xfff3f6, 0xff7a45] as ReadonlyArray<number>,
  wings: [0xffb02e, 0xff6f91, 0xfff0a0, 0x8ad7ff] as ReadonlyArray<number>,
} as const;

/**
 * Cave rock: cool and dim, but never actually dark.
 *
 * Same lesson as the woods — the toon ramp's darkest band is 0.47, so a
 * photographic cave-grey comes out as a black cut-out. These are lifted well
 * past what looks right in a swatch so that they read as stone on screen.
 */
export const LAIR_PALETTE = {
  rock: 0x9d9ab0,
  rockDark: 0x6d6a82,
  rockLight: 0xbab6cc,
  spike: 0xb0acc4,
  spikeTip: 0xd6d2e4,
  ground: 0x8a8799,
  crystal: 0x7fe0d8,
  water: 0xa9dcff,
  glow: 0xffd98a,
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

/**
 * Level 7 — Bee vs Frog.
 *
 * A board rather than a place: everything here is counted in squares, and a
 * square is one hop. The world numbers below are the only ones in world units,
 * and every other measurement is multiplied up by `square` when it is used, so
 * making the board bigger or smaller moves the whole level together.
 *
 * The stream table is the level's difficulty, and it is written the way it
 * plays: a stream that runs fast carries fewer riders, because the thing that
 * kills you is not speed but the size of the gap between one danger and the
 * next. See the note on `riders` for the arithmetic that keeps every stream
 * crossable.
 */
export const ISLANDS = {
  /** One hop, in world units. Everything on the board is measured in these. */
  square: 4.2,
  /** Columns across. Odd, so there is a middle square to start on. */
  cols: 11,
  /** Streams to cross, which is the length of the table below. */
  streams: 8,
  /** How high she flies over the water. */
  flightHeight: 2.6,
  /**
   * The bee, sized for a board seen from directly above.
   *
   * Bigger than she is anywhere else in the game. The camera is a long way up
   * and the board is forty units deep, and at her ordinary size she was a
   * speck among lilypads — this puts her at about one square, which is also
   * exactly the distance she moves, so what you see is what a hop is worth.
   */
  beeScale: 2.1,
  /** One hop: quick enough to feel like a press, slow enough to read. */
  hopTime: 0.2,
  /** How high the hop arcs above her flying height. */
  hopArc: 1.5,

  /**
   * How far a frog's tongue reaches, in squares.
   *
   * The rule the whole level is built on: share a stream with a frog and come
   * within one square of it, and it has you. It makes each frog three squares
   * of danger — its own and one either side — which is what the spacing in the
   * table below has to leave room between.
   */
  strikeSquares: 1,
  /** Tongue out, then the level says so. */
  strikeReach: 0.3,
  strikeHold: 0.45,
  /**
   * How far behind itself a frog can still catch you, in squares.
   *
   * Almost nothing: a tongue goes out of the front of a frog, so what is
   * behind one is safe and the only thing this covers is its own body. It
   * halves the danger around every frog, which is why the lane table was
   * re-measured after it — see `lanes`.
   */
  behindSlack: 0.25,
  /**
   * An alligator has no tongue; it has a mouth. Half its length, in squares.
   *
   * Unlike a frog this reaches both ways, because it isn't a reach at all —
   * it is the animal. Behind an alligator is its back, and there is nowhere
   * on one that is somewhere to be.
   */
  gatorHalf: 0.9,
  /** Half the bee, in squares, for the alligator's mouth to close on. */
  beeHalf: 0.22,

  /**
   * The loop each stream's riders travel round, in squares.
   *
   * Wider than the board so a rider leaves one side and is not back on the
   * other for a while — the gap in the traffic has to be somewhere while it
   * isn't in front of you.
   */
  wrapSpan: 17,

  /**
   * The streams, near bank first.
   *
   * `speed` is squares per second; `riders` is how many things ride it, of
   * which `gators` are alligators. The three are traded off against each other
   * on purpose, and the arithmetic is worth keeping straight because it is the
   * whole difficulty of the level:
   *
   *   - riders are spread evenly round `wrapSpan`, so they sit
   *     `wrapSpan / riders` squares apart;
   *   - a frog reaches one square either side, so it is two squares wide as an
   *     obstacle, not one (an alligator is a little less);
   *   - what is left — `wrapSpan / riders - 2` squares — is the gap you hop
   *     into, and it goes past at `speed` squares per second.
   *
   * So the time you get is `(wrapSpan / riders - 2) / speed` seconds, and no
   * lane here leaves less than two of them: a hop takes a fifth of a second,
   * and the rest is a child noticing. The table is measured, not guessed —
   * a player who plans crosses every time, and one who only presses forward
   * gets about two lanes in.
   *
   * It gets harder across the board rather than all at once: the first stream
   * is nearly a free go, and the gaps tighten from there.
   */
  lanes: [
    {speed: 0.45, riders: 3, gators: 0},
    {speed: 0.6, riders: 4, gators: 1},
    {speed: 1, riders: 3, gators: 1},
    {speed: 0.7, riders: 5, gators: 1},
    {speed: 1.25, riders: 3, gators: 1},
    {speed: 0.8, riders: 4, gators: 1},
    {speed: 1.6, riders: 3, gators: 1},
    {speed: 0.95, riders: 4, gators: 2},
  ],

  /**
   * The opening shot, before the camera goes up: back, up and to the side.
   *
   * Further back than the game's usual over-the-shoulder view, because she is
   * drawn at more than twice her ordinary size here — sized for the board seen
   * from overhead, which at the game's normal boom length filled half the
   * screen with bee.
   */
  approachCamera: {back: 22, up: 9, side: 0},
  /** How long she sits on the bank before the camera lifts. */
  waitTime: 1.5,
  /** The lift itself. */
  riseTime: 2.4,
  /** Looking down at the board: nearly overhead, but not so straight that the
      shot loses which way is forward. */
  boardPitch: 1.28,
  /** How much of the screen the board fills once the camera is up. */
  boardFill: 0.94,

  /**
   * The brood she is there for.
   *
   * The level is five crossings, not one: she takes a baby over, comes back
   * empty for the next, and so on. The way back is as dangerous as the way
   * out, which is where the difficulty of the level now lives — one crossing
   * you can get lucky with, five you cannot.
   */
  babies: 3,
  /** Columns the pedestals stand on, at both ends. */
  babyColumns: [3, 5, 7],
  /**
   * Which of them she fetches, in order.
   *
   * The middle one first, because she starts the level in the middle column
   * and it is the one standing directly behind her — sending her sideways to
   * collect an outer baby first reads as her having walked past one.
   */
  babyOrder: [1, 0, 2],
  pedestalHeight: 1.6,
  /**
   * A baby is smaller than the queen, and flies a little lower.
   *
   * Measured against her rather than picked: at 1.5 a baby was two thirds of
   * the queen's length and read as another adult following her about. This is
   * a little under half of her, which is the difference between a grown bee
   * and one of the brood.
   */
  babyScale: 1,
  /**
   * How far below the queen the baby flies.
   *
   * It flies *under* her, not beside her: from overhead the two of them are
   * one shape at rest, with a bit of baby showing out the back. Enough drop
   * that the models never intersect — she is about two units deep and it is
   * about one and a half.
   */
  babyDrop: 1.6,
  /**
   * How far behind the queen a baby flies, in squares.
   *
   * Distance along the path she actually took, not a time and not a direction:
   *
   *   - played back from her own trail, because a baby steering for itself
   *     would cut the corner across water she had carefully gone round, and it
   *     would read as the baby being in danger. It never is — the frogs and
   *     the alligators are only ever tested against the queen;
   *   - by distance rather than by delay, because a delay collapses the moment
   *     she stops: half a second after she lands, half a second ago *is* where
   *     she is standing, and the baby ends up sitting inside her.
   *
   * Under her tail rather than a square back: at rest the baby is tucked in
   * behind and below her and only its back end shows, which is what says it
   * belongs to her. The gap it is actually seen at is not this number — see
   * `followEase`, which is what lets it fall behind on a hop.
   */
  followBehind: 0.42,
  /**
   * How quickly the baby closes on where it ought to be, in seconds.
   *
   * This is the whole of the follow, visually. The trail says where it ought
   * to be and this says how eagerly it gets there, and being slower than a hop
   * is the point: she goes and it is left behind for a moment, then it catches
   * up and tucks back under her while she waits for the next gap.
   */
  followEase: 0.3,
  /** Joining her from the pedestal, and settling onto one at the far end. */
  joinTime: 0.5,
  settleTime: 0.9,
  /** The dance it does on arriving, before it goes to wait. */
  danceTime: 1.5,
  danceSpins: 2,
  danceBob: 1.1,

  /**
   * The two model files, in the level's terms.
   *
   * `yaw` turns each one to face +x, which is the way every hand-built rider in
   * the level is drawn and the way its stream runs. Both are measured rather
   * than guessed — a model arrives facing whatever its author chose, and the
   * way to settle it is to ask where the head is: the centroid of the frog's
   * eye and mouth material, and of the white of the crocodile's teeth. Guessing
   * put the crocodiles broadside across the lanes.
   */
  /**
   * How much to lift the model files' own colours, 0 to 1.
   *
   * Both were authored dark — a frog of 0.22, 0.4, 0.12 and a crocodile
   * barely lighter — which reads as almost black against this water when seen
   * from as far up as the camera sits. This raises the lightness without
   * touching the hue, so they stay the green their authors chose. Near-black
   * is left alone: that is eyes and pupils, and a lifted eye is a grey smudge.
   */
  modelLift: 0.42,
  frogModel: {
    /** Nose to tail. A little under a square, so it sits on its lilypad. */
    length: 3.1,
    /** How high on the pad it sits — the pad is 0.18 thick, drawn about zero. */
    sit: 0.09,
    /**
     * How far it throws itself forward as it strikes, in squares.
     *
     * Seen from directly overhead the tongue ends up underneath the bee's own
     * body, so the lunge is what actually reads at this camera angle — the
     * tongue alone is a strike you are told about rather than one you watch.
     */
    lunge: 0.3,
    yaw: Math.PI / 2,
    /** Idle plays from a different point per frog, or they breathe in step. */
    idleStagger: 1.7,
  },
  /**
   * Half a turn: this one was drawn lying along the travel axis already, but
   * facing the wrong way down it. Measured the same way as the frog's, by
   * asking where the white of its teeth sits relative to the middle of it —
   * at a quarter turn it swam broadside across the lanes, and at none it swam
   * backwards.
   */
  crocModel: {yaw: Math.PI},

  /** Bursts when she reaches the far bank. */
  winBursts: 7,
  winBurstEvery: 0.22,
} as const;

export const ISLANDS_PALETTE = {
  background: 0x8fd6ef,
  fog: 0xbde8f4,
  /** The streams, alternating so one lane reads as separate from the next. */
  water: 0x4aa3d8,
  waterAlt: 0x3d91c6,
  foam: 0xd3eefb,
  bank: 0x86c96b,
  bankDark: 0x63ad55,
  sand: 0xe6d9a8,
  rock: 0x9a9384,
  reed: 0x4e9a45,
  lily: 0x3f8f46,
  lilyDark: 0x2f7a3b,
  /* Brighter than its own lilypad, or the frog is a bump on a leaf rather
     than the thing you are watching. */
  frog: 0x9ade63,
  frogDark: 0x4e9a45,
  frogBelly: 0xdff0b8,
  eye: 0xfdfdf5,
  pupil: 0x1d1a12,
  tongue: 0xe86a8a,
  /* Light enough to read against the water from directly above: the first
     draft was a dark green that went to a black sliver at this distance. */
  gator: 0x7f9c52,
  gatorDark: 0x5e7a3a,
  gatorBelly: 0xdde3a4,
  tooth: 0xfdfdf5,
} as const;

/**
 * Level 8 — the Ant Hunt.
 *
 * Three islands in a triangle, joined the long way round: one to two, two to
 * three, and no way back across the middle. Each is a room with a lid on it —
 * the bridge out is gated until its island's work is done — so the level is
 * three self-contained hunts rather than one big field, and the bee is never
 * anywhere she has nothing to do.
 *
 * Distances are in world units and the islands are placed rather than
 * generated: the first sits on the world origin, because that is where the
 * game's camera rig and the opening shot expect to find her.
 */
export const ANT_HUNT = {
  islandRadius: 17,
  /** Centres, in order. The bee starts on the first. */
  islands: [
    {x: 0, z: 0},
    {x: 52, z: 0},
    {x: 26, z: -45},
  ],
  /** Which islands each bridge joins. The third is a dead end, deliberately. */
  bridges: [
    {from: 0, to: 1},
    {from: 1, to: 2},
  ],
  bridgeHalfWidth: 2.6,
  /** How far onto each island the bridge's planking runs. */
  bridgeOverlap: 2,
  /** Height of the island tops above the water. */
  islandHeight: 2.2,

  /** How high she flies here, and how far the camera sits back. */
  minHeight: 3.2,
  maxHeight: 11,
  startHeight: 5,
  cameraDistance: 15,
  cameraHeight: 7.5,

  /**
   * The net, which is the thing that actually catches an ant.
   *
   * It hangs under her on a rope and swings, so a fast turn throws it wide —
   * which is the skill of the level. Its radius is generous because a child is
   * aiming a swinging bag at a running ant from a moving bee, and one of those
   * three would have been enough.
   */
  net: {
    ropeLength: 3.4,
    gravity: 26,
    damping: 0.02,
    radius: 1.9,
    /** How far up the rope the mouth of it sits. */
    depth: 1.5,
  },
  /** She catches things with her own body too, not only the net. */
  beeReach: 1.6,

  /**
   * The ants.
   *
   * One number, not two: every ant on an island carries one thing and the gate
   * wants all of them, so the count of ants *is* the quota. A separate quota
   * that happened to be smaller would leave an ant wandering about with a
   * flower on its back after the gate had opened, which reads as something
   * missed rather than something spare.
   */
  antsPerIsland: 8,
  /**
   * How the ants tire.
   *
   * The last ant on an island is the hard one: with every other ant emptied
   * there is nothing to switch to, and a child who chases rather than leads
   * can end up following one around for minutes. So the island itself gives
   * way — the longer she has been on it, the slower the ants run.
   *
   * Nothing at all for the first minute, because a minute is about how long a
   * good hunt takes and help arriving before you needed it would take the
   * hunt away. From there it eases down to `floor` by the three-minute mark
   * and stays there, which is slow enough to be run down by flying straight
   * at one.
   */
  antTire: {
    from: 60,
    to: 180,
    floor: 0.4,
  },
  antLength: 2.4,
  antSpeed: 7.2,
  antTurn: 3.2,
  /** How long an ant holds a heading before picking a new one. */
  antWander: [0.7, 2.2],
  /** A robbed ant runs for its hill, and faster than it wandered. */
  antFleeSpeed: 10.5,
  /** How close to the hill's mouth counts as home. */
  antHomeRadius: 1.6,
  /** It shrinks into the hole rather than blinking out. */
  antEnterTime: 0.45,
  hillRadius: 3.4,
  /** Low and wide: the hole is in the top, and the camera looks along the
      ground rather than down at it, so a tall mound hides its own opening. */
  hillHeight: 1.5,

  /** The cargo is carried on the ant's back, and rides above it. */
  cargoLift: 1,
  /** How long a caught piece of cargo takes to fly into the net. */
  cargoFlyTime: 0.35,

  /** The gate: how long the bar takes to swing open, in seconds. */
  gateSwing: 0.9,

  /** The baby who comes for a full net. */
  handoff: {
    /** Where it comes from and leaves to, relative to the island's centre. */
    approach: 26,
    height: 14,
    /** In, take the net, and away. */
    inTime: 1.4,
    holdTime: 0.6,
    outTime: 1.8,
  },

  /**
   * The opening shot: the whole place from above, held, and then down behind
   * her.
   *
   * The three islands and what joins them is the one thing a player has to
   * understand here, and it cannot be seen from the flying camera — at her
   * altitude the second island is a green smudge and the third is over the
   * horizon. Two seconds of map is worth more than any amount of telling.
   */
  opening: {
    /**
     * How much of the screen the three islands fill, and from what angle.
     *
     * Framed by `framedCameraEye` rather than by putting the camera at a
     * height that looked right: this is played on everything from a portrait
     * phone to a landscape iPad, and a hand-placed shot that held all three
     * islands on one of those lost the far one on the other.
     */
    fill: 0.82,
    pitch: 1.02,
    /** Held still, then the fall in behind her. */
    holdTime: 2,
    swoopTime: 2.6,
  },

  winBursts: 8,
  winBurstEvery: 0.24,
} as const;

export const ANT_PALETTE = {
  grass: 0x7fc45f,
  grassDark: 0x5da046,
  sand: 0xe8d9a6,
  cliff: 0x9a8b6a,
  rock: 0x9a9384,
  /* Light enough that the hole in the top of it reads as a hole. The first
     draft was a dark earth with a darker rim and a black funnel, and from the
     air the whole mound was one brown shape with nothing in it. */
  hill: 0xb08750,
  hillDark: 0x8a6a3f,
  hillHole: 0x241a0f,
  plank: 0xb98b4e,
  plankDark: 0x8a6636,
  rope: 0xd8c79a,
  gate: 0xc2703a,
  gateOpen: 0x9ad06f,
  ant: 0x6b3a24,
  antDark: 0x4a2716,
  antShine: 0x8a5033,
  net: 0xf3f7e8,
  netRim: 0xcfa45e,
} as const;

/**
 * The sea the islands stand in.
 *
 * Animated entirely in the vertex shader — see render/geometry/water.ts — so
 * every number here is baked into the shader source once at build time and
 * nothing but the clock changes after that.
 *
 * `segments` is the only cost worth watching: it is the whole triangle budget
 * of the water, and the swell needs about four of them per wavelength to look
 * like a curve rather than a fold. The shortest wave below is 14 units and the
 * spacing that follows from these two numbers is 3, which is comfortably
 * inside that.
 */
export const WATER = {
  size: 420,
  segments: 140,
  /** Below the islands' grass, so their sandy rims stand out of it. */
  level: -1.6,
  colour: 0x2f86bd,
  /**
   * The two blues the surface is tinted between, by wave height.
   *
   * Doing this in colour as well as in shape is what makes the ripples read
   * from a camera that sits low: the swell is a third of a unit over a
   * wavelength of thirty, which is too gentle a slope to cross a band of the
   * toon ramp on its own.
   */
  trough: 0x2a6f9e,
  crest: 0x6fb9de,
  /** How sharply it goes from one to the other across a wave. */
  crestContrast: 1.4,
  /**
   * Three crossing swells, whose wavelengths share no common multiple: a
   * surface that repeats is the thing that gives cheap water away.
   */
  waves: [
    {direction: [1, 0.35], length: 34, height: 0.34},
    {direction: [-0.4, 1], length: 21, height: 0.2},
    {direction: [0.7, -0.9], length: 14, height: 0.12},
  ],
  /** How fast each of them travels. */
  speeds: [1.1, 1.7, 2.4],
  /** The ring of surf around each island, which hides the waterline. */
  foamWidth: 2.2,
  foamColour: 0xdff1fb,
} as const;
