import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ENVIRONMENTS, LAMP, NEON, Palette, SCENERY} from "../config";
import {Rng} from "../core/rng";
import {instance, neonSign, plant} from "../models";
import {building, lamp, litMaterial} from "../models/city";
import {fadingGlow} from "../render/materials";
import {NearFade} from "../../../shared/fadeInFront";
import type {NeonSign} from "../models/neon";
import {fadingVertex, flatVertex, LAYER, order, tile} from "../render/sprites";
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

    this.group.add(this.glow.group);

    // And the city. Signs are not instanced: each one has its own fault and
    // its own tubes, and there are few enough of them that a draw call each is
    // the right price for that.
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
        sign.emitter.x = at.x;
        sign.emitter.z = at.z;
        this.glow.add(sign.emitter);
      }
      this.streetLights(track, palette);
      this.city(rng, track, place, at);
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

  /**
   * The skyline: blocks with their lights on, beyond the barrier.
   *
   * Each is its own model rather than one instanced tower, because the whole
   * of a building at night is which of its windows happen to be lit — and two
   * identical towers side by side is the one thing that would give it away.
   */
  private city(
    rng: Rng,
    track: Track,
    place: (out: THREE.Vector3, band: number, from?: number) => boolean,
    at: THREE.Vector3,
  ): void {
    const windows: Array<THREE.BufferGeometry> = [];
    const shells: Array<THREE.BufferGeometry> = [];

    const put = (low: boolean, band: number, from: number): void => {
      if (!place(at, band, from)) {
        return;
      }
      const {
        solid,
        windows: panes,
        height,
      } = building(ENVIRONMENTS.neon, rng, low);
      const turn = rng.range(0, Math.PI * 2);
      // Baked into world space and merged rather than built as its own object.
      // Seventy buildings is seventy draw calls kept apart for no reason — and
      // one mesh is also one material, which is what lets the whole skyline
      // share a single fade.
      for (const part of solid.parts()) {
        part.geometry.rotateY(turn);
        part.geometry.translate(at.x, 0, at.z);
        shells.push(part.geometry);
      }

      if (panes.attributes.position) {
        panes.rotateY(turn);
        panes.translate(at.x, 0, at.z);
        windows.push(panes);
      }

      // Only the near row throws light. A tower three hundred units away
      // lights nothing anybody can see, and every emitter registered is one
      // more for the pool to weigh up every time it looks.
      if (low) {
        this.glow.add({
          x: at.x,
          y: height * 0.55,
          z: at.z,
          colour: 0xffd0a0,
          power: NEON.blockPower,
          reach: NEON.blockFalls,
        });
      }
    };

    // Low-rise along the street, towers set back behind it.
    for (let i = 0; i < NEON.nearBlocks; i++) {
      put(true, NEON.nearTo, NEON.nearFrom);
    }
    for (let i = 0; i < NEON.blocks; i++) {
      put(false, NEON.blockTo, NEON.blockFrom);
    }

    if (shells.length > 0) {
      const {material, fade} = fadingVertex("city");
      const walls = new THREE.Mesh(mergeGeometries(shells, false), material);
      walls.castShadow = true;
      walls.receiveShadow = true;
      walls.frustumCulled = false;
      this.group.add(walls);
      this.fades.push(fade);
    }
    if (windows.length > 0) {
      // The windows dissolve with the walls they are in. Without this a
      // building that got out of the way would leave its lit windows hanging
      // in the air, which is worse than the building was.
      const {material, fade} = fadingGlow(NEON.emissive * 0.75, "cityWindows");
      const lit = new THREE.Mesh(mergeGeometries(windows, false), material);
      lit.frustumCulled = false;
      this.group.add(lit);
      this.fades.push(fade);
    }
    void track;
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
