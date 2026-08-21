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
  /** Mushrooms grow on the rocks and nowhere else, so the quota is small: it
   *  is a reason to visit every boulder in the wood, not a second meadow.
   *  Low enough that a rock wears one or two and not a crop of them — at 25
   *  every boulder in the wood was ringed with toadstools. */
  mushroom: 12,
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
  "mushroom",
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
export const FOOD_SURPLUS: Record<FoodKind, number> = {
  leaf: 1.35,
  flower: 1.35,
  berry: 1.35,
  grass: 1.35,
  /**
   * Mushrooms get more, because where they can grow is fixed.
   *
   * Everything else is scattered over the whole floor of the wood; these only
   * grow round the rocks, and there are twenty of those. The surplus is what
   * keeps the quota from depending on finding very nearly every one.
   */
  mushroom: 1.6,
  /**
   * Fruit gets more, because most of it grows where it is hardest to get.
   *
   * Two thirds of it hangs on branches, so filling the quota means climbing
   * trees and edging out along boughs. At the same surplus as everything else
   * a player who found the climbing awkward could work the whole floor of the
   * wood and still come up short.
   */
  fruit: 1.7,
};

/**
 * The least there may ever be of anything, over and above its quota.
 *
 * A floor rather than a consequence of the surplus above: whatever those
 * numbers are set to, the wood must always hold more of a thing than the game
 * asks you to eat. Otherwise it cannot be finished at all.
 */
export const FOOD_SPARE = 10;

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
  /** Mottling on the floor, so it isn't one flat sheet of green. */
  groundPatches: 90,
  /**
   * How much higher each ground patch sits than the last. The patches overlap
   * one another, and coplanar faces z-fight — one plane for all 90 hatched
   * every overlap with stripes.
   */
  groundPatchStep: 0.0015,
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
  /**
   * A tuft's height. Well over the caterpillar's own even fully grown — a
   * fully fed one stands about 1.2 — so crawling into the meadow means
   * disappearing into it entirely.
   */
  bladeMin: 3.6,
  bladeMax: 5.4,
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
   * Held to the same strip you crawl along would mean lining the climb up to
   * within a few centimetres, which nobody could do. These are the windows for
   * stepping across from the trunk: how far off the centre line you may be,
   * and how far off its height. Once you are on, you are put on the centre
   * line facing out along it, so catching it a little off still leaves you
   * standing squarely on the branch.
   *
   * They were once 1.3 apiece, which took the branch on almost wherever you
   * happened to be climbing and made getting up a tree feel like it was
   * playing itself. You have to crawl onto a branch now, not past one.
   */
  /**
   * An angle round the trunk, not a distance.
   *
   * A distance is the wrong measure: the caterpillar clings at the trunk's
   * radius plus its own, so as it grows it hangs further out, and the same
   * sideways allowance covers a smaller and smaller slice of the trunk. Held
   * to a fixed 0.5 a grown caterpillar could barely get onto a branch at all —
   * one approach in twelve, at either size. As an angle it is the same job
   * whatever size you are.
   */
  boardAngle: 0.42,
  /** A floor on it, so a slim trunk is not impossible to board from. */
  boardAcrossMin: 0.55,
  /** And how far off the branch's height you may be. Wide enough that
   *  climbing past a branch registers rather than being missed between two
   *  frames. */
  boardHeight: 0.62,
  /** The lowest a branch is ever hung: high enough that it can't be eaten
   *  from the ground, low enough to be seen from it. */
  lowest: 2.6,
  /**
   * How far short of the tip the fruit sits, on top of the bough.
   *
   * On top, not hanging under it. Hung below the tip it floated clear of the
   * branch with nothing joining the two — and worse, it put the fruit 1.2
   * units below where the caterpillar stands, which a fully grown one cannot
   * reach: every branch fruit in the wood became uneatable at exactly the
   * point you need them to finish the game.
   */
  /**
   * Where along a branch its fruit sits, as a fraction of the branch's length.
   *
   * Spread rather than all at the tip: fruit only ever at the very end made
   * every branch the same errand, and a bough with nothing on it until the
   * last step is a dull thing to crawl along.
   */
  fruitAlongMin: 0.35,
  fruitAlongMax: 0.92,
  /**
   * How near another branch has to be before the caterpillar will step across
   * to it, in units from its head.
   *
   * Short: the two have to all but touch. It is there so that where one tree's
   * branches reach into another's you can cross between them rather than
   * climbing all the way down and up again — not so you can leap gaps.
   */
  hopReach: 1.3,
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
  /**
   * How much quicker it turns while it is up on a branch.
   *
   * At the ordinary rate, turning round at crawling speed sweeps an arc about
   * a unit across, and a branch's crawlable strip is 0.9 — so trying to walk
   * back the way you came threw you off the side every time, which is why
   * there was no getting back to the trunk from out on a branch.
   */
  branchTurnBoost: 3,

  /** Fall speed builds at this rate when you crawl off an edge. */
  gravity: 26,
  /**
   * Crawling off a branch does not drop you. You hang by your tail from the
   * lip and lower yourself, which is what a caterpillar actually does — and it
   * means a child can explore the branches without ever being punished with a
   * fall for going too far.
   */
  hangDropSpeed: 3.2,
  /**
   * How much of its length it will pay out, as a fraction of its body.
   *
   * Less than all of it, so a good part of the caterpillar stays lying along
   * the branch and is plainly holding on. Paying out the lot left the very
   * last segment level with the branch and everything else below it, and
   * since the tip of a bough is thin and half buried in its leaves, that read
   * as a caterpillar hanging from nothing at all.
   */
  hangGrip: 0.85,
  /**
   * Stepping off the side of a branch on purpose.
   *
   * On a branch the stick only runs along it, which is what stops a turn
   * throwing you off — but it also means the only way down is to crawl to an
   * end. Push firmly across the branch and hold it a moment and the
   * caterpillar steps off the side and hangs instead. The dwell keeps it
   * deliberate: a wobble while running along a branch should not drop you.
   */
  sideStepPush: 0.5,
  sideStepDwell: 0.2,
  /**
   * How long it must hang before it can haul itself back up.
   *
   * Without it, stepping off the side did nothing visible: the push that took
   * you over the edge is still held on the next frame, hanging reads a held
   * stick as "climb", and with nothing paid out yet it went straight back onto
   * the branch in the same step.
   */
  hangMinTime: 0.35,
  /**
   * A cap on the wait for the stick to come back to rest after hauling onto a
   * branch. Without it, a player who simply keeps holding the stick is frozen
   * where they stand — which is exactly what being stuck on a branch feels
   * like.
   */
  regainTimeout: 0.7,
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
   * How near a bough has to come to the hanging body to be caught hold of.
   *
   * Measured from the rope the caterpillar hangs down, not from its head:
   * where two trees' branches cross, hanging off one leaves the body lying
   * against the other, and being unable to take hold of a branch that is
   * touching you is a strange thing to explain to a child. A body's width and
   * a little, so it really is a branch you are against.
   */
  /**
   * The belly: how much fatter the middle of the body is than the taper alone
   * would make it, at full size.
   *
   * Nothing at all when the caterpillar is new — a hungry one is a thin tube,
   * and the swelling middle is what a well-fed one looks like. It grows with
   * everything else, so getting fat is something that happens to the shape and
   * not only to the scale.
   *
   * It has to beat the taper to be seen, which is what this number is really
   * set against: the taper has already taken a seventh off the body by the
   * time it reaches the belly, so a bulge of a third left the middle only a
   * tenth fatter than the shoulders and the caterpillar still read as a cone.
   * At this it is a third fatter, and the middle is plainly the fattest part.
   */
  bellyBulge: 0.55,
  /** Where along the body it swells, from 0 at the head to 1 at the tail.
   *  Forward of the middle, where a caterpillar carries it. */
  bellyAt: 0.42,
  /** How much of the body the swelling covers. Wide enough to be a belly
   *  rather than one fat segment in a row of thin ones. */
  bellySpread: 0.33,
  hangGrabReach: 0.45,
  /** How far apart the body is tested along its length for one. */
  hangGrabStep: 0.5,
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
   *  caterpillar the view would be inside the crown. It keeps the same
   *  distance back as everywhere else, so taking hold of a tree does not zoom
   *  the shot in and out again. */
  cameraDrop: 1.8,
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
   * The yawn.
   *
   * Kept for a player who has really left it alone — a full fifty seconds,
   * long after the looking about, the scratching and the asking have all had
   * their turn. It looks straight at you, tips its head back and opens wide,
   * which is about as plain a "still here, then?" as a caterpillar can manage.
   */
  yawnDelay: 50,
  /** How often it comes round again once it has started. */
  yawnEvery: 26,
  /** How long one lasts, and the share of that spent opening and closing. */
  yawnFor: 2.4,
  yawnEase: 0.3,
  /** How far the head tips back into it — more than the question does. */
  yawnPitch: 0.6,
  /** How far the mouth opens, as a multiple of its resting size. */
  yawnOpen: 2.3,

  /**
   * "Well? What are you waiting for?"
   *
   * Left alone long enough, after it has been looking about and scratching for
   * a while, the caterpillar rears its front end up, turns to look straight at
   * the camera with its eyes raised, and gestures with its two front legs
   * before settling back down. It is the one idle movement that is addressed
   * to the player rather than to itself.
   */
  askDelay: 16,
  /** How often it comes round again, once it has started asking. Rare on
   *  purpose: a creature that turns and stares every few seconds stops reading
   *  as patient and starts reading as broken. */
  askEvery: 34,
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
   * A little more than one, and no more than that. Stretched to 1.8 the head
   * cleared the body handsomely and floated half a unit clear of it, which
   * reads as a head that has come off. The body's own spacing is what keeps
   * them joined, so this only borrows a fraction of it.
   */
  askHeadReach: 1.15,
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

/**
 * Cast shadows.
 *
 * One directional light casting into one map. The wood is the only thing worth
 * shadowing and the sun never moves, so a single orthographic frustum covering
 * the playable disc does the whole job.
 */
export const SHADOW = {
  /** Map size. 2048 over a 120-unit frustum is about 17 texels a unit, which
   *  holds up on a caterpillar as well as on a trunk. */
  mapSize: 2048,
  /** Half-width of the area the light covers. The playable disc is 44 across
   *  and the trees lean their shadows well past it. */
  extent: 62,
  near: 1,
  far: 150,
  /**
   * Pulls the shadow test off the surface. Without it a flat, sunlit floor
   * stripes itself with its own shadow — and normalBias is what keeps the
   * caterpillar's own round body from doing the same along its sides.
   */
  bias: -0.0004,
  normalBias: 0.03,
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

/**
 * The crow's shadow, from the notes at the end of docs/plan-for-app.md.
 *
 * Only the shadow: a dark shape that slides across the forest floor and is
 * gone. Nothing hunts you and nothing can be lost — the plan's ten seconds to
 * hide, and being snatched, are not built.
 *
 * It is a rare thing on purpose. Somewhere between twenty and sixty-five
 * minutes of play, which for most sittings means it never comes at all, and
 * for a long one means it comes once, unannounced, and is not seen again.
 */
/**
 * Boulders: the only thing on the floor you cannot simply crawl past.
 *
 * Everything else in the wood is either scenery you walk through (bushes) or
 * something you climb on purpose (trunks, boughs). A rock is in the way, and
 * going over it is the only way past — which is what makes the floor of the
 * wood somewhere to navigate rather than a flat sheet to cross.
 */
export const BOULDER = {
  count: 20,
  /** Throws at finding somewhere each one fits before giving its place up. */
  tries: 30,
  /** Across, at the ground. */
  radiusMin: 0.9,
  radiusMax: 2.4,
  /**
   * Height as a share of the width.
   *
   * Around 1, not well under it: at half the width the rocks read as grey
   * puddles lying on the grass rather than as stone standing on it. They stay
   * climbable at this height because the surface is a paraboloid, whose
   * steepest point is its rim, at a slope of twice the height over the radius
   * — about two, or sixty degrees, which is a climb and not a wall.
   */
  squashMin: 0.72,
  squashMax: 1.05,
  /**
   * How far the drawn rock is dented in from the smooth dome it is walked on,
   * as a share of its size.
   *
   * Inward only. Every dent leaves the caterpillar riding fractionally above
   * the stone, which is invisible; a bulge would put it inside the stone,
   * which is not. So the lumps are all bitten out of the rock, never added.
   */
  jitter: 0.12,
  /** Clear space kept around trees, bushes and other rocks. */
  spacing: 0.6,
  /** Which of them wear moss, and how many cushions of it. */
  mossChance: 0.6,
  mossPatchesMin: 2,
  mossPatchesMax: 5,
  /** Moss sits on the sunlit upper half, above this share of the rock's own
   *  height — never underneath it. */
  mossAbove: 0.45,
  /**
   * Where mushrooms grow on a rock, as a share of its height.
   *
   * Round the shoulders and the foot, never the crown: the crown is the path
   * over the rock, and a toadstool standing in it is one the caterpillar
   * walks straight through on its way past.
   */
  mushroomBelow: 0.55,
} as const;

/**
 * The rainbow mushrooms, and what eating one does.
 *
 * A handful of big spotted toadstools among the ordinary ones. They count for
 * the mushroom quota like any other, so they are never a trap — the whole of
 * what they do is send the caterpillar haring round the wood for a while,
 * grinning, with its eyes gone odd. Nothing in this game can hurt you, and
 * that includes this.
 */
export const MADNESS = {
  /** How many of the wood's mushrooms are the rainbow sort. */
  count: 2,
  /** How much bigger they are than an ordinary one. This is what makes them
   *  worth crawling to from across the wood. */
  scale: 2.7,
  /** Dots on the cap, and the colours they come in. */
  dots: 9,
  dotColours: [0xff4d5a, 0xffa73d, 0xffe14d, 0x5ad46b, 0x4bc6ff, 0x8f6dff],
  /** The halo round one, so it is spotted from across the wood. */
  glowColour: 0xffd9ff,
  glowSize: 2.6,
  /** Lifted to sit about the cap rather than round the foot of the stem. The
   *  cap of one of these sits about here once MADNESS.scale has been applied
   *  to it — at half this the halo hung round the stem like a puddle. */
  glowLift: 0.85,
  /** It breathes: how fast, and by how much. */
  glowRate: 1.7,
  glowSwell: 0.12,
  /** How long the fit lasts. Long enough to be an event, short enough that a
   *  child who wants their caterpillar back gets it back. */
  duration: 13,
  /** How much quicker it comes round onto a new whim. Movement is gated on
   *  facing the way you are going, so without this it wheels on the spot. */
  turn: 3,
  /** How much faster it runs and climbs while it lasts. */
  speed: 2.7,
  climbSpeed: 3.2,
  /** How long it holds one whim before taking up another. */
  whimMin: 1.1,
  whimMax: 2.6,
  /** How often it asks itself whether it is actually getting anywhere, and
   *  how far it must have gone in that time to count as progress. */
  stallAfter: 0.5,
  stallDistance: 1.6,
  /** How far off a dash across the floor is aimed. Far enough to be a run in
   *  a straight line rather than a lap of wherever it happens to stand. */
  dashMin: 12,
  dashMax: 26,
  /** How often a whim is a tree rather than a dash across the floor. */
  treeChance: 0.55,
  /** How near the trunk it has to get before it counts as arrived and starts
   *  climbing — it presses into the bark, which is how climbing begins. */
  treeGrip: 1.2,
  /** How far up it means to go, as a share of what the tree allows. */
  climbShare: 0.75,
  /** The eyes: one pupil blown wide, the other gone small. They swap over at
   *  this rate, which is what makes it read as manic rather than cross-eyed. */
  pupilBig: 1.7,
  pupilSmall: 0.55,
  pupilSwapRate: 0.9,
  /**
   * The body while the fit lasts: every colour of the rainbow, travelling
   * down it.
   *
   * The green is knocked back with the material's colour and the rainbow put
   * on with its emissive, which adds rather than multiplies — multiplying a
   * hue into green can only ever darken it, and what this wants is a body
   * lit up.
   */
  bodyDim: 0.18,
  bodyGlow: 0.95,
  /** How fast the colours run down the body, turns a second, and how far
   *  apart two neighbouring segments are on the wheel. */
  rainbowRate: 0.55,
  rainbowSpacing: 0.055,
  /**
   * The last seconds of a fit, as a countdown you can watch.
   *
   * The rainbow goes out one section at a time from the tail forward, evenly
   * over this long — so with ten sections one settles back to green every half
   * second, and the head is the last to go, at the moment the fit ends. A
   * child gets to see how much of it is left without a number to read.
   */
  fadeOut: 5,
  /** How fast the fit winds down at the end, so it stops rather than snaps. */
  easeOut: 1.2,
} as const;

export const CROW = {
  /**
   * Seconds before the first crow. Fixed rather than rolled: the first one is
   * the one that teaches you what a crow means, and a lesson that may or may
   * not arrive is no lesson.
   */
  firstGap: 2 * 60,
  /** Seconds between them after that. */
  minGap: 20 * 60,
  maxGap: 65 * 60,
  /**
   * How long you have to reach the grass once it starts circling.
   *
   * The one thing in this game that can go wrong for you. It is deliberately
   * a long ten seconds — the meadow is a fair walk from the far side of the
   * wood, and the point is the scramble, not the arithmetic of whether you
   * were near enough when it began.
   */
  warnFor: 10,
  /** How close it circles at the start of the hunt and at the end of it. It
   *  closes in, so the danger is something you can see coming. */
  circleFrom: 16,
  circleTo: 5,
  /** How fast it goes round, turns a second. */
  circleRate: 0.32,
  /**
   * How much of the meadow has to be left for it to hide you.
   *
   * Eat the whole thing and there is nowhere to get out of sight, which is
   * the one way the wood can be made dangerous by your own doing. Grass grows
   * back after five minutes, so it is never a permanent state.
   */
  hideNeedsGrass: 0.15,
  /** How long the dive takes, once it has decided it has you. */
  diveFor: 0.9,
  /**
   * How often a wait is a short one instead, and how short.
   *
   * The long gap is the point of the crow — it is meant to be rare enough that
   * seeing it feels like catching something. But at twenty minutes at the very
   * best, most sittings ended before it ever came, so the rarest thing in the
   * game was one almost nobody met. A share of the waits are early ones, which
   * means a child usually sees a crow in the first few minutes and then has no
   * idea when the next will be.
   */
  earlyChance: 0.4,
  earlyMin: 2 * 60,
  earlyMax: 3 * 60,
  /** How long one pass takes, and how far it travels in that time. */
  crossTime: 9,
  travel: 110,
  /** How big the shadow is on the ground. */
  size: 3.6,
  /** How near the caterpillar it passes, so it is actually seen. */
  nearMiss: 7,
  /** Laid just proud of the floor: coplanar with it, the two would z-fight. */
  height: 0.05,
  /** Dark, but a shadow rather than a hole. */
  opacity: 0.32,
  /** Wing beats a second. */
  beatHz: 1.5,
} as const;

export const FOOD = {
  /** How close the mouth must be to swallow something. */
  biteRadius: 0.85,
  /**
   * How far clear of a rock's footprint food on the floor is kept.
   *
   * Floor food is placed at floor height, and the one part of the floor with
   * stone standing on it is a rock's footprint — anything scattered there is
   * inside the rock, which both looks wrong and cannot be eaten.
   */
  boulderClearance: 0.4,
  /**
   * How far above or below itself it can reach, as a base plus a share of its
   * own radius.
   *
   * Scaled rather than fixed. A flat allowance is measured from the middle of
   * a caterpillar, so growing lifts it away from everything on the ground and
   * out of reach of anything it is standing over — which is how every fruit on
   * every branch became uneatable once it was fully grown.
   */
  biteHeight: 0.9,
  biteHeightPerRadius: 1.4,
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
  /**
   * How long before grass and fruit come back, in seconds.
   *
   * Five minutes: long enough that a meadow you have just cut stays cut, and
   * that coming back to it is a thing you notice rather than a thing that
   * happens under your nose. Only these two — leaves, flowers and berries
   * stay eaten, so the wood is still visibly emptied by a caterpillar working
   * through it.
   *
   * Growing back does not undo any of your counts. It puts food back in the
   * wood, not progress back on the board.
   */
  regrowAfter: 300,
  /** How long it takes to grow back once its time is up. */
  sprout: 1.4,
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
  /**
   * Making its own way to a branch before it changes.
   *
   * A caterpillar pupates hanging off something, not lying on a forest floor,
   * so when the eating is done it takes itself to the nearest tree it can
   * climb, goes up, gets out on a branch and changes there. The player has
   * nothing to do at this point but watch, so it drives itself.
   */
  seekSpeed: 1,
  /** How far out along the branch it walks before settling. */
  seekOut: 1.6,
  /** And a limit on the whole errand, after which it simply changes where it
   *  stands. Better an odd-looking ending than one that never arrives. */
  seekGiveUp: 40,
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
