# Whale

You are a beluga whale on a coral reef. Swim the length of it, eat the fish
that get into your mouth, and don't eat the plastic.

Built the way the rest of this repo is: TypeScript, Three.js and Vite, every 3D
asset generated in code, and one self-contained `index.html` at the end of it.
[docs/plan-for-app.md](docs/plan-for-app.md) is what it was meant to be;
[CLAUDE.md](CLAUDE.md) is how to work on it.

## Playing it

```bash
npm --prefix whale run dev
```

Drag on the left half of the screen to swim — the thumbstick plants itself
wherever your thumb lands. The slider down the right sets how deep you are:
the top of it is the sunlit surface and the bottom is the sand. Both are the
bee game's controls, unchanged, because a child who has played that one should
not have to learn anything to play this.

On a laptop, WASD or the arrow keys swim and Q and E change depth.

## What is in it

- **A reef 1,560 units long**, with a floor that rolls between a 25-unit
  sandbank and a 99-unit trench. Over a sandbank the floor holds you shallower
  than the slider asked for, and the marker on the slider comes away from the
  knob to show you why.
- **Coral, rocks and sea grass** scattered on the floor — four kinds of coral,
  each one InstancedMesh, each instance tinted its own colour. The grass sways;
  nothing else on the floor moves.
- **Dappled light**, as a tiling caustic pattern multiplied over the sand and
  scrolled, and **sunbeams** coming down through the surface.
- **A surface overhead** with two wave trains crossing on it, which you can
  swim up to and along.
- **Fish in schools**. Each school swims a slow loop; about half of them are
  shy and scatter when you get close.
- **Drifting plastic** — bottles, bags and six-pack rings. Eating one ends the
  run.
- **A pink coral arch** at the far end, which is the finish.

## Architecture

`Game` owns the scene, the whale and the reef, and drives everything from a
fixed-timestep loop (`SIM.step`, 1/60) with an interpolated render — so actors
keep a `prevPosition` and a `render(alpha)`. Every tunable number is in
[src/config.ts](src/config.ts).

Five things that have already caught somebody out here:

- **The floor is a function first and a mesh second.** `Reef.floorAt` is what
  the whale, the coral, the fish and the camera all ask; the mesh is only that
  function sampled on a grid. Building the mesh first and raycasting it for
  ground height is how you get a whale that swims through a sandbank on one
  frame in ten.
- **An ellipsoid's surface is not a sphere's.** The whale's eyes are placed on
  the melon by scaling a unit direction by the melon's three radii. The first
  pair used a guessed offset and ended up inside its head.
- **The turning circle comes out of `SWIM.accel`, not `SWIM.turnRate`.**
  Holding the stick over is a sustained turn of radius about v²/a. At an accel
  of 26 that was seven units, and a thirty-four-unit whale spun inside its own
  length like a top.
- **A share of the gap per frame is not a rate.** The depth follow was written
  that way and sank faster on a 120Hz iPad than on a 60Hz laptop. Anything
  eased here uses `1 - exp(-rate·dt)` or a plain rate per second.
- **The surface is a ceiling.** Any ray heading upward meets it before it
  meets anything tall and far away, so an opaque surface hides the finish arch
  behind a sheet of water for the whole approach. It is deliberately not
  opaque.

## Verifying a change

There is no test suite. `window.game` in a dev build is the live `Game`, and
that is the toolkit: most of its fields are `private`, which TypeScript
enforces and the console does not.

```js
const g = window.game;
g.loop.stop(); // take over the clock
document.querySelector(".big-button").click(); // start it
g.stick.x = 0;
g.stick.y = -1;
g.stick.magnitude = 1; // full ahead
g.depth.value = 0.5; // half way down the slider, 0..1
for (let i = 0; i < 600; i++) {
  g.update(1 / 60);
  g.render(1, 1 / 60);
}
```

`g.fish.fish` is every fish and `g.plastic.pieces` every piece of rubbish, so
an autopilot that chases the nearest fish ahead is a few lines and is how the
eating was checked. Measure rather than eyeball anything numeric — the turning
circle above is quoted from a traced path, not from a guess.
