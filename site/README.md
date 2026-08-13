# games.chofter.com

The static gallery that links to every game in this repo.

## Build

```bash
npm --prefix site run build
```

That builds **every game** and then the gallery. Output lands in `site/dist/`,
which is entirely self-contained — deploy that folder and nothing else:

```
site/dist/
  index.html          the gallery
  styles.css
  manifest.webmanifest
  sw.js               offline cache
  icons/              the Chofter mark, at every size the install needs
  games/
    bee/
      index.html      the game
      manifest.webmanifest
      card.png
      version.json
  version.json          build stamp, polled by running pages
```

## Installing it

The gallery is a PWA. Add it to the home screen and it opens full-screen with
no browser chrome, under the Chofter knotwork icon — and because games live on
the same origin, tapping one stays inside the installed app.

Each game also gets its own manifest, so a game page can be installed directly
as its own app if you'd rather skip the gallery.

The icons in `site/assets/icons/` are generated from `assets/web-app-manifest-512x512.png`
(Chofter's own mark) flattened onto the site's cream — iOS drops transparency,
so an unflattened icon would sit on black. To regenerate them after a logo
change:

```bash
python3 - <<'PY'
from PIL import Image
src = Image.open('site/assets/web-app-manifest-512x512.png').convert('RGBA')
BG = (253, 247, 236, 255)
def render(size, inset):
    c = Image.new('RGBA', (size, size), BG)
    box = round(size * (1 - inset * 2))
    c.alpha_composite(src.resize((box, box), Image.LANCZOS), ((size - box) // 2,) * 2)
    return c
render(192, 0.08).save('site/assets/icons/icon-192.png')
render(512, 0.08).save('site/assets/icons/icon-512.png')
render(512, 0.20).save('site/assets/icons/icon-maskable-512.png')  # 80% safe zone
render(180, 0.10).save('site/assets/icons/apple-touch-icon.png')
PY
```

The service worker precaches the gallery and stale-while-revalidates everything
else on the origin, so a game you've played once keeps working with no network.
Its cache name carries the build timestamp, so each deploy replaces the old one.

## Telling a running app it's out of date

Every build writes `version.json` — at the root and next to each game — holding
the same build stamp. The gallery and every game read it once a minute (and whenever the
app is brought back to the foreground), and if the stamp has changed since the
copy it first saw, they offer "A new version is ready". Taking the offer deletes
every cache and reloads, which is the part that matters: without the cache
purge the service worker would hand back the very page you're trying to
replace.

The service worker deliberately does *not* intercept `version.json` — a cached
update-check can never notice an update. Keep it that way if you touch
`renderServiceWorker`.

### Unwedging a copy by hand

Every page defines `window.chofter`:

```js
chofter.build        // the build stamp this copy is running
chofter.diagnose()   // build, URL, standalone?, every viewport measurement, caches, workers
chofter.update()     // take a pending update now — purge the caches and reload
chofter.reset()      // unregister the worker, bin every cache, reload past the HTTP cache
```

`diagnose()` is there because the interesting bugs are all on a device with no
devtools of its own — it returns the numbers worth pasting back.

Service workers and caches are per-origin, so running it in an ordinary browser
tab also fixes the copy installed on the home screen — no reinstall. It's the
hammer for a build old enough that its *own* update path is broken; the banner
is the polite version and doesn't touch the worker.

Two rules the update path learned the hard way:

- **Never await the service worker before reloading.** `registration.update()`
  can simply never settle on iOS — the worker is torn down mid-install and the
  promise hangs, which left the banner stuck on "Updating…" for good. Both
  copies now purge the caches with a timeout and reload regardless.
- **Precache one URL at a time, and don't precache `./`.** `cache.addAll` is
  all-or-nothing, so a single URL that 404s or redirects fails the whole
  install and kills the worker; a bare directory URL is the entry most likely
  to redirect, and a redirected response can't be cached at all.

The game's copy of this lives in `bee/src/core/updates.ts`; the gallery's is a
small inline script in `build.mjs` (`UPDATE_WATCH`), so the gallery stays two
files with no build step of its own. They implement the same contract — change
one and check the other.

Other scripts:

| Command | What it does |
|---|---|
| `npm --prefix site run build` | Build all games, then the gallery |
| `npm --prefix site run build:site` | Gallery only — fast, for tweaking the design |
| `npm --prefix site run serve` | Preview `site/dist` at http://localhost:4173 |

## Games that aren't in this repo

Native apps are listed by hand in `APP_STORE` at the top of `build.mjs` — name,
App Store id, and an icon in `site/assets/apps/`. They render in their own
section under the playable games, as links out rather than cards you can press
play on.

The links are built as `apps.apple.com/app/id<id>`, without Apple's `/ie/`
storefront segment: with it, every visitor lands in the Irish store.

## How a folder becomes a game

`build.mjs` treats every top-level folder in the repo as a candidate, skipping
`site`, `docs`, `node_modules` and anything starting with a dot. For each one it:

1. Runs `npm install` if `node_modules` is missing, then `npm run build` — if
   the folder has a `package.json` with a `build` script.
2. Copies the whole of `<game>/dist/` to `site/dist/games/<game>/`. The whole
   folder, not just `index.html`, so a game that builds to multiple files works
   too.
3. Copies `card.png` next to it.

A folder with no `dist/index.html` after all that is skipped with a warning —
the build doesn't fail. So you can keep non-game folders at the root safely.

## Adding a game

Drop it in as a top-level folder with its own `package.json` and a `build`
script that writes to `dist/`. Then:

- **`card.png`** — the gallery looks for it at `card.png`, `assets/card.png` or
  `public/card.png`. Any aspect ratio works (it's cropped to 16:10), but around
  1280×800 is the sweet spot. Without one the card falls back to a coloured
  tile with the game's initial, so a missing card never looks broken — it just
  looks less good.
- **Title and description** come from the folder name and `package.json`'s
  `description`. To override either, add a `game.json`:

  ```json
  { "title": "Bee", "description": "Fly a bee, found a hive." }
  ```

**Build your game with relative asset URLs.** Games are served from a sub-path
(`/games/<name>/`), not the domain root, so absolute `/assets/…` paths break.
In Vite that means `base: './'`.

## Deploying

`site/dist` is gitignored, so this is meant to be built in CI: run the build
command above and publish `site/dist` as the site root. Any static host will
do — there's no server-side code anywhere in here.

If you'd rather commit the built output instead, remove `dist` from the root
`.gitignore` (note that would also start committing each game's `dist/`).
