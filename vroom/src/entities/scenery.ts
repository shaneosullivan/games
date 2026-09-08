import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {HEIGHT, Palette, SCENERY} from "../config";
import {Rng} from "../core/rng";
import {
  fadingVertex,
  flatVertex,
  LAYER,
  order,
  paint,
  post,
  tile,
} from "../render/sprites";
import {NearFade} from "../../../shared/fadeInFront";
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
  /** The trees and stacks dissolve when they stand in front of the car. */
  readonly fades: Array<NearFade> = [];

  constructor(rng: Rng, track: Track, palette: Palette) {
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
      // A trunk with a crown on it. Short ones: seen from a low diagonal, a
      // tree the height of a real one is a green wall across whatever corner
      // happens to be behind it.
      const r = rng.range(7, 13);
      const height = rng.range(HEIGHT.crown * 0.7, HEIGHT.crown);
      const trunk = post(r * 0.2, HEIGHT.trunk, 0, 6, palette.trunk);
      trunk.translate(at.x, 0, at.z);
      trees.push(trunk);

      const crown = new THREE.SphereGeometry(r, 7, 5);
      crown.scale(1, 0.8, 1);
      crown.rotateY(rng.range(0, TAU));
      crown.translate(at.x, HEIGHT.trunk + height * 0.3, at.z);
      trees.push(
        paint(crown, rng.next() < 0.5 ? palette.treeA : palette.treeB),
      );
    }

    for (let i = 0; i < SCENERY.tyres; i++) {
      if (!place(at, 30)) {
        continue;
      }
      const stack = post(
        rng.range(3, 4.5),
        HEIGHT.tyreStack * 0.7,
        0,
        8,
        palette.tyre,
      );
      stack.translate(at.x, 0, at.z);
      tyres.push(stack);
    }

    // The crowd: little coloured dots in clumps, the way a crowd actually
    // stands. Scattered one at a time they read as confetti.
    const shirts = palette.crowd;
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

    // The trees and the stacks stand up; the crowd is dots on the ground.
    for (const [i, parts] of [trees, tyres].entries()) {
      const {material, fade} = fadingVertex(`scenery${i}`);
      const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
      mesh.renderOrder = order(LAYER.car);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.fades.push(fade);
    }
    const dots = new THREE.Mesh(mergeGeometries(crowd, false), flatVertex());
    dots.renderOrder = order(LAYER.scenery);
    dots.frustumCulled = false;
    this.group.add(dots);
  }
}
