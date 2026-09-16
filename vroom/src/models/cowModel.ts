import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {CAR, COW} from "../config";
import {material} from "../render/materials";
import garageUrl from "../assets/cow-garage.glb";
import raceUrl from "../assets/cow-race.glb";

/**
 * The cow, as a model file rather than a pile of shapes.
 *
 * Made by somebody with a sculpting tool, and a great deal better than the
 * barrel with legs it replaces — but it arrived at 925,000 triangles and 35 MB,
 * so it has been baked down with `scripts/glb-bake.mjs`: its texture painted
 * into the vertices and the mesh simplified. Twice, to two sizes, because the
 * two places a cow is seen want different things:
 *
 * - **In the garage**, the cow fills the screen, turning, a few feet away. That
 *   one is 46,000 triangles, where the eye and the patches are crisp.
 * - **In a race**, four of them can be on the grid seen from high above, and
 *   none is more than a thumbnail. That one is 18,500.
 *
 * Both load when the game starts. Until they arrive — or if they never do —
 * the cow built from shapes stands in, so nothing ever waits on a download.
 */
export type CowDetail = "race" | "garage";

const ready: Partial<Record<CowDetail, THREE.BufferGeometry>> = {};
let loading: Promise<void> | null = null;

/** Starts both loading, once; resolves when both have loaded or failed. */
export function loadCows(): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all(
      (
        [
          ["garage", garageUrl],
          ["race", raceUrl],
        ] as Array<[CowDetail, string]>
      ).map(([detail, url]) =>
        loader
          .loadAsync(url)
          .then(gltf => {
            ready[detail] = prepare(gltf.scene);
          })
          .catch(() => {
            // The shapes cow stands in. A missing model is a plainer cow, not
            // a broken race.
          }),
      ),
    ).then(() => undefined);
  }
  return loading;
}

/** The cow at this detail in this colour, or null if it has not loaded. */
export function cowModel(
  detail: CowDetail,
  colour: number,
): THREE.Group | null {
  const base = ready[detail] ?? ready.race ?? ready.garage;
  if (!base) {
    return null;
  }
  const geometry = base.clone();
  paint(geometry, colour);
  const mesh = new THREE.Mesh(geometry, material("matte"));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = "cow";
  group.add(mesh);
  return group;
}

/**
 * Into the game's terms: one geometry, as long as a car, standing on the
 * ground, centred, facing +Z like every car. It already faces +Z — its head
 * is at that end — so the only turning is none.
 */
function prepare(scene: THREE.Object3D): THREE.BufferGeometry {
  scene.updateMatrixWorld(true);
  let found: THREE.BufferGeometry | null = null;
  scene.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!found && mesh.isMesh) {
      found = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    }
  });
  if (!found) {
    throw new Error("no mesh in the cow");
  }
  const geometry = found as THREE.BufferGeometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const scale = CAR.length / size.z;
  const centre = box.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The chosen colour, on the white of the cow.
 *
 * Only the white: the black patches, the pink nose and the dark tyres keep
 * their own colours — the pale hubs take a little of it too, which only helps
 * them match — so a blue cow is still a cow with patches rather than a blue
 * lump. How white a vertex is decides how much of the colour it takes, which
 * keeps the shading the bake put in. Picking the garage's white gives back the
 * cow exactly as it was made.
 *
 * A dark colour turns the cow round instead, the way a black cow is: black all
 * over with white patches, where the black was. Painting the white black and
 * leaving the patches alone was a black cow with no patches at all. The tyres
 * are below `COW.wheelsBelow` and stay black either way.
 *
 * And never the eyes. They are white with black pupils whatever the cow is,
 * and a blue eye or a black one reads as something wrong with the cow.
 */
function paint(geometry: THREE.BufferGeometry, colour: number): void {
  const attribute = geometry.getAttribute("color") as THREE.BufferAttribute;
  const position = geometry.getAttribute("position");
  if (!attribute) {
    return;
  }
  const colours = new THREE.BufferAttribute(
    new Float32Array(attribute.count * 3),
    3,
  );
  const tint = new THREE.Color(colour);
  const black = dark(colour);
  const patch = new THREE.Color(COW.patch);
  for (let i = 0; i < attribute.count; i++) {
    const r = attribute.getX(i);
    const g = attribute.getY(i);
    const b = attribute.getZ(i);
    const x = Math.abs(position.getX(i)) - COW.eye.x;
    const y = position.getY(i) - COW.eye.y;
    const z = position.getZ(i) - COW.eye.z;
    if (x * x + y * y + z * z < COW.eye.radius ** 2) {
      colours.setXYZ(i, r, g, b);
      continue;
    }
    const most = Math.max(r, g, b);
    const least = Math.min(r, g, b);
    const grey = most > 0 ? 1 - (most - least) / most : 1;
    const greyness = THREE.MathUtils.clamp(
      (grey - COW.greyFrom) / COW.greyOver,
      0,
      1,
    );
    const white =
      THREE.MathUtils.clamp((most - COW.whiteFrom) / COW.whiteOver, 0, 1) *
      greyness;
    // The colour it becomes, weighted by how much it becomes it.
    let [tr, tg, tb, amount] = [
      tint.r * most,
      tint.g * most,
      tint.b * most,
      white,
    ];
    if (black) {
      const patched =
        position.getY(i) > COW.wheelsBelow
          ? THREE.MathUtils.clamp(
              (COW.blackBelow - most) / COW.blackBelow,
              0,
              1,
            )
          : 0;
      if (patched > white) {
        [tr, tg, tb, amount] = [patch.r, patch.g, patch.b, patched];
      } else {
        [tr, tg, tb] = [tint.r, tint.g, tint.b];
      }
    }
    colours.setXYZ(
      i,
      r + (tr - r) * amount,
      g + (tg - g) * amount,
      b + (tb - b) * amount,
    );
  }
  geometry.setAttribute("color", colours);
}

/** Whether a colour is dark enough to paint the cow black with white patches. */
function dark(colour: number): boolean {
  const hsl = {h: 0, s: 0, l: 0};
  new THREE.Color(colour).getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l < 0.25;
}
