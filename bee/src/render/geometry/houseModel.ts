import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import houseUrl from "../../assets/cottage/house.glb";
import {toonRamp} from "../materials";
import {fadeInFront, type NearFade} from "../fadeInFront";

/**
 * The Caramel Cottage, as a model.
 *
 * Unlike the islands' frog and crocodile — which are baked down to flat-painted
 * geometry (see islandModels.ts) — the cottage keeps its textures. It was
 * painted in Blender, the two framed pictures on its back wall are part of that
 * paint, and flattening a texture atlas to one colour per material would throw
 * all of that away. So each material is re-wrapped as the game's toon material
 * carrying the texture: the same 3-band ramp the rest of the game wears, lit by
 * the scene, so the model has the same shaded form it has in the model viewer
 * rather than the flat, washed-out look an unlit texture gives under the
 * renderer's tone mapping.
 *
 * It is an open-fronted dollhouse: the whole +Z face is a wide opening, so the
 * same model is both the outside of the cottage and the room you fly into for
 * the honey. Walls are drawn double-sided so they read as solid from the yard
 * and still show their inner face from inside.
 */
export interface HouseModel {
  /** Placed: floor on the ground (y = 0), centred in x/z, opening facing +Z. */
  group: THREE.Group;
  /** The fitted bounds after placement and scaling, in the group's own frame. */
  box: THREE.Box3;
  /**
   * Dissolve whatever stands between the camera and the bee — a wall the shot
   * has been pushed through while she flies the room. Pass her view depth (less
   * a margin); pass a large negative number to leave the house solid. See
   * fadeInFront.
   */
  setFadeDepth(d: number): void;
}

/**
 * Load house.glb and put it into the game's terms.
 *
 * The file arrives about 1.9 units wide, centred on its own middle; this scales
 * it to `scale`× that, drops it onto the ground and centres it in x/z, leaving
 * the wide opening facing +Z — the way the model was authored, so no rotation
 * is needed. The level places the group at the yard origin and reads the fitted
 * box back to size the smokey field over the opening.
 *
 * `fade` is the near-fade shaping for the walls (see fadeInFront); the returned
 * `setFadeDepth` drives all of the house's materials at once.
 */
export async function loadHouseModel(
  scale: number,
  fade: {band: number; cutoff: number},
): Promise<HouseModel> {
  const gltf = await new GLTFLoader().loadAsync(houseUrl);
  const model = gltf.scene;

  const fades: Array<NearFade> = [];
  model.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const src = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as THREE.MeshStandardMaterial;
    const toon = new THREE.MeshToonMaterial({
      map: src.map ?? null,
      // White where a texture carries the colour, so the map shows true; the
      // material's own tone only where a part has no map.
      color: src.map
        ? 0xffffff
        : (src.color?.clone() ?? new THREE.Color(0xffffff)),
      gradientMap: toonRamp(),
      // A dollhouse: the same walls are seen from the yard and from inside.
      side: THREE.DoubleSide,
    });
    if (toon.map) {
      toon.map.colorSpace = THREE.SRGBColorSpace;
    }
    const nf = fadeInFront(toon, {
      band: fade.band,
      cutoff: fade.cutoff,
      cacheKey: "cottageFade",
      // The house is one mesh — floor and walls together — so spare the floor,
      // or its near half dissolves under the bee.
      spareFloor: true,
    });
    fades.push(nf);
    mesh.material = nf.material;
  });

  // Centre in x/z and sit the floor on the ground, then scale bodily.
  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);

  const group = new THREE.Group();
  group.add(model);
  group.scale.setScalar(scale);

  const fitted = new THREE.Box3().setFromObject(group);
  return {
    group,
    box: fitted,
    setFadeDepth(d) {
      for (const f of fades) {
        f.setDepth(d);
      }
    },
  };
}
