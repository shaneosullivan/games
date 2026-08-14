import * as THREE from "three";
import {MAZE, MAZE_PALETTE} from "../config";

const tmp = new THREE.Vector3();

/**
 * The pollen the bee drops behind her in the maze, so a corridor she has
 * already been down looks different from one she hasn't.
 *
 * A ring buffer of instances rather than a growing list: the oldest crumb is
 * reused once the buffer is full, which caps the cost and, with a big enough
 * buffer, is never reached on a maze this size. Crumbs are dropped by distance
 * travelled and not by time, or hovering in one spot would pile them up.
 */
export class PollenTrail {
  readonly mesh: THREE.InstancedMesh;

  private cursor = 0;
  private live = 0;
  private readonly last = new THREE.Vector3();
  private started = false;
  private readonly dummy = new THREE.Object3D();

  constructor() {
    const geo = new THREE.SphereGeometry(MAZE.crumbSize, 6, 5);
    const mat = new THREE.MeshBasicMaterial({color: MAZE_PALETTE.crumb});
    this.mesh = new THREE.InstancedMesh(geo, mat, MAZE.crumbCount);
    this.mesh.frustumCulled = false;
    this.reset();
  }

  /** Wipe the trail. Instances are parked at zero scale, not deleted. */
  reset(): void {
    this.cursor = 0;
    this.live = 0;
    this.started = false;
    this.dummy.position.set(0, -1000, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0.0001);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.mesh.count; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Leave a crumb if she's moved far enough since the last one.
   *
   * @param at the bee, now
   */
  update(at: THREE.Vector3): void {
    if (!this.started) {
      this.started = true;
      this.last.copy(at);
      this.drop(at);
      return;
    }
    if (this.last.distanceToSquared(at) < MAZE.crumbSpacing ** 2) {
      return;
    }
    this.last.copy(at);
    this.drop(at);
  }

  private drop(at: THREE.Vector3): void {
    // Just under her, so the trail reads as lying on the corridor rather than
    // hanging in the air at flight height.
    tmp.copy(at).setY(Math.max(0.2, at.y - 0.9));
    this.dummy.position.copy(tmp);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = (this.cursor + 1) % this.mesh.count;
    this.live = Math.min(this.live + 1, this.mesh.count);
  }
}
