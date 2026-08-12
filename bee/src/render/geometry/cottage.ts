import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COTTAGE, DANCE } from '../../config';
import type { Rng } from '../../core/rng';
import { paint, solidToon, vertexToon } from '../materials';

export interface CottageScene {
  group: THREE.Group;
  /** Centre of the mat, on the ground. */
  matCentre: THREE.Vector3;
  /** The nine pads, index 4 being the centre. */
  pads: THREE.Mesh[];
  /** World centres of each pad. */
  padCentres: THREE.Vector3[];
  /** Swing the door open once the dance is passed. */
  setDoorOpen(open: boolean): void;
  /** Where the bee flies to once the door is open. */
  doorway: THREE.Vector3;
  update(elapsed: number): void;
}

const GINGER = 0xe3a969;
const GINGER_DARK = 0xc08247;
const ICING = 0xfff6e8;

/**
 * Caramel Cottage: a gingerbread house with an iced roof, sweets pressed into
 * the walls, and a dance mat laid out in front of the door.
 *
 * The house faces +Z, so the mat sits at +Z of it and the bee approaches from
 * further out still.
 */
export function createCottage(rng: Rng): CottageScene {
  const group = new THREE.Group();

  // ---- clearing ----------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), solidToon(0x8ecb6d));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // A worn path from the mat to the door.
  const path = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), solidToon(0xd8bb84));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, COTTAGE.matOffsetZ);
  path.scale.set(1.1, 1.25, 1);
  group.add(path);

  group.add(createHedge(rng));

  // ---- the house, at house scale -----------------------------------------
  //
  // The house is modelled at a convenient size and then scaled up bodily. A
  // bee is about 1.5 units long, so a cottage has to be tens of units tall to
  // read as a building rather than a doll's house — everything below is
  // authored in "house units" and multiplied by COTTAGE.houseScale.
  const house = new THREE.Group();
  house.scale.setScalar(COTTAGE.houseScale);
  house.add(createHouse());

  const doorPivot = new THREE.Object3D();
  // Hinge on the left edge of the doorway.
  doorPivot.position.set(-0.95, 0, 2.02);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.7, 0.16), solidToon(0x7b4a22));
  // Stand proud of the doorway recess (front face at z = 2.1) — flush with it
  // and the two faces z-fight into a checkerboard.
  door.position.set(0.95, 1.35, 0.16);
  door.castShadow = true;
  doorPivot.add(door);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), solidToon(0xffd75e));
  knob.position.set(1.68, 1.35, 0.12);
  doorPivot.add(knob);

  // Icing trim around the doorway.
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.1, 6, 20, Math.PI),
    solidToon(ICING),
  );
  frame.position.set(0.95, 2.72, 0.02);
  doorPivot.add(frame);

  house.add(doorPivot);
  group.add(house);

  // ---- dance mat ---------------------------------------------------------
  const matCentre = new THREE.Vector3(0, 0, COTTAGE.matOffsetZ);
  const { mat, pads, padCentres } = createMat(matCentre);
  group.add(mat);

  let doorOpen = false;

  return {
    group,
    matCentre,
    pads,
    padCentres,
    // Doorway centre in world units: (0, 1.35, 2.02) at house scale.
    doorway: new THREE.Vector3(0, 1.35, 2.0).multiplyScalar(COTTAGE.houseScale),
    setDoorOpen(open) {
      doorOpen = open;
    },
    update(elapsed) {
      // Swing the door open, and let it settle with a little overshoot.
      const target = doorOpen ? -1.9 : 0;
      doorPivot.rotation.y += (target - doorPivot.rotation.y) * 0.06;
      if (doorOpen) doorPivot.rotation.y += Math.sin(elapsed * 3) * 0.004;
    },
  };
}

/** The gingerbread house itself. */
function createHouse(): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const push = (geo: THREE.BufferGeometry, color: number) => parts.push(paint(geo, color));

  // Walls
  const walls = new THREE.BoxGeometry(7.2, 4.4, 6.2);
  walls.translate(0, 2.2, -1);
  push(walls, GINGER);

  // Roof: a slab up each side meeting at a ridge.
  //
  // Eaves at (±3.9, 4.3), apex at (0, 6.6). Each slab is the line between
  // them: 4.5 long, tilted 0.533 rad. The +X end of a right-hand slab is the
  // low end, so it rotates *down* — get that sign wrong and the two slabs
  // cross over the roof instead of meeting on it.
  const PITCH = 0.533;
  for (const sx of [-1, 1]) {
    const slab = new THREE.BoxGeometry(4.9, 0.34, 7.1);
    slab.rotateZ(-sx * PITCH);
    slab.translate(sx * 1.95, 5.45, -1);
    push(slab, ICING);
  }
  const ridge = new THREE.BoxGeometry(0.46, 0.34, 7.2);
  ridge.translate(0, 6.62, -1);
  push(ridge, ICING);

  // Gable ends: proper triangles filling between the wall top and the roof.
  const tri = new THREE.Shape();
  tri.moveTo(-3.6, 0);
  tri.lineTo(3.6, 0);
  tri.lineTo(0, 2.16);
  tri.closePath();
  for (const z of [2.09, -4.39]) {
    const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
    gable.translate(0, 4.4, z);
    push(gable, GINGER_DARK);
  }

  // Windows with icing frames.
  for (const sx of [-1, 1]) {
    const pane = new THREE.BoxGeometry(1.3, 1.3, 0.12);
    pane.translate(sx * 2.3, 2.6, 2.06);
    push(pane, 0xffe9a8);
    const sill = new THREE.BoxGeometry(1.6, 0.16, 0.2);
    sill.translate(sx * 2.3, 1.88, 2.1);
    push(sill, ICING);
  }

  // Doorway recess, so the door reads as set into the wall.
  const recess = new THREE.BoxGeometry(2.1, 2.8, 0.2);
  recess.translate(0, 1.4, 2.0);
  push(recess, 0x3a2412);

  // Chimney.
  const chimney = new THREE.BoxGeometry(0.9, 1.8, 0.9);
  chimney.translate(-2.0, 6.4, -2.2);
  push(chimney, GINGER_DARK);

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('cottage: geometry merge failed');
  merged.computeVertexNormals();
  const house = new THREE.Mesh(merged, vertexToon());
  house.castShadow = true;
  house.receiveShadow = true;
  g.add(house);

  // Gumdrops pressed into the front wall — instanced, one draw call.
  const sweetGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const sweets = new THREE.InstancedMesh(paint(sweetGeo, 0xffffff), vertexToon(), 18);
  sweets.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18 * 3), 3);
  const colours = [0xff5b8a, 0x5ecfff, 0x9be36b, 0xffd75e, 0xc98bff];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    // A line of sweets along the eaves, and a couple beside the door.
    const x = -3.2 + (i % 9) * 0.8;
    const y = i < 9 ? 4.5 : 3.2;
    const z = 2.08;
    m.makeTranslation(x, y + (i < 9 ? 0 : 0), z);
    sweets.setMatrixAt(i, m);
    sweets.setColorAt(i, c.set(colours[i % colours.length]).convertSRGBToLinear());
    void t;
  }
  sweets.instanceMatrix.needsUpdate = true;
  if (sweets.instanceColor) sweets.instanceColor.needsUpdate = true;
  g.add(sweets);

  return g;
}

/** A ring of bushes so the clearing reads as enclosed. */
function createHedge(rng: Rng): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const bushes = new THREE.InstancedMesh(geo, solidToon(0x4e8f47), 90);
  bushes.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < bushes.count; i++) {
    const a = (i / bushes.count) * Math.PI * 2 + rng.range(-0.03, 0.03);
    const r = COTTAGE.boundsRadius + rng.range(1.5, 5);
    const s = rng.range(1.8, 3.4);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, s * 0.35, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 1), rng.range(0, 6.28), 0)),
      new THREE.Vector3(s, s * 0.8, s),
    );
    bushes.setMatrixAt(i, m);
  }
  bushes.instanceMatrix.needsUpdate = true;
  return bushes;
}

/**
 * The 3x3 mat. Index 0..8 reading left-to-right, back-to-front; 4 is the
 * centre the bee hovers over. Each pad is its own mesh so it can light up
 * individually.
 */
function createMat(centre: THREE.Vector3): {
  mat: THREE.Group;
  pads: THREE.Mesh[];
  padCentres: THREE.Vector3[];
} {
  const mat = new THREE.Group();
  mat.position.copy(centre);

  const step = DANCE.padSize + DANCE.padGap;

  // Backing board under the pads.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(step * 3 + 0.5, 0.08, step * 3 + 0.5),
    solidToon(0x2f2a3a),
  );
  board.position.y = 0.04;
  board.receiveShadow = true;
  mat.add(board);

  const pads: THREE.Mesh[] = [];
  const padCentres: THREE.Vector3[] = [];
  const padGeo = new THREE.BoxGeometry(DANCE.padSize, DANCE.padHeight, DANCE.padSize);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      const isCentre = i === 4;
      const pad = new THREE.Mesh(
        padGeo,
        solidToon(isCentre ? 0xffd75e : 0x6f6890),
      );
      pad.position.set((col - 1) * step, 0.1, (row - 1) * step);
      pad.receiveShadow = true;
      mat.add(pad);
      pads.push(pad);
      padCentres.push(new THREE.Vector3().copy(centre).add(pad.position));

      // Arrow decal on the eight outer pads, pointing away from the centre.
      if (!isCentre) {
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.34, 0.5, 3),
          solidToon(0xd6d2e8),
        );
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = -Math.atan2(col - 1, -(row - 1));
        arrow.position.set(pad.position.x, 0.17, pad.position.z);
        mat.add(arrow);
      }
    }
  }

  return { mat, pads, padCentres };
}
