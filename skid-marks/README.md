# Skid Marks

A top-down arcade racer, and a track builder to go with it. Drive one lap of a
circuit against three rivals, hold the car sideways through the corners and
black the road with rubber — or draw a circuit of your own with a finger and
race that instead.

TypeScript + Three.js + Vite, built to one self-contained `index.html` and
published by the gallery in the repo root.

## Running it

```bash
npm --prefix skid-marks run dev
```

Then open the URL Vite prints. On a tablet on the same Wi-Fi, use this Mac's LAN
address (`ipconfig getifaddr en0`) with the same port.

For the installed-app feel, **Share → Add to Home Screen** and launch from the
icon.

## Playing it

One floating thumbstick, planted wherever the finger lands — the caterpillar
game's, which the plan asks for by name. Here it is the tiller and the throttle
at once: push the way you want to go, push harder to go faster, and push back
against yourself to brake. There is no separate brake button and there does not
need to be one.

The shot looks straight down and never turns, so the way you push the stick is
the way on the screen the car goes. That is the one reason this game needs no
camera-relative arithmetic anywhere in it.

The grass will slow you down and the wall at the edge of it will not let you
past. One lap.

## Building a track

**Build your own track** on the front screen opens the builder. Draw a loop with
a finger; then drag the start line, ramps, oil and mud onto the road, pick one
of the three worlds, and save it. Saved tracks live in this browser and appear
under **Custom tracks** on the front screen, where they can be raced, edited or
thrown away.

**Export** shows the track as JSON with a button to copy it. That is the whole
sharing story for now — the intention is a server one day, with short codes for
swapping tracks about, and until then this is how a track leaves the device.

## Architecture

Worth knowing before changing anything:

- **The camera is orthographic and looks straight down**, and there are no
  lights in the scene at all. Every material is an unlit `MeshBasicMaterial`.
  That single decision is what makes this a 2D game made of sprites, which is
  what the plan asks for.
- **Nothing writes to the depth buffer**, so what is drawn over what is decided
  purely by draw order. Every mesh states its place with `order(LAYER.x)`;
  leaving it to three's own sort is near enough right by accident and wrong
  where it matters — the car's shadow came out on top of the car in mid-air.
  The `LAYER` heights are kept only to stop coplanar faces fighting.
- **Colours are constructed, not converted.** `new THREE.Color(hex)` already
  lands in the linear working space, so a `convertSRGBToLinear()` on top of it
  renders everything at about a third of its brightness. The tell, when this was
  wrong, was that the grass looked right and nothing else did — the grass is the
  scene background, which the renderer writes out untouched.
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

## Commands

```bash
npm --prefix skid-marks run dev         # dev server, hot reload
npm --prefix skid-marks run typecheck   # tsc --noEmit
npm --prefix skid-marks run build       # typechecks, then one dist/index.html
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
