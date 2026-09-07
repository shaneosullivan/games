import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {TRACK, WORLD} from "../config";
import {flatVertex, LAYER, paint} from "../render/sprites";

/**
 * The circuit.
 *
 * One curve through the hand-placed corners, and everything else is measured
 * off it: the tarmac is a ribbon sampled along it, the kerbs are two more, the
 * rivals drive it, and how far round the lap you are is your distance along
 * it. That is the whole reason the track is a curve and not a picture — a
 * picture cannot tell you whether you are on it, and this can.
 */
export class Track {
  readonly group = new THREE.Group();
  readonly curve: THREE.CatmullRomCurve3;
  /** How long a lap is, in units. */
  readonly length: number;

  /** The sampled centre line, and the sideways direction at each sample. Both
   *  are what `nearest` searches and what the ribbons are built from. */
  private readonly points: Array<THREE.Vector3> = [];
  private readonly sides: Array<THREE.Vector3> = [];

  private readonly tmp = new THREE.Vector3();

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(
      TRACK.shape.map(p => new THREE.Vector3(p.x, 0, p.z)),
      true,
      "catmullrom",
      0.5,
    );
    this.length = this.curve.getLength();

    for (let i = 0; i < TRACK.segments; i++) {
      const t = i / TRACK.segments;
      const p = this.curve.getPointAt(t);
      const d = this.curve.getTangentAt(t);
      this.points.push(p);
      // Ninety degrees round, in the ground plane: the tangent crossed with up.
      this.sides.push(new THREE.Vector3(-d.z, 0, d.x).normalize());
    }

    this.group.add(
      this.ribbon(-TRACK.half, TRACK.half, WORLD.tarmac, LAYER.tarmac),
    );
    this.group.add(this.kerbs());
    this.group.add(this.barriers());
    this.group.add(this.startLine());
  }

  /** Where the centre line is at this fraction of a lap. */
  pointAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.curve.getPointAt(wrap(t)));
  }

  /** Which way the track is going at this fraction of a lap. */
  tangentAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.curve.getTangentAt(wrap(t)));
  }

  /** The sideways direction at this fraction of a lap, for lining cars up. */
  sideAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    this.tangentAt(t, out);
    return out.set(-out.z, 0, out.x).normalize();
  }

  /**
   * Where a point is on the circuit: how far round, and how far off the middle.
   *
   * Searched from a hint rather than from scratch. A car moves a couple of
   * units a step and the samples are a few units apart, so the answer is
   * always within a handful of the last one — checking the whole nine hundred
   * every step for every car would be most of the frame for no benefit. The
   * window is wide enough to cope with a car being put back on the grid.
   */
  nearest(
    x: number,
    z: number,
    hint: number,
    window = 40,
  ): {index: number; t: number; offset: number} {
    let best = hint;
    let bestDist = Infinity;
    for (let k = -window; k <= window; k++) {
      const i =
        (((hint + k) % TRACK.segments) + TRACK.segments) % TRACK.segments;
      const p = this.points[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    // Which side of the line, and how far: the offset along the sideways
    // direction, signed, so a car knows whether it is running wide left or
    // wide right.
    const p = this.points[best];
    const s = this.sides[best];
    const offset = (x - p.x) * s.x + (z - p.z) * s.z;
    return {index: best, t: best / TRACK.segments, offset};
  }

  /** Is this far off the middle still on the tarmac? */
  onTarmac(offset: number): boolean {
    return Math.abs(offset) <= TRACK.half;
  }

  /** And how far off the middle the barrier is. */
  static get limit(): number {
    return TRACK.half + TRACK.grass;
  }

  /**
   * A ribbon of a given width, offset sideways from the centre line.
   *
   * `from` and `to` are distances off the middle, so the tarmac is (0, half),
   * a kerb is (half, half + 5) and so on. One geometry, one draw call, for a
   * kilometre of road.
   */
  private ribbon(
    from: number,
    to: number,
    colour: number,
    height: number,
    stripe?: {other: number; every: number},
  ): THREE.Mesh {
    const verts: Array<number> = [];
    const colours: Array<number> = [];
    /* Constructed, not converted — see the note in paint(). */
    const a = new THREE.Color(colour);
    const b = new THREE.Color(stripe?.other ?? colour);

    for (let i = 0; i < TRACK.segments; i++) {
      const j = (i + 1) % TRACK.segments;
      const p0 = this.points[i];
      const p1 = this.points[j];
      const s0 = this.sides[i];
      const s1 = this.sides[j];

      const push = (p: THREE.Vector3, s: THREE.Vector3, off: number): void => {
        verts.push(p.x + s.x * off, height, p.z + s.z * off);
      };
      // Two triangles a segment, wound so they face up.
      push(p0, s0, from);
      push(p1, s1, from);
      push(p1, s1, to);
      push(p0, s0, from);
      push(p1, s1, to);
      push(p0, s0, to);

      const c = stripe && Math.floor(i / stripe.every) % 2 === 1 ? b : a;
      for (let v = 0; v < 6; v++) {
        colours.push(c.r, c.g, c.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    const mesh = new THREE.Mesh(geo, flatVertex());
    // The ribbon wraps the whole circuit, so it is on screen whatever the
    // camera is looking at and there is nothing for culling to save.
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Red and white, both sides, the way every circuit in the world does it. */
  private kerbs(): THREE.Mesh {
    const w = 5;
    const stripe = {other: WORLD.kerbWhite, every: 6};
    return mergeMeshes([
      this.ribbon(
        TRACK.half,
        TRACK.half + w,
        WORLD.kerbRed,
        LAYER.kerb,
        stripe,
      ),
      this.ribbon(
        -TRACK.half - w,
        -TRACK.half,
        WORLD.kerbRed,
        LAYER.kerb,
        stripe,
      ),
    ]);
  }

  /**
   * The wall at the edge of the grass.
   *
   * The plan says you can go on the grass "but no farther", so there has to be
   * something there saying so. A band of sand first — the run-off — and then
   * the barrier itself, which is what the car is actually stopped by.
   */
  private barriers(): THREE.Mesh {
    const limit = Track.limit;
    const stripe = {other: WORLD.kerbWhite, every: 3};
    return mergeMeshes([
      this.ribbon(limit - 10, limit, WORLD.sand, LAYER.sand),
      this.ribbon(limit, limit + 7, WORLD.kerbRed, LAYER.kerb, stripe),
      this.ribbon(-limit, -limit + 10, WORLD.sand, LAYER.sand),
      this.ribbon(-limit - 7, -limit, WORLD.kerbRed, LAYER.kerb, stripe),
    ]);
  }

  /** The chequered line you start on and finish on. */
  private startLine(): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    const i = Math.floor(TRACK.startAt * TRACK.segments);
    const p = this.points[i];
    const s = this.sides[i];
    const d = this.curve.getTangentAt(TRACK.startAt);
    const squares = 14;
    const size = (TRACK.half * 2) / squares;

    for (let k = 0; k < squares; k++) {
      for (let row = 0; row < 2; row++) {
        const off = -TRACK.half + (k + 0.5) * size;
        const along = (row - 0.5) * size;
        const geo = new THREE.PlaneGeometry(size, size);
        geo.rotateX(-Math.PI / 2);
        geo.rotateY(Math.atan2(d.x, d.z));
        geo.translate(
          p.x + s.x * off + d.x * along,
          LAYER.paint,
          p.z + s.z * off + d.z * along,
        );
        parts.push(
          paint(geo, (k + row) % 2 === 0 ? WORLD.line : WORLD.tarmacDark),
        );
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), flatVertex());
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Where the grid sits: a fraction of a lap back from the line. */
  gridAt(slot: number, offset: number, out: THREE.Vector3): number {
    const t = wrap(TRACK.startAt - 0.006 - slot * 0.006);
    this.pointAt(t, out);
    this.sideAt(t, this.tmp);
    out.addScaledVector(this.tmp, offset);
    return t;
  }
}

/** 0..1, wrapping, so a lap can be counted past the end of the curve. */
export function wrap(t: number): number {
  return ((t % 1) + 1) % 1;
}

/** One mesh out of several, so a pile of ribbons is a single draw call. */
function mergeMeshes(meshes: Array<THREE.Mesh>): THREE.Mesh {
  const merged = mergeGeometries(
    meshes.map(m => m.geometry as THREE.BufferGeometry),
    false,
  );
  const mesh = new THREE.Mesh(merged, flatVertex());
  mesh.frustumCulled = false;
  return mesh;
}
