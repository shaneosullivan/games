/**
 * Every tunable number in The Chase, grouped by system.
 *
 * The house rule in this repo: no magic numbers at the call site, and where a
 * number was arrived at rather than guessed, the arithmetic that produced it
 * is written down beside it.
 *
 * The unit of length is about eight centimetres. A hare is half a metre nose
 * to tail, which is why it is drawn six units long, and the wood is eighteen
 * hundred — a hundred and forty metres of running.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Longest frame the loop will believe. A tab that was in the background
   *  comes back with a huge one, and stepping it would teleport the hare
   *  through a tree. */
  maxFrame: 0.1,
} as const;

/**
 * The look of the place: a wood on a bright evening, which the plan asks to be
 * "friendly and almost magical".
 *
 * The fog is warm rather than grey and comes in close. That is doing two jobs:
 * it hides the far end of the wood, and it is what turns a field of tree
 * trunks into somewhere with a depth to it.
 */
export const WORLD = {
  skyColour: 0xcfe9d8,
  fogNear: 110,
  fogFar: 520,
} as const;

export const CAMERA = {
  fov: 64,
  near: 0.5,
  far: 1200,
  /** How far behind and above the hare the shot sits. Low and close: this is
   *  a game about speed, and speed reads off the ground going past. */
  /**
   * How far behind and above the hare the shot sits.
   *
   * Higher than the other games' chase cameras, and it has to be: this one
   * runs at ground level through a wood full of things at ground level, and a
   * low shot spends half the run with a fallen log filling the bottom third of
   * the screen. From up here the foreground is ground, and what you can see is
   * what you have to dodge.
   */
  distance: 28,
  height: 17,
  /** How far ahead of the hare the camera looks. Down the path rather than at
   *  the animal, so most of the screen is what you are about to hit. */
  lookAhead: 20,
  /** How much further back the shot pulls at full speed, and how much it drops
   *  when the hare is in the air — a jump wants to be seen from below. */
  speedPull: 9,
  airDrop: 3,
  /**
   * And how much further back it pulls as the dogs close.
   *
   * The camera sits twenty-eight units behind the hare, so anything further
   * back than that is behind the lens: measured over a whole run, the dogs
   * were on screen for almost none of it, and a chase you cannot see is a
   * number on a chip. As they come inside `chaseFrom` the shot widens to let
   * them in — which is also the moment it matters, because that is when a
   * child has to decide whether to risk the short way through the brambles.
   */
  chaseFrom: 50,
  chasePull: 0.5,
  /** How fast the eye and the look-at point chase their targets, per second. */
  easeEye: 8,
  easeLook: 6,
  /**
   * The follow, which is two problems and not one — the caterpillar's rig.
   *
   * While the player is steering, the stick is read in the camera's frame, so
   * turning the camera turns the heading by the same amount and no gain ever
   * closes the gap. All the follow can do then is stay out of the way: a dead
   * zone it will not move inside of, and a hard cap on how fast it turns.
   * The moment nobody is pushing, that loop is gone and it can come round.
   */
  yawDeadzone: 0.3,
  yawGain: 1.6,
  yawMaxRate: 1.6,
  yawIdleGain: 3,
  yawIdleMaxRate: 3.4,
} as const;

export const SHADOW = {
  mapSize: 2048,
  bias: -0.0009,
  normalBias: 0.5,
  /** The shadow box travels with the hare rather than covering the whole wood:
   *  a hundred and forty metres inside one 2048 map puts a texel at seven
   *  centimetres and every edge in the game becomes a staircase. */
  extent: 90,
  near: 1,
  far: 600,
} as const;

/**
 * The wood.
 *
 * A path that wanders through it, trees thick on both sides, and a floor with
 * a gentle roll. The trees are the walls: there is nothing invisible holding
 * you in, only a wood that gets too thick to run through.
 */
export const WOOD = {
  /**
   * How long the run is.
   *
   * The whole ground, not the whole run: the burrow stands HOME.bankAt short
   * of the far end, so there are three hundred units of wood behind it. Before
   * that the world simply stopped a few units past the hole and the last shot
   * of the game was the edge of the map.
   */
  length: 2900,
  /** Half the width of the ground that gets built. Wider than anywhere you can
   *  reach, so the world never ends in mid-air. */
  halfWidth: 190,
  /**
   * The path: how wide the clear part is, and how far it wanders.
   *
   * Two waves whose lengths do not divide into one another, so the run never
   * repeats a shape a child could learn by heart — and, more to the point, so
   * the corners do not arrive on a beat.
   */
  pathHalf: 26,
  meander: 40,
  meanderWave: 300,
  meander2: 17,
  meanderWave2: 113,
  /** How far out the wood stays runnable before the trunks close up for good.
   *  You can leave the path — cutting a corner is worth doing — but not far. */
  roamHalf: 62,
  /** Rolling ground. Layered waves rather than noise, because it has to be the
   *  same every run, and small: this is a wood floor, not a hill. */
  rollHeight: 2.2,
  rollAlong: 47,
  rollAcross: 39,
  rollHeight2: 0.9,
  rollAlong2: 19,
  rollAcross2: 23,
  /** How big a triangle the ground is made of. */
  cell: 6,
} as const;

/**
 * The hare.
 *
 * The plan sets the rules: it is always running forward, it slows down when
 * nobody is touching the screen, it is very fast, and it can jump high. So the
 * stick is a throttle as much as a tiller — hold it and you are flat out, let
 * go and you drop to a lope. There is no stop.
 */
export const HARE = {
  /**
   * How fast it goes flat out, and how fast it drops to when nobody is asking.
   *
   * The gap between the two is the whole game: the dogs run at DOGS.speed,
   * which is between them, so holding the stick pulls away and letting go
   * gives it back.
   */
  topSpeed: 62,
  /**
   * And the trot it falls back to when nobody is asking.
   *
   * Raised from twenty-six once it was measured: with the dogs at fifty-two,
   * taking your thumb off the glass at twenty-six meant being caught in three
   * seconds flat from the start of the run. Thirty buys about five, which is
   * long enough to fumble and short enough that you cannot ever stop.
   */
  lope: 30,
  /** How quickly it gets up to whatever it is asking for, and how quickly it
   *  falls back. Rising faster than it falls, so a moment's fumble on the
   *  glass does not cost the whole gap. */
  quicken: 34,
  slacken: 17,
  /** Radians a second the body swings round to face where it is going. A hare
   *  turns on a sixpence and this is meant to feel like it. */
  turnRate: 3.4,
  /** How much of that turn survives at full pelt. Even a hare cannot corner
   *  flat out, and this is what makes the fast line a wide one. */
  turnAtSpeed: 0.55,
  /** How far it leans into a turn, and how fast the lean arrives. */
  leanMax: 0.5,
  leanRate: 7,
  /** Where the body sits above the ground. */
  ride: 1.4,
} as const;

/**
 * The jump.
 *
 * "You can jump high" — so it does, twice its own length, and it goes up fast
 * enough that the jump is over before it costs you anything. A floaty jump on
 * a running animal reads as the moon.
 */
export const JUMP = {
  /** Up-speed off the ground. With `gravity` that is v²/2g high and 2v/g long
   *  — 58 and 165 give ten units of air for seven tenths of a second, which at
   *  full pelt covers forty of ground. Twice the hare's own length up, which
   *  is what "jump high" is worth without turning it into the moon. */
  speed: 58,
  gravity: 165,
  /**
   * How long after leaving the ground a second tap still does nothing, and how
   * long before landing an early tap is remembered.
   *
   * The second is the one that matters. A child taps when they see the log,
   * not when the physics is ready, and without a little memory the tap that
   * came a tenth of a second early is a tap that did nothing at all.
   */
  remember: 0.18,
  /** How much of the run-in speed a landing scrubs. Almost none: landing a
   *  jump should not be a punishment for jumping. */
  landKeep: 0.97,
} as const;

/**
 * The dogs.
 *
 * Three of them, always behind, and the gap is the whole of the tension. They
 * are drawn bouncy and daft rather than snarling — the plan asks for a wood
 * that is friendly and not scary, and a chase is only fun if the thing behind
 * you is funny.
 */
export const DOGS = {
  count: 3,
  /**
   * How big they are drawn, against the hare's own size.
   *
   * Getting on for twice, which is about right: an Irish wolfhound stands
   * taller at the shoulder than any other dog, and against a hare it should
   * look faintly ridiculous. The whole model is scaled from the ground up
   * rather than rebuilt — the group's origin is at its feet, so one number
   * moves the body, the legs and the ears together and nothing hovers.
   */
  scale: 1.7,
  /**
   * How fast they run.
   *
   * Between the hare's lope and its top speed, and that is the entire design:
   * hold the stick and you pull away, let go and they close. Nearer the top
   * than the middle, so slacking off is expensive.
   */
  /**
   * How fast they run.
   *
   * Between the hare's lope and its top speed, and much nearer the top than it
   * first was: at forty-four a clean run left them four hundred units behind
   * by the burrow, which is not a chase, it is a jog with scenery. At
   * fifty-two a clean run pulls away by ten units a second and every bump
   * hands about fifteen of them back — so a good run stays comfortably ahead
   * and a scrappy one is close all the way down.
   */
  speed: 52,
  /** How much faster they can go for a short while when they are a long way
   *  behind, so a good run never turns into a walk in the park. */
  catchUp: 1.12,
  catchUpFrom: 150,
  /** How far behind they start. */
  startGap: 120,
  /** How close one has to get to have caught you. About a body length: they
   *  have to be on top of you, not near you — and a bigger dog reaches you
   *  from a little further off, which is what `scale` costs. */
  reach: 11,
  /** How far apart they fan out, and how fast they weave. Wider as they close,
   *  so they come into the shot from the sides rather than from behind the
   *  camera where nobody can see them. */
  /**
   * How far apart they fan out, far back and close up.
   *
   * `spreadNear` was twenty-six and that was self-defeating: at twenty-six
   * units to the side of a hare twenty-four in front of the lens, a dog is
   * just outside the frame — so the closer they got, the further out of shot
   * they went. Fourteen brings them in over your shoulder, which is where
   * something chasing you belongs.
   */
  spread: 9,
  spreadNear: 14,
  weave: 0.7,
  /** How much they slow for a moment after crashing through a bush, which is
   *  what gives a hare that goes through the thick stuff its reward. */
  snag: 0.55,
  /**
   * Being caught.
   *
   * They do not pounce on the hare, they surround it: three dogs in a ring,
   * bouncing and barking, which is what dogs that have caught something they
   * were only ever playing with actually do. `ring` is how far off they stand
   * — far enough that nothing is on top of the hare — and `linger` is how long
   * you watch before the card.
   */
  ring: 17,
  linger: 2.4,
} as const;

/**
 * Everything standing in the wood.
 *
 * Counts are for the whole run. They are placed with a seeded generator, so
 * the wood is the same wood every time: a child who learns where the log is
 * should find it there tomorrow.
 */
export const PROPS = {
  seed: 20260906,
  /* Every count below is for the whole run and was scaled with WOOD.length
     when the wood got longer, so the density a child meets is unchanged. */
  /** The wood itself: thick outside the path, thin inside it. */
  trees: 900,
  /**
   * Things on the path. Logs are jumped, stones and brambles are gone round.
   *
   * Far fewer than the first go, which put something on the path every seven
   * units of it: a pilot that simply followed the middle of the path hit four
   * things in five seconds, and a course you cannot get through without being
   * stopped is not a course, it is a wall with gaps.
   */
  logs: 32,
  stones: 65,
  brambles: 72,
  /**
   * And the same things again out on the verges, either side of the path.
   *
   * The path used to be the only place anything stood, which made the wood
   * either side of it a free lane: cutting a corner cost nothing at all, and
   * a course you can go round is not a course. Out here they are a reason to
   * come back to the path rather than a wall stopping you leaving it.
   */
  vergeLogs: 44,
  vergeStones: 100,
  vergeBrambles: 116,
  /**
   * Boulders, and trees standing in the way.
   *
   * These are the two you cannot jump. With the stones and the brambles now
   * clearable, the run had nothing left in it that made you actually steer —
   * a hare could hold one line down the whole wood and hit the jump button.
   * A boulder is too big to go over and a tree is a tree, so both have to be
   * gone round, and that is what puts the dodging back.
   */
  boulders: 49,
  pathTrees: 38,
  /**
   * How far apart two things on the path have to be.
   *
   * Placed at random and nothing else, they pile up: four logs inside sixty
   * units of each other turns a path into a fence, and a child who has just
   * cleared one lands on the next. Twenty-two is a little over one jump's
   * worth of run-up, so there is always room to see a thing and do something
   * about it.
   */
  spacing: 22,
  /** Toadstools, long grass and glowing mushrooms — scenery, and the magic the
   *  plan asks for. Nothing collides with any of them: the grass in particular
   *  is there to be run straight through, which is why it is in this list and
   *  not in the one above. */
  toadstools: 375,
  grass: 1150,
  glowCaps: 130,
  /** How near the start nothing is placed, so the first seconds are a run and
   *  not a slalom, and how near the end. */
  clearStart: 70,
  clearEnd: 90,
  /** How far a thing reaches, as a fraction of what it looks like.
   *
   * Under one on purpose. A hit that lands when the shapes have not visibly
   * touched reads as the game being unfair, and a child cannot tell you that
   * is what happened — they just stop enjoying it. */
  forgive: 0.7,
} as const;

/**
 * What hitting something costs.
 *
 * There is no falling over and no losing here either. You are pulled up short
 * — most of your speed gone, still pointing where you were — and the dogs are
 * a length closer than they were. That is punishment enough, and it is the
 * only thing in this game that lets them catch you.
 */
export const BUMP = {
  /**
   * How much speed survives.
   *
   * Just over half. A third was the first go and it was far too much: dropping
   * to a third puts the hare below the dogs' own speed for over a second, and
   * measured in the running game a single bramble handed them thirty units of
   * the ninety you start with. Three careless moments and you were caught,
   * which is not a chase, it is a tax.
   */
  keep: 0.55,
  /** How far clear of the thing the hare is put, so it cannot bump the same
   *  stone twice in consecutive steps. */
  clear: 0.5,
  /** How long before anything can catch it again, and how long it stumbles.
   *  Cosmetic, the stumble: the steering never stops working. */
  rest: 0.45,
  stumble: 0.4,
} as const;

/**
 * Dissolving whatever stands between the camera and the hare.
 *
 * The same machinery the caterpillar uses, from shared/fadeInFront.ts, and
 * here for the same reason — more so, in fact. This wood is six hundred trees
 * thick and the shot sits low behind a running animal: without it the one
 * thing you are steering spends half the run behind a trunk, and a player who
 * cannot see themselves is simply stuck.
 */
export const FADE = {
  /** How much room to clear around the hare, at the hare's own distance. Only
   *  what falls inside the cone from the eye to a disc this wide fades; depth
   *  alone would dissolve every tree nearer than the hare whether or not it
   *  hid anything. */
  radius: 4.5,
  /** Depth over which a trunk goes from solid to gone. */
  band: 4.5,
  /** Below this alpha the fragment is discarded outright, so a ghost trunk
   *  cannot still hide the hare by writing depth. */
  cutoff: 0.06,
  /** A band just in front of the hare is kept solid, so it is never seen
   *  through a hole in the tree it is passing. */
  margin: 2.6,
} as const;

/**
 * The magic in the wood: fireflies, and shafts of light through the leaves.
 *
 * Both are cheap and both are doing the same job, which is to make a wood full
 * of brown trunks somewhere a child wants to be.
 */
export const GLOW = {
  /** How many motes drift about the hare, in a box that travels with it. */
  flies: 220,
  radius: 70,
  height: 26,
  /** How fast they wander and how far they bob. */
  drift: 3.4,
  bob: 1.5,
  bobRate: 1.1,
  size: 1.15,
  /**
   * The light coming down through the canopy.
   *
   * How far apart they are, how wide and how tall, how far off the path they
   * are scattered, and how bright.
   *
   * All four were badly wrong to begin with. One every fifteen units, five
   * wide and seventy tall, is not a shaft of light through leaves — it is a
   * white spike, and a hundred and twenty of them overlapping down one line of
   * sight is a picket fence in the sky. Wide, short, far apart and very faint
   * is what actually reads as sun coming through a gap.
   */
  shaftEvery: 80,
  shaftRadius: 9,
  shaftHeight: 62,
  shaftSpread: 120,
  shaftOpacity: 0.035,
} as const;

/**
 * Home.
 *
 * The run ends at the warren in the bank at the far end of the wood, with the
 * rest of the hares out in front of it. You do not have to do anything clever
 * to finish — you have to get there.
 */
export const HOME = {
  /** How far short of the end of the ground the burrow sits. Everything past
   *  it is wood you never reach and only ever see over the mound. */
  bankAt: 360,
  /**
   * The hole in the ground: how wide across, and how deep the throat goes.
   *
   * Big for a hare — three body-widths across — because it is the thing a
   * child has to aim at while being chased, and a realistic burrow at this
   * speed would be a keyhole.
   *
   * It used to be a doorway in the face of a bank across the end of the wood,
   * which was a lot of scenery for one hole and shut the wood off behind it. A
   * hole in the ground with a little heap of earth behind it is what a burrow
   * actually is, and the wood carries on past it.
   */
  holeWidth: 12,
  holeDepth: 12,
  /**
   * The patch of bare earth round it, which is a separate number on purpose.
   *
   * A small hole is harder to see, so what makes it easy to spot is not its
   * own size but the ring round it: a wide light-earth apron on green grass is
   * visible the length of the wood, and the black hole in the middle of it is
   * then unmistakable at any size. Tying the apron to the hole meant shrinking
   * one shrank the other and the whole thing disappeared.
   */
  apron: 21,
  /** The heap of earth behind it: how big, and how far back it sits. */
  moundWide: 14,
  moundHigh: 10,
  moundBack: 21,
  /** The others waiting: how many and how far either side. */
  crowd: 9,
  crowdSpread: 40,
  /**
   * How long the camera watches before the card comes up.
   *
   * Long enough for the whole scene: the others turn and bolt for the hole,
   * the dogs come pelting up and run rings round it, and then they give it up
   * and trot off into the wood. Two and a half seconds was time for the
   * fireworks and nothing else.
   */
  linger: 6,
  /** How long the others take to notice, and how fast they run for the hole.
   *  Staggered, so they go in one after another rather than as a block. */
  boltAfter: 0.35,
  boltSpeed: 34,
  /** How long the dogs spend circling before they give up, and how far out
   *  they run round it. */
  circleFor: 3.2,
  circleAt: 34,
  /** And how fast they trot away afterwards. */
  leaveSpeed: 26,
  /** The fireworks over it: how often one goes off and how far either side. */
  every: 0.2,
  spread: 30,
} as const;

/**
 * The sound.
 *
 * Made rather than loaded, like the other games here — this one ships as a
 * single self-contained html file, and a minute of woodland as an mp3 would be
 * most of it.
 */
export const SOUND = {
  loopSeconds: 4,
  /** The wind in the leaves: the lowpass and the volume at a standstill and
   *  flat out. Running fast through a wood is mostly the sound of leaves. */
  cutoffMin: 340,
  cutoffMax: 2400,
  levelMin: 0.014,
  levelMax: 0.12,
  follow: 2.4,
  /** The speed the top of that range is measured against. */
  fullSpeed: 62,
  /** The barking: how often, and how much louder it gets as they close. The
   *  dogs are behind the camera most of the time, so this is the main way you
   *  know how they are doing. */
  barkEvery: 1.1,
  barkNear: 0.3,
  barkFar: 0.06,
  /** The gap at which the barking is at its loudest and its quietest. */
  barkFrom: 20,
  barkTo: 170,
} as const;
