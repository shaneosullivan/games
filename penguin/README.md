# Penguin

Slide down a snowy mountain on your tummy. Scoop up the fish on the way, go
round the trees, burst through the snowmen, and shoot off the end of the ice
into the sea.

Built from [docs/plan-for-app.md](docs/plan-for-app.md). One self-contained
`index.html`, published by the gallery in the repo root.

## Playing it

One control: drag anywhere on the screen and push the way you want to go. That
is the caterpillar game's floating thumbstick, which the plan asks for by name —
the base is planted wherever your finger lands, so there is never a control to
find before you can move. The arrow keys and WASD work too, for a laptop.

There is no brake button and no need for one. The penguin has a heading, and
the mountain pushes it along that heading by however much of the slope points
that way: aim down the fall line and you go, turn across the hill and you slow
down. That is how anybody stops on snow, and it is the whole game.

Things you will meet on the way down:

- **Fish**, hanging over the snow, just off the quick line — so every one of
  them costs you a turn.
- **Trees and rocks.** You bump off them. You do not fall over, you do not lose
  your speed, and there is no way to lose the game; you are just knocked off
  the line you chose, with the next tree coming up.
- **Snowmen**, which are the opposite: aim at one and it comes apart.
- **Kickers**, cut into the ground rather than built on it, worth about a
  second of air apiece.
- **A frozen lake**, once, halfway down. On the ice you can still turn the bird
  — spin it right round if you like — but turning does nothing to where you are
  going. You carry on along the line you were on when you reached the shore.
- **The sea**, at the bottom, past the finish banner. The ice runs out and you
  go straight in, which is what a real penguin does.

## How it is built

```
src/
  config.ts          every tunable number, grouped by system
  core/              the loop, the thumbstick, the seeded rng, the zoom lock,
                     and the wind (made, not loaded)
  render/            the stage and the toon materials
  entities/
    hill.ts          the mountain: one height function, and a mesh sampled off it
    penguin.ts       the bird, and the way it slides
    props.ts         trees, rocks, snowmen, shrubs and the course flags
    fish.ts          what you are collecting
    snowfall.ts      the weather, in a box that travels with you
    sky.ts           the ring of far peaks and the clouds
    finish.ts        the banner, the crowd and the ones already in the water
  ui/                the readouts, the two cards and the stylesheet
  game.ts            owns the scene and everything in it
```

The hill is arithmetic, not a model. Everything asks the height function rather
than the mesh — the penguin rides it, the trees are planted on it, the fish
float above it and the camera keeps out of it — and a model would have to be
raycast a few hundred times a step to answer the same questions.

All the art is generated in code: merged primitives with vertex colours,
toon-shaded, one draw call per assembly. There are no model files and no
textures.

See [CLAUDE.md](CLAUDE.md) for the commands and the house style.
