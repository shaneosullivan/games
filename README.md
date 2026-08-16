# Chofter Games

Little web games, and the site that publishes them: **games.chofter.com**.

Everything here is static. There is no server-side code anywhere in the repo —
each game builds to plain files, the gallery is generated HTML, and the whole
thing deploys as a folder.

```
.
├── bee/          Bee Quest — a 3D bee game for iPad (TypeScript + Three.js)
├── site/         the gallery that lists the games and publishes them
└── README.md     you are here
```

## The games

| Game                           | What it is                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Bee Quest**](bee/README.md) | Fly a bee, found a hive, feed the brood, see off a wasp, get the honey home past a bear, hop a river of frogs and net the ants. Eight levels. Built for a child on an iPad. |

The gallery also links out to native apps on the App Store (Mazers, Super
Bubbly, Kidz Fun Art). Those aren't in this repo — they're listed by hand in
`site/build.mjs`.

## Building the whole site

```bash
npm --prefix site run build
```

That builds every game, then the gallery, into `site/dist/` — which is entirely
self-contained. Deploy that folder and nothing else.

```bash
npm --prefix site run serve      # preview it at http://localhost:4173
```

`site/dist` is gitignored, so this is meant to run in CI. On Vercel:

| Field            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| Build Command    | `node site/build.mjs`                                             |
| Output Directory | `site/dist`                                                       |
| Install Command  | _(leave empty — the build installs each game's own dependencies)_ |

## Formatting and lint

Prettier and ESLint are configured once at the root and cover every project:

```bash
npm install        # once
npm run format     # prettier --write .
npm run lint       # eslint .
```

The settings are copied from the syncawesome repo, so code moves between the
two without reformatting.

## Working on one game

Each game is a self-contained npm project with its own dependencies and its own
dev server. Nothing is shared between them, and the gallery discovers them by
looking for top-level folders with a `build` script.

```bash
npm --prefix bee run dev         # http://localhost:5173, hot reload
npm --prefix bee run build       # one self-contained dist/index.html
```

See [bee/README.md](bee/README.md) for how to play it, what's built, and how
the game itself is put together.

## Adding a game

Drop it in as a top-level folder with a `package.json` whose `build` script
writes to `dist/`. The gallery will find it, build it, stage it at
`/games/<folder>/`, and give it a card. A `card.png` and a `game.json` with a
title and description make the card look deliberate rather than generated.

The details — card sizes, the `base: './'` requirement, the PWA and offline
plumbing — are in [site/README.md](site/README.md).

## Installing it

The gallery is a PWA. Add it to a home screen and it runs full-screen under the
Chofter icon; games open inside it rather than in a browser. Each game also has
its own manifest, so a game can be installed on its own.

A running copy checks for new builds once a minute and offers a reload when the
site has been deployed over the top of it. That's in
[site/README.md](site/README.md#telling-a-running-app-its-out-of-date).

## Working on this with Claude Code

[CLAUDE.md](CLAUDE.md) is the orientation doc: layout, conventions, how to
verify a change in a real browser, and the mistakes that have already been made
here once.
