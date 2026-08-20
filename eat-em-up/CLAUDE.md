# Working on Eat em up

A self-contained 3D web game in this repo of games. TypeScript + Three.js +
Vite, built to one `index.html` that the gallery in the repo root publishes.
This file is how to work on it; see the root `README.md` and the `bee` game for
the wider patterns.

## Commands

```bash
npm --prefix eat-em-up run dev         # dev server, hot reload
npm --prefix eat-em-up run typecheck   # tsc --noEmit
npm --prefix eat-em-up run build       # typechecks, then one self-contained dist/index.html
```

Formatting and linting are the repo's, run from the root:

```bash
npm run format                       # prettier --write .
npm run lint                         # eslint .
```

**Run `npm run format` before every commit**, not as a follow-up — an
unformatted commit makes the next format a diff about nothing.

Always typecheck before calling a change done; `npm --prefix eat-em-up run build`
does it for you.

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

## Layout

```
src/
  main.ts        the game
  assets/        images and models (imported by Vite; empty to start)
index.html       the entry point; the app mounts into #app
vite.config.ts   single-file build, relative base, .glb treated as an asset
card.png         the gallery thumbnail — a 640x400 shot of the game
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
