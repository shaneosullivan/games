import * as THREE from "three";
import {solidToon} from "../render/materials";

const anchor = new THREE.Vector3();
const offset = new THREE.Vector3();
const radial = new THREE.Vector3();

/** How the load hangs and swings. Each caller's numbers live in config.ts. */
export interface LoadSettings {
  /** Distance from the bee's belly to the load. */
  ropeLength: number;
  /** Higher swings faster and settles harder. */
  gravity: number;
  /** Per-second velocity retained; below 1 the swing dies down. */
  damping: number;
  ropeColor?: number;
  ropeRadius?: number;
}

/**
 * Something the bee carries on a rope: the cottage's jar of honey, and the
 * hexagon of food in the royal chamber.
 *
 * It is simulated rather than parented: gravity pulls it down, the rope
 * constraint yanks it along behind the bee, and the radial part of its
 * velocity is removed at the constraint so the rope can't stretch or bounce.
 * The result is that it trails when you accelerate, swings through when you
 * stop, and settles under you — which is what selling the weight of it depends
 * on, and it is just as much the point for a crumb of pollen as for a jar.
 */
export class DanglingLoad {
  carried = false;

  /** World-space rope endpoint. */
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  /** The rope, drawn as a thin cylinder between bee and load. */
  readonly rope: THREE.Mesh;

  constructor(
    private readonly load: THREE.Object3D,
    private readonly settings: LoadSettings,
  ) {
    this.rope = new THREE.Mesh(
      // Unit-height cylinder with its origin at the top, so it can be scaled
      // and aimed from the anchor without any extra maths.
      new THREE.CylinderGeometry(
        settings.ropeRadius ?? 0.045,
        settings.ropeRadius ?? 0.045,
        1,
        6,
      ).translate(0, -0.5, 0),
      solidToon(settings.ropeColor ?? 0x6b5335),
    );
    this.rope.visible = false;
  }

  /** Where the load is right now, for anything that has to fly it onward. */
  get worldPosition(): THREE.Vector3 {
    return this.position;
  }

  /** Take it. `from` is the bee's belly. */
  pickUp(from: THREE.Vector3): void {
    if (this.carried) {
      return;
    }
    this.carried = true;
    this.velocity.set(0, 0, 0);
    this.rope.visible = true;
    // Start it directly below, so it doesn't snap across the room.
    this.position
      .copy(from)
      .add(new THREE.Vector3(0, -this.settings.ropeLength, 0));
  }

  /** @param beeBelly the point the rope hangs from. */
  update(dt: number, beeBelly: THREE.Vector3): void {
    if (!this.carried) {
      return;
    }
    anchor.copy(beeBelly);

    // Free fall, damped.
    this.velocity.y -= this.settings.gravity * dt;
    this.velocity.multiplyScalar(Math.pow(this.settings.damping, dt));
    this.position.addScaledVector(this.velocity, dt);

    // Rope constraint: pin the load to the sphere of radius `ropeLength` around
    // the anchor, and drop whatever velocity was pulling along the rope.
    offset.copy(this.position).sub(anchor);
    const distance = offset.length();
    if (distance > 0.0001) {
      radial.copy(offset).divideScalar(distance);
      if (distance > this.settings.ropeLength) {
        this.position
          .copy(anchor)
          .addScaledVector(radial, this.settings.ropeLength);
        this.velocity.addScaledVector(radial, -this.velocity.dot(radial));
      }
    }

    this.load.position.copy(this.position);
    // Tip it to lie along the rope, so it reads as hanging rather than
    // floating upright.
    offset.copy(this.position).sub(anchor).normalize();
    this.load.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      offset,
    );

    // Stretch the rope between the two.
    this.rope.position.copy(anchor);
    this.rope.scale.set(1, Math.max(0.01, this.position.distanceTo(anchor)), 1);
    this.rope.quaternion.copy(this.load.quaternion);
  }

  /** Let go of it and hide the rope. Whatever happens to the load next is the
   *  caller's business — delivered, stowed or put back. */
  stow(): void {
    this.carried = false;
    this.rope.visible = false;
    this.velocity.set(0, 0, 0);
  }

  /** Put it back where it started. */
  reset(restPosition: THREE.Vector3): void {
    this.carried = false;
    this.rope.visible = false;
    this.load.position.copy(restPosition);
    this.load.quaternion.identity();
    this.velocity.set(0, 0, 0);
  }
}
