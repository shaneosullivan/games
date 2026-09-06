# The Chase

You are a hare, and three dogs have seen you. Run down the wood, jump the
fallen logs, go round the stones and the brambles, and get home to the burrow
at the far end.

Built from [docs/plan-for-app.md](docs/plan-for-app.md). One self-contained
`index.html`, published by the gallery in the repo root.

## Playing it

The plan asks for the caterpillar game's controls, and adds one of its own:

- **Drag anywhere** to run. The stick is planted wherever your finger lands, so
  there is never a control to find before you can move.
- **Tap the left of the screen to jump** — or tap anywhere with a second finger
  while the first is on the stick, which is the one that actually gets used at
  speed. Space on a keyboard.

The stick is a throttle as much as a tiller, and that is the rule the whole
game hangs off. The hare is always running: hold on and it goes flat out at
sixty-two, let go and it drops to a trot at thirty. The dogs run at fifty-two,
which is between the two — so holding on pulls away, letting go hands it back,
and a bramble you failed to dodge costs about fifteen units of the hundred and
twenty you start with.

Almost everything is jumped: the logs, the stones and the brambles all stand
under nine units and a jump clears ten, lasting seven tenths of a second. Only
two things have to be gone round — the boulders and the trees standing on the
path — and those are what make you steer.

None of it is only on the path, either. The same logs, stones and brambles are
scattered out on the verges either side, so cutting a corner costs you
something.

How close they are is the gauge down the right-hand side: a tube with a paw in
the bulb that fills from the bottom as they close, green through amber to red.
They spend most of a run behind the camera, so without it the only things
telling you are the barking and the moment they fan wide enough to come into
shot.

There is no losing except being caught, and being caught is three friendly dogs
arriving, not a disaster. They make a ring round the hare and bark about it for
a couple of seconds, and then the run simply starts again — no card, no button,
nothing to read. The wood is seeded and identical every time, so a restart is
the hare, the dogs and a handful of counters.

## How it is built

```
src/
  config.ts          every tunable number, grouped by system
  core/              the loop, the stick-and-tap, the seeded rng, the zoom lock,
                     and the wood's own sound (made, not loaded)
  render/            the stage and the toon materials
  entities/
    wood.ts          the ground, the path, and everything standing in it
    hare.ts          the animal, and the way it runs
    dogs.ts          the three of them, and how they hunt
    glow.ts          fireflies, and light through the canopy
    home.ts          the bank, the burrow and the hares waiting at it
  ui/                the readouts, the three cards and the stylesheet
  game.ts            owns the scene and everything in it
```

The ground is arithmetic, not a model. Everything asks the height function
rather than the mesh — the hare runs on it, the dogs run on it, the trees are
planted on it, the fireflies drift above it — and a model would have to be
raycast a few hundred times a step to answer the same questions.

There are no invisible walls. The wood thickens either side of the path until
the trunks are too close to run through, which is a boundary nobody has to be
told about.

All the art is generated in code: merged primitives with vertex colours,
toon-shaded, one draw call per assembly. There are no model files and no
textures.

See [CLAUDE.md](CLAUDE.md) for the commands and the house style.
