import * as THREE from "three";
import {BRIDGE, EDITOR, TRACK} from "../config";

/**
 * Whether a drawn loop runs into itself.
 *
 * A circuit is allowed to cross its own path — the road builder spots a
 * junction and throws a flyover over it, which is one of the nicer things in
 * the game. What it cannot do is two stretches of road lying *along* each
 * other: there is no over and under to build, so both are laid on the same
 * ground, and what comes out is a grey slab with kerbs through the middle of
 * it, barriers standing across the racing line, and a start line underneath a
 * road nobody is driving on.
 *
 * The difference between the two is the angle. Roads meeting at a decent angle
 * are a junction and get a bridge; roads meeting at a shallow one are the same
 * road twice. That is the same test the bridge builder uses to decide whether
 * a crossing is real — `BRIDGE.crossesAt` — so the builder refuses exactly
 * what the road builder cannot cope with, and nothing else.
 */
export interface Tangle {
  /** Halfway between the two stretches, in world units. */
  x: number;
  z: number;
  /** How close they came, against the room two roads need. */
  apart: number;
}

/** The worst place two stretches of the lap foul each other, if any do. */
export function tangle(shape: Array<{x: number; z: number}>): Tangle | null {
  if (shape.length < 3) {
    return null;
  }
  const curve = new THREE.CatmullRomCurve3(
    shape.map(p => new THREE.Vector3(p.x, 0, p.z)),
    true,
    "catmullrom",
    0.5,
  );
  const length = curve.getLength();
  const n = EDITOR.clearSamples;
  const at: Array<THREE.Vector3> = [];
  const way: Array<THREE.Vector3> = [];
  for (let i = 0; i < n; i++) {
    at.push(curve.getPointAt(i / n));
    way.push(curve.getTangentAt(i / n));
  }

  // Barrier to barrier: the width of ground one road takes up. Two roads
  // closer together than this are sharing it.
  const room = (TRACK.half + TRACK.grass) * 2;
  // Far enough apart along the lap to be a different stretch of road rather
  // than the next few metres of this one. A corner has to be able to come
  // round inside this without being called a tangle, so it is measured in
  // road, not in samples.
  const elsewhere = Math.max(2, Math.round((room * 2) / (length / n)));
  const parallel = Math.cos((BRIDGE.crossesAt * Math.PI) / 180);

  let worst: Tangle | null = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + elsewhere; j < n; j++) {
      // A lap is a loop, so the last samples are neighbours of the first ones.
      if (n - (j - i) < elsewhere) {
        continue;
      }
      const gap = at[i].distanceTo(at[j]);
      if (gap >= room) {
        continue;
      }
      // Crossing at a proper angle is a junction, and gets a bridge.
      if (Math.abs(way[i].dot(way[j])) <= parallel) {
        continue;
      }
      if (!worst || gap < worst.apart) {
        worst = {
          x: (at[i].x + at[j].x) / 2,
          z: (at[i].z + at[j].z) / 2,
          apart: gap,
        };
      }
    }
  }
  return worst;
}
