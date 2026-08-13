import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  INTERIOR,
  INTERIOR_PALETTE as P,
  FOOD,
  POLLEN_COLOR,
  POLLEN_KINDS,
  type PollenKind,
} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, solidToon, vertexToon} from "../materials";

/** One hexagon of the dome's honeycomb that holds food. */
export interface FoodCell {
  kind: PollenKind;
  /** Where the bee hovers to take it: in from the wall along its own normal. */
  position: THREE.Vector3;
  /** The pulsing border around it, hidden while the cell is empty. */
  ring: THREE.Mesh;
  /** Colour the cell for its pollen, or back to empty wax once taken. */
  setFull(full: boolean): void;
}

export interface HiveInterior {
  group: THREE.Group;
  /** Centre of the royal dais, where the queen sits. */
  queenPosition: THREE.Vector3;
  /** Perch positions ringing the queen. */
  babyPositions: Array<THREE.Vector3>;
  /** The hexagons in the larder wall that hold food. */
  foodCells: Array<FoodCell>;
  /** The hexagon the bee is carrying, hidden until she takes one. */
  carried: CarriedHex;
  /** Where the player enters from, so level 2 can place the bee sensibly. */
  entryPosition: THREE.Vector3;
  update(elapsed: number): void;
}

/** The single hexagon that stands in for whichever cell was taken. */
export interface CarriedHex {
  /** Positioned by the rope, so nothing else may write to it. */
  group: THREE.Group;
  /** Recolour it to the food it's standing in for. */
  setKind(kind: PollenKind): void;
  setVisible(visible: boolean): void;
  /** Shrink it away as it arrives at a baby. 1 is full size. */
  setScale(scale: number): void;
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
  const domeGeo = new THREE.SphereGeometry(
    R,
    40,
    24,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const domeMat = solidToon(P.wax);
  domeMat.side = THREE.BackSide;
  const dome = new THREE.Mesh(domeGeo, domeMat);
  group.add(dome);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(R, 48),
    solidToon(P.floor),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const wall = createWallCells(rng);
  group.add(wall.mesh);
  for (const cell of wall.foodCells) {
    group.add(cell.ring);
  }
  group.add(createDais());

  // ---- baby perches ------------------------------------------------------
  const babyPositions: Array<THREE.Vector3> = [];
  const perchGeo = new THREE.CylinderGeometry(0.85, 1.0, 0.4, 6);
  const perches = new THREE.InstancedMesh(
    perchGeo,
    solidToon(P.dais),
    INTERIOR.babyRingRadius > 0 ? 16 : 0,
  );
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

  const carried = createCarriedHex();
  group.add(carried.group);

  const queenPosition = new THREE.Vector3(0, INTERIOR.queenHeight, 0);
  // The player arrives out in the middle of the chamber, facing the queen —
  // well clear of the wall, so nothing is picked up before the player has
  // touched anything.
  const entryPosition = new THREE.Vector3(0, 3.2, 12);

  return {
    group,
    queenPosition,
    babyPositions,
    foodCells: wall.foodCells,
    carried,
    entryPosition,
    update(elapsed) {
      // The borders pulse so a full cell reads as "come and take this" from
      // across the dome. Each is offset by its index, so the wall shimmers
      // rather than blinking all at once.
      for (let i = 0; i < wall.foodCells.length; i++) {
        const cell = wall.foodCells[i];
        if (!cell.ring.visible) {
          continue;
        }
        const pulse =
          1 + Math.sin(elapsed * FOOD.pulseRate + i * 1.7) * FOOD.pulseDepth;
        cell.ring.scale.set(pulse, pulse, 1);
        const mat = cell.ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.45 + (pulse - 1) * 0.9;
      }
    },
  };
}

/**
 * The hexagon the bee carries: one mesh, recoloured for whichever cell was
 * taken, rather than one per cell. Only ever visible while something is being
 * carried or delivered, and positioned by the rope — see DanglingLoad.
 */
function createCarriedHex(): CarriedHex {
  const group = new THREE.Group();
  group.visible = false;

  const material = new THREE.MeshBasicMaterial({color: 0xffffff});
  const hex = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.34, 6),
    material,
  );
  group.add(hex);

  // A faint shell around it, so it stays legible against a pale floor.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.07, 6, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  return {
    group,
    setKind(kind) {
      material.color.set(POLLEN_COLOR[kind]);
    },
    setVisible(visible) {
      group.visible = visible;
    },
    setScale(scale) {
      group.scale.setScalar(Math.max(0.0001, scale));
    },
  };
}

/**
 * Honeycomb lining the dome wall. Points are spread over the hemisphere with a
 * Fibonacci spiral and each cell is turned to face the centre; per-instance
 * colour decides whether a cell reads as full of honey or empty.
 *
 * Some of them hold the brood's food. Those are the same instances as the
 * rest — the wall is the larder — recoloured for the pollen they hold and
 * given a glowing border. Which ones is not left to the spiral: they're chosen
 * to spread around the dome *and* up it, from FOOD.minHeight to maxHeight, so
 * the colour a baby is asking for is as likely to be up under the roof as
 * down by the floor.
 */
function createWallCells(rng: Rng): {
  mesh: THREE.InstancedMesh;
  foodCells: Array<FoodCell>;
} {
  const cell = new THREE.CylinderGeometry(1.05, 1.05, 0.5, 6);
  // Cylinder's axis is +Y; tip it so the axis points along +Z, which is what
  // lookAt orients.
  cell.rotateX(Math.PI / 2);
  const geo = paint(cell, 0xffffff);
  geo.computeVertexNormals();

  const count = INTERIOR.wallCells;
  const mesh = new THREE.InstancedMesh(geo, vertexToon(), count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(count * 3),
    3,
  );

  const R = INTERIOR.domeRadius - 0.3;
  const dummy = new THREE.Object3D();
  const full = new THREE.Color(P.cellFull);
  const empty = new THREE.Color(P.cellEmpty);
  const golden = Math.PI * (3 - Math.sqrt(5));

  /** Cells sitting in the band the bee can actually fly to, by height. */
  const reachable: Array<{index: number; position: THREE.Vector3}> = [];

  for (let i = 0; i < count; i++) {
    // Upper hemisphere only, biased away from the very apex.
    const t = (i + 0.5) / count;
    const y = 1 - t * 0.94;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden;

    const position = new THREE.Vector3(
      Math.cos(a) * r * R,
      y * R,
      Math.sin(a) * r * R,
    );
    dummy.position.copy(position);
    dummy.lookAt(0, 0, 0);
    const s = 0.85 + rng.next() * 0.35;
    dummy.scale.set(s, s, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, rng.next() < 0.62 ? full : empty);

    if (position.y >= FOOD.minHeight && position.y <= FOOD.maxHeight) {
      reachable.push({index: i, position});
    }
  }

  const foodCells = chooseFoodCells(reachable, mesh, empty);

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  return {mesh, foodCells};
}

/**
 * Pick the cells that hold food, and build a border for each.
 *
 * The spiral visits the dome top to bottom, so the reachable cells arrive
 * sorted by height: stepping through them at an even stride takes one from
 * each level in turn, which is what spreads the food up the wall rather than
 * banding it. The golden angle has already scattered them around the dome, so
 * no two consecutive picks end up side by side.
 */
function chooseFoodCells(
  reachable: ReadonlyArray<{index: number; position: THREE.Vector3}>,
  mesh: THREE.InstancedMesh,
  emptyColor: THREE.Color,
): Array<FoodCell> {
  const foodCells: Array<FoodCell> = [];
  if (reachable.length === 0) {
    return foodCells;
  }

  const wanted = Math.min(FOOD.cells, reachable.length);
  const stride = reachable.length / wanted;
  const colors = POLLEN_KINDS.map(k => new THREE.Color(POLLEN_COLOR[k]));

  for (let n = 0; n < wanted; n++) {
    const {index, position} = reachable[Math.floor(n * stride)];
    const kind = POLLEN_KINDS[n % POLLEN_KINDS.length];
    const color = colors[n % POLLEN_KINDS.length];

    // A six-sided torus is a hexagon. Laid on the cell and turned to face the
    // middle of the dome, like the cell it rings, standing a little proud of
    // it so the two don't z-fight.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.13, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        // The far side of the dome is well past HIVE_ENV's fog, and a food
        // cell that fades out is a food cell the player can't plan a trip to.
        fog: false,
      }),
    );
    ring.position.copy(position).multiplyScalar(1 - 0.4 / position.length());
    ring.lookAt(0, 0, 0);
    ring.rotateZ(Math.PI / 6);

    // In from the wall along its own normal: the bee stops short of the comb
    // rather than trying to fly into it.
    const hover = position
      .clone()
      .multiplyScalar(1 - FOOD.hoverOut / position.length());

    foodCells.push({
      kind,
      position: hover,
      ring,
      setFull(isFull) {
        mesh.setColorAt(index, isFull ? color : emptyColor);
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      },
    });
  }

  return foodCells;
}

/** The queen's raised hexagonal dais. */
function createDais(): THREE.Group {
  const g = new THREE.Group();
  const parts: Array<THREE.BufferGeometry> = [];

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
  if (!merged) {
    throw new Error("dais: geometry merge failed");
  }
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
