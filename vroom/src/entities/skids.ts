import * as THREE from "three";
import {Palette, SKID} from "../config";
import {LAYER, order} from "../render/sprites";

/**
 * The marks the road is left covered in.
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
  private readonly size: number;
  /** How much life each mark has left. Zero means the slot is free. */
  private readonly life: Float32Array;
  /** How long that mark's full life is, since they are no longer all the
   *  same: rubber goes in seconds, a trail of oil takes ten. */
  private readonly span: Float32Array;
  /** What colour each one started, so it can fade from its own. */
  private readonly base: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  /** What a spent mark fades to: the road it is lying on. */
  private readonly gone: THREE.Color;
  private static readonly fresh = new THREE.Color();

  constructor(palette: Palette, size: number = SKID.max) {
    this.size = size;
    this.gone = new THREE.Color(palette.tarmac);
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
    this.mesh = new THREE.InstancedMesh(geo, mat, this.size);
    this.mesh.renderOrder = order(LAYER.skid);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.size * 3),
      3,
    );
    this.life = new Float32Array(size);
    this.span = new Float32Array(size);
    this.base = new Float32Array(size * 3);

    // Every slot starts empty, which for an instanced mesh means scaled to
    // nothing: it cannot skip an instance.
    this.scale.setScalar(0);
    for (let i = 0; i < this.size; i++) {
      this.m.compose(this.pos.set(0, 0, 0), this.q.identity(), this.scale);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Lays one mark at a point, lying along the way the tyre is travelling. */
  lay(
    x: number,
    z: number,
    heading: number,
    length: number,
    width: number = SKID.width,
    colour: number = 0x000000,
    life: number = SKID.life,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.size;
    this.life[i] = life;
    this.span[i] = life;
    this.colour.set(colour);
    this.base[i * 3] = this.colour.r;
    this.base[i * 3 + 1] = this.colour.g;
    this.base[i * 3 + 2] = this.colour.b;

    this.pos.set(x, LAYER.skid, z);
    this.e.set(0, heading, 0);
    this.q.setFromEuler(this.e);
    this.scale.set(width, 1, Math.max(width, length));
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
    for (let i = 0; i < this.size; i++) {
      if (this.life[i] <= 0) {
        continue;
      }
      this.life[i] -= dt;
      this.fade(i, Math.max(0, this.life[i] / this.span[i]));
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
    for (let i = 0; i < this.size; i++) {
      this.life[i] = 0;
      this.m.compose(this.pos.set(0, 0, 0), this.q.identity(), this.scale);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = 0;
  }

  private fade(i: number, amount: number): void {
    // Fresh is whatever it was laid in; spent is the tarmac's own colour, so
    // the last frame of a mark's life is indistinguishable from the road under
    // it. Fading towards white instead would leave a pale ghost on grey
    // tarmac, whatever colour it started.
    Skids.fresh.setRGB(
      this.base[i * 3],
      this.base[i * 3 + 1],
      this.base[i * 3 + 2],
    );
    this.colour.copy(this.gone).lerp(Skids.fresh, amount);
    this.mesh.setColorAt(i, this.colour);
  }
}
