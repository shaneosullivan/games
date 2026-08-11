# Bee

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

## What's built

| Phase | Status |
|---|---|
| 0 — Scaffold, PWA, fullscreen iPad | done |
| 1 — Flight model, floating joystick, chase camera | done |
| 2 — Procedural bee, three flower types, meadow, toon look | done |
| 3 — Pollen collection, HUD, codename, save, Level 1 complete | done |
| 3b — Altitude control, hive force field, fly-in + fireworks | done |
| 4 — Level 2: the Royal Chamber (queen, babies, feeding) | done |
| 5 — Level 3: Wasp at the Hive | done |
| 6 — Wall-clock day system | not started |

## Levels

Once you've finished a level, the welcome-back screen offers a picker: any level
you've reached, with your current one preselected so plain "Continue" resumes.
Choosing a level you've already completed replays it from the start (level 1
resets its flower counts), and your furthest unlock is kept either way.


**1 — Sunny Meadow.** Gather 10 each of white rose, yellow flower and orange
flower. The hive on the branch grows with every collection. When it's whole it
lights up, your bee is crowned queen with a burst of sparkles, and you fly in
through the door to finish.

**2 — The Royal Chamber.** Inside the dome. The queen sits on her dais with six
babies ringed around her on perches. You're a worker now: hover at one of the
three wall stores to load that colour of pollen, carry it to a baby whose
floating bubble asks for it, repeat. Babies get hungry on their own clocks and
crave a random colour each time; three feeds and one grows up. When all six are
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

## Building

```bash
npm --prefix bee run build
```

Produces **one self-contained file**, `dist/index.html` (~536 kB, 140 kB
gzipped). JS, CSS and the web app manifest are all inlined — a full page load is
a single HTTP request, with no `assets/` directory to deploy alongside it.

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
- **Both environments live in the scene at once** and are toggled with
  `.visible` (`meadowGroup` vs `interior.group`) rather than added and removed.
  They're small, and it makes level switching instant. `ctx.setEnvironment()`
  flips them along with sky, fog and lights; `ctx.configureFlight()` re-bounds
  the player and re-frames the camera. Every level must call both in `enter()`,
  including level 1 — otherwise going back would inherit the other's settings.
- **The dome is much wider than the play area** (radius 30 vs bounds 15). At the
  edge of the bounds it's the *camera*, sitting behind and above the bee, that
  would punch through the shell. If you widen `INTERIOR.boundsRadius` or raise
  `maxHeight`, check `sqrt((bounds + cameraDistance)^2 + (maxHeight +
  cameraHeight)^2)` still clears `domeRadius`.
- **A model's `animate()` must not write to the group the caller positioned.**
  The queen's bob originally set `group.position.y` directly, which silently
  dragged her from her dais down to the floor. Bobs and sways belong on an
  inner group.
- **The wasp's speed and `loseRadius` are coupled.** The bee must be able to
  stay ahead (`WASP.speed` 8.7 vs `FLIGHT.maxSpeed` 9.5) but only just — at the
  original 7.2 a straight-line flee outran the wasp's interest in about eleven
  seconds and the 30-second chase could never be held at all. If you slow the
  wasp down, widen `loseRadius` to match, and re-check that a fleeing player can
  actually bank the full countdown.
- **Every level places the bee in `enter()`** via `ctx.placeBee()`, so arriving
  from any other level (or from the picker) is well-defined. A level that skips
  it inherits wherever the last one left the bee, and the camera has to chase
  across the map to catch up.
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
