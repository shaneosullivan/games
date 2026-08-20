#!/usr/bin/env node
// Scaffold a new game folder that works like the bee game.
//
//   node scripts/new-game.mjs <Name> [description words…]
//
// The folder is the name lower-cased and hyphenated; the game's title is the
// name as you typed it. It gets a game.json (status "development"), a starter
// 3D scene — a red ball on a green field you move with a finger, the arrow keys
// or WASD, and jump with space — the same TypeScript / Vite / formatting setup
// as the bee game, a card.png, a README and a CLAUDE.md, with its node modules
// installed. From `scripts/new-game-template/`; edit the templates there.

import {execFileSync, spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const templateDir = join(here, "new-game-template");

const raw = process.argv[2];
if (!raw) {
  console.error(
    "Give the game a name. For example:\n" +
      '  npm run new-game -- "My Game"\n' +
      '  node scripts/new-game.mjs "My Game" [description…]',
  );
  process.exit(1);
}
const title = raw.trim();
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
if (!slug) {
  console.error(`"${raw}" has no letters or digits to make a folder from.`);
  process.exit(1);
}
const description = process.argv.slice(3).join(" ").trim() || "A new game.";

const dest = join(repo, slug);
if (existsSync(dest)) {
  console.error(`"${slug}/" already exists — pick another name, or remove it.`);
  process.exit(1);
}

// ---- fill the templates ---------------------------------------------------

const FILES = [
  ["game.json.tmpl", "game.json"],
  ["package.json.tmpl", "package.json"],
  ["vite.config.ts.tmpl", "vite.config.ts"],
  ["tsconfig.json.tmpl", "tsconfig.json"],
  ["gitignore.tmpl", ".gitignore"],
  ["index.html.tmpl", "index.html"],
  ["README.md.tmpl", "README.md"],
  ["CLAUDE.md.tmpl", "CLAUDE.md"],
  ["plan-for-app.md.tmpl", "docs/plan-for-app.md"],
  ["main.ts.tmpl", "src/main.ts"],
];

const fill = s =>
  s
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{SLUG}}", slug)
    .replaceAll("{{DESCRIPTION}}", description);

mkdirSync(dest, {recursive: true});
for (const [tmpl, out] of FILES) {
  const target = join(dest, out);
  mkdirSync(dirname(target), {recursive: true});
  writeFileSync(target, fill(readFileSync(join(templateDir, tmpl), "utf8")));
}

// The empty assets folder, kept in git with a placeholder.
const assets = join(dest, "src", "assets");
mkdirSync(assets, {recursive: true});
writeFileSync(join(assets, ".gitkeep"), "");

// A solid-colour card, its hue from the name so games differ at a glance.
writeFileSync(join(dest, "card.png"), solidPng(640, 400, hueColour(slug)));

console.log(`Created ${slug}/ — "${title}"`);

// ---- install and tidy -----------------------------------------------------

console.log("Installing node modules…");
const npm = spawnSync("npm", ["install"], {cwd: dest, stdio: "inherit"});
if (npm.status !== 0) {
  console.error("npm install failed — the folder is made; run it by hand.");
}
try {
  execFileSync("npx", ["prettier", "--write", `${slug}/`], {
    cwd: repo,
    stdio: "ignore",
  });
} catch {
  // Formatting is a nicety here; the templates are already in style.
}

console.log(`
Done. Next:
  write ${slug}/docs/plan-for-app.md  # describe the game before you build it
  npm --prefix ${slug} run dev        # play the starter scene
  edit ${slug}/src/main.ts            # make it your game
When it's ready, set "status": "published" in ${slug}/game.json.
`);

// ---- a solid PNG, without a dependency -------------------------------------

/** sRGB colour from a name: a hue off a hash, muted so text still reads on it. */
function hueColour(seed) {
  let h = 0;
  for (const ch of seed) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hslToRgb((h % 360) / 360, 0.5, 0.52);
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = t => {
    let u = t;
    if (u < 0) {
      u += 1;
    }
    if (u > 1) {
      u -= 1;
    }
    if (u < 1 / 6) {
      return p + (q - p) * 6 * u;
    }
    if (u < 1 / 2) {
      return q;
    }
    if (u < 2 / 3) {
      return p + (q - p) * (2 / 3 - u) * 6;
    }
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ];
}

function solidPng(w, h, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // rows: one filter byte (0) then w*3 bytes of RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}
