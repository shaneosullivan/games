import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ITEM} from "../config";
import {flatVertex, LAYER, order, paint} from "../render/sprites";
import {instance} from "../models";
import {ramp} from "../models/props";
import {ItemKind, TrackItem} from "../track/spec";
import {Track} from "./track";

/**
 * The things a child drops on their own track: oil, mud and ramps.
 *
 * Each one is stored against the circuit — how far round the lap, and how far
 * off the middle — so it is on the road by construction. This turns those into
 * world positions once, draws them all as one merged mesh, and answers the one
 * question the car ever asks: what am I standing on?
 *
 * The lookup is a linear scan, and deliberately. A hand-drawn track has a
 * handful of these on it, not a thousand, and a scan of a handful is faster
 * than any structure that would replace it — as well as being a tenth of the
 * code to be wrong.
 */
const UP = new THREE.Vector3(0, 1, 0);

export class Patches {
  readonly group = new THREE.Group();

  private readonly xs: Array<number> = [];
  private readonly zs: Array<number> = [];
  private readonly kinds: Array<ItemKind> = [];
  /** Which way each ramp faces. Only ramps have one, and the car needs it to
   *  work out how far up the slope it is. */
  private readonly yaws: Array<number> = [];

  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  constructor(track: Track, items: ReadonlyArray<TrackItem>) {
    const parts: Array<THREE.BufferGeometry> = [];
    const ramps: Array<{x: number; z: number; yaw: number}> = [];

    for (const item of items) {
      track.pointAt(item.t, this.p);
      track.sideAt(item.t, this.s);
      track.tangentAt(item.t, this.d);
      const x = this.p.x + this.s.x * item.across;
      const z = this.p.z + this.s.z * item.across;

      this.xs.push(x);
      this.zs.push(z);
      this.kinds.push(item.kind);

      const yaw = Math.atan2(this.d.x, this.d.z);
      this.yaws.push(yaw);
      if (item.kind === "ramp") {
        ramps.push({x, z, yaw});
      } else {
        parts.push(...draw(item.kind, x, z));
      }
    }

    // The ramps are solid, so they are their own instanced meshes rather than
    // more paint on the road.
    if (ramps.length > 0) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const one = new THREE.Vector3(1, 1, 1);
      for (const mesh of instance(ramp(), ramps.length)) {
        ramps.forEach((at, i) => {
          q.setFromAxisAngle(UP, at.yaw);
          m.compose(pos.set(at.x, 0, at.z), q, one);
          mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.group.add(mesh);
      }
    }

    if (parts.length > 0) {
      const mesh = new THREE.Mesh(mergeGeometries(parts, false), flatVertex());
      // Over the paint of the start line, under the rubber laid on top of it.
      mesh.renderOrder = order(LAYER.paint) + 1;
      // A drawn track can put these anywhere, and there are few enough of them
      // that culling would cost more than it saved.
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /**
   * Which ramp is under this point, or -1.
   *
   * The car needs more than the kind for a ramp: it takes off level with the
   * middle of one, so it has to know where the middle is.
   */
  rampAt(x: number, z: number): number {
    for (let i = 0; i < this.xs.length; i++) {
      if (this.kinds[i] === "ramp" && this.onRamp(i, x, z)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Whether a point is on ramp `i`, as a rectangle in the ramp's own axes.
   *
   * The oil and the mud are circles because they are painted circles. A ramp
   * is a wedge with square corners, and testing it as a circle was wrong in a
   * way that showed: the two front wheels crossed the edge of the circle a few
   * frames apart however square the car hit it, so the car read one wheel on
   * and one off — a lopsided take-off — and almost every jump came out as a
   * roll.
   */
  private onRamp(i: number, x: number, z: number): boolean {
    const yaw = this.yaws[i];
    const dx = x - this.xs[i];
    const dz = z - this.zs[i];
    const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const across = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    return (
      Math.abs(along) <= ITEM.ramp.long / 2 &&
      Math.abs(across) <= ITEM.ramp.wide / 2
    );
  }

  centreX(i: number): number {
    return this.xs[i];
  }

  centreZ(i: number): number {
    return this.zs[i];
  }

  /** Which way a ramp faces, for working out how far up it the car is. */
  yawOf(i: number): number {
    return this.yaws[i];
  }

  /** What, if anything, is under this point. */
  at(x: number, z: number): ItemKind | null {
    const r2 = ITEM.radius * ITEM.radius;
    for (let i = 0; i < this.xs.length; i++) {
      if (this.kinds[i] === "ramp") {
        if (this.onRamp(i, x, z)) {
          return "ramp";
        }
        continue;
      }
      const dx = this.xs[i] - x;
      const dz = this.zs[i] - z;
      if (dx * dx + dz * dz <= r2) {
        return this.kinds[i];
      }
    }
    return null;
  }
}

/** The ring a patch sits on, so it is visible against any colour of road. */
function rim(
  x: number,
  z: number,
  r: number,
  colour: number,
): THREE.BufferGeometry {
  const ring = new THREE.CircleGeometry(r * 1.16, 20);
  ring.rotateX(-Math.PI / 2);
  ring.translate(x, LAYER.paint, z);
  return paint(ring, colour);
}

/**
 * What each one looks like from straight above.
 *
 * All three have to be readable at a glance and at speed, so each is a
 * different *shape* and not merely a different colour: oil is a round black
 * slick, mud is a ragged brown pool, and a ramp is a yellow board with
 * chevrons pointing the way you are going. A child glancing down at the road
 * has about a fifth of a second to decide, and colour alone is not enough.
 */
function draw(
  kind: ItemKind,
  x: number,
  z: number,
): Array<THREE.BufferGeometry> {
  const r = ITEM.radius;

  if (kind === "oil") {
    const parts: Array<THREE.BufferGeometry> = [];
    parts.push(rim(x, z, r, ITEM.oil.rim));
    const blob = new THREE.CircleGeometry(r, 18);
    blob.rotateX(-Math.PI / 2);
    blob.translate(x, LAYER.paint + 0.01, z);
    parts.push(paint(blob, ITEM.oil.colour));
    // A smaller disc offset inside it, so the slick has a shape rather than
    // being a perfect circle nobody would mistake for a spill.
    const gloss = new THREE.CircleGeometry(r * 0.55, 12);
    gloss.rotateX(-Math.PI / 2);
    gloss.translate(x + r * 0.3, LAYER.paint + 0.02, z - r * 0.22);
    parts.push(paint(gloss, ITEM.oil.rim));
    return parts;
  }

  // Mud. Ragged: three overlapping circles rather than one, which is the
  // difference between a puddle and a full stop painted on the road.
  const parts: Array<THREE.BufferGeometry> = [];
  parts.push(rim(x, z, r, ITEM.mud.rim));
  const spots: Array<[number, number, number]> = [
    [0, 0, 1],
    [r * 0.5, r * 0.4, 0.66],
    [-r * 0.55, -r * 0.3, 0.6],
  ];
  for (const [dx, dz, scale] of spots) {
    const blob = new THREE.CircleGeometry(r * scale, 10);
    blob.rotateX(-Math.PI / 2);
    blob.translate(x + dx, LAYER.paint + 0.01, z + dz);
    parts.push(paint(blob, ITEM.mud.colour));
  }
  return parts;
}
