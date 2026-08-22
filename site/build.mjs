#!/usr/bin/env node
/**
 * Builds games.chofter.com.
 *
 * Every top-level folder in the repo except this one is treated as a candidate
 * game. For each, we build it, copy its `dist/` into `site/dist/games/<name>/`,
 * and add a card to the gallery linking at its index.html.
 *
 * The output in `site/dist/` is entirely self-contained — deploy that folder
 * and nothing else.
 *
 * Usage:
 *   node build.mjs              build every game, then the gallery
 *   node build.mjs --skip-games just regenerate the gallery (fast, for styling)
 */

import {execSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SITE_DIR, "..");
const OUT_DIR = path.join(SITE_DIR, "dist");
const GAMES_OUT = path.join(OUT_DIR, "games");
const ICONS_SRC = path.join(SITE_DIR, "assets", "icons");
const ICONS_OUT = path.join(OUT_DIR, "icons");
const APPS_SRC = path.join(SITE_DIR, "assets", "apps");
const APPS_OUT = path.join(OUT_DIR, "apps");

/**
 * The installed app's identity. The icons are Chofter's own knotwork C, taken
 * from chofter.com and flattened onto the site's cream so iOS — which drops
 * transparency — doesn't render it on black.
 */
const APP = {
  name: "Chofter Games",
  /**
   * What the home screen calls it once installed. Deliberately the full name
   * rather than an abbreviation — iOS elides the middle of anything too long
   * to fit, and "Chofter Games" fits.
   */
  shortName: "Chofter Games",
  description: "Little games, made for fun.",
  /**
   * What browser and OS chrome is tinted with — the iOS status bar of an
   * installed app included, which is why it isn't the brand amber. White reads
   * as the system's own bar; the dark-mode counterpart is emitted alongside it.
   */
  themeColor: "#ffffff",
  backgroundColor: "#fdf7ec",
};

/** Bumped every build, so an installed copy picks up new games. */
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

/**
 * The stamp file a running page polls to notice it has been replaced.
 *
 * One next to every page that might be open for a long time — the gallery and
 * each game — so a page can always fetch it relative to itself, whatever
 * sub-path it's served from.
 */
const VERSION_FILE = "version.json";

/**
 * Where images live once they're cached, and how one is recognised.
 *
 * Pictures are the heavy part of this site and almost never the part that
 * changes, so they are kept out of the per-build cache entirely: a deploy bins
 * the versioned cache and leaves this one alone. What makes that safe is the
 * content hash in the filename — `levelmap-BC1XfPIG.jpg` is a promise that
 * this name will only ever hold those bytes, so an edited picture arrives
 * under a new name and is fetched once, and an untouched one is never fetched
 * again. Vite hashes a game's own assets; `stampAsset` below does the same for
 * the gallery's.
 *
 * The extension list is what keeps the rule honest: only media is treated as
 * immutable, so nothing else that happens to carry a dash and eight
 * characters can wander into a cache that is never cleared.
 */
const ASSET_CACHE_NAME = "chofter-assets";
const ASSET_CACHE_JS = `const ASSET_CACHE = '${ASSET_CACHE_NAME}';
const IMMUTABLE = /-[A-Za-z0-9_-]{8}\\.(?:jpe?g|png|gif|webp|avif|svg|woff2?|mp3|ogg|wav)$/i;
const isImmutable = (pathname) => IMMUTABLE.test(pathname);`;

/**
 * Copy a file into the build under a content-hashed name, and return that
 * name. Same bytes in, same name out — which is exactly what makes the URL
 * safe to cache forever, and what changes it the moment the picture does.
 */
function stampAsset(src, outDir) {
  const bytes = fs.readFileSync(src);
  const hash = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("base64url")
    .slice(0, 8);
  const ext = path.extname(src);
  const name = `${path.basename(src, ext)}-${hash}${ext}`;
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(path.join(outDir, name), bytes);
  return name;
}

/**
 * Games that aren't in this repo because they aren't web games at all.
 *
 * Listed by hand — there's nothing to build or discover. The links deliberately
 * drop Apple's `/ie/` storefront segment: without it the App Store sends each
 * visitor to their own country's store instead of Ireland's.
 */
const APP_STORE = [
  {
    name: "Mazers",
    id: "6760861069",
    icon: "mazers.png",
  },
  {
    name: "Super Bubbly",
    id: "6752374114",
    icon: "super-bubbly.png",
  },
  {
    name: "Kidz Fun Art",
    id: "6443621939",
    icon: "kidz-fun-art.png",
  },
];

/** Folders that are never games, whatever they contain. */
const IGNORED = new Set([
  "site",
  "node_modules",
  "docs",
  "dist",
  "scripts",
  "tmp",
  // Not a game: the handful of widgets the games have in common. It has no
  // package.json, so it would be listed as an unbuildable game with an empty
  // dist rather than skipped.
  "shared",
]);

/** Where we'll look for a game's card image, in order of preference. */
const CARD_PATHS = ["card.png", "assets/card.png", "public/card.png"];

const skipGames = process.argv.includes("--skip-games");

// ---------------------------------------------------------------------------

/** Every top-level folder that looks like it holds a buildable game. */
function discoverGames() {
  return fs
    .readdirSync(REPO_DIR, {withFileTypes: true})
    .filter(
      e => e.isDirectory() && !e.name.startsWith(".") && !IGNORED.has(e.name),
    )
    .map(e => e.name)
    .sort()
    .map(name => {
      const dir = path.join(REPO_DIR, name);
      const pkgPath = path.join(dir, "package.json");
      const pkg = fs.existsSync(pkgPath) ? readJson(pkgPath) : null;
      // A game.json, if present, wins over anything inferred from package.json.
      const meta = readJson(path.join(dir, "game.json")) ?? {};
      return {
        name,
        dir,
        pkg,
        title: meta.title ?? titleCase(name),
        description: meta.description ?? pkg?.description ?? "",
        // A game is "development" until its game.json says "published"; that
        // decides which section of the gallery it lands in. Anything unexpected
        // is treated as still in development, which is the safe way to be wrong.
        status: meta.status === "published" ? "published" : "development",
        buildable: Boolean(pkg?.scripts?.build),
        card:
          CARD_PATHS.map(p => path.join(dir, p)).find(p => fs.existsSync(p)) ??
          null,
      };
    });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function titleCase(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Run a command line in `cwd`.
 *
 * Through a shell, which on Windows is the only way to reach npm at all: it is
 * npm.cmd there, execFileSync won't find the bare name, and naming the .cmd
 * outright fails with EINVAL — Node refuses to spawn a batch file directly.
 * Every command here is a fixed literal, so there is nothing to escape.
 */
function run(command, cwd) {
  execSync(command, {cwd, stdio: "inherit"});
}

function buildGame(game) {
  if (!game.buildable) {
    console.log(
      `  · ${game.name}: no build script, using whatever is in dist/`,
    );
    return;
  }
  if (!fs.existsSync(path.join(game.dir, "node_modules"))) {
    console.log(`  · ${game.name}: installing dependencies`);
    run("npm install --no-audit --no-fund", game.dir);
  }
  console.log(`  · ${game.name}: building`);
  try {
    run("npm run build", game.dir);
  } catch {
    // The child's own output has already gone to the log — it is spawned with
    // stdio inherited — so the useful part is above this. What a bare throw
    // adds is ten lines of Node internals between the reader and it, which on
    // a deploy is where people stop reading.
    console.error(
      `\n  ✗ ${game.name} failed to build. The error is in its output above.`,
    );
    process.exit(1);
  }
}

/** Copy the game's whole dist so multi-file games work too, not just bee. */
function stageGame(game) {
  const dist = path.join(game.dir, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    return false;
  }

  const target = path.join(GAMES_OUT, game.name);
  fs.mkdirSync(target, {recursive: true});
  fs.cpSync(dist, target, {recursive: true});

  // Content-hashed like the game's own images, so a card that hasn't been
  // redrawn isn't downloaded again on the next deploy.
  game.cardFile = game.card ? stampAsset(game.card, target) : null;
  return true;
}

/**
 * Make a staged game installable in its own right.
 *
 * Games build standalone and know nothing about the gallery, so this rewrites
 * their `<head>`: out goes whatever inlined manifest and icon they shipped with,
 * in goes a manifest sitting next to them and the shared Chofter icons two
 * levels up. Nothing else in the file is touched.
 */
function installGame(game) {
  const dir = path.join(GAMES_OUT, game.name);
  const indexPath = path.join(dir, "index.html");
  const title = game.title;

  fs.writeFileSync(
    path.join(dir, "manifest.webmanifest"),
    renderManifest({
      name: `${title} · ${APP.shortName}`,
      shortName: title,
      description: game.description || APP.description,
      start: "./index.html",
      up: "../../",
    }),
  );

  const head = renderInstallHead({
    title,
    manifest: "manifest.webmanifest",
    up: "../../",
  });

  const html = fs
    .readFileSync(indexPath, "utf8")
    // Drop the game's own install metadata so it can't compete with ours.
    .replace(
      /^[ \t]*<link[^>]*rel="(manifest|apple-touch-icon|icon)"[^>]*>\s*$/gim,
      "",
    )
    .replace(
      /^[ \t]*<meta[^>]*name="(theme-color|apple-mobile-web-app-[\w-]+|mobile-web-app-capable)"[^>]*>\s*$/gim,
      "",
    )
    // …including the comments explaining them, which would now describe tags
    // that are no longer there.
    // The `(?!-->)` guards keep the match inside one comment; a plain lazy
    // wildcard happily runs from one comment to a later one's terminator and
    // swallows the tags in between.
    .replace(
      /^[ \t]*<!--(?:(?!-->)[\s\S])*?(?:Home Screen|anifest)(?:(?!-->)[\s\S])*?-->[ \t]*$/gm,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*<\/head>/, `${head}\n  </head>`);

  fs.writeFileSync(indexPath, html);
}

// ---------------------------------------------------------------------------

const escapeHtml = s =>
  String(s).replace(
    /[&<>"']/g,
    c =>
      ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[
        c
      ],
  );

/** Stable pleasant hue per game, so card-less games still look deliberate. */
function hueFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return h;
}

function renderCard(game) {
  const href = `games/${game.name}/index.html`;
  const art = game.cardFile
    ? `<img class="card-art" src="games/${game.name}/${game.cardFile}" alt="" loading="lazy" width="640" height="400">`
    : `<div class="card-art card-art-blank" style="--hue:${hueFor(game.name)}"><span>${escapeHtml(
        game.title.charAt(0),
      )}</span></div>`;

  return `      <li class="card">
        <a href="${href}">
          ${art}
          <div class="card-body">
            <h2>${escapeHtml(game.title)}</h2>
            ${game.description ? `<p>${escapeHtml(game.description)}</p>` : ""}
          </div>
          <span class="card-play">Play<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l6 5-6 5z"/></svg></span>
        </a>
      </li>`;
}

/**
 * The install metadata, shared by the gallery and by each game.
 *
 * `display: fullscreen` with a display_override chain is what actually gets rid
 * of the browser chrome on Android; iOS ignores all of it and goes by the
 * apple-mobile-web-app-* metas instead, hence both being emitted.
 *
 * Every path is relative, so the same file works at the domain root or under a
 * sub-path — which is exactly how the per-game copies are used.
 *
 * @param up how many levels up the shared icons/ folder is
 */
function renderManifest({name, shortName, description, start = "./", up = ""}) {
  const icon = (file, sizes, purpose) => ({
    src: `${up}icons/${file}`,
    sizes,
    type: "image/png",
    ...(purpose ? {purpose} : {}),
  });

  return JSON.stringify(
    {
      name,
      short_name: shortName,
      description,
      id: start,
      start_url: start,
      scope: "./",
      display: "fullscreen",
      display_override: ["fullscreen", "standalone", "minimal-ui"],
      orientation: "any",
      background_color: APP.backgroundColor,
      theme_color: APP.themeColor,
      icons: [
        icon("icon-192.png", "192x192"),
        icon("icon-512.png", "512x512"),
        icon("icon-maskable-512.png", "512x512", "maskable"),
      ],
    },
    null,
    2,
  );
}

/**
 * The head tags that make a page installable. iOS needs the apple-* metas and
 * an explicit apple-touch-icon; everyone else reads the manifest.
 *
 * @param up how many levels up the shared icons/ folder is
 */
function renderInstallHead({title, manifest, up = ""}) {
  return `    <link rel="manifest" href="${manifest}" />
    <!--
      Two, media-scoped, and neither of them the brand amber: iOS tints the
      status bar of an installed app with theme-color, and an orange bar behind
      the clock and battery looks like a mistake. White on light and black on
      dark is what the system does on its own.
    -->
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
    <link rel="icon" type="image/png" sizes="192x192" href="${up}icons/icon-192.png" />
    <link rel="apple-touch-icon" href="${up}icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <!--
      \`default\`, not \`black-translucent\`. Translucent puts the page *under* the
      status bar, and iOS then makes the web view a status bar shorter than the
      screen while still starting it at the top — which is where the strip of
      bare page along the bottom of an installed iPad app came from: 810pt of
      screen, 790pt of viewport, 20pt of status bar. Sitting below the bar
      costs those 20pt at the top instead, where nothing is drawn anyway.
    -->
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(title)}" />`;
}

/**
 * The service worker. Its only real job is making an installed copy work with
 * no network — a tablet in a car park should still open the games it has
 * already played.
 *
 * Strategy: precache the gallery shell up front, then stale-while-revalidate
 * everything else on the same origin. Games are one big immutable HTML file
 * each, so caching one on first play is both cheap and exactly right; the
 * revalidate half is what lets a rebuilt game replace it next time.
 */
function renderServiceWorker(shell, assets) {
  return `/* Generated by site/build.mjs — do not edit. */
const CACHE = 'chofter-${BUILD_ID}';
${ASSET_CACHE_JS}
const SHELL = ${JSON.stringify(shell, null, 2)};
const ASSETS = ${JSON.stringify(assets, null, 2)};

// Cached one at a time rather than with addAll, which is all-or-nothing: a
// single URL that 404s or redirects fails the whole install, the worker is torn
// down, and the console fills with "Cannot load" and "context closed".
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .open(CACHE)
        .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url)))),
      // Pictures we already hold are the same pictures — the name says so — so
      // a new build only downloads the ones that have actually changed.
      caches.open(ASSET_CACHE).then((cache) =>
        Promise.allSettled(
          ASSETS.map((url) =>
            cache.match(url).then((hit) => (hit ? null : cache.add(url))),
          ),
        ),
      ),
    ]).then(() => self.skipWaiting()),
  );
});

// A new build means a new cache name; bin every older one — except the
// immutable assets, which are keyed by content and belong to no build.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The update check has to see the network or it can never notice a deploy.
  if (url.pathname.endsWith('/${VERSION_FILE}')) return;

  // Content-hashed: the bytes behind this URL can never change, so serve it
  // from the permanent cache and don't go to the network at all. A picture
  // that has actually been edited arrives under a new name and is fetched
  // once; the old one is simply never asked for again.
  if (isImmutable(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true });

      const live = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        // Offline and never seen: for a page, fall back to the gallery so the
        // app opens to something useful instead of the browser's error page.
        .catch(() => hit ?? (request.mode === 'navigate' ? cache.match('./index.html') : undefined));

      return hit ?? live;
    }),
  );
});
`;
}

/**
 * The gallery's own update check, inlined.
 *
 * Same contract as the games': read the stamp, keep the first one seen, and
 * offer a reload when it changes. Deleting the caches before reloading is the
 * whole point — the service worker would otherwise serve the very page being
 * replaced. Kept as a small inline copy rather than a shared module so the
 * gallery stays two files with no build step of its own.
 */
const UPDATE_WATCH = `      (function () {
        // window.chofter — the console handle. Mirrors bee/src/core/updates.ts;
        // change one and change the other.
        //
        // reset() is the hammer, for a copy wedged on a build whose own update
        // path is broken: unregister the worker (a live one serves its cache
        // straight back), bin every cache, and reload past Safari's HTTP cache
        // too. Both are per-origin, so running it here fixes the installed app.
        var api = {
          build: null,
          update: function () { location.reload(); },
          reset: function () {
            return navigator.serviceWorker.getRegistrations()
              .then(function (regs) { return Promise.all(regs.map(function (r) { return r.unregister(); })); })
              .then(function () { return caches.keys(); })
              .then(function (names) {
                console.log('chofter.reset: caches cleared:', names);
                return Promise.all(names.map(function (n) { return caches.delete(n); }));
              })
              .then(function () { location.replace(location.pathname + '?fresh=' + Date.now()); });
          },
          // Logged, copied to the clipboard, and returned as the string to
          // paste — the device this matters on has no devtools of its own.
          diagnose: function () {
            var doc = document.documentElement;
            var vv = window.visualViewport;
            return Promise.all([caches.keys(), navigator.serviceWorker.getRegistrations()])
              .then(function (r) {
                var info = {
                  build: api.build,
                  url: location.href,
                  standalone: navigator.standalone || matchMedia('(display-mode: standalone)').matches,
                  visualViewport: vv ? [Math.round(vv.width), Math.round(vv.height)] : null,
                  documentElement: [doc.clientWidth, doc.clientHeight],
                  inner: [innerWidth, innerHeight],
                  screen: [screen.width, screen.height],
                  caches: r[0], workers: r[1].length,
                };
                var text = JSON.stringify(info);
                console.log(info);
                console.log(text);
                return Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(text))
                  .then(function () { console.log('(copied to the clipboard)'); },
                        function () { console.log('(clipboard refused — copy the line above)'); })
                  .then(function () { return text; });
              });
          },
        };
        window.chofter = api;

        var banner = document.querySelector('.update-banner');
        if (!banner) return;
        var current = null;
        var offered = false;

        function read() {
          return fetch('${VERSION_FILE}', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (!d || typeof d.build !== 'string') return null;
              api.build = d.build;
              return d.build;
            })
            .catch(function () { return null; });
        }

        function check() {
          if (offered) return;
          read().then(function (build) {
            if (!build) return;
            if (current === null) { current = build; return; }
            if (build === current) return;
            offered = true;
            banner.hidden = false;
          });
        }

        banner.addEventListener('click', function () {
          banner.classList.add('taken');
          banner.querySelector('span').textContent = 'Updating…';
          // The reload happens either way: a cache API that never settles must
          // not leave the banner stuck on "Updating…".
          var reloaded = false;
          var done = function () { if (!reloaded) { reloaded = true; location.reload(); } };
          setTimeout(done, 1500);
          if (!window.caches) return done();
          // Everything but the pictures: they're content-addressed, so the
          // new build either wants the very same file or asks for a new name.
          caches.keys()
            .then(function (names) {
              return Promise.all(names
                .filter(function (n) { return n !== '${ASSET_CACHE_NAME}'; })
                .map(function (n) { return caches.delete(n); }));
            })
            .then(done, done);
        });

        check();
        setInterval(check, 60000);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') check();
        });
      })();`;

/** Registration snippet, inlined so the gallery stays two files. */
const SW_REGISTER = `      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('sw.js').catch(() => {
            /* Offline support is a bonus; the site works fine without it. */
          });
        });
      }`;

/** A link out to the App Store, under the game's own icon. */
function renderAppCard(app) {
  return `      <li class="app-card">
        <a href="https://apps.apple.com/app/id${app.id}">
          <img src="apps/${app.iconFile}" alt="" loading="lazy" width="128" height="128">
          <div>
            <h3>${escapeHtml(app.name)}</h3>
            <span>On the App Store</span>
          </div>
        </a>
      </li>`;
}

function renderPage(games, logoFile) {
  const published = games.filter(g => g.status === "published");
  const development = games.filter(g => g.status !== "published");
  const cards = published.map(renderCard).join("\n");
  const empty = `      <li class="empty">No games published yet. Add a folder with its own build, then run this again.</li>`;
  // In-development games get their own section under the app-store list, plainly
  // flagged, so an unfinished game can be reached for testing without sitting
  // in the shelf of things that are meant to be played.
  const inDevelopment = development.length
    ? `
      <h2 class="section-title">In Development</h2>
      <p class="section-note section-warn">These are unfinished and buggy — here for testing, not really ready to play.</p>
      <ul class="grid">
${development.map(renderCard).join("\n")}
      </ul>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(APP.name)}</title>
    <meta name="description" content="${escapeHtml(APP.description)}" />
${renderInstallHead({title: APP.name, manifest: "manifest.webmanifest"})}
    <link rel="stylesheet" href="styles.css" />
    <script>
${SW_REGISTER}
    </script>
  </head>
  <body>
    <header class="hero">
      <div class="hero-title">
        <img class="hero-logo" src="${logoFile}" alt="Chofter" title="Chofter" width="320" height="118">
        <h1>Games</h1>
      </div>
      <p>Little games, made for fun. Best on a tablet.</p>
    </header>

    <main>
      <ul class="grid">
${published.length ? cards : empty}
      </ul>

      <h2 class="section-title">Also on the App Store</h2>
      <p class="section-note">Not web games — these ones live on your iPhone or iPad.</p>
      <ul class="app-grid">
${APP_STORE.map(renderAppCard).join("\n")}
      </ul>
${inDevelopment}
    </main>

    <footer>
      <p>${games.length} game${games.length === 1 ? "" : "s"} · built ${new Date().toISOString().slice(0, 10)}</p>
    </footer>

    <button type="button" class="update-banner" hidden>
      <b>A new version is ready</b><span>Tap to update</span>
    </button>

    <script>
${UPDATE_WATCH}
    </script>
    <script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------

const games = discoverGames();
console.log(
  `Found ${games.length} candidate game folder(s): ${games.map(g => g.name).join(", ") || "(none)"}`,
);

if (!skipGames) {
  console.log("Building games…");
  for (const game of games) {
    buildGame(game);
  }
} else {
  console.log("Skipping game builds (--skip-games)");
}

fs.rmSync(OUT_DIR, {recursive: true, force: true});
fs.mkdirSync(GAMES_OUT, {recursive: true});

const staged = [];
for (const game of games) {
  if (stageGame(game)) {
    staged.push(game);
    console.log(
      `  · ${game.name}: staged${game.card ? "" : " (no card.png — using a placeholder)"}`,
    );
  } else {
    console.warn(`  ! ${game.name}: no dist/index.html, skipping`);
  }
}

// ---- the gallery's own images ---------------------------------------------
//
// Stamped before the page is rendered, because the page has to link to the
// stamped names. Everything here is content-addressed and cached for good; see
// ASSET_CACHE_NAME.
const logoFile = stampAsset(
  path.join(SITE_DIR, "assets", "chofter-logo-640.png"),
  OUT_DIR,
);
for (const app of APP_STORE) {
  app.iconFile = stampAsset(path.join(APPS_SRC, app.icon), APPS_OUT);
}

fs.writeFileSync(
  path.join(OUT_DIR, "index.html"),
  renderPage(staged, logoFile),
);
fs.cpSync(path.join(SITE_DIR, "styles.css"), path.join(OUT_DIR, "styles.css"));

// ---- installable bits -----------------------------------------------------

// The PWA icons are the exception: they're install-time identity, read from
// the manifest by the operating system rather than the page, and a home-screen
// icon whose URL moves every deploy is a liability. They stay on stable names
// in the versioned cache.
fs.cpSync(ICONS_SRC, ICONS_OUT, {recursive: true});
fs.writeFileSync(
  path.join(OUT_DIR, "manifest.webmanifest"),
  renderManifest({
    name: APP.name,
    shortName: APP.shortName,
    description: APP.description,
  }),
);

// Precache the gallery itself. Games are big and there may be many, so they're
// left to the runtime cache — a game you've played is a game you can replay.
fs.writeFileSync(
  path.join(OUT_DIR, "sw.js"),
  renderServiceWorker(
    [
      // Not './' — a bare directory URL is the one entry that can redirect, and
      // a redirected response can't be put in a cache.
      "./index.html",
      "./styles.css",
      "./manifest.webmanifest",
      "./icons/icon-192.png",
      "./icons/apple-touch-icon.png",
    ],
    // The gallery's pictures. Precached like the shell so the first offline
    // open still has its artwork, but into the cache that survives a deploy
    // and only for the ones not already there.
    [
      `./${logoFile}`,
      ...APP_STORE.map(a => `./apps/${a.iconFile}`),
      ...staged
        .filter(g => g.cardFile)
        .map(g => `./games/${g.name}/${g.cardFile}`),
    ],
  ),
);

// Each game gets its own manifest too, so adding a game straight to the home
// screen installs *that game* full-screen rather than the gallery.
for (const game of staged) {
  installGame(game);
}

// The stamp every long-lived page polls for. Written last, so it can never
// advertise a build that isn't fully staged.
const stamp = `${JSON.stringify({build: BUILD_ID}, null, 2)}\n`;
fs.writeFileSync(path.join(OUT_DIR, VERSION_FILE), stamp);
for (const game of staged) {
  fs.writeFileSync(path.join(GAMES_OUT, game.name, VERSION_FILE), stamp);
}

console.log(
  `  · PWA: manifest, icons and service worker (cache chofter-${BUILD_ID})`,
);

console.log(
  `\nBuilt ${staged.length} game(s) into ${path.relative(REPO_DIR, OUT_DIR)}/`,
);
