#!/usr/bin/env node
// Diagnose why a .glb is the size it is, and what could be done about it.
//
//   node scripts/glb-diagnose.mjs path/to/model.glb
//
// Pure Node, no dependencies: it parses the glTF-Binary container by hand and
// reports the container's shape, a byte breakdown of where the file's weight
// actually is, and a list of concrete issues with the saving each one is worth.
//
// The thing it is built to catch is the one that bit mrfrog.glb: a file that is
// large not because it has many triangles but because it stores every triangle
// corner as its own uncompressed vertex, normals and all, with a texture this
// repo would throw away. Reducing the polygon count does nothing about any of
// that, which is why an 80%-lighter mesh was still eight megabytes.

import {readFileSync} from "node:fs";

// ---- glTF constants ---------------------------------------------------------

const COMPONENT_BYTES = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};
const COMPONENT_NAME = {
  5120: "int8",
  5121: "uint8",
  5122: "int16",
  5123: "uint16",
  5125: "uint32",
  5126: "float32",
};
const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

const KB = 1024;
const MB = 1024 * 1024;
const bytes = n =>
  n >= MB
    ? `${(n / MB).toFixed(2)} MB`
    : n >= KB
      ? `${(n / KB).toFixed(1)} KB`
      : `${n} B`;

// ---- container --------------------------------------------------------------

/** Split a .glb into its JSON manifest and its binary blob. */
function parseGlb(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(
      "Not a .glb file (bad magic). A .gltf + .bin pair is not supported here.",
    );
  }
  const version = buf.readUInt32LE(4);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === CHUNK_JSON) {
      json = JSON.parse(buf.slice(start, start + length).toString("utf8"));
    } else if (type === CHUNK_BIN) {
      bin = buf.slice(start, start + length);
    }
    // Chunks are four-byte aligned.
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json) {
    throw new Error("No JSON chunk found.");
  }
  return {version, json, bin};
}

/** Count vertices whose position is shared, i.e. how far a weld could get. */
function uniquePositions(json, bin, primitive) {
  const idx = primitive.attributes.POSITION;
  if (idx == null) {
    return null;
  }
  const acc = json.accessors[idx];
  if (acc.componentType !== 5126 || acc.type !== "VEC3") {
    // Quantised or compressed positions can't be compared as plain floats.
    return null;
  }
  const view = json.bufferViews[acc.bufferView];
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  const seen = new Set();
  for (let i = 0; i < acc.count; i++) {
    const at = base + i * stride;
    // Rounded to the micron before hashing, so vertices that differ only in
    // float noise still count as one — the same tolerance a weld would use.
    const x = Math.round(bin.readFloatLE(at) * 1e5);
    const y = Math.round(bin.readFloatLE(at + 4) * 1e5);
    const z = Math.round(bin.readFloatLE(at + 8) * 1e5);
    seen.add(`${x},${y},${z}`);
  }
  return seen.size;
}

// ---- report -----------------------------------------------------------------

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/glb-diagnose.mjs <model.glb>");
    process.exit(1);
  }
  const buf = readFileSync(file);
  const {version, json, bin} = parseGlb(buf);

  const line = "─".repeat(64);
  console.log(line);
  console.log(`${file}  —  ${bytes(buf.length)}  (glb v${version})`);
  console.log(line);

  // -- container overview --
  const ext = json.extensionsUsed ?? [];
  console.log("\nContents");
  console.log(
    `  meshes ${json.meshes?.length ?? 0}   materials ${json.materials?.length ?? 0}   images ${json.images?.length ?? 0}   animations ${(json.animations ?? []).length}   skins ${(json.skins ?? []).length}`,
  );
  console.log(`  extensions: ${ext.length ? ext.join(", ") : "none"}`);

  // -- where the bytes are: bufferViews, labelled by what reads them --
  const views = json.bufferViews ?? [];
  const label = new Array(views.length).fill("");
  for (let a = 0; a < (json.accessors ?? []).length; a++) {
    const acc = json.accessors[a];
    if (acc.bufferView == null) {
      continue;
    }
    // Name the view after the first accessor that uses it.
    if (!label[acc.bufferView]) {
      label[acc.bufferView] =
        `${acc.type} ${COMPONENT_NAME[acc.componentType] ?? acc.componentType}`;
    }
  }
  for (const im of json.images ?? []) {
    if (im.bufferView != null) {
      label[im.bufferView] = `image ${im.mimeType ?? ""}`.trim();
    }
  }
  const ranked = views
    .map((v, i) => ({i, len: v.byteLength, what: label[i] || "?"}))
    .sort((a, b) => b.len - a.len);
  const total = ranked.reduce((s, v) => s + v.len, 0);
  console.log(`\nWhere the ${bytes(total)} of binary is`);
  for (const v of ranked.slice(0, 8)) {
    const pct = total ? ((v.len / total) * 100).toFixed(0) : "0";
    console.log(
      `  ${bytes(v.len).padStart(9)}  ${String(pct).padStart(3)}%  bufferView ${v.i}  ${v.what}`,
    );
  }

  // -- per-primitive geometry --
  const issues = [];
  let tris = 0;
  let hasNormals = false;
  let hasUv = false;
  let dracoOrMeshopt = false;
  console.log("\nGeometry");
  for (const [m, mesh] of (json.meshes ?? []).entries()) {
    for (const [p, prim] of mesh.primitives.entries()) {
      const attrs = Object.keys(prim.attributes);
      const posAcc = json.accessors[prim.attributes.POSITION];
      const stored = posAcc?.count ?? 0;
      const triCount =
        prim.indices != null
          ? json.accessors[prim.indices].count / 3
          : stored / 3;
      tris += triCount;
      hasNormals ||= "NORMAL" in prim.attributes;
      hasUv ||= "TEXCOORD_0" in prim.attributes;
      const compressed =
        prim.extensions?.KHR_draco_mesh_compression != null ||
        (posAcc && posAcc.componentType !== 5126);
      dracoOrMeshopt ||= compressed;

      const unique = compressed ? null : uniquePositions(json, bin, prim);
      const ratio = unique ? stored / unique : null;

      console.log(
        `  mesh ${m} prim ${p}: ${triCount.toLocaleString()} triangles, ${stored.toLocaleString()} vertices`,
      );
      console.log(`    attributes: ${attrs.join(", ")}`);
      if (prim.indices != null) {
        const it = json.accessors[prim.indices];
        console.log(
          `    indices: ${COMPONENT_NAME[it.componentType]} (${bytes((COMPONENT_BYTES[it.componentType] ?? 0) * it.count)})`,
        );
      }
      if (unique != null) {
        console.log(
          `    unique positions: ${unique.toLocaleString()}  →  ${ratio.toFixed(1)}× duplication`,
        );
      }
    }
  }

  // -- byte cost of the droppable attributes, for the recommendations --
  const viewBytesFor = pred => {
    let sum = 0;
    for (let a = 0; a < (json.accessors ?? []).length; a++) {
      const acc = json.accessors[a];
      if (acc.bufferView != null && pred(acc)) {
        sum += views[acc.bufferView].byteLength;
      }
    }
    return sum;
  };
  const usedInAttr = key =>
    (json.meshes ?? []).some(me =>
      me.primitives.some(pr => key in pr.attributes),
    );
  const normalBytes = usedInAttr("NORMAL")
    ? viewBytesFor(a => a.type === "VEC3" && a.componentType === 5126) / 2 // pos+normal share the shape; halve as an estimate
    : 0;
  const uvBytes = viewBytesFor(a => a.type === "VEC2");
  const imageBytes = (json.images ?? []).reduce(
    (s, im) =>
      s + (im.bufferView != null ? views[im.bufferView].byteLength : 0),
    0,
  );

  // ---- issues ----
  const maxUnique = Math.max(
    0,
    ...(json.meshes ?? []).flatMap(me =>
      me.primitives.map(pr => {
        const posAcc = json.accessors[pr.attributes.POSITION];
        const stored = posAcc?.count ?? 0;
        const u = uniquePositions(json, bin, pr);
        return u ? stored / u : 0;
      }),
    ),
  );

  if (!dracoOrMeshopt) {
    issues.push([
      "Uncompressed geometry",
      "Positions/normals/uvs are raw float32 with no Draco, meshopt, or quantisation. Byte-level compression alone typically cuts a mesh like this 10–20×.",
    ]);
  }
  if (maxUnique > 1.3) {
    issues.push([
      `Unwelded mesh (${maxUnique.toFixed(1)}× duplication)`,
      "Every triangle stores its own corners; almost nothing is shared. This is usually flat shading or texture seams forcing per-corner normals/uvs. Welding after dropping normals collapses it.",
    ]);
  }
  if (hasNormals) {
    issues.push([
      `Normals stored (~${bytes(normalBytes)})`,
      "If your loader recomputes normals (this repo does — see islandModels.ts computeVertexNormals), they are dead weight. Drop them.",
    ]);
  }
  if (hasUv && imageBytes > 0) {
    issues.push([
      `Textured (uv ~${bytes(uvBytes)} + image ${bytes(imageBytes)})`,
      "This repo's model pipeline deletes uvs and paints each mesh part a single flat colour from its material — a texture is discarded on load. Split the mesh by colour into flat-coloured parts, or bake to vertex colours (COLOR_0), and drop the texture.",
    ]);
  }
  if (tris > 20000) {
    issues.push([
      `High triangle count (${Math.round(tris).toLocaleString()})`,
      "Reducing vertex count does not shrink an unwelded/uncompressed file, but it does lighten the GPU. For scale, this repo's shipped frog is ~270 KB and a few thousand triangles.",
    ]);
  }

  console.log("\nIssues");
  if (!issues.length) {
    console.log("  none obvious — the file is already lean.");
  }
  for (const [title, detail] of issues) {
    console.log(`  • ${title}`);
    console.log(`      ${detail}`);
  }

  console.log(`\nNext: node scripts/glb-optimize.mjs ${file}`);
  console.log(line);
}

main();
