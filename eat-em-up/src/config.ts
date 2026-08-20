/**
 * Every tunable number in Eat em up lives here, so balancing the game never
 * means hunting through the systems that use it.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Never simulate more than this much wall clock in one frame. Guards the
   *  case where a backgrounded tab comes back with a huge delta. */
  maxFrame: 0.25,
} as const;

/**
 * What you have to eat to become a butterfly, straight from
 * docs/plan-for-app.md.
 */
export const GOAL = {
  leaf: 80,
  flower: 40,
  berry: 60,
  fruit: 45,
  /** Grass isn't in the plan's list of quotas — the plan only mentions eating
   *  it — but the HUD is built out of quotas, and a child mowing a meadow
   *  needs to see it counting for something. It is deliberately the easiest
   *  one to fill: the clearing holds far more than you need. */
  grass: 120,
} as const;

export type FoodKind = keyof typeof GOAL;

export const FOOD_KINDS: ReadonlyArray<FoodKind> = [
  "leaf",
  "flower",
  "berry",
  "fruit",
  "grass",
];

/**
 * How much food is actually placed, as a multiple of the goal.
 *
 * More than you need, deliberately. If the forest held exactly 80 leaves you
 * would have to find every last one, and the final few would be a search of an
 * empty wood rather than a game. The surplus means the end is always within
 * sight of something.
 */
export const FOOD_SURPLUS = 1.35;

export const WORLD = {
  /** Radius of the forest floor you can crawl on. */
  radius: 44,
  /** The dome of sky is wider than the floor so the horizon never shows an edge. */
  skyRadius: 120,
  groundColour: 0x6fae54,
  skyColour: 0x9fd7f0,
  /** Fog keeps the far trees soft and hides where the floor stops. */
  fogNear: 34,
  fogFar: 96,
  /** How many trees ring the clearing. */
  trees: 22,
  /** Trees are kept off the middle so the start branch has room. */
  treeInnerRadius: 9,
  bushes: 26,
} as const;

/**
 * The tree you start on. The branch is low — the plan asks for "not too high
 * off the ground" — and reaches out over open floor so crawling off the end
 * drops you somewhere useful rather than into the trunk.
 */
/**
 * The meadow: one clearing in the wood, kept free of trees and bushes, filled
 * with grass tall enough for the caterpillar to disappear into.
 */
export const CLEARING = {
  /** Fixed, so it is in the same place every time you play. */
  x: -13,
  z: 18,
  radius: 10.5,
  /** Nothing woody is planted within this much of the clearing's edge. */
  margin: 3,
  /** A tuft's height. Well over the caterpillar's own even fully grown, so
   *  crawling into the meadow means disappearing into it. */
  bladeMin: 2.4,
  bladeMax: 3.6,
  /** Blades in a tuft. One blade reads as a weed; a fistful reads as grass. */
  bladesPerTuft: 10,
  /**
   * How many tufts fill the clearing.
   *
   * Kept separate from the quota on purpose: how thick the meadow looks and
   * how much of it you have to eat are different questions, and tying them
   * together would mean making the game longer every time it was made denser.
   */
  tufts: 460,
} as const;

export const START_TREE = {
  trunkRadius: 1.15,
  trunkHeight: 16,
  /** Height of the top of the branch where it leaves the trunk: a short drop
   *  for a small player. The branch tapers, so its top drops along its length —
   *  see Forest.branchTopAt. */
  branchHeight: 3.4,
  branchLength: 11,
  /** The branch is a round bough, not a plank. These are its thickness at the
   *  trunk and at the tip. */
  branchRadius: 0.62,
  branchTipRadius: 0.3,
  /** The strip along the top of it you can actually crawl on. Narrower than
   *  the bough is wide, so you stay near the crown of it and never appear to
   *  walk on thin air off the side. */
  branchWalkWidth: 0.9,
  /** Which way the branch points, radians about Y. */
  branchAngle: 0.4,
} as const;

/**
 * The small fruit-bearing branches every tree carries up its trunk.
 *
 * The lowest are in plain sight from the forest floor but well out of reach of
 * something crawling on it — which is the point. You see the fruit, and then
 * you work out that you have to climb for it, and the higher you climb the
 * more of them there are.
 */
export const TREE_BRANCH = {
  countMin: 3,
  countMax: 6,
  /**
   * Long, so the fruit at the tip cannot simply be leaned over to from the
   * trunk. You climb, step onto the branch, and edge out along it — which is
   * the challenge, and the reason these are crawlable boughs rather than
   * decoration.
   */
  lengthMin: 4,
  lengthMax: 6.5,
  /** How far the branch tilts up from horizontal, radians. */
  rise: 0.22,
  /** Thick enough to be a road rather than a tightrope: a child has to be able
   *  to crawl out along it without falling off at the first wobble. */
  baseRadius: 0.34,
  tipRadius: 0.2,
  /** The strip along the top of it you can actually crawl on. */
  walkWidth: 0.75,
  /**
   * Getting on is judged far more generously than staying on.
   *
   * Boarding used to be held to the same 0.75-wide strip you crawl along,
   * which meant lining the climb up to within a few centimetres of the
   * branch's centre line before it would take. These are the windows for
   * stepping across from the trunk: how far off the centre line you may be,
   * and how far off its height. Once you are on, you are put on the centre
   * line facing out along it, so a generous grab can't drop you off the side.
   */
  boardAcross: 1.3,
  boardHeight: 1.3,
  /** The lowest a branch is ever hung: high enough that it can't be eaten
   *  from the ground, low enough to be seen from it. */
  lowest: 2.6,
  /** How far under the tip the fruit hangs. */
  fruitDrop: 0.32,
} as const;

export const CATERPILLAR = {
  /** Body segments at the start, and once you are fully grown. */
  segmentsMin: 7,
  segmentsMax: 30,
  /** Segment radius at the start and fully grown. Fatter as well as longer:
   *  a fully fed caterpillar is three times the girth it started at, which is
   *  the whole point of eating. */
  radiusMin: 0.32,
  radiusMax: 1.2,
  /** Gap between segment centres, as a multiple of the segment radius. */
  spacing: 1.35,
  /** Crawl speed, units a second, at the start and fully grown. Growing makes
   *  you a little slower — a fat caterpillar is not a quick one. */
  speedMin: 7.2,
  speedMax: 5.8,
  /** How fast the head swings to face where it is going, radians a second. */
  turnRate: 7,
  /** Fall speed builds at this rate when you crawl off an edge. */
  gravity: 26,
  /**
   * Crawling off a branch does not drop you. You hang by your tail from the
   * lip and lower yourself, which is what a caterpillar actually does — and it
   * means a child can explore the branches without ever being punished with a
   * fall for going too far.
   */
  hangDropSpeed: 3.2,
  /** Pushing back toward the branch hauls you up again, a little faster than
   *  you went down: getting back should never feel like a chore. */
  hangClimbSpeed: 4,
  /**
   * How close the head has to get to the ground before it lets go and drops
   * the last of the way.
   *
   * Not zero, deliberately. A caterpillar with its head a few centimetres off
   * the ground lets go rather than hanging there — and the arithmetic matters
   * at the start of the game, where a new, short caterpillar hanging from the
   * tip of the opening branch reaches to about half a unit above the floor. At
   * zero tolerance the very first thing a child tries would leave them
   * dangling with no way down.
   */
  dangleLetGo: 0.9,
  /**
   * Below this much stick, the player counts as having let go.
   *
   * Hauling back onto a branch waits for it. Getting back up is done by
   * holding the stick, and on a branch the camera is side-on, so the same held
   * push means "walk across the branch" the moment you are standing on it —
   * which walked the caterpillar straight off the other side. A timed grace
   * period only moved the problem: hold the stick a little longer and off it
   * went again. Waiting for the stick to come back to rest is the only version
   * that always leaves you standing on the branch.
   */
  regainRelease: 0.15,
  /** The inchworm bounce: how far each segment rises, and how quickly the
   *  wave travels down the body. */
  humpHeight: 0.3,
  humpRate: 7.5,
  /** Phase difference between neighbouring segments, radians. Gives the body
   *  its travelling ripple instead of every segment bobbing together. */
  humpPhase: 0.9,
  /** How far behind the head the mouth reaches for food, in body radii. */
  biteReach: 2.4,
  /**
   * Trail samples kept for the body to follow.
   *
   * Fully grown the body is 30 segments at 1.35 x 1.2 units apart — some 49
   * units of caterpillar — and the trail is sampled every 0.06 units, so it
   * needs 810 of them. This leaves room to spare; too few and the tail would
   * bunch up at the oldest sample it still had.
   */
  trailLength: 1200,
} as const;

/**
 * Climbing. A caterpillar that could only crawl about the floor of a wood was
 * missing the obvious thing to do with a tree.
 */
export const CLIMB = {
  /** Up and down the trunk, units a second. Slower than crawling — climbing
   *  should feel like effort. */
  speed: 4.4,
  /** Around the trunk, radians a second. */
  aroundSpeed: 2.2,
  /** How squarely you must be heading into a trunk to take hold of it: the
   *  cosine of the angle between your direction and the trunk. Low enough that
   *  a child aiming at a tree always gets it, high enough that brushing past
   *  one on the way somewhere else does not. */
  grabDot: 0.5,
  /** And for how long, in seconds, so a glancing bump is never a climb. */
  grabDwell: 0.15,
  /** Clearance left between the top of a climb and the underside of the
   *  canopy, so climbing never puts the camera inside the leaves. */
  canopyClearance: 0.8,
  /** Climbing swaps to a lower camera looking up the trunk. Above the
   *  caterpillar the view would be inside the crown. */
  cameraDrop: 1.8,
  cameraDistance: 8.5,
  /** Never let that camera go below this, or it ends up under the floor. */
  cameraFloor: 1.6,
} as const;

/**
 * What the caterpillar does when the player stops steering.
 *
 * A model that goes completely still the instant you let go reads as a model.
 * A few degrees of looking about and a wag of the tail is the difference
 * between a toy and a creature.
 */
export const IDLE = {
  /** How long it must be still before any of this starts. */
  delay: 0.55,
  /** And how long the movements take to come in, so it is never a snap. */
  easeIn: 0.6,
  /** Looking about: how far the head turns, and how quickly. */
  lookAmount: 0.34,
  lookRate: 0.9,
  /** A slower second wave on top, so the looking isn't a metronome. */
  lookWanderRate: 0.37,
  /** The head lifts and dips a little as it looks. */
  nodAmount: 0.11,
  nodRate: 1.35,
  /** The tail wag: how far it swings, how fast, and how far up the body it
   *  starts — the back half only, so the head end stays put. */
  wagAmount: 0.16,
  wagRate: 2.4,
  wagFrom: 0.45,
  /**
   * Scratching behind its ear.
   *
   * It has no ears, of course, so what actually happens is that it tips its
   * head over and the segment just behind it lifts and jitters against it —
   * which is what a scratch looks like from the outside, and is all the
   * impression needs.
   */
  scratchEvery: 7.5,
  scratchFor: 1.5,
  /** How far the head tips over into it. */
  scratchTilt: 0.6,
  /** How high the scratching segment lifts, in body radii. */
  scratchLift: 0.75,
  /** How far it jitters sideways, and how fast. */
  scratchJitter: 0.3,
  scratchRate: 7,
  /** How many segments behind the head take part. */
  scratchSegments: 2,

  /**
   * "Well? What are you waiting for?"
   *
   * Left alone long enough, after it has been looking about and scratching for
   * a while, the caterpillar rears its front end up, turns to look straight at
   * the camera with its eyes raised, and gestures with its two front legs
   * before settling back down. It is the one idle movement that is addressed
   * to the player rather than to itself.
   */
  askDelay: 11,
  /** How often it comes round again, once it has started asking. */
  askEvery: 17,
  /** How long it holds the pose. */
  askFor: 3.6,
  /** Fraction of that spent easing into and out of the pose, so it rises and
   *  settles rather than snapping. */
  askEase: 0.22,
  /** How far the head leans over to one side, radians — the quizzical tilt. */
  askTilt: 0.3,
  /** How far the head tips back, radians — the raised eyebrows of it. */
  askPitch: 0.44,
  /**
   * How far the front of the body rears up, in radians from lying flat, and
   * how many segments come up with it.
   *
   * A rotation about the segment behind them rather than a lift applied to
   * each: lifting the head and the front segment by the same amount left the
   * head sitting behind the segment in front of it and half hidden by it,
   * whatever the numbers. Swung up to near vertical the front of the body
   * stands as a column with the head on top of it, clear of everything.
   */
  askRear: 1.4,
  askSegments: 3,
  /**
   * How far out along the reared column the head sits, in segment places.
   *
   * More than one on purpose. At one place the head cleared the segment behind
   * it by 1.07 units when it needed 1.36 — the two silhouettes still touched,
   * because a body's spacing is 1.35 radii and a head and a segment together
   * are 2.16. Stretching the neck by three quarters of a place is what puts
   * the whole head in the clear.
   */
  askHeadReach: 1.8,
  /** How far the raised legs swing, and how fast. */
  askWaggle: 0.5,
  askWaggleRate: 3.4,
  /**
   * How far the front legs come up from hanging, radians.
   *
   * Beyond a right angle on purpose. A quarter turn points them straight
   * forward, and the head is turned to the camera at the time — so forward is
   * *at* the camera, and they foreshortened into two little stubs. Past
   * vertical they read as raised arms from anywhere.
   */
  legRaise: 2.35,
  /** And how far apart they are held: splayed, not held to attention. */
  legSpread: 0.55,
} as const;

export const CAMERA = {
  fov: 52,
  near: 0.1,
  far: 220,
  /** Where the camera sits relative to the caterpillar: back and up. */
  distance: 11.5,
  height: 7,
  /** How tightly the camera's position follows, as a spring constant. Used as
   *  1 - exp(-lerp * dt), so the follow is the same at 60Hz and 120Hz. */
  lerp: 5.5,
  /**
   * Swinging round behind a turn. Taken wholesale from the bee game's camera
   * rig, numbers included, because the problem here is exactly the one it
   * solves and it was solved better there.
   *
   * The camera does not move at all until the caterpillar's heading is more
   * than `yawDeadzone` away from it, and even then it turns no faster than
   * `yawMaxRate`. Without both of those it tracks every small correction and
   * the wood swings about under the player.
   *
   * There is a second reason beyond comfort. The stick is read in the camera's
   * frame, so turning the camera turns the caterpillar's heading by the same
   * amount: the offset between them is a fixed point of that loop and no gain
   * will close it. All the follow can do while steering is widen the arc — so
   * it stays gentle, and the real re-centring happens when the stick is let go.
   */
  yawDeadzone: 0.38,
  yawGain: 1.5,
  yawMaxRate: 0.75,
  /**
   * And when nobody is touching the stick — brisker, because that feedback
   * loop only exists while the player is steering. Let go after a turn and the
   * camera comes round behind within about a second, rather than stopping
   * wherever it happened to be and leaving the caterpillar side-on.
   */
  yawIdleGain: 1.8,
  yawIdleMaxRate: 1.4,
  /** The follow is scaled by how fast the caterpillar is actually going, up to
   *  this speed: barely moving should barely move the shot. */
  yawSpeedFull: 3.5,
  /**
   * Standing on a branch, the camera swings round to look along the branch's
   * side rather than down its length.
   *
   * Behind the caterpillar on a branch means behind it along the branch, which
   * is where the trunk is — so the shot spends its time inside a tree. From
   * the side the branch runs left-to-right across the screen with nothing in
   * front of it, and because the stick is read in the camera's frame, pushing
   * left and right becomes crawling along the branch. It turns into a side-on
   * platformer for as long as you are up there, which is what it should be.
   */
  branchSideLerp: 1.9,
  /** How near the top of a bough counts as standing on it, over and above the
   *  caterpillar's own radius. */
  branchGrip: 0.4,
  /** How quickly the point the camera looks at eases toward its target. A
   *  moving subject makes an unsmoothed look target jitter. */
  lookLerp: 8,
  /** How far above the caterpillar the camera actually looks. */
  lookAhead: 1.2,
  /**
   * How much further back the camera sits once you are fully grown. A fully
   * grown caterpillar is some 49 units of body, so this is a big move: 11.5
   * units out at the start, 34 at the end.
   */
  growthPullback: 22.5,
  /**
   * And how much higher. Deliberately far less than it pulls back.
   *
   * Raising the camera in step with the distance would lift it to about 20
   * units, and the lowest foliage in the wood is at 11 — the shot would spend
   * the back half of the game inside a tree. Pulling back flattens the angle
   * instead, which shows more of a long caterpillar anyway.
   */
  heightPullback: 2.5,
} as const;

/**
 * Dissolving whatever stands between the camera and the caterpillar. See
 * render/fadeInFront.ts for how it works.
 */
export const FADE = {
  /** Depth over which a trunk goes from solid to gone. */
  band: 2.4,
  /** Below this alpha the fragment is discarded outright, so a ghost trunk
   *  can't still hide the caterpillar by writing depth. */
  cutoff: 0.06,
  /** A band just in front of the caterpillar is kept solid, so it is never
   *  seen through a hole in the tree it is climbing. */
  margin: 1.3,
} as const;

/**
 * Leaves coming down from the canopy, now and then.
 *
 * Pure scenery — they are not food. They are given autumn colours so they are
 * never mistaken for the yellow-green leaves you eat, and they shrink away
 * shortly after landing rather than collecting on the floor, for the same
 * reason: a child should never crawl across the wood to something that turns
 * out not to be edible.
 */
export const FALLING_LEAVES = {
  /** How many may be in the air at once. */
  pool: 27,
  /** Seconds between one leaf letting go and the next. */
  intervalMin: 0.35,
  intervalMax: 1.6,
  /**
   * Leaves only fall from trees this near the caterpillar.
   *
   * Without it they drop from all twenty-two trees in the wood, spread over a
   * disc 44 units across, and a count of the ones actually inside the camera's
   * frustum comes back as zero: the whole effect was invisible. Dropping them
   * near the player puts them where they will be seen.
   */
  nearPlayer: 26,
  /** They fall slowly; that is most of what makes them read as leaves. */
  fallSpeed: 1.15,
  /** How far they wander from side to side on the way down, and how quickly. */
  swayAmount: 0.75,
  swayRate: 1.1,
  /** Tumble, radians a second. */
  spinRate: 1.7,
  /**
   * A leaf's plane, in world units. The images are square, which is what lets
   * one plane geometry serve all three.
   */
  size: 1.3,
  /**
   * How much of a leaf's image counts as leaf. Cut out with alphaTest rather
   * than drawn transparent: a couple of dozen unsorted transparent quads cut
   * holes in each other wherever they overlap, and a leaf's edge is hard
   * enough that a cutout is all it needs.
   */
  alphaTest: 0.35,
  /** How long a landed leaf takes to disappear. */
  settle: 1.6,
  /** How far above the top of a climb they let go — i.e. up in the crown. */
  dropFromMin: 1,
  dropFromMax: 6,
} as const;

export const FOOD = {
  /** How close the mouth must be to swallow something. */
  biteRadius: 0.85,
  /**
   * Grass is the exception: it is eaten only where the head actually touches
   * it, as a multiple of the head's own radius, and a tuft's size does not
   * widen the bite the way a berry's does.
   *
   * Everything else can be leaned over to — a caterpillar stretching for a
   * berry is right, and the fruit at the end of a branch depends on it. A
   * meadow is different: with the general reach, crossing it cut a swath of
   * tufts the caterpillar never went near.
   */
  grassTouch: 1.25,
  /** How long an eaten item takes to shrink away, seconds. */
  vanish: 0.28,
  /** Food sways so the forest is never quite still. */
  swayRate: 1.4,
  swayAmount: 0.05,
} as const;

/**
 * The transformation. The plan says the game finishes when you turn into a
 * butterfly, so this is the whole ending: curl up, become a chrysalis, split,
 * fly away.
 */
export const ENDING = {
  curl: 1.6,
  chrysalis: 2.6,
  split: 1.9,
  /** How far through the split the shell actually gives way: the shiver builds
   *  for this fraction of it, and the burst is the rest. */
  burstAt: 0.55,
  /** How far the two halves of the shell fly, and how far they drop. */
  shellFly: 2.2,
  shellDrop: 1.4,
  flyAway: 3,
  /** How fast the butterfly climbs, and how wide it spirals on the way up. */
  riseSpeed: 2.6,
  spiralRadius: 2.4,
  spiralRate: 0.8,
  wingBeatHz: 6,

  /**
   * Free flight, once the transformation is over: the game is won, and the
   * reward is the run of the wood with no quota left to fill.
   */
  flySpeed: 11,
  /** How fast it swings onto a new heading, radians a second. Slower than the
   *  caterpillar turned — a butterfly sweeps round rather than pivoting. */
  flyTurn: 2.3,
  /**
   * The height it starts flying at, and the range the altitude slider covers.
   *
   * The floor keeps it clear of the bushes. The ceiling is far above the wood
   * — the tallest trees in the boundary ring top out around 35 — so the whole
   * forest can be flown out over and looked down on. Nothing up there can be
   * collided with, so there is no reason to stop at the treetops.
   */
  cruiseHeight: 7,
  minHeight: 2.2,
  maxHeight: 52,
  /** How fast it climbs or dives toward the height the slider is asking for.
   *  Brisk enough that the climb out over the canopy isn't a wait. */
  climbSpeed: 11,
  /** The drifting rise and fall on top of that, which is most of what makes it
   *  read as flight rather than as sliding about on glass. */
  flyBob: 0.45,
  flyBobRate: 1.1,
  /** The camera comes in close for the transformation. By then the caterpillar
   *  has curled into a ball, so the wide shot a grown one needs is only
   *  distance between the player and the one thing worth watching. */
  cameraDistance: 12,
  cameraHeight: 5.5,
  /** Roll into a turn, radians at full lock. */
  flyBank: 0.5,
} as const;
