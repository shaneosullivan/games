import * as THREE from "three";
import {INSIDE} from "../config";
import {solidToon} from "../render/materials";

const anchor = new THREE.Vector3();
const offset = new THREE.Vector3();
const radial = new THREE.Vector3();

/**
 * The jar of honey, once the bee has hold of it.
 *
 * It hangs on an inextensible rope and is simulated rather than parented:
 * gravity pulls it down, the rope constraint yanks it along behind the bee,
 * and the radial part of its velocity is removed at the constraint so the rope
 * can't stretch or bounce. The result is that it trails when you accelerate,
 * swings through when you stop, and settles under you — which is what selling
 * the weight of it depends on.
 */
export class HoneyJar {
  carried = false;

  /** World-space rope endpoint. */
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  /** The rope, drawn as a thin cylinder between bee and jar. */
  readonly rope: THREE.Mesh;

  constructor(private readonly jar: THREE.Group) {
    this.rope = new THREE.Mesh(
      // Unit-height cylinder with its origin at the top, so it can be scaled
      // and aimed from the anchor without any extra maths.
      new THREE.CylinderGeometry(0.045, 0.045, 1, 6).translate(0, -0.5, 0),
      solidToon(0x6b5335),
    );
    this.rope.visible = false;
  }

  /** Take the jar off the counter. `from` is the bee's belly. */
  pickUp(from: THREE.Vector3): void {
    if (this.carried) {
      return;
    }
    this.carried = true;
    this.position.copy(this.jar.getWorldPosition(new THREE.Vector3()));
    this.velocity.set(0, 0, 0);
    this.rope.visible = true;
    // Start it directly below, so it doesn't snap across the room.
    this.position.copy(from).add(new THREE.Vector3(0, -INSIDE.ropeLength, 0));
  }

  /** @param beeBelly the point the rope hangs from. */
  update(dt: number, beeBelly: THREE.Vector3): void {
    if (!this.carried) {
      return;
    }
    anchor.copy(beeBelly);

    // Free fall, damped.
    this.velocity.y -= INSIDE.jarGravity * dt;
    this.velocity.multiplyScalar(Math.pow(INSIDE.jarDamping, dt));
    this.position.addScaledVector(this.velocity, dt);

    // Rope constraint: pin the jar to the sphere of radius `ropeLength` around
    // the anchor, and drop whatever velocity was pulling along the rope.
    offset.copy(this.position).sub(anchor);
    const distance = offset.length();
    if (distance > 0.0001) {
      radial.copy(offset).divideScalar(distance);
      if (distance > INSIDE.ropeLength) {
        this.position.copy(anchor).addScaledVector(radial, INSIDE.ropeLength);
        this.velocity.addScaledVector(radial, -this.velocity.dot(radial));
      }
    }

    this.jar.position.copy(this.position);
    // Tip the jar to lie along the rope, so it reads as hanging rather than
    // floating upright.
    offset.copy(this.position).sub(anchor).normalize();
    this.jar.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), offset);

    // Stretch the rope between the two.
    this.rope.position.copy(anchor);
    this.rope.scale.set(1, Math.max(0.01, this.position.distanceTo(anchor)), 1);
    this.rope.quaternion.copy(this.jar.quaternion);
  }

  /** Delivered — let go of it and hide the rope. */
  stow(): void {
    this.carried = false;
    this.rope.visible = false;
    this.velocity.set(0, 0, 0);
  }

  /** Put it back on the counter. */
  reset(restPosition: THREE.Vector3): void {
    this.carried = false;
    this.rope.visible = false;
    this.jar.position.copy(restPosition);
    this.jar.quaternion.identity();
    this.velocity.set(0, 0, 0);
  }
}
