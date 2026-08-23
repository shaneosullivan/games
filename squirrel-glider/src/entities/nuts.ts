import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {NUTS} from "../config";
import {paint, vertexToon} from "../render/materials";
import {Rng} from "../core/rng";

const SHELL = 0xa9713c;
const SHELL_DARK = 0x8a5a2e;
const CAP = 0x6f4a26;

/**
 * Acorns hanging in the air down the valley, to be flown through.
 *
 * The plan asks for floating nuts, and they do a job the arches cannot: an
 * arch is a thing to aim at once, where a line of nuts is a *path* — it shows
 * a child where the good flying is before they get there, which is how you
 * teach a glide without writing any of it down.
 *
 * One instanced mesh for the lot of them, so a hundred acorns are a draw call.
 * A collected one is scaled to nothing rather than removed, since an instanced
 * mesh cannot skip an instance.
 */
export class Nuts {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly at: Array<THREE.Vector3> = [];
  private readonly taken: Array<boolean> = [];
  private readonly spin: Array<number> = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly none = new THREE.Vector3(0, 0, 0);
  private clock = 0;

  /** How many have been caught. */
  eaten = 0;

  constructor(
    private readonly rng: Rng,
    pathAt: (z: number) => number,
    roomAt: (z: number) => number,
    lineAt: (z: number) => number,
    reach: number,
  ) {
    // Strung in short lines rather than scattered: a run of them reads as a
    // route to follow, and scattered ones read as litter.
    let z = -NUTS.firstAt;
    while (z > -reach * NUTS.until) {
      const runLength = this.rng.int(NUTS.runMin, NUTS.runMax);
      const side = this.rng.range(-NUTS.sideWander, NUTS.sideWander);
      const lift = this.rng.range(-NUTS.heightWander, NUTS.heightWander);
      // Each run climbs or sinks a little across its length, so following one
      // is a small change of height as well as a turn. The turn itself is not
      // random any more: the whole run sits on the valley's flight line, which
      // leans on its own — see Terrain.ribbonAt. Runs that each wandered their
      // own way made a zigzag no glider could actually fly.
      const climb = this.rng.range(-NUTS.runClimb, NUTS.runClimb);

      for (let i = 0; i < runLength; i++) {
        const t = i / Math.max(1, runLength - 1);
        // Kept inside the walls, which move: see the same note in Gates.
        const room = Math.max(4, roomAt(z) - NUTS.wallGap);
        this.at.push(
          new THREE.Vector3(
            Math.max(-room, Math.min(room, lineAt(z) + side)),
            Math.max(NUTS.minHeight, pathAt(z) + lift + climb * t),
            z,
          ),
        );
        this.taken.push(false);
        this.spin.push(this.rng.next() * Math.PI * 2);
        z -= NUTS.spacing;
      }
      z -= this.rng.range(NUTS.gapMin, NUTS.gapMax);
    }

    this.mesh = new THREE.InstancedMesh(
      acornShape(),
      vertexToon(),
      Math.max(1, this.at.length),
    );
    // Strung the whole length of a valley, so a bounding sphere fitted to them
    // is useless for culling and only risks popping the lot out of view.
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.layOut(0);
  }

  get total(): number {
    return this.at.length;
  }

  /**
   * Anything caught on the way from `from` to `to`?
   *
   * Against the segment, not the end point: at ninety units a second an acorn
   * is something you fly past between frames, and testing where the squirrel
   * happens to be would miss most of them.
   */
  check(from: THREE.Vector3, to: THREE.Vector3): number {
    let got = 0;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const lenSq = dx * dx + dy * dy + dz * dz;

    for (let i = 0; i < this.at.length; i++) {
      if (this.taken[i]) {
        continue;
      }
      const nut = this.at[i];
      // Only the ones the step could plausibly have reached.
      if (Math.abs(nut.z - to.z) > Math.abs(dz) + NUTS.catchRadius) {
        continue;
      }
      // Nearest point on the step to the acorn.
      let t = 0;
      if (lenSq > 1e-6) {
        t =
          ((nut.x - from.x) * dx +
            (nut.y - from.y) * dy +
            (nut.z - from.z) * dz) /
          lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const ox = from.x + dx * t - nut.x;
      // Squashed in height, so the catch is a flattened ball rather than a
      // ball: height is the axis the pitch control moves you along, so height
      // is where the forgiveness belongs. See NUTS.catchHeightScale.
      const oy = (from.y + dy * t - nut.y) / NUTS.catchHeightScale;
      const oz = from.z + dz * t - nut.z;
      if (ox * ox + oy * oy + oz * oz <= NUTS.catchRadius * NUTS.catchRadius) {
        this.taken[i] = true;
        this.eaten++;
        got++;
      }
    }
    return got;
  }

  update(dt: number): void {
    this.clock += dt;
    this.layOut(this.clock);
  }

  /** Turning slowly and bobbing, so they read as hanging rather than stuck. */
  private layOut(clock: number): void {
    for (let i = 0; i < this.at.length; i++) {
      const nut = this.at[i];
      if (this.taken[i]) {
        this.m.compose(nut, this.q, this.none);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      this.e.set(0, clock * NUTS.spinRate + this.spin[i], 0);
      this.q.setFromEuler(this.e);
      this.m.compose(
        new THREE.Vector3(
          nut.x,
          nut.y + Math.sin(clock * NUTS.bobRate + this.spin[i]) * NUTS.bob,
          nut.z,
        ),
        this.q,
        this.one,
      );
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** One acorn: a nut with a little cap on it. */
function acornShape(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const body = new THREE.SphereGeometry(NUTS.size, 9, 7);
  body.scale(1, 1.25, 1);
  parts.push(paint(body, SHELL));

  const tip = new THREE.ConeGeometry(NUTS.size * 0.34, NUTS.size * 0.6, 7);
  tip.translate(0, -NUTS.size * 1.4, 0);
  parts.push(paint(tip, SHELL_DARK));

  const cap = new THREE.SphereGeometry(
    NUTS.size * 1.02,
    9,
    5,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  cap.scale(1, 0.55, 1);
  cap.translate(0, NUTS.size * 0.72, 0);
  parts.push(paint(cap, CAP));

  const stalk = new THREE.CylinderGeometry(
    NUTS.size * 0.12,
    NUTS.size * 0.12,
    NUTS.size * 0.5,
    5,
  );
  stalk.translate(0, NUTS.size * 1.2, 0);
  parts.push(paint(stalk, CAP));

  const merged = mergeGeometries(parts);
  if (!merged) {
    throw new Error("could not merge an acorn");
  }
  return merged;
}
