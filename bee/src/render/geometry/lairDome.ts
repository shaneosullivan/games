import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {DOME, LAIR_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, solidToon, vertexToon} from "../materials";
import {createHoneyJar} from "./cottageInside";

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
  /** Take a jar off the pile; it keeps its world position for the caller. */
  takeJar(index: number): THREE.Group | null;
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
  const holeY =
    DOME.height * Math.sqrt(Math.max(0, 1 - (holeR / DOME.radius) ** 2));
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
  const shell = new THREE.SphereGeometry(
    DOME.radius,
    28,
    18,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  shell.scale(1, DOME.height / DOME.radius, 1);
  shell.translate(centre.x, 0, centre.z);
  // Shaded by height rather than by light.
  //
  // A back-facing surface has its normals pointing away from everything, so
  // lit materials leave it flat black and the room reads as a void with things
  // floating in it. Painting the curve in — stone where it meets the floor,
  // fading into the dark overhead — is what makes it a domed chamber, and it
  // is the same trick the hive interior uses to look round.
  {
    const pos = shell.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const low = new THREE.Color(P.rock).convertSRGBToLinear();
    const high = new THREE.Color(0x14111d).convertSRGBToLinear();
    const mix = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const up = Math.min(1, Math.max(0, pos.getY(i) / DOME.height));
      mix.copy(low).lerp(high, up ** 0.55);
      colours[i * 3] = mix.r;
      colours[i * 3 + 1] = mix.g;
      colours[i * 3 + 2] = mix.b;
    }
    shell.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  }
  const shellMesh = new THREE.Mesh(
    shell,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
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

  // ---- the hole, and the light through it ---------------------------------
  //
  // A ring of sky rather than a hole cut in the shell: there is no boolean
  // geometry here, so the "hole" is a bright disc laid just inside the dome
  // with the shell's own darkness around it.
  // A little wider than the hole, so no rim of shell shows around it.
  const sky = new THREE.CircleGeometry(DOME.holeRadius * 1.08, 24);
  sky.rotateX(Math.PI / 2);
  // A shade under the roof, so the shell can't win the depth test against it.
  sky.translate(holeCentre.x, holeCentre.y - 0.5, holeCentre.z);
  const skyMesh = new THREE.Mesh(
    sky,
    new THREE.MeshBasicMaterial({
      color: DOME.skyColor,
      // Both faces. It is looked at from underneath for the whole scene — a
      // front-facing disc laid flat is invisible from below, which is what
      // made the hole read as more darkness rather than as daylight.
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  skyMesh.renderOrder = 2;
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
    takeJar(index) {
      const jar = jars[index];
      if (!jar || !jar.parent) {
        return null;
      }
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
