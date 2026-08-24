# Working on Squirrel Glider

A self-contained 3D web game in this repo of games. TypeScript + Three.js +
Vite, built to one `index.html` that the gallery in the repo root publishes.
This file is how to work on it; see the root `README.md` and the `bee` game for
the wider patterns.

## Commands

```bash
npm --prefix squirrel-glider run dev         # dev server, hot reload
npm --prefix squirrel-glider run typecheck   # tsc --noEmit
npm --prefix squirrel-glider run build       # typechecks, then one self-contained dist/index.html
```

Formatting and linting are the repo's, run from the root:

```bash
npm run format                       # prettier --write .
npm run lint                         # eslint .
```

**Run `npm run format` before every commit**, not as a follow-up — an
unformatted commit makes the next format a diff about nothing.

Always typecheck before calling a change done; `npm --prefix squirrel-glider run build`
does it for you.

**Before pushing, build the whole repo** — `npm run format && npm run lint &&
npm --prefix site run build` from the root. Building this game alone is not the
same thing: the gallery build is what stages what actually gets published, and
it is what a push puts in front of somebody. Fix whatever it finds before
pushing, not after.

## House style

Copied from the rest of the repo, so code moves between games unchanged: double
quotes, no bracket spacing, no parens on single-arg arrows, trailing commas, 80
columns, braces on every `if`, and `Array<T>` over `T[]`. The configs
(`.prettierrc.cjs`, `eslint.config.js`) live at the repo root and cover this
folder automatically.

- **Prefer generating 3D assets in code** — merged primitives with vertex
  colours, toon-shaded, one draw call per assembly — the way the bee game does.
  Model files are the exception, for the few things worth them.
- **Comments explain why, not what.** Record a constraint or a decision that
  isn't visible from the code.
- Keep tunable numbers together and named, not as magic numbers at the call
  site.

## The flight model

The squirrel is a **three-degree-of-freedom point-mass glider** — the model an
aircraft is normally taught with — in `src/entities/squirrel.ts`:

```
dv     = -g sin(gamma) - drag
dgamma = (lift cos(bank) - g cos(gamma)) / v
dpsi   =  lift sin(bank) / (v cos(gamma))
```

Everything the game feels comes out of those three lines: the speed a dive
builds, the float of a pull-up, turns that tighten as they slow. Nothing
scripts any of it. The coefficients in `GLIDE` are set from measured wingsuit
flight — about 150km/h hands off, and a vertical dive capped at 378km/h
against a world speed record of 374.8. The glide is four and a fifth to one,
which is the wind-tunnel figure for an elite pilot in a high-performance suit
(an ordinary one runs two to three, and the competition distance record implies
six).

Seven things this has already caught someone out on, each with the symptom:

- **A commanded pitch rate is free height.** Letting the stick add to `dgamma`
  directly flies beautifully and cheats: measured, holding the stick half back
  turned a 1393-unit glide into a 4105-unit one, and every flight became "hold
  back and wait". The whole game is a budget of height, so anything that moves
  the nose has to arrive as _lift_ and be charged induced drag for it. See
  `GLIDE.snap` — a washed-out transient, so a movement of the stick is worth
  something and a held stick is worth only what its position deserves.
- **Forward is `(sin(heading), cos(heading))`.** Write the look target as the
  negation of the backwards vector and it is easy to drop a sign, which aims
  the camera up the valley at the cliff. The symptom is a dark slab filling the
  frame and no squirrel anywhere.
- **A close camera cannot be reached with a soft lerp.** At these speeds a
  camera closing five per cent of the gap a frame sits permanently behind — it
  was measured at 100 units back on a shot asked to be 11. The looseness has to
  live in the _heading_ the camera uses, with the eye then placed exactly.
- **Anything hung in the valley must be placed off a flight that was actually
  flown**, and flown along the same line it is placing things on. The
  arithmetic glide path is higher than the real one (the leap starts below
  flying speed, so the first seconds are a dive), and a turn costs height on
  top of that. `Terrain.flyThePath` runs the real model at startup for exactly
  this reason; ignore it and every arch hangs above the squirrel's head.
- **A point-mass glider has no attitude, and you have to give it one.** It
  points exactly where it is going, always — and since the camera follows that
  path too, a screaming dive and a gentle glide looked nearly identical. Both
  pitch controls worked perfectly and neither one looked like it did anything.
  The body is drawn at a real angle to its path now (`AOA`), which is honest:
  a gliding squirrel flies at about forty degrees angle of attack.
- **A linear pitch stick is a trap.** Diving and air-braking are expensive on
  purpose, but linear means a thumb resting slightly off centre pays that
  price continuously and by accident. Measured: a pilot who nudged the pitch to
  chase every arch landed 28% short of one who never touched it, and took 7
  arches instead of 17. An expo curve on the axis (`CONTROL.pitchExpo`) put it
  back to 17 and made using the control _better_ than not using it.
- **Scale the cues to the speeds the game actually flies.** The first version
  read "how fast are we going" as trim-speed-to-top-speed, and since a glide
  sits within a unit or two of trim, every cue in the game read zero for the
  whole flight and the lens never opened once. `FEEL` holds the real range.

Speed is read in **body-lengths per second**, not units per second: a real
flying squirrel covers about twenty of its own lengths a second and a wingsuit
pilot twenty-five. That is why `SQUIRREL.scale` and `CAMERA.distance` are small
— the same flight drawn three times larger reads as a slow animal whatever the
number in the corner says.

## Layout

```
src/
  main.ts        the game
  assets/        images and models (imported by Vite; empty to start)
index.html       the entry point; the app mounts into #app
vite.config.ts   single-file build, relative base, .glb treated as an asset
card.png         the gallery thumbnail — replace the solid colour with real art
game.json        title, description and status, read by site/build.mjs
```

## Publishing

`game.json` has a `status`:

- `"development"` (the default) lists the game in the gallery's **In
  Development** section, marked as unfinished and buggy.
- `"published"` moves it into the main list of games.

Change it only when the game is actually ready to be played.

## Verifying a change

There is no test suite; verify by running the game and driving it. In a dev
build you can reach the live scene from the browser console. Measure anything
numeric in the running game rather than eyeballing it.

When testing a **built** copy served by the gallery, a service worker may hand
you the previous build — hard-reload or clear the caches, or you will be
debugging a page that no longer exists.
