import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  INTERIOR,
  INTERIOR_PALETTE as P,
  POLLEN_COLOR,
  POLLEN_KINDS,
  type PollenKind,
} from '../../config';
import type { Rng } from '../../core/rng';
import { paint, solidToon, vertexToon } from '../materials';

export interface PollenStore {
  kind: PollenKind;
  /** Where the bee hovers to load up. */
  position: THREE.Vector3;
  mound: THREE.Mesh;
}

export interface HiveInterior {
  group: THREE.Group;
  /** Centre of the royal dais, where the queen sits. */
  queenPosition: THREE.Vector3;
  /** Perch positions ringing the queen. */
  babyPositions: THREE.Vector3[];
  stores: PollenStore[];
  /** Where the player enters from, so level 2 can place the bee sensibly. */
  entryPosition: THREE.Vector3;
  update(elapsed: number): void;
}

/**
 * The inside of the finished hive: a big waxy dome lined with honeycomb, a
 * royal dais at the centre, perches ringing it for the babies, and three
 * pollen stores set against the wall.
 *
 * Built once and toggled with `.visible` alongside the meadow, rather than
 * added and removed — both environments are small and this keeps level
 * switching instant.
 */
export function createHiveInterior(rng: Rng): HiveInterior {
  const group = new THREE.Group();
  const R = INTERIOR.domeRadius;

  // ---- shell -------------------------------------------------------------
  // Upper hemisphere, rendered from the inside.
  const domeGeo = new THREE.SphereGeometry(R, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = solidToon(P.wax);
  domeMat.side = THREE.BackSide;
  const dome = new THREE.Mesh(domeGeo, domeMat);
  group.add(dome);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 48), solidToon(P.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  group.add(createWallCells(rng));
  group.add(createDais());

  // ---- baby perches ------------------------------------------------------
  const babyPositions: THREE.Vector3[] = [];
  const perchGeo = new THREE.CylinderGeometry(0.85, 1.0, 0.4, 6);
  const perches = new THREE.InstancedMesh(perchGeo, solidToon(P.dais), INTERIOR.babyRingRadius > 0 ? 16 : 0);
  const m = new THREE.Matrix4();
  const babyCount = 6;
  for (let i = 0; i < babyCount; i++) {
    const a = (i / babyCount) * Math.PI * 2 + Math.PI / babyCount;
    const x = Math.cos(a) * INTERIOR.babyRingRadius;
    const z = Math.sin(a) * INTERIOR.babyRingRadius;
    babyPositions.push(new THREE.Vector3(x, INTERIOR.babyHeight, z));

    // A slim column holding each perch up to the babies' height.
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.42, INTERIOR.babyHeight - 0.5, 6),
      solidToon(P.waxDark),
    );
    column.position.set(x, (INTERIOR.babyHeight - 0.5) / 2, z);
    column.castShadow = true;
    group.add(column);

    m.makeTranslation(x, INTERIOR.babyHeight - 0.5, z);
    perches.setMatrixAt(i, m);
  }
  // Park the unused instances out of sight.
  for (let i = babyCount; i < perches.count; i++) {
    m.makeScale(0.0001, 0.0001, 0.0001);
    perches.setMatrixAt(i, m);
  }
  perches.instanceMatrix.needsUpdate = true;
  perches.castShadow = true;
  group.add(perches);

  // ---- pollen stores -----------------------------------------------------
  const stores: PollenStore[] = [];
  POLLEN_KINDS.forEach((kind, i) => {
    const a = (i / POLLEN_KINDS.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * INTERIOR.storeRingRadius;
    const z = Math.sin(a) * INTERIOR.storeRingRadius;

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.15, 1.6, 8), solidToon(P.waxDark));
    pot.position.set(x, 0.8, z);
    pot.castShadow = true;
    pot.receiveShadow = true;
    group.add(pot);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 6, 16), solidToon(P.dais));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 1.6, z);
    group.add(rim);

    const mound = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10), solidToon(POLLEN_COLOR[kind]));
    mound.scale.y = 0.5;
    mound.position.set(x, 1.62, z);
    group.add(mound);

    stores.push({
      kind,
      position: new THREE.Vector3(x, INTERIOR.storeHeight + 1.2, z),
      mound,
    });
  });

  const queenPosition = new THREE.Vector3(0, INTERIOR.queenHeight, 0);
  // The player arrives near the wall behind the queen, facing in.
  const entryPosition = new THREE.Vector3(0, 3.2, INTERIOR.boundsRadius - 3);

  return {
    group,
    queenPosition,
    babyPositions,
    stores,
    entryPosition,
    update(elapsed) {
      // Pollen mounds breathe gently so the stores look alive from across the dome.
      for (let i = 0; i < stores.length; i++) {
        const s = 1 + Math.sin(elapsed * 1.4 + i * 2.1) * 0.04;
        stores[i].mound.scale.set(s, 0.5 * s, s);
      }
    },
  };
}

/**
 * Honeycomb lining the dome wall. Points are spread over the hemisphere with a
 * Fibonacci spiral and each cell is turned to face the centre; per-instance
 * colour decides whether a cell reads as full of honey or empty.
 */
function createWallCells(rng: Rng): THREE.InstancedMesh {
  const cell = new THREE.CylinderGeometry(1.05, 1.05, 0.5, 6);
  // Cylinder's axis is +Y; tip it so the axis points along +Z, which is what
  // lookAt orients.
  cell.rotateX(Math.PI / 2);
  const geo = paint(cell, 0xffffff);
  geo.computeVertexNormals();

  const count = INTERIOR.wallCells;
  const mesh = new THREE.InstancedMesh(geo, vertexToon(), count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

  const R = INTERIOR.domeRadius - 0.3;
  const dummy = new THREE.Object3D();
  const full = new THREE.Color(P.cellFull);
  const empty = new THREE.Color(P.cellEmpty);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    // Upper hemisphere only, biased away from the very apex.
    const t = (i + 0.5) / count;
    const y = 1 - t * 0.94;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden;

    dummy.position.set(Math.cos(a) * r * R, y * R, Math.sin(a) * r * R);
    dummy.lookAt(0, 0, 0);
    const s = 0.85 + rng.next() * 0.35;
    dummy.scale.set(s, s, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, rng.next() < 0.62 ? full : empty);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** The queen's raised hexagonal dais. */
function createDais(): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  const tiers: Array<[number, number, number, number]> = [
    // [radius, height, y, colour]
    [3.4, 0.4, 0.2, P.waxDark],
    [2.7, 0.4, 0.6, P.wax],
    [2.0, 0.5, 1.05, P.dais],
  ];
  for (const [radius, height, y, color] of tiers) {
    const tier = new THREE.CylinderGeometry(radius, radius + 0.18, height, 6);
    tier.translate(0, y, 0);
    parts.push(paint(tier, color));
  }
  // Throne cushion the queen perches on.
  const cushion = new THREE.SphereGeometry(1.25, 16, 10);
  cushion.scale(1, 0.42, 1);
  cushion.translate(0, 1.45, 0);
  parts.push(paint(cushion, 0xd94f7a));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('dais: geometry merge failed');
  merged.computeVertexNormals();
  const dais = new THREE.Mesh(merged, vertexToon());
  dais.castShadow = true;
  dais.receiveShadow = true;
  g.add(dais);

  // Warm light over the throne so the centre of the dome reads as the focus.
  const lamp = new THREE.PointLight(0xffca6b, 55, 26, 2);
  lamp.position.set(0, 7.5, 0);
  g.add(lamp);

  return g;
}
