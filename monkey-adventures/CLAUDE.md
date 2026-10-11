# Working on Monkey adventures

A self-contained **2D pixel** web game in this repo of games. TypeScript +
Vite and a plain 2D canvas — no three.js, which is the one way this game
differs from its neighbours, because the plan asks for pixel art and a 3D
engine has nothing to offer it. Built to one `index.html` that the gallery in
the repo root publishes. This file is how to work on it; see the root
`README.md` for the wider patterns.

## How the picture works

Everything is drawn once, small — `SCREEN.tall` is 180 pixels — and then
blown up by CSS with `image-rendering: pixelated`. That is the whole look: a
pixel is a thing you can count. Two rules follow from it and both matter.

- **Every coordinate is in picture pixels**, never screen pixels. A monkey is
  fifteen pixels tall on a phone and on an iPad, so the game is the same game
  on both. `render/screen.ts` is the only file that has heard of a device.
- **Snap to whole pixels before drawing.** Half a pixel of scroll turns one
  crisp trunk into two grey ones, and the shimmer while scrolling is the
  thing that makes pixel art look broken.

## Commands

```bash
npm --prefix monkey-adventures run dev         # dev server, hot reload
npm --prefix monkey-adventures run typecheck   # tsc --noEmit
npm --prefix monkey-adventures run build       # typechecks, then one self-contained dist/index.html
```

Formatting and linting are the repo's, run from the root:

```bash
npm run format                       # prettier --write .
npm run lint                         # eslint .
```

**Run `npm run format` before every commit**, not as a follow-up — an
unformatted commit makes the next format a diff about nothing.

Always typecheck before calling a change done; `npm --prefix monkey-adventures run build`
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

- **The art is written down, not imported.** Sprites are letter maps in
  `art/`, baked once into little canvases. At thirteen pixels across that is
  the only honest way to do it: shapes rounded to a grid this small come out
  as mush, and the point of the look is that every pixel was placed on
  purpose.
- **Comments explain why, not what.** Record a constraint or a decision that
  isn't visible from the code.
- Keep tunable numbers together and named, not as magic numbers at the call
  site.

## Layout

```
src/
  config.ts      every tunable number, grouped, with the reason beside it
  main.ts        the way in
  game.ts        the clock, the camera, and keeping the monkey on screen
  core/input.ts  a stick on the left half, a jump on the right
  render/        the pixel screen, and the painting of the jungle
  art/           the sprites, as letter maps
  entities/      the monkey: running, climbing, flying, swinging
  world/         the jungle: vines, trees, dapples, home
docs/
  plan-for-app.md  what the game is meant to be
index.html       the entry point; the app mounts into #app
vite.config.ts   single-file build, relative base, dev server on 5174
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
