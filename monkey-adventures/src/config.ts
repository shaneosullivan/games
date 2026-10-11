/**
 * Every number the game is made of.
 *
 * The same rule as the other games in this repo: a tunable lives here, named
 * and with a reason beside it, and never as a bare number at the place it is
 * used. The reasons matter more than the values — a value can be nudged by
 * anybody, but only the reason says which way to nudge it.
 *
 * Distances are in pixels of the *low-resolution* picture, not of the screen.
 * The picture is 180 pixels tall whatever the iPad is, so a monkey fourteen
 * pixels high is a monkey a thirteenth of the screen high on every device
 * there is. See `SCREEN`.
 */

/** The picture, before it is blown up to fit the glass. */
export const SCREEN = {
  /**
   * How tall the low-resolution picture is, in pixels.
   *
   * Height rather than width, because height is the thing the player's eye
   * measures the monkey against, and because a tablet and a phone differ far
   * more in width than in height. The width follows from the shape of the
   * screen, so a wide screen shows more jungle rather than a smaller monkey.
   */
  tall: 180,
  /** The widest the picture may get, for a very wide window: past this the
   *  level is further ahead than a child can usefully see. */
  widest: 400,
  /** And the narrowest, so a tall thin window still shows the vine you are
   *  swinging towards. */
  narrowest: 240,
} as const;

/** The world, and what gravity does in it. */
export const WORLD = {
  /**
   * Down, in pixels a second squared.
   *
   * Picked from the jump rather than from physics: a monkey who leaves the
   * ground at `MONKEY.jump` should be in the air a little under a second,
   * which is long enough to aim at a vine and short enough not to feel like
   * the moon.
   */
  gravity: 520,
  /** Where the ground is, as a distance down from the top of the picture. */
  floor: 150,
  /** How long the jungle is, in pixels. About a minute of swinging. */
  far: 3600,
} as const;

/**
 * Where the monkey is allowed to be.
 *
 * It may never leave the picture. Off the left of the screen it is gone and
 * the game is a jungle with nothing in it; off the top it is gone just the
 * same. A child who cannot see their monkey has lost the game in the only
 * way this game can be lost, so it simply cannot happen: the monkey is held
 * inside the view, and at the ends of the jungle — where the camera has
 * stopped and cannot follow any further — it is held inside that too.
 */
export const EDGE = {
  /** How far in from the edge of the picture the monkey is kept, in pixels.
   *  Half a monkey, so it is always wholly on screen rather than half of it
   *  hanging off the side. */
  margin: 8,
} as const;

/**
 * The lake, halfway along.
 *
 * The one place in the jungle where the floor is not a floor. Everywhere
 * else a missed vine costs you the swing and nothing more — you land, you
 * run, you try the vine again — and that is deliberate, because this is a
 * game for a child and nothing in it should hurt. The lake is the one place
 * that asks for the crossing back, and even there it asks for the crossing
 * and not the whole jungle: you go back to the near shore, not to the
 * start, because losing four minutes of swinging to one mistimed tap is how
 * a child stops playing.
 */
export const LAKE = {
  /** Where it starts and how wide it is, in pixels. Halfway along, and wide
   *  enough that it plainly cannot be jumped — it has to be swung. */
  from: 1500,
  wide: 620,
  /** How far below the floor the water sits, so there is a bank to fall
   *  down rather than a blue stripe painted on the ground. */
  deep: 16,
  /** How far back from the water the monkey is put after a splash. Enough
   *  room to get running again before the bank. */
  backBy: 70,
  /** How long the splash is watched before the monkey is put back, in
   *  seconds. Long enough to see what happened and understand it. */
  watchFor: 0.9,
} as const;

/**
 * The crocodiles in the lake.
 *
 * All menace and no teeth, on purpose. They swim about in the water with
 * their eyes above the surface, and they open and shut their jaws when the
 * monkey goes over them — which is the whole of what they do. They cannot
 * catch anybody: the lowest a swing gets over the lake is forty-odd pixels
 * above the water, measured, so there is nothing for a crocodile to reach.
 * And falling in beside one is no worse than falling in anywhere, because
 * being eaten is not a thing that happens in this game.
 *
 * That is not a fudge, it is the point. A small child wants the jungle to
 * have crocodiles in it; a small child does not want to be eaten by one.
 * The fright is free and the cost is nothing.
 */
export const CROC = {
  /** How many, spread along the lake. Few enough to swim between. */
  count: 4,
  /** How fast they swim, in pixels a second, and how far they wander from
   *  where they started before turning round. Slow, so a child can watch
   *  one and know where it will be. */
  speed: 13,
  roams: 48,
  /** How near overhead the monkey has to be before one notices, in pixels. */
  notices: 46,
  /** How quickly the jaws work once they have noticed, in radians a second,
   *  and the widest they open, in pixels of drop. Three pixels is a lot of
   *  mouth when the whole animal is five tall. */
  snaps: 5.5,
  opens: 3,
  /** How quickly the jaws shut again once nobody is overhead. */
  closes: 7,
} as const;

/** The monkey. */
export const MONKEY = {
  /** How big the sprite is, in picture pixels. */
  wide: 13,
  tall: 15,
  /** How fast it runs on the ground, and how quickly it gets there. A child
   *  pushing the stick should see the monkey move in the same frame. */
  run: 72,
  quickens: 480,
  /** Up off the ground, in pixels a second. Against `WORLD.gravity` this is
   *  about forty pixels of height — a quarter of the picture, which clears a
   *  log and reaches the lowest vines. */
  jump: 215,
  /** How much the air slows it down, per second. Barely anything: a thrown
   *  monkey should fly like a thrown thing. */
  drag: 0.12,
  /** How far from the monkey's hands a vine may be and still be caught. The
   *  monkey is thirteen pixels wide, so this is a reach rather than a
   *  magnet — but it is generous, because missing a vine you aimed at is the
   *  one thing that would make a small child put the game down. */
  reach: 12,
  /**
   * How long after letting go before a vine may be caught again, in seconds.
   *
   * Without it the monkey lets go and is immediately inside the same vine
   * again, so the tap does nothing and the vine appears to be stuck to it.
   * Long enough to get clear, short enough that two vines close together can
   * still be taken one after the other.
   */
  letGo: 0.25,
} as const;

/** Climbing a tree. */
export const CLIMB = {
  /** How fast it goes up and down a trunk, in pixels a second. Slower than
   *  running: climbing is the careful way up, and swinging is the quick one,
   *  which is what makes swinging worth learning. */
  speed: 54,
  /** How far from the middle of a trunk counts as being on it. The trunk is
   *  six pixels wide, so this is a hand's width either side of it. */
  reach: 7,
  /** Pushing off: up and out. Leaping off a trunk is how you reach a vine
   *  that no jump from the floor can get to, so it has to be worth doing —
   *  a little more up than a standing jump, and a shove sideways with it. */
  leapUp: 0.92,
  leapOut: 72,
  /** How long after leaving a trunk before one may be taken again, in
   *  seconds, so that leaping off does not immediately grab the same tree. */
  letGo: 0.3,
  /** How far below the leaves the climb stops. A monkey at the very top of a
   *  bare trunk looks like it is standing on a pole. */
  stopsBelow: 6,
} as const;

/** Swinging, which is the whole game. */
export const SWING = {
  /**
   * How much a swing loses per second, as a fraction.
   *
   * A real vine loses almost nothing and a real monkey pumps to make up the
   * rest. This one is deliberately kind: it loses little enough that a child
   * who grabs a vine and does nothing at all still swings for a long time,
   * and so never hangs motionless wondering what went wrong.
   */
  slows: 0.25,
  /**
   * How hard leaning pumps the swing, in radians a second squared.
   *
   * A monkey pumps by throwing its weight; this is that, as the one thing
   * the stick does while you are off the ground. Pushing the way you are
   * already going makes the swing bigger, which is the whole trick, and it
   * is discoverable by waggling — which is what a child does anyway.
   */
  pump: 2.6,
  /** The shortest and longest a grab may be, as a fraction of the vine. Grab
   *  it near the top and you barely swing; this keeps a catch useful
   *  wherever on the vine it happened. */
  grabLow: 0.45,
  /**
   * How far round a swing may get, in radians, and how fast.
   *
   * A rope is not a rod: past about level with where it is tied, it goes
   * slack and there is nothing left to swing on. Without saying so, pumping
   * had no ceiling at all — six pushes took the monkey round the anchor
   * twice, to seven hundred and fifty degrees, and it came off at four
   * hundred and fifty pixels a second and cleared half the jungle in one
   * go. Measured, and plainly not a swing.
   *
   * So: a little past level and no further, and a top speed with it. At the
   * cap a good swing throws the monkey about a hundred and seventy pixels,
   * which is further than the vines are apart — so a well-timed release
   * always reaches the next one, and a poor one does not.
   */
  most: 1.65,
  fastest: 3.6,
  /** How quickly a vine settles back to the breeze once it is let go. Low
   *  enough that a vine still swinging from a monkey eases down to the wind
   *  rather than snapping to it. */
  settles: 2.2,
} as const;

/**
 * The wind through the jungle.
 *
 * A vine that hangs dead still reads as scenery; a vine that moves reads as
 * something you could take hold of, which is the whole point of it. Two
 * slow waves of different speeds rather than one, so it gusts and lulls
 * instead of ticking like a metronome — one sine is a pendulum and a child
 * sees the pattern in about four seconds.
 *
 * Small, though. This is weather, not a storm: a few degrees, so the end of
 * a vine wanders by about its own width and never enough to make a vine
 * hard to aim at.
 */
export const WIND = {
  /** How far it pushes a vine over, in radians. Four degrees. */
  sways: 0.075,
  /** The two speeds it breathes at, in radians a second. Deliberately not
   *  multiples of one another, so the pair never repeats on any beat a
   *  child could count. */
  slow: 0.37,
  quick: 0.83,
  /** How much the quicker of the two contributes. The slow one is the
   *  breeze; this is the rustle on top of it. */
  rustle: 0.35,
} as const;

/** The thumb. */
export const TOUCH = {
  /**
   * Which side of the screen is the stick and which is the jump.
   *
   * The plan says a stick to move and a tap on the right to jump, which is
   * two thumbs on an iPad held in two hands. The split is by fraction of the
   * width rather than by pixels so it is the same gesture on every screen.
   */
  stickSide: 0.5,
  /** How far the thumb must travel from where it went down before the stick
   *  reads as fully over, in screen pixels. A short throw: a child's thumb
   *  does not travel far, and a long one feels like dragging. */
  throw: 46,
  /** Inside this, the stick reads as centred — so resting a thumb on the
   *  glass is not a command. */
  deadZone: 6,
} as const;

/** The jungle: what is drawn, and how much of it. */
export const JUNGLE = {
  /** How far apart the vines are, and how much that varies. Close enough
   *  that letting go at the right moment reaches the next one. */
  vineEvery: 125,
  vineVaries: 30,
  /**
   * And how far apart over the lake.
   *
   * Closer, because over the lake a missed vine costs the crossing rather
   * than a moment on the floor, and the place that punishes a mistake is
   * the wrong place to ask for the hardest swinging. The jungle gets harder
   * as it goes; the water is where it gets kinder.
   */
  vineEveryLake: 88,
  vineVariesLake: 10,
  /** How often a gap between two vines has a banana in it, and how far down
   *  the longer of the two vines it hangs. Three gaps in five, so they are
   *  a regular pleasure rather than a rare event — and low, at the height
   *  the monkey passes through at the bottom of a swing. */
  bananaOdds: 0.6,
  bananaHigh: 0.92,
  /** How close the monkey has to be to take one. Generous: a banana you
   *  swung through and did not get is just annoying. */
  bananaReach: 11,
  /**
   * How long a vine is, and how much that varies.
   *
   * Set from the jump, not picked: a standing jump lifts the monkey's hands
   * about forty-four pixels, to a hundred and ninety-three down the picture,
   * and a vine has to end near there or the game cannot be started at all —
   * the first vine would be out of reach and there would be nothing to do
   * but run along the floor. So the tips hang in a band just at the top of a
   * jump, and the longer ones are for arriving at with a swing.
   */
  vineLong: 92,
  vineVaries2: 10,
  /** Where the vines hang from: the canopy, as a distance down from the top
   *  of the picture. */
  canopy: 14,
  /** Trees behind, and how far apart. Two layers, the far one moving slower,
   *  which is the cheapest depth there is. */
  treeEvery: 90,
  farTreeEvery: 130,
  /**
   * How much slower the far things move than the near ones.
   *
   * The near trees do not move slower at all, and that is not an oversight.
   * They are the ones the monkey climbs, so they have to be exactly where
   * they are drawn: at anything but one, the trunk a child reaches for is a
   * painting of a trunk and the real one is somewhere off to the side. Only
   * the faded trees behind get a parallax, and they are the ones that
   * cannot be climbed — which is the same distinction, drawn and enforced
   * by the same number.
   */
  farParallax: 0.45,
  nearParallax: 1,
  /**
   * The dappled light through the canopy.
   *
   * The one thing the plan asks for by name. Soft warm blobs laid over
   * everything, moving slower than the jungle, so the light reads as coming
   * from somewhere above and behind rather than being painted on the trees.
   */
  dapples: 22,
  dappleParallax: 0.3,
  dappleSize: 26,
  dappleAlpha: 0.14,
} as const;

/**
 * The party at the end.
 *
 * Reaching home is the only ending this game has, so it is worth something
 * louder than a line of text: bursts of colour thrown up over the hut, a
 * few at a time, for as long as the child wants to sit and watch them.
 */
export const PARTY = {
  /** How many bits of colour in one burst, and how often a new burst goes
   *  up, in seconds. */
  bits: 26,
  every: 0.55,
  /** How fast they are thrown, in pixels a second, and how much that
   *  varies between one bit and the next. */
  speed: 95,
  varies: 55,
  /** How long a bit lasts, in seconds, and how much of that it spends
   *  fading. */
  lasts: 1.5,
  /** Gravity on the bits, as a fraction of the world's. Less than the
   *  monkey gets: confetti hangs. */
  weight: 0.45,
  /** The colours thrown. Bright against the green, and warm, which is what
   *  the plan asks of everything here. */
  colours: ["#ffd257", "#ff8a3d", "#ff5d8f", "#8fe36b", "#6cc8ff", "#fff3b0"],
  /** A splash is the same machinery in blues, thrown up out of the water. */
  splashBits: 18,
  splashColours: ["#bfe9ff", "#86cdf0", "#ffffff", "#5fb0d8"],
} as const;

/** The colours. Warm and friendly, as the plan asks: nothing in here is pure
 *  black, and the greens are yellowed rather than blued. */
export const PAINT = {
  skyHigh: "#8fd0c8",
  skyLow: "#cfe8b6",
  canopy: "#2f6b34",
  canopyLight: "#488a3f",
  farTree: "#5d8f52",
  nearTree: "#3f7a3c",
  trunk: "#7a5134",
  trunkDark: "#5e3d27",
  ground: "#6ea845",
  groundDark: "#4e7f33",
  earth: "#8a6239",
  vine: "#4f9440",
  vineDark: "#3b7030",
  dapple: "#fff3b0",
  home: "#b5793f",
  homeDark: "#8a5a2d",
  croc: "#3f7b3f",
  crocDark: "#2d5a2e",
  crocMouth: "#8c3a4a",
  water: "#4aa3c7",
  waterDark: "#2f7fa3",
  waterLight: "#8fd6ea",
} as const;

/** The fixed step the world is worked out in. The drawing interpolates
 *  between two of these, so the picture is smooth however the device is
 *  feeling. */
export const SIM = {
  step: 1 / 60,
  /** The most catching-up one frame may do, in seconds. A tab left in the
   *  background comes back to a sensible world rather than to a monkey that
   *  has been flung across the jungle. */
  most: 0.25,
} as const;
