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
| 7 — Wall-clock day system                                    | not started |

## Levels

The welcome screen is the world map (`assets/planning/levelmap.png`, downsized
into `src/assets/`), with a pin on each land. Pins sit at fractions of the image
so they track any scale — see `levels/lands.ts`. The Mellow Meadow holds levels
1–3 and is always open; Caramel Cottage is level 4 and unlocks after level 3;
the rest are padlocked or marked as still to come. Picking a land with more than
one level shows those levels beside the map.

Your current level is preselected, so plain "Continue" resumes. Choosing a level
you've already completed replays it from the start (level 1 resets its flower
counts), and your furthest unlock is kept either way.

**1 — Sunny Meadow.** Gather 10 each of white rose, yellow flower and orange
flower. The hive on the branch grows with every collection. When it's whole it
lights up, your bee is crowned queen with a burst of sparkles, and you fly in
through the door to finish.

**2 — The Royal Chamber.** Inside the dome. The queen sits on her dais with six
babies ringed around her on perches. You're a worker now: hover at one of the
three wall stores to load that colour of pollen, carry it to a baby whose
floating bubble asks for it, repeat. Babies get hungry on their own clocks and
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
once rather than reacting faster. 90% opens the door.
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
- **Overlays size themselves to `visualViewport`.** The iPad keyboard doesn't
  shrink the layout viewport, so a centred card stays put and the keys cover the
  codename field. `trackVisualViewport` in `ui/overlays.ts` pins the overlay to
  the visible area instead. The codename field is also sanitised on every input
  and hardened against iOS AutoFill (`name`, `autocomplete`, `data-*-ignore`),
  which is what put `[object Object]`-shaped junk in it.
- **Audio is a WebAudio synth**, no files. It must be unlocked inside a real
  touch handler — that's what the Start button on the codename screen is for.
- **Zoom is locked** in `core/lockZoom.ts`. iOS Safari has ignored
  `user-scalable=no` since iOS 10, so the viewport meta alone does nothing;
  it takes six separate listeners (gesture events, multi-touch touchstart,
  double-tap touchend, dblclick, ctrl+wheel, ⌘±) plus `touch-action: none`.
  Form controls are exempt so the codename field still focuses. If you add any
  UI that needs a native gesture, exempt it there rather than loosening the
  global rules.
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
- **The dome is much wider than the play area** (radius 34 vs bounds 15). At the
  edge of the bounds it's the _camera_, sitting behind and above the bee, that
  would punch through the shell. If you widen `INTERIOR.boundsRadius`, raise
  `maxHeight` or pull the camera back, check `sqrt((bounds + cameraDistance)^2 +
(maxHeight + cameraHeight)^2)` still clears `domeRadius` — pulling the rig
  back to 9.6 for the feeding levels is exactly what forced 30 up to 34.
- **A model's `animate()` must not write to the group the caller positioned.**
  The queen's bob originally set `group.position.y` directly, which silently
  dragged her from her dais down to the floor. Bobs and sways belong on an
  inner group.
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

- Tap the top-right corner (or press `` ` ``) to toggle the FPS / draw-call readout.
- In dev builds, `window.game` is the live `Game` instance — handy for poking at
  `game.bee.position`, `game.save.data`, or flight constants from the console.
