import * as THREE from "three";
import {DOME} from "../config";

const tmp = new THREE.Object3D();

/**
 * The glowing line the queen leaves behind her while she dances.
 *
 * She flies the shape of her own route through the cave, and what she draws
 * stays up — a map for the next bee, which is what a real bee's waggle dance
 * is for. A chain of instanced motes rather than a drawn line: a line of one
 * pixel disappears at this camera distance, and motes can brighten and swell
 * along their length without a custom shader.
 *
 * Unlike the maze's scent this is a 3D shape, not something lying on the
 * ground, so it keeps whatever height it is given.
 */
export class DanceTrail {
  readonly mesh: THREE.InstancedMesh;

  private count = 0;
  private readonly spots: Array<THREE.Vector3> = [];
  private readonly last = new THREE.Vector3();

  constructor(capacity = 420) {
    const geo = new THREE.SphereGeometry(DOME.trailSize, 6, 5);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: DOME.trailColor,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        fog: false,
      }),
      capacity,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.reset();
  }

  reset(): void {
    this.count = 0;
    this.spots.length = 0;
    this.last.set(Infinity, Infinity, Infinity);
    // An instance can't be skipped, so the unused ones are scaled to nothing.
    tmp.position.set(0, 0, 0);
    tmp.scale.setScalar(0);
    tmp.updateMatrix();
    for (let i = 0; i < this.mesh.count; i++) {
      this.mesh.setMatrixAt(i, tmp.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Drop a mote here, if she has moved far enough since the last one. */
  mark(point: THREE.Vector3): void {
    if (this.count >= this.mesh.count) {
      return;
    }
    if (point.distanceTo(this.last) < DOME.trailSpacing) {
      return;
    }
    this.last.copy(point);
    this.spots.push(point.clone());
    this.count++;
  }

  /** A slow swell running along the line, so the map looks alive. */
  update(elapsed: number): void {
    for (let i = 0; i < this.count; i++) {
      const wave = Math.sin(elapsed * 2.2 - i * 0.22);
      tmp.position.copy(this.spots[i]);
      tmp.scale.setScalar(0.8 + 0.35 * wave);
      tmp.updateMatrix();
      this.mesh.setMatrixAt(i, tmp.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
