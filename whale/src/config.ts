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
  /**
   * How deep the slider reaches.
   *
   * Not as deep as the deepest trench, on purpose. The floor drops to about a
   * hundred and seventy in places and the whale can only get to a hundred and
   * ten of it, so the bottom of a trench stays somewhere below you, fading
   * out. Water you can touch the bottom of is not deep water.
   */
  maxDepth: 110,
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
  /** How far it runs. The finish sits at -(length - 90). */
  length: 2400,
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

  /**
   * The trenches: the really deep parts.
   *
   * A separate term from the roll, and cubed, so it is nothing at all for most
   * of the reef and then opens up. A sine on its own would make the whole
   * floor undulate deeply; this leaves the ordinary reef where it was and cuts
   * a few holes in it. At the bottom of one the floor is about a hundred and
   * seventy down, which is sixty units below anywhere the whale can go.
   */
  trenchDepth: 78,
  trenchLength: 560,
  /** The floor lifts toward the ridges, so the lane is a shallow valley. */
  floorEdgeLift: 26,

  /** The ridges: how tall above the floor and how thick. */
  ridgeHeight: 54,
  ridgeWidth: 46,

  /** Mesh resolution. 10 units a cell over 1600 x 340 is 160 x 34 cells, which
   *  is 5,440 quads — one draw call and no sign of the grid at these
   *  distances. */
  cell: 10,

  /** How many of each thing grows on the floor. Coral is the most expensive
   *  of them — each one is a branching structure of forty-odd twigs — so that
   *  number is a triangle budget as much as a look. */
  coral: 600,
  rocks: 260,
  weeds: 410,

  /**
   * Gardens: the bunches everything grows in.
   *
   * Coral does not come one at a time evenly spaced — it comes in heads and
   * thickets with bare sand between them, and a reef laid out at random reads
   * as wallpaper. Most of what grows picks a garden and sits near it, and a
   * `loose` share ignores them entirely so the gaps are not too tidy.
   */
  gardens: 86,
  gardenSpread: 21,
  loose: 0.16,

  /**
   * How far under the surface everything that grows has to stop.
   *
   * Nothing on the sea floor may break the water. Over the ridge tops, where
   * there are only thirteen units of water, a coral scaled up twice and a kelp
   * held at its minimum size both grew straight out into the air — which is
   * the sort of thing you notice once and cannot stop noticing.
   *
   * So a plant's scale is capped by the room above it: `(depth - clear) /
   * height`. In deep water the cap is never the binding constraint and
   * everything is the size it wanted to be.
   */
  surfaceClear: 5,

  /** Kelp: how many plants, in how many stands, and how much of the water
   *  above them they fill. A stand is a thicket you swim through. */
  kelp: 410,
  kelpStands: 25,
  kelpSpread: 24,
  kelpReachLow: 0.55,
  kelpReachHigh: 0.88,

  /**
   * How the weed gets out of the way.
   *
   * A whale is a big animal and the water it shoves ahead of it is what
   * actually bends the kelp; near enough, a plant leans away from the whale by
   * an amount that falls off with distance. Kelp is long and light and gets
   * pushed a long way; the seaweed on the floor is short and stiff and barely
   * moves, so it gets a fraction of both numbers.
   */
  partRadius: 40,
  partLean: 0.7,
  weedPartShare: 0.35,
} as const;

/**
 * The shipwreck.
 *
 * An old ship lying on her side in deep water with her back broken, and a gap
 * amidships wide enough to swim through. She is the one thing in the game a
 * whale goes *inside*.
 */
export const WRECK = {
  /** How much water is wanted above her, over and above the whale's own
   *  clearance from the floor. She has to sit in water the slider can reach
   *  the bottom of, or the way through is somewhere nobody can ever be. */
  headroom: 16,
  /** How far off the middle of the lane she lies. */
  offset: -16,
  /** How much sea floor is kept clear around her. She is the one landmark on
   *  the reef, and a kelp stand grew straight through her — you could not see
   *  the ship for the weeds. */
  clearing: 115,
  /**
   * How far her keel is buried.
   *
   * Enough that she is settled into the sand and not balanced on it, and no
   * more. At nine she was sunk almost to the gunwale and most of the ship was
   * underground — which loses the shape, and the shape is the whole reason
   * she is there.
   */
  settle: 3,
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
  deepColour: 0x0b3f6b,
  colourDepth: 105,

  /** The surface plane: how big and how coarse. */
  surfaceSpan: 2200,
  surfaceCell: 40,

  /**
   * The swell, as four Gerstner waves.
   *
   * Gerstner rather than a sum of sines, which is what this was. A plain sine
   * only moves a vertex up and down, so every crest is as round as every
   * trough and the sea looks like corrugated iron with the corrugations
   * softened. A Gerstner wave also moves the vertex *along* its own direction,
   * bunching water at the crests and stretching it in the troughs — sharp
   * peaks, flat valleys — which is what a real swell looks like and is most of
   * why it reads as water. It costs one extra cosine per wave per vertex.
   *
   * `steep` is how far it leans, 0 for a plain sine and 1 for a peak sharp
   * enough to be about to break. Past a point the surface folds through
   * itself, so the four together are kept well under it.
   *
   * Four, and none of the wavelengths a multiple of another — two waves alone
   * beat against each other visibly, and matching lengths make a repeating
   * grid appear on the water.
   */
  gerstner: [
    {angle: 0.15, length: 118, height: 0.62, steep: 0.9, speed: 0.5},
    {angle: 1.25, length: 73, height: 0.42, steep: 0.85, speed: 0.66},
    {angle: -0.85, length: 167, height: 0.5, steep: 0.72, speed: 0.4},
    {angle: 2.5, length: 41, height: 0.18, steep: 0.95, speed: 0.95},
  ],

  /**
   * The dappled light. `causticScale` is how many times the pattern repeats
   * over 100 units of floor.
   *
   * The drift is no longer a rate of its own: the dapple travels with the
   * swell that casts it, at the first Gerstner wave's own direction and speed,
   * and `causticSurge` is how much it also breathes in and out with that
   * wave's phase. Sliding it at some unrelated constant rate was two
   * animations that happened to be in the same scene.
   */
  causticScale: 0.055,
  /**
   * What fraction of the swell's speed the dapple actually travels at.
   *
   * Light refracted through a wave really does run along with the crest, and
   * at the full rate the pattern crossed a tile of sea floor every two and a
   * half seconds, which is far busier than it sounds — the sand looked like it
   * was boiling. This is a game for a child watching a reef, so it is slowed
   * to a third. The *direction* and the phase are still the swell's, which is
   * the part that matters.
   */
  causticFollow: 0.3,
  /** How much it also breathes in and out with the leading wave's phase. */
  causticSurge: 0.022,

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

  /**
   * Sunbeams: how many, how wide at the surface, and how far from the whale
   * they are allowed to get before they are moved.
   *
   * They stand still in the world. They used to hang off the whale, which
   * meant the light came along with you and the one thing in the scene that
   * should have told you that you were moving told you that you were not.
   *
   * A beam that falls further behind than `shaftWrap` is picked up and put the
   * same distance ahead. That is well past the fog, so it is never a beam
   * moving — it is a beam you cannot see any more being reused somewhere you
   * cannot see yet.
   */
  shafts: 34,
  shaftWidth: 26,
  shaftWrap: 700,
  shaftLane: 190,
  shaftSway: 0.09,
  /**
   * How much each beam brightens and dims with the water directly above it.
   *
   * The light in a beam is light that got through a patch of surface, so a
   * crest passing overhead should put it out and a trough should let it
   * through. 0 is a beam of constant strength, 1 one that goes out
   * altogether. They swayed as a rigid group before, which moved them without
   * connecting them to anything.
   */
  shaftFlicker: 0.55,
} as const;

/**
 * Holding still.
 *
 * A whale that stops gets visited. Wait on the surface and a gull comes down
 * and rides on its back; wait under it and the little fish come and nibble at
 * it, and it blows the odd bubble. None of it does anything — there is nothing
 * to gain by stopping and nothing lost by never stopping — and that is the
 * point. A child who parks the whale to look around should find that the reef
 * notices.
 */
export const IDLE = {
  /** How still counts as still, on the thumbstick. */
  stick: 0.06,
  /** Seconds of it before the fish come, and before a gull comes down. The
   *  gull waits longer: it has further to come, and a bird landing on you the
   *  instant you stop would read as scripted rather than as luck. */
  fish: 3,
  gull: 5,
  /** A bubble every so often, and how deep it has to be for one to make sense
   *  — a whale sitting at the surface is breathing, not bubbling. */
  bubbleEvery: 1.7,
  minDepth: 12,
  /**
   * How many fish come over. Two, not a school.
   *
   * A whole school swarming the whale looked like a shoal that had lost its
   * mind. One or two sidling up to a stopped animal and hanging there is what
   * actually happens, and it is a much quieter thing to watch.
   */
  nibblers: 2,
  /**
   * Where they nibble, as directions in the whale's own frame: x across, y up,
   * z forward. They are put on the *skin* — the point where each direction
   * meets the body ellipsoid below — because a fish nibbling a whale is
   * touching it, and two fish hanging eleven units off its flank looked like
   * an escort rather than a nibble.
   *
   * All four are behind the middle and low on the flank. The mouth reaches 14
   * units forward and takes anything inside 7.5 of that; the furthest forward
   * of these sits at z = -3 on a body half-length of 18, so the nearest fish
   * is still a clear 20 units from being eaten.
   */
  nibbleSpots: [
    {x: 1, y: 0.12, z: -0.2},
    {x: -1, y: 0.1, z: -0.35},
    {x: 0.8, y: -0.5, z: -0.55},
    {x: -0.85, y: -0.45, z: -0.15},
  ],
  /** How far off the skin they sit, so they touch rather than sink in — half
   *  a fish, near enough. */
  nibbleClear: 1.6,
  /** How far they bob in and out while nibbling, and how fast. */
  nibblePeck: 1.1,
  nibblePeckRate: 3.1,
  /** How fast a nibbler closes on its station. */
  nibbleSpeed: 3.4,
  /** How close a fish has to be to bother coming over at all. */
  nibbleRange: 130,
  /**
   * The whale, as an ellipsoid, for keeping fish out of it.
   *
   * The body is 34 long and about 13 across, so these are its half-extents
   * with a little margin. Nothing is allowed inside: a fish that swam through
   * the whale on its way to a station gave the game away completely.
   */
  bodyX: 7.5,
  bodyY: 8,
  bodyZ: 18,
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

  /** How fast a gull flies over to land on a waiting whale's back, and how
   *  near it has to get before it counts as down. */
  perchSpeed: 34,
  perchNear: 3,
  /**
   * Folding the wings, once it is down.
   *
   * A standing bird does not hold its wings out. `foldSweep` is how far back
   * they swing — 1.5 radians is a right angle and a bit, which lays them along
   * the body pointing at the tail — `foldDrop` how far they settle onto the
   * flanks, and `foldIn` how much of their span is left showing, since a
   * folded wing bunches up rather than staying its full length.
   */
  foldSweep: 1.55,
  foldDrop: -0.3,
  foldIn: 0.6,
  /** How quickly they fold and unfold. Fast: it is a flick, not a stretch. */
  foldRate: 5,
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
  schools: 30,
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
  count: 48,
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
