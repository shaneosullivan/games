#!/usr/bin/env node
// Bake a painted Blender model into a tiny, game-ready .glb.
//
//   node scripts/glb-bake.mjs <in.glb> [out.glb] [--ratio 0.2]
//
// What this game wants from a model is one merged, vertex-coloured, toon-shaded
// mesh — no texture, no stored normals (it recomputes them), one draw call. A
// model exported from Blender is usually none of those: it carries a texture,
// per-corner normals that keep it from welding, and six times the vertices it
// needs. This turns one into the other while keeping how it looks:
//
//   1. If it has a texture and no vertex colours, the texture is *sampled into*
//      per-vertex colours (COLOR_0) — so an image-painted model keeps its
//      paint. A model already vertex-painted in Blender skips this and keeps
//      the colours it came with.
//   2. Normals, uvs, tangents and the texture are dropped.
//   3. The mesh is welded (which only works once the per-corner normals are
//      gone) and, with --ratio, decimated — the vertex colours ride along,
//      interpolated onto the simpler mesh.
//
// The result loads through the game's existing model path (islandModels.ts),
// which now honours COLOR_0. See scripts/glb-diagnose.mjs for why the input is
// the size it is, and scripts/glb-optimize.mjs for a download-oriented (Draco)
// alternative that this repo's loader cannot currently read.
//
// gltf-transform, meshoptimizer and pngjs are not dependencies of this repo;
// they are installed on demand into a cache under the system temp dir, against
// a throwaway npm cache so a permission-broken ~/.npm cannot stop the run.

import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const DEPS = [
  "@gltf-transform/core",
  "@gltf-transform/functions",
  "meshoptimizer",
  "pngjs",
];

const KB = 1024;
const MB = 1024 * 1024;
const bytes = n =>
  n >= MB
    ? `${(n / MB).toFixed(2)} MB`
    : n >= KB
      ? `${(n / KB).toFixed(1)} KB`
      : `${n} B`;

/** Install the tooling once into a temp dir, and return an ESM importer for it. */
async function toolbox() {
  const dir = join(tmpdir(), "choftergames-glb-tools");
  const marker = join(dir, "node_modules", "@gltf-transform", "core");
  if (!existsSync(marker)) {
    mkdirSync(dir, {recursive: true});
    writeFileSync(
      join(dir, "package.json"),
      '{"name":"glb-tools","private":true}\n',
    );
    console.log("Installing glb tooling (first run only)…");
    const res = spawnSync(
      "npm",
      ["install", "--no-audit", "--no-fund", ...DEPS],
      {
        cwd: dir,
        stdio: "inherit",
        env: {...process.env, npm_config_cache: join(dir, ".npm-cache")},
      },
    );
    if (res.status !== 0) {
      throw new Error("Failed to install glb tooling.");
    }
  }
  const require = createRequire(import.meta.url);
  return pkg => import(pathToFileURL(require.resolve(pkg, {paths: [dir]})));
}

/** sRGB byte (0–255) to linear float (0–1), matching materials.paint. */
const srgbToLinear = b => {
  const c = b / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter(a => !a.startsWith("--"));
  const input = positional[0];
  if (!input) {
    console.error(
      "usage: node scripts/glb-bake.mjs <in.glb> [out.glb] [--ratio 0.2]",
    );
    process.exit(1);
  }
  const output = positional[1] ?? input.replace(/\.glb$/i, ".baked.glb");
  const ratioArg = argv.indexOf("--ratio");
  const ratio = ratioArg >= 0 ? parseFloat(argv[ratioArg + 1]) : 1;

  const load = await toolbox();
  const {NodeIO} = await load("@gltf-transform/core");
  const {weld, simplify, prune, dedup} = await load(
    "@gltf-transform/functions",
  );
  const {MeshoptSimplifier} = await load("meshoptimizer");
  const {PNG} = await load("pngjs");

  const io = new NodeIO();
  const doc = await io.read(input);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];

  // -- 1. bake a texture into vertex colours, where there is one and no COLOR_0 --
  let baked = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getAttribute("COLOR_0")) {
        continue; // Already painted per vertex; leave it be.
      }
      const material = prim.getMaterial();
      const texture = material?.getBaseColorTexture();
      const uv = prim.getAttribute("TEXCOORD_0");
      if (!texture || !uv) {
        continue; // No texture to sample; it falls back to the flat colour.
      }
      const image = texture.getImage();
      if (!image || texture.getMimeType() !== "image/png") {
        console.warn(
          `  skipping bake: texture is ${texture.getMimeType() ?? "unknown"}, only image/png is sampled. Convert it to PNG in Blender, or vertex-paint instead.`,
        );
        continue;
      }
      const png = PNG.sync.read(Buffer.from(image));
      const {width, height, data} = png;
      const count = uv.getCount();
      const colours = new Float32Array(count * 3);
      const tmp = [0, 0];
      for (let i = 0; i < count; i++) {
        uv.getElement(i, tmp);
        // Wrap the uv into 0–1, flip v (image origin is top-left), clamp to the
        // texel grid.
        const u = tmp[0] - Math.floor(tmp[0]);
        const w = 1 - (tmp[1] - Math.floor(tmp[1]));
        const px = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
        const py = Math.min(height - 1, Math.max(0, Math.floor(w * height)));
        const at = (py * width + px) * 4;
        colours[i * 3] = srgbToLinear(data[at]);
        colours[i * 3 + 1] = srgbToLinear(data[at + 1]);
        colours[i * 3 + 2] = srgbToLinear(data[at + 2]);
      }
      const accessor = doc
        .createAccessor()
        .setType("VEC3")
        .setBuffer(buffer)
        .setArray(colours);
      prim.setAttribute("COLOR_0", accessor);
      baked++;
    }
  }

  // -- 2. drop everything the game recomputes or discards --
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const name of ["NORMAL", "TANGENT", "TEXCOORD_0", "TEXCOORD_1"]) {
        if (prim.getAttribute(name)) {
          prim.setAttribute(name, null);
        }
      }
    }
  }
  for (const mat of root.listMaterials()) {
    mat.setBaseColorTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setNormalTexture(null);
    mat.setOcclusionTexture(null);
    mat.setEmissiveTexture(null);
  }

  // -- 3. weld, decimate, tidy --
  await MeshoptSimplifier.ready;
  const steps = [dedup(), weld()];
  if (ratio < 1) {
    steps.push(simplify({simplifier: MeshoptSimplifier, ratio, error: 0.01}));
  }
  steps.push(prune());
  await doc.transform(...steps);

  const before = statSync(input).size;
  await io.write(output, doc);
  const after = statSync(output).size;

  let tris = 0;
  let verts = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      verts += pos.getCount();
    }
  }

  console.log(`\n${input} → ${output}`);
  console.log(
    `  ${baked ? `baked ${baked} texture(s) into vertex colours` : "kept existing colours"}`,
  );
  console.log(
    `  ${Math.round(tris).toLocaleString()} triangles, ${verts.toLocaleString()} vertices`,
  );
  console.log(
    `  ${bytes(before)} → ${bytes(after)}   (${(before / after).toFixed(1)}× smaller)`,
  );
  console.log(
    "  plain vertex-coloured glb — loads through islandModels.ts as painted.",
  );
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exit(1);
});
