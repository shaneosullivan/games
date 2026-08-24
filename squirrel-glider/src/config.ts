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
  length: 2050,
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
  fogNear: 370,
  fogFar: 2000,
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
  /**
   * What a scrape costs in speed, as a fraction of it kept per second.
   *
   * Per second and not per frame, which is what it used to be: 0.94 a frame is
   * 0.94 to the sixtieth a second, which is to say two per cent of your speed
   * left after one second of contact. A wall did not scuff you, it stopped
   * you dead. There is also no longer any turning — brushing a wall used to
   * add a fixed amount to the heading every frame, some three radians a
   * second, which spun the squirrel bodily round to face back up the valley.
   * Both mattered much more once the drafts arrived, because the drafts are
   * the game asking you to fly along a wall on purpose.
   */
  wallScrub: 0.75,
  /** Trees on the valley floor, purely to give the ground a scale to read
   *  height against — from 150 up, bare ground says nothing about how high
   *  you are. */
  trees: 620,
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
  dragPerV2: 0.000726,
  /**
   * Induced drag: the price of lift. Drag rises with the square of the lift
   * coefficient, which is why hauling back on the stick both floats you and
   * scrubs your speed off.
   *
   * These three together settle the glide, because at a steady glide the
   * descent is simply drag over lift. As set they give three and three fifths
   * forward for one down at trim, and, deliberately, trim sits exactly at the
   * best glide the wing has — so hands off is also the furthest a child can
   * get without having to learn anything.
   *
   * That is a long way for a wingsuit and it is not a made-up number: an
   * ordinary suit runs between two and three to one, and the wind tunnel work
   * gives 4.0 to an elite pilot in a high-performance suit. It was briefly set
   * to that 4.0 and the flight came out at a minute, which is a long time to
   * ask a child to hold one line — this is the same glide pulled back until
   * the valley ends when it should. The lift is untouched throughout, so the
   * squirrel flies at the same speeds and feels the same; only the drag moves.
   */
  inducedDrag: 0.001005,

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
   * How far past clMax the *snap* is allowed to go, for the moment it lasts.
   *
   * clMax is what the wing will hold all day. This is what it will do for half
   * a second when the squirrel throws itself back, and it has to be a lot more
   * or the flare has no punch: the snap was being clamped to clMax, which is
   * barely above trim, so pulling back flattened the glide and slowed it down
   * but could never actually lift. A real wing pitched up sharply makes far
   * more lift than its steady state for a beat, and this is that beat. It
   * washes out on its own, and the g cap still holds it, so it buys a flare
   * and never a way to fly for free.
   */
  clSnapMax: 5.2,
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
  snap: 3.6,
  /** How quickly the snap fades — about four fifths of a second, which is how
   *  long a flare wants to last: long enough for the nose to come up and the
   *  squirrel to actually balloon over the top, short enough that holding the
   *  stick there afterwards buys nothing but the drag. */
  washRate: 1.25,
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
  nMax: 5.5,
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

  /**
   * The air brake: what turning the belly into the wind costs.
   *
   * Induced drag alone already makes a hard pull-back expensive, but induced
   * drag is the price of *lift* and what is happening here is bluffer than
   * that — a squirrel flaring is a furry parachute held broadside to the air,
   * which is form drag and a lot of it. Without this the brake worked on the
   * numbers and could not be felt, and "slow down" is the one thing a child
   * needs from a flying game when it is all getting away from them.
   */
  brakeDrag: 0.0024,
  /**
   * How quickly the brake actually arrives — about six tenths of a second.
   *
   * The wing bites the instant the stick moves, but a belly does not: the
   * animal has to physically come round broadside before it is a parachute,
   * and that takes a moment. Giving the form drag its own lag is what finally
   * made a flare *lift*. Without it the brake came on with the lift and bled
   * the speed as fast as the nose came up, so a pull-back settled at exactly
   * level flight and hung there — measured, dead on 0.0 degrees, every time.
   * With it there is half a second of nose-up before the drag catches on, and
   * the squirrel balloons over the top the way it should.
   */
  brakeRate: 1.6,

  /**
   * Speed it can never exceed, however long the dive.
   *
   * This does real work now rather than being a backstop. With the drag down
   * where a four-to-one glide needs it, a squirrel pointed straight at the
   * ground would keep accelerating to 448km/h, well past anything a person has
   * ever flown a suit at. The cap holds it to 378, which is within a whisker
   * of the world speed record of 374.8 — so the fastest the game goes is about
   * the fastest the thing has ever been done.
   */
  maxSpeed: 105,

  /** What the leap off the ledge gives it: forward, and a little up. */
  jumpSpeed: 9,
  jumpUp: 2.5,
} as const;

/**
 * How far the animal's body swings away from the path it is travelling along
 * — its angle of attack, and the single clearest thing the player has to read.
 *
 * A point-mass glider has no attitude of its own: it points exactly where it
 * is going, always. Drawn that way the squirrel was glued to its own flight
 * path, and since the camera follows that path too, a screaming dive and a
 * gentle glide looked nearly identical. Both controls worked and neither one
 * looked like it did anything.
 *
 * So the body is drawn at a real angle to its path. This is not a cheat: a
 * gliding squirrel flies at an angle of attack of about forty degrees, which
 * is far past what an aircraft wing would tolerate and is exactly how the
 * animal works. Pushing the stick up tucks it to eleven degrees below its
 * path — head down, back arched, falling like a dart. Pulling it down rears
 * it up to nearly fifty above, belly flat against the oncoming air, which is
 * a squirrel putting the brakes on and looks like one.
 */
export const AOA = {
  tucked: -0.2,
  flared: 1,
  /** Bends the middle of the range down, so an ordinary glide sits at a
   *  natural ten degrees or so and the drama is saved for the ends of the
   *  stick. */
  curve: 1.6,
} as const;

/**
 * The shape of the stick: what a small movement is worth against a large one.
 *
 * Straight through, the pitch axis was a trap. A dive and an air brake are
 * both expensive — that is what makes them worth having — but with a linear
 * stick a child who rests a thumb slightly off centre pays that price
 * continuously without ever meaning to. Measured, a pilot who nudged the pitch
 * to chase every arch landed 28% short of one who left it alone entirely, and
 * took seven arches instead of seventeen.
 *
 * So the middle of the stick is made gentle and the ends are left alone: at a
 * quarter deflection the pitch axis gives about three per cent, at half about
 * a fifth, and at the stops it gives everything. Small corrections are nearly
 * free and a real shove is still a real shove. This is the standard expo curve
 * that model aircraft have used for decades, and it is the single cheapest
 * thing that makes a flying game easier to fly.
 */
export const CONTROL = {
  pitchExpo: 2.2,
  /** Gentler on the turn, which is the axis the game is really about and
   *  wants to stay responsive. */
  bankExpo: 1.4,
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
  scale: 0.62,
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
  /**
   * How far the arches' steady downward ramp may sit off the line a glide
   * actually traces. See Terrain.rampAt.
   *
   * Comfortably inside an arch's half height, so straightening the chain out
   * never costs anybody an arch — which is the whole trap this sort of change
   * walks into.
   */
  ramp: 7,
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
  spacing: 14,
  runMin: 3,
  runMax: 6,
  /**
   * The quiet between runs, and it is most of the valley now.
   *
   * A longer glide made a hundred of these on its own, which is an acorn every
   * second or so for the whole flight — at that rate they stop being something
   * you go and get and become weather. Long gaps make each run something you
   * spot ahead and turn towards, which is the job they are here to do.
   */
  gapMin: 120,
  gapMax: 200,
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
  /** And more room again in height, for the same reason the arches are tall:
   *  pitch is what moves a player off the line. See GATES.heightScale. */
  catchHeightScale: 2.1,
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
  /**
   * How far apart they are down the valley, and how far that may vary.
   *
   * Far apart, and far further than they were. A longer glide made more of
   * them automatically — twenty-five in one flight — and an arch every three
   * seconds is not a thing you aim at, it is a thing that keeps happening to
   * you. A dozen, well spaced, each one visible from a long way off and worth
   * lining up for.
   */
  spacing: 150,
  spacingJitter: 40,
  /** The first is well clear of the ledge, so there is time to find the
   *  controls before there is anything to aim at. */
  firstAt: 150,
  /**
   * How big the hole is, and how much that varies.
   *
   * Big, and meant to be. Getting through an arch should be the easy,
   * satisfying part of the flight — the thing a child succeeds at while they
   * are still learning to steer — and the difficulty, such as it is, belongs
   * to finding the line and holding it. Eleven units across is nearly six
   * squirrels wide, and taller again.
   */
  radius: 10.5,
  sizeJitter: 1.4,
  /**
   * How much taller than wide an arch is.
   *
   * Round arches punished the player for using the controls. Everything in the
   * valley hangs at the height a hands-off glide passes through, and both the
   * dive and the air brake change that height — so the moment a child did what
   * the game told them to do, they dropped underneath the next arch. Measured:
   * a pilot flying every arch on purpose fell from 16 of 17 to 6 of 17 the day
   * the brake was added.
   *
   * Height is the axis pitch moves you along, so height is the axis with the
   * room in it. A tall arch is also simply what an arch looks like.
   */
  heightScale: 1.7,
  /** How far a ring may sit off the line — see LINE — and off the height the
   *  glide will actually be at by then. Both small: a ring is meant to be the
   *  next bead on the string of acorns, not a separate errand. */
  sideWander: 1.5,
  heightWander: 2,
  /**
   * Arches that are not on the easy line at all.
   *
   * Every arch sitting on the ramp made a chain you could fly with one hand:
   * the whole valley at one height, and no reason ever to touch the pitch
   * control. Some sit low now, which is a dive and costs you nothing but
   * height you were spending anyway — and some are hung right up in the rising
   * air along a wall, which you cannot reach at all without going and finding
   * the draft and riding it. That is the one place in the game where the two
   * halves of it, the flying and the reading of the valley, have to be done
   * together.
   */
  lowChance: 0.25,
  /** Just far enough below the ramp to sit outside an arch, so it takes a
   *  deliberate nudge forward and never a whole manoeuvre. An arch is about
   *  eighteen units tall from the middle; this is a little more than that. */
  lowDrop: 20,
  /**
   * How often an arch over a draft is actually hung up in it.
   *
   * Not every time. With one on every draft, six arches of ten were up in the
   * rising air and steering straight down the valley took three — the game had
   * quietly become a game about drafts, when the arches are meant to be the
   * part a child gets right while they are still learning to steer. A couple
   * up there is a reward for spotting the white lines; most of them up there
   * is a tax on not having.
   */
  highChance: 0.45,
  /** How near the top of a draft an arch hung in one sits, and how far out
   *  toward the rock. */
  highOfCeiling: 0.82,
  highWallGap: 26,
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
  distance: 9.5,
  height: 2.3,
  /** How far ahead of the squirrel the shot is aimed, so the ground below is
   *  not most of the frame. */
  lookAhead: 8,
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
   * shot pinned exactly to the path never shows the attitude change: the
   * squirrel would sit at the same angle in the frame whatever it was doing.
   * Most of that job belongs to AOA now, which swings the body against its own
   * path, so this only has to keep the animal in shot.
   */
  pathFollow: 0.72,
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
  /**
   * Loudness at trim and flat out.
   *
   * Well under what it was. A dive is the loudest thing in the game and it was
   * drowning it: this is a game a child plays with the tablet a foot from
   * their face, and the wind is meant to tell them they are going fast, not to
   * be the reason they turn the sound off. It still more than triples between
   * an easy glide and a full dive, which is all the cue has to do.
   */
  gainSlow: 0.04,
  gainFast: 0.17,
  /** The filter, which is what turns a hiss into a roar. Kept off the top end
   *  for the same reason — it is bright air, not static. */
  cutoffSlow: 380,
  cutoffFast: 2200,
  /** How quickly it answers a change of speed. Slower than the flight, so it
   *  swells rather than flickering with every gust of stick. */
  rate: 2.4,
  /** How quickly it dies when the flight ends. Much faster: once you are down
   *  the wind should be gone before you have read the card, not sighing away
   *  behind it. Still a fade and not a cut, because wind that stops dead in
   *  one frame sounds like something broke. */
  hushRate: 6,
  /** How long the noise loop is. Long enough not to hear it repeat. */
  loopSeconds: 3,
} as const;

/**
 * The rising air along the valley walls.
 *
 * Real, and the oldest trick in gliding: wind meeting a ridge has nowhere to go
 * but up, so there is a band of lift running along the face of it. Pilots call
 * it ridge soaring and they will fly a ridge for hours on it.
 *
 * Bands and not columns, deliberately. A column is something you cross in a
 * second and a bit at gliding speed, which is barely worth turning for; a band
 * running a couple of hundred units along the rock is something you commit to,
 * lean into and *ride*, and it rewards flying close to a wall — which is the
 * one place in the valley where there is anything near enough to make speed
 * feel like speed.
 *
 * The air rises. The squirrel is not touched: it goes on gliding down through
 * air that happens to be going up faster than it is coming down, which is
 * exactly what really happens and means nothing in the flight model has to
 * know this exists.
 */
export const DRAFT = {
  /** How many stretches of wall have lift on them, and how long each runs. */
  count: 7,
  firstAt: 300,
  lengthMin: 210,
  lengthMax: 330,
  /** How far in from the rock the lift reaches. Wide enough to find without
   *  scraping, narrow enough that you have to mean it. */
  width: 40,
  /**
   * ...and never more than this share of the half-width, whatever `width`
   * says.
   *
   * The valley closes to under forty units in places, and a fixed forty-wide
   * band there reaches the middle of it — so the easy line down the centre was
   * being lifted by drafts nobody had gone looking for. It carried the
   * squirrel above the acorns, which hang on the line a glide without any lift
   * would have taken, and a flight that steered and did nothing else went from
   * twenty-five acorns to eleven. A draft has to be a place you go, so it has
   * to stay against the rock.
   */
  maxShare: 0.45,
  /**
   * How fast the air goes up at the rock face.
   *
   * Sink at an easy glide is about twelve, so this is a net climb of nearly
   * fifty a second — the squirrel does not drift upward, it is picked up and
   * thrown. That is the point: a draft has to be worth crossing a valley for,
   * and at half this it read as the glide merely going shallow for a moment.
   * The ceiling is what keeps it honest.
   */
  strength: 62,
  /**
   * How far above the glide line the lift keeps working.
   *
   * Every draft has to have a top or the game has no end: a squirrel that can
   * climb for ever never lands. Measured from the line a glide would have been
   * on anyway, so a draft is also a way to get back what a bad patch of flying
   * cost you.
   */
  ceiling: 120,
  /** How gently the lift dies out at the top and at the inner edge. */
  fade: 40,

  /**
   * What it looks like: pale streaks of air standing on end and sliding
   * upward.
   *
   * A draft has to be visible from far enough off to turn towards, and it has
   * to read instantly as *up* — which a scatter of drifting specks does not.
   * Vertical lines do, because nothing else in the valley is vertical: the
   * rock leans, the trees are little cones, the arches are rings. A column of
   * upright white dashes climbing a wall is unmistakable at any distance.
   *
   * They stand on the valley floor and climb the wall from there, rather than
   * hanging in a patch of sky wherever the squirrel happens to be. That is
   * what the air is actually doing — it comes up off the ground and up the
   * rock — and it means a draft is something a player looks *down* at, spots
   * from a long way off, and decides to go down to. Rising air is worth most
   * to somebody who is running out of height, so the place to put it is at the
   * bottom where they are.
   */
  lines: 460,
  lineRise: 19,
  lineLength: 10,
  /** Strong enough to read against pale grey rock, which is most of what they
   *  are seen against. */
  lineOpacity: 0.7,
  lineColour: 0xffffff,
} as const;
