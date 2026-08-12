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
  /** Swing the gate to the meadow. Shut until the cottage is unlocked. */
  setGateOpen(open: boolean): void;
  /** Where the bee flies to once the door is open. */
  doorway: THREE.Vector3;
  /** The gap in the fence, and the way home to the meadow. */
  gate: THREE.Vector3;
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
  // The clearing stands at the north end of the meadow's world rather than in
  // a scene of its own, so the flight home is one continuous flight. Everything
  // below is authored around a local origin at the house and shifted bodily;
  // the vectors handed back are converted to world space at the end.
  group.position.z = COTTAGE.yardOffsetZ;

  // ---- clearing ----------------------------------------------------------
  // Mown grass, a shade lighter than the meadow's, laid just above it. It has
  // to stay inside the meadow's ground disc or it hangs over the edge of the
  // world.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(COTTAGE.clearingRadius, 48),
    solidToon(0x8ecb6d),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // A worn path from the mat to the door.
  const path = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), solidToon(0xd8bb84));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, COTTAGE.matOffsetZ);
  path.scale.set(1.1, 1.25, 1);
  group.add(path);

  group.add(createHedge(rng));
  const fence = createFence();
  group.add(fence.group);

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
  // Clear of the recess's front face (z = 2.12) for the same reason — the door
  // used to end exactly on it.
  door.position.set(0.95, 1.35, 0.26);
  door.castShadow = true;
  doorPivot.add(door);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), solidToon(0xffd75e));
  // Proud of the door's own front face, which is at z = 0.34 in this frame.
  knob.position.set(1.68, 1.35, 0.42);
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

  // Everything the level steers by is handed back in world space, so callers
  // never have to know the clearing is parked away from the origin.
  const toWorld = (v: THREE.Vector3) => v.clone().add(group.position);

  return {
    group,
    matCentre: toWorld(matCentre),
    pads,
    padCentres: padCentres.map(toWorld),
    // Doorway centre in world units: (0, 1.35, 2.02) at house scale.
    doorway: toWorld(new THREE.Vector3(0, 1.35, 2.0).multiplyScalar(COTTAGE.houseScale)),
    gate: toWorld(new THREE.Vector3(0, 3, COTTAGE.boundsRadius)),
    setDoorOpen(open) {
      doorOpen = open;
    },
    setGateOpen(open) {
      fence.setOpen(open);
    },
    update(elapsed) {
      // Swing the door open, and let it settle with a little overshoot.
      const target = doorOpen ? -1.9 : 0;
      doorPivot.rotation.y += (target - doorPivot.rotation.y) * 0.06;
      if (doorOpen) doorPivot.rotation.y += Math.sin(elapsed * 3) * 0.004;
      fence.update();
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
  //
  // Its front face must not land *on* the wall's, which is at z = 2.1: two
  // coplanar faces z-fight, and at this scale that shows up as brown lines
  // flickering across the doorway. Sitting a hair proud of the wall reads the
  // same and is unambiguous about which is in front.
  const recess = new THREE.BoxGeometry(2.1, 2.8, 0.2);
  recess.translate(0, 1.4, 2.02);
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

/** Signed difference between two angles, in (-PI, PI]. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * A picket fence across the gap in the hedge, with a gate in the middle.
 *
 * It's the signpost for the whole of stage 3: the way home is through there,
 * and from over the mat you can see the hive glowing beyond it. It's shut until
 * Caramel Cottage is unlocked, though — there's nothing up the lane before
 * then, and a gate is a kinder way to say so than an invisible wall.
 */
function createFence(): { group: THREE.Group; setOpen(open: boolean): void; update(): void } {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const push = (geo: THREE.BufferGeometry, color: number) => parts.push(paint(geo, color));

  const WOOD = 0xdcc39a;
  const WOOD_DARK = 0xb69466;
  const z = COTTAGE.boundsRadius;
  const half = COTTAGE.gateHalfWidth;
  // The hedge gap is an arc; the fence is a straight run filling it either side
  // of the gateway.
  const reach = Math.sin(COTTAGE.gateGap) * (COTTAGE.boundsRadius + 5);

  const picket = (x: number, height: number, color: number) => {
    const post = new THREE.BoxGeometry(0.55, height, 0.4);
    post.translate(x, height / 2, z);
    push(post, color);
    // Pointed cap, so it reads as a picket rather than a block.
    const cap = new THREE.ConeGeometry(0.42, 0.7, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(x, height + 0.3, z);
    push(cap, color);
  };

  for (const side of [-1, 1]) {
    for (let x = half + 1.4; x <= reach; x += 1.7) picket(side * x, 3.2, WOOD);
    // Two rails tying the pickets together.
    for (const y of [1.1, 2.4]) {
      const run = reach - half;
      const rail = new THREE.BoxGeometry(run, 0.34, 0.24);
      rail.translate(side * (half + run / 2), y, z);
      push(rail, WOOD_DARK);
    }
    // Gateposts, taller and chunkier than the pickets.
    const gatepost = new THREE.BoxGeometry(0.9, 4.4, 0.9);
    gatepost.translate(side * half, 2.2, z);
    push(gatepost, WOOD_DARK);
    const finial = new THREE.SphereGeometry(0.55, 12, 10);
    finial.translate(side * half, 4.6, z);
    push(finial, WOOD);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('cottage fence: geometry merge failed');
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, vertexToon());
  mesh.castShadow = true;
  g.add(mesh);

  // The two gate leaves, hinged on the gateposts. Shut, they meet in the
  // middle; open, they swing back against the fence.
  const hinges: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Object3D();
    hinge.position.set(side * half, 0, z);
    // Shut to begin with: the lane is closed until the cottage is unlocked.
    hinge.rotation.y = Math.PI;
    // Wide enough that the pair meet in the middle when shut — a gap between
    // them is an invitation to try to fly through it.
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.9, 0.22), solidToon(WOOD));
    leaf.position.set(side * 2.2, 1.55, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    for (const y of [0.9, 2.2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 0.3), solidToon(WOOD_DARK));
      bar.position.set(side * 2.2, y, 0.12);
      hinge.add(bar);
    }
    g.add(hinge);
    hinges.push(hinge);
  }

  let open = false;
  return {
    group: g,
    setOpen(next) {
      open = next;
    },
    update() {
      // A leaf sits along its own +x from the hinge, so PI points it across the
      // gap (shut) and the swing back out through 0 leaves it standing proud of
      // the fence. Eased rather than snapped, so a gate that opens mid-level
      // swings rather than teleports.
      for (let i = 0; i < hinges.length; i++) {
        const side = i === 0 ? -1 : 1;
        const target = open ? side * 1.25 : Math.PI;
        hinges[i].rotation.y += (target - hinges[i].rotation.y) * 0.08;
      }
    },
  };
}

/**
 * A ring of bushes so the clearing reads as enclosed — with a gap left at the
 * south side, where the gate through to the meadow is.
 */
function createHedge(rng: Rng): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const bushes = new THREE.InstancedMesh(geo, solidToon(0x4e8f47), 90);
  bushes.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < bushes.count; i++) {
    const a = (i / bushes.count) * Math.PI * 2 + rng.range(-0.03, 0.03);
    // Due south is +Z, i.e. angle PI/2 — leave that stretch clear.
    if (Math.abs(shortestAngle(a, Math.PI / 2)) < COTTAGE.gateGap) {
      // Instances can't be skipped, only hidden: scale it to nothing.
      m.makeScale(0, 0, 0);
      bushes.setMatrixAt(i, m);
      continue;
    }
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
