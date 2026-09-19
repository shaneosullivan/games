import * as THREE from "three";
import {STEAM} from "../config";
import {DETAIL} from "./assembly";

/**
 * A little steam out of a chimney: a few soft puffs, each rising, swelling
 * and fading, one after another, from `at` in the model's own frame.
 *
 * Moved as they are drawn rather than by anything ticking them, so whatever
 * wears them steams in the garage and the model room as well as in a race.
 * They are children of the model, so they travel with it: a wisp, not a trail.
 *
 * The tank engine's first, and the chicken's too now — it has an exhaust on
 * its back, and an exhaust with nothing coming out of it is a pipe.
 */
export function steam(
  at: THREE.Vector3,
  size: number,
  rise: number,
): Array<THREE.Object3D> {
  const out: Array<THREE.Object3D> = [];
  for (let i = 0; i < STEAM.puffs; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xf4f6f8,
      roughness: 1,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(size, DETAIL.coarse, 8),
      material,
    );
    const phase = i / STEAM.puffs;
    puff.onBeforeRender = () => {
      const t = (performance.now() / 1000 / STEAM.every + phase) % 1;
      // Up, back a little as if the model were leaving it behind, bigger,
      // and gone.
      puff.position.set(at.x, at.y + t * rise, at.z - t * STEAM.drift);
      puff.scale.setScalar(0.45 + t * 1.3);
      material.opacity =
        STEAM.opacity * Math.sin(Math.PI * Math.min(1, t * 1.4));
      puff.updateMatrixWorld();
    };
    out.push(puff);
  }
  return out;
}
