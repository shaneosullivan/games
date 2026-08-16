import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ANT_HUNT as A, ANT_PALETTE as P} from "../config";
import {paint, vertexToon} from "../render/materials";

/**
 * The net the queen drags under her through the Ant Hunt.
 *
 * A hoop and a bag, hung on a rope and simulated rather than parented — see
 * DanglingLoad, which does the swinging. That swing is the level's skill: the
 * net follows a beat behind, so catching an ant is a matter of leading it
 * rather than flying at it, and a hard turn throws the mouth of the bag wide.
 *
 * What it catches goes inside it and stays visible, so a full net looks full.
 * That matters at the end of an island, when a baby comes and takes it away.
 */
export class BeeNet {
  readonly group = new THREE.Group();
  /** Where the mouth of it is, which is what catches things. */
  readonly mouth = new THREE.Vector3();

  private readonly held: Array<THREE.Object3D> = [];
  private readonly bag: THREE.Mesh;

  constructor() {
    const parts: Array<THREE.BufferGeometry> = [];
    // The hoop.
    const rim = new THREE.TorusGeometry(A.net.radius, 0.12, 6, 20);
    rim.rotateX(Math.PI / 2);
    parts.push(paint(rim, P.netRim));
    // The bag under it: an open cone, which at this size reads as netting
    // without any of the cost of drawing netting.
    const bagGeo = new THREE.CylinderGeometry(
      A.net.radius,
      A.net.radius * 0.45,
      A.net.depth,
      18,
      1,
      true,
    );
    bagGeo.translate(0, -A.net.depth / 2, 0);
    parts.push(paint(bagGeo, P.net));
    const merged = mergeGeometries(parts, false);
    for (const part of parts) {
      part.dispose();
    }
    this.bag = new THREE.Mesh(
      merged ?? new THREE.BufferGeometry(),
      new THREE.MeshToonMaterial({
        vertexColors: true,
        // Both sides: it is an open bag, and the inside of it faces the camera
        // as often as the outside does.
        side: THREE.DoubleSide,
        // See-through, or it is a bowl. Netting is mostly holes, and what
        // sells it at this size is being able to see the grass through the
        // bag and the caught flowers inside it.
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
    );
    this.bag.castShadow = true;
    this.group.add(this.bag);
  }

  /** Drop something in. It stays visible, sitting in the bottom of the bag. */
  hold(item: THREE.Object3D): void {
    this.group.add(item);
    const n = this.held.length;
    // Spiralled around the bottom of the bag so a full net is a heap rather
    // than one thing in the same place six times.
    const angle = n * 2.4;
    const spread = A.net.radius * 0.42 * (n === 0 ? 0 : 1);
    item.position.set(
      Math.cos(angle) * spread,
      -A.net.depth * 0.72 + Math.floor(n / 3) * 0.35,
      Math.sin(angle) * spread,
    );
    item.rotation.set(0, angle, 0);
    item.scale.setScalar(0.9);
    this.held.push(item);
  }

  get count(): number {
    return this.held.length;
  }

  /** Keep the mouth's world position up to date, for the catch test. */
  update(): void {
    this.group.getWorldPosition(this.mouth);
  }

  dispose(): void {
    this.bag.geometry.dispose();
    (this.bag.material as THREE.Material).dispose();
  }
}

/** A rope colour and thickness that suits a net rather than a jar. */
export const NET_ROPE = {colour: P.rope, radius: 0.05} as const;

export function netMaterial(): THREE.Material {
  return vertexToon();
}
