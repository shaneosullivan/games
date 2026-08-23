import * as THREE from "three";
import {STREAKS} from "../config";
import {Rng} from "../core/rng";

/**
 * The wind, drawn: short dashes tearing past the camera.
 *
 * There is no physics in here at all, and it is still one of the largest
 * things in the game, because speed is only ever read from things going past
 * and for most of this flight there is nothing near enough to go past — the
 * valley walls are sixty units out and the floor six hundred down. The shot
 * can be perfectly honest about ninety units a second and look becalmed.
 *
 * A few hundred dashes in a box around the squirrel, wrapped round whenever
 * one falls out of it, so the same handful serve the whole valley and there is
 * one draw call for the lot. They lie along the direction of travel and grow
 * with it, which is what makes them read as air rather than as snow.
 */
export class Streaks {
  readonly group = new THREE.Group();

  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly material: THREE.LineBasicMaterial;
  /** Where each dash sits, relative to the middle of the box. */
  private readonly at: Array<THREE.Vector3> = [];
  private readonly centre = new THREE.Vector3();
  private readonly tail = new THREE.Vector3();
  /** Where the box was last frame, so the dashes can be moved by the
   *  difference and left behind rather than carried along. */
  private readonly last = new THREE.Vector3();

  constructor(rng: Rng) {
    for (let i = 0; i < STREAKS.count; i++) {
      this.at.push(
        new THREE.Vector3(
          rng.range(-STREAKS.spread, STREAKS.spread),
          rng.range(-STREAKS.height, STREAKS.height),
          rng.range(-STREAKS.depth, STREAKS.depth),
        ),
      );
    }

    this.positions = new Float32Array(STREAKS.count * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    // Strung around a squirrel that is somewhere else every frame, so a
    // bounding sphere fitted once is a lie and culling on it would blink the
    // whole field out.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.LineBasicMaterial({
      color: STREAKS.colour,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Unfogged: they live within a few dozen units of the lens, and fogging
      // them would only ever grey out the near ones the fog cannot see.
      fog: false,
    });
    this.lines = new THREE.LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  /**
   * `heading` and `gamma` are the squirrel's, so the dashes lie along the way
   * it is actually going rather than along the valley.
   */
  update(
    at: THREE.Vector3,
    heading: number,
    gamma: number,
    speed: number,
  ): void {
    const run = Math.min(
      1,
      Math.max(0, (speed - STREAKS.from) / (STREAKS.full - STREAKS.from)),
    );
    this.material.opacity = run * STREAKS.opacity;
    if (run <= 0) {
      return;
    }

    // The middle of the box sits ahead of the squirrel, because that is where
    // it is going and there is no use putting them behind the lens.
    const flat = Math.cos(gamma);
    this.centre.set(
      at.x - Math.sin(heading) * STREAKS.ahead * flat,
      at.y + Math.sin(gamma) * STREAKS.ahead,
      at.z - Math.cos(heading) * STREAKS.ahead * flat,
    );

    const length = STREAKS.length * run;
    this.tail.set(
      Math.sin(heading) * flat,
      -Math.sin(gamma),
      Math.cos(heading) * flat,
    );
    this.tail.multiplyScalar(length);

    for (let i = 0; i < this.at.length; i++) {
      const p = this.at[i];
      // Wrapped rather than respawned: a dash that leaves the box comes back
      // in the far side, so the field never thins out and never has to be
      // rebuilt.
      p.x = wrap(p.x - (this.centre.x - this.last.x), STREAKS.spread);
      p.y = wrap(p.y - (this.centre.y - this.last.y), STREAKS.height);
      p.z = wrap(p.z - (this.centre.z - this.last.z), STREAKS.depth);

      const o = i * 6;
      const x = this.centre.x + p.x;
      const y = this.centre.y + p.y;
      const z = this.centre.z + p.z;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.positions[o + 3] = x + this.tail.x;
      this.positions[o + 4] = y + this.tail.y;
      this.positions[o + 5] = z + this.tail.z;
    }
    this.last.copy(this.centre);
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

/** Back into [-half, half], however far outside it has drifted. */
function wrap(v: number, half: number): number {
  const span = half * 2;
  return ((((v + half) % span) + span) % span) - half;
}
