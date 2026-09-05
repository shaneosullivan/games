/**
 * Every tunable number in Penguin, grouped by system.
 *
 * The house rule in this repo: no magic numbers at the call site, and where a
 * number was arrived at rather than guessed, the arithmetic that produced it
 * is written down beside it.
 *
 * The unit of length is a quarter of a metre. A penguin sliding on its belly
 * is about a metre and a half nose to toes, which is why it is drawn six units
 * long and the hill is sixteen hundred — four hundred metres of mountain.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Longest frame the loop will believe. A tab that was in the background
   *  comes back with a huge one, and stepping it would teleport the penguin
   *  through the trees. */
  maxFrame: 0.1,
} as const;

/**
 * The look of the place: a bright cold day, seen through falling snow.
 *
 * The fog is the same colour as the sky and comes in close by the standards of
 * the other games here. That is doing two jobs: it hides the far end of the
 * hill mesh, and it is what makes the mountain feel like weather rather than
 * like a model of a mountain.
 */
export const WORLD = {
  skyColour: 0xcfe6f5,
  fogNear: 90,
  fogFar: 620,
} as const;

export const CAMERA = {
  fov: 62,
  near: 0.5,
  far: 1600,
  /** How far behind and above the penguin the shot sits. Low and close: this
   *  is a game about speed, and speed reads off the ground going past. */
  distance: 22,
  height: 9.5,
  /** How far ahead of the penguin the camera looks. Down the hill rather than
   *  at the bird, so most of the screen is the thing you are about to hit. */
  lookAhead: 16,
  /** How much further back the shot pulls at full speed. Nothing dramatic —
   *  just enough that going fast feels different from going slowly. */
  speedPull: 10,
  /** How fast the eye and the look-at point chase their targets. Frame-rate
   *  independent easing, so these are per second. */
  easeEye: 7,
  easeLook: 5,
  /**
   * The follow, which is two problems and not one — lifted from the bee game's
   * rig by way of the caterpillar's.
   *
   * While the player is steering, the stick is read in the camera's frame, so
   * turning the camera turns the heading by the same amount and no gain ever
   * closes the gap. All the follow can do then is stay out of the way: a dead
   * zone it will not move inside of, and a hard cap on how fast it turns.
   *
   * The moment nobody is pushing, that loop is gone and it can come round
   * briskly.
   */
  yawDeadzone: 0.34,
  yawGain: 1.5,
  yawMaxRate: 1.5,
  yawIdleGain: 3,
  yawIdleMaxRate: 3.4,
} as const;

export const SHADOW = {
  mapSize: 2048,
  bias: -0.0008,
  normalBias: 0.5,
  /**
   * The shadow camera is a box that travels with the penguin rather than one
   * fixed box over the whole hill: four hundred metres of mountain inside a
   * single 2048 map would put a shadow texel at twenty centimetres and every
   * edge in the game would be a staircase.
   */
  extent: 120,
  near: 1,
  far: 700,
} as const;

/**
 * The hill.
 *
 * A valley you slide down: the floor falls away toward -Z, the sides rise into
 * banks, and the whole corridor swings left and right as it goes. The banks
 * are the reason there are no invisible walls in this game — ride up one and
 * gravity brings you back down, which is a boundary a child never has to be
 * told about.
 */
export const HILL = {
  /** How long the run is, and where the sea meets it. */
  length: 1600,
  /** Half the width of the ground that gets built. Wider than the corridor by
   *  a good margin, because the banks have to have something behind them or
   *  the world ends in mid-air at the top of the rise. */
  halfWidth: 240,
  /**
   * How steeply it falls: units down per unit along.
   *
   * 0.3 is about seventeen degrees, which on a real mountain is a red run.
   * With SLIDE.gravity it works out at a top speed of fifty-five units a
   * second — fourteen metres a second, or fifty kilometres an hour, which is
   * fast enough to be exciting and slow enough to steer.
   */
  slope: 0.3,
  /** How far the corridor wanders side to side, and over what length it does
   *  it. Two waves that do not divide into each other, so the run never
   *  repeats a shape a child could learn by heart. */
  meander: 46,
  meanderWave: 380,
  meander2: 22,
  meanderWave2: 143,
  /** Half the width of the flat-ish floor of the valley, and how high the
   *  banks climb outside it. A bank you can ride but not escape: at full
   *  speed straight at it the penguin gets about two thirds of the way up. */
  corridor: 62,
  bankHeight: 34,
  bankWidth: 90,
  /** Rolling bumps in the floor, so it is a mountain and not a ramp. Layered
   *  waves rather than noise, because they have to be the same every run — a
   *  child who learns where the big roll is should find it there tomorrow. */
  rollHeight: 3.4,
  rollAlong: 61,
  rollAcross: 47,
  rollHeight2: 1.7,
  rollAlong2: 23,
  rollAcross2: 31,
  /**
   * The jumps, cut into the ground rather than built as props laid on it.
   *
   * A ramp in the heightfield is one the penguin leaves smoothly and lands on
   * smoothly, with no collision code and nothing to fall through.
   *
   * The shape matters more than it looks. These were raised cosines to begin
   * with — a smooth hump, flat at the top — and a hump throws nothing: the
   * ground is level at the crest, so the vertical speed there is zero and all
   * you get is a short drop off the far side. Measured over a whole run, a
   * penguin doing fifty spent not one tenth of a second in the air.
   *
   * So they are proper kickers now: `height` over `length`, steepening all the
   * way, ending at the lip where it is steepest. Off that the vertical speed
   * is the run-in speed times twice the height over the length — fifty times
   * 0.6, or thirty units a second, which against SLIDE.airGravity is about a
   * second of air. Behind the lip the snow falls away in a third of the
   * distance, so there is nothing left to land on until you come down.
   *
   * They sit on the clear line, not beside it. A jump a child has to go
   * looking for is a jump a child never finds.
   */
  jumps: [
    {z: -300, height: 8, length: 30, width: 26},
    {z: -560, height: 9, length: 30, width: 28},
    {z: -1080, height: 10, length: 32, width: 30},
    {z: -1340, height: 11, length: 34, width: 32},
  ],
  /** How quickly the snow falls away behind a lip, as a fraction of the
   *  ramp's own length. */
  jumpBack: 0.35,
  /**
   * How steeply the shelf at the bottom runs to the sea.
   *
   * It used to be dead level, and dead level is where the run ended: the
   * penguin arrived at the shelf doing forty-three and stopped ten units short
   * of the finish line every single time, because on flat ground nothing is
   * pushing and the snow is still holding. A shallow slope keeps it rolling —
   * at 0.11 the pull settles the speed at about twenty, so you cross the line
   * quickly and go off the ice rather than creeping to a halt on it.
   */
  shelfSlope: 0.11,
  /**
   * The frozen lakes.
   *
   * Each one is a flat pan pressed into the hillside — the ground inside it is
   * levelled off, so it really is flat rather than merely painted to look it.
   * That is the whole reason they are part of the height function instead of
   * meshes laid on top: a lake with a roll running through it is a lake nobody
   * believes in, and you cannot skid across a slope.
   *
   * One of them, halfway down and right across the corridor, rather than a
   * string of little ones. A lake is the one place on this mountain where the
   * controls stop working, and that wants to be a landmark you can see coming
   * and get ready for — not something that keeps happening.
   */
  lakes: [{z: -820, x: 0, radius: 104}],
  /**
   * How far past the edge of the ice the ground goes on flattening, as a
   * fraction of the radius.
   *
   * The flat pan runs all the way out to the lake's own radius and this is the
   * ramp *outside* it, under the rim of piled snow. That way round matters: it
   * was the other way at first, with the blend eating the outer third of the
   * lake, and the ice you could see was laid over ground that was still
   * sloping — so the penguin sank through the edge of every lake it crossed.
   */
  lakeRim: 0.22,
  /** How big a triangle the ground is made of. Five units is twelve hundred
   *  centimetres — small enough that the banks curve and the jumps read as
   *  ramps, large enough to keep the whole hill under forty thousand faces. */
  cell: 5,
} as const;

/**
 * Sliding on your belly.
 *
 * A skier's model rather than a car's: the penguin has a heading, and gravity
 * pushes it along that heading by however much of the slope is pointing that
 * way. Turn across the hill and you slow down; point it down the fall line and
 * you go. That one rule is the whole game, and it is why the stick does not
 * need a brake button — pulling back turns you up the hill, which is exactly
 * how you stop on snow.
 */
export const SLIDE = {
  /**
   * How hard the mountain pulls, in units a second squared per unit of slope.
   *
   * With HILL.slope at 0.3 the pull down the fall line is 100 x 0.3 = 30, and
   * a top speed is where the pull and the drag cancel: 30 / 0.55 = 55 units a
   * second. Both numbers are quoted in the comments that follow because they
   * only mean anything together.
   */
  gravity: 100,
  /** Belly friction. Proportional to speed, so it sets the top speed rather
   *  than just taking the edge off. See gravity for the arithmetic. */
  drag: 0.55,
  /** A floor under the friction, so a penguin that has stopped on a flat spot
   *  actually stops instead of creeping for ever. */
  stickiness: 2.2,
  /** How fast the heading swings toward where the stick is pointing, in
   *  radians a second. */
  turnRate: 2.5,
  /**
   * How much of that turn survives at speed.
   *
   * A bird doing fifty kilometres an hour on its stomach cannot pivot like one
   * doing five, and letting it turn as hard at the bottom of the hill as at
   * the top made the whole run feel weightless. At full speed it keeps this
   * fraction of the turn, which is a turning circle of about ninety units —
   * a third of the corridor's width, so the gaps between trees stay makeable.
   */
  turnAtSpeed: 0.45,
  /**
   * Sideways slip: how much of the fall line the penguin takes regardless of
   * where its nose is pointing.
   *
   * Without it a traverse holds a perfect line and the hill might as well be a
   * road. Snow does not do that — you always wash a little downhill — and the
   * slip is what makes the banks feel slippery and the traverses feel earned.
   */
  slip: 0.28,
  /** How fast it gets going from a standstill at the top, before the slope has
   *  had a chance to do anything. Purely so the first second is not a wait. */
  push: 16,
  /**
   * Shoving with your feet, when you have come to a stop.
   *
   * A penguin at a standstill has to be able to get going again, whichever way
   * it is pointing and wherever it has ended up — turned round facing up the
   * hill, sat in a dip, or parked out on a lake. Without it there are places
   * on this mountain a child can get to and not get out of, and being stuck is
   * the one thing a game like this must never do.
   *
   * It is a floor under the speed rather than a push added to it, and that is
   * the difference between working and not: as a push it was still cancelled
   * by the slope, so a penguin facing up the hill sat exactly where it was
   * with its feet going. As a floor the bird simply gets up and waddles, which
   * is what a real one does and how it gets back to the fish it went past.
   *
   * Only up to `shuffleBelow`, so it is a way of starting and never a way of
   * going faster: above a walking pace the mountain takes over again.
   */
  shuffle: 11,
  shuffleBelow: 7,
  /** Where the belly sits above the snow. */
  ride: 1.1,
  /** In the air: what pulls it back down, and how much the drag drops off
   *  while there is no snow under it. Air is thinner than snow, and a jump
   *  that scrubbed speed would be a jump nobody took twice. */
  /**
   * What pulls it back down out of a jump.
   *
   * Half of what it was. At a hundred and five nothing on the hill could throw
   * the penguin at all — a kicker only launches you if the ground drops away
   * faster than gravity can pull you after it, and at that strength none of
   * them could. At fifty-five a lip throws about a second of air.
   */
  airGravity: 55,
  airDrag: 0.08,
  /**
   * Ice.
   *
   * Everything a lake changes, as multipliers on the ordinary snow numbers.
   * Almost no drag, so you keep every bit of the speed you arrived with; a
   * fraction of the grip, so the nose points one way and the bird goes
   * another; and a slower turn, because there is nothing to dig an edge into.
   *
   * The flat pan does the rest on its own — nothing is pushing you across a
   * level lake, so you cross it on what you brought and come off the far side
   * slower than you went on. Which is exactly what a frozen lake is like.
   */
  /**
   * How much of the snow's drag the ice keeps.
   *
   * Three quarters, which sounds like a lot for ice and is: the reason a lake
   * is fast is mostly that it has no rolls and no turns in it to scrub speed
   * on, and only partly that it is slippery. Taken much lower it stopped being
   * a lake and became a launch ramp — a slippery three-tenths slope with no
   * drag on it settles at over a hundred and thirty units a second, which is
   * two and a half times what the mountain can do and quite unsteerable. At
   * this it settles around seventy-three, a third quicker than snow.
   */
  iceDrag: 0.75,
  /**
   * How much of the snow's sideways wash the ice keeps.
   *
   * Less, not more, which is the opposite of the first guess. With the
   * steering locked on a lake, a big wash would slide you down the fall line
   * whatever direction you went on in — and the whole point of a lake is that
   * you hold the line you committed to.
   */
  iceSlip: 0.6,
  /**
   * How much lake has to be under the belly before the steering goes.
   *
   * On a frozen lake you can still turn the bird — spin it right round if you
   * like — but turning does nothing to where you are going. You carry on along
   * the line you were on when you reached the ice. That is what makes a lake a
   * decision: you have to line yourself up before the shore, and after that it
   * is out of your hands. A third of the way in is enough, so the grip goes as
   * you cross the shore rather than a moment later out in the middle.
   */
  iceLock: 0.35,
  /**
   * And how fast you have to be going for the lake to take the steering.
   *
   * A penguin that stops on the ice has to be able to shuffle round and set
   * off again. Without this the lock was absolute, and coming to rest out in
   * the middle of a frozen lake was the end of the run — pointing uphill, no
   * steering, and nothing on the mountain able to turn you round.
   */
  iceLockAbove: 7,
  /** How fast the body pitches to match the slope it is on, and how far it
   *  leans into a turn. Both cosmetic; both what makes it read as a body
   *  rather than a sprite. */
  pitchRate: 6,
  leanMax: 0.5,
  leanRate: 5,
  /** Flipper paddling: how fast they beat when you are steering hard. */
  paddleRate: 7,
} as const;

/**
 * Hitting something.
 *
 * There is no losing in this game, and there is no falling over either. You
 * bump off a tree — knocked sideways, most of your speed gone, still the right
 * way up and still steering — and carry on. Tumbling came first and was wrong:
 * it took the controls away for a second and a half, which on a hill you are
 * still going down is the game playing itself while a child watches.
 */
export const BUMP = {
  /**
   * How much speed survives the bump: all of it.
   *
   * It took half to begin with, and half is a punishment — you clip a tree at
   * the top of the mountain and spend the next ten seconds getting your speed
   * back, which is ten seconds of nothing happening. Being knocked off your
   * line is cost enough: you are now pointing somewhere you did not choose,
   * with a tree coming up.
   */
  keep: 1,
  /** How far round the nose gets knocked, as a fraction of the way to
   *  pointing straight away from what you hit. Not the whole way — being spun
   *  to face directly back up the hill would be its own kind of stop. */
  turn: 0.45,
  /** How far clear of the thing the penguin is put, on top of the overlap, so
   *  it cannot bump the same tree twice in consecutive steps. */
  clear: 0.6,
  /** The wobble afterwards: how far it rocks and for how long. Cosmetic
   *  entirely — the steering never stops working. */
  shake: 0.45,
  shakeTime: 0.55,
} as const;

/**
 * The things on the hill.
 *
 * Counts are for the whole four-hundred-metre run. They are placed with a
 * seeded generator, so the course is the same course every time: a child who
 * learns the line through the trees should find that line there tomorrow.
 */
export const PROPS = {
  seed: 20260905,
  trees: 340,
  rocks: 150,
  bushes: 220,
  snowmen: 14,
  /** How wide a corridor stays clear down the middle of the run.
   *
   * Not the whole corridor: a course with a clear lane down the centre is a
   * course you can win with your eyes shut. This is a wandering line — see
   * Hill.laneAt — and the trees close in on both sides of it. */
  lane: 17,
  /** How near the top nothing is placed, so the first seconds are a slide and
   *  not a slalom. */
  clearStart: 90,
  /** And how near the bottom, so the finish is not something you crash into. */
  clearEnd: 120,
  /** How steep a slope a tree will grow on. Above this it is bank, and a tree
   *  growing out of the side of a half-pipe looks like a mistake. */
  maxSlope: 0.72,
  /** How far a rock or a tree reaches, as a fraction of what it looks like.
   *
   * Under one on purpose. A hit that lands when the sprites have not visibly
   * touched reads as the game being unfair, and a child cannot tell you that
   * is what happened — they just stop enjoying it. */
  forgive: 0.72,
} as const;

/**
 * Dissolving whatever stands between the camera and the penguin.
 *
 * The same machinery the caterpillar uses, from shared/fadeInFront.ts, and
 * here for the same reason: a mountain thick with trees is a mountain where
 * the one thing you are steering keeps disappearing behind a trunk, and a
 * player who cannot see themselves is simply stuck.
 */
export const FADE = {
  /**
   * How much room to clear around the bird, at the bird's own distance.
   *
   * Only what falls inside the cone from the eye to a disc this wide fades.
   * Depth alone would dissolve every tree nearer than the penguin whether or
   * not it hid anything — half the forest going ghostly because one trunk was
   * in the way.
   */
  radius: 5,
  /** Depth over which a trunk goes from solid to gone. */
  band: 5,
  /** Below this alpha the fragment is discarded outright, so a ghost trunk
   *  cannot still hide the penguin by writing depth. */
  cutoff: 0.06,
  /** A band just in front of the penguin is kept solid, so it is never seen
   *  through a hole in the tree it is passing. */
  margin: 3,
} as const;

/**
 * The fish.
 *
 * Scattered down the hill for the penguin to scoop up on the way past. They
 * are what makes the run a course rather than a corridor: the fish are off the
 * quick line, so going for one costs you a turn.
 */
export const FISH = {
  count: 90,
  /** How near the middle they sit. Inside the trees, mostly — but a good
   *  number are out on the banks, where fetching one is a proper detour. */
  spread: 74,
  /** How far above the snow they float, how fast they turn and how far they
   *  bob. A fish standing still in the snow is hard to see going past at
   *  fifty; a turning one catches the light. */
  hover: 4,
  spin: 1.6,
  bob: 0.7,
  bobRate: 2.4,
  /** How close the beak has to get. Generous — this is the reward, and a
   *  reward you miss by twenty centimetres at speed is not a reward. */
  reach: 9,
  size: 2.4,
} as const;

/**
 * The snow coming down.
 *
 * A box of flakes that travels with the camera and wraps round: there is no
 * point simulating weather over four hundred metres of mountain when the only
 * part anybody can see is the twenty metres in front of them.
 */
export const SNOWFALL = {
  count: 1400,
  /** The box the flakes live in, centred a little ahead of the camera. */
  radius: 130,
  height: 90,
  /** How fast they fall and how far they drift sideways as they do. Slow, and
   *  wandering: fast straight-down snow reads as rain. */
  fall: 13,
  drift: 5,
  driftRate: 0.6,
  size: 0.75,
} as const;

/**
 * The far mountains and the sky.
 *
 * Nothing here is ever reached and nothing collides with it, so it is all one
 * merged ring drawn once, sitting outside the fog's reach.
 */
export const SKY = {
  peaks: 26,
  /**
   * How far out the ring of peaks sits.
   *
   * Inside the fog on purpose. Beyond WORLD.fogFar they would be exactly the
   * colour of the sky and there would be no mountains; at 480 they are three
   * quarters faded, which is what a real mountain twenty miles off looks like
   * and what keeps them from competing with the hill you are on.
   */
  ringRadius: 480,
  peakHeight: [110, 300] as const,
  peakWidth: [140, 300] as const,
  /** Clouds: how many, how high, and how big. */
  clouds: 22,
  cloudHeight: [190, 300] as const,
  cloudRadius: 430,
} as const;

/**
 * The bottom of the hill.
 *
 * The run ends where the mountain meets the sea, which is a real thing a real
 * penguin does: it does not stop, it shoots off the ice and goes in. The
 * finish line is a banner strung between two poles; the ice edge is a little
 * further on, and the splash is the ending.
 */
export const FINISH = {
  /** How far short of the end of the mesh the banner hangs, and where the ice
   *  gives way to water. */
  bannerAt: 90,
  edgeAt: 30,
  /** How high the water sits below the lip, and how far out it goes. */
  seaDrop: 26,
  seaSize: 1400,
  /** The flight off the edge: how much of the run-in speed carries into the
   *  air, and what pulls it down. */
  launch: 1.05,
  gravity: 60,
  /** How long the camera watches the splash before the card comes up. */
  linger: 2.6,
  /** The fireworks over the line: how often one goes off and how far either
   *  side of the middle they are thrown. The bee game's, and the whale's. */
  every: 0.22,
  spread: 40,
  /** The huddle waiting on the ice: how many, and how far off the line they
   *  stand. */
  crowd: 11,
  crowdSpread: 46,
  /**
   * And the ones already in the water, past the edge.
   *
   * Half the point of the ending is that going in is the good bit, and a sea
   * with nobody in it says the opposite — that the bird has gone somewhere
   * the others would not follow. These are what make the splash an arrival.
   */
  swimmers: 9,
  floaters: 7,
  /** How high the penguin floats once it is in, and how much it rides the
   *  swell. It surfaces rather than sinking — see splash(). */
  float: 1.4,
  bob: 0.5,
} as const;

/**
 * The sound.
 *
 * Made rather than loaded, like the other games here — this one ships as a
 * single self-contained html file, and a minute of wind as an mp3 would be
 * most of it. The wind is noise whose volume and brightness both ride on the
 * speed, which is the whole trick: going fast sounds fast.
 */
export const SOUND = {
  loopSeconds: 4,
  /** The lowpass at a standstill and flat out. Snow under a belly is a hiss,
   *  and the hiss is what opens up as you go. */
  cutoffMin: 320,
  cutoffMax: 3400,
  /** Volume at a standstill and flat out. */
  levelMin: 0.02,
  levelMax: 0.3,
  /** How fast the wind follows the speed. Lazily: a gust that switched on and
   *  off with every turn would be exhausting. */
  follow: 2.2,
  /** The speed the top of the range is measured against. */
  fullSpeed: 55,
} as const;
