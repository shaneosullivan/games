#!/usr/bin/env node
// Browse every .glb in the repo, side by side, to eyeball how they look and
// which way they face.
//
//   node scripts/glb-view.mjs [root]
//
// Finds every .glb under the repo (or under `root` if given), lists them down
// the left with a checkbox each, and shows the ticked ones in a grid — empty to
// start, add and remove models as you go. Each is rendered the way the game
// renders them: merged, toon-shaded, painted from its vertex colours if it was
// baked, or from its texture if it is still a raw Blender export. A turntable
// you can drag, over a grid with an arrow marking +Z ("downhill" on the
// mountain, the way a foe should face the bee).
//
// No dependencies of its own: three is served straight out of bee/node_modules,
// so it needs no network and no install.

import {createServer} from "node:http";
import {readFile, readdir} from "node:fs/promises";
import {statSync} from "node:fs";
import {join, resolve, relative, sep} from "node:path";
import {fileURLToPath} from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "..");
const threeDir = join(repo, "bee", "node_modules", "three");
const root = resolve(process.cwd(), process.argv[2] ?? repo);

const SKIP = new Set(["node_modules", "dist", ".git"]);

/** Every .glb under a directory, skipping the noise. */
async function findGlbs(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, {withFileTypes: true});
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") {
      if (e.isDirectory()) {
        continue;
      }
    }
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) {
        await findGlbs(full, out);
      }
    } else if (e.name.toLowerCase().endsWith(".glb")) {
      out.push(full);
    }
  }
  return out;
}

const KB = 1024;
const sizeOf = p => {
  try {
    const n = statSync(p).size;
    return n >= KB * KB
      ? `${(n / KB / KB).toFixed(2)} MB`
      : `${(n / KB).toFixed(0)} KB`;
  } catch {
    return "?";
  }
};

const files = (await findGlbs(root)).sort();
const models = files.map((p, i) => ({
  i,
  path: relative(root, p).split(sep).join("/"),
  size: sizeOf(p),
}));

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #10151b; color: #cdd6e0; font: 13px/1.4 system-ui, sans-serif; display: flex; height: 100vh; }
  aside { width: 300px; flex: none; border-right: 1px solid #223; overflow-y: auto; padding: 8px 0; }
  aside h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #789; margin: 12px 12px 4px; }
  label { display: flex; gap: 8px; align-items: baseline; padding: 4px 12px; cursor: pointer; }
  label:hover { background: #172029; }
  label input { margin: 0; }
  label .nm { flex: 1; word-break: break-all; }
  label .sz { color: #678; font-size: 11px; flex: none; }
  main { flex: 1; overflow-y: auto; }
  .bar { padding: 10px 16px; border-bottom: 1px solid #223; color: #9ab; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2px; padding: 2px; }
  .cell { position: relative; aspect-ratio: 1 / 1; background: #171d25; }
  .cap { position: absolute; left: 8px; bottom: 8px; right: 8px; pointer-events: none; }
  .cap b { color: #fff; font-weight: 600; }
  .cap span { color: #8aa; }
  .empty { color: #567; padding: 40px; text-align: center; }
  canvas { display: block; width: 100%; height: 100%; }
  .tools { position: absolute; top: 6px; right: 6px; z-index: 2; display: flex; gap: 4px; }
  .tool { background: #0009; color: #cdd6e0; border: 1px solid #345; border-radius: 5px; padding: 3px 9px; cursor: pointer; font-size: 15px; line-height: 1; }
  .tool:hover { background: #000d; border-color: #578; }
  /* Maximised: hide the rest, blow this one up to fill the area. */
  .grid.has-max .cell { display: none; }
  .grid.has-max .cell.max { display: block; grid-column: 1 / -1; aspect-ratio: auto; height: calc(100vh - 46px); }
</style>
<script type="importmap">
{ "imports": { "three": "/three/build/three.module.js", "three/addons/": "/three/jsm/" } }
</script>
</head>
<body>
<aside id="list"></aside>
<main>
  <div class="bar">drag to orbit · scroll to zoom · arrow marks +Z (downhill). Tick a model on the left to add it.</div>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty">No models yet — tick one on the left.</div>
</main>
<script type="module">
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";

const MODELS = ${JSON.stringify(models)};
const loader = new GLTFLoader();

// The game's 3-band toon ramp (materials.ts), so colours read as in game.
function toonRamp() {
  const bands = new Uint8Array([120, 190, 236, 255]);
  const tex = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const ramp = toonRamp();

// ---- sidebar ----
const list = document.getElementById("list");
let group = "";
for (const m of MODELS) {
  const dir = m.path.includes("/") ? m.path.slice(0, m.path.lastIndexOf("/")) : ".";
  if (dir !== group) {
    group = dir;
    const h = document.createElement("h2");
    h.textContent = dir;
    list.appendChild(h);
  }
  const label = document.createElement("label");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.i = m.i;
  const nm = document.createElement("span");
  nm.className = "nm";
  nm.textContent = m.path.slice(m.path.lastIndexOf("/") + 1);
  const sz = document.createElement("span");
  sz.className = "sz";
  sz.textContent = m.size;
  label.append(cb, nm, sz);
  cb.addEventListener("change", () => (cb.checked ? add(m) : remove(m.i)));
  list.appendChild(label);
}

// ---- grid ----
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const cells = new Map();

function refreshEmpty() {
  empty.style.display = cells.size ? "none" : "";
}

function remove(i) {
  const cell = cells.get(i);
  if (!cell) return;
  cell.stop = true;
  cell.renderer.dispose();
  // If the one being removed was maximised, drop the grid back to normal.
  if (cell.el.classList.contains("max")) {
    grid.classList.remove("has-max");
  }
  cell.el.remove();
  cells.delete(i);
  refreshEmpty();
}

function add(m) {
  refreshEmpty();
  const el = document.createElement("div");
  el.className = "cell";
  const cap = document.createElement("div");
  cap.className = "cap";
  cap.innerHTML = '<b>' + m.path + '</b> <span>· ' + m.size + ' · …</span>';
  el.appendChild(cap);
  const tools = document.createElement("div");
  tools.className = "tools";
  // Pause / resume the turntable, so a model can be held still to inspect.
  const pause = document.createElement("button");
  pause.className = "tool";
  pause.textContent = "⏸";
  pause.title = "Pause";
  // Maximise / minimise: blow this cell up to fill the area, or drop back to
  // the grid. Only one is maximised at a time.
  const zoom = document.createElement("button");
  zoom.className = "tool";
  zoom.textContent = "⛶";
  zoom.title = "Maximise";
  zoom.addEventListener("click", () => {
    const max = el.classList.toggle("max");
    grid.querySelectorAll(".cell.max").forEach(c => {
      if (c !== el) c.classList.remove("max");
    });
    grid.classList.toggle("has-max", max);
    zoom.textContent = max ? "🗕" : "⛶";
    zoom.title = max ? "Minimise" : "Maximise";
  });
  tools.append(pause, zoom);
  el.appendChild(tools);
  grid.appendChild(el);

  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(devicePixelRatio);
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  cam.position.set(2.4, 1.7, 3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 6, 4);
  scene.add(key);
  scene.add(new THREE.GridHelper(4, 8, 0x334455, 0x223344));
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 0), 1.6, 0x44ccff, 0.3, 0.18));

  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  pause.addEventListener("click", () => {
    controls.autoRotate = !controls.autoRotate;
    pause.textContent = controls.autoRotate ? "⏸" : "▶";
    pause.title = controls.autoRotate ? "Pause" : "Resume";
  });

  const cell = {el, renderer, stop: false};
  cells.set(m.i, cell);

  loader.loadAsync('/m/' + m.i + '.glb').then(gltf => {
    let tris = 0;
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      g.computeVertexNormals();
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      // Painted however it was painted: per-vertex colours if baked (what the
      // game uses), else its texture if still a raw export, else flat colour.
      const hasColour = !!g.attributes.color;
      const base = Array.isArray(o.material) ? o.material[0] : o.material;
      const map = !hasColour && base && base.map ? base.map : null;
      o.material = new THREE.MeshToonMaterial({
        gradientMap: ramp,
        vertexColors: hasColour,
        map,
        color: hasColour || map ? 0xffffff : (base && base.color ? base.color.getHex() : 0xcccccc),
      });
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = 1.8 / Math.max(size.x, size.y, size.z);
    gltf.scene.scale.setScalar(scale);
    gltf.scene.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
    scene.add(gltf.scene);
    // Frame the whole thing: pull the camera back to fit the model's bounding
    // sphere (rotation-proof, and roomy enough to keep the +Z arrow in shot)
    // so it reads in full without anyone reaching for the scroll wheel.
    const sphere = new THREE.Box3()
      .setFromObject(gltf.scene)
      .getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1.7);
    const dist = (radius / Math.sin((35 * Math.PI) / 180 / 2)) * 1.15;
    controls.target.copy(sphere.center);
    cam.position
      .copy(sphere.center)
      .add(new THREE.Vector3(0.55, 0.4, 1).normalize().multiplyScalar(dist));
    controls.update();
    cap.innerHTML = '<b>' + m.path + '</b> <span>· ' + m.size + ' · ' + Math.round(tris).toLocaleString() + ' tris</span>';
  }).catch(e => {
    cap.innerHTML = '<b>' + m.path + '</b> <span>· failed: ' + e.message + '</span>';
  });

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);
  resize();
  (function tick() {
    if (cell.stop) return;
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, cam);
  })();
}
</script>
</body>
</html>`;

const send = (res, code, body, type) => {
  res.writeHead(code, {"content-type": type ?? "text/plain"});
  res.end(body);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      return send(res, 200, page, "text/html");
    }
    const model = url.pathname.match(/^\/m\/(\d+)\.glb$/);
    if (model) {
      return send(
        res,
        200,
        await readFile(files[Number(model[1])]),
        "model/gltf-binary",
      );
    }
    if (url.pathname.startsWith("/three/build/")) {
      const p = join(
        threeDir,
        "build",
        url.pathname.slice("/three/build/".length),
      );
      return send(res, 200, await readFile(p), "text/javascript");
    }
    if (url.pathname.startsWith("/three/jsm/")) {
      const p = join(
        threeDir,
        "examples",
        "jsm",
        url.pathname.slice("/three/jsm/".length),
      );
      return send(res, 200, await readFile(p), "text/javascript");
    }
    send(res, 404, "not found");
  } catch (err) {
    send(res, 500, String(err.message ?? err));
  }
});

const PORT = 4180;
server.listen(PORT, () => {
  console.log(
    `\n  glb-view — ${models.length} model(s) under ${relative(process.cwd(), root) || "."}`,
  );
  console.log(`  http://localhost:${PORT}   (Ctrl-C to stop)\n`);
});
