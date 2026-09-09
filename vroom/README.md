# Vroom

A top-down arcade racer, and a track builder to go with it. Drive one lap of a
circuit against three rivals, hold the car sideways through the corners and
black the road with rubber — or draw a circuit of your own with a finger and
race that instead.

TypeScript + Three.js + Vite, built to one self-contained `index.html` and
published by the gallery in the repo root.

## Running it

```bash
npm --prefix vroom run dev
```

Then open the URL Vite prints. On a tablet on the same Wi-Fi, use this Mac's LAN
address (`ipconfig getifaddr en0`) with the same port.

For the installed-app feel, **Share → Add to Home Screen** and launch from the
icon.

## Playing it

**Touch anywhere and the car drives to your finger.** The further from the car
you point, the faster it goes; touch the car itself and it coasts. Slide your
finger about and it follows.

It was a floating thumbstick — planted where the finger landed, steered by
dragging away from that point — and that had a hole in it: touch the screen and
hold still and _nothing happened_, because until the finger moves a relative
stick has no direction in it. Pointing at a place on the road is what a child
does anyway.

It works because the camera never turns: screen right is world +X and screen
down is world +Z at every moment of the game, so a point on the glass is a
point on the road with no arithmetic at all. The stick is told where the car is
on screen each frame by whoever draws it, since nothing else knows.

There is no brake button and there does not need to be one: point behind the
car and it turns round, point at it and it coasts.

**A keyboard is a different control, not a squarer stick.** Arrow keys and WASD
steer left and right _of the car's own nose_, with up and down as the pedals —
hold left and the car keeps turning left, whatever it ends up pointing at, and
down brakes and then reverses. Fed through the stick's own scheme, a keyboard
gave four fixed compass directions, which is not driving. `Drive` in
`entities/car.ts` is the union of the two, and the car reads whichever is in
use; a finger on the glass always wins.

The grass will slow you down and the wall at the edge of it will not let you
past, and there are tyre stacks on the outside of some corners to bounce off.
Cars bounce off each other too, ramps throw you into the air and give you a
shove with it, oil takes your grip away and mud takes your speed.

## Your car

Ten colours, with the real model turning while you choose, lit the way the game
lights it — so what you pick is what turns up on the grid. The choice is kept
in this browser (`vroom.car.v1`).

**Where it lives depends on the screen.** Above `LAYOUT.wide` — every iPad
either way up, and every laptop — it sits beside the track list, and there is
no button for it because you are already looking at it. Below that, on a phone
held upright, two columns would be two things nobody can use, so it goes behind
a **🎨 Your car** button and opens as its own screen.

The menu watches for the crossing and rebuilds when it happens. That matters
more than it sounds: the garage owns a WebGL context, so it is built when shown
and given back when not — a browser hands out about sixteen of those before it
starts quietly dropping the oldest, and a phone turned back and forth would get
through them. Checked across eight crossings: one canvas when wide, none when
narrow, and no accumulation.

The rivals give way to it. Two identical cars in a race of four is a child
watching the wrong one all the way round.

## Building a track

**Build your own track** on the front screen opens the builder. Draw a loop with
a finger; then drag the start line, ramps, oil and mud onto the road, pick one
of the three worlds, and save it. Saved tracks live in this browser and appear
under **Custom tracks** on the front screen, where they can be raced, edited or
thrown away.

A track can be one to ten laps, and carries a difficulty — Easy, Medium or
Hard — that is **worked out from the track rather than claimed by whoever drew
it**. A child who has just built something is the worst possible judge of how
hard it is: they have not driven it. `track/rating.ts` reads how slow the
track's slowest corners make you, what has been dropped on it, and how many
times round you go.

**Export** shows the track as JSON with a button to copy it. That is the whole
sharing story for now — the intention is a server one day, with short codes for
swapping tracks about, and until then this is how a track leaves the device.

## Architecture

Worth knowing before changing anything:

- **The camera is a perspective one at a fixed diagonal**, behind and above the
  car, tipped down about fifty degrees. It follows the car and it **never
  turns**, and that is load-bearing rather than lazy: the controls are "push
  the way you want to go", which only means anything while the picture holds
  still. Screen-up is world −Z at every moment of the game.
- **There are two kinds of thing, and they are drawn differently.** _Flats_
  lie in the XZ plane — the road, kerbs, start line, patches, skid marks. They
  are unlit and do not write depth, and what is drawn over what is decided
  entirely by `order(LAYER.x)`; leaving it to three's own sort is near enough
  right by accident and wrong where it matters (the car's shadow came out on
  top of the car in mid-air). _Solids_ have tops and sides — cars, tyre stacks,
  trees, the barrier walls. They are lit and they do write depth, so a car
  really does pass behind a tyre stack.
- **The road ribbons are wound face-down** — the sideways vector points the
  opposite way to what the winding assumed. It cost nothing while they were
  unlit and double-sided, and turned the whole road black the moment they were
  lit. They are wound the right way now _and_ carry stated upward normals, so
  neither alone has to be relied on.
- **Anything that can stand between the camera and the car dissolves**, using
  the shared near-fade shader. A full lap of the built-in circuit was measured
  frame by frame: the car's own pixels are on screen in every one of them.
- **Colours are constructed, not converted.** `new THREE.Color(hex)` already
  lands in the linear working space, so a `convertSRGBToLinear()` on top of it
  renders everything at about a third of its brightness. The tell, when this was
  wrong, was that the grass looked right and nothing else did — the grass is the
  scene background, which the renderer writes out untouched.
- **Where the circuit runs over itself, the later part of the lap is on top.**
  `Bridges` rebuilds that stretch of road complete — ground, run-off, barrier,
  kerbs — and draws it over everything including the cars, so the road below is
  properly hidden; a car up on a deck is lifted above it by `Car.setAbove`, and
  the deck fades to a ghost while the player is underneath. Watch out for the
  crossing finder: pairs are stored smallest-index-first, so a crossing that
  straddles the start of the lap turns up twice, once mirrored.
- **A track is data**, in `src/track/spec.ts`. The circuit the game ships with
  and one drawn by a child are the same kind of thing, and the game reads both
  the same way. Everything on a track is stored _against the circuit_ — how far
  round the lap, how far off the middle — so an oil patch is on the road by
  construction and stays there.
- **An instanced mesh cannot skip an instance** (the skid marks scale a dead one
  to zero), and it is frustum-culled against the bounds of its _geometry_ and
  not its instances, so its culling is off.
- **The drift model is the game**: the car has a heading and a velocity and they
  are not the same thing. Grip scrubs the sideways half, and asking for more
  turn than grip can give is a skid. `CAR.grip` and `CAR.skidAt` are the two
  numbers the whole feel hangs off.

## Starting and finishing

A race opens down on the grid, looking back at the cars head-on, and counts
three, two, one, go. The camera leaves on the beat _before_ "one" rather than
on "go": the pull-back is what tells a child the race is about to start, so it
has to be over by the time it is. Nobody moves until the flag — the stick is
dead and so are the rivals.

There are grandstands at the line with a crowd in them, and they jump when the
player finishes anywhere but last. That exception is the feature rather than a
detail of it: a child knows when they have been beaten, and an ovation for
coming fourth of four is how a game starts feeling like it is humouring them.
Confetti goes off over the line on the same condition.

The map in the corner exists because the racing camera sees about a fifth of a
lap — without it there is no telling whether the next corner is the hairpin or
the sweeper, nor whether the car being chased is a second ahead or most of a
lap.

## Getting ready, and finding its own level

**Nothing is shown until a race is ready.** Shaders compile the first time a
material is drawn and geometry goes to the card on its first frame, so the
opening seconds of a race used to be the slowest of it — which is exactly when
a child is trying to take the first corner. `Game.load()` builds the race in
steps behind a waiting card, each step handing the frame back so the bar can
paint, and the last steps call `compileAsync` and draw a few frames nobody
sees. The card also stays up for a moment on a fast machine: one that flashes
past in eighty milliseconds reads as a glitch rather than as the game getting
ready.

**And it gives things up one at a time.** The neon city is far heavier than the
other two levels, and an older iPad cannot hold sixty frames a second through
it. The game watches its own frame rate and makes one concession when it
cannot keep up, then remembers how many it has made (`vroom.quality.v2` in
local storage).

One at a time, in a stated order, rather than in tiers. This started as three
coarse tiers and that was worse: a machine a few frames short of smooth lost
its shadows, its bloom and a third of its scenery at once, when turning the
resolution down a notch would have done. `QUALITY.ladder` in `config.ts` holds
the order and the reasoning, cheapest-looking concession first:

1. **Resolution.** On a retina screen a device ratio of two is already past
   what an eye resolves at arm's length, and fragments are what a mobile GPU
   runs out of before anything else. Dropping to 1.5 cuts the pixels drawn by
   nearly half. Nothing else comes close on that trade.
2. **Shadow resolution** — a quarter of the texels, for a softer edge on
   something nobody looks at directly.
3. **Distant lights** — the tenth-nearest lamp lights almost nothing you can
   see, and every light is another iteration in every fragment of every lit
   surface.
4. **Bloom** — five full-screen blurs, real money on a tile-based GPU, but also
   the neon city's whole look, so it goes after the three nobody would notice.
5. **Resolution again**, then **shadows entirely**, then **scenery** — which
   changes the world rather than the picture of it, and cannot take effect
   until the next race.

It only ever goes down: a version that put things back on a good stretch would
hunt between two settings all race, and the hunting is worse than the
concession. It needs two bad two-second windows running, so one stutter cannot
cost a machine its quality for good.

In a development build `quality(4)` gives up the first four at once and
remembers it; `quality()` says what has gone.

## The model viewer

In a development build the track list has a **🧊 Models** button, and
`#models` in the URL opens it directly. Every model in the game gets a card it
can be turned in, and any card can be maximised to fill the page.

The URL carries what is open — environment and maximised model — and that is
the point of it rather than a nicety: the tool exists to be used while a model
is being edited, and editing reloads the page every few seconds.

One renderer serves the whole page. Each card is an empty div; a single canvas
sits behind the grid and every frame the renderer sets its scissor to each
card's rectangle in turn. Thirty cards is one WebGL context rather than thirty,
and browsers hand out about sixteen before they start quietly dropping the
oldest.

## Commands

```bash
npm --prefix vroom run dev         # dev server, hot reload
npm --prefix vroom run typecheck   # tsc --noEmit
npm --prefix vroom run build       # typechecks, then one dist/index.html
```

Formatting and linting come from the repo root (`npm run format`, `npm run
lint`), so this game is covered without any config of its own.

## Verifying a change

There is no test suite. `window.game` is the live game in a dev build, and
`window.play(spec)` starts a race on any track without tapping through the list.
Drive it and measure — feeding `g.stick` an aim point a fraction of a lap ahead
is an autopilot, and that is how the numbers in `config.ts` were arrived at
rather than guessed.

## Publishing

`game.json` carries a `status`. It starts as `"development"`, which lists the
game in the gallery's **In Development** section — flagged as unfinished. When
it is ready, change it to `"published"` and it moves to the main list of games.

## Layout

```
docs/
  plan-for-app.md  what the game was meant to be, written before it was built
src/
  config.ts        every tunable number, including the three environments
  core/            loop, the thumbstick, rng, zoom lock, engine sound
  render/          the orthographic stage, and the flat-sprite helpers
  entities/        the circuit, the cars, the rivals, the skids, the patches
  track/           what a track *is* as data, and where saved ones are kept
  ui/              the track list, the builder, the HUD, the cards, the CSS
  game.ts          owns the scene and one race
index.html         the entry point
card.png           the gallery's thumbnail
game.json          title, description and status, for the gallery
```
