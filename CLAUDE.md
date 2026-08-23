# Working in this repo

Static web games plus the generated gallery that publishes them. See
[README.md](README.md) for what it all is. This file is how to work on it.

## Layout

```
bee/            Bee Quest. Self-contained npm project, own deps, own dev server.
  src/config.ts     every tunable number in the game
  src/core/         loop, input, save, audio, rng, zoom lock, viewport fit, update check
  src/render/       stage, materials, camera rig, procedural geometry
  src/entities/     bee/wasp/bear actors, flower field, baby ring, dance mat, honey jar
  src/levels/       the Level interface, one file per level, the map's lands
  src/ui/           HUD, overlays, sliding puzzle, stylesheet
  src/game.ts       owns everything and hands levels a GameContext
shared/         the few things the games have in common. No build of its own.
  progressBar.ts    the filling bar, used by both games
  soundButton.ts    the round sound switch, used by both games
  fadeInFront.ts    the shader that dissolves whatever blocks the shot
  particles.ts      the instanced motes: pollen puffs and fireworks
site/           the gallery. Zero dependencies, no build step of its own.
  build.mjs         discovers games, builds them, generates the site, writes the PWA
  styles.css        the gallery's stylesheet, hand-written
  serve.mjs         a static server for previewing site/dist
```

Games share almost nothing: a game is a self-contained npm project with its own
deps and its own dev server, and that is the default. `shared/` is the
exception, and something earns a place in it one of two ways:

- **Furniture** — a widget a child should meet in the same form in every game,
  like the progress bar and the sound switch. Two copies would drift the moment
  one was touched.
- **One piece of machinery with fiddly parts**, like the near-fade shader. Its
  cone, its instance matrix and its discard all have to be right together, and
  a second copy is a second thing to get wrong — which is exactly what had
  happened: one game's copy had been fixed and the other's had not.

Anything else stays in the game that uses it, and adding to `shared/` means
making one of those two arguments out loud.

A shared **widget** brings its own CSS, since the games have separate
hand-written stylesheets with no class names in common.

Importing `three` from `shared/` is fine, and `particles.ts` does. It takes
care, though: each game has its own copy in its own `node_modules`, so a bare
import from above them would resolve to the one at the repo root and bundle a
second three into the game — where nothing is quite the same class as anything
else. Each game's `vite.config.ts` therefore **aliases `three` to its own
copy**, which pins any import made from up here to the three that game is
already bundling. Each game's tsconfig pins the _types_ the same way, at its own
`@types/three` — TypeScript otherwise walks up to the repo root, which a
deploy never installs, and a green local build becomes a red one on Vercel.

Both are in the new-game template, so a game scaffolded with
`npm run new-game` is born with them. Worth checking anyway once a new game
imports anything from `shared/`: its built `index.html` should contain one
three and not two.

`fadeInFront.ts` needs none of that and describes the shapes it wants
structurally instead — a real `THREE.Vector3` satisfies its `Vec3Like` without
knowing the file exists. Prefer that where it is easy; use the alias where it
is not.

Each game's `vite.config.ts` also allows `..`, so its dev server will serve a
file from above its own root.

The gallery finds games by looking for top-level folders
with a `build` script, so adding one is dropping a folder in — or running
`npm run new-game -- "My Game"`, which scaffolds one that works like the
bee (starter 3D scene, same configs, `card.png`, README, `game.json`) and
installs it. A game's `game.json` `status` is `"development"` (the gallery's In
Development section) until it is changed to `"published"`.

## Commands

```bash
npm install                      # once, at the root: prettier + eslint for the whole repo
npm run format                   # prettier --write .
npm run lint                     # eslint .  (--fix with npm run lint:fix)

npm --prefix bee run dev         # dev server on :5173, hot reload
npm --prefix bee run typecheck   # tsc --noEmit
npm --prefix bee run build       # typechecks, then one self-contained dist/index.html

npm --prefix site run build      # every game, then the gallery, into site/dist
npm --prefix site run build:site # gallery only — fast, for styling
npm --prefix site run serve      # preview site/dist on :4173
```

**Run `npm run format` before every commit**, not as a follow-up — an
unformatted commit means the next format produces a diff that has nothing to do
with the change it lands in.

**Build the whole repo before every push, and fix what it finds.**

```bash
npm run format && npm run lint && npm --prefix site run build
```

`site/build.mjs` builds every game and then the gallery, which is the only
thing that exercises what actually gets published — a game can typecheck and
run perfectly under its own dev server and still fail to build, or build and
then be staged wrong. Pushing is what puts it in front of a child on an iPad,
so the build has to have been run and come back clean first. If it does not,
fix it before pushing rather than after.

Formatting and lint rules are copied from the syncawesome repo so code moves
between the two unchanged: double quotes, no bracket spacing, no parens on
single-arg arrows, trailing commas, 80 columns, braces on every `if`, and
`Array<T>` over `T[]`. Run `npm run format` before committing — the configs are
`.prettierrc.cjs` and `eslint.config.js` at the root, and they cover every
project in the repo.

Always typecheck before saying a change is done; `npm run build` does it for
you. There is no test suite — verification is done by driving the real game (see
below), which for a game of this kind catches far more than unit tests would.

## House style

- **Every tunable number lives in `bee/src/config.ts`**, grouped by system, with
  a comment saying what it does and — where it isn't obvious — the arithmetic
  that produced it. No magic numbers at the call site.
- **Comments explain why, not what.** The valuable ones here record a constraint
  or a decision that isn't visible from the code: why the dome is wider than the
  play area, why the fog throws further in the cottage, why a face stands 0.02
  proud of another. Match the density of the surrounding file.
- **Prefer fixing the cause.** Most of the bugs in the git history were one
  level up from where they showed: babies frozen at the hive because nobody
  ticked them, a hive invisible because the bear stood on it, a "tail" in front
  because the haunches rode the torso.
- Keep the reading level plain. This is a game for a child; the user-facing
  copy should sound like it.

## Architecture, in one breath

The `Game` owns the scene, every actor and the save; a `Level` is a state
machine that gets a `GameContext` and drives them. Levels call
`ctx.setEnvironment()` and `ctx.configureFlight()` in `enter()`, place the bee
with `ctx.placeBee()`, and can take the camera with `ctx.setCameraCinematic()`.
The simulation is fixed-timestep (`SIM.step`, 1/60) and the render interpolates
between steps, so actors keep a `prevPosition` and a `render(alpha)`.

All 3D assets are generated in code — merged primitives with vertex colours,
toon-shaded, one draw call per assembly. There are no model files, no rigs and
no textures beyond the map and the two framed pictures.

**Before changing anything in `bee/`, read
[bee/README.md § Architecture](bee/README.md#architecture).** It is a list of
the constraints that have already caught someone out, each with the symptom that
found it. The ones that bite most often:

- State the `Game` owns must be **reset** by the level that uses it, and
  **ticked** by it too, above any phase early-returns.
- A model's `animate()` must not write to the group the caller positioned.
- Coplanar faces z-fight; anything laid on a surface stands slightly proud.
- Instanced meshes can't skip an instance — scale it to zero.
- `paint()` needs non-indexed geometry, and particle materials need a flat white
  `color` attribute or they render invisibly.
- Bounds are a circle about the **world origin**, which is the hive — not
  wherever the level happens to be.

## Verifying a change

The browser preview tools drive a real instance of the game. In dev builds
`window.game` is the live `Game`, which is the whole toolkit. Most of its fields
are `private`, which TypeScript enforces at compile time and the console does
not — from devtools they're ordinary properties:

```js
const g = window.game;
g.loop.stop(); // take over the clock
g.running = true; // update() no-ops unless this is set
g.switchLevel(4);
document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
for (let i = 0; i < 600; i++) {
  g.update(1 / 60);
  g.render(1, 1 / 60);
}
```

- Feed `g.stick` directly to autopilot a chase; call a level's phase methods
  (`g.level.beginEmerging(g.ctx)`) to jump to a beat without playing to it.
- **Screenshots after manual stepping can be a frame stale.** If a shot looks
  wrong, `g.loop.start()` and take it again before believing it.
- `g.save.mutate(d => ...)` to fake progress. Don't write localStorage directly —
  the save flush will clobber it.
- Measure rather than eyeball anything numeric. Puzzle difficulty in this repo
  is quoted from a breadth-first search of the actual board, not a guess.

When testing the **built site**, the service worker will serve you the previous
build. Purge it or you'll debug a page that no longer exists:

```js
chofter.reset(); // defined by every page: unregisters the worker, clears caches, reloads
chofter.diagnose(); // build, viewport measurements, caches, workers — for a device with no devtools
```

## Deploying

`site/dist` is gitignored and built in CI. Vercel: build `node site/build.mjs`,
output `site/dist`, no install command. Every build stamps a `version.json`
that running copies poll, so an open tab offers a reload within a minute of a
deploy — see [site/README.md](site/README.md).

## Target device

An iPad, held in two hands, used by a child. Nothing may need a keyboard, a
right-click or a hover. Text is large, targets are generous, and failure states
are gentle — the dance mat just plays again, and nothing in the game can hurt
you. Test at a phone-ish viewport too; the puzzle panel switches from
side-by-side to stacked under `max-aspect-ratio: 1/1`.
