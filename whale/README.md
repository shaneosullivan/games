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
- **The surface**, which is somewhere you can actually get to. A whale
  breathes air: take the slider to the top and it puts its back out, blows a
  spout and takes a breath, and the shot comes up out of the water with it.
- **Sky**: clouds, gulls wheeling above the waves, and gulls sitting on the
  water that get up and go when a whale comes up underneath them. None of it
  is drawn while the camera is under.
- **A kelp forest** in stands you swim into — long golden stipes with blades
  hung off them, each blade carrying the gas bladder that holds the plant up.
  Each plant is scaled to the water above it, so a stand in a trench is a tall
  wood and one on a sandbank is a low one.
- **Gardens.** Coral, rock and weed come in bunches with bare sand between
  them rather than evenly scattered. A reef laid out at random reads as
  wallpaper.
- **Something to find by doing nothing.** Stop on the surface and after five
  seconds a gull comes down and rides on the whale's back until it moves off.
  Stop underwater and one or two fish leave their school, come over and nibble
  at its skin, and the whale blows the odd bubble. Nothing is gained by it and
  nothing is lost by never doing it.
- **Breaching.** Hold the climb and it builds — the first second is a whale
  rising and the fourth is a whale coming up like a torpedo, nose swinging to
  seventy-five degrees. Arrive at the surface fast enough and it leaves the
  water altogether: four fifths of its own length of air, two seconds of it,
  and the sea gets the lot on the way back down.

## Architecture

`Game` owns the scene, the whale and the reef, and drives everything from a
fixed-timestep loop (`SIM.step`, 1/60) with an interpolated render — so actors
keep a `prevPosition` and a `render(alpha)`. Every tunable number is in
[src/config.ts](src/config.ts).

Twelve things that have already caught somebody out here:

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
  behind a sheet of water for the whole approach. It is deliberately thin from
  below — and thick from above, where the sea is not a window. One material,
  swapped as the camera crosses; see `Reef.setAir`.
- **A breach is integrated once, not twice.** `Whale.update` already moves the
  whale by the climb rate it is handed, so `Game.breach` only applies gravity.
  Moving it again there as well had it rising at twice the speed it was thrown
  at, and reaching an apex of fifty units off a launch that could only account
  for thirty-four.
- **The wind-up has to survive the last few units.** It was set to stop
  building six units short of the target depth, which meant it unwound over
  exactly the water the whale needs to be quickest in. The whale arrived at the
  surface at the breach threshold to four significant figures and never once
  got out. See `SWIM.urgeGap`.
- **`camPitch` is a ratio against the base climb rate, so it must be
  clamped.** A breach leaves the water at nearly four times that rate, which
  put the eye sixty-eight units below the whale and aimed it at the sky.
- **Turning a wing round does not turn its flap round.** The gulls' wings are
  one geometry pointing along +X, and the left one is rotated by π about Y to
  face the other way — so it looks as though its flap needs the opposite sign
  too. It does not: the flap is applied before the turn, and a rotation about
  Y preserves height, so the tip goes up and is then carried across still up.
  With the sign flipped the birds rowed along like pairs of oars.
- **Scale a plant in one axis and you scale its leaves too.** The kelp was
  built at unit height so the reef could stretch each plant in Y to fit its
  water — which stretched every blade by a factor of seventy, into threads a
  fraction of a unit wide and sixty long. The forest came out as a stand of
  bare wires. It is built at a real size now and fitted with one uniform
  scale.
- **Fish will swim straight through a whale.** `Fish.keepOut` treats the whale
  as an ellipsoid in its own frame: divide a point by the half-extents and
  anything inside the unit sphere is inside the whale, so push it back out
  along the same direction. The same arithmetic run forwards is what puts the
  two nibblers _on_ the skin.
- **Coral is the triangle budget.** Each one is a branching structure of forty
  twigs, and there are hundreds. Open-ended cylinders and one fork level fewer
  took the reef from 1,258k triangles to 395k with no visible difference — the
  cylinder caps were all inside the joints.

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

`g.fish.fish` is every fish, `g.plastic.pieces` every piece of rubbish and
`g.sky.gulls` every bird, so an autopilot that chases the nearest fish ahead is
a few lines and is how the eating was checked. `g.flight` is the whale's
vertical speed while it is out of the water and null while it is in it, and
`g.air` is how far the shot is above the waves.

Measure rather than eyeball anything numeric. Everything quoted here is from
the running game: the turning circle from a traced path, the breach from the
frame it left the water to the frame it came back, and the triangle counts by
walking the scene.
