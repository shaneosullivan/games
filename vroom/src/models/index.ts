import * as THREE from "three";
import {CAR, ENVIRONMENTS, Environment, Palette, TRACK} from "../config";
import {Rng} from "../core/rng";
import {material as materialFor} from "../render/materials";
import {Assembly} from "./assembly";
import {beast} from "./beasts";
import {car, driver} from "./car";
import {plant} from "./flora";
import {neonSign} from "./neon";
import {barrier, cone, gantry, ramp, tyreStack} from "./props";
import {spectator, stand} from "./stand";

export {beast} from "./beasts";
export {car, driver} from "./car";
export {plant} from "./flora";
export {neonSign} from "./neon";
export {barrier, cone, gantry, ramp, tyreStack} from "./props";
export {spectator, stand} from "./stand";
export {Assembly, DETAIL, rounded} from "./assembly";

/**
 * Every model in the game, in one list.
 *
 * This exists for the model viewer, and having it exist is worth something on
 * its own: a model nobody can look at in isolation is a model nobody notices
 * is wrong. Anything added to the game gets added here, and then it can be
 * turned round on screen at any angle before it is ever driven past at a
 * hundred kilometres an hour.
 */
export interface ModelEntry {
  id: string;
  name: string;
  /** Roughly how big it is, so the viewer can frame it without guessing. */
  size: number;
  /** Built fresh each time: the viewer owns its own copies. */
  make(palette: Palette, rng: Rng): THREE.Object3D;
}

export const MODELS: Array<ModelEntry> = [
  {
    id: "car-player",
    name: "Player car",
    size: 22,
    make: () => car(0xd6473c),
  },
  {
    id: "car-rival",
    name: "Rival car",
    size: 22,
    make: () => car(0x3f7fd6),
  },
  {
    id: "car-cow",
    name: "Cow car",
    size: 26,
    make: () => beast("cow", 0xd6473c),
  },
  {
    id: "car-chicken",
    name: "Chicken car",
    size: 26,
    make: () => beast("chicken", 0xe0b13c),
  },
  {
    id: "driver",
    name: "Driver",
    size: 9,
    make: () => {
      // On their own, away from the car, so a helmet that is inside out or an
      // arm going through the wheel is obvious rather than hidden in a tub.
      const a = new Assembly();
      driver(a, CAR.length, CAR.width, 0xd6473c);
      const built = a.build();
      built.position.y = -4.5;
      const holder = new THREE.Group();
      holder.add(built);
      return holder;
    },
  },
  {
    id: "tyre-stack",
    name: "Tyre stack",
    size: 24,
    make: p => tyreStack(p).build(),
  },
  {
    id: "ramp",
    name: "Ramp",
    size: 60,
    make: () => ramp().build(),
  },
  {
    id: "cone",
    name: "Cone",
    size: 10,
    make: p => cone(p).build(),
  },
  {
    id: "barrier",
    name: "Barrier section",
    size: 26,
    make: p => barrier(p, 20).build(),
  },
  {
    id: "gantry",
    name: "Start gantry",
    size: 110,
    make: p => gantry(p, TRACK.half * 2.4).build(),
  },
  {
    id: "stand",
    name: "Grandstand",
    size: 150,
    make: p => stand(p).build(),
  },
  {
    id: "spectator",
    name: "Spectator",
    size: 11,
    make: () => {
      const built = spectator().build();
      built.position.y = -5;
      const holder = new THREE.Group();
      holder.add(built);
      return holder;
    },
  },
  {
    id: "tree",
    name: "Tree",
    size: 46,
    make: (p, rng) => plant(p, rng).build(),
  },
  {
    id: "neon-ring",
    name: "Neon sign — ring",
    size: 110,
    make: (_p, rng) =>
      neonSign(ENVIRONMENTS.neon, rng, {shape: "ring", broken: false}).group,
  },
  {
    id: "neon-zigzag",
    name: "Neon sign — zigzag",
    size: 110,
    make: (_p, rng) =>
      neonSign(ENVIRONMENTS.neon, rng, {shape: "zigzag", broken: false}).group,
  },
  {
    id: "neon-spiral",
    name: "Neon sign — spiral",
    size: 110,
    make: (_p, rng) =>
      neonSign(ENVIRONMENTS.neon, rng, {shape: "spiral", broken: false}).group,
  },
  {
    id: "neon-arrow",
    name: "Neon sign — arrow",
    size: 110,
    make: (_p, rng) =>
      neonSign(ENVIRONMENTS.neon, rng, {shape: "arrow", broken: false}).group,
  },
];

/** The environments a model can be shown in, for the viewer's picker. */
export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS) as Array<Environment>;

/**
 * Makes an InstancedMesh per substance from one assembly.
 *
 * The way anything that appears more than a handful of times gets onto the
 * screen. Four hundred trees at this level of detail would be four hundred
 * draw calls and several million triangles submitted individually; instanced
 * they are two calls and one copy of the geometry.
 */
export function instance(
  built: Assembly,
  count: number,
): Array<THREE.InstancedMesh> {
  return built.parts().map(({substance, geometry}) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      materialFor(substance),
      count,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // An InstancedMesh is culled against the bounds of its *geometry* — one
    // copy, at the origin — and not against where its instances actually are.
    mesh.frustumCulled = false;
    return mesh;
  });
}
