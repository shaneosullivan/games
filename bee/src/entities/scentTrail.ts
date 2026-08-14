import * as THREE from "three";
import {MAZE, MAZE_PALETTE} from "../config";
import {whiten} from "../render/geometry/maze";

const tmp = new THREE.Vector3();
const colour = new THREE.Color();
const base = new THREE.Color(MAZE_PALETTE.scent);

/**
 * How strongly the trail shows through a hedge.
 *
 * Enough to follow at a glance, little enough that the solid pass in front of
 * it still reads as the nearer one — and that the few motes which pass behind
 * the bee herself don't look painted over her.
 */
const GHOST_OPACITY = 0.3;

/**
 * The scent a flower leaves on the air, showing which way is out.
 *
 * A line of motes rather than a drawn line, because what makes it read as a
 * scent is the pulse travelling along it, and a chain of instances can carry
 * that in per-instance brightness and scale without a custom shader.
 *
 * Motes carry their distance along the route, so the pulse is a wave in that
 * distance: it always runs from the flower toward the exit, whichever way the
 * corridor happens to bend. Several flowers can be eaten, so revealed runs
 * accumulate into the one buffer and stay for good.
 */
export class ScentTrail {
  readonly mesh: THREE.InstancedMesh;
  /**
   * The same motes again, drawn through everything.
   *
   * The trail lies at 1.9 and the hedges stand 5.6, so from anywhere but the
   * corridor you are actually in, the wall hides where it goes — the guide
   * disappears exactly when you are far enough away to need it. (Close up it
   * looks right only because the walls fade near the camera.) This pass has
   * depth testing off so the route always reads, and it is faint enough that
   * where it does cross something solid it is plainly a scent hanging in the
   * air rather than a mistake.
   */
  readonly ghost: THREE.InstancedMesh;

  private count = 0;
  /** Distance along its own run, per mote — what the pulse travels through. */
  private readonly along: Float32Array;
  /** Where each mote sits, kept here so the pulse never reads matrices back. */
  private readonly spots: Array<THREE.Vector3> = [];
  private readonly dummy = new THREE.Object3D();

  constructor(capacity = 900) {
    // Flat white, so the per-instance colour the pulse writes is the only
    // thing deciding how bright a mote is. Without it they render black.
    const geo = whiten(new THREE.SphereGeometry(MAZE.scentSize, 7, 6));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      // It has to be legible from the survey shot, which is much further away
      // than the fog's far distance.
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
    this.mesh.frustumCulled = false;

    const ghostMat = mat.clone();
    ghostMat.opacity = GHOST_OPACITY;
    ghostMat.depthTest = false;
    this.ghost = new THREE.InstancedMesh(geo, ghostMat, capacity);
    // Share the buffers rather than keeping two copies in step: an attribute
    // marked dirty once is uploaded once and both meshes draw from it.
    this.ghost.instanceMatrix = this.mesh.instanceMatrix;
    this.ghost.instanceColor = this.mesh.instanceColor;
    this.ghost.frustumCulled = false;
    // After everything else, so "no depth test" means what it says.
    this.ghost.renderOrder = 10;
    this.along = new Float32Array(capacity);
    this.reset();
  }

  reset(): void {
    this.count = 0;
    this.spots.length = 0;
    this.dummy.position.set(0, -1000, 0);
    this.dummy.scale.setScalar(0.0001);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.mesh.count; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** True once every mote is spoken for and no more runs will show. */
  get full(): boolean {
    return this.count >= this.mesh.count;
  }

  /**
   * Lay a run of scent through `points`, which are corridor centres in order
   * from the flower toward the exit. Motes are spaced evenly along it, so a
   * long straight and a tight zigzag pulse at the same rate.
   */
  reveal(points: ReadonlyArray<THREE.Vector3>): void {
    if (points.length < 2) {
      return;
    }
    let carried = 0;
    let travelled = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const span = from.distanceTo(to);
      if (span < 1e-4) {
        continue;
      }
      // Walk this leg, dropping a mote every `scentSpacing` and carrying the
      // leftover into the next leg so corners don't bunch or gap.
      for (let d = carried; d < span; d += MAZE.scentSpacing) {
        if (this.count >= this.mesh.count) {
          return;
        }
        tmp.lerpVectors(from, to, d / span).setY(MAZE.scentHeight);
        this.spots[this.count] = tmp.clone();
        this.along[this.count] = travelled + d;
        this.count++;
      }
      const used = Math.ceil((span - carried) / MAZE.scentSpacing);
      carried = carried + used * MAZE.scentSpacing - span;
      travelled += span;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Run the pulses along every revealed metre of scent.
   *
   * @param scale multiplier on the motes. The survey shot stands 110 units up,
   *   where a mote this size is about two pixels across — the trail has to be
   *   readable from up there as well as from behind the bee, and growing it
   *   with the camera is cheaper and steadier than a second set of geometry.
   */
  update(elapsed: number, scale = 1): void {
    if (this.count === 0) {
      return;
    }
    const head = elapsed * MAZE.pulseSpeed;
    for (let i = 0; i < this.count; i++) {
      // Where this mote sits in the current pulse, 0 just behind the crest.
      let t = (this.along[i] - head) % MAZE.pulseGap;
      if (t < 0) {
        t += MAZE.pulseGap;
      }
      // A short bright crest with a long tail, so the eye reads a direction.
      const crest = Math.max(0, 1 - t / (MAZE.pulseGap * 0.45));
      const glow = 0.35 + crest * crest * 0.65;
      colour.copy(base).multiplyScalar(glow);
      this.mesh.setColorAt(i, colour);

      this.dummy.position.copy(this.spots[i]);
      this.dummy.scale.setScalar((0.75 + crest * 0.75) * scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
