import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {LAMP, NEON, Palette, SCENERY} from "../config";
import {Rng} from "../core/rng";
import {settings} from "../core/quality";
import {instance, neonSign, plant} from "../models";
import {lamp, litMaterial} from "../models/city";
import {NearFade} from "../../../shared/fadeInFront";
import type {NeonSign} from "../models/neon";
import {flatVertex, LAYER, order, tile} from "../render/sprites";
import {Glow} from "./glow";
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
  /** Everything that gives off light, and the few real lights that chase it. */
  readonly glow = new Glow();
  /** The skyline, which dissolves when it stands between the camera and the
   *  car — which, close to the road, it occasionally does. */
  readonly fades: Array<NearFade> = [];

  constructor(rng: Rng, track: Track, palette: Palette) {
    // How much of it to build at all. Unlike everything else the quality tier
    // decides, this one cannot change while a race is running — the scenery is
    // built once — so a machine that steps down mid-race gets the lighter
    // world on its next one.
    const share = settings().scenery;
    const some = (n: number): number => Math.max(1, Math.round(n * share));
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
    for (let i = 0; i < some(SCENERY.trees); i++) {
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
    for (let i = 0; i < some(SCENERY.crowd); i++) {
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

    this.group.add(this.glow.group);

    // And the city. Signs are not instanced: each one has its own fault and
    // its own tubes, and there are few enough of them that a draw call each is
    // the right price for that.
    if (palette.flora === "palm") {
      for (let i = 0; i < some(NEON.count); i++) {
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
        sign.emitter.x = at.x;
        sign.emitter.z = at.z;
        this.glow.add(sign.emitter);
      }
      this.streetLights(track, palette);
    }
  }

  /**
   * Lamps down both sides of the road, evenly spaced.
   *
   * Along the circuit rather than scattered, because that is what a street is
   * — an even row of lights is most of what tells you a road is a road at
   * night, and a random one reads as wreckage.
   */
  private streetLights(track: Track, palette: Palette): void {
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const off = Track.limit + LAMP.from;
    const many = Math.max(4, Math.round(track.length / LAMP.every));

    const {solid, bulb} = lamp();
    const posts: Array<{x: number; z: number; turn: number}> = [];
    const bulbs: Array<THREE.BufferGeometry> = [];

    for (let i = 0; i < many; i++) {
      const t = i / many;
      track.pointAt(t, p);
      track.sideAt(t, s);
      const side = i % 2 === 0 ? 1 : -1;
      const x = p.x + s.x * off * side;
      const z = p.z + s.z * off * side;
      // The arm reaches over the road, so the post is turned to face it.
      const turn = Math.atan2(-s.x * side, -s.z * side);
      posts.push({x, z, turn});

      const copy = bulb.clone();
      copy.rotateY(turn);
      copy.translate(x, 0, z);
      bulbs.push(copy);

      this.glow.add({
        x: x - s.x * side * LAMP.reach,
        y: LAMP.height - 4,
        z: z - s.z * side * LAMP.reach,
        colour: LAMP.colour,
        power: LAMP.power,
        reach: LAMP.falls,
      });
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (const mesh of instance(solid, posts.length)) {
      posts.forEach((post, i) => {
        q.setFromAxisAngle(UP, post.turn);
        m.compose(pos.set(post.x, 0, post.z), q, one);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }

    const lit = new THREE.Mesh(mergeGeometries(bulbs, false), litMaterial());
    lit.frustumCulled = false;
    this.group.add(lit);
    void palette;
  }

  /** Ticked so the faulty signs stutter, and so the real lights follow the
   *  car. */
  update(time: number, dt: number, x: number, z: number): void {
    for (const sign of this.signs) {
      sign.update(time);
    }
    this.glow.update(dt, x, z);
  }
}
