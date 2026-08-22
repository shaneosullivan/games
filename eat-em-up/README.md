# Eat em up

You are a hungry caterpillar in a small forest. Eat everything you can find,
grow fatter and longer as you do, and when you have had enough of everything
you curl up, become a chrysalis, and burst out of it as a butterfly.

A touch-native 3D web game. TypeScript + Three.js + Vite, built to one
self-contained `index.html` and published by the gallery in the repo root. See
[docs/plan-for-app.md](docs/plan-for-app.md) for the design this was built from.

## Running it

```bash
npm --prefix eat-em-up run dev
```

Then open the URL Vite prints. On a tablet on the same Wi-Fi, use this Mac's LAN
address (`ipconfig getifaddr en0`) with the same port.

For the installed-app feel, **Share → Add to Home Screen** and launch from the
icon.

## Controls

One thumb, and nothing else. The stick plants itself wherever a finger lands, so
there is no control to find first.

- **Drag anywhere** — crawl. Up the screen is always the way you are facing;
  the camera swings round behind you.
- **Crawl into a tree** — take hold of it and climb. Up and down the screen
  climbs the trunk, left and right go round it.
- **Climb level with a branch** — step onto it, and crawl out along it.
- **Wait a while** — it looks about, scratches, asks what you are waiting for,
  and after a full minute of nothing, yawns at you.
- **Crawl off the end or the side of a branch** — you do not fall. You hang by
  your tail and lower yourself. If your head reaches the ground you let go and
  carry on; if it does not, you just dangle. Push back to haul yourself up.
- **Arrow keys or WASD** — the same, for testing on a laptop.

## The game

Eat 80 leaves, 40 flowers, 60 berries, 45 fruits, 12 mushrooms and 120 tufts of
grass. One bar across the top says how close you are; there are no other
numbers.

There is exactly one way to lose, and it arrives two minutes in, once and only
once in a game: **a crow**.
It comes over, circles, and you have ten seconds to reach the long grass —
the message says so and counts down. Reach the meadow and it still comes down — it stoops at the grass you are
hidden in, skims the tops of it and pulls out empty, then flies off over the
wood. You keep the stick throughout: a near miss takes nothing away from you,
and being missed is the whole reward for having run. Stay in the open and it comes down, takes the caterpillar in its beak and
carries it away over the trees while you watch — and only then does the card
come up. A game that stopped dead and put up a card saying you had been caught
would leave a child to take the card's word for it. Nothing else in
the wood can hurt you: crawling off a branch just drops you onto the floor.

- **Leaves** are on the bushes, along the branch you start on, and up the
  trunks — the reward for climbing.
- **Flowers** grow in patches out in the open.
- **Berries** come in bunches on the bushes.
- **Fruit** — apples, wild strawberries, blackberries and peaches — lies fallen
  under the trees, but most of it hangs at the end of a branch. You can see it
  from the ground and you cannot reach it from there: climb the trunk, step
  onto the branch, and edge out to the tip.
- **Mushrooms** grow on the boulders and nowhere else, round their shoulders
  and their feet — so filling that quota means visiting every rock in the wood.
  Two of them are **rainbow** ones: much bigger, spotted, and glowing, so they
  are spotted from across the wood. Eating one sets the caterpillar off for
  thirteen seconds — it runs the colours of the rainbow, grins, goes odd about
  the eyes, and tears round the wood and up and down the trees under its own
  steam while you watch. The last five seconds are a countdown you can see: the
  rainbow goes out one section at a time from the tail forward, evenly, and the
  head is the last to go as the fit ends. It counts for the quota like any
  other mushroom, so it is never a trap, and it grows back like the rest.
- **Grass** fills one tall meadow, and is the one thing eaten only where your
  head actually touches it.

Hiding is the meadow as a whole, not the particular tuft you are standing on —
gaps in the grass do not matter, because a child who has run to the grass has
done what was asked. What does matter is how much of the meadow is left: eat
nearly all of it and there is nowhere to get out of sight, and the crow finds
you standing in it. Grass grows back after five minutes, so that is never a
game you cannot win. The crow does not hunt during a rainbow-mushroom fit
either — the fit outlasts its count and you have no say in where the
caterpillar goes, and being taken for something you could not have prevented
is the one shape a fair game must not have.

From the far rim of the wood the meadow is about seven seconds of running with
no mistakes, so ten seconds is meant to be tight.

It comes exactly once. A threat that kept coming back would stop a child
wandering off from the meadow, and wandering off is most of what there is to
do here — so once it has had its go, whether it caught you, gave up, or was
called off by a rainbow mushroom, the wood is safe again for good.

Boulders lie about the floor, some mossy. They are the one thing in the wood
you cannot simply crawl past: the caterpillar goes over them. Their surface is
a paraboloid, which is a slope all the way to its rim — an ellipsoid stands
vertically where it meets the floor, which is a wall a caterpillar cannot walk
up and got it stuck against the steeper rocks.

Grass, fruit and mushrooms grow back five minutes after they are eaten; leaves,
flowers and berries stay eaten, so the wood is still visibly emptied by a caterpillar
working through it. Growing back puts food back in the wood, never progress
back on the board.

Growth is your progress toward the quotas, averaged, and anything past a quota
stops counting — so mowing the whole meadow can never be more than a sixth of
it. Fully fed you are nearly four times as fat and sixteen times as long as you
started, and the camera pulls back as you go.

When every quota is met the transformation plays, and then the butterfly is
yours to fly around the wood for as long as you like.

## Sound

One looping track, `src/assets/mossy_trail.mp3`, quiet enough to sit under the
game. It tries to start the moment the page is up, and where a browser refuses
audio nobody asked for — which on an iPad is the default — the first touch of
anything starts it, whether that is the button on the intro card or a tap
beside it. So the wood has its music from as early as the browser will allow. Eating has a sound, and the sound belongs to the variety rather than the kind:
an apple is a crunch and a blackberry is not, so the four fruits have four
recordings between them, and leaves, berries and grass have their own. Nothing was
recorded for flowers or mushrooms, so they borrow: a flower bites like a leaf,
being the same soft green thing to bite through, and a mushroom is the apple's
crunch turned down, because a mushroom gives way where an apple resists.

Each has a small pool of voices and there is one gap enforced across all of
them, because a caterpillar in the meadow bites faster than a clip lasts and a
single voice would cut itself off on every mouthful. Stop eating and the
chewing stops with you, four tenths of a second later: several of the clips run
past three seconds and would otherwise still be going long after the
caterpillar had wandered off. The crow's wings beat for exactly as long as it
is in the air.

The round switch in the top right turns all of it off; it is the shared one
from `shared/soundButton.ts`, the same button the bee game has.

## Commands

```bash
npm --prefix eat-em-up run dev         # dev server, hot reload
npm --prefix eat-em-up run typecheck   # tsc --noEmit
npm --prefix eat-em-up run build       # typechecks, then one dist/index.html
```

Formatting and linting come from the repo root (`npm run format`, `npm run
lint`), so this game is covered without any config of its own.

## Publishing

`game.json` carries a `status`. It starts as `"development"`, which lists the
game in the gallery's **In Development** section — flagged as unfinished. When
it is ready, change it to `"published"` and it moves to the main list of games.

## Layout

```
docs/
  plan-for-app.md  the design this was built from
src/
  config.ts        every tunable number in the game, grouped by system
  core/            the loop, the thumbstick, the seeded rng
  render/          the stage, the toon materials, the near-fade shader
  entities/        the forest, the food, the caterpillar, the ending
  ui/              the progress bar, the overlays, the stylesheet
```

The progress bar itself is `shared/progressBar.ts` at the repo root, the same
one the bee game shows — see the root `CLAUDE.md` for when something belongs
there rather than here.

```
  game.ts          owns all of it and runs the flow between them
index.html         the entry point
card.png           the gallery's thumbnail — a shot of the game itself
game.json          title, description and status, for the gallery
```

## Architecture

Constraints that have already caught someone out here:

- **"Nothing underneath" means no surface, not "below me".** A bough tapers, so
  its top steps fractionally down with every crawl out along it. Testing
  whether the caterpillar is _above_ the surface treats that slope as thin air
  and made it let go of the branch on its first step.
- **A cylinder's first radius sits at +Y**, which `rotateZ(π/2)` maps to −X.
  The start bough was built with the two the wrong way round, so it was drawn
  tapering the opposite way to the surface being walked on — the caterpillar
  floated near the trunk and sank into the branch out at the tip.
- **Nothing falls off a branch.** Crawling past the end or off the side hangs
  the caterpillar by its tail from the lip. Hauling back up puts it down on the
  last position that actually had support, rather than a guessed step back
  along the heading — that guess landed it off the side of a neighbouring
  bough, and it fell straight off again.
- **The body follows, it isn't simulated.** The head records where it has been
  and every segment sits a fixed distance back along that trail. Crawling off a
  branch drapes the body over the edge for free, because the trail goes over
  the edge. Segment pitch is read off the body line for the same reason.
- **A branch and the bough you start on are the same thing.** Everything that
  asks what it is standing on walks one list of `Bough`s. Adding a walkable
  surface means adding to that list, not adding a case.
- **The canopy is high on purpose.** The camera rides several units above the
  caterpillar; a lower canopy puts it inside the leaves, and the screen goes
  dark for no reason the player can see. Climbing stops short of the foliage
  for the same reason, and the climbing camera drops _below_ the player.
- **Anything that can stand between the camera and the player fades** — trunks,
  crowns, bushes and the tall grass all share one material driven by the
  player's own view depth. See `render/fadeInFront.ts`.
- **Instanced meshes can't skip an instance.** Eaten food is scaled to zero.
- **`paint()` needs non-indexed geometry**, so everything that gets merged goes
  through it.
- **Coplanar faces z-fight.** Anything laid on a surface stands slightly proud
  of it.
- **Screen axes and world axes are different things.** Crawling and flying read
  the stick against the camera's bearing; climbing reads it raw, because up the
  screen has to mean up the trunk. For a camera looking along `(sin y, 0, cos y)`
  screen-right is `(-cos y, 0, sin y)` — its negative is left and right swapped.

## Verifying a change

There is no test suite. In a dev build `window.game` is the live `Game`, and
most of its fields are private only to TypeScript:

```js
const g = window.game;
g.loop.stop(); // take over the clock
g.running = true; // update() no-ops unless this is set
g.stick.enabled = false; // stop stray input driving it
document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
g.stick.x = 0;
g.stick.y = -1;
g.stick.magnitude = 1; // hold "up the screen"
for (let i = 0; i < 600; i++) {
  g.update(1 / 60);
  g.render(1, 1 / 60);
}
```

- `g.cat.place(vec, heading)` puts the caterpillar anywhere; `g.food.eaten` can
  be written to directly to fake progress. Setting every kind to its quota
  trips the ending, so use less than that unless you want it.
- Measure rather than eyeball. The caterpillar is always at the centre of the
  screen, so to test which way it moved, dot the movement with column 0 of
  `camera.matrixWorld` — the camera's own right vector.
- **Screenshots after manual stepping can be a frame stale.** Restart the loop
  and take it again before believing one.
