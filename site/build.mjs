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

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SITE_DIR, '..');
const OUT_DIR = path.join(SITE_DIR, 'dist');
const GAMES_OUT = path.join(OUT_DIR, 'games');

/** Folders that are never games, whatever they contain. */
const IGNORED = new Set(['site', 'node_modules', 'docs', 'dist']);

/** Where we'll look for a game's card image, in order of preference. */
const CARD_PATHS = ['card.png', 'assets/card.png', 'public/card.png'];

const skipGames = process.argv.includes('--skip-games');

// ---------------------------------------------------------------------------

/** Every top-level folder that looks like it holds a buildable game. */
function discoverGames() {
  return fs
    .readdirSync(REPO_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORED.has(e.name))
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const dir = path.join(REPO_DIR, name);
      const pkgPath = path.join(dir, 'package.json');
      const pkg = fs.existsSync(pkgPath) ? readJson(pkgPath) : null;
      // A game.json, if present, wins over anything inferred from package.json.
      const meta = readJson(path.join(dir, 'game.json')) ?? {};
      return {
        name,
        dir,
        pkg,
        title: meta.title ?? titleCase(name),
        description: meta.description ?? pkg?.description ?? '',
        buildable: Boolean(pkg?.scripts?.build),
        card: CARD_PATHS.map((p) => path.join(dir, p)).find((p) => fs.existsSync(p)) ?? null,
      };
    });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function titleCase(slug) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

function buildGame(game) {
  if (!game.buildable) {
    console.log(`  · ${game.name}: no build script, using whatever is in dist/`);
    return;
  }
  if (!fs.existsSync(path.join(game.dir, 'node_modules'))) {
    console.log(`  · ${game.name}: installing dependencies`);
    run('npm', ['install', '--no-audit', '--no-fund'], game.dir);
  }
  console.log(`  · ${game.name}: building`);
  run('npm', ['run', 'build'], game.dir);
}

/** Copy the game's whole dist so multi-file games work too, not just bee. */
function stageGame(game) {
  const dist = path.join(game.dir, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return false;

  const target = path.join(GAMES_OUT, game.name);
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(dist, target, { recursive: true });

  if (game.card) fs.cpSync(game.card, path.join(target, 'card.png'));
  return true;
}

// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Stable pleasant hue per game, so card-less games still look deliberate. */
function hueFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function renderCard(game) {
  const href = `games/${game.name}/index.html`;
  const art = game.card
    ? `<img class="card-art" src="games/${game.name}/card.png" alt="" loading="lazy" width="640" height="400">`
    : `<div class="card-art card-art-blank" style="--hue:${hueFor(game.name)}"><span>${escapeHtml(
        game.title.charAt(0),
      )}</span></div>`;

  return `      <li class="card">
        <a href="${href}">
          ${art}
          <div class="card-body">
            <h2>${escapeHtml(game.title)}</h2>
            ${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}
          </div>
          <span class="card-play">Play<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l6 5-6 5z"/></svg></span>
        </a>
      </li>`;
}

function renderPage(games) {
  const cards = games.map(renderCard).join('\n');
  const empty = `      <li class="empty">No games built yet. Add a folder with its own build, then run this again.</li>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Chofter Games</title>
    <meta name="description" content="Little games, made for fun." />
    <meta name="theme-color" content="#f7b32b" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%90%9D%3C/text%3E%3C/svg%3E" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="hero">
      <h1>Chofter Games</h1>
      <p>Little games, made for fun. Best on a tablet.</p>
    </header>

    <main>
      <ul class="grid">
${games.length ? cards : empty}
      </ul>
    </main>

    <footer>
      <p>${games.length} game${games.length === 1 ? '' : 's'} · built ${new Date().toISOString().slice(0, 10)}</p>
    </footer>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------

const games = discoverGames();
console.log(`Found ${games.length} candidate game folder(s): ${games.map((g) => g.name).join(', ') || '(none)'}`);

if (!skipGames) {
  console.log('Building games…');
  for (const game of games) buildGame(game);
} else {
  console.log('Skipping game builds (--skip-games)');
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(GAMES_OUT, { recursive: true });

const staged = [];
for (const game of games) {
  if (stageGame(game)) {
    staged.push(game);
    console.log(`  · ${game.name}: staged${game.card ? '' : ' (no card.png — using a placeholder)'}`);
  } else {
    console.warn(`  ! ${game.name}: no dist/index.html, skipping`);
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderPage(staged));
fs.cpSync(path.join(SITE_DIR, 'styles.css'), path.join(OUT_DIR, 'styles.css'));

console.log(`\nBuilt ${staged.length} game(s) into ${path.relative(REPO_DIR, OUT_DIR)}/`);
