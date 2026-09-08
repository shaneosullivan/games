import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {NEON, Palette, SCENERY} from "../config";
import {Rng} from "../core/rng";
import {instance, neonSign, plant} from "../models";
import type {NeonSign} from "../models/neon";
import {flatVertex, LAYER, order, tile} from "../render/sprites";
import {Track} from "./track";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Everything outside the barrier: the planting, the crowd, and — in the city —
 * the signs.
 *
 * None of it is ever touched, so there is no collision and no state. It is
 * here to give the circuit somewhere to be, which a bare field does not do.
 *
 * The planting is **instanced**: one copy of the geometry and a matrix per
 * tree. That is what allows the trees to be real models with a trunk and three
 * clumps of leaves rather than a disc — four hundred of those drawn one at a
 * time would be four hundred draw calls, and instanced they are two.
 */
export class Scenery {
  readonly group = new THREE.Group();
  /** The signs that flicker. Empty everywhere but the city. */
  readonly signs: Array<NeonSign> = [];

  constructor(rng: Rng, track: Track, palette: Palette) {
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
    const place = (out: THREE.Vector3, band: number, from = 6): boolean => {
      const t = rng.next();
      track.pointAt(t, p);
      track.sideAt(t, s);
      const side = rng.next() < 0.5 ? -1 : 1;
      const off = side * (limit + rng.range(from, band));
      out.set(p.x + s.x * off, 0, p.z + s.z * off);
      const near = track.nearest(out.x, out.z, 0, 100000);
      return Math.abs(near.offset) > limit;
    };

    const at = new THREE.Vector3();
    const spots: Array<{x: number; z: number; turn: number; scale: number}> =
      [];
    for (let i = 0; i < SCENERY.trees; i++) {
      if (!place(at, SCENERY.band)) {
        continue;
      }
      spots.push({
        x: at.x,
        z: at.z,
        turn: rng.range(0, Math.PI * 2),
        scale: rng.range(0.75, 1.35),
      });
    }

    // One plant, drawn everywhere. Its own randomness is spent once, on the
    // shape of the archetype; the variety on screen comes from the turn and
    // the scale of each instance.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const size = new THREE.Vector3();
    for (const mesh of instance(plant(palette, rng), spots.length)) {
      spots.forEach((spot, i) => {
        q.setFromAxisAngle(UP, spot.turn);
        m.compose(pos.set(spot.x, 0, spot.z), q, size.setScalar(spot.scale));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }

    // The crowd: little coloured dots in clumps, the way a crowd actually
    // stands. Scattered one at a time they read as confetti. Still flat, and
    // still the right call — a stand full of modelled people is a thousand
    // draw calls for something nobody looks at.
    const crowd: Array<THREE.BufferGeometry> = [];
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
    if (crowd.length > 0) {
      const dots = new THREE.Mesh(mergeGeometries(crowd, false), flatVertex());
      dots.renderOrder = order(LAYER.scenery);
      dots.frustumCulled = false;
      this.group.add(dots);
    }

    // And the city. Signs are not instanced: each one has its own light, its
    // own fault and its own tubes, and there are few enough of them that a
    // draw call each is the right price for that.
    if (palette.flora === "palm") {
      for (let i = 0; i < NEON.count; i++) {
        if (!place(at, NEON.to, NEON.from)) {
          continue;
        }
        const sign = neonSign(palette, rng);
        sign.group.position.set(at.x, 0, at.z);
        // Turned to face roughly back at the road, which is where anybody
        // reading a sign is.
        sign.group.rotation.y = Math.atan2(-at.x, -at.z) + rng.range(-0.6, 0.6);
        this.group.add(sign.group);
        this.signs.push(sign);
      }
    }
  }

  /** Ticked so the faulty signs stutter. */
  update(time: number): void {
    for (const sign of this.signs) {
      sign.update(time);
    }
  }
}
