import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {NET} from "../config";
import {paint, vertexToon} from "../render/materials";

/** One link between two points of cloth, held at a fixed length. */
interface Link {
  readonly a: number;
  readonly b: number;
  readonly rest: number;
}

/**
 * The safety net at the end of the valley: a square of real cloth slung
 * between four raked legs.
 *
 * The cloth is a Verlet grid — every point remembers where it was last step
 * rather than carrying a velocity, gravity moves them all, and then the links
 * between them are pulled back to length a few times over. It is the oldest
 * cloth model there is and it is the right one here: it cannot explode, it
 * needs no matrices, and the whole thing is about forty lines.
 *
 * The edge points are pinned to the frame and never move. Everything inside
 * is free, so the sheet sags under its own weight before anything touches it,
 * and when the squirrel arrives the dent it makes travels out to the corners
 * and comes back.
 */
export class Net {
  readonly group = new THREE.Group();
  /** The middle of the cloth at rest, which is what to aim at. */
  readonly at = new THREE.Vector3();

  private readonly points: Array<THREE.Vector3> = [];
  private readonly was: Array<THREE.Vector3> = [];
  private readonly pinned: Array<boolean> = [];
  private readonly links: Array<Link> = [];
  private readonly cloth: THREE.LineSegments;
  private readonly positions: Float32Array;
  /** The pairs of points that get a cord drawn between them: the weave only,
   *  not the shear and bend links, which are structure rather than rope. */
  private readonly cords: Array<number> = [];
  private readonly n = NET.grid + 1;

  constructor(centre: THREE.Vector3) {
    this.at.copy(centre);

    const step = NET.size / NET.grid;
    const half = NET.size / 2;
    for (let row = 0; row <= NET.grid; row++) {
      for (let col = 0; col <= NET.grid; col++) {
        const p = new THREE.Vector3(
          centre.x - half + col * step,
          centre.y,
          centre.z - half + row * step,
        );
        this.points.push(p);
        this.was.push(p.clone());
        // The rim is bolted to the frame. Everything inside is cloth.
        this.pinned.push(
          row === 0 || col === 0 || row === NET.grid || col === NET.grid,
        );
      }
    }

    // Structural links along the weave, shear links across each square so it
    // cannot fold flat, and bend links two apart so it resists creasing.
    const add = (a: number, b: number): void => {
      this.links.push({
        a,
        b,
        rest: this.points[a].distanceTo(this.points[b]) * NET.slack,
      });
    };
    for (let row = 0; row <= NET.grid; row++) {
      for (let col = 0; col <= NET.grid; col++) {
        const i = row * this.n + col;
        if (col < NET.grid) {
          add(i, i + 1);
        }
        if (row < NET.grid) {
          add(i, i + this.n);
        }
        if (col < NET.grid && row < NET.grid) {
          add(i, i + this.n + 1);
          add(i + 1, i + this.n);
        }
        if (col < NET.grid - 1) {
          add(i, i + 2);
        }
        if (row < NET.grid - 1) {
          add(i, i + this.n * 2);
        }
      }
    }

    // The net, drawn as its cords with the holes left open.
    //
    // It was a solid sheet, and a solid sheet is a tarpaulin: it hid its own
    // movement, because a flat surface with no features on it looks the same
    // whatever shape it is. Drawing the weave means every sag and every wave
    // is visible as the grid distorting, which is the whole reason for
    // simulating it.
    for (let row = 0; row <= NET.grid; row++) {
      for (let col = 0; col <= NET.grid; col++) {
        const i = row * this.n + col;
        if (col < NET.grid) {
          this.cords.push(i, i + 1);
        }
        if (row < NET.grid) {
          this.cords.push(i, i + this.n);
        }
      }
    }

    this.positions = new Float32Array(this.cords.length * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    // It moves every frame, so a bounding sphere fitted once is a lie.
    geometry.boundingSphere = new THREE.Sphere(centre.clone(), NET.size * 1.5);

    this.cloth = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({color: NET.cordColour, fog: false}),
    );
    this.cloth.frustumCulled = false;
    this.group.add(this.cloth);

    this.group.add(new THREE.Mesh(frameShape(centre), vertexToon()));
    this.write();
  }

  /**
   * One step of cloth.
   *
   * Verlet: the move a point made last step is the move it makes again, minus
   * a little damping, plus whatever gravity did. Then the links are pulled
   * back to length several times over, which is what makes it behave like
   * fabric rather than like a bag of independent beads.
   */
  update(dt: number): void {
    for (let i = 0; i < this.points.length; i++) {
      if (this.pinned[i]) {
        continue;
      }
      const p = this.points[i];
      const w = this.was[i];
      const vx = (p.x - w.x) * NET.damping;
      const vy = (p.y - w.y) * NET.damping;
      const vz = (p.z - w.z) * NET.damping;
      w.copy(p);
      p.x += vx;
      p.y += vy - NET.gravity * dt * dt;
      p.z += vz;
    }

    for (let pass = 0; pass < NET.relax; pass++) {
      for (const link of this.links) {
        const a = this.points[link.a];
        const b = this.points[link.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 1e-6) {
          continue;
        }
        // Only ever pulled in, never pushed apart: cloth takes tension and
        // does nothing at all in compression, which is why it drapes.
        if (d <= link.rest) {
          continue;
        }
        const pull = (d - link.rest) / d / 2;
        const ax = dx * pull;
        const ay = dy * pull;
        const az = dz * pull;
        if (!this.pinned[link.a]) {
          a.x += ax;
          a.y += ay;
          a.z += az;
        }
        if (!this.pinned[link.b]) {
          b.x -= ax;
          b.y -= ay;
          b.z -= az;
        }
      }
    }

    this.write();
  }

  /**
   * The squirrel shoving into the cloth.
   *
   * A push, not a placement. `force` is how far to move the cloth this step,
   * strongest under the squirrel and fading to nothing at the edge of the
   * dent — in Verlet a moved point *is* a moving point, so this arrives as
   * momentum and the links then argue with it. That is what makes the sheet
   * take the blow, throw a wave out to the corners and come back.
   *
   * See NET.press for why this is not allowed to be "sit this far below the
   * squirrel": the squirrel is being told to sit just above the cloth, and the
   * two rules together are a loop that sinks both of them through the floor.
   */
  press(at: THREE.Vector3, force: number): void {
    if (force <= 0) {
      return;
    }
    for (let i = 0; i < this.points.length; i++) {
      if (this.pinned[i]) {
        continue;
      }
      const p = this.points[i];
      const away = Math.hypot(p.x - at.x, p.z - at.z);
      if (away > NET.dent) {
        continue;
      }
      const bite = 1 - away / NET.dent;
      p.y -= force * bite * bite;
    }
  }

  /** Is this point over the mouth of the net? */
  covers(x: number, z: number): boolean {
    const half = NET.size / 2;
    return (
      Math.abs(x - this.at.x) < half - 2 && Math.abs(z - this.at.z) < half - 2
    );
  }

  /** How high the cloth is under a point, so the squirrel can rest on it. */
  heightAt(x: number, z: number): number {
    const half = NET.size / 2;
    const step = NET.size / NET.grid;
    const col = Math.round((x - (this.at.x - half)) / step);
    const row = Math.round((z - (this.at.z - half)) / step);
    const i =
      Math.max(0, Math.min(NET.grid, row)) * this.n +
      Math.max(0, Math.min(NET.grid, col));
    return this.points[i].y;
  }

  /** Copy the simulation into the cords the renderer draws. */
  private write(): void {
    for (let c = 0; c < this.cords.length; c++) {
      const p = this.points[this.cords[c]];
      this.positions[c * 3] = p.x;
      this.positions[c * 3 + 1] = p.y;
      this.positions[c * 3 + 2] = p.z;
    }
    this.cloth.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * The frame: a rim round the cloth and four legs raked out to the ground.
 *
 * Splayed rather than upright, because four vertical posts read as a table and
 * a thing you are meant to fall into should look like it is bracing for you.
 */
function frameShape(centre: THREE.Vector3): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const half = NET.size / 2;

  // The rim, four rails laid along the edges of the cloth.
  for (const along of [true, false]) {
    for (const side of [-1, 1]) {
      const rail = new THREE.BoxGeometry(
        along ? NET.size + 4 : 2.6,
        2.6,
        along ? 2.6 : NET.size + 4,
      );
      rail.translate(
        centre.x + (along ? 0 : side * half),
        centre.y,
        centre.z + (along ? side * half : 0),
      );
      parts.push(paint(rail, NET.rimColour));
    }
  }

  // The legs. Each runs from a corner of the rim down and outward to a foot,
  // which is what "raked" means and why it does not need cross-bracing to look
  // like it would stand up.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const top = new THREE.Vector3(
        centre.x + sx * half,
        centre.y,
        centre.z + sz * half,
      );
      const foot = new THREE.Vector3(
        top.x + sx * NET.legSplay,
        centre.y - NET.legHeight,
        top.z + sz * NET.legSplay,
      );
      parts.push(paint(strut(top, foot, NET.legRadius), NET.legColour));
      // A stubby foot, so it does not end in a point in the grass.
      const pad = new THREE.CylinderGeometry(
        NET.legRadius * 2,
        NET.legRadius * 2.2,
        2.4,
        8,
      );
      pad.translate(foot.x, foot.y, foot.z);
      parts.push(paint(pad, NET.legColour));
    }
  }

  const merged = mergeGeometries(parts);
  if (!merged) {
    throw new Error("could not merge the net frame");
  }
  return merged;
}

/** A cylinder running between two points, for the raked legs. */
function strut(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
): THREE.BufferGeometry {
  const along = new THREE.Vector3().subVectors(to, from);
  const geo = new THREE.CylinderGeometry(
    radius,
    radius * 1.15,
    along.length(),
    8,
  );
  // Cylinders are built up the Y axis; turn it to lie along the leg.
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    along.clone().normalize(),
  );
  geo.applyQuaternion(q);
  geo.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geo;
}
