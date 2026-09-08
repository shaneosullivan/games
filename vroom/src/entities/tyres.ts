import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CAR, HEIGHT, Palette, TYRES} from "../config";
import {Rng} from "../core/rng";
import {fadingVertex, LAYER, order, post} from "../render/sprites";
import {NearFade} from "../../../shared/fadeInFront";
import {Car} from "./car";
import {Track} from "./track";

/**
 * Tyre stacks on the verge, and the only scenery in the game you can hit.
 *
 * Everything else outside the road is beyond the barrier and never touched.
 * These are inside it, on the grass, on the outside of corners — which is
 * where a circuit really puts them and, not coincidentally, where a car that
 * has overcooked a corner actually arrives.
 *
 * They do not move and they are not knocked over. A stack that scattered would
 * be a track that changed between laps, and a child who learned a corner by
 * the tyres on it would find them somewhere else the next time round.
 */
export class Tyres {
  readonly group = new THREE.Group();
  /** Dissolves when a stack stands between the camera and the car — which on
   *  the outside of a corner it regularly does. */
  readonly fade: NearFade;

  private readonly xs: Array<number> = [];
  private readonly zs: Array<number> = [];

  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();

  constructor(rng: Rng, track: Track, palette: Palette) {
    const parts: Array<THREE.BufferGeometry> = [];

    for (let c = 0; c < TYRES.clusters; c++) {
      // Spread the clusters round the lap rather than scattering them, so no
      // two land on the same corner and no half of a circuit has none.
      const at = (c + rng.range(0.15, 0.85)) / TYRES.clusters;
      const side = this.outsideOf(track, at);
      const off = rng.range(TYRES.from, TYRES.to);
      const along = TYRES.spacing / track.length;

      for (let k = 0; k < TYRES.perCluster; k++) {
        const t = at + (k - (TYRES.perCluster - 1) / 2) * along;
        track.pointAt(t, this.p);
        track.sideAt(t, this.s);
        const x = this.p.x + this.s.x * off * side;
        const z = this.p.z + this.s.z * off * side;
        this.xs.push(x);
        this.zs.push(z);
        parts.push(...stack(x, z, palette));
      }
    }

    const {material, fade} = fadingVertex("tyres");
    this.fade = fade;
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
    mesh.renderOrder = order(LAYER.car);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /**
   * Which side of the road is the outside of the bend here.
   *
   * From the way the tangent swings between one point and one a little further
   * on: if it turns toward the sideways direction, that side is the inside, so
   * the stacks go on the other one. On a straight the answer is arbitrary and
   * that is fine — a straight has no outside.
   */
  private outsideOf(track: Track, t: number): number {
    track.tangentAt(t, this.p);
    track.tangentAt(t + 0.01, this.ahead);
    track.sideAt(t, this.s);
    const turning = this.ahead.x * this.s.x + this.ahead.z * this.s.z;
    return turning > 0 ? -1 : 1;
  }

  /**
   * Bounces a car off any stack it has run into.
   *
   * The stack wins every time — it does not move and it takes none of the hit
   * — so this is the barrier's arithmetic rather than the car-to-car kind: put
   * the car back on the outside of the circle and reflect the part of its
   * speed that was carrying it in.
   */
  bounce(car: Car): boolean {
    let hit = false;
    for (let i = 0; i < this.xs.length; i++) {
      const dx = car.position.x - this.xs[i];
      const dz = car.position.z - this.zs[i];
      const d = Math.hypot(dx, dz);
      const near = TYRES.radius + CAR_HALF;
      if (d >= near || d < 1e-4) {
        continue;
      }
      const nx = dx / d;
      const nz = dz / d;
      car.position.x = this.xs[i] + nx * near;
      car.position.z = this.zs[i] + nz * near;

      const into = car.velocity.x * nx + car.velocity.y * nz;
      if (into < 0) {
        const kick = -into * (1 + TYRES.bounce);
        car.velocity.x += nx * kick;
        car.velocity.y += nz * kick;
        car.velocity.multiplyScalar(TYRES.keep);
      }
      hit = true;
    }
    return hit;
  }
}

/** How much of the car counts as touching, measured from its middle. Between
 *  its half-width and its half-length, which is what a rectangle approximated
 *  by a circle has to be. */
const CAR_HALF = (CAR.width + CAR.length) / 4;

/**
 * One stack: a squat black cylinder with a bright cap.
 *
 * The cap is not decoration. On the neon city's near-black ground a black
 * stack is a hole, and this is the one piece of scenery in the game a child is
 * expected to see coming.
 */
function stack(
  x: number,
  z: number,
  palette: Palette,
): Array<THREE.BufferGeometry> {
  const body = post(TYRES.radius, HEIGHT.tyreStack, 0, 12, palette.tyre);
  body.translate(x, 0, z);
  const cap = post(
    TYRES.radius * 0.55,
    HEIGHT.tyreStack * 0.16,
    HEIGHT.tyreStack,
    10,
    palette.kerbA,
  );
  cap.translate(x, 0, z);
  return [body, cap];
}
