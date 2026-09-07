import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {SCENERY} from "../config";
import {Rng} from "../core/rng";
import {flatVertex, LAYER, paint, tile} from "../render/sprites";
import {Track} from "./track";

const TAU = Math.PI * 2;

/**
 * Everything outside the barrier: trees, tyre stacks and the crowd.
 *
 * None of it is ever touched — the wall is at the edge of the grass and all of
 * this is beyond it — so there is no collision, no update and no state. It is
 * here to give the circuit somewhere to be, which the pictures in the plan do
 * with trees and spectators and which a bare green field does not do at all.
 *
 * Three merged geometries, three draw calls, for the whole world.
 */
export class Scenery {
  readonly group = new THREE.Group();

  constructor(rng: Rng, track: Track) {
    const trees: Array<THREE.BufferGeometry> = [];
    const tyres: Array<THREE.BufferGeometry> = [];
    const crowd: Array<THREE.BufferGeometry> = [];

    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const limit = Track.limit + 12;

    /**
     * A spot outside the barrier — and outside *every* part of the barrier.
     *
     * Offsetting sideways from a point on the circuit is not enough on its
     * own, because the circuit doubles back on itself: a tree planted safely
     * beyond the wall on one straight can land in the middle of the road on
     * the next one, and the first build of this game had a wood growing across
     * the back straight. So the spot is checked against the whole circuit and
     * thrown away if it is too near any of it.
     */
    const place = (out: THREE.Vector3, band: number): boolean => {
      const t = rng.next();
      track.pointAt(t, p);
      track.sideAt(t, s);
      const side = rng.next() < 0.5 ? -1 : 1;
      const off = side * (limit + rng.range(6, band));
      out.set(p.x + s.x * off, 0, p.z + s.z * off);
      const near = track.nearest(out.x, out.z, 0, 100000);
      return Math.abs(near.offset) > limit;
    };

    const at = new THREE.Vector3();

    for (let i = 0; i < SCENERY.trees; i++) {
      if (!place(at, SCENERY.band)) {
        continue;
      }
      // A tree from above is a blob of leaves with a dot of trunk showing in
      // the middle of it. That is genuinely all you can see of one from up
      // here, and drawing more would be drawing something nobody is looking at.
      const r = rng.range(7, 13);
      const crown = new THREE.CircleGeometry(r, 7);
      crown.rotateX(-Math.PI / 2);
      crown.rotateY(rng.range(0, TAU));
      crown.translate(at.x, LAYER.scenery, at.z);
      trees.push(paint(crown, rng.next() < 0.5 ? 0x2f6b34 : 0x3b7d3c));

      const trunk = new THREE.CircleGeometry(r * 0.22, 6);
      trunk.rotateX(-Math.PI / 2);
      trunk.translate(at.x, LAYER.scenery + 0.01, at.z);
      trees.push(paint(trunk, 0x4a3524));
    }

    for (let i = 0; i < SCENERY.tyres; i++) {
      if (!place(at, 30)) {
        continue;
      }
      const stack = new THREE.CircleGeometry(rng.range(3, 4.5), 8);
      stack.rotateX(-Math.PI / 2);
      stack.translate(at.x, LAYER.scenery, at.z);
      tyres.push(paint(stack, 0x1f1f23));
    }

    // The crowd: little coloured dots in clumps, the way a crowd actually
    // stands. Scattered one at a time they read as confetti.
    const shirts = [0xe0b13c, 0x3f7fd6, 0xd6473c, 0xf2efe6, 0x49b45a];
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < SCENERY.crowd; i++) {
      if (i % 12 === 0) {
        if (!place(at, 26)) {
          continue;
        }
        cx = at.x;
        cz = at.z;
      }
      const dot = tile(2.4, 2.4, rng.pick(shirts));
      dot.translate(
        cx + rng.range(-11, 11),
        LAYER.scenery + 0.02,
        cz + rng.range(-11, 11),
      );
      crowd.push(dot);
    }

    for (const parts of [trees, tyres, crowd]) {
      const mesh = new THREE.Mesh(mergeGeometries(parts, false), flatVertex());
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }
}
