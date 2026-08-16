# Bee a Queen

A touch-native 3D bee game for iPad. TypeScript + Three.js + Vite, served as a
fullscreen web app.

## Running it on the iPad

The Mac and iPad must be on the same Wi-Fi.

```bash
npm --prefix bee run dev
```

Then on the iPad, open Safari at:

```
http://192.168.1.184:5173
```

(That's this Mac's LAN address — check it with `ipconfig getifaddr en0` if the
network changes.)

For the real thing, **Share → Add to Home Screen**, then launch it from the
home-screen icon. That's what gets you true fullscreen with no Safari chrome.
Hot reload still works over the LAN, so edits show up on the iPad immediately.

On a laptop, WASD / arrow keys drive the bee so you can test without a
touchscreen.

## Controls

- **Floating thumbstick, lower left** — touch anywhere in the lower-left of the
  screen and the stick plants itself under your finger. Drag to fly. The bee
  banks into turns on its own. (WASD / arrows on a laptop.)
- **Altitude slider, bottom right** — a persistent vertical control. Where you
  leave the knob is the altitude you asked for; the bee then climbs or dives
  toward it at `FLIGHT.climbSpeed` rather than snapping, nose up or down as it
  travels. The faint bar on the track is where the bee actually is, so you can
  see it catching up. Range is 1.0 (grass-skimming) to 13.5, just above the
  tallest tree. (Q / E on a laptop.)
- Hover over a bloomed flower for half a second to gather its pollen — you have
  to drop down to it, cruising altitude is too high to collect.
- Once the hive is finished, fly into its doorway to end the level.
- **🏠 top right** — pause and go back to the level menu, from anywhere.

## What's built

| Phase                                                        | Status      |
| ------------------------------------------------------------ | ----------- |
| 0 — Scaffold, PWA, fullscreen iPad                           | done        |
| 1 — Flight model, floating joystick, chase camera            | done        |
| 2 — Procedural bee, three flower types, meadow, toon look    | done        |
| 3 — Pollen collection, HUD, codename, save, Level 1 complete | done        |
| 3b — Altitude control, hive force field, fly-in + fireworks  | done        |
| 4 — Level 2: the Royal Chamber (queen, babies, feeding)      | done        |
| 5 — Level 3: Wasp at the Hive                                | done        |
| 6 — Level 4: Caramel Cottage (dance mat, then inside)        | done        |
| 7 — Level 5: The Windy Woods (maze)                          | done        |
| 8 — Level 6: The Bear's Lair (side-scroller)                 | done        |
| 9 — Level 7: Silent Islands (Frogger)                        | done        |
| 10 — Wall-clock day system                                   | not started |

## Levels

The welcome screen is the world map (`assets/planning/levelmap.png`, downsized
into `src/assets/`), with a pin on each land. Pins sit at fractions of the image
so they track any scale — see `levels/lands.ts`. The Mellow Meadow holds levels
1–3 and is always open; Caramel Cottage is level 4 and unlocks after level 3;
the rest are padlocked or marked as still to come. Picking a land with more than
one level shows those levels beside the map.

Once you have a code name the screen is the map and little else — headed
"Where to?", with the name reduced to a chip you can tap if you want to change
it. It is reached far more often mid-game than at the start, and every one of
those times you are there to pick where to fly rather than to introduce
yourself. A first-time player still gets the full name entry.

Your current level is preselected, so plain "Continue" resumes. Choosing a level
you've already completed replays it from the start (level 1 resets its flower
counts), and your furthest unlock is kept either way.

**1 — Sunny Meadow.** Gather 10 each of white rose, yellow flower and red
flower. The hive on the branch grows with every collection. When it's whole it
lights up, your bee is crowned queen with a burst of sparkles, and you fly in
through the door to finish.

**2 — The Royal Chamber.** Inside the dome. The queen sits on her dais with six
babies ringed around her on perches, and the food is in the walls: the
honeycomb lining the dome is the hive's larder, and the cells with something in
them are coloured for their pollen and pulsing inside a glowing border. You're
a worker now — fly up to a glowing hexagon and it comes away with you, swinging
under the bee on a rope; carry it to a baby whose floating bubble asks for that
colour and the baby rears up on end like a chick, mouth to the sky, and the
hexagon flies out of your hands into it. Being over a baby is enough — you
never have to drop down to one. The food is scattered up the wall as
well as around it, so half the job is climbing to the right one. An emptied
cell goes dark and fills again a few seconds later, so the wall can't run out.
Carrying the wrong colour is never a dead end: fly right up to a cell holding a
different one and she trades, putting hers back and taking that instead.
Babies get hungry on their own clocks and
crave a random colour each time; three feeds and one grows up — plumping out and
earning a proper bee stripe, so you can see at a glance who's done. When all six are
grown they lift off their perches in a staggered wave and circle the queen while
fireworks go off around them — and they stay flying afterwards, so the finished
chamber is full of bees.

**3 — Wasp at the Hive.** Back in the meadow, with the hive built and lit. A
wasp arrives and circles it. It only notices you when you cross its field of
view, so you have to fly in front of it to hook it, then stay ahead — the
countdown only runs while it's actually chasing, so hiding gets you nowhere.
Let it clip you and you're knocked spinning while it goes back to the hive.
Hold the chase for 30 seconds and it gives up and leaves. There is no losing;
the worst case is having to bait it again.

Once it's gone the whole brood pours out of the hive to wander the meadow, and —
as in level 1 — you fly back in through the doorway to finish.

**4 — Caramel Cottage.** Opens with an establishing sweep past the cottage —
levels can take the camera with `ctx.setCameraCinematic()`, and handing it back
lets the follow spring glide in from wherever the shot ended. Two stages after
that. Outside, the door is locked and a 3x3 dance
mat sits in front of it: the bee hovers over the middle square, the eight around
it light on the beat, and you tap each before it goes dark. It starts one at a
time and then steps up to two per cue, the second half a beat behind the first —
the window on each stays as long, so what gets harder is watching two places at
once rather than reacting faster. 90% opens the door. The sweep lands on a
locked-off shot looking down at the board, and it doesn't move while you play —
this stage is about reading nine squares, not about flying, and a camera that
follows the bee swims the targets around under your finger. The moment the lock
springs it opens out and drops to a shallower angle to hold the mat and the
doorway together, because the door is 27 units behind the mat and six above it:
framed on the board, her whole flight into the house happened off the side of
the screen.
Inside is a lamplit room with a jar of honey glowing on the counter — fly over,
pick it up, and it hangs from you on a rope that swings with real momentum.

Then stage three. The screen washes to white as you slip into the doorway, and
opens again on the front of the house from out in the yard: you coming out of
the door with the jar swinging under you, the camera arcing in behind you as a
bear lumbers into shot. The clearing stands at the far north end of the meadow's
own world rather than in a scene of its own, so what happens next has no cut in
it at all: a hundred and seventy units down a tree-lined lane, out through the
gate in the meadow's hedge and across to the hive, glowing at you from the far
end, with the bear on your tail the whole way — about eighteen seconds flat out.
The lane is a corridor you can't leave: the trees are far too sparse to be a
wall, so it is enforced, opening out into the yard at one end and the meadow at
the other.
It's faster than you but corners badly,
same as the wasp, so turning is what saves you. Drop the honey into the hive and
the brood pours out to mob the bear; it rears up on its hind legs and swipes at
them (never connecting). While it's busy the screen splits — bear and bees on
the left, a sliding puzzle of a scary bear on the right — a 3x3 picture with
two gaps to slide into, the second hanging below the middle of the bottom row. The bear gives
ground to the swarm first — it delivers you to the hive doorstep, and at its
size that means standing on top of the hive and hiding it — and the camera
circles the pair of them slowly for as long as it's up on its hind legs. Finish the picture
and the real bear bolts, with rainbow confetti over the puzzle.

**5 — The Windy Woods.** A maze of trees, generated fresh every time it is
entered, so it cannot be learned. The walls are hedge and tree together — tall
green bushes filling in between bare trunks, with a red autumn canopy overhead
and leaves coming down on the breeze that leans them. The corridors are fifteen
wide and leafy; the hedge tops sit just above the camera, so you catch a
suggestion of the next lane but never a look into it. She flies faster in here
than anywhere else — the corridors are long and taken in a straight line, and
at the meadow's pace the level is mostly waiting to cross a cell.

**This level steers differently.** Two vertical controls, one each side: a
throttle on the left that is forward and back only, and a pair of held buttons
on the right that turn her on the spot. On a laptop, W/S and up/down drive her,
A/D and left/right turn her. The floating thumbstick reads a whole
circle of directions, which is exactly what a corridor doesn't want — the
camera is often part-way round a corner, so "the way the stick points" stops
meaning anything. The camera sits low and behind, and
whatever comes between it and the bee simply fades away.

Getting lost is the point, so the level helps rather than punishes. The bee
drops yellow pollen behind her, so a corridor she has already tried looks
different from one she hasn't. Every dead end holds a flower: fly into it and
she eats it, the camera climbs above the woods for five seconds to show you the
whole maze, and a scent appears along the correct route out, pulsing in the
direction of travel. It is drawn twice — solid where you can
see it, and faintly through the hedges where you can't, because a guide that
disappears behind a wall stops being one exactly when you are far enough away
to need it. It shows the next nine cells only — enough of a nudge to
get going, not enough to solve it, which is why the other dead ends still have
something to offer. The scent stays for the rest of the level. Reaching the
glowing ring at the far corner finishes it, which opens the Bear's Lair — its
completion card offers the map rather than "Keep flying", and the map comes up
with the Lair already selected.

**6 — The Bear's Lair.** Flappy Bird, played in the bee's own world: hold
anywhere on the screen and she climbs, let go and she sinks, and she flies
right whatever you do. Twenty-four gates of stalactite and stalagmite, then
rock outcrops, with about a minute of cave between the mouth and the far end.
It opens on the ordinary 3D view, held outside a boulder arch while she flies
in on her own, and the camera then swings round to her left for the side-on
run.

It is not a 2D game. It is the same scene, the same bee and the same renderer,
with the cave laid out in one shallow plane and the camera parked off to one
side — which is why the bee still pitches her nose up as she climbs and the
rocks still catch the light. She flies a couple of units in front of the
obstacles so that nothing can ever draw over her.

Hitting anything shakes the screen like an earthquake and drops her out of the
bottom of the frame, and then a card offers another go or the map. The gates
start much wider than they end and only narrow over the first ten, and the
whole cave is generated from a fixed seed, so it is meant to be learned — the
difficulty curve is getting further each time rather than anything the level
does to you.

**7 — Silent Islands.** Frogger, with the frogs on the other side of it. Eight
streams run in alternate directions between two banks, carrying frogs on
lilypads and alligators, and the bee crosses them a square at a time. A frog's
tongue only goes out of the front of its face, so it catches what is in front of
it and the square behind one is the safest on the board — riding along just
behind a frog is the one thing here that rewards watching rather than waiting.
An alligator has no tongue and no front: it is the whole animal, either end. It opens on the ordinary 3D view from
the near bank and the camera then lifts to look straight down at the board,
which is where it stays — this is a game about a gap four squares away
arriving in three seconds, and a shot that only showed the row she was on
would hide the whole decision.

**It is an errand, not a crossing.** Three babies wait on pedestals at the near
bank, and she takes them over one at a time: one follows her out, dances on
arrival and goes to wait on a pedestal at the far end, and she then has to make
the whole trip back for the next. Five crossings, and the way back is exactly as
dangerous as the way out — which is where the level's difficulty lives, since
one crossing you can get lucky with and five you cannot.

The baby is played back from the queen's own trail rather than steered: it sits
a square and a third back along the route she actually took, so it follows her
_round_ a frog instead of cutting the corner across it. It is never in danger —
only the queen is ever tested against the water — and a child watching a baby
drift past a tongue has to be able to trust that. The offset is a distance
rather than a delay because a delay collapses the moment she stops: half a
second after she lands, half a second ago is where she is standing, and the baby
ends up inside her.

Nothing here is flown. Four buttons replace the stick: up and down under the
left thumb, where the pair that is asked for most can be found without
looking, and left and right under the right. One press is one hop.

The difficulty is a table, in `ISLANDS.lanes`, and it is measured rather than
guessed. Riders are spread evenly round a loop wider than the board, a frog is
two squares wide as an obstacle because it reaches one square either side, and
what is left is the gap you hop into — so the time you get is
`(wrapSpan / riders - 2) / speed` seconds. No lane leaves less than two of
them, and the gaps tighten from 8 seconds on the first stream to about 2 on
the last. Measured against a greedy autopilot — one that hops when the next square holds
still, dodges when its own stops holding, and never looks more than one hop
ahead — five errands in ten are finished, in 44 to 51 seconds. An autopilot that
only presses forward survives one crossing in twelve, and the level asks for
five of them.

**The puzzle art is a placeholder** — a hand-authored SVG in
`src/assets/bearPuzzle.ts`. To use the real picture, drop the image into
`src/assets/` and swap that module's export for an image import; `ui/puzzle.ts`
only ever sees a URL. Shuffling walks the blank around with random legal moves
rather than permuting the tiles: a random permutation of a 15-puzzle is
unsolvable half the time.

## Building

```bash
npm --prefix bee run build
```

Produces `dist/index.html` (~660 kB, 178 kB gzipped) with the pictures beside
it. JS, CSS and the web app manifest are all inlined, so the code is one HTTP
request; the images are not, because base64 in the HTML meant re-downloading
185 kB of unchanged jpgs on every deploy. They come out under content-hashed
names — `levelmap-BC1XfPIG.jpg` — which is what lets them be cached for a year
and left alone by a new build. Deploy the whole `dist/`, not just the HTML.

Vite writes those URLs relative to the chunk that imports them, and that chunk
ends up inlined in the HTML, so `build.assetsDir` is `""`: the images have to
be siblings of `index.html` or the built game looks for them one level too
high.

It still needs to be served over HTTP; opening it via `file://` won't work,
because `<script type="module">` is blocked on that scheme. Any static host will
do — there is no server-side code:

```bash
npx serve bee/dist
```

Two things to know if you change the build:

- `base: './'` keeps URLs relative, so the file works from a sub-path (project
  GitHub Pages, say) and not just a domain root.
- The manifest is a `data:` URI in `index.html` rather than a file. iOS drives
  Add to Home Screen from the `apple-mobile-web-app-*` metas, so this is only
  for other browsers and degrades harmlessly if one rejects a data manifest.

## Architecture

```
src/
  config.ts        every tunable number: flight, camera, quotas, palette
  core/            loop (fixed 60Hz sim + interpolated render), input, save, audio, rng
  render/          stage, toon materials, camera rig, procedural geometry
  entities/        bee + wasp actors, flower field, baby ring
  levels/          Level interface + the three levels
  fx/              shared particle pool (pollen motes, fireworks)
  ui/              HUD, overlays, stylesheet
  game.ts          wires it all together
```

Things worth knowing before changing anything:

- **All 3D assets are generated in code.** No .glb files, no rigs, no textures.
  A bee is merged primitives with vertex colours; flowers are lathed petal
  rings. Look in `src/render/geometry/`. Every prop is merged into a single
  vertex-coloured mesh so the whole meadow is ~27 draw calls.
- **The simulation is fixed-timestep** (`SIM.step`, 1/60s) with interpolated
  rendering, so flight feels identical on a 60Hz and a 120Hz display.
- **Input is camera-relative**, and the camera's yaw slowly follows the bee's
  heading. That's a feedback loop: a camera that snaps to the heading makes the
  bee spin in a tight circle when you hold the stick sideways. The dead zone and
  rate cap in `CAMERA.yawDeadzone / yawGain / yawMaxRate` are what turn that into
  a wide, deliberate arc. Don't remove them without re-testing a held turn.
- **The save is one JSON blob in localStorage**, flushed on `visibilitychange`
  and `pagehide` because iPad Safari kills backgrounded tabs without warning.
  Level 1 progress reads from lifetime `gathered` totals, so pollen spent in
  later levels never rolls the level back.
- **`level` and `maxLevel` are different things.** `level` is where you are;
  `maxLevel` is the furthest you've ever reached, and it's what the welcome
  screen's picker unlocks from. Replaying level 1 rewinds `level` and wipes
  `gathered`, but must never lower `maxLevel` or the player loses the unlock.
  Saves written before the picker existed have no `maxLevel`; `read()` back-fills
  it from `level`.
- **The menu card is rebuilt every time it opens**, because the unlocked levels,
  the "play again" notes and the default selection all move as the player
  progresses. `openMenu()` guards on the menu already being visible rather than
  on `running`, so 🏠 still works with a completion card up.
- **State owned by the Game, not the level, must be reset on entry.** The baby
  ring is a Game field, so `RoyalChamberLevel.enter()` calls `babies.reset()` —
  otherwise replaying level 2 from the menu drops you into a room of already-grown
  bees with nothing to feed. `switchLevel()` likewise reparents the ring back
  into the hive interior and despawns the wasp, so no level has to undo another's
  scenery.
- **A level must put away anything that outlives its own `update()`.** The Game
  builds a fresh level object on every switch and drops the old one on the
  floor, so `Level.exit()` exists for exactly this: level 4 stops its music
  there. Without it, leaving the dance mat mid-round left the track playing
  under the next one, half a bar out — two of everything.
- **Resting state belongs to whatever built the thing, not to the material.**
  The dance mat used to read each pad's resting colour off its live material at
  construction; a mat built while a pad was still lit adopted the lit colour as
  its base and that pad glowed for the rest of the level. `cottage.padColours`
  states them instead.
- **Anything the Game owns must also be _ticked_ by whichever level is using
  it.** Level 3 releases the brood into the meadow but originally never called
  `babies.update()`, so they hung motionless outside the hive. That tick has to
  sit above the phase early-returns.
- **The hive glow means "you can fly in here"**, not "the hive is finished". It
  comes on with the `ready`/`returning` phases and goes off the moment the
  entry cutscene starts. Both meadow levels end with the shared `HiveEntry`
  cutscene in `levels/hiveEntry.ts`.
- **The top of the HUD is one grid, not four absolute positions.** The
  counters, the level banner, the objective and the buttons each used to be
  pinned to a corner and hope not to meet; on a phone the counters ran to x=223
  and the centred banner started at x=98, so they sat on top of each other, and
  the objective ran off the screen entirely. `.hud-top` lays them out as grid
  areas, which can't overlap at any width or for any length of text — and the
  text mattered: the width at which they collided depended on what the level
  was called and what it was asking you to do, so no fixed breakpoint would
  have been right. Under 860px it folds — the title moves up beside the
  buttons, which costs no height because that row exists anyway, and the
  objective and counters take a line each under it. Vertical space is the
  scarce thing on a phone, and that is worth 71px of it.
- **That breakpoint is asked of two different things.** `@media` works
  everywhere; `@container` is the truthful one, because the puzzle split cuts
  the HUD to 56% of the screen (`.split .hud`) without the viewport changing.
  Both set the same rules, so where containers aren't supported the phone is
  still covered and only the split is cramped — never broken.
- **`.hud-perf` hangs off the button column rather than sitting in it.** It's a
  dev readout and an invisible tap target when it's off. In the flow it added
  its height to the column, which stopped the buttons lining up with the title;
  overlapping the buttons instead, it would have swallowed taps meant for the
  menu.
- **Overlays size themselves to `visualViewport`.** The iPad keyboard doesn't
  shrink the layout viewport, so a centred card stays put and the keys cover the
  codename field. `trackVisualViewport` in `ui/overlays.ts` pins the overlay to
  the visible area instead. The codename field is also sanitised on every input
  and hardened against iOS AutoFill (`name`, `autocomplete`, `data-*-ignore`),
  which is what put `[object Object]`-shaped junk in it.
- **Audio is a WebAudio synth**, no files. It must be unlocked inside a real
  touch handler — that's what the Start button on the codename screen is for.
- **Never touch state after `setPointerCapture`.** It throws `NotFoundError`
  for any pointer the element can't claim, and Safari is far readier to do so
  than Chrome — on an iPad it left the maze's turn buttons completely dead,
  because the capture call sat _above_ the line that recorded the press and
  took the whole handler with it. Capture is a nicety, so it goes last and in a
  try/catch: register the press first, and the window-level `pointerup` ends it
  whether or not capture was granted. There is a `touchend` fallback for the
  same reason — a captured pointer's `pointerup` can go missing on iOS, and
  when the last finger leaves the glass nothing should still be held.
- **Zoom is locked** in `core/lockZoom.ts`. iOS Safari has ignored
  `user-scalable=no` since iOS 10, so the viewport meta alone does nothing;
  it takes six separate listeners (gesture events, multi-touch touchstart,
  double-tap touchend, dblclick, ctrl+wheel, ⌘±) plus `touch-action: none`.
  Form controls are exempt so the codename field still focuses. If you add any
  UI that needs a native gesture, exempt it there rather than loosening the
  global rules.
- **A panel that scrolls has to be exempted from the zoom lock, twice.** The
  menu card is taller than a short phone screen, and `overflow-y: auto` on the
  overlay did nothing on a touch device: `lockZoom` cancelled _every_
  `touchmove`, and `touch-action: none` up the tree took away the pan. It now
  lets a single finger through when the touch is inside something that has
  somewhere left to scroll — two fingers are still a pinch, and a finger on the
  canvas is still the game's — and `.overlay` asks for `touch-action: pan-y`.
  Both are needed; either alone leaves it stuck.
- **A modal that can outgrow the screen must not be centred by the container.**
  `place-items: center` (or `justify-content: center`) overflows in _both_
  directions, so the top of a too-tall card ends up above the scroll origin
  where nothing can reach it. `.overlay` is a column flexbox and `.card` has
  `margin: auto 0`, which centres identically when it fits and collapses to
  zero when it doesn't. The card also needs `flex-shrink: 0`, or it is squashed
  to fit instead of overflowing and there is nothing to scroll.
- **Particle materials need a white `color` attribute.** `vertexColors: true`
  makes the shader read a per-vertex `color`; with no such attribute it reads
  black, per-instance colour never multiplies in, and the particles render
  invisibly. `fx/particles.ts` adds a flat white attribute so `instanceColor`
  is the only thing that matters. Fireworks also use **normal, not additive**
  blending — additive sparks saturate to white against a bright daytime sky.
- **Level 1 ends on entering the hive, not on the last flower.** Meeting the
  quota moves the level to a `ready` phase: the hive completes, the force field
  switches on, and the beacon points at the door. Flying within
  `ENTRY_RADIUS` hands the bee to a cutscene (`bee.scripted = true`) that flies
  her in and shrinks her, then fireworks, then the completion card. The save
  only advances to level 2 once she's actually inside, so quitting at `ready`
  resumes at `ready`. While `level.controlsLocked` is true the Game feeds the
  bee a neutral stick and suspends harvesting.
  A level's `update()` must bail out as soon as its own code changes phase —
  level 2's last feed starts the celebration mid-`update()`, and the HUD work
  further down would otherwise immediately overwrite the celebration's banner.
  Dismissing the card calls `level.resumeAfterCompletion()`, which drops the
  level back to `ready` and clears `complete` so the hive can be flown into
  again — without it the finished hive goes inert and approaching it does
  nothing. Any future level needs to re-arm itself there too.
- **The cottage clearing is part of the meadow's world**, parked at
  `COTTAGE.yardOffsetZ`, and the two are drawn together. That's what makes
  stage 3 a single flight rather than a cut — but it means bounds, fog, ground
  and camera all have to span the pair: `COTTAGE.flightRadius` is a circle about
  the _hive_ wide enough to hold the clearing, `WORLD.groundSize` has to reach
  past it, `CAMERA.far` past the fog, and `COTTAGE_ENV` fogs much further out
  than the meadow. Most things at the clearing are authored in the yard's own
  frame and shifted: `cottage.matCentre`, `padCentres` and `doorway` are all
  world space by the time they're handed out.
- **The gate is not at the clearing.** It stands in the gap in the _meadow's_
  hedge (`WORLD.laneGap`, which `facingCottage` in `render/geometry/world.ts`
  also uses to step the hedge and treeline aside), a lane's length south of the
  yard — so from level 1 you can see a shut gate at the edge of where you're
  allowed, which is the point of it. It therefore hangs off the cottage group's
  root rather than the yard, and `cottage.gate` is already world space with no
  shift applied. `syncCottageGate` walls the meadow off at that z until level 4;
  move the gate north with the yard and the player can fly the whole empty lane
  in level 1.
- **The lane home is a corridor, and it has to be enforced.** Fifteen trees a
  side over a hundred and twelve units is nothing like a wall — measured, the
  nearest trunk to the centre line is 12.3 and for most of the length there is
  nothing within sixty — so without `COTTAGE.laneHalfWidth` you can fly out of
  the side of the bear chase and take the long way round, which is neither a
  chase nor what the trees are telling you. The allowance is the widest of the
  lane, the yard's disc and the meadow's, so both ends open out on their own
  and there is no seam where the corridor meets them.
- **`rig.snap()` faces the world origin unless told otherwise.** That was fine
  when every scene was built around it; the cottage isn't, so `ctx.placeBee()`
  takes an optional yaw and level 4 passes one. A level that places the bee far
  from the origin and skips it will find the camera pointing at the hive.
- **iOS keeps a strip of an installed app for itself.** On an iPad the layout
  viewport comes back 20pt shorter than the screen — measured on the device:
  1080x790 against a 1080x810 landscape screen — and that strip under the home
  indicator is painted with the _page_ background, not ours to draw in. So
  `setEnvironment` keeps `document.body.style.background` in step with the
  scene's sky, which is what stops it reading as a gap. Sizing the app can't
  help; it already fills every pixel the viewport has.
- **`core/fitViewport.ts` sizes the app in pixels, not CSS.** In an installed
  iPad app `position: fixed; inset: 0` isn't reliably "the screen" — the page
  can be laid out against a viewport a status bar taller than what's on show,
  leaving a band of bare background under the game. `visualViewport` is the one
  measurement that always describes what's visible, so the root is sized to it
  and the renderer re-measures whenever it changes.
- **Anything anchored to an edge must clear `--ui-right` and friends.**
  `fitViewport` sizes the app to the _largest_ of its three candidate
  viewports, so it is deliberately allowed to be bigger than what the user can
  see — right for the background, which should reach into every corner, and
  wrong for a control, which lands in a strip that cannot be tapped at all. On
  an iPad the maze's turn buttons, anchored 22px from the right, could not be
  pressed; sliding them 173px left made them work and 172px did not. An edge
  that sharp is a boundary, not a hit-testing quirk — and the throttle beside
  them was fine throughout because it is anchored to the _left_. fitViewport
  now publishes the overshoot on each side and the HUD, the sticks and the
  banner all add it to their offsets.
- **Coplanar faces z-fight.** The cottage's doorway recess and its door both
  used to end exactly on the wall's front face (z = 2.1 in house units), which
  showed up as brown lines flickering across the door. Anything laid _on_ a
  surface here — recesses, sills, panes, the mat — has to stand a little proud
  of it, and the comments say by how much.
- **A deployed build tells itself when it's stale.** `core/updates.ts` polls
  the `version.json` the site build writes next to the game, and offers a
  reload when the stamp changes. It clears the caches before reloading —
  a plain reload would be served the same stale page by the service worker.
  All but one: `chofter-assets` holds the content-hashed images and is left
  alone, because those bytes can't go stale. Development has no
  `version.json`, so it's a no-op there.
- **All environments live in the scene at once** and are toggled with
  `.visible` (`meadowGroup` vs `interior.group`) rather than added and removed.
  They're small, and it makes level switching instant. `ctx.setEnvironment()`
  flips them along with sky, fog and lights; `ctx.configureFlight()` re-bounds
  the player and re-frames the camera. Every level must call both in `enter()`,
  including level 1 — otherwise going back would inherit the other's settings.
- **The play area now reaches the dome wall, and the camera is fenced in.**
  The food is in the honeycomb lining the shell, so the bee has to be able to
  fly right up to it (`INTERIOR.boundsRadius` 31.5 against a dome of 34). No
  amount of arithmetic makes that work by itself — the rig sits
  `cameraDistance` behind the bee, so flying at the wall would always put the
  camera outside it. What makes it playable is `rig.setEnclosure()`, a sphere
  the camera may not leave (`INTERIOR.cameraEnclosure`): the boom shortens as
  the bee closes on the comb and the shot tightens instead of turning inside
  out. Any level played against a wall wants the same thing; pass
  `cameraEnclosure` in its `configureFlight()`.
- **The enclosure swings the camera round; it does not shorten the boom.** The
  first version walked the eye in along the line from the bee, which sounds
  right and isn't: at a food cell the bee is a unit and a half off the comb, so
  the instant the shot faced inward there was no room behind her at all. The
  boom collapsed from 11.5 to 1.5, the screen filled with honeycomb, and the
  bee dropped off the bottom edge. There is no _distance_ that frames that
  shot, only a _direction_, so `clampToEnclosure` keeps the boom and rotates it
  to the nearest legal one — the camera lifts and looks down instead.
- **The soft boundary needs a hard clamp behind it.** The edge of the play area
  is a push, not a wall, so it only holds if it can stop `FLIGHT.maxSpeed`
  within `FLIGHT.boundsGive`: a push alone balances the stick at whatever
  overshoot generates top speed. It used to ramp over 6 units, which balanced
  **2.6 units past the edge** — invisible in the meadow until you notice the
  bee sitting inside the boundary hedge, and fatal in the royal chamber, where
  holding the stick at the wall parked her _inside_ the comb. The give is now 1
  unit and the position is clamped there as well.
- **A disc plus a ceiling is a cylinder, and a cylinder doesn't fit in a dome.**
  `boundsRadius` with `maxHeight` puts the corner of the play volume outside
  any domed shell — in the chamber that was 33.4 out against a shell of 34, so
  flying to the edge at full altitude went through the roof. `bounds.sphereRadius`
  (`INTERIOR.boundsSphere`, set via `configureFlight`) rounds the corner off by
  giving up horizontal reach as you climb. It deliberately never touches the
  height: that's the one axis the player sets directly, and sinking someone who
  asked to be at the top of the room reads as broken controls, not as a wall.
- **The camera can't line up behind the bee while the stick is held, and it's
  not a bug you can tune away.** The stick is read in the camera's frame, so
  turning the camera turns the bee's heading by the same amount: the angle
  between them is a fixed point of the loop, and no gain closes it. Hold the
  stick 90° off forward and the bee flies side-on to the camera indefinitely —
  measured at 89°, whatever `yawGain` says. What _can_ be fixed is the moment
  the thumb comes off, when there is no loop left: `followYaw` switches to
  `yawIdleGain` / `yawIdleMaxRate` and comes round in about a second. It used
  to stop dead instead, gated on `planarSpeed > 1.2`, which a released stick
  drops under inside a second — that is what left the bee parked sideways.
  It aims at `bee.heading`, not the velocity direction, because the heading
  still means something at a standstill.
- **A small screen gets a wider shot** — `CAMERA.smallScreen`, applied by
  `Game.syncViewportZoom()` off the _shorter_ side of the viewport so it
  catches a phone either way up and leaves an iPad alone. It multiplies the
  level's own zoom, so anywhere the boom is already close to something solid
  has to say so: `maxCameraZoom` in `configureFlight` caps it, and the cottage
  interior sets it to 1 because the room is only half a unit wider than the
  boom needs. Note the deeper limit — a portrait phone has an aspect of 0.46,
  so it sees 4.4 units across against an iPad's 12.8, and pulling back scales
  both axes. Distance alone can't close that; widening the FOV on a narrow
  aspect is the lever if it's ever needed.
- **A shot that has to frame something is computed, not written down.**
  `rig.framedEye()` works out where the camera must stand for the dance mat to
  fill the screen, from the real FOV and aspect, so the board is as large on a
  portrait phone (where its width is the constraint) as on an iPad (where its
  depth is). It bisects on the projected corners rather than using the
  small-angle shortcut: at this distance perspective is severe — the near edge
  subtends far more than the far edge — and treating them alike put the back
  row off the top of the screen. Recomputed each frame, so a rotate re-fits.
- **The mat's camera pitch is a gameplay number, not a look.** The bee waits
  over the centre pad, and from a low angle she stands directly in front of the
  pad behind her: at `DANCE.cameraPitch` 1.0 that pad was measured **100%
  hidden**, so a cue landing there could not be answered. 1.25 puts the worst
  covered target at 22%.
- **The maze is a grid, so its walls are arithmetic rather than collision.**
  `levels/maze.ts` holds the generation and solving with no Three in it at all;
  `render/geometry/maze.ts` only draws it. Keeping the bee inside is then a
  matter of finding her cell and clamping against whichever of its four sides
  are walled.
- **A cell's free space is a plus, not a square.** Two corridors crossing, with
  a tree at each of the four corners between them — so the only place to keep
  her out of is where _both_ offsets are past the corridor's half-width. The
  first version clamped one axis whenever the other passed `half - w`, which is
  a far bigger region than the posts and, once the corridors were widened,
  bigger than the cell: at a half-width of 7.5 in a half of 9 it meant that
  anywhere more than 1.5 off the centre line she could not reach the boundary
  at all. An invisible wall across every doorway with the corridor plainly
  visible through it.
- **The maze camera doesn't move out of the way; the wall does.** The rig sits
  `cameraDistance` behind the bee, and round a corner that is solidly inside a
  hedge. Moving the camera was tried first — swinging the boom up over the
  hedge whenever the way behind was blocked — and a maze blocks it constantly,
  so the shot spent its life climbing and dropping. Now the camera stays put
  and the wall in front of it fades out (`fadeInFront` in
  `render/geometry/maze.ts`).
- **What to fade is decided by depth against the bee, not distance from the
  eye.** Distance can't tell a bush blocking the view from the bush standing
  beside her — both are a few units off — so a range wide enough to clear the
  first washed the whole maze out, and one narrow enough to spare the second
  left the bee hidden behind a solid hedge. The shader compares each fragment's
  view depth with hers (`setFadeDepth`), so only what is genuinely in front of
  her goes. Any shot that isn't the chase rig has to turn it off: from the
  survey 180 units up the entire maze is "in front of her", and the first
  version faded all of it and left a scent trail over an empty field.
- **Fragments below the cutoff are discarded, not drawn faint**, because a
  transparent fragment still writes depth — a ghost you can see through would
  otherwise hide the bee behind it.
- **The maze has its own steering and its own controls.** Camera-relative
  flying falls apart in corridors: the camera is often part-way round a corner,
  so "left" stops meaning "down that lane". `FlightSettings.steering: "tank"`
  drives along her nose and turns her on the spot, and the floating thumbstick
  is put away for a pair of vertical controls that can only say what they mean
  — `core/throttleStick.ts` on the left for forward and back, `turnButtons.ts`
  on the right where the altitude slider would be. It also removes the yaw
  feedback loop, so the rig follows her briskly rather than gently.
- **The corridor clamp is measured, not derived.** Worked out from the bush's
  radius on paper it ignored how much of a squashed blob is missing at flying
  height, and stopped her 1.3 units short of anything — an invisible wall with
  daylight beyond it. Raycasting sideways from every corridor centre at every
  flyable height puts the nearest leaf at 8.07, so `MAZE.corridorHalfWidth` is
  7.5: half a unit for her own body.
- **A shot that leaves the level's own scale needs the fog moved.** The Windy
  Woods fog out at 62 units precisely so you can't see across the maze from
  inside it. The survey shot stands 110 above the middle, so without
  `setFogScale` the big reveal was a flat wash of nothing — and the scent motes
  are two pixels across from up there, which is why `ScentTrail.update` takes a
  scale. Both ease in with the rise.
- **An obstacle that tapers has to be tested as a taper, above its tip as well
  as along it.** The Bear's Lair asks each spike how wide it is at the bee's
  height, which is zero anywhere past the point — and the first version still
  compared that against her radius, so the empty air above every spike was
  solid for a body's width either side. That air is the middle of the gap: the
  one place the player is aiming for. Past the tip the only thing near is the
  point itself, and a point is tested as a point (`gateHit` in
  `render/geometry/lair.ts`).
- **A side-on cave wants no depth at all.** The floor and roof were first built
  eighteen units deep, and from a camera off to one side they projected as huge
  diagonal bands running up to the horizon, swallowing half the frame and
  leaving the playable slot looking tiny. Nine units — just enough to hold the
  obstacles — reads as the flat slot the game is actually played in.
- **The Lair's opening shot is held, not followed.** The chase rig sits
  directly behind the bee, and directly behind her is a straight line through
  the arch she is flying into: the camera went through the boulders the moment
  she moved. It stands still outside instead and lets her recede into the cave,
  which is the better shot anyway, and the pan then swings it round to her left.
- **The bee is drawn half again as big in the Lair.** The side-on camera stands
  nearly thirty units back because that is what fits the cave, and at that range
  she was a thumbnail — unreadable against a gap, which is the whole game.
  `LAIR.beeScale` is a framing number; her collision radius is set against the
  cave and doesn't follow it.
- **`vertexColors: true` needs a `color` attribute even when you only want
  `instanceColor`.** This has now caught three separate things: the particles,
  the maze's falling leaves and the scent trail, all of which rendered black
  until given a flat white attribute. `whiten()` in `render/geometry/maze.ts`
  does it; `fx/particles.ts` has its own copy and the note that explains why.
- **Reach in the chamber is a cylinder, not a sphere.** Feeding used a single
  3D distance of 2.5 against babies perched at 2.3, so at any sensible cruising
  height you were out of range of a baby directly beneath you and every feed
  needed a descent first. `INTERIOR.feedRadius` is now measured across the
  floor with `feedHeight` allowed on top — the same split the meadow uses to
  harvest a flower — and the height covers the whole flyable column, so there
  is no dead band near the ceiling.
- **A model's `animate()` must not write to the group the caller positioned.**
  The queen's bob originally set `group.position.y` directly, which silently
  dragged her from her dais down to the floor. Bobs and sways belong on an
  inner group. The babies were a subtler version of the same thing: the ring
  yaws each one to face out of the circle, and `animate` wrote `rotation.x` on
  that same group — Euler order XYZ applies x outermost, so they pitched about
  the _world's_ x axis rather than their own. The ones facing across the room
  tipped sideways and the ones facing away lifted their behinds instead of
  their heads. `createBaby` has an inner pivot now: the ring owns position and
  yaw, `animate` owns everything else.
- **The wasp's speed and `loseRadius` are coupled.** It is now slightly _faster_
  than the bee (`WASP.speed` 10.2 vs `FLIGHT.maxSpeed` 9.5) and escapes by
  cornering badly instead — at the original 7.2 a straight-line flee outran its
  interest in about eleven seconds and the 30-second chase could never be held
  at all. If you slow the wasp down, widen `loseRadius` to match, and re-check
  that a fleeing player can actually bank the full countdown.
- **Every level places the bee in `enter()`** via `ctx.placeBee()`, so arriving
  from any other level (or from the picker) is well-defined. A level that skips
  it inherits wherever the last one left the bee, and the camera has to chase
  across the map to catch up.
- **Rhythm timing leads with the frame clock and eases toward the audio clock.**
  Neither works alone: frame deltas drift off the track within a few bars, and
  the audio clock is wrong in both directions — it keeps running while the game
  is paused or backgrounded (come back to find the whole round expired), and it
  _stops_ if the context is suspended (which would stall the level forever). See
  `updateDance` in `levels/level4Cottage.ts`; a large divergence re-anchors the
  music, never the game.
- **Indoor rooms are sized around the camera, not the bee.** The chase rig sits
  behind and above, so a room narrower than `boundsRadius + cameraDistance` puts
  the camera inside a wall looking at nothing. Same trap as the hive dome.
- **`FLIGHT.maxHeight` is tied to the tree geometry** in
  `render/geometry/world.ts`. Change the trees and the ceiling needs to change
  with them; the constant has the arithmetic in a comment.

## Balance

All of it lives in `src/config.ts`. Current level 1 quota is 10 of each flower
(30 collections, roughly five minutes). Level 2's target is 20 hexagons at
5 pollen each, reduced from the design doc's 50 because 250 fetch trips is a
session-killer.

## Dev tools

`?unlock=1` on the dev server opens every level on the map and fills in a
codename, so you can get straight to whichever one you're working on. Dev
builds only — it writes to the same save a player uses, and a link shouldn't be
able to do that to a child's progress.

`chofter.controls` is the maze's controls, from the console of a device that
hasn't got one worth the name — it ships in every build, because `window.game`
is dev-only and these controls have now failed twice on an iPad while working
on everything else.

```js
chofter.logControls = true; // narrate every press and release
chofter.controls.state(); // steering, turn, throttle, what's on screen
chofter.controls.turn(1, 1000); // turn right for a second, bypassing the button
chofter.controls.throttle(1, 1000); // drive, bypassing the track
chofter.controls.tap.left(); // press the real button, through the DOM
chofter.controls.tap.right();
chofter.controls.help(); // all of the above, printed
chofter.controls.at(x, y); // what is actually on top at that point
```

The point of the pairing: if `turn()` moves her and `tap()` doesn't, the fault
is in the button rather than in the flight model, and `at()` says whether
anything is sitting on top of it.

- Tap the top-right corner (or press `` ` ``) to toggle the FPS / draw-call readout.
- In dev builds, `window.game` is the live `Game` instance — handy for poking at
  `game.bee.position`, `game.save.data`, or flight constants from the console.
