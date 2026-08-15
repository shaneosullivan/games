import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  LAIR,
  LAIR_OUTSIDE as O,
  LAIR_OUTSIDE_PALETTE as OP,
} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, vertexToon} from "../materials";

export interface LairOutside {
  group: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

/**
 * The meadow the cave mouth opens onto.
 *
 * The level starts here, and it is the only cheerful thing in it: grass,
 * flowers, a blue sky and a couple of butterflies going nowhere in particular.
 * The hole in the hill has to look like somewhere you would rather not go, and
 * it only does if what you are leaving is somewhere you would rather stay.
 *
 * All of it hangs on the mouth cover — see `setMouthCover` in lair.ts. Once
 * the camera has committed to the cave this is behind it, and its sky would
 * otherwise show through the doorway as a bright hole in the dark.
 */
export function createLairOutside(rng: Rng): LairOutside {
  const group = new THREE.Group();
  const from = LAIR.mouthX - O.depth;
  const to = LAIR.mouthX + 2;
  const midX = (from + to) / 2;

  // ---- the grass ----------------------------------------------------------
  const parts: Array<THREE.BufferGeometry> = [];
  const ground = new THREE.BoxGeometry(to - from, 3, O.halfWidth * 2);
  ground.translate(midX, LAIR.floorY - 1.5, LAIR.beeZ);
  parts.push(paint(ground, OP.grass));

  // Tufts: three blades apiece, leaning slightly differently, so the ground
  // has a texture rather than being a green table.
  for (let i = 0; i < O.tufts; i++) {
    const x = rng.range(from, to - 3);
    const z = LAIR.beeZ + rng.range(-O.halfWidth, O.halfWidth);
    const blades: Array<THREE.BufferGeometry> = [];
    for (let b = 0; b < 3; b++) {
      const h = rng.range(0.5, 1.5);
      const blade = new THREE.ConeGeometry(0.12, h, 3);
      blade.translate(0, h / 2, 0);
      blade.rotateZ(rng.range(-0.35, 0.35));
      blade.rotateX(rng.range(-0.35, 0.35));
      blade.translate(x + rng.range(-0.5, 0.5), 0, z + rng.range(-0.5, 0.5));
      blades.push(blade);
    }
    const merged = mergeGeometries(blades, false);
    for (const geo of blades) {
      geo.dispose();
    }
    if (merged) {
      parts.push(paint(merged, i % 3 === 0 ? OP.grassDark : OP.grassLight));
    }
  }

  // ---- flowers ------------------------------------------------------------
  for (let i = 0; i < O.flowers; i++) {
    const x = rng.range(from + 4, to - 4);
    const z = LAIR.beeZ + rng.range(-O.halfWidth + 4, O.halfWidth - 4);
    const stemHeight = rng.range(1, 1.8);
    const stem = new THREE.CylinderGeometry(0.06, 0.06, stemHeight, 4);
    stem.translate(x, stemHeight / 2, z);
    parts.push(paint(stem, OP.grassDark));
    const head = new THREE.SphereGeometry(rng.range(0.3, 0.5), 6, 5);
    head.scale(1, 0.6, 1);
    head.translate(x, stemHeight, z);
    parts.push(paint(head, OP.petals[i % OP.petals.length]));
  }

  const meadow = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
  meadow.receiveShadow = true;
  group.add(meadow);
  for (const geo of parts) {
    geo.dispose();
  }

  // ---- the sky ------------------------------------------------------------
  //
  // A wall of daylight standing out past the grass. The level's own lighting
  // is a cave's, so without this the happiest meadow in the world is played
  // against a dark purple void.
  // A dome of it, not a wall.
  //
  // The opening shot looks *at* the cave, so a backdrop standing at the far
  // end of the meadow is behind the camera and does nothing at all; what needs
  // covering is everything above and around the cliff. Unlit and unfogged, so
  // it stays daylight whichever way the level's own cave lighting points.
  const sky = new THREE.SphereGeometry(O.skyRadius, 24, 16);
  sky.translate(LAIR.mouthX - O.depth * 0.4, 0, LAIR.beeZ);
  const skyMesh = new THREE.Mesh(
    sky,
    new THREE.MeshBasicMaterial({
      color: OP.sky,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  // Behind everything else out here.
  skyMesh.renderOrder = -3;
  group.add(skyMesh);

  // ---- butterflies --------------------------------------------------------
  //
  // Two wings and a body apiece, wandering on their own clocks. Nothing here
  // is simulated: each one is a pair of sine waves with a different rate, which
  // is enough to look like it hasn't decided where it is going.
  const flyers = Array.from({length: O.butterflies}, (_, i) => {
    const wingColour = OP.wings[i % OP.wings.length];
    const body = new THREE.Group();

    const trunk = new THREE.CylinderGeometry(0.07, 0.05, 0.5, 5);
    trunk.rotateX(Math.PI / 2);
    body.add(new THREE.Mesh(paint(trunk, 0x3a2a1c), vertexToon()));

    // A wing is two triangles, big one forward: near enough a butterfly at
    // this size, and it silhouettes properly against the sky.
    const wingShape = (side: 1 | -1): THREE.Mesh => {
      const w = O.wingSize;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(side * w, w * 0.9);
      shape.lineTo(side * w * 1.1, -w * 0.2);
      shape.lineTo(side * w * 0.5, -w * 0.85);
      shape.lineTo(0, 0);
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        paint(geo, wingColour),
        new THREE.MeshToonMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        }),
      );
      return mesh;
    };
    const left = wingShape(-1);
    const right = wingShape(1);
    body.add(left, right);
    group.add(body);

    return {
      body,
      left,
      right,
      // Where it wanders around, and how fast it goes round.
      centreX: rng.range(from + 12, to - 12),
      centreZ: LAIR.beeZ + rng.range(-O.halfWidth * 0.5, O.halfWidth * 0.5),
      radiusX: rng.range(O.roam * 0.5, O.roam),
      radiusZ: rng.range(O.roam * 0.5, O.roam),
      rateX: rng.range(0.6, 1.1) * O.roamRate,
      rateZ: rng.range(0.6, 1.1) * O.roamRate,
      rateY: rng.range(0.8, 1.6),
      phaseX: rng.range(0, Math.PI * 2),
      phaseZ: rng.range(0, Math.PI * 2),
      phaseY: rng.range(0, Math.PI * 2),
      beat: rng.range(0.85, 1.2),
      prev: new THREE.Vector3(),
    };
  });

  const here = new THREE.Vector3();
  return {
    group,
    update(elapsed) {
      for (const f of flyers) {
        here.set(
          f.centreX + Math.sin(elapsed * f.rateX + f.phaseX) * f.radiusX,
          O.flyLow +
            ((Math.sin(elapsed * f.rateY + f.phaseY) + 1) / 2) *
              (O.flyHigh - O.flyLow),
          f.centreZ + Math.cos(elapsed * f.rateZ + f.phaseZ) * f.radiusZ,
        );
        // Facing the way it is going, worked out from where it was — a
        // butterfly that slides sideways reads as a leaf on a wire.
        if (f.prev.lengthSq() > 0) {
          const dx = here.x - f.prev.x;
          const dz = here.z - f.prev.z;
          if (dx * dx + dz * dz > 1e-8) {
            f.body.rotation.y = Math.atan2(dx, dz);
          }
        }
        f.prev.copy(here);
        f.body.position.copy(here);
        // Wings up and down about the body's own line.
        const flap = Math.sin(elapsed * O.wingBeat * f.beat) * 0.9;
        f.left.rotation.z = -flap;
        f.right.rotation.z = flap;
      }
    },
    dispose() {
      group.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
    },
  };
}
