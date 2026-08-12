import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEAR } from '../../config';
import { paint, solidToon, vertexToon } from '../materials';

export interface BearModel {
  group: THREE.Group;
  /**
   * @param elapsed seconds, for the gait
   * @param speed01 0..1 of top speed, drives how hard it lopes
   * @param rear 0..1 up onto its hind legs
   * @param swat 0..1 how hard it is batting at the air
   */
  animate(elapsed: number, speed01: number, rear: number, swat: number): void;
}

const FUR = 0x7a4a2b;
const FUR_DARK = 0x5c3520;
const MUZZLE = 0xc79a6b;

/**
 * A big brown bear, built from the same merged primitives as everything else.
 *
 * It is jointed only where it needs to be: a hip pivot so it can rear up onto
 * its hind legs, and shoulder pivots so it can swat at the bees. Everything
 * else is one static mesh.
 */
export function createBear(): BearModel {
  const group = new THREE.Group();
  group.scale.setScalar(BEAR.scale);

  // Everything above the hips rotates as one when it rears.
  const torso = new THREE.Group();
  torso.position.set(0, 1.35, -0.5);
  group.add(torso);

  const parts: THREE.BufferGeometry[] = [];
  const push = (geo: THREE.BufferGeometry, color: number) => parts.push(paint(geo, color));

  // Barrel body, running along +Z.
  const body = new THREE.SphereGeometry(1.15, 18, 14);
  body.scale(1, 0.92, 1.5);
  body.translate(0, 0, 0.5);
  push(body, FUR);

  const rump = new THREE.SphereGeometry(1.0, 16, 12);
  rump.scale(1, 0.95, 1.1);
  rump.translate(0, -0.05, -0.55);
  push(rump, FUR);

  // Head, low and forward like a bear's.
  const head = new THREE.SphereGeometry(0.72, 16, 12);
  head.scale(1, 0.92, 1.05);
  head.translate(0, 0.35, 1.85);
  push(head, FUR);

  const snout = new THREE.SphereGeometry(0.4, 14, 10);
  snout.scale(0.9, 0.75, 1.1);
  snout.translate(0, 0.12, 2.42);
  push(snout, MUZZLE);

  const nose = new THREE.SphereGeometry(0.16, 10, 8);
  nose.translate(0, 0.22, 2.78);
  push(nose, 0x2a1a10);

  for (const sx of [-1, 1]) {
    // Ears.
    const ear = new THREE.SphereGeometry(0.26, 10, 8);
    ear.scale(1, 1, 0.5);
    ear.translate(sx * 0.44, 0.95, 1.72);
    push(ear, FUR_DARK);

    // Eyes, small and mean.
    const eye = new THREE.SphereGeometry(0.1, 8, 8);
    eye.translate(sx * 0.28, 0.5, 2.32);
    push(eye, 0x1a0f08);
  }

  // Hind legs stay with the torso so they carry it when it rears.
  for (const sx of [-1, 1]) {
    const thigh = new THREE.SphereGeometry(0.46, 12, 10);
    thigh.scale(1, 1.15, 1);
    thigh.translate(sx * 0.72, -0.85, -0.45);
    push(thigh, FUR_DARK);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('bear: geometry merge failed');
  merged.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(merged, vertexToon());
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  // Front legs swing from the shoulders, so they can paddle when it runs and
  // swipe when it rears.
  const arms: THREE.Object3D[] = [];
  const armMat = solidToon(FUR_DARK);
  const armGeo = new THREE.CapsuleGeometry(0.34, 1.0, 4, 10);
  armGeo.translate(0, -0.6, 0);
  const pawGeo = new THREE.SphereGeometry(0.4, 12, 10);
  pawGeo.scale(1, 0.8, 1.15);
  pawGeo.translate(0, -1.2, 0.1);

  for (const sx of [-1, 1]) {
    const arm = new THREE.Object3D();
    arm.position.set(sx * 0.85, 0.15, 1.15);
    const limb = new THREE.Mesh(armGeo, armMat);
    limb.castShadow = true;
    arm.add(limb);
    arm.add(new THREE.Mesh(pawGeo, armMat));
    torso.add(arm);
    arms.push(arm);
  }

  // Back feet stay on the ground when it rears, so they hang off the root.
  const feet: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 10), armMat);
    foot.scale.set(1, 0.7, 1.35);
    foot.position.set(sx * 0.72, 0.42, -1.0);
    foot.castShadow = true;
    group.add(foot);
    feet.push(foot);
  }

  return {
    group,
    animate(elapsed, speed01, rear, swat) {
      // Rearing tips the whole torso back over the hips.
      torso.rotation.x = -rear * 1.15;
      torso.position.y = 1.35 + rear * 0.55;

      const gait = Math.sin(elapsed * (5 + speed01 * 6));
      for (let i = 0; i < arms.length; i++) {
        const dir = i === 0 ? 1 : -1;
        // Loping on all fours, then wild overhead swipes once it's up.
        const lope = gait * dir * (0.5 + speed01 * 0.7) * (1 - rear);
        const swipe = Math.sin(elapsed * 9 + i * 2.1) * 1.5 * swat;
        arms[i].rotation.x = lope + rear * (-1.9 + swipe);
        arms[i].rotation.z = dir * rear * 0.25;
      }
      for (let i = 0; i < feet.length; i++) {
        const dir = i === 0 ? -1 : 1;
        feet[i].position.z = -1.0 + gait * dir * 0.5 * (1 - rear) * (0.3 + speed01);
      }
    },
  };
}
