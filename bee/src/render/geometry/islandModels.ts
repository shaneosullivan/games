import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import crocUrl from "../../assets/islands/croc1.glb";
import frogUrl from "../../assets/islands/frog1.glb";
import {ISLANDS as I} from "../../config";
import {carryColour, paint} from "../materials";

/**
 * The two bought-in models: a frog and a crocodile.
 *
 * The only model files in the game — everything else is generated in code, and
 * what earns them the exception is that these two are what the player looks at
 * most in level 7: a board of hand-built lozenges is fine for water and banks,
 * and not for the animals that are trying to eat you.
 *
 * The frog arrived rigged, with four animation clips and an armature it has no
 * use for — it sits on a lilypad and drifts. Those were stripped out of the
 * file, which halved it: 587 kB to 270 kB, and 44 nodes to 2.
 *
 * They arrive in whatever units and facing their authors used — the frog is
 * three centimetres long, the crocodile is thirteen hundred units and sits off
 * to one side of its own origin — so nothing downstream should ever see the
 * raw file. `prepare` puts both into the game's terms: a known length, centred
 * on the origin, facing +x like every hand-built rider in islands.ts, and
 * wearing the toon material the rest of the level wears.
 */
export interface IslandModels {
  /**
   * One geometry apiece, ready to be a single mesh.
   *
   * Baked rather than handed over as loaded: both files are four primitives
   * with four flat colours, and left as they came they cost five draw calls
   * per rider — a hundred and fifty-nine for a board of them, on a game meant
   * for an iPad. Merged with the colours baked into the vertices they are one
   * each, which is what everything else in this game already does.
   */
  readonly frog: THREE.BufferGeometry;
  readonly croc: THREE.BufferGeometry;
  /**
   * Where the frog's mouth is, in its own frame, once it faces +x.
   *
   * Measured from the model — the centroid of the material its mouth is drawn
   * in — so the tongue comes out of the frog's face rather than out of a point
   * someone guessed at.
   */
  readonly mouth: THREE.Vector3;
}

let pending: Promise<IslandModels> | null = null;

/**
 * Load both, once, whoever asks first.
 *
 * The level is built synchronously and cannot wait for this, so it puts up its
 * own hand-built riders and swaps them out when this resolves — see
 * `useModels` in islands.ts. A failed load is not fatal: the level keeps the
 * shapes it already has.
 */
export function loadIslandModels(): Promise<IslandModels> {
  if (!pending) {
    pending = load();
  }
  return pending;
}

/**
 * Load one model file and hand back a single game-ready geometry.
 *
 * The same `prepare` the islands use, exposed for anywhere else that wants to
 * drop a Blender model into the game: it comes back a known length, centred on
 * the origin, standing on the ground, facing +x turned by `yaw`, and wearing
 * whatever colours it was painted with — flat per part, or per vertex if it was
 * baked that way (see scripts/glb-bake.mjs). Render it with `vertexToon()`.
 */
export async function loadPreparedModel(
  url: string,
  targetLength: number,
  yaw: number,
): Promise<THREE.BufferGeometry> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return prepare(gltf.scene, targetLength, yaw).geometry;
}

async function load(): Promise<IslandModels> {
  const loader = new GLTFLoader();
  const [frogGltf, crocGltf] = await Promise.all([
    loader.loadAsync(frogUrl),
    loader.loadAsync(crocUrl),
  ]);

  const frog = prepare(frogGltf.scene, I.frogModel.length, I.frogModel.yaw);
  const croc = prepare(
    crocGltf.scene,
    I.gatorHalf * 2 * I.square,
    I.crocModel.yaw,
  );
  return {
    frog: frog.geometry,
    croc: croc.geometry,
    // The reddest thing on a frog is the inside of its mouth.
    mouth: frog.centroids.get(reddest(frog.centroids)) ?? new THREE.Vector3(),
  };
}

/**
 * Put a loaded model into the level's terms.
 *
 * Wrapped in a group rather than adjusted in place, so the transform survives
 * cloning and nothing downstream has to know what units the file was in.
 */
function prepare(
  scene: THREE.Object3D,
  targetLength: number,
  yaw: number,
): {geometry: THREE.BufferGeometry; centroids: Map<number, THREE.Vector3>} {
  // Measure it as it stands, then work out what it takes to make it the size
  // the level wants, standing on the ground, centred, facing +x.
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.z);
  const scale = longest > 0 ? targetLength / longest : 1;
  const into = new THREE.Matrix4()
    .makeRotationY(yaw)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(
      new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z),
    );

  const parts: Array<THREE.BufferGeometry> = [];
  const centroids = new Map<number, THREE.Vector3>();
  scene.updateWorldMatrix(true, true);
  scene.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const material = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as THREE.MeshStandardMaterial;
    const colour = lift(material.color?.getHex() ?? 0xffffff);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.applyMatrix4(into);
    // The file's own vertex data is all this needs; anything else the merge
    // would have to match across every part.
    for (const attribute of [
      "uv",
      "uv1",
      "tangent",
      "skinIndex",
      "skinWeight",
    ]) {
      geo.deleteAttribute(attribute);
    }
    // A model painted in Blender arrives with its own per-vertex colours; keep
    // them rather than flattening the part to a single material tone. A model
    // built the old way — one flat material colour per part, no COLOR_0 — is
    // painted that colour as before.
    const painted = geo.getAttribute("color")
      ? carryColour(geo)
      : paint(geo, colour);
    if (!painted.attributes.normal) {
      painted.computeVertexNormals();
    }
    parts.push(painted);

    // Where this colour sits, for anyone who needs to find a part of the model
    // afterwards — the mouth, in the frog's case. Meaningful only for the flat
    // path; a vertex-coloured part has no one colour, and nothing that reads
    // this uses such a model.
    const position = painted.attributes.position;
    const sum = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      sum.add(v.fromBufferAttribute(position, i));
    }
    centroids.set(colour, sum.divideScalar(Math.max(1, position.count)));
  });

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return {geometry: merged ?? new THREE.BufferGeometry(), centroids};
}

/**
 * Brighten a colour from a model file, leaving its hue alone.
 *
 * Lightness only, and nothing done to anything already nearly black: that is
 * eyes and pupils, and lifting those turns a face into a smudge.
 */
function lift(hex: number): number {
  const colour = new THREE.Color(hex);
  const hsl = {h: 0, s: 0, l: 0};
  colour.getHSL(hsl);
  if (hsl.l < 0.08) {
    return hex;
  }
  colour.setHSL(hsl.h, hsl.s, 1 - (1 - hsl.l) * (1 - I.modelLift));
  return colour.getHex();
}

/** Which of these colours is the most red — a frog's mouth, in practice. */
function reddest(centroids: Map<number, THREE.Vector3>): number {
  let best = 0;
  let bestScore = -Infinity;
  const c = new THREE.Color();
  for (const colour of centroids.keys()) {
    c.setHex(colour);
    const score = c.r - (c.g + c.b) / 2;
    if (score > bestScore) {
      bestScore = score;
      best = colour;
    }
  }
  return best;
}
