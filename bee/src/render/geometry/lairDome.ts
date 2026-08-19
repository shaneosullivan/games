import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {DOME, LAIR, LAIR_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, solidToon, vertexToon} from "../materials";
import {createHoneyJar} from "./honeyJar";

export interface LairDome {
  group: THREE.Group;
  /** Middle of the floor, where the hoard stands. */
  centre: THREE.Vector3;
  /** Where the shaft of daylight comes in, off to one side of the roof. */
  holeCentre: THREE.Vector3;
  /** Where she enters, at the end of the corridor. */
  entry: THREE.Vector3;
  /** The jars, top of the pile first, for handing one to each bee. */
  jars: ReadonlyArray<THREE.Group>;
  /**
   * Shrink what is left of the hoard, 1 being the pile as it was found.
   *
   * A swarm can only carry a jar each, which is a handful off a pile of forty
   * — so the hoard is scaled down bodily as they leave rather than counted
   * out. It reads as "they took a lot of it", which is the point of the shot,
   * and it costs nothing.
   */
  setHoardScale(scale: number): void;
  /** Take a jar off the pile; it keeps its world position for the caller. */
  takeJar(index: number): THREE.Group | null;
  /** Show the sky outside. Off until the cut scene; see above. */
  setSkyVisible(on: boolean): void;
  update(elapsed: number): void;
  dispose(): void;
}

/**
 * The chamber at the end of the Bear's Lair.
 *
 * A dome with a hole in the roof, a hoard of honey jars under the shaft of
 * daylight that comes through it, and the bones of everything the bear has
 * eaten scattered over the floor. It is the only room in the game that exists
 * purely to be looked at — nothing here is flown through or collided with.
 *
 * The hole is deliberately *not* centred. A hole straight above the hoard puts
 * the light, the treasure and the way out all on one axis, and the shot has
 * nowhere to move; off to one side, the climb out is a diagonal across the room
 * and the light rakes the jars instead of sitting flat on them.
 */
export function createLairDome(rng: Rng, atX: number): LairDome {
  const group = new THREE.Group();
  const centre = new THREE.Vector3(atX + DOME.radius, 0, 0);
  // How high the roof actually is where the hole is.
  //
  // Not `DOME.height` — that is the dome's peak, and the hole is deliberately
  // off to one side, where an ellipsoid roof is lower. Using the peak put the
  // disc of sky a clear three units above the rock it was supposed to be a
  // hole in, so the shell hid it and the way out looked like more cave.
  const holeR = Math.hypot(DOME.holeOffsetX, DOME.holeOffsetZ);
  // On the domed part, which starts on top of the wall.
  const holeY =
    DOME.wallHeight +
    (DOME.height - DOME.wallHeight) *
      Math.sqrt(Math.max(0, 1 - (holeR / DOME.radius) ** 2));
  const holeCentre = new THREE.Vector3(
    centre.x + DOME.holeOffsetX,
    holeY,
    DOME.holeOffsetZ,
  );

  // ---- the shell ----------------------------------------------------------
  //
  // Open at the bottom and open at the hole: a sphere with its lower half and
  // a cap around the hole's bearing left off. Drawn from the inside — the
  // camera never leaves the room except through the hole, and a closed dome
  // would black the shot out on the way through.
  //
  // Built by hand, quad by quad, so the hole can be a hole. There is no
  // boolean geometry here, and the first version faked one with a bright disc
  // laid under a solid roof — which meant anything flying out through it was
  // hidden by the rock it was supposed to be passing through. Skipping the
  // quads that fall inside the hole's bearing leaves a real gap, and bees go
  // through it.
  const shellPositions: Array<number> = [];
  const shellColours: Array<number> = [];
  const low = new THREE.Color(P.rock).convertSRGBToLinear();
  const high = new THREE.Color(0x14111d).convertSRGBToLinear();
  const mix = new THREE.Color();
  /** Direction from the middle of the room to the hole, on the unit sphere. */
  const holeDir = new THREE.Vector3(
    DOME.holeOffsetX / DOME.radius,
    holeY / DOME.height,
    DOME.holeOffsetZ / DOME.radius,
  ).normalize();
  // A little wider than the hole itself, so its rim is rock rather than a
  // fringe of half-quads.
  /** How far from the hole's middle the roof is taken away. */
  const holeCut = DOME.holeRadius * 1.25;
  /**
   * A point on the room's wall, `u` running 0 at the floor to 1 at the top.
   *
   * Straight wall first, dome on top of it. A pure dome meets the floor at its
   * rim, and from a camera inside at head height a level look passes over that
   * rim and straight out of the room — which is why the top of the shot was
   * sky. A room has walls.
   */
  const shellPoint = (
    u: number,
    a: number,
    out: THREE.Vector3,
  ): THREE.Vector3 => {
    if (u <= DOME.wallFraction) {
      return out.set(
        centre.x + Math.cos(a) * DOME.radius,
        (u / DOME.wallFraction) * DOME.wallHeight,
        centre.z + Math.sin(a) * DOME.radius,
      );
    }
    const e =
      ((u - DOME.wallFraction) / (1 - DOME.wallFraction)) * (Math.PI / 2);
    return out.set(
      centre.x + Math.cos(e) * Math.cos(a) * DOME.radius,
      DOME.wallHeight + Math.sin(e) * (DOME.height - DOME.wallHeight),
      centre.z + Math.cos(e) * Math.sin(a) * DOME.radius,
    );
  };
  const corner = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  // Fine enough that the hole's edge doesn't read as steps: the gap is made by
  // dropping whole quads, so the quads have to be small where it is.
  const rings = 40;
  const segments = 96;
  const mid = new THREE.Vector3();
  for (let r = 0; r < rings; r++) {
    const e0 = r / rings;
    const e1 = (r + 1) / rings;
    for (let sIdx = 0; sIdx < segments; sIdx++) {
      const a0 = (sIdx / segments) * Math.PI * 2;
      const a1 = ((sIdx + 1) / segments) * Math.PI * 2;
      // Is the middle of this quad inside the hole? Measured straight against
      // the hole's own position, which works whatever shape the surface is —
      // an angular test only works on a sphere, and this is a wall with a dome
      // on top of it.
      shellPoint((e0 + e1) / 2, (a0 + a1) / 2, mid);
      if (mid.distanceTo(holeCentre) < holeCut) {
        continue;
      }
      shellPoint(e0, a0, corner[0]);
      shellPoint(e0, a1, corner[1]);
      shellPoint(e1, a1, corner[2]);
      shellPoint(e1, a0, corner[3]);
      // ...and the doorway, where the corridor arrives.
      //
      // The cave runs into the side of this room, so the wall it runs into
      // cannot be there: without the gap she flew in through solid rock and
      // the shot outside had a closed dome in front of everything. Everything
      // on the near side below the corridor's own roof comes out.
      const midX = (corner[0].x + corner[2].x) / 2;
      const midY = (corner[0].y + corner[2].y) / 2;
      const midZ = (corner[0].z + corner[2].z) / 2;
      if (
        midX < centre.x - DOME.radius * DOME.doorwaySpan &&
        midY < LAIR.ceilingY + DOME.doorwayHeadroom &&
        // ...and only as wide as the corridor. Without this the whole near
        // half of the room goes, at every bearing, and from inside you look
        // straight out of the side of the dome at the sky.
        Math.abs(midZ - LAIR.beeZ) < DOME.doorwayHalfWidth
      ) {
        continue;
      }
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = corner[i];
        shellPositions.push(p.x, p.y, p.z);
        // Shaded by height rather than by light: a back-facing surface has its
        // normals pointing away from everything, so a lit material leaves it
        // flat black and the room reads as a void with things floating in it.
        const up = Math.min(1, Math.max(0, p.y / DOME.height));
        mix.copy(low).lerp(high, up ** 0.55);
        shellColours.push(mix.r, mix.g, mix.b);
      }
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(shellPositions), 3),
  );
  shell.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(shellColours), 3),
  );
  const shellMesh = new THREE.Mesh(
    shell,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      // Both faces.
      //
      // The quads are written out by hand, and their winding puts the front
      // face outward — so drawing back faces only culled the whole room from
      // inside it, and the sky sitting behind everything was what showed. The
      // doorway is what stops it being a lid over the shot from outside; the
      // shell can be solid from both sides.
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  group.add(shellMesh);

  // The floor, which is lit and so wants to be its own colour.
  const floor = new THREE.CircleGeometry(DOME.radius * 1.02, 40);
  floor.rotateX(-Math.PI / 2);
  floor.translate(centre.x, 0.02, centre.z);
  const floorMesh = new THREE.Mesh(paint(floor, P.ground), vertexToon());
  group.add(floorMesh);

  // A rim of boulders round the opening.
  //
  // Two jobs: it hides the stepped edge left by dropping quads, and it makes
  // the hole read as somewhere the roof has fallen in rather than as a shape
  // cut out of a surface. Same stones as the cave mouth, for the same reason.
  //
  // Each stone is put on the hole's own edge rather than on a circle around
  // it. The hole is an angular cap of an *ellipsoid*, so on the surface it is
  // an ellipse — a flat ring of the same radius sits inside it in one
  // direction and outside it in the other, and doesn't frame anything.
  const rim: Array<THREE.BufferGeometry> = [];
  const rimUp = new THREE.Vector3(0, 1, 0);
  const rimSide = new THREE.Vector3().crossVectors(holeDir, rimUp).normalize();
  const rimOther = new THREE.Vector3()
    .crossVectors(holeDir, rimSide)
    .normalize();
  const rimCount = 20;
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2;
    const size = rng.range(1.4, 2.4);
    const boulder = new THREE.IcosahedronGeometry(size, 0);
    // On the cut itself: the roof is taken away within `holeCut` of the hole's
    // middle, so a stone at exactly that distance sits on the edge of the gap,
    // whatever shape the surface it was cut out of happens to be.
    const r = holeCut + size * 0.3;
    boulder.translate(
      holeCentre.x + (rimSide.x * Math.cos(a) + rimOther.x * Math.sin(a)) * r,
      holeCentre.y + (rimSide.y * Math.cos(a) + rimOther.y * Math.sin(a)) * r,
      holeCentre.z + (rimSide.z * Math.cos(a) + rimOther.z * Math.sin(a)) * r,
    );
    rim.push(paint(boulder, i % 3 === 0 ? P.rockLight : P.rock));
  }
  const rimMesh = new THREE.Mesh(mergeGeometries(rim, false), vertexToon());
  group.add(rimMesh);
  for (const geo of rim) {
    geo.dispose();
  }

  // ---- the daylight outside ------------------------------------------------
  //
  // A sphere of sky around the hole rather than a disc above it.
  //
  // A flat lid only fills the opening when you are looking straight up it: at
  // any angle the far half of the aperture showed the shell's own inside
  // instead, which is why the ring of stones looked like it was sitting on
  // solid roof rather than framing anything. A sphere is sky along every line
  // of sight that leaves through the gap, and once the camera is out through
  // the roof it is inside it, which is what being outdoors looks like.
  //
  // Hidden until the cut scene starts: it is unlit and unfogged, and from
  // inside the cave it would otherwise be a blue ball six hundred units away.
  const sky = new THREE.SphereGeometry(DOME.skyRadius, 20, 14);
  sky.translate(holeCentre.x, holeCentre.y, holeCentre.z);
  const skyMesh = new THREE.Mesh(
    sky,
    new THREE.MeshBasicMaterial({
      color: DOME.skyColor,
      side: THREE.BackSide,
      // Behind everything, and writing no depth, so nothing can be hidden by
      // it — least of all a bee on her way out.
      depthWrite: false,
      fog: false,
    }),
  );
  skyMesh.renderOrder = -2;
  skyMesh.visible = false;
  group.add(skyMesh);

  // The shaft: a cone of pale light standing on the floor, wider at the
  // bottom, drawn additively so it lies over the room rather than in it.
  const shaftHeight = holeY;
  const shaft = new THREE.CylinderGeometry(
    DOME.holeRadius * 0.92,
    DOME.holeRadius * 1.9,
    shaftHeight,
    24,
    1,
    true,
  );
  shaft.translate(0, shaftHeight / 2, 0);
  const shaftMesh = new THREE.Mesh(
    shaft,
    new THREE.MeshBasicMaterial({
      color: DOME.lightColor,
      transparent: true,
      opacity: DOME.shaftOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  // Leaning, so it lands on the hoard rather than under the hole: the light
  // comes in at an angle, which is the whole reason the hole is off-centre.
  shaftMesh.position.set(holeCentre.x, 0, holeCentre.z);
  shaftMesh.lookAt(centre.x, DOME.height * 2, centre.z);
  shaftMesh.rotateX(Math.PI / 2);
  shaftMesh.renderOrder = 3;
  group.add(shaftMesh);

  // A pool of light where it lands, so the floor under the hoard is lit too.
  const pool = new THREE.CircleGeometry(DOME.holeRadius * 2.1, 28);
  pool.rotateX(-Math.PI / 2);
  pool.translate(centre.x, 0.06, centre.z);
  const poolMesh = new THREE.Mesh(
    pool,
    new THREE.MeshBasicMaterial({
      color: DOME.lightColor,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  group.add(poolMesh);

  // ---- the hoard ----------------------------------------------------------
  //
  // A pyramid of jars, biggest layer down. Each one is its own object because
  // every bee leaves with one in her arms.
  const jars: Array<THREE.Group> = [];
  const step = DOME.jarSpacing;
  for (let layer = 0; layer < DOME.hoardLayers; layer++) {
    const side = DOME.hoardLayers - layer;
    const y = layer * DOME.jarRise;
    for (let a = 0; a < side; a++) {
      for (let b = 0; b < side; b++) {
        // Skip the inside of the lower layers — nothing can see them, and a
        // solid pyramid of jars is a few thousand triangles for nothing.
        const onEdge =
          layer === DOME.hoardLayers - 1 ||
          a === 0 ||
          b === 0 ||
          a === side - 1 ||
          b === side - 1;
        if (!onEdge) {
          continue;
        }
        const jar = createHoneyJar();
        jar.position.set(
          centre.x + (a - (side - 1) / 2) * step,
          y,
          centre.z + (b - (side - 1) / 2) * step,
        );
        jar.rotation.y = rng.range(0, Math.PI * 2);
        // Kept so the pile can be shrunk without burying itself in the floor.
        jar.userData.restY = jar.position.y;
        group.add(jar);
        jars.push(jar);
      }
    }
  }
  // Top of the pile first: the bees take from the top down, which is how a
  // pile actually comes apart.
  jars.sort((a, b) => b.position.y - a.position.y);

  // ---- sparkle ------------------------------------------------------------
  //
  // Little bright points that come and go over the pile. Cheaper and steadier
  // than a real specular highlight, and it reads as glass in lamplight.
  const sparkGeo = new THREE.SphereGeometry(DOME.sparkleSize, 5, 4);
  const sparkles = new THREE.InstancedMesh(
    sparkGeo,
    new THREE.MeshBasicMaterial({color: DOME.sparkleColor, fog: false}),
    DOME.sparkleCount,
  );
  sparkles.frustumCulled = false;
  group.add(sparkles);
  const sparkSpots = Array.from({length: DOME.sparkleCount}, () => {
    const jar = jars[Math.floor(rng.next() * jars.length)];
    return {
      x: jar.position.x + rng.range(-0.4, 0.4),
      y: jar.position.y + rng.range(0.1, 0.7),
      z: jar.position.z + rng.range(-0.4, 0.4),
      phase: rng.range(0, Math.PI * 2),
      rate: rng.range(1.6, 3.4),
    };
  });
  const sparkDummy = new THREE.Object3D();

  // ---- bones --------------------------------------------------------------
  //
  // Whatever the bear has finished with. All one merged mesh: they are set
  // dressing, and nothing ever looks at one closely.
  const bonePieces: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < DOME.bones; i++) {
    const long = rng.range(0.9, 3.4);
    const thick = long * rng.range(0.09, 0.16);
    const shaftGeo = new THREE.CylinderGeometry(thick, thick, long, 6);
    shaftGeo.rotateZ(Math.PI / 2);
    const bone: Array<THREE.BufferGeometry> = [shaftGeo];
    // Knuckles on both ends, which is what makes a cylinder read as a bone.
    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) {
        const knob = new THREE.SphereGeometry(thick * 1.9, 6, 5);
        knob.translate((end * long) / 2, side * thick * 1.1, 0);
        bone.push(knob);
      }
    }
    const merged = mergeGeometries(bone, false);
    for (const geo of bone) {
      geo.dispose();
    }
    if (!merged) {
      continue;
    }
    merged.rotateY(rng.range(0, Math.PI * 2));
    // Lying down, not standing: a bone on its end reads as a stick.
    merged.rotateX(rng.range(-0.12, 0.12));
    const a = rng.range(0, Math.PI * 2);
    const r = DOME.hoardClear + Math.sqrt(rng.next()) * DOME.boneSpread;
    merged.translate(
      centre.x + Math.cos(a) * r,
      thick * 1.6,
      centre.z + Math.sin(a) * r,
    );
    bonePieces.push(
      paint(merged, i % 4 === 0 ? DOME.boneShade : DOME.boneColor),
    );
  }
  const boneMesh = new THREE.Mesh(
    mergeGeometries(bonePieces, false),
    vertexToon(),
  );
  group.add(boneMesh);
  for (const geo of bonePieces) {
    geo.dispose();
  }

  // A few crystals for the same reason they're in the corridor: something in
  // here that isn't grey or gold.
  const crystals: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 26; i++) {
    const span = rng.range(1.2, 3);
    const geo = new THREE.ConeGeometry(rng.range(0.25, 0.6), span, 5);
    geo.translate(0, span / 2, 0);
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(DOME.radius * 0.55, DOME.radius * 0.95);
    geo.rotateZ(rng.range(-0.3, 0.3));
    geo.translate(centre.x + Math.cos(a) * r, 0, centre.z + Math.sin(a) * r);
    crystals.push(geo);
  }
  const crystalMesh = new THREE.Mesh(
    mergeGeometries(crystals, false),
    solidToon(P.crystal),
  );
  group.add(crystalMesh);
  for (const geo of crystals) {
    geo.dispose();
  }

  return {
    group,
    centre,
    holeCentre,
    entry: new THREE.Vector3(atX + 2, DOME.height * 0.45, 0),
    jars,
    setSkyVisible(on) {
      skyMesh.visible = on;
    },
    setHoardScale(scale) {
      for (const jar of jars) {
        // Only what is still in the pile. A jar someone is carrying goes back
        // into this group so it survives the scene, and scaling it here would
        // fight whoever is holding it — and snap it back onto the pile.
        if (jar.userData.taken) {
          continue;
        }
        jar.scale.setScalar(scale);
        // Standing on the floor as they shrink, not sinking into it.
        jar.position.y = (jar.userData.restY as number) * scale;
      }
    },
    takeJar(index) {
      const jar = jars[index];
      if (!jar || jar.userData.taken) {
        return null;
      }
      jar.userData.taken = true;
      group.remove(jar);
      return jar;
    },
    update(elapsed) {
      for (let i = 0; i < sparkSpots.length; i++) {
        const s = sparkSpots[i];
        // Each one winks on its own clock, so the pile shimmers rather than
        // pulsing all together.
        const t = Math.sin(elapsed * s.rate + s.phase);
        sparkDummy.position.set(s.x, s.y, s.z);
        sparkDummy.scale.setScalar(Math.max(0, t) ** 2);
        sparkDummy.updateMatrix();
        sparkles.setMatrixAt(i, sparkDummy.matrix);
      }
      sparkles.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
    },
  };
}
