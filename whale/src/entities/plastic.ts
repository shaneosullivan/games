import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {JUNK, REEF, WHALE} from "../config";
import {Rng} from "../core/rng";
import {paint, toonRamp} from "../render/materials";

const TAU = Math.PI * 2;

interface Piece {
  position: THREE.Vector3;
  drift: THREE.Vector3;
  spin: THREE.Vector3;
  turn: THREE.Euler;
  kind: number;
}

/**
 * The rubbish.
 *
 * Bottles, bags and six-pack rings, drifting slowly through the reef. Touching
 * one with your mouth ends the run — it is the only way to lose, and the card
 * that follows is friendly about it.
 *
 * Deliberately readable at a distance: pale, hard-edged and see-through, so it
 * never reads as a fish. A child should be able to tell "don't eat that" from
 * far enough away to swim round it, and that is a look, not a warning label.
 *
 * One InstancedMesh a kind, three kinds. They tumble as they drift, which is
 * the other half of telling them from fish: a fish points where it is going
 * and rubbish points nowhere.
 */
export class Plastic {
  readonly group = new THREE.Group();

  private readonly pieces: Array<Piece> = [];
  private readonly meshes: Array<THREE.InstancedMesh> = [];
  /** Which slot of its kind's mesh each piece occupies. */
  private readonly slot: Array<number> = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    rng: Rng,
    floorAt: (x: number, z: number) => number,
    finishZ: number,
  ) {
    const kinds = [bottle(), bag(), rings()];
    const counts = [0, 0, 0];

    for (let i = 0; i < JUNK.count; i++) {
      // Spread down the reef, and nothing in the first stretch: a child should
      // get a swim and a few mouthfuls of fish before the first thing that can
      // end the run.
      const along = (i + 0.5) / JUNK.count;
      const z = -JUNK.clearStart + (finishZ + JUNK.clearStart - 60) * along;
      const x = rng.range(-REEF.halfWidth * 0.85, REEF.halfWidth * 0.85);
      const floor = floorAt(x, z);
      const kind = i % kinds.length;
      this.pieces.push({
        position: new THREE.Vector3(
          x,
          rng.range(-10, Math.min(-20, floor + 14)),
          z,
        ),
        drift: new THREE.Vector3(
          rng.range(-1, 1),
          rng.range(-0.25, 0.25),
          rng.range(-1, 1),
        )
          .normalize()
          .multiplyScalar(JUNK.drift * rng.range(0.5, 1)),
        spin: new THREE.Vector3(
          rng.range(-1, 1),
          rng.range(-1, 1),
          rng.range(-1, 1),
        ).multiplyScalar(JUNK.tumble),
        turn: new THREE.Euler(
          rng.range(0, TAU),
          rng.range(0, TAU),
          rng.range(0, TAU),
        ),
        kind,
      });
      this.slot.push(counts[kind]);
      counts[kind]++;
    }

    // Translucent and unlit-ish: plastic in water is a pale ghost of a thing,
    // and toon shading it like coral would make it look like part of the reef.
    for (let k = 0; k < kinds.length; k++) {
      const mesh = new THREE.InstancedMesh(
        kinds[k],
        new THREE.MeshToonMaterial({
          vertexColors: true,
          gradientMap: toonRamp(),
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
        Math.max(1, counts[k]),
      );
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.draw();
  }

  /**
   * Drift and tumble, and say whether the whale has just taken a mouthful.
   *
   * The piece is left where it is: it is not eaten, it is bumped into, and the
   * run is about to start again anyway.
   */
  update(dt: number, mouth: THREE.Vector3): boolean {
    const bite = WHALE.mouthRadius + JUNK.size * 0.5;
    const biteSq = bite * bite;
    let hit = false;

    for (const p of this.pieces) {
      p.position.addScaledVector(p.drift, dt);
      // Kept in the lane and off the surface, by turning the drift round
      // rather than by clamping — a piece pinned against an invisible wall
      // looks broken.
      if (Math.abs(p.position.x) > REEF.halfWidth) {
        p.drift.x = -p.drift.x;
      }
      if (p.position.y > -8 || p.position.y < -90) {
        p.drift.y = -p.drift.y;
      }
      p.turn.x += p.spin.x * dt;
      p.turn.y += p.spin.y * dt;
      p.turn.z += p.spin.z * dt;

      if (p.position.distanceToSquared(mouth) < biteSq) {
        hit = true;
      }
    }
    this.draw();
    return hit;
  }

  private draw(): void {
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      this.q.setFromEuler(p.turn);
      this.m.compose(p.position, this.q, this.one);
      this.meshes[p.kind].setMatrixAt(this.slot[i], this.m);
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

const CLEAR = 0xd8f2ee;
const CAP = 0x9fd8e8;

/** A drinks bottle: body, neck, cap. */
function bottle(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.CylinderGeometry(1.5, 1.7, 5, 9);
  parts.push(paint(body, CLEAR));
  const neck = new THREE.CylinderGeometry(0.7, 1.4, 1.6, 9);
  neck.translate(0, 3.2, 0);
  parts.push(paint(neck, CLEAR));
  const cap = new THREE.CylinderGeometry(0.85, 0.85, 0.9, 9);
  cap.translate(0, 4.4, 0);
  parts.push(paint(cap, CAP));
  // Ribs round the middle, so it catches the light as it turns over.
  for (let i = 0; i < 2; i++) {
    const rib = new THREE.TorusGeometry(1.6, 0.14, 5, 12);
    rib.rotateX(Math.PI / 2);
    rib.translate(0, -0.8 + i * 1.4, 0);
    parts.push(paint(rib, CAP));
  }
  return mergeGeometries(parts, false);
}

/** A carrier bag: a limp sheet with two handles. Belugas eat these; that is
 *  the whole reason this game has plastic in it. */
function bag(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const sack = new THREE.SphereGeometry(2.6, 10, 8);
  sack.scale(1, 1.15, 0.55);
  parts.push(paint(sack, CLEAR));
  for (const side of [-1, 1]) {
    const handle = new THREE.TorusGeometry(1.1, 0.2, 5, 12, Math.PI);
    handle.translate(side * 1.1, 2.6, 0);
    parts.push(paint(handle, CLEAR));
  }
  return mergeGeometries(parts, false);
}

/** A six-pack ring: two rows of loops. */
function rings(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const ring = new THREE.TorusGeometry(0.95, 0.16, 5, 12);
      ring.rotateX(Math.PI / 2);
      ring.translate((c - 1) * 2, 0, (r - 0.5) * 2);
      parts.push(paint(ring, CAP));
    }
  }
  return mergeGeometries(parts, false);
}
