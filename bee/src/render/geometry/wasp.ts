import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WASP } from '../../config';
import { paint, solidToon, vertexToon } from '../materials';

export interface WaspModel {
  group: THREE.Group;
  /** `speed01` is 0..1 of top speed; `menace` 0..1 sharpens the pose. */
  animate(elapsed: number, speed01: number, menace: number): void;
}

const BLACK = 0x1c1710;
const ACID = 0xf2e14c;

/**
 * The wasp. Same primitive-merging approach as the bee, but every shape is
 * angular where the bee's is round: a pinched waist, a pointed abdomen, swept
 * wings and red eyes. It reads as "not one of us" at a glance, which matters
 * when it's a speck across the meadow.
 */
export function createWasp(): WaspModel {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4) => {
    geo.applyMatrix4(m);
    parts.push(paint(geo, color));
  };
  const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    );

  // Thorax — boxier than the bee's.
  add(new THREE.SphereGeometry(0.32, 14, 10), BLACK, at(0, 0, 0.05, 1, 0.82, 1.15));
  add(new THREE.SphereGeometry(0.3, 12, 8), ACID, at(0, 0.02, -0.16, 0.92, 0.72, 0.5));

  // The wasp waist: a thin stalk, the silhouette's signature.
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 8), BLACK, at(0, -0.02, -0.42).multiply(
    new THREE.Matrix4().makeRotationX(Math.PI / 2),
  ));

  // Abdomen — a tapered teardrop with hard stripes.
  add(new THREE.SphereGeometry(0.3, 14, 10), ACID, at(0, -0.03, -0.74, 0.92, 0.86, 1.25));
  add(new THREE.SphereGeometry(0.22, 12, 8), ACID, at(0, -0.05, -1.08, 0.9, 0.84, 1.2));
  for (const [z, r] of [
    [-0.56, 0.295],
    [-0.83, 0.275],
    [-1.06, 0.205],
  ] as const) {
    add(new THREE.TorusGeometry(r, 0.075, 6, 16), BLACK, at(0, -0.03, z, 1, 0.88, 1));
  }
  // A long, obvious sting.
  add(new THREE.ConeGeometry(0.065, 0.34, 8), BLACK, at(0, -0.07, -1.42).multiply(
    new THREE.Matrix4().makeRotationX(-Math.PI / 2),
  ));

  // Head: wider than it is tall, with big red eyes.
  add(new THREE.SphereGeometry(0.26, 14, 10), BLACK, at(0, 0.02, 0.44, 1.15, 0.85, 0.85));
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.115, 10, 8), 0xd4322a, at(sx * 0.16, 0.05, 0.58, 1, 1.2, 0.85));
    add(new THREE.SphereGeometry(0.05, 8, 6), 0x3a0f0c, at(sx * 0.18, 0.05, 0.65, 1, 1.1, 0.8));

    // Antennae swept back, not curious like the bee's.
    const ant = new THREE.CylinderGeometry(0.016, 0.016, 0.36, 6);
    const m = new THREE.Matrix4()
      .makeTranslation(sx * 0.1, 0.2, 0.5)
      .multiply(new THREE.Matrix4().makeRotationZ(sx * 0.55))
      .multiply(new THREE.Matrix4().makeRotationX(0.7));
    add(ant, BLACK, m);

    // Mandibles.
    add(
      new THREE.ConeGeometry(0.045, 0.16, 6),
      0x4a3a1c,
      at(sx * 0.09, -0.09, 0.62).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)),
    );
  }

  const bodyGeo = mergeGeometries(parts, false);
  if (!bodyGeo) throw new Error('wasp: geometry merge failed');
  bodyGeo.computeVertexNormals();

  const group = new THREE.Group();
  group.scale.setScalar(WASP.scale);

  const body = new THREE.Mesh(bodyGeo, vertexToon());
  body.castShadow = true;
  group.add(body);

  // Wings: longer and swept, tinted smoky rather than the bee's bright white.
  const wingMat = solidToon(0xcfc9bd);
  wingMat.transparent = true;
  wingMat.opacity = 0.45;
  wingMat.side = THREE.DoubleSide;
  wingMat.depthWrite = false;

  const wingGeo = new THREE.CircleGeometry(0.68, 14);
  wingGeo.scale(1, 0.32, 1);
  wingGeo.translate(0.68, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.rotateY(0.28); // sweep

  const wings: THREE.Object3D[] = [];
  const wingSigns: number[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(sx * 0.1, 0.2, -0.02);
    // The mirror sign lives in scale.x — never overwrite it with setScalar.
    pivot.scale.set(sx, 1, 1);
    pivot.add(new THREE.Mesh(wingGeo, wingMat));
    group.add(pivot);
    wings.push(pivot);
    wingSigns.push(sx);
  }

  return {
    group,
    animate(elapsed, speed01, menace) {
      const flap = Math.sin(elapsed * Math.PI * 2 * 26);
      const spread = 0.3 + speed01 * 0.4;
      for (let i = 0; i < wings.length; i++) {
        wings[i].rotation.z = wingSigns[i] * (0.1 + flap * spread);
        wings[i].rotation.y = wingSigns[i] * flap * 0.1;
      }
      // Hunches forward as it commits to a chase.
      body.rotation.x = 0.1 + speed01 * 0.16 + menace * 0.22;
    },
  };
}
