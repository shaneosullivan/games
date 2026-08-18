#!/usr/bin/env node
// Optimize a .glb by wrapping @gltf-transform/cli's `optimize` pipeline.
//
//   node scripts/glb-optimize.mjs <in.glb> [out.glb] [options]
//
//   --plain      no Draco: a plain glb any GLTFLoader reads, but far larger.
//                Use this if the consumer has no DRACOLoader wired up.
//   --draco      force Draco (the default): ~10–20× smaller download, but the
//                loader needs a DRACOLoader or the file will not open.
//   --keep-texture   leave the texture as-is instead of recompressing to webp.
//   --ratio <n>  also decimate: keep this fraction of triangles (e.g. 0.25).
//
// gltf-transform is not a dependency of this repo; it is fetched on demand with
// npx. To sidestep a permission-corrupted global npm cache (the EACCES/EEXIST
// rename error that comes of a past `sudo npm`), it is run against a throwaway
// cache under the system temp dir, so this works regardless of the state of
// ~/.npm.
//
// A caution specific to this repo: its model loader (islandModels.ts) has no
// DRACOLoader and deletes uvs, painting each mesh part one flat colour from its
// material. So a Draco file will not load here, and a texture is ignored on
// load. For an asset destined for this game, prefer --plain, give the model
// flat-coloured materials (or vertex colours) rather than a texture, and
// decimate with --ratio. See scripts/glb-diagnose.mjs for the full picture.

import {spawnSync} from "node:child_process";
import {statSync} from "node:fs";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const KB = 1024;
const MB = 1024 * 1024;
const bytes = n =>
  n >= MB
    ? `${(n / MB).toFixed(2)} MB`
    : n >= KB
      ? `${(n / KB).toFixed(1)} KB`
      : `${n} B`;

function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter(a => !a.startsWith("--"));
  const has = flag => argv.includes(flag);
  const valueOf = flag => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const input = positional[0];
  if (!input) {
    console.error(
      "usage: node scripts/glb-optimize.mjs <in.glb> [out.glb] [--plain|--draco] [--keep-texture] [--ratio 0.25]",
    );
    process.exit(1);
  }
  const output = positional[1] ?? input.replace(/\.glb$/i, ".opt.glb");

  // Build the gltf-transform argument list.
  const args = ["optimize", input, output];
  // Compression: Draco by default, none with --plain.
  args.push("--compress", has("--plain") ? "false" : "draco");
  // Texture: recompress to webp unless asked to keep it.
  if (!has("--keep-texture")) {
    args.push("--texture-compress", "webp");
  }
  // Optional decimation. optimize runs `simplify`; the ratio/error tune it.
  if (valueOf("--ratio")) {
    args.push(
      "--simplify",
      "true",
      "--simplify-ratio",
      valueOf("--ratio"),
      "--simplify-error",
      "0.002",
    );
  }

  const before = statSync(input).size;
  console.log(`optimizing ${input} (${bytes(before)}) → ${output}`);
  console.log(`  gltf-transform ${args.join(" ")}\n`);

  // A disposable cache so a broken ~/.npm can't stop the run.
  const cache = mkdtempSync(join(tmpdir(), "glb-npx-"));
  const res = spawnSync("npx", ["--yes", "@gltf-transform/cli", ...args], {
    stdio: "inherit",
    env: {...process.env, npm_config_cache: cache},
  });
  if (res.status !== 0) {
    console.error("\ngltf-transform failed.");
    process.exit(res.status ?? 1);
  }

  const after = statSync(output).size;
  const factor = after > 0 ? (before / after).toFixed(1) : "∞";
  console.log(
    `\n${bytes(before)} → ${bytes(after)}   (${factor}× smaller, ${(100 - (after / before) * 100).toFixed(1)}% off)`,
  );
  if (!has("--plain")) {
    console.log(
      "Note: this file is Draco-compressed. The consumer needs a DRACOLoader, or it will not load. Re-run with --plain if it has none.",
    );
  }
}

main();
