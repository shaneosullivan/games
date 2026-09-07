import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ITEM} from "../config";
import {flatVertex, LAYER, order, paint, tile} from "../render/sprites";
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
export class Patches {
  readonly group = new THREE.Group();

  private readonly xs: Array<number> = [];
  private readonly zs: Array<number> = [];
  private readonly kinds: Array<ItemKind> = [];

  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  constructor(track: Track, items: ReadonlyArray<TrackItem>) {
    const parts: Array<THREE.BufferGeometry> = [];

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
      parts.push(...draw(item.kind, x, z, yaw));
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

  /** What, if anything, is under this point. */
  at(x: number, z: number): ItemKind | null {
    const r2 = ITEM.radius * ITEM.radius;
    for (let i = 0; i < this.xs.length; i++) {
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
  yaw: number,
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
    gloss.translate(x + r * 0.3, LAYER.paint + 0.01, z - r * 0.22);
    parts.push(paint(gloss, ITEM.oil.rim));
    return parts;
  }

  if (kind === "mud") {
    const parts: Array<THREE.BufferGeometry> = [];
    parts.push(rim(x, z, r, ITEM.mud.rim));
    // Ragged: three overlapping circles rather than one, which is the
    // difference between a puddle and a full stop painted on the road.
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

  // A ramp: a board laid across the way you are going, with three chevrons on
  // it pointing down the road.
  const parts: Array<THREE.BufferGeometry> = [];
  const board = tile(r * 2, r * 1.5, ITEM.ramp.colour);
  board.rotateY(yaw);
  board.translate(x, LAYER.paint, z);
  parts.push(board);
  for (let k = 0; k < 3; k++) {
    const bar = tile(r * 1.7, r * 0.22, ITEM.ramp.stripe);
    bar.translate(0, 0.01, (k - 1) * r * 0.45);
    bar.rotateY(yaw);
    bar.translate(x, LAYER.paint, z);
    parts.push(bar);
  }
  return parts;
}
