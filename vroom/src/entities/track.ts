import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ENVIRONMENTS, Palette, TRACK} from "../config";
import {TrackSpec} from "../track/spec";
import {flatVertex, LAYER, order, paint} from "../render/sprites";

/**
 * One place the circuit runs over itself: the earlier stretch and the later
 * one. `low`/`high` are the middle of each, and the `From`/`To` pair is how
 * far the tangle actually reaches — unwrapped, so `To` can be past the end of
 * the ring and the arithmetic still works.
 */
export interface Crossing {
  low: number;
  lowFrom: number;
  lowTo: number;
  high: number;
  highFrom: number;
  highTo: number;
}

/** How wide a kerb is. Shared, because a flyover deck has to cover the road
 *  underneath it right out to the far edge of its kerb. */
export const KERB = 5;

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
  /** Where the line is, as a fraction round the lap. It comes off the spec
   *  now: on a drawn track it is wherever the child dropped it. */
  readonly startAt: number;
  readonly palette: Palette;

  /** The sampled centre line, and the sideways direction at each sample. Both
   *  are what `nearest` searches and what the ribbons are built from. */
  private readonly points: Array<THREE.Vector3> = [];
  private readonly sides: Array<THREE.Vector3> = [];

  private readonly tmp = new THREE.Vector3();

  constructor(spec: TrackSpec) {
    this.palette = ENVIRONMENTS[spec.environment];
    this.startAt = wrap(spec.startAt);
    this.curve = new THREE.CatmullRomCurve3(
      spec.shape.map(p => new THREE.Vector3(p.x, 0, p.z)),
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
      this.ribbon(-TRACK.half, TRACK.half, this.palette.tarmac, LAYER.tarmac),
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
    // Half the ring either way already covers every sample, so a caller asking
    // for "everywhere" gets one scan of nine hundred rather than the two
    // hundred thousand wrapping iterations it literally asked for. The scenery
    // makes this call for every tree it plants, and uncapped it was a full
    // second of a child waiting to start a race.
    const span = Math.min(window, Math.ceil(TRACK.segments / 2));
    for (let k = -span; k <= span; k++) {
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
  ribbon(
    from: number,
    to: number,
    colour: number,
    height: number,
    stripe?: {other: number; every: number},
    /** Part of the circuit rather than all of it, for a flyover deck. */
    span?: {start: number; count: number},
  ): THREE.Mesh {
    const verts: Array<number> = [];
    const colours: Array<number> = [];
    /* Constructed, not converted — see the note in paint(). */
    const a = new THREE.Color(colour);
    const b = new THREE.Color(stripe?.other ?? colour);

    const start = span ? span.start : 0;
    const count = span ? span.count : TRACK.segments;
    for (let k = 0; k < count; k++) {
      const i = wrapIndex(start + k);
      const j = wrapIndex(i + 1);
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
    mesh.renderOrder = order(height);
    // The ribbon wraps the whole circuit, so it is on screen whatever the
    // camera is looking at and there is nothing for culling to save.
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Red and white, both sides, the way every circuit in the world does it. */
  private kerbs(): THREE.Mesh {
    const w = KERB;
    const stripe = {other: this.palette.kerbB, every: 6};
    return mergeMeshes([
      this.ribbon(
        TRACK.half,
        TRACK.half + w,
        this.palette.kerbA,
        LAYER.kerb,
        stripe,
      ),
      this.ribbon(
        -TRACK.half - w,
        -TRACK.half,
        this.palette.kerbA,
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
    const stripe = {other: this.palette.kerbB, every: 3};
    return mergeMeshes([
      this.ribbon(limit - 10, limit, this.palette.sand, LAYER.sand),
      this.ribbon(limit, limit + 7, this.palette.kerbA, LAYER.kerb, stripe),
      this.ribbon(-limit, -limit + 10, this.palette.sand, LAYER.sand),
      this.ribbon(-limit - 7, -limit, this.palette.kerbA, LAYER.kerb, stripe),
    ]);
  }

  /** The chequered line you start on and finish on. */
  private startLine(): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    const i = Math.floor(this.startAt * TRACK.segments);
    const p = this.points[i];
    const s = this.sides[i];
    const d = this.curve.getTangentAt(this.startAt);
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
          paint(
            geo,
            (k + row) % 2 === 0 ? this.palette.line : this.palette.tarmacDark,
          ),
        );
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), flatVertex());
    mesh.renderOrder = order(LAYER.paint);
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Where the circuit runs over itself.
   *
   * Two samples far apart along the lap but close together on the ground are a
   * crossing. "Far apart along the lap" is the whole test: every sample is
   * near its neighbours, and without that guard the answer would be the entire
   * track.
   *
   * What comes back is not a pair of points but a pair of *stretches*, and
   * that matters. A crossing at a right angle is a handful of touching
   * samples; two roads meeting at a shallow angle run alongside each other for
   * a couple of hundred units first, and a bridge built to a fixed length
   * would sit in the middle of that leaving both ends tangled. So each
   * crossing carries the full extent of the ground it covers, and the deck is
   * built to fit it.
   *
   * A plain scan of every pair, once, when the track is built. Nine hundred
   * samples is four hundred thousand distance checks; anything cleverer would
   * be more code than the thing it replaced.
   */
  crossings(): Array<Crossing> {
    // Close enough that the two roads and their kerbs share ground.
    const near = (TRACK.half + KERB) * 2;
    const near2 = near * near;
    // Far enough apart along the lap that this is a crossing and not simply
    // the road being next to itself.
    const apart = Math.max(30, Math.round(TRACK.segments * 0.05));

    const hits: Array<{low: number; high: number; d: number}> = [];
    for (let i = 0; i < TRACK.segments; i++) {
      for (let j = i + apart; j < TRACK.segments; j++) {
        if (TRACK.segments - (j - i) < apart) {
          continue;
        }
        const a = this.points[i];
        const b = this.points[j];
        const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
        if (d <= near2) {
          hits.push({low: i, high: j, d});
        }
      }
    }

    // Closest pair first, so each cluster is seeded at the middle of its
    // crossing and grown outward from there. Growing from whichever pair
    // happened to be found first split single crossings into three.
    hits.sort((a, b) => a.d - b.d);
    const taken: Array<boolean> = new Array(hits.length).fill(false);
    const found: Array<Crossing> = [];

    for (let k = 0; k < hits.length; k++) {
      if (taken[k]) {
        continue;
      }
      const seed = hits[k];
      taken[k] = true;
      let lowMin = 0;
      let lowMax = 0;
      let highMin = 0;
      let highMax = 0;

      // Single linkage: keep sweeping until a sweep adds nothing. A pair
      // belongs if it is near anything already in the cluster, which is what
      // lets a long shallow crossing come out as one thing.
      //
      // Both ways round, and that is not a nicety. A pair is stored with the
      // smaller index first, so a crossing that straddles the start of the lap
      // is found twice — once as (1, 325) and again as its mirror (324, 899) —
      // and comparing only low-to-low would call those two different bridges
      // and stack two decks on the same piece of road.
      const fits = (a: number, b: number): boolean =>
        a >= lowMin - apart &&
        a <= lowMax + apart &&
        b >= highMin - apart &&
        b <= highMax + apart;

      let grew = true;
      while (grew) {
        grew = false;
        for (let m = 0; m < hits.length; m++) {
          if (taken[m]) {
            continue;
          }
          const straight: [number, number] = [
            ringGap(seed.low, hits[m].low),
            ringGap(seed.high, hits[m].high),
          ];
          const mirrored: [number, number] = [
            ringGap(seed.low, hits[m].high),
            ringGap(seed.high, hits[m].low),
          ];
          const use = fits(...straight)
            ? straight
            : fits(...mirrored)
              ? mirrored
              : null;
          if (!use) {
            continue;
          }
          taken[m] = true;
          grew = true;
          lowMin = Math.min(lowMin, use[0]);
          lowMax = Math.max(lowMax, use[0]);
          highMin = Math.min(highMin, use[1]);
          highMax = Math.max(highMax, use[1]);
        }
      }

      found.push({
        low: seed.low,
        lowFrom: seed.low + lowMin,
        lowTo: seed.low + lowMax,
        high: seed.high,
        highFrom: seed.high + highMin,
        highTo: seed.high + highMax,
      });
    }
    return found;
  }

  /** Where the grid sits: a fraction of a lap back from the line. */
  gridAt(slot: number, offset: number, out: THREE.Vector3): number {
    const t = wrap(this.startAt - 0.006 - slot * 0.006);
    this.pointAt(t, out);
    this.sideAt(t, this.tmp);
    out.addScaledVector(this.tmp, offset);
    return t;
  }
}

/** How far apart two sample indices are, the short way round. */
export function ringGap(a: number, b: number): number {
  const d = ((b - a) % TRACK.segments) + TRACK.segments;
  const w = d % TRACK.segments;
  return w > TRACK.segments / 2 ? w - TRACK.segments : w;
}

/** A sample index, wrapped into the ring. */
export function wrapIndex(i: number): number {
  return ((i % TRACK.segments) + TRACK.segments) % TRACK.segments;
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
  // The topmost of what went in: a merged pile is drawn in one go, so it can
  // only have one place in the order, and the highest is the one that matters.
  mesh.renderOrder = Math.max(...meshes.map(m => m.renderOrder));
  mesh.frustumCulled = false;
  return mesh;
}
