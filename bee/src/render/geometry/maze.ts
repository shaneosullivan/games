import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  MAZE,
  MAZE_PALETTE as P,
  POLLEN_KINDS,
  type PollenKind,
} from "../../config";
import type {Rng} from "../../core/rng";
import {
  colOf,
  deadEnds,
  EAST,
  isOpen,
  NORTH,
  rowOf,
  SOUTH,
  WEST,
  type Maze,
} from "../../levels/maze";
import {paint, solidToon, vertexToon} from "../materials";
import {createFlowerGeometry} from "./flower";

/** A flower standing at the end of a dead end, waiting to be eaten. */
export interface MazeFlower {
  cell: number;
  kind: PollenKind;
  /** Where the bee has to get to, at the height of the bloom. */
  position: THREE.Vector3;
  eaten: boolean;
  /** The head, scaled away as she eats it. The stem stays. */
  head: THREE.Mesh;
  /** Where the head sits above the base, in the flower's own units. */
  headHeight: number;
}

export interface MazeScene {
  group: THREE.Group;
  maze: Maze;
  flowers: Array<MazeFlower>;
  /** Middle of the way out, on the ground. */
  exitPosition: THREE.Vector3;
  /** Middle of the whole grid, for the survey shot. */
  centre: THREE.Vector3;
  /** Half the width of the grid, for the survey shot's framing. */
  halfWidth: number;
  /** Centre of a cell, at ground level. Writes into `out`. */
  cellCentre(cell: number, out: THREE.Vector3): THREE.Vector3;
  /**
   * Hold a point inside the corridors. Returns true if it had to move it,
   * which is how the bee knows to drop the speed she was carrying into a tree.
   */
  confine(point: THREE.Vector3, halfWidth: number): boolean;
  /** Which cell a point is in, clamped to the grid. */
  cellAt(point: THREE.Vector3): number;
  update(elapsed: number, dt: number, near: THREE.Vector3): void;
  /**
   * How far off the camera the bee is, so the walls know what counts as being
   * in front of her. Call it before rendering; pass null to stop fading
   * altogether, which any shot that isn't the chase rig has to do.
   */
  setFadeDepth(distanceToBee: number | null): void;
  dispose(): void;
}

/**
 * The woods: the maze drawn as trees, with a breeze in them.
 *
 * The walls are the point of interest. Each cell edge that isn't a doorway
 * gets a line of trees, and every lattice corner gets one whether or not it
 * needs it — a post at each junction is what stops a diagonal gap appearing
 * where two corridors cross, and it costs nothing because corners are never
 * inside a corridor.
 *
 * Trunks are bare to `MAZE.canopyBase` on purpose. The chase camera in here
 * sits low and behind, looking along a corridor: with the canopy hanging any
 * lower the shot would spend the level inside a leaf.
 */
export function createMazeScene(maze: Maze, rng: Rng): MazeScene {
  const group = new THREE.Group();
  const {cols, rows, cellSize} = MAZE;
  const halfWidth = (Math.max(cols, rows) * cellSize) / 2;
  const originX = -((cols - 1) / 2) * cellSize;
  const originZ = -((rows - 1) / 2) * cellSize;

  const cellCentre = (cell: number, out: THREE.Vector3): THREE.Vector3 =>
    out.set(
      originX + colOf(maze, cell) * cellSize,
      0,
      originZ + rowOf(maze, cell) * cellSize,
    );

  // ---- ground ------------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth * 4, halfWidth * 4),
    solidToon(P.ground),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  group.add(floor);

  // ---- the walls ---------------------------------------------------------
  const spots = wallTreeSpots(maze, originX, originZ, rng);
  const treeGeo = createMazeTree();
  const treeFade = fadeInFront(vertexToon());
  const trees = new THREE.InstancedMesh(
    treeGeo,
    treeFade.material,
    spots.length,
  );
  trees.castShadow = true;
  const dummy = new THREE.Object3D();
  /** Per-tree phase and scale, so the breeze isn't a single stiff wave. */
  const phase = new Float32Array(spots.length);
  const scale = new Float32Array(spots.length);
  for (let i = 0; i < spots.length; i++) {
    phase[i] = rng.range(0, Math.PI * 2);
    scale[i] = rng.range(0.9, 1.16);
    dummy.position.copy(spots[i]);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.setScalar(scale[i]);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
  }
  trees.instanceMatrix.needsUpdate = true;
  group.add(trees);

  // ---- the hedge between the trunks --------------------------------------
  const bushSpots = wallBushSpots(maze, originX, originZ, rng);
  const bushGeo = createBush();
  const bushFade = fadeInFront(vertexToon());
  const bushes = new THREE.InstancedMesh(
    bushGeo,
    bushFade.material,
    bushSpots.length,
  );
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  const bushPhase = new Float32Array(bushSpots.length);
  /** Per-bush scale, kept so the sway below can rebuild the matrix. */
  const bushScale: Array<THREE.Vector3> = [];
  for (let i = 0; i < bushSpots.length; i++) {
    bushPhase[i] = rng.range(0, Math.PI * 2);
    // Only ever narrower, never wider: a bush scaled past 1 across would reach
    // into the corridor the flight bounds assume is clear.
    bushScale.push(
      new THREE.Vector3(
        rng.range(0.86, 1),
        rng.range(0.8, 1.08),
        rng.range(0.86, 1),
      ),
    );
    dummy.position.copy(bushSpots[i]);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.copy(bushScale[i]);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
  }
  bushes.instanceMatrix.needsUpdate = true;
  group.add(bushes);

  // ---- leaves coming off the breeze --------------------------------------
  const leafGeo = new THREE.PlaneGeometry(MAZE.leafSize, MAZE.leafSize);
  // `vertexColors: true` makes the shader read a `color` attribute; with none
  // it reads black and the per-instance colour never multiplies in. See the
  // same note in fx/particles.ts — this is the third time it has bitten.
  whiten(leafGeo);
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      // They're small and everywhere; fog would only mud them.
      fog: true,
    }),
    MAZE.leaves,
  );
  leaves.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAZE.leaves * 3),
    3,
  );
  const leafPos: Array<THREE.Vector3> = [];
  const leafSpin = new Float32Array(MAZE.leaves);
  const leafPhase = new Float32Array(MAZE.leaves);
  const colour = new THREE.Color();
  for (let i = 0; i < MAZE.leaves; i++) {
    leafPos.push(new THREE.Vector3());
    leafSpin[i] = rng.range(-2.4, 2.4);
    leafPhase[i] = rng.range(0, Math.PI * 2);
    colour.set(P.leaf[i % P.leaf.length]);
    leaves.setColorAt(i, colour);
  }
  if (leaves.instanceColor) {
    leaves.instanceColor.needsUpdate = true;
  }
  group.add(leaves);

  // ---- flowers at the dead ends ------------------------------------------
  const flowers: Array<MazeFlower> = [];
  // One geometry per kind, shared by every flower of it. Built on demand and
  // kept, rather than rebuilt per dead end.
  const built = new Map<PollenKind, ReturnType<typeof createFlowerGeometry>>();
  const tmp = new THREE.Vector3();
  deadEnds(maze).forEach((cell, i) => {
    const kind = POLLEN_KINDS[i % POLLEN_KINDS.length];
    let geo = built.get(kind);
    if (!geo) {
      geo = createFlowerGeometry(kind);
      built.set(kind, geo);
    }

    // Flowers stand up to be seen: this is a rescue, not a hidden collectible.
    const stand = 2.4;
    cellCentre(cell, tmp);
    const base = new THREE.Group();
    base.position.copy(tmp);
    base.scale.setScalar(stand);
    const stemMesh = new THREE.Mesh(geo.stem, vertexToon());
    const headMesh = new THREE.Mesh(geo.head, vertexToon());
    // The head is authored about its own centre, not at the top of the stem —
    // the meadow lifts it to `headHeight` in its own instance matrix and so
    // must this. Parented at zero it sits in the ground, petals down.
    headMesh.position.y = geo.headHeight;
    base.add(stemMesh, headMesh);
    group.add(base);

    flowers.push({
      cell,
      kind,
      headHeight: geo.headHeight,
      position: tmp.clone().setY(geo.headHeight * stand),
      eaten: false,
      head: headMesh,
    });
  });

  // ---- the way out -------------------------------------------------------
  const exitPosition = cellCentre(maze.exit, new THREE.Vector3());
  group.add(createExitMarker(exitPosition));

  // ---- confinement -------------------------------------------------------
  //
  // The maze is axis-aligned, so keeping something inside it is arithmetic
  // rather than collision: work out which cell a point is in, and for every
  // side of that cell that is walled, don't let it past the corridor's edge.
  // Crossing an open side is fine — the next frame it's simply in the next
  // cell, whose own walls take over.

  const cellAt = (point: THREE.Vector3): number => {
    const col = Math.min(
      cols - 1,
      Math.max(0, Math.round((point.x - originX) / cellSize)),
    );
    const row = Math.min(
      rows - 1,
      Math.max(0, Math.round((point.z - originZ) / cellSize)),
    );
    return row * cols + col;
  };

  const confineTmp = new THREE.Vector3();
  const confine = (point: THREE.Vector3, w: number): boolean => {
    const cell = cellAt(point);
    cellCentre(cell, confineTmp);
    const dx = point.x - confineTmp.x;
    const dz = point.z - confineTmp.z;
    let nx = dx;
    let nz = dz;

    // Walls stop you leaving; open sides let you through.
    if (!isOpen(maze, cell, WEST)) {
      nx = Math.max(nx, -w);
    }
    if (!isOpen(maze, cell, EAST)) {
      nx = Math.min(nx, w);
    }
    if (!isOpen(maze, cell, NORTH)) {
      nz = Math.max(nz, -w);
    }
    if (!isOpen(maze, cell, SOUTH)) {
      nz = Math.min(nz, w);
    }

    // In a doorway, hold the middle of it. Without this you could cut the
    // corner of a junction and clip the post standing on it.
    const half = cellSize / 2;
    if (Math.abs(nx) > half - w) {
      nz = Math.max(-w, Math.min(w, nz));
    }
    if (Math.abs(nz) > half - w) {
      nx = Math.max(-w, Math.min(w, nx));
    }

    if (nx === dx && nz === dz) {
      return false;
    }
    point.x = confineTmp.x + nx;
    point.z = confineTmp.z + nz;
    return true;
  };

  // ---- per-frame ---------------------------------------------------------
  const leafUp = new THREE.Vector3(0, 1, 0);
  const recycle = (i: number, near: THREE.Vector3, high: boolean): void => {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * MAZE.leafRadius;
    leafPos[i].set(
      near.x + Math.cos(a) * r,
      high ? rng.range(1, MAZE.canopyBase + 2) : MAZE.canopyBase + rng.next(),
      near.z + Math.sin(a) * r,
    );
  };
  for (let i = 0; i < MAZE.leaves; i++) {
    recycle(i, new THREE.Vector3(), true);
  }

  return {
    group,
    maze,
    flowers,
    exitPosition,
    centre: new THREE.Vector3(0, 0, 0),
    halfWidth: (Math.max(cols, rows) * cellSize) / 2,
    cellCentre,
    confine,
    cellAt,

    setFadeDepth(distanceToBee) {
      // A depth behind the eye means nothing is ever in front of her, so the
      // whole maze stays solid.
      const upTo =
        distanceToBee === null ? -1e9 : distanceToBee - MAZE.fadeMargin;
      treeFade.setDepth(upTo);
      bushFade.setDepth(upTo);
    },

    update(elapsed, dt, near) {
      // Breeze: the whole wall leans together, each tree a little out of step
      // with the next so it reads as wind rather than a wobble.
      for (let i = 0; i < spots.length; i++) {
        const lean =
          Math.sin(elapsed * MAZE.swayRate + phase[i]) * MAZE.swayAmplitude;
        dummy.position.copy(spots[i]);
        dummy.rotation.set(lean, phase[i], lean * 0.6);
        dummy.scale.setScalar(scale[i]);
        dummy.updateMatrix();
        trees.setMatrixAt(i, dummy.matrix);
      }
      trees.instanceMatrix.needsUpdate = true;

      // The hedge moves with the same breeze, but barely — a bush rooted along
      // its whole base can't lean the way a trunk does.
      for (let i = 0; i < bushSpots.length; i++) {
        const lean =
          Math.sin(elapsed * MAZE.swayRate * 1.4 + bushPhase[i]) *
          MAZE.swayAmplitude *
          0.35;
        dummy.position.copy(bushSpots[i]);
        dummy.rotation.set(lean, bushPhase[i], lean);
        dummy.scale.copy(bushScale[i]);
        dummy.updateMatrix();
        bushes.setMatrixAt(i, dummy.matrix);
      }
      bushes.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < MAZE.leaves; i++) {
        const p = leafPos[i];
        p.y -= MAZE.leafFallSpeed * dt;
        p.x += Math.sin(elapsed * 0.8 + leafPhase[i]) * MAZE.leafDrift * dt;
        p.z += Math.cos(elapsed * 0.6 + leafPhase[i]) * MAZE.leafDrift * dt;
        // Off the bottom, or left behind as the bee flies on.
        const far =
          (p.x - near.x) ** 2 + (p.z - near.z) ** 2 >
          MAZE.leafRadius * MAZE.leafRadius * 1.6;
        if (p.y < 0 || far) {
          recycle(i, near, false);
        }
        dummy.position.copy(p);
        dummy.quaternion.setFromAxisAngle(
          leafUp,
          elapsed * leafSpin[i] + leafPhase[i],
        );
        dummy.rotateX(1.1 + Math.sin(elapsed + leafPhase[i]) * 0.5);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      treeGeo.dispose();
      bushGeo.dispose();
      leafGeo.dispose();
    },
  };
}

/**
 * Make a material dissolve anything that comes between the camera and the bee.
 *
 * In a maze the shot is forever half inside a hedge — the rig sits eight units
 * behind her and the corridors turn. Moving the camera to escape that means
 * moving it constantly; fading what's in the way leaves the shot where it
 * belongs and takes the obstruction out of it instead.
 *
 * The test is the fragment's own view depth against hers, handed in as
 * `fadeUpTo`. Distance from the eye alone can't do it: a bush blocking the
 * view and the bush standing next to her are both a few units off, so a range
 * wide enough to clear the first washes the whole maze out and one narrow
 * enough to spare the second leaves her hidden.
 *
 * Anything under the cutoff is discarded rather than drawn faint, because a
 * transparent fragment still writes depth and would hide the bee behind a
 * trunk you can see straight through.
 */
function fadeInFront(material: THREE.Material): {
  material: THREE.Material;
  setDepth(d: number): void;
} {
  material.transparent = true;
  let live: {value: number} = {value: 1e9};
  material.onBeforeCompile = shader => {
    shader.uniforms.fadeUpTo = live;
    shader.uniforms.fadeBand = {value: MAZE.fadeBand};
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vEyeDist;",
      )
      .replace(
        "#include <fog_vertex>",
        "#include <fog_vertex>\nvEyeDist = -mvPosition.z;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vEyeDist;\nuniform float fadeUpTo;\nuniform float fadeBand;",
      )
      .replace(
        "#include <dithering_fragment>",
        `float nearFade = smoothstep(fadeUpTo - fadeBand, fadeUpTo, vEyeDist);
         if (nearFade < ${MAZE.fadeCutoff}) discard;
         gl_FragColor.a *= nearFade;
         #include <dithering_fragment>`,
      );
  };
  // Without its own key three hands both wall materials the same program.
  material.customProgramCacheKey = () => "mazeFade";
  return {
    material,
    setDepth(d) {
      live.value = d;
    },
  };
}

/**
 * Where every wall tree stands.
 *
 * A post on each lattice corner, plus a line of trees along each cell edge
 * that stayed closed. Only the east and south sides of each cell are walked,
 * with the north and west edges of the grid picked up separately, so no wall
 * gets planted twice.
 */
function wallTreeSpots(
  maze: Maze,
  originX: number,
  originZ: number,
  rng: Rng,
): Array<THREE.Vector3> {
  const {cols, rows, cellSize, treesPerWall} = MAZE;
  const half = cellSize / 2;
  const out: Array<THREE.Vector3> = [];
  const jitter = (): number => rng.range(-0.22, 0.22);

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      out.push(
        new THREE.Vector3(
          originX + col * cellSize - half,
          0,
          originZ + row * cellSize - half,
        ),
      );
    }
  }

  const wall = (
    x: number,
    z: number,
    alongX: boolean,
    // The exit's own doorway is left open so the way out reads as a way out.
  ): void => {
    for (let i = 0; i < treesPerWall; i++) {
      const t = ((i + 1) / (treesPerWall + 1) - 0.5) * cellSize;
      out.push(
        new THREE.Vector3(
          x + (alongX ? t : 0) + jitter(),
          0,
          z + (alongX ? 0 : t) + jitter(),
        ),
      );
    }
  };

  for (let cell = 0; cell < cols * rows; cell++) {
    const col = colOf(maze, cell);
    const row = rowOf(maze, cell);
    const cx = originX + col * cellSize;
    const cz = originZ + row * cellSize;
    if (!isOpen(maze, cell, EAST) && !isExitDoor(maze, cell, EAST)) {
      wall(cx + half, cz, false);
    }
    if (!isOpen(maze, cell, SOUTH) && !isExitDoor(maze, cell, SOUTH)) {
      wall(cx, cz + half, true);
    }
    if (col === 0 && !isOpen(maze, cell, WEST)) {
      wall(cx - half, cz, false);
    }
    if (row === 0 && !isOpen(maze, cell, NORTH)) {
      wall(cx, cz - half, true);
    }
  }

  return out;
}

/**
 * The exit cell's outward side is left unplanted, so from inside the maze the
 * way out is a gap in the trees with daylight through it rather than another
 * wall with a marker on it.
 */
function isExitDoor(maze: Maze, cell: number, side: number): boolean {
  if (cell !== maze.exit) {
    return false;
  }
  const atEast = colOf(maze, cell) === maze.cols - 1;
  const atSouth = rowOf(maze, cell) === maze.rows - 1;
  return (side === EAST && atEast) || (side === SOUTH && atSouth);
}

/**
 * Give a geometry a flat white `color` attribute, so a material with
 * `vertexColors: true` has something for `instanceColor` to multiply into.
 */
export function whiten(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const white = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute("color", new THREE.BufferAttribute(white, 3));
  return geo;
}

/**
 * Where the hedge goes: along every walled edge, and on every lattice corner
 * so the turns are sealed rather than showing a gap at each junction.
 */
function wallBushSpots(
  maze: Maze,
  originX: number,
  originZ: number,
  rng: Rng,
): Array<THREE.Vector3> {
  const {cols, rows, cellSize, bushesPerWall} = MAZE;
  const half = cellSize / 2;
  const out: Array<THREE.Vector3> = [];
  const jitter = (): number => rng.range(-0.18, 0.18);

  const run = (x: number, z: number, alongX: boolean): void => {
    for (let i = 0; i < bushesPerWall; i++) {
      const t = ((i + 0.5) / bushesPerWall - 0.5) * cellSize;
      out.push(
        new THREE.Vector3(
          x + (alongX ? t : 0) + jitter(),
          0,
          z + (alongX ? 0 : t) + jitter(),
        ),
      );
    }
  };

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      out.push(
        new THREE.Vector3(
          originX + col * cellSize - half,
          0,
          originZ + row * cellSize - half,
        ),
      );
    }
  }

  for (let cell = 0; cell < cols * rows; cell++) {
    const col = colOf(maze, cell);
    const row = rowOf(maze, cell);
    const cx = originX + col * cellSize;
    const cz = originZ + row * cellSize;
    if (!isOpen(maze, cell, EAST) && !isExitDoor(maze, cell, EAST)) {
      run(cx + half, cz, false);
    }
    if (!isOpen(maze, cell, SOUTH) && !isExitDoor(maze, cell, SOUTH)) {
      run(cx, cz + half, true);
    }
    if (col === 0 && !isOpen(maze, cell, WEST)) {
      run(cx - half, cz, false);
    }
    if (row === 0 && !isOpen(maze, cell, NORTH)) {
      run(cx, cz - half, true);
    }
  }

  return out;
}

/** One bush: stacked blobs, widest low down, so a run of them reads as hedge. */
function createBush(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const {bushRadius: r, bushHeight: h} = MAZE;

  for (const [y, size, tone] of [
    [h * 0.24, r, P.bushDark],
    [h * 0.52, r * 0.95, P.bush],
    [h * 0.78, r * 0.78, P.bushLight],
    [h * 0.95, r * 0.5, P.bush],
  ] as const) {
    const blob = new THREE.IcosahedronGeometry(size, 1);
    // Squashed and a little wider than tall, which is what makes a row of them
    // meet each other instead of reading as a line of separate shrubs.
    blob.scale(1, 0.78, 1);
    blob.translate(0, y, 0);
    parts.push(paint(blob, tone));
  }

  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error("maze: bush merge failed");
  }
  geo.computeVertexNormals();
  return geo;
}

/** One tree: a bare trunk with the canopy well above the shot. */
function createMazeTree(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const {trunkRadius: r, canopyBase, canopyRadius} = MAZE;

  const trunk = new THREE.CylinderGeometry(r * 0.8, r * 1.35, canopyBase, 7);
  trunk.translate(0, canopyBase / 2, 0);
  parts.push(paint(trunk, P.bark));

  for (const [y, size, tone] of [
    [canopyBase, canopyRadius, P.canopy],
    [canopyBase + 1.5, canopyRadius * 0.78, P.canopyDark],
    [canopyBase + 2.6, canopyRadius * 0.5, P.canopy],
  ] as const) {
    const blob = new THREE.IcosahedronGeometry(size, 1);
    blob.scale(1, 0.8, 1);
    blob.translate(0, y, 0);
    parts.push(paint(blob, tone));
  }

  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error("maze: tree merge failed");
  }
  geo.computeVertexNormals();
  return geo;
}

/** A glowing ring on the ground where the maze lets you out. */
function createExitMarker(at: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(at);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(MAZE.exitRadius, 0.22, 8, 28),
    new THREE.MeshBasicMaterial({
      color: P.exit,
      transparent: true,
      opacity: 0.85,
      fog: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);

  // A soft column of light, so it reads from the far end of a corridor and
  // from the survey shot overhead.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(
      MAZE.exitRadius * 0.82,
      MAZE.exitRadius,
      9,
      16,
      1,
      true,
    ),
    new THREE.MeshBasicMaterial({
      color: P.exit,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    }),
  );
  beam.position.y = 4.5;
  g.add(beam);

  return g;
}
