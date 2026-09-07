import * as THREE from "three";
import {SKID, WORLD} from "../config";
import {LAYER} from "../render/sprites";

/**
 * The marks the game is named after.
 *
 * A fixed pool of little dark rectangles laid on the road under the back
 * wheels whenever the car is going sideways faster than CAR.skidAt. The oldest
 * is overwritten when the pool runs out, so what is on the ground is always
 * the last few seconds of driving — a whole lap of unbroken rubber would be a
 * lap where none of it meant anything.
 *
 * One InstancedMesh, so fourteen hundred marks are one draw call. Its frustum
 * culling is off, because an InstancedMesh is culled against the bounds of its
 * *geometry* — one mark, at the origin — and not against where its instances
 * actually are.
 */
export class Skids {
  readonly mesh: THREE.InstancedMesh;

  private cursor = 0;
  /** How much life each mark has left. Zero means the slot is free. */
  private readonly life: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  /** What a spent mark fades to: the road it is lying on. */
  private readonly gone = new THREE.Color(WORLD.tarmac);
  private static readonly fresh = new THREE.Color(0x000000);

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    // White, and the darkness comes from the per-instance colour instead. A
    // black material would swallow the fade whole: an instance colour
    // *multiplies* the material's, and anything times black is black, so the
    // marks would sit at full strength and then pop out of existence.
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: SKID.darkness,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, SKID.max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(SKID.max * 3),
      3,
    );
    this.life = new Float32Array(SKID.max);

    // Every slot starts empty, which for an instanced mesh means scaled to
    // nothing: it cannot skip an instance.
    this.scale.setScalar(0);
    for (let i = 0; i < SKID.max; i++) {
      this.m.compose(this.pos.set(0, 0, 0), this.q.identity(), this.scale);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Lays one mark at a point, lying along the way the tyre is travelling. */
  lay(x: number, z: number, heading: number, length: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % SKID.max;
    this.life[i] = SKID.life;

    this.pos.set(x, LAYER.skid, z);
    this.e.set(0, heading, 0);
    this.q.setFromEuler(this.e);
    this.scale.set(SKID.width, 1, Math.max(SKID.width, length));
    this.m.compose(this.pos, this.q, this.scale);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade(i, 1);
  }

  /**
   * Ages them.
   *
   * The fade is done with the per-instance colour rather than per-instance
   * opacity, because there is no such thing: a material has one opacity for
   * every instance it draws. A black mark going white is a mark disappearing
   * against grey tarmac, which is near enough to fading and costs nothing.
   */
  update(dt: number): void {
    let touched = false;
    for (let i = 0; i < SKID.max; i++) {
      if (this.life[i] <= 0) {
        continue;
      }
      this.life[i] -= dt;
      this.fade(i, Math.max(0, this.life[i] / SKID.life));
      touched = true;
      if (this.life[i] <= 0) {
        this.scale.setScalar(0);
        this.m.compose(this.pos.set(0, 0, 0), this.q.identity(), this.scale);
        this.mesh.setMatrixAt(i, this.m);
        this.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (touched && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Wipes the lot, for a fresh lap. */
  clear(): void {
    this.scale.setScalar(0);
    for (let i = 0; i < SKID.max; i++) {
      this.life[i] = 0;
      this.m.compose(this.pos.set(0, 0, 0), this.q.identity(), this.scale);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = 0;
  }

  private fade(i: number, amount: number): void {
    // Fresh is black; spent is the tarmac's own colour, so the last frame of a
    // mark's life is indistinguishable from the road under it. Fading towards
    // white instead would leave a pale ghost on grey tarmac.
    this.colour.copy(this.gone).lerp(Skids.fresh, amount);
    this.mesh.setColorAt(i, this.colour);
  }
}
