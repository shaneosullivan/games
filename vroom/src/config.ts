/**
 * Every tunable number in Vroom, grouped by system.
 *
 * The house rule in this repo: no magic numbers at the call site, and where a
 * number was arrived at rather than guessed, the arithmetic that produced it
 * is written down beside it.
 *
 * The unit of length is a quarter of a metre. A race car is four metres long,
 * which is why it is drawn sixteen units, and a lap is about a kilometre.
 */

export const SIM = {
  /** Fixed simulation step. The render interpolates between steps. */
  step: 1 / 60,
  /** Longest frame the loop will believe. A tab that was in the background
   *  comes back with a huge one, and stepping it would teleport the car
   *  through the barriers. */
  maxFrame: 0.1,
} as const;

/**
 * The look.
 *
 * The plan asks for the Amiga game by name and points at pictures of it: seen
 * from straight above, flat colours, cars as sprites, a kerbed track with
 * scenery either side. So there is no perspective and no lighting anywhere in
 * this game — an orthographic camera looking down and unlit materials, which
 * between them are exactly what a 2D game made of sprites is.
 *
 * Every colour lives in ENVIRONMENTS below rather than in one global palette,
 * because a track carries its world with it.
 */

/**
 * The three worlds a track can be set in.
 *
 * The plan for the track builder asks for green hills, a desert and a
 * futuristic city with lots of neon, so a palette is a whole environment:
 * every colour in the game comes out of one of these, and nothing anywhere
 * else reaches for a colour of its own. Swapping the palette swaps the world.
 *
 * `ground` is the scene background rather than a mesh — the world is
 * unbounded and there is nothing to be gained by drawing a floor the size of a
 * county — so it is the one colour that reaches the screen untouched.
 */
export const ENVIRONMENTS = {
  hills: {
    name: "Green hills",
    ground: 0x4f9a44,
    tarmac: 0x6b6d76,
    tarmacDark: 0x5c5e66,
    /** The two colours of the kerb, alternating. */
    kerbA: 0xd6473c,
    kerbB: 0xf2efe6,
    /** The run-off band inside the barrier. */
    sand: 0xd8c48b,
    line: 0xf2efe6,
    /** The scenery: two shades of the tall thing, its stem, and a stack. */
    treeA: 0x2f6b34,
    treeB: 0x3b7d3c,
    trunk: 0x4a3524,
    tyre: 0x1f1f23,
    crowd: [0xe0b13c, 0x3f7fd6, 0xd6473c, 0xf2efe6, 0x49b45a],
    /** What grows here. Each environment plants something different. */
    flora: "broadleaf",
    centreLine: false,
    /** The sky, and the haze where it meets the ground. Only ever seen from
     *  down on the grid — the racing camera never looks that far up. */
    /* Deeper than it looks, on purpose: the tone curve takes a good deal of
       the colour out of anything this bright, and a sky picked to look right
       as a hex comes out of the camera as grey. */
    sky: 0x3f95d6,
    haze: 0xc3dbe8,
  },
  desert: {
    name: "Desert",
    ground: 0xd9b072,
    tarmac: 0x8a8577,
    tarmacDark: 0x767162,
    kerbA: 0xc9502f,
    kerbB: 0xf6efdd,
    sand: 0xe6cd9c,
    line: 0xf6efdd,
    /* Cactus green and a paler scrub, on sand rather than grass. */
    treeA: 0x4c7a3f,
    treeB: 0x7f9153,
    trunk: 0x6b5334,
    tyre: 0x2a2622,
    crowd: [0xe8d16a, 0xd0663c, 0xf6efdd, 0x8fb07a, 0xb44a3a],
    flora: "cactus",
    centreLine: false,
    sky: 0x4f9ecd,
    haze: 0xe8d3a4,
  },
  neon: {
    name: "Neon city",
    /* Near-black, because everything else in this palette is a light. A neon
       city that is not dark is just a bright city. */
    ground: 0x141024,
    tarmac: 0x2b2740,
    tarmacDark: 0x211d33,
    kerbA: 0xff2d95,
    kerbB: 0x2de2ff,
    sand: 0x3a2f5c,
    line: 0xf4eaff,
    treeA: 0x7b3cff,
    treeB: 0x2de2ff,
    trunk: 0xff2d95,
    tyre: 0x0d0a18,
    /* Pink and cyan are the colours everybody reaches for and a city of only
       those two reads as a single sign repeated. The green and the yellow are
       what make it a street with different shops on it. */
    crowd: [0xff2d95, 0x2de2ff, 0x3dff8f, 0xffe93d, 0x7b3cff, 0xd8ff4a],
    flora: "palm",
    /** A dashed line down the middle of the road. Only the city has one — it
     *  is a street as much as a circuit. */
    centreLine: true,
    /* Night. The haze is the city's own glow on the underside of the cloud,
       which is what a city looks like from outside it after dark. */
    sky: 0x0a0716,
    haze: 0x3c1d52,
  },
} as const;

export type Environment = keyof typeof ENVIRONMENTS;

export type Palette = (typeof ENVIRONMENTS)[Environment];

export const CAMERA = {
  /**
   * The shot: behind the car, above it, looking down at a diagonal.
   *
   * `back` and `up` are a fixed offset in world axes — not behind the *car*,
   * behind it on the *screen*. The camera's heading never changes, and that is
   * load-bearing rather than lazy: the controls are "push the way you want to
   * go", which only means anything while the picture holds still. A shot that
   * swung round with the car would make the stick mean something different
   * every second.
   *
   * The angle is atan(up / back), and with the two equal that is 45 degrees
   * exactly — steep enough to see a corner coming, shallow enough that the
   * cars have a side to them.
   */
  back: 150,
  up: 150,
  /** How wide the lens is. Narrow, because a wide one bends a straight road
   *  into a fan at the edges of the screen. */
  fov: 42,
  /** How fast the shot chases the car, per second. Frame-rate independent
   *  easing, so this is a rate and not a fraction. */
  ease: 6,
  /**
   * How far ahead of the car the shot leads, at full speed.
   *
   * Straight down the car's own heading rather than its velocity: leading on
   * the velocity means a sideways slide swings the whole picture, and this is
   * a game about sideways slides.
   */
  lead: 52,
  /**
   * How much room the near-fade clears around the car.
   *
   * Anything standing between the eye and a disc this wide about the car
   * dissolves. Wide enough to clear the whole car and a little around it, and
   * no wider — a generous radius takes out half the trees on the inside of
   * every corner.
   */
  clear: 16,
  /** Where the fog starts and ends. It hides the far edge of a world that has
   *  no edge, and gives the road somewhere to go. */
  fogFrom: 420,
  fogTo: 1150,
} as const;

/**
 * The street lights, and the pool of real lights that follows the car.
 *
 * A city has a hundred things giving off light and WebGL does not want a
 * hundred lights. So everything that glows is drawn as emissive geometry —
 * which the bloom pass turns into a glow for free and costs nothing — and a
 * small pool of *real* lights is moved to whichever emitters are nearest the
 * car each frame. What lights the road is always the lamp you are under, which
 * is the only one you could tell the difference about.
 */
export const LAMP = {
  /** How far apart they stand along the road, and how far off the kerb. */
  every: 95,
  from: 14,
  /** How tall the post is, and how far the arm reaches over the road. */
  height: 42,
  reach: 16,
  /** The colour of the light and how hard it is driven. Sodium, because a
   *  white street light in a neon city competes with the signs. */
  colour: 0xffc98a,
  power: 4400,
  bulb: 3.4,
  /** How far the light carries. Short enough that two lamps do not add up
   *  into daylight. */
  falls: 240,
} as const;

/** How many real lights follow the car. Eight is plenty — anything further
 *  away than the eighth nearest is not lighting anything you can see. */
export const GLOW = {
  lights: 10,
  /** How often the pool works out what is nearest, in seconds. A car covers
   *  two units in a frame and the lamps are ninety apart, so doing it every
   *  frame would be ninety-nine per cent the same answer. */
  every: 0.12,
} as const;

/**
 * The grandstands, and the crowd in them.
 *
 * They go at the start line, which is the one place on a circuit a crowd
 * actually gathers and the one place the player is guaranteed to look — it is
 * where the race begins and where it ends.
 */
export const STAND = {
  /** Two of them, one each side of the road at the line. Far enough out that
   *  they frame the straight rather than leaning over it. */
  from: 124,
  /** How big one is: rows deep, and how much each row rises and steps back. */
  rows: 7,
  /** How thick each tier is, and how deep. Chunky on purpose: a thin slab
   *  reads as scaffolding, and a grandstand is concrete. */
  rise: 4.8,
  tread: 6.4,
  width: 130,
  headroom: 13,
  /**
   * How tall a spectator is, and how many are in a stand.
   *
   * Sized off the driver rather than picked: their head comes out the same
   * size as a helmet, so the crowd and the person in the car are plainly the
   * same kind of creature. That is also what makes the stand read as stairs
   * with people on it — a step is a good deal shorter than they are, so every
   * row shows above the one in front.
   */
  person: 4,
  perStand: 280,
  /**
   * The celebration.
   *
   * They jump when the player finishes anywhere but last. Coming fourth of
   * four to an ovation would be worse than no crowd at all — a child knows
   * perfectly well when they have been beaten, and being cheered for it is
   * how a game starts feeling like it is humouring you.
   */
  jumpFor: 6,
  jumpHeight: 3.4,
  jumpRate: 7,
  /** The confetti over the line when the flag falls. */
  /**
   * The confetti over the line.
   *
   * Small and plentiful. It was set while the only camera that ever saw it was
   * a hundred and fifty units up, where a piece twenty units across looks like
   * a piece of paper; the finish now comes down in front of the car, where the
   * same piece is bigger than the car. Paper is paper: about a foot across,
   * and a lot of it.
   */
  confetti: 460,
  confettiSpeed: 30,
  confettiLift: 44,
  confettiFall: 38,
  confettiLasts: 4,
  confettiSize: 2.4,
  /**
   * The desert gets fire instead.
   *
   * Paper falling out of a clear desert sky is a town's idea of a party. What
   * a desert circuit does at the flag is throw flame off the gantry, and it is
   * the better ending anyway: the confetti drifts down behind you, and this
   * goes up in front of you while you are still braking.
   *
   * Fire rises, so the gravity is negative — the flames accelerate upward
   * rather than falling back — and it is thrown in bursts over a second and a
   * half rather than all at once, because one puff is an explosion and a
   * handful in a row is a fire.
   */
  flame: [0xffd24a, 0xff9a2e, 0xf2542d, 0xd8341f],
  flameCount: 55,
  flameSpeed: 9,
  flameLift: 46,
  /** Negative: it climbs. */
  flameRise: -26,
  flameLasts: 1.15,
  flameSize: 2.5,
  /** How long the fire burns, how often it is fed, and how far apart the two
   *  columns of it stand either side of the line. */
  flameFor: 1.6,
  flameEvery: 0.16,
  flameApart: 30,
  flameFrom: 2,
} as const;

/**
 * When there is room for two things side by side.
 *
 * Above this width the track list and the garage share the screen, which is
 * every iPad either way up and every laptop. Below it — a phone held upright —
 * there is only room for one thing at a time, so the garage goes behind a
 * button instead.
 */
export const LAYOUT = {
  wide: 700,
} as const;

/**
 * Steering by touch: a floating thumbstick, planted wherever the finger lands.
 *
 * The penguin game's control, and deliberately the same one — a child moving
 * between two games in the same gallery should not have to learn the stick
 * twice.
 *
 * It was an absolute aim for a while: touch a point and the car drives to it.
 * That reads well and drives badly. Touching behind the car is an instruction
 * to go that way, so the car braked, turned round and drove back — every
 * stray touch on the wrong half of the glass was a U-turn, and a control you
 * can trigger by brushing is not a control.
 *
 * Either way it works because the camera never turns: screen right is world
 * +X and screen down is world +Z at every moment of the game, so the way the
 * stick is pushed is the way on the road the car goes, with no arithmetic.
 */
export const STICK = {
  /**
   * How far the knob travels from where the finger landed, in screen pixels,
   * and how much of that is nothing at all.
   *
   * The penguin game's numbers, and this is the penguin game's stick — the
   * same control in two games should feel the same in both, and a child moving
   * between them should not have to learn it twice.
   */
  radius: 68,
  deadzone: 0.08,
} as const;

/**
 * Getting a race ready before anybody drives it.
 *
 * Shaders compile the first time a material is drawn and geometry goes to the
 * card on its first frame, so the opening seconds of a race were always the
 * slowest of it — which is exactly when a child is trying to take the first
 * corner. All of it is done behind the waiting card now.
 */
export const LOADING = {
  /** How many frames to draw before letting anybody see it. Three: one to
   *  upload everything, and two to be sure nothing was left until the second. */
  warmFrames: 3,
  /** The least time the card stays up, in seconds. A card that flashes past in
   *  eighty milliseconds on a fast machine reads as a glitch; a moment of
   *  "getting ready" reads as the game getting ready. */
  atLeast: 0.7,
} as const;

/**
 * How much the renderer is allowed to spend, and how it gives it up.
 *
 * The neon city is far heavier than the other two — a dozen dynamic lights, a
 * skyline, a bloom pass with a great deal to bloom — and an older iPad cannot
 * hold sixty frames a second through it. Rather than cut the level down for
 * everybody, the game watches its own frame rate and steps down a tier when it
 * cannot keep up, then remembers that for the machine it is on.
 *
 * The tiers scale the four things that actually cost anything on a tile-based
 * mobile GPU, in the order they cost it:
 *
 *  - **How many pixels are drawn.** A retina iPad at a device ratio of two is
 *    four times the fragments of one at one. This is the biggest single lever
 *    there is and it is first for that reason.
 *  - **The bloom pass**, which is five more full-screen passes of blur and is
 *    bandwidth these machines do not have.
 *  - **Dynamic lights.** Every point light is another iteration inside every
 *    fragment of every lit surface, whether or not it reaches it.
 *  - **Shadows**, which are a second render of the scene plus a filtered
 *    lookup per fragment.
 *
 * It only ever goes down. A game that noticed it was running well and turned
 * the quality back up would spend the whole race hunting between two settings,
 * and the hunting is more distracting than the lower setting ever was.
 */
export const QUALITY = {
  /** Below this many frames a second, for `patience` windows running, the game
   *  gives one more thing up. Forty-five rather than sixty: a steady
   *  forty-eight is fine to drive, and every concession costs something. */
  floor: 45,
  /** How long a window is, in seconds, and how many bad ones in a row it
   *  takes. Two, so one stutter — a collection, a texture upload — cannot cost
   *  a machine its quality for good. */
  window: 2,
  patience: 2,
  /** How long after the flag before it starts counting. The first seconds of a
   *  race used to be the slowest and least representative; they are spent
   *  behind the loading card now, and this is belt and braces. */
  warmup: 3,

  /** What everything starts at, before anything has been given up. */
  full: {
    pixels: 2,
    bloom: true,
    lights: 10,
    shadows: true,
    shadowMap: 2048,
    scenery: 1,
  },

  /**
   * The concessions, in the order they are made.
   *
   * One at a time rather than in tiers, and ordered by what each buys against
   * what it costs to look at. Three coarse tiers meant a machine a few frames
   * short of smooth lost its shadows, its bloom and a third of its scenery all
   * at once, when turning the resolution down a notch would have done — and a
   * machine that needed rather more got no say in which half it kept.
   *
   * The order is the whole design, so the reasoning is written down:
   *
   *  1. **Resolution first.** On a retina screen a device ratio of two is
   *     already past what an eye resolves at arm's length, and fragments are
   *     what a mobile GPU runs out of before anything else. Dropping to 1.5
   *     cuts the pixels drawn by nearly half and costs a little edge
   *     sharpness. Nothing else comes close on that trade.
   *  2. **Shadow resolution.** A quarter of the texels for a slightly softer
   *     edge on a shadow nobody is looking directly at.
   *  3. **Distant lights.** The tenth-nearest street lamp lights almost
   *     nothing you can see, and every light is another iteration inside every
   *     fragment of every lit surface.
   *  4. **Bloom.** Five full-screen blurs, which is real money on a tile-based
   *     GPU — but it is also the neon city's whole look, so it goes after the
   *     three things nobody would notice and before the two they would.
   *  5. **Resolution again**, harder.
   *  6. **Shadows entirely.** Cars start to look pasted onto the road.
   *  7. **Scenery**, which changes the world rather than the picture of it,
   *     and cannot take effect until the next race.
   */
  ladder: [
    {name: "sharpness", pixels: 1.5},
    {name: "shadow detail", shadowMap: 1024},
    {name: "distant lights", lights: 6},
    {name: "glow", bloom: false},
    {name: "more sharpness", pixels: 1.2},
    {name: "shadows", shadows: false},
    {name: "scenery", scenery: 0.6},
    {name: "most sharpness", pixels: 1},
    {name: "most scenery", scenery: 0.4},
  ] as ReadonlyArray<{
    name: string;
    pixels?: number;
    bloom?: boolean;
    lights?: number;
    shadows?: boolean;
    shadowMap?: number;
    scenery?: number;
  }>,
} as const;

export type Settings = typeof QUALITY.full;

/**
 * The map in the corner.
 *
 * The racing camera sees about a fifth of a lap, so without this there is no
 * telling whether the next corner is the hairpin or the sweeper, nor whether
 * the car being chased is a second ahead or most of a lap — which between them
 * are the whole of what a race is.
 */
export const MAP = {
  /** How big it is on the glass, in CSS pixels. */
  size: 104,
  /** How much room to leave round the circuit inside that. */
  pad: 12,
  /** How wide the road is drawn, and how big the dots are. The player's is
   *  bigger, because on a map this size the dot that matters has to win. */
  road: 5,
  dot: 3.4,
  you: 4.6,
  /** How many points the circuit is drawn from. Enough for a hairpin to be a
   *  hairpin; it is sampled once and never again. */
  samples: 160,
} as const;

/**
 * The start of a race.
 *
 * The cars are looked at head-on from in front of the grid while the lights
 * count down, and the shot pulls back into the racing position on the last
 * beat — so the countdown ends with the camera already where it needs to be
 * and the child already looking down the road.
 */
export const START = {
  /** Where the camera stands: how far ahead of the player's car, how high, and
   *  how far ahead of the player it looks. The whole grid is between those two
   *  points, which is what puts four cars in the shot rather than one. */
  ahead: 128,
  height: 15,
  aim: 45,
  /** A second a beat: three, two, one, go. */
  beat: 1,
  /**
   * When the camera starts moving, and how long it takes.
   *
   * It leaves before "one" rather than on "go" — the pull-back is what tells a
   * child the race is about to start, and it has to be finished by the time it
   * does. Arriving with the flag would mean the first corner is taken by
   * somebody who is still watching the camera.
   */
  pullsAt: 1.7,
  pullsFor: 1.3,
  /** How long "Go!" stays up after the flag. */
  goFor: 0.7,
  /**
   * The finish, which is the start run backwards.
   *
   * The shot comes back down in front of the car and looks at it, and the card
   * waits until it has — otherwise the confetti goes off behind a full-screen
   * panel and the one moment the race was building towards is spent looking at
   * a button.
   */
  endsFor: 1.5,
  cardAfter: 2.6,
} as const;

/**
 * The light.
 *
 * There was none at all until the view went diagonal: a camera looking
 * straight down at flat colour has nothing to shade. Now that things have
 * sides, the sides have to be darker than the tops or the whole scene reads as
 * a pattern on the floor again.
 *
 * Ambient does most of it, on purpose. The ground and the road are flat and
 * face straight up, so they take the full amount and look exactly as they did
 * before; only the upright faces lose anything, which is precisely where the
 * shape wants to show.
 *
 * These are fractions of full brightness, not three's own units — the stage
 * multiplies by pi on the way in. See the note there.
 */
/**
 * The look of the picture itself, after the scene has been drawn.
 *
 * Tone mapping and bloom are what separate this from a diagram. The renderer
 * works in a range far wider than a screen can show, and the tone map is how
 * that range is fitted onto one — ACES is the film industry's curve and it is
 * why bright things roll off into colour instead of clipping to white. Bloom
 * gathers whatever is left above the top of the range and spills it, which is
 * the halo round a neon tube and the flare off a wing in the sun.
 */
export const FILM = {
  /** How much light reaches the sensor. */
  exposure: 0.95,
  /**
   * How much of the environment the materials gather.
   *
   * Turned well down. The generated environment is a bright room, and at 0.9
   * it was pouring white into every surface from every direction at once —
   * which is what a washed-out, desaturated picture actually is. Enough to
   * give metal something to reflect, not enough to be the lighting.
   */
  envIntensity: 0.45,
  /**
   * Bloom: how strong, how wide, and how bright a thing has to be to bloom.
   *
   * The threshold is the number that matters and it has to be well clear of
   * one. Bloom reads the linear buffer, *before* the tone curve, and a plainly
   * lit white kerb in sun already sits above 1 there — so at 1.05 the entire
   * picture glowed and the road came out as fog. Only the emissive things go
   * past two, which is exactly the neon and the brake lights, which is the
   * whole point of having it.
   */
  bloom: 0.85,
  bloomRadius: 0.55,
  bloomThreshold: 2.0,
  /** Shadow map size. Big enough that a car's own shadow has an edge. */
  shadow: 2048,
  /** How far around the car shadows are cast. Everything past this is lit but
   *  casts nothing, which nobody notices and which keeps the map sharp. */
  shadowReach: 320,
} as const;

export const LIGHT = {
  /**
   * Almost no ambient, now that there is an environment map.
   *
   * This used to be nearly all of the light, because there was nothing else:
   * a flat-shaded scene with one directional light needs a high floor or half
   * of it goes black. A physically based one does not — the environment map
   * *is* the ambient, and it is a far better one, because it comes from
   * different directions with different colours in it. Left at the old 0.78
   * the two together washed the whole picture out: pale grass, pale trees, no
   * shadows to speak of.
   */
  ambient: 0.05,
  /** The sun, and it is a real one now: it casts the shadows. Strong, because
   *  the contrast between lit and shaded is most of what makes a scene look
   *  like it is somewhere rather than nowhere. */
  sun: 1.05,
  /** Which way the sun is. Off to one side rather than straight down, or every
   *  vertical face in the game would be the same shade as every other. */
  /**
   * Which way the sun is.
   *
   * Low, and that is the whole point of it. It was nearly straight overhead,
   * which put every shadow directly underneath the thing casting it — where,
   * from a camera looking down at forty-five degrees, the thing itself hides
   * it. A low sun throws a shadow sideways where it can be seen, and a
   * visible shadow is most of what puts a car on the road rather than above
   * it.
   */
  from: {x: 0.62, y: 0.72, z: 0.34},
  /** A weaker light from roughly the other side, so the shadowed side of a
   *  thing is dark rather than black. */
  fill: 0.12,
  fillFrom: {x: -0.5, y: 0.35, z: -0.4},
} as const;

/** How tall the solid things stand. Nothing is tall: this is a game seen from
 *  a steep angle, and a tree the height of a real one is a green wall across
 *  the corner behind it. */
export const HEIGHT = {
  car: 5.5,
  cockpit: 2.4,
  wheel: 3,
  tyreStack: 9,
  wall: 12,
  trunk: 9,
  crown: 16,
} as const;

/**
 * The circuit.
 *
 * A closed loop through a handful of control points, smoothed into a curve.
 * Everything else asks the curve: the tarmac is a ribbon sampled along it, the
 * kerbs are two more, the rivals drive it, and how far round the lap you are
 * is your position along it.
 */
export const TRACK = {
  /**
   * Half the width of the tarmac, and how much grass there is either side
   * before the barrier.
   *
   * Seventy-six units across is about ten car widths — wide enough that a
   * child has room to get a corner wrong and narrow enough to be a road. At
   * forty-six a side it was a motorway.
   *
   * The plan asks for grass you can go on "but no farther", so the grass is a
   * real place with a real edge, and that edge is the wall.
   */
  half: 38,
  grass: 34,
  /** How many points the ribbon is built from. One every few metres: enough
   *  that a corner is a curve rather than a polygon. */
  segments: 900,
  /**
   * The corners.
   *
   * Hand-placed rather than generated. A circuit is the one thing in a racing
   * game that is worth laying out by hand — it wants a long straight to build
   * up on, a hairpin to be slow in, and a couple of sweepers you can hold the
   * throttle through, and no amount of noise gives you that.
   */
  shape: [
    {x: 0, z: -520},
    {x: 300, z: -470},
    {x: 470, z: -250},
    {x: 430, z: 20},
    {x: 560, z: 210},
    {x: 470, z: 430},
    {x: 200, z: 470},
    {x: 60, z: 330},
    {x: -110, z: 330},
    {x: -250, z: 470},
    {x: -520, z: 380},
    {x: -560, z: 120},
    {x: -400, z: -60},
    {x: -430, z: -300},
    {x: -230, z: -520},
  ] as ReadonlyArray<{x: number; z: number}>,
  /** Where the start line sits, as a fraction round the lap. Just before the
   *  first corner, so the grid is on a straight. */
  startAt: 0.02,
} as const;

/**
 * The other two circuits the game ships with.
 *
 * One for each of the other places: a desert with long straights and one
 * proper hairpin, and a city with the corners a city has — square, tight, and
 * one chicane where the road jinks round something nobody has bothered to move.
 *
 * The same size as Sunday Hills, about eleven hundred units across, because
 * that is the size the camera, the field of four and a one-lap race were all
 * settled around. Drawn as corner points and smoothed into a closed curve the
 * same way a child's own track is, so these are three examples of the thing
 * the editor makes rather than three special cases.
 */
export const CIRCUITS = {
  desert: {
    name: "Dune Run",
    startAt: 0.02,
    shape: [
      {x: -60, z: -560},
      {x: 260, z: -540},
      {x: 520, z: -390},
      {x: 600, z: -140},
      {x: 470, z: 70},
      {x: 560, z: 300},
      {x: 360, z: 500},
      {x: 40, z: 520},
      {x: -200, z: 430},
      {x: -130, z: 220},
      {x: -390, z: 210},
      {x: -560, z: 30},
      {x: -430, z: -230},
      {x: -260, z: -430},
    ] as ReadonlyArray<{x: number; z: number}>,
  },
  neon: {
    name: "Neon Mile",
    startAt: 0.02,
    shape: [
      {x: -300, z: -540},
      {x: 240, z: -540},
      {x: 520, z: -330},
      {x: 520, z: -70},
      {x: 320, z: 60},
      {x: 500, z: 250},
      {x: 380, z: 500},
      {x: 40, z: 540},
      {x: -240, z: 440},
      {x: -170, z: 190},
      {x: -470, z: 210},
      {x: -570, z: -140},
    ] as ReadonlyArray<{x: number; z: number}>,
  },
} as const;

/**
 * The car.
 *
 * An arcade drift model, which is the whole game: the car has a heading and a
 * velocity, and they are not the same thing. Grip pulls the velocity round
 * toward the heading, and when you ask for more than the grip can give, the
 * car slides — and leaves black marks all over the road.
 */
export const CAR = {
  /** Sixteen units long and seven wide: four metres by one and three quarters,
   *  which is a real racing car. */
  length: 16,
  width: 7,
  /** Units a second flat out on tarmac, and how hard it gets there. A hundred
   *  and ten is twenty-seven metres a second, or a hundred kilometres an hour
   *  — quick enough to be exciting and slow enough for a child to hold a line. */
  top: 110,
  accel: 105,
  /** How hard it slows with nothing pressed, and how hard the brakes are when
   *  the stick is pushed against the way you are going. */
  coast: 26,
  brake: 130,
  /** Radians a second the nose comes round, and how much of that survives at
   *  full speed. A car that turned as hard at a hundred as at a walk would
   *  have no corners in it. */
  turn: 3,
  turnAtSpeed: 0.42,
  /**
   * How much of the steering a car has at a crawl.
   *
   * A car turns by driving round a corner. It cannot spin on the spot, and
   * this game let it: point the finger behind the car and it braked to a stop
   * — asking to go the other way is the brake — and then, standing still,
   * swung its nose through a half turn in a second and drove back the way it
   * came. Which is not a car and is not a race; a mistake ought to cost a
   * corner, not a shrug.
   *
   * So the nose only comes round in proportion to how fast the car is actually
   * rolling, up to `turnsFrom`, and a U-turn becomes what it is on a road: a
   * wide arc, or a stop and a fresh start. `turnStill` is what is left when it
   * is barely moving at all — not nothing, or a car nose-first into the tyres
   * could never be worked out of them.
   */
  turnsFrom: 34,
  turnStill: 0.12,
  /**
   * Grip: how fast sideways speed is scrubbed off, per second.
   *
   * This is the number the game lives or dies by. High and the car is on
   * rails; low and it is a hovercraft. Six means a hard corner taken flat out
   * steps the back end out and holds it there for about a second, which is a
   * drift you can see, steer and be pleased with.
   */
  grip: 6,
  /** How much of that grip is left on grass. A third: the car understeers wide
   *  and will not stop, which is what makes running wide cost you. */
  grassGrip: 0.34,
  grassTop: 0.55,
  /**
   * How fast it has to be sliding sideways before it lays rubber.
   *
   * Measured, not guessed: an autopilot holding a tidy racing line peaks at a
   * sideways 16.6, and a hard yank of the stick at speed reaches the thirties.
   * Eighteen sits between the two, so a clean lap marks only the tightest
   * corners and throwing the car about blacks the road — which is the game.
   * Twenty-six was above everything driving normally ever produced, so the
   * marks never appeared at all.
   */
  skidAt: 18,
  /**
   * How hard a left-to-right difference in grip turns the car.
   *
   * Radians a second at full speed for a complete split — every wheel down
   * one side gripping and none down the other. This is what makes the edge of
   * an oil slick more dangerous than the middle of it.
   */
  spinFromSplit: 2.6,
  /** How fast the car rights itself once it is back on the ground, after a
   *  roll. Frame-rate independent, so it is a rate and not a fraction. */
  rightsItself: 5,
} as const;

/** The marks the road is left covered in. */
export const SKID = {
  /** How many are kept. The oldest is overwritten, so the trail is always the
   *  last few seconds of driving — and a lap of a thousand metres of unbroken
   *  rubber would be a lap where none of it meant anything. */
  max: 1400,
  /** How often one is laid while the car is sliding, in seconds. */
  every: 0.018,
  /** How wide a tyre is, and how far apart the two of them are. */
  width: 2.6,
  gauge: 6,
  /** How long a mark takes to fade away, and how dark it starts. */
  life: 7,
  darkness: 0.55,
} as const;

/**
 * The other cars.
 *
 * A race wants somebody to race. They drive the racing line at a pace a child
 * can beat if they drive well and cannot if they spin — the plan does not ask
 * for them by name, but "a car racing game" with nobody else on the track is
 * a time trial.
 */
export const RIVALS = {
  count: 3,
  /** How fast they go, as a fraction of the player's top speed, and how much
   *  they differ from one another. */
  pace: 0.78,
  spread: 0.05,
  /** How far off the centre line each one runs, so they are not a train. */
  offset: 22,
  /** How far ahead of the player they start, in fractions of a lap. */
  gridGap: 0.008,
  /** The colours, in the order they are handed out. */
  colours: [0x3f7fd6, 0x49b45a, 0xe0b13c] as const,
} as const;

/** What can be painted on a car on top of its colour. */
export type CarDesign = "plain" | "checkers" | "stripes";

/** The player's car, and how the grid is laid out. */
export const PLAYER = {
  /** The colour a car is until somebody chooses otherwise. */
  colour: 0xd6473c,
  /**
   * What can be chosen in the garage.
   *
   * Ten, all saturated and none close to another: a child picking a colour is
   * picking *their* car, and two reds a shade apart is a choice that means
   * nothing.
   */
  choices: [
    0xd6473c, 0x3f7fd6, 0x49b45a, 0xe0b13c, 0xa356d6, 0xf2f0ea, 0x21242b,
    0xff7a2f, 0x2ec7c7, 0xef62a8,
  ] as ReadonlyArray<number>,
  /**
   * Your colour, under the neon.
   *
   * The city is lit in pinks and cyans that are brighter than anything on the
   * cars, and a car painted for daylight goes flat and muddy in the middle of
   * it. So on that track the colour you chose is turned up rather than
   * swapped: the same hue, wound out to full saturation and lifted, which
   * reads as the neon version of your own car and not as somebody else's.
   *
   * A colour with no hue to wind out is left alone. Black and white are
   * choices in their own right — a "neon black" is a blue car, which is not
   * what the child who picked black asked for — so anything below this much
   * saturation keeps exactly the paint it had.
   */
  neonSaturation: 1,
  neonLightness: 0.62,
  neonNeedsHue: 0.3,
  /**
   * What is painted on top of the colour.
   *
   * The colour is the car; this is the child's own mark on it. They go on the
   * decks — the nose in front of the driver and the engine cover behind them —
   * because the camera looks down at forty-five degrees and the top of a car
   * is nearly all it ever sees of one.
   *
   * Laid on the surface the body already has rather than modelled: each shape
   * is cut flat and then dropped onto the deck, so it follows the taper of the
   * nose and the slope of the cover instead of hovering over them.
   */
  designs: [
    {id: "plain", name: "Plain"},
    {id: "checkers", name: "Checkers"},
    {id: "stripes", name: "Stripes"},
  ] as ReadonlyArray<{id: CarDesign; name: string}>,
  /**
   * The two colours a design is ever painted in, and where the line between
   * them falls.
   *
   * One or the other, picked on how light the car is: white on a dark car and
   * near-black on a pale one. A third colour would be a second decision, and
   * the point of this one is that whatever is chosen looks deliberate.
   */
  decalLight: 0xf7f5ee,
  decalDark: 0x1b1d24,
  decalSwitchesAt: 0.55,
  /** How far the paint stands off the bodywork. Coplanar faces z-fight, and
   *  this is the smallest gap that never flickers at racing distance. */
  decalLift: 0.09 as number,
  /** How far off the centre line the player starts, and how far back. */
  offset: -22,
} as const;

/** What a sticker can be: one of the cut-out shapes, or something written. */
export type StickerKind =
  "star" | "heart" | "flag" | "skull" | "smiley" | "bolt" | "crown" | "text";

/** One thing stuck on the car. `u` is across the deck as a fraction of how
 *  wide it is there, `v` along the car as a fraction of its length. */
export interface Sticker {
  kind: StickerKind;
  u: number;
  v: number;
  size: number;
  /** How far up the side, for writing. Pictures live on the decks and have no
   *  use for it. */
  h?: number;
  text?: string;
  font?: string;
}

/**
 * Stickers and writing.
 *
 * The designs are the four the game offers; this is everything a child puts on
 * top of them themselves, anywhere on either deck, in any words they like.
 */
export const STICKER = {
  /** How many a car can carry. Not a performance limit — each one is a draw
   *  call and thirty would still be nothing — but a tidiness one: past about
   *  this many there is no car left to see under them. */
  most: 12,
  /** How big one arrives, and the range a child can pinch it to, in world
   *  units. The car is sixteen long and seven wide, so four units is a badge
   *  and eight is a bonnet full. */
  size: 3.6,
  smallest: 1.6,
  largest: 8,
  /** How much bigger or smaller each tap of the size buttons makes it. */
  step: 1.25,
  /** Where a new one lands: the middle of the nose deck, nudged along a little
   *  each time so a second sticker is not hidden under the first. */
  dropAt: 0.3,
  dropStep: 0.055,
  /** Curve segments in a sticker outline. These are small on screen and there
   *  is no reason to spend more than a phone would notice. */
  curve: 10,
  /** How many strips a written sticker is cut into along the car, so it bends
   *  with the deck instead of bridging it. */
  strips: 8,
  /** The letters, drawn on a canvas: how tall in pixels, and the widest a word
   *  is allowed to be before it stops growing. */
  textPixels: 128,
  textMost: 2048,
  anisotropy: 4,
  /** Anything this transparent is not drawn at all, which is what keeps the
   *  space around the letters from sitting on the paint as a grey pane. */
  alphaTest: 0.5,
  roughness: 0.45,
  /**
   * The height a sticker is dragged at.
   *
   * A finger moving one is followed on a flat plane through the car at about
   * deck height, not on the car's own surface. Riding the surface sounds more
   * honest and is worse: the ray meets the driver's helmet, the roll hoop and
   * the rear wing on the way past, and the sticker jumps to wherever those
   * happen to be — or stops dead when the finger leaves the bodywork. On a
   * plane it goes exactly where the finger goes, every frame, and is then put
   * on whichever deck that turned out to be.
   */
  dragHeight: 4,
  /**
   * The colours a picture is painted in.
   *
   * Fixed, and not offered as a choice. A star is yellow, a heart is red and a
   * chequered flag is black and white — that is what those things *are*, and a
   * child asked to pick a colour for a smiley face is being asked a question
   * with a wrong answer in it. The car's own colour is the choice; these are
   * pictures stuck on it.
   */
  ink: {
    gold: 0xffc93c,
    sun: 0xffe04a,
    red: 0xe23b3b,
    bone: 0xf4f1e6,
    white: 0xf7f5ee,
    dark: 0x1b1d24,
    lip: 0xd08a2a,
  },
  /** How far apart the layers of one picture are stacked. Enough that the eyes
   *  of a smiley never flicker through its face, small enough to be paint. */
  layer: 0.05,
  /** How far a picture stands off the bodywork. Above the liveries, which are
   *  thinner: a sticker goes *on top of* the stripes it lands on. */
  lift: 0.22,
  /**
   * Writing goes on the flanks: how far it stands off, and where on the side
   * it is allowed to be.
   *
   * The panel it has is the one between the wheels, and it is smaller than it
   * looks — the tyres on a single-seater are three units of radius standing
   * proud of the body at both ends, so a name written the length of the car is
   * a name written mostly on rubber. About five units, then, between the axles
   * and above the floor.
   */
  sideInset: 1.01,
  sideLift: 0.12,
  sideAt: 3,
  sideLowest: 2,
  sideHighest: 4.2,
  /** How tall a word arrives. Smaller than a picture: it is longer than it is
   *  tall and it has to fit between the wheels. */
  textSize: 2.4,
  /**
   * Words go on their own lines, up to this many.
   *
   * A name and a number, or two names, stack rather than running end to end.
   * The panel between the wheels is about five units long and there is nothing
   * to be done about that — but it is a good deal taller than it is long, so a
   * second word goes *under* the first and both stay big enough to read.
   */
  lines: 3,
  /** How much taller the block gets per extra line. One line is the height
   *  asked for; each one after adds this much of it. */
  lineAdds: 0.62,
  /** The longest a word may be along the car, as a fraction of its length,
   *  and how far along it may sit — short of the wings at either end, which
   *  are not the car's side. */
  sideRoom: 0.32,
  sideFrom: 0.11,
  sideTo: -0.09,
  /**
   * The kinds of writing on offer.
   *
   * Families rather than fonts: an iPad and a laptop do not have the same
   * ones installed, so each is a first choice with somewhere to fall back to,
   * ending in a family every machine has. The names are what a child sees.
   */
  fonts: [
    {id: "round", name: "Round", family: '"Avenir Next", Avenir, system-ui'},
    {
      id: "marker",
      name: "Marker",
      family: '"Marker Felt", "Comic Sans MS", cursive',
    },
    {
      id: "chalk",
      name: "Chalk",
      family: 'Chalkduster, "Bradley Hand", cursive',
    },
    {
      id: "typewriter",
      name: "Typed",
      family: '"American Typewriter", Courier, monospace',
    },
    {
      id: "fancy",
      name: "Fancy",
      family: '"Snell Roundhand", "Brush Script MT", cursive',
    },
    {id: "block", name: "Block", family: 'Impact, "Arial Black", sans-serif'},
  ] as ReadonlyArray<{id: string; name: string; family: string}>,
} as const;

/**
 * The scenery either side.
 *
 * Trees, tyre stacks and crowds. None of it is ever touched — the barrier is
 * at the edge of the grass and all of this is beyond it — so it is there
 * purely to give the track somewhere to be.
 */
export const SCENERY = {
  seed: 20260907,
  trees: 420,
  tyres: 90,
  crowd: 260,
  /** How far out from the barrier things are scattered. */
  band: 260,
} as const;

/**
 * The sound.
 *
 * Made rather than loaded, like the other games here — a self-contained html
 * file has no room for a minute of engine as an mp3. The engine is a sawtooth
 * whose pitch rides on the speed, which is the whole of what an engine is.
 */
export const SOUND = {
  /** The engine's pitch at a standstill and flat out, and how loud it is. */
  idleHz: 60,
  fullHz: 240,
  level: 0.05,
  /** How fast the pitch follows the speed. Lazily, or every kerb is a rev. */
  follow: 4,
  /** The tyres, which come in only when the car is actually sliding. */
  skidLevel: 0.14,
  skidCutoff: 2600,
} as const;

/**
 * The things a child can drop on a track.
 *
 * All three are a circle of paint on the road with a rule attached, and the
 * rules are deliberately the three different ways a racing game can interfere
 * with a car: one takes your grip away, one takes your speed away, and one
 * takes the road away from under you for a second.
 */
export const ITEM = {
  /** How big each patch is, and how far apart two of them must be dropped. */
  radius: 26,
  minGap: 34,
  oil: {
    colour: 0x1a1a20,
    /* A ring round it, because the slick itself is nearly black and the neon
       city's road is nearly black too — on that track the patch simply was not
       there. Every patch is drawn on a rim so it reads on any tarmac. */
    rim: 0x8d7bd6,
    /** What is left of the car's grip on oil. Six per cent: the back end goes
     *  and stays gone, which is the joke, and it is survivable because a spin
     *  on a wide track costs a second and not the race. */
    grip: 0.06,
  },
  mud: {
    colour: 0x6b4a2c,
    rim: 0xb08b56,
    /** Top speed and drag on mud. Slow, but it never stops you dead — a child
     *  stuck still in a puddle has nothing to do about it. */
    top: 0.45,
    drag: 34,
  },
  ramp: {
    colour: 0xe8b23c,
    stripe: 0x2b2b31,
    /**
     * The wedge itself, in world units.
     *
     * A real ramp, not a picture of one: the car drives up the slope, rides
     * the surface with its nose in the air, and leaves at the lip. It was a
     * board painted on the road, which meant a car crossed it without ever
     * going up — the jump simply happened, from nowhere, on flat tarmac.
     */
    wide: 52,
    long: 42,
    rise: 11,
    /** How much the climb costs. Going up a hill is work, and a ramp taken
     *  slowly should be slower still at the top. */
    drag: 46,
    /** How long the car is in the air, and how much bigger it looks at the top
     *  of the arc. Seen from straight above there is no other way to say
     *  "off the ground": the sprite grows and its shadow stays put. */
    airtime: 1,
    lift: 0.55,
    /** How slow you can be and still take off. Roll onto it and nothing
     *  happens, which is the right lesson. */
    minSpeed: 40,
    /** What is left of the steering in mid-air. Almost nothing: a jump is
     *  committed to, and being able to fly a corner would make the ramps a
     *  short cut rather than a risk. */
    steer: 0.15,
    /**
     * The shove a ramp gives, and how long the car is allowed to keep it.
     *
     * Applied to the velocity at take-off, so the boost is immediate and in
     * whatever direction the car was actually travelling. The speed ceiling is
     * lifted by the same amount and eased back down over `carry` seconds —
     * without that the clamp would take the boost away in the same step it was
     * given, and landing would snap the car back to walking pace at exactly
     * the moment it should feel fastest.
     */
    boost: 1.35,
    carry: 2.5,
    /**
     * How hard a lopsided take-off throws the car over.
     *
     * Hitting a ramp square launches the car flat. Catching it with the wheels
     * down one side only launches that side, and the car rolls — which is what
     * a real one does and is the whole reason a ramp is worth aiming at
     * properly. Radians a second of roll per unit of left-to-right imbalance,
     * at full speed.
     */
    roll: 7.5,
    /**
     * How far the nose comes up off the lip.
     *
     * Tied to how fast the car is still climbing rather than run off a timer,
     * so the nose rises while it is going up and drops while it is coming
     * down. That is the whole shape of a jump and it comes out for free.
     */
    pitch: 0.42,
    /**
     * The dive: how a square take-off goes over.
     *
     * All four wheels on the boards means no roll — nothing is lopsided, so
     * there is nothing to throw it sideways — and a jump with no rotation at
     * all is the dullest thing a ramp can do. So a square one goes head first
     * instead: the nose keeps rotating forward over the top of the arc.
     * Radians a second at full speed, and how far over it is allowed to get
     * before it holds there. Just past a right angle, so it comes down looking
     * over its own bonnet rather than winding all the way round onto its roof.
     */
    dive: 1.6,
    diveMost: 1.1,
    /**
     * How much of that a jump gets when it is also rolling.
     *
     * Every take-off goes over the front, not only the square ones: a car
     * comes off a ramp nose up and it has to be nose down by the time it
     * arrives, because landing on the front wheels is what a jump looks like
     * and landing flat is what a dropped brick looks like. A rolling one gets
     * less of it — it already has one rotation to read and two at full rate is
     * a car nobody can follow.
     */
    diveRolling: 0.55,
    /** How fast it goes up. The arc is a real one — gravity brings it back —
     *  so this is a speed and not a duration. */
    launch: 62,
    gravity: 150,
    /**
     * Landing.
     *
     * A car coming down on its nose does not simply carry on: the front hits,
     * it loses a little, and it settles back onto four wheels. `dip` is how
     * far the nose goes past level as the bumper touches, and `keep` is what
     * is left of the speed afterwards — a jump should cost a little, or the
     * ramps would be a short cut rather than a risk.
     */
    landDip: 0.2,
    landKeep: 0.9,
    landFor: 0.28,
  },
} as const;

/**
 * Cars hitting each other.
 *
 * A race with four cars that pass through one another is not a race. They are
 * treated as equal discs and simply shoved apart, which is the whole model —
 * anything more careful would be modelling a crash, and this game wants a
 * nudge and a bit of a slide, not a shunt.
 */
/**
 * What a wheel carries out of a patch, and the trail it leaves.
 *
 * A car that drives through oil does not stop being oily at the edge of the
 * slick — it tracks it up the road, and the marks tell everybody behind
 * exactly where the trouble is. Each wheel carries its own, so clipping a
 * patch with one side leaves one line and not two.
 */
export const TRAIL = {
  /** How long a wheel goes on laying after it leaves the patch. */
  carries: 2.2,
  /** How long a mark stays on the road before it has faded out. */
  life: 10,
  /** How often one is laid, and how wide. */
  every: 0.035,
  width: 2.2,
  /** How many marks are kept at once, across every wheel and both kinds. */
  max: 900,
} as const;

export const BUMP = {
  /** How close two cars get before they touch, centre to centre. A little
   *  under half a car length, so they can run side by side down a straight
   *  without shoving each other the whole way. */
  radius: 7.4,
  /** How much of the closing speed comes back as a bounce. Half: enough to
   *  feel like a hit and not enough to fling a child off the road. */
  bounce: 0.5,
  /**
   * And how much speed survives each step of contact, so a pile-up settles.
   *
   * Applied every step the two are touching rather than once per impact, which
   * is right — leaning on a car ahead should cost you — but it compounds, and
   * it has to be gentle for that reason. At 0.88 a shunt lasting ten steps
   * kept a quarter of the speed and stopped the player dead.
   */
  keep: 0.97,
  /** How long between bump noises. Ten frames of contact is one bump, not ten
   *  — without this a shunt is a machine gun. */
  quiet: 0.25,
} as const;

/**
 * The race itself.
 */
export const RACE = {
  /** The most laps a drawn track may ask for. */
  maxLaps: 10,
} as const;

/**
 * How a track is rated: easy, medium or hard.
 *
 * Worked out from the track rather than asked of whoever drew it. A child who
 * has just built something is the worst possible judge of how hard it is —
 * they have not driven it — and the whole use of a rating is telling somebody
 * else what they are in for.
 *
 * The score adds up the three things that actually make a lap difficult, and
 * the thresholds below were read off real tracks rather than guessed: the
 * circuit the game ships with scores 22, a lazy oval scores 4, and a scribble
 * with oil all over it scores past 70.
 */
export const RATING = {
  /**
   * What the corners are worth.
   *
   * Multiplied by how far the track's slowest corners fall short of flat out —
   * nought on a circuit that can be driven all the way round without lifting,
   * and towards one on a track that is all hairpins. Set so that turning is
   * most of the score and the hazards are the trimming.
   */
  perSlowing: 60,
  perOil: 7,
  perMud: 4,
  perRamp: 2,
  perCrossing: 4,
  perExtraLap: 1.5,
  /**
   * Where the bands fall.
   *
   * Read off real tracks rather than picked: the circuit the game ships with
   * scores 2, a lazy oval scores nothing at all, a figure of eight with a
   * flyover scores 12, the same circuit with two oil slicks and a mud patch on
   * it scores 20, and a scribble of hairpins scores 39.
   */
  medium: 10,
  hard: 28,
} as const;

/**
 * The neon city's signs.
 *
 * These are the reason the city environment exists. A sign is a hoarding with
 * bent glass on it, and the glass is emissive far above white so the bloom
 * pass spills a halo round it — which is what a glowing tube looks like
 * through a camera, and what makes neon read as neon rather than as a bright
 * line. Each one also carries a real light, so the road under it is its
 * colour.
 */
export const NEON = {
  /** How many go up around a lap. Enough that there is always one in shot and
   *  few enough that the lights stay affordable. */
  count: 30,
  /**
   * How far past the barrier they stand.
   *
   * Close. They were out at thirty to a hundred and sixty and the nearest one
   * to the car was a hundred and fifty units away — off the side of the
   * screen, so a city full of signs had none of them in shot. A sign that
   * cannot be read from the road is not a sign.
   */
  from: 10,
  to: 85,
  minHeight: 26,
  maxHeight: 64,
  /** How fat the glass is. */
  tube: 0.9,
  /**
   * How hard the tubes are driven.
   *
   * Well past one on purpose: everything above the display range is what the
   * bloom pass gathers into a glow, so this number is really "how big is the
   * halo" rather than "how bright is the tube".
   */
  emissive: 4.2,
  /** The light each one throws, and how far it carries. */
  lampPower: 900,
  lampReach: 190,
  /**
   * There are no buildings.
   *
   * There were: two rows of them, low along the street and towers set back,
   * with a grid of windows up every face. They were handsome and they were
   * also the thing most often between the camera and the car — the shot comes
   * in over the scenery at forty-five degrees, and anything tall near the road
   * eventually stands in it. A street at night with lamps and signs along it
   * reads as a city perfectly well without them, and the frames they cost buy
   * a longer view instead.
   */
  /** How many are faulty, how fast they stutter, and how far down they drop
   *  when they do. Not to nothing — a dead tube still catches the streetlight. */
  brokenChance: 0.35,
  flickerFrom: 3,
  flickerTo: 11,
  dimmed: 0.06,
} as const;

/**
 * The tyre stacks on the verge.
 *
 * Real things on the grass to hit, rather than more scenery beyond the wall
 * that nothing ever touches. They go on the outside of corners, which is both
 * where a real circuit puts them and where a car that has run wide actually
 * ends up.
 */
export const TYRES = {
  /** How many clusters, and how many stacks in each. Twelve stacks around a
   *  lap: enough to meet some, few enough that the verge is still a place you
   *  can use when you get a corner wrong. */
  clusters: 4,
  perCluster: 3,
  /** How far apart the stacks in a cluster sit, along the road. */
  spacing: 26,
  /** How big one is, and how far off the centre line they sit — clear of the
   *  kerb, and short of the barrier. */
  radius: 8,
  from: 47,
  to: 60,
  /** How hard the car comes off one, and how much speed it keeps. Springier
   *  than the wall, which is meant to be a mistake; a tyre stack is meant to
   *  be a bit of fun. */
  bounce: 0.65,
  keep: 0.9,
} as const;

/**
 * Flyovers.
 *
 * A circuit that runs over itself has to say which of the two roads is on top,
 * and the answer is always the later part of the lap. Otherwise a child
 * driving into a crossing has no way of knowing whether they are about to go
 * over or under, and half the corner is drawn on top of the other half.
 */
export const BRIDGE = {
  /**
   * How far the deck reaches either side of the crossing, in world units
   * along the road.
   *
   * It has to cover everything the road underneath draws — its tarmac, kerbs,
   * run-off and barrier — which reaches out to the barrier's far edge. A
   * little more than that, so the deck ends over the grass and not on the
   * kerb it is hiding.
   */
  reach: 120,
  /**
   * What the deck fades to while the player is underneath it.
   *
   * Not to nothing. Fading the deck away entirely would leave the car
   * apparently driving through the middle of a road that is not there, and a
   * ghost of it says "you are under this" much better than a hole does.
   */
  under: 0.3,
  /** How fast it fades, per second. Quick enough to be out of the way before
   *  the car is, slow enough not to blink. */
  fade: 6,
} as const;

/**
 * The track builder.
 *
 * The drawing surface is a fixed square of the world, so a track drawn on a
 * phone and one drawn on an iPad come out the same size — the canvas stretches
 * and the world does not.
 */
export const EDITOR = {
  /** Half the width of the world the canvas shows, in game units. */
  reach: 760,
  /** How far the finger must travel before another point is kept, and how many
   *  points the finished loop is reduced to. Raw touch points are far too
   *  many and far too jittery to be corners. */
  sampleEvery: 26,
  corners: 26,
  /** The smallest loop worth racing, as a fraction of the drawing area, and
   *  the fewest corners. Below either, the drawing is a scribble and is
   *  rejected with a word rather than saved as an unplayable track. */
  minSpan: 0.22,
  minCorners: 6,
} as const;
