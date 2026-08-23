/**
 * Every tunable number in Squirrel Glider lives here, so balancing the game
 * never means hunting through the systems that use it.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Never simulate more than this much wall clock in one frame. Guards the
   *  case where a backgrounded tab comes back with a huge delta. */
  maxFrame: 0.25,
} as const;

/**
 * The world: a valley with a cliff at one end to launch from.
 *
 * Laid out along -Z, so "down the valley" is the way the squirrel faces at the
 * start and the way the camera looks. Everything is measured from the launch
 * ledge, which sits at the origin.
 */
export const WORLD = {
  /**
   * How far the valley runs.
   *
   * How much valley there is to build. What counts as *finishing* it is not
   * this — see Terrain.reach, which is how far a hands-off glide actually got
   * when the game flew one at startup. This only has to be comfortably longer
   * than that, so the world does not run out under a good flight.
   */
  length: 1750,
  /** How wide the floor of the valley is, and how far out the walls stand. */
  halfWidth: 60,
  /**
   * The launch ledge, and the valley floor it looks down on.
   *
   * The plan asks for a far, far taller cliff, and this is one: a hundred and
   * fifty times the squirrel's own length, high enough that the valley floor
   * is a texture rather than a place when you are stood on the edge of it.
   * Everything else is measured off it — see `length`.
   */
  cliffHeight: 620,
  floorY: 0,
  skyColour: 0xbfe4f5,
  /** Fog, sized to the valley: it should hide where the world stops and
   *  nothing nearer. At the old 120/620 it was eating the middle distance of
   *  a valley three times longer than the one it was set for. */
  fogNear: 320,
  fogFar: 1700,
  /**
   * The walls, as one solid ridge each side rather than a scatter of peaks.
   *
   * Peaks standing on their own left gaps between them wide enough to fly
   * through and out of the world, and from the air they read as traffic cones.
   * A ridge is a wall you can be stopped by, which is what the game needs.
   */
  wallStep: 12,
  /** How far the walls close in and open out along the valley. Flying it
   *  should be a thing you steer, not a tube you fall down. */
  wallWander: 22,
  wallHeight: 210,
  /** How much the ridge line rises and falls, which is its silhouette. */
  wallRelief: 90,
  /** How far the shoulder leans away behind the ridge, and how far it drops
   *  doing it, so the far side is never a paper edge against the sky. */
  wallThickness: 70,
  wallDrop: 55,
  /** Boulders clinging to each face, for scale. */
  wallRocks: 90,
  /** How near the rock the squirrel may fly before it is scraping it. */
  wallClearance: 3,
  /** What a scrape costs in speed, and how far it turns you back toward the
   *  middle. Gentle: see Game.hitWall. */
  wallScrub: 0.94,
  wallTurn: 0.05,
  /** Trees on the valley floor, purely to give the ground a scale to read
   *  height against — from 150 up, bare ground says nothing about how high
   *  you are. */
  trees: 520,
} as const;

/**
 * The glide, as physics rather than as a set of rules.
 *
 * A point-mass glider: the squirrel has a speed, a flight path angle and a
 * heading, and forces move all three. Lift and drag come out of how fast it is
 * going and how hard the player is asking the membrane to work; gravity does
 * the rest. Nothing here scripts "diving is fast" — it falls out, because a
 * nose-down glider has gravity pulling along its own direction of travel.
 *
 * The plan asks for accurate, and this is the standard three-degree-of-freedom
 * model an aircraft is normally taught with. It is also, as it happens, what
 * makes the thing feel right: stalls, speed traded for height, and turns that
 * tighten as you slow down all arrive on their own.
 */
export const GLIDE = {
  /** Gravity. Real, because everything else here is in real units. */
  gravity: 9.81,
  /**
   * Lift and drag, lumped: force = coefficient x speed squared, per unit mass.
   *
   * Real air density, wing area and mass all collapse into these two, since
   * the only thing the game can feel is the ratio between them and how quickly
   * they answer the stick.
   *
   * Set from measured wingsuit flight rather than picked. A pilot and rig is
   * about 100kg over 1.4 square metres of wing, which is a wing loading near
   * 700N per square metre, and the numbers that fall out of that are the ones
   * the sport actually flies: about 150km/h and three-to-one hands off,
   * 265km/h with the nose down, and a vertical dive that runs out of
   * acceleration at 378km/h — which is within a whisker of the world speed
   * record of 374.8. The old set glided at 107km/h, which is slower than a
   * wingsuit has ever been flown on purpose.
   */
  liftPerV2: 0.00615,
  dragPerV2: 0.000871,
  /**
   * Induced drag: the price of lift. Drag rises with the square of the lift
   * coefficient, which is why hauling back on the stick both floats you and
   * scrubs your speed off.
   *
   * These three together settle the glide, because at a steady glide the
   * descent is simply drag over lift. As set they give three forward for one
   * down at trim — a good wingsuit, which runs between two and three to one,
   * rather than a paper aeroplane or a hawk — and, deliberately, trim sits
   * exactly at the best glide the wing has, so hands off is also the furthest
   * a child can get without learning anything.
   */
  inducedDrag: 0.001205,

  /**
   * What the stick asks the membrane for, as a lift coefficient.
   *
   * `trim` is hands-off — the glide it settles into on its own. Pulling back
   * goes toward `max`, which lifts the nose, floats, and bleeds speed; pushing
   * forward goes toward `min`, which drops the nose and lets it run.
   */
  clTrim: 0.85,
  clMin: 0.12,
  clMax: 1.5,
  /**
   * How fast the membrane answers.
   *
   * Not instant — a wing takes a moment — but the old 2.6 was a 385ms delay on
   * the only control the game has, which is most of a second between asking
   * for a dive and getting one. This is 143ms, which is about the point where
   * a control stops being felt as a control at all.
   */
  clRate: 7,
  /**
   * The snap: what a *movement* of the stick is worth, over and above where it
   * is being held.
   *
   * The honest physics cannot give a glider a quick nose-down. The only way a
   * wing pitches down is by making less lift, and it can never make less than
   * none, so the fastest possible pushover is gravity alone — about eleven
   * degrees a second, or three and a half seconds to get the nose forty
   * degrees down. That is not mushy flying, it is what a point mass is, and no
   * coefficient fixes it.
   *
   * The first attempt at fixing it was to let the stick command a pitch rate
   * directly, on top of the aerodynamics. It flew beautifully and it was
   * cheating: measured, holding the stick half back turned a 1393-unit glide
   * into a 4105-unit one, because a pitch rate that never washes out is lift
   * nobody paid for and the whole game is a budget of height. Every flight
   * became "hold back and wait".
   *
   * So the extra is transient. It answers how fast the stick is *moving*, not
   * where it is: snap it back and the membrane bites hard for half a second
   * and then settles to what it is really worth. That is honest — a wing
   * pitched up sharply really does make more lift than its steady state for a
   * moment — and, being lift, it is charged induced drag like any other. Hold
   * the stick anywhere and you get exactly the glide that position deserves.
   */
  snap: 1.7,
  /** How quickly the snap fades: about half a second, which is roughly how
   *  long a held input lasts before it stops being a movement. */
  washRate: 2.2,
  /**
   * How far the wing will go the *wrong* way for a moment.
   *
   * A shove forward drives the lift briefly negative, which is a real thing a
   * wing does and the only way to get the nose down quickly. Held, it washes
   * back out to clMin, so it buys a manoeuvre and never a permanent dive.
   */
  clFloor: -0.4,
  /**
   * The most g it will pull.
   *
   * At the new speeds the wing is strong enough to hurt itself with: a full
   * pull at 105 is over ten g, and the pull-out snaps round in a frame and
   * reads as a glitch rather than as a manoeuvre. Four is a hard, committed
   * swoop that still takes a moment. It only bites in a fast dive, which is
   * the only place it should.
   */
  nMax: 4,
  /** The same, pushing over. Smaller, as it is on anything with a pilot in
   *  it: negative g is far less comfortable than positive. */
  nMin: 1.6,
  /**
   * Past this the wing stops working and starts falling.
   *
   * A real stall is an angle of attack, but from the seat it is a speed — the
   * squirrel mushes, the nose drops, and the only way out is down. Gentle, and
   * it recovers itself, because this is a game for a child. Raised with the
   * rest of the envelope: a real suit goes mushy around 30, which is 113km/h.
   */
  stallSpeed: 30,
  stallLoss: 0.55,

  /**
   * How much of the lift a hard bank is allowed to cost.
   *
   * The floor on cos(bank) when the squirrel pulls through a turn — see the
   * note in Squirrel.update. Below this it stops being able to hold itself up
   * and the turn starts costing height, which is what should happen; above it,
   * a turn is simply a turn.
   */
  bankHold: 0.62,

  /**
   * How far it can lean, how fast it gets there, and how fast it comes back
   * level when the stick is let go.
   *
   * Sixty-nine degrees, up from fifty-four, and the reason is geometry rather
   * than daring: turn radius is v squared over g tan(bank), and at the new
   * trim speed fifty-four degrees needs 130 units to come round in — wider
   * than the valley. At sixty-nine it is seventy, which fits.
   */
  bankMax: 1.2,
  bankRate: 4.5,
  bankReturn: 3.2,

  /** Speed it can never exceed, however long the dive. Terminal velocity, in
   *  effect: drag would do it anyway, but a hard cap keeps the camera sane. */
  maxSpeed: 105,

  /** What the leap off the ledge gives it: forward, and a little up. */
  jumpSpeed: 9,
  jumpUp: 2.5,
} as const;

/** The squirrel itself: how big it is drawn, and how it flaps and steers. */
export const SQUIRREL = {
  /**
   * How big it is drawn — and the single biggest thing wrong with how fast
   * the game felt.
   *
   * Speed is not read in units a second, it is read in body-lengths a second:
   * a real flying squirrel covers twenty of its own lengths every second, and
   * a wingsuit pilot twenty-five. Drawn at 1.5 this squirrel was nine units
   * nose to tail and covering three and a third of itself a second, which
   * looks like a slow animal no matter what the number in the corner says. At
   * a third of that it is under three units long and covers about fourteen —
   * the same flight, the same physics, read correctly.
   */
  scale: 0.5,
  /** How far the limbs spread the membrane, and how much they pull in when
   *  diving — a wingsuit tucks to go fast. */
  spread: 1,
  tuckAt: -0.6,
  tuck: 0.55,
  /** The tail steers visibly, which is most of what makes it read as an
   *  animal rather than a paper dart. */
  tailSwing: 0.5,
  /** A slow idle bob, so it never looks frozen in the air. */
  bobRate: 2.2,
  bobAmount: 0.05,
} as const;

/**
 * The line the game wants you to fly.
 *
 * One long, lazy S down the length of the valley that both the acorns and the
 * arches sit on, rather than each of them being scattered on its own. That one
 * decision is most of the design: a child who follows the acorns is flown
 * through the arches without ever being told to look for them, and the thing
 * they are learning — that a glider turns by leaning and that a turn costs
 * height — is the thing the line is asking for.
 *
 * Two waves rather than one, so it never settles into a rhythm you can fly
 * with your eyes shut, and both slow: a hands-off glide runs straight down the
 * middle, so every unit of this is a unit of steering somebody has to do.
 */
export const LINE = {
  /** How far off the middle it wanders. Inside the walls at their narrowest,
   *  with room to spare — see the clamp in Terrain.ribbonAt. */
  wander: 26,
  /** The two waves, in radians per unit down the valley. About 1460 units and
   *  690 units a cycle, against a valley you cross in 1400. */
  waveA: 0.0043,
  waveB: 0.0091,
  /** How much of the wander the faster wave gets. */
  share: 0.36,
  /** How far clear of the rock the line stays. */
  wallGap: 14,
} as const;

/**
 * The acorns hanging down the valley.
 *
 * Strung in short leaning runs rather than scattered: a run of them reads as a
 * route, which is how the game shows a child where the good flying is without
 * writing any of it down. Scattered ones would read as litter.
 */
export const NUTS = {
  firstAt: 70,
  /** How far down the valley they carry on for, as a fraction of how far a
   *  flight can get. See the same note on GATES.until. */
  until: 0.95,
  /** Along a run, and between runs. */
  spacing: 11,
  runMin: 4,
  runMax: 9,
  gapMin: 30,
  gapMax: 70,
  /** How far a run may sit off the line — see LINE. Small, now that there is
   *  a line for them to sit on: the wander used to *be* the shape of the
   *  route, and a route made of independent random offsets is a zigzag no
   *  glider could fly. The leaning is the line's job now. */
  sideWander: 2.5,
  /** The same, for height. Kept inside the catch radius below, and measured
   *  rather than guessed: at seven a perfectly flown line still passed a
   *  median of 5.6 units clear of every acorn in the valley, which is a
   *  collectible nobody can collect. */
  heightWander: 2.5,
  runClimb: 2.5,
  minHeight: 8,
  /** How far clear of the rock an acorn must hang. */
  wallGap: 6,
  /** How near counts as caught. Generous, because they are a reward for
   *  flying the line and not a test of aim: a child who is a couple of body
   *  lengths off should still be having their flying rewarded. */
  catchRadius: 5,
  size: 0.72,
  /** Turning and bobbing, so they hang rather than sit. */
  spinRate: 1.4,
  bobRate: 1.8,
  bob: 0.5,
} as const;

/**
 * The gates: rock arches down the valley to fly through.
 *
 * The whole of the challenge in the first version. They are scored rather than
 * enforced — missing one costs you nothing but the score, because a game that
 * ends when a child clips a rock is a game they play once.
 */
export const GATES = {
  /**
   * How much of the valley they carry on for, as a fraction of how far a
   * flight can actually get — see Terrain.reach.
   *
   * A fraction and not a count, and this was worth measuring: thirty rings at
   * sixty units apart reach two thousand two hundred down a valley nobody can
   * fly more than fourteen hundred of. Every ring inside the reach was being
   * caught and the last twelve were scenery, so the game read as "you managed
   * eighteen of thirty" when the truth was eighteen of eighteen. A score out
   * of a number that cannot be got is not a score.
   */
  until: 0.97,
  /** How far apart they are down the valley, and how far that may vary. */
  spacing: 62,
  spacingJitter: 18,
  /** The first is well clear of the ledge, so there is time to find the
   *  controls before there is anything to aim at. */
  firstAt: 150,
  /**
   * How big the hole is, and how much that varies.
   *
   * Generous, and measured: everything in the valley hangs at the height a
   * hands-off glide passes through, so a child who leaves the pitch alone and
   * only steers takes the lot. The size is what buys room for one who does
   * not. Eight units is about five squirrels across — a hoop, plainly, and
   * plainly one you can miss.
   */
  radius: 8,
  sizeJitter: 1.6,
  /** How far a ring may sit off the line — see LINE — and off the height the
   *  glide will actually be at by then. Both small: a ring is meant to be the
   *  next bead on the string of acorns, not a separate errand. */
  sideWander: 2.5,
  heightWander: 3,
  /** How far clear of the rock a ring must hang. */
  wallGap: 6,
  /** How thick the ring itself is. */
  ribRadius: 0.7,
  /** Bright, and unlit, so it carries against rock and against sky alike. */
  colour: 0x7fe9ff,
  glow: 0x4fc9e8,
  litColour: 0x8dff9c,
  /**
   * The halo, as a multiple of the ring's radius.
   *
   * Small. At three and a half the halos of neighbouring rings overlapped and
   * added together — additive blending, so two of them is twice as bright —
   * and washed the whole valley out to white. A glow should say where a ring
   * is, not replace the view of it.
   */
  haloSize: 1.5,
  pulseRate: 2.1,
  pulse: 0.09,
} as const;

/**
 * How fast counts as fast.
 *
 * The camera, the lens, the shake, the streaks and the wind all read the
 * flight through this one pair of numbers, so they cannot disagree about it.
 *
 * Measured off real flights rather than taken from the ends of the envelope,
 * and that mattered: the first version scaled from the trim speed to the
 * absolute top speed, and since a normal glide sits within a couple of units
 * of trim, every cue in the game read zero for the whole flight. The lens
 * never opened once. These are the speeds a flight actually moves between.
 */
export const FEEL = {
  slow: 32,
  fast: 78,
} as const;

/** The camera: behind and a little above, looking where the squirrel is going. */
export const CAMERA = {
  /**
   * How far back the shot sits.
   *
   * In close, and it has to be: the thing that makes speed legible is how fast
   * the near scenery crosses the lens, and every unit further back divides
   * that. Eleven units at sixty degrees is a frame about thirteen wide, so the
   * squirrel fills a quarter of it — big enough for a child to read what it is
   * doing, near enough that the valley moves.
   */
  distance: 11,
  height: 2.6,
  /** How far ahead of the squirrel the shot is aimed, so the ground below is
   *  not most of the frame. */
  lookAhead: 9,
  /** How quickly the shot swings round behind a turn. Loose enough that a hard
   *  turn throws the squirrel across the frame before the camera follows it,
   *  which is most of what makes speed feel like speed — but it is the
   *  *heading* that lags now and never the distance. See followCamera. */
  lerp: 3.4,
  lookLerp: 4.5,
  /**
   * Extra distance at full speed.
   *
   * Small on purpose. Pulling the camera back when the squirrel speeds up
   * shrinks the subject and slows the scenery down — it takes speed *away*
   * exactly when there is more of it. The old twelve was fighting the flight.
   * The widening is done with the lens instead; see fov below.
   */
  speedPullback: 3,
  /**
   * The lens, at trim and flat out.
   *
   * A wide lens is how a camera says fast: the periphery is where the sense of
   * motion lives, and a narrow one makes people underestimate speed badly —
   * measured at around twice the visual gain before a 25-degree view reads as
   * natural, against a 90-degree one. So the lens opens as the squirrel runs:
   * fifty-six when it is mushing along, ninety in a dive, with the near rock
   * stretching past the edges of the frame. Eased over about a third of a
   * second so it swells rather than snaps.
   */
  fov: 62,
  fovSlow: 56,
  fovFast: 90,
  fovRate: 3.2,
  /**
   * How much of the flight path angle the shot follows.
   *
   * The camera used to look ten degrees down whatever the squirrel was doing,
   * so in a fifty-degree dive the ground coming up at you happened below the
   * bottom of the screen — the dive had no picture. Not all of it, because a
   * shot pinned exactly to the path never shows you the horizon tilting.
   */
  pathFollow: 0.75,
  /**
   * How much the lens trembles flat out, and how much of that is owed to
   * flying low.
   *
   * Speed is read in eye-heights a second, not in units a second, which is why
   * a jet at altitude looks becalmed and a car in a tunnel looks quick — and
   * why this game, most of which happens six hundred units above anything,
   * needs the help. Below `shakeFrom` off the deck the shake comes up whatever
   * the speed. Squared where it is used, so an easy glide is perfectly still.
   */
  shake: 0.16,
  shakeLow: 0.55,
  shakeFrom: 40,
} as const;

/** The end of the flight: what counts as landing, and how it plays out. */
export const LANDING = {
  /** How close to the floor counts as down. Smaller than it was, because so
   *  is the squirrel. */
  height: 0.9,
  /** Below this speed it is a landing; above it, a tumble. Neither hurts —
   *  see the note in Game.land. Moved up with the rest of the envelope: at the
   *  old thirty every arrival was a tumble. */
  gentle: 46,
  /** How long the squirrel slides or rolls before the card comes up. */
  runOut: 1.6,
} as const;

/**
 * The wind streaks: short white dashes flying past the lens.
 *
 * Pure cue, no physics. Speed is only ever read from things going past, and
 * for most of this flight the nearest thing is a valley wall sixty units away
 * — the shot can be honest about ninety units a second and still look becalmed
 * because nothing in it moves. These put something near the camera at all
 * times. They fade in as the squirrel runs, so slow flying stays calm and a
 * dive is a hail of them.
 */
export const STREAKS = {
  count: 260,
  /** The box they live in, centred a little ahead of the squirrel. Anything
   *  that leaves it is wrapped round to the far side, so the same few hundred
   *  serve the whole valley. */
  spread: 44,
  height: 26,
  depth: 70,
  ahead: 18,
  /** How long a dash is at full speed, and how much of the speed it takes to
   *  see them at all. Below `from` there are none: standing still in a snow of
   *  streaks would look like the squirrel was the thing that had stopped. */
  length: 4,
  from: 34,
  full: 78,
  /** Faint. They are meant to be felt at the edge of the eye and not looked
   *  at: any more than this and a dive reads as flying through rain. */
  opacity: 0.3,
  colour: 0xffffff,
} as const;

/**
 * The wind, as sound.
 *
 * Generated rather than loaded: wind is noise through a filter, which is four
 * lines of Web Audio and no megabyte of mp3 in a single-file build. Both the
 * loudness and the brightness follow the speed — a glide hisses, a dive roars
 * — which makes it the one cue that tells you how fast you are going with your
 * eyes on something else.
 */
export const WIND = {
  /** Loudness at trim and flat out. Never silent in flight, never shouting. */
  gainSlow: 0.05,
  gainFast: 0.5,
  /** The filter, which is what turns a hiss into a roar. */
  cutoffSlow: 420,
  cutoffFast: 3200,
  /** How quickly it answers a change of speed. Slower than the flight, so it
   *  swells rather than flickering with every gust of stick. */
  rate: 2.4,
  /** How long the noise loop is. Long enough not to hear it repeat. */
  loopSeconds: 3,
} as const;
