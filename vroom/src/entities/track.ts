import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BRIDGE,
  CAR,
  ENVIRONMENTS,
  HEIGHT,
  Palette,
  RIVALS,
  TRACK,
} from "../config";
import {TrackSpec} from "../track/spec";
import {fadingVertex, flatVertex, LAYER, order, paint} from "../render/sprites";
import {NearFade} from "../../../shared/fadeInFront";
import {Substance} from "../render/materials";

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

/** What a flat at each layer is made of. Tarmac gathers a little of the sky;
 *  a painted line and a grass verge do not. */
function substanceFor(height: number): Substance {
  if (height === LAYER.tarmac) {
    return "road";
  }
  if (height === LAYER.kerb || height === LAYER.paint) {
    return "concrete";
  }
  return "verge";
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
  /** The barrier walls dissolve when they stand in front of the car. */
  readonly fades: Array<NearFade> = [];
  /**
   * Where the circuit runs over itself.
   *
   * Found once, here, because two things need it and the scan is four hundred
   * thousand distance checks: the flyover decks are built from it, and the
   * barrier stops being built where it passes underneath one.
   */
  readonly tangles: Array<Crossing>;
  /** How far past the tangle a deck reaches, in samples on this circuit. */
  readonly deckMargin: number;

  /** The sampled centre line, and the sideways direction at each sample. Both
   *  are what `nearest` searches and what the ribbons are built from. */
  private readonly points: Array<THREE.Vector3> = [];
  private readonly sides: Array<THREE.Vector3> = [];

  private readonly tmp = new THREE.Vector3();
  /** The racing tables; see `racing()`. */
  private pace: Array<number> = [];
  private line: Array<number> = [];

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

    this.racing();
    this.tangles = this.crossings();
    this.deckMargin = Math.max(
      4,
      Math.round(BRIDGE.reach / (this.length / TRACK.segments)),
    );

    this.group.add(
      this.ribbon(-TRACK.half, TRACK.half, this.palette.tarmac, LAYER.tarmac),
    );
    this.group.add(this.kerbs());
    this.group.add(this.barriers());
    this.group.add(this.walls());
    this.group.add(this.startLine());
    if (this.palette.centreLine) {
      // Dashed, down the middle. Painted over the tarmac and under everything
      // else, the same as the start line is.
      this.group.add(
        this.ribbon(-1.4, 1.4, this.palette.line, LAYER.paint, {
          other: this.palette.tarmac,
          every: 7,
        }),
      );
    }
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

  /**
   * How wide the deck over this crossing is, in samples either side.
   *
   * Shared with the bridges rather than worked out twice: what the deck covers
   * and what the wall leaves out have to be the same stretch, or the wall
   * reappears in the gap.
   */
  deckHalfWidth(from: number, to: number): number {
    return Math.max(4, Math.ceil((to - from) / 2) + this.deckMargin);
  }

  /**
   * Is this sample of the circuit running underneath a flyover?
   *
   * The barrier is not built here. It used to be, and from a diagonal it
   * showed: a deck is flat on the ground and a wall is twelve units tall, so
   * the wall under the bridge stuck up through it and read as a red and white
   * band laid across the road. A road that passes under a bridge does not
   * bring its fence through with it.
   */
  underBridge(index: number): boolean {
    return this.tangles.some(
      c =>
        Math.abs(ringGap(c.low, index)) <=
        this.deckHalfWidth(c.lowFrom, c.lowTo),
    );
  }

  /** Is this far off the middle still on the tarmac? */
  onTarmac(offset: number): boolean {
    return Math.abs(offset) <= TRACK.half;
  }

  /**
   * How fast a car can get round each point of the circuit, and the line a
   * driver would take through it.
   *
   * Worked out once, from the shape of the road, and handed to the rivals so
   * they can drive it rather than trundle round it at one speed. Two tables:
   *
   * - `pace` — how fast this bit of road is. A corner of radius r can be taken
   *   at about the square root of grip times r, which is the same physics that
   *   makes a hairpin slow and a kink flat out. Straight road comes out above
   *   the car's top speed and is clamped to it.
   * - `line` — how far off the middle a driver would be, in world units.
   *   Toward the inside of the corner, and then **smoothed along the road**,
   *   which is what turns a set of apexes into a racing line: the smoothing
   *   leaks the apex backwards and forwards, so a car is already drifting wide
   *   before the corner and still running out after it.
   */
  private racing(): void {
    const n = TRACK.segments;
    const bend: Array<number> = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const back = this.points[wrapIndex(i - 1)];
      const here = this.points[i];
      const on = this.points[wrapIndex(i + 1)];
      const ax = here.x - back.x;
      const az = here.z - back.z;
      const bx = on.x - here.x;
      const bz = on.z - here.z;
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) {
        continue;
      }
      // The sine of the turn between the two segments, over the distance it
      // took: radians per unit, which is one over the radius.
      const cross = (ax * bz - az * bx) / (la * lb);
      bend[i] = Math.asin(Math.max(-1, Math.min(1, cross))) / ((la + lb) / 2);
    }
    // Smoothed before it is used for anything: three samples of a curve fitted
    // through hand-placed corners is noisy, and noise here is a car that
    // brakes for nothing.
    const curve = smooth(bend, RIVALS.smooth);

    this.pace = new Array(n).fill(0);
    const line: Array<number> = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const radius = 1 / Math.max(1e-5, Math.abs(curve[i]));
      this.pace[i] = Math.min(CAR.top, Math.sqrt(RIVALS.bite * radius));
      // Toward the inside of the corner. Which side that is was settled by
      // measuring: the line's own length has to come out *shorter* than the
      // middle of the road, and with the sign the other way round it came out
      // a hundred and sixty units longer — three cars taking the scenic route
      // through every bend.
      const tight = Math.min(1, Math.abs(curve[i]) * RIVALS.apexAt);
      line[i] = Math.sign(curve[i]) * tight * TRACK.half * RIVALS.apex;
    }
    this.line = smooth(line, RIVALS.lineSmooth);
  }

  /** How fast the road is at a sample, and how far off the middle to be. */
  paceAt(i: number): number {
    return this.pace[wrapIndex(i)];
  }

  lineAt(i: number): number {
    return this.line[wrapIndex(i)];
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
      //
      // They did not, for most of this game's life. The sideways vector points
      // the opposite way to what the winding assumed, so every road triangle
      // faced the ground — which cost nothing while the material was unlit and
      // double-sided, and turned the whole road black the moment it was lit.
      push(p0, s0, from);
      push(p1, s1, to);
      push(p1, s1, from);
      push(p0, s0, from);
      push(p0, s0, to);
      push(p1, s1, to);

      const c = stripe && Math.floor(i / stripe.every) % 2 === 1 ? b : a;
      for (let v = 0; v < 6; v++) {
        colours.push(c.r, c.g, c.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    // Straight up, stated rather than computed: a ribbon is flat by
    // construction, and this way the lighting does not depend on the winding
    // being right anywhere else.
    const normals = new Float32Array(verts.length);
    for (let n = 1; n < normals.length; n += 3) {
      normals[n] = 1;
    }
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array((verts.length / 3) * 2), 2),
    );
    const mesh = new THREE.Mesh(geo, flatVertex(substanceFor(height)));
    mesh.renderOrder = order(height);
    // The road takes the shadow of whatever is on it, which is most of what
    // puts a car on a surface rather than above one.
    mesh.receiveShadow = true;
    // The ribbon wraps the whole circuit, so it is on screen whatever the
    // camera is looking at and there is nothing for culling to save.
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Red and white, both sides, the way every circuit in the world does it. */
  private kerbs(): THREE.Mesh {
    const w = KERB;
    const stripe = {other: this.palette.kerbB, every: TRACK.stripe};
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
   * The run-off at the edge of the grass: a band of sand, and nothing else.
   *
   * The wall itself used to be another flat ribbon here, painted on the
   * ground. That was fine looking straight down and is not now — see
   * `walls()`, which stands it up.
   */
  private barriers(): THREE.Mesh {
    const limit = Track.limit;
    return mergeMeshes([
      this.ribbon(limit - 10, limit, this.palette.sand, LAYER.sand),
      this.ribbon(-limit, -limit + 10, this.palette.sand, LAYER.sand),
    ]);
  }

  /**
   * The barrier, standing up.
   *
   * The plan says you can go on the grass "but no farther", so there has to be
   * something there saying so — and from a diagonal it has to be something you
   * can see over the top of rather than a stripe you drive across. It stands
   * exactly on the limit the car is stopped at, so what a child sees and what
   * the car hits are the same line.
   *
   * It dissolves when it comes between the camera and the car. The near side
   * of the track is between the two on every left-hand corner, and a wall you
   * cannot see past is a car you cannot see.
   */
  private walls(): THREE.Mesh {
    const limit = Track.limit;
    // The same rhythm as the kerb below it, so the two read as one edge.
    const stripe = {other: this.palette.kerbB, every: TRACK.stripe};
    const parts = [
      this.wallStrip(limit, this.palette.kerbA, stripe),
      this.wallStrip(-limit, this.palette.kerbA, stripe),
    ];
    const {material, fade} = fadingVertex("walls");
    this.fades.push(fade);
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
    mesh.renderOrder = order(LAYER.car);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** One upright band along the circuit, facing the road. */
  private wallStrip(
    offset: number,
    colour: number,
    stripe: {other: number; every: number},
  ): THREE.BufferGeometry {
    const verts: Array<number> = [];
    const colours: Array<number> = [];
    const normals: Array<number> = [];
    const a = new THREE.Color(colour);
    const b = new THREE.Color(stripe.other);
    // Inward, so the face a driver sees is the lit one.
    const facing = offset > 0 ? -1 : 1;

    for (let i = 0; i < TRACK.segments; i++) {
      const j = (i + 1) % TRACK.segments;
      const p0 = this.points[i];
      const p1 = this.points[j];
      const s0 = this.sides[i];
      const s1 = this.sides[j];
      if (this.underBridge(i)) {
        continue;
      }
      const x0 = p0.x + s0.x * offset;
      const z0 = p0.z + s0.z * offset;
      const x1 = p1.x + s1.x * offset;
      const z1 = p1.z + s1.z * offset;
      const h = HEIGHT.wall;

      verts.push(x0, 0, z0, x1, 0, z1, x1, h, z1);
      verts.push(x0, 0, z0, x1, h, z1, x0, h, z0);

      const c = Math.floor(i / stripe.every) % 2 === 1 ? b : a;
      for (let v = 0; v < 6; v++) {
        colours.push(c.r, c.g, c.b);
      }
      for (let v = 0; v < 3; v++) {
        normals.push(s0.x * facing, 0, s0.z * facing);
      }
      for (let v = 0; v < 3; v++) {
        normals.push(s1.x * facing, 0, s1.z * facing);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array((verts.length / 3) * 2), 2),
    );
    return geo;
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
    const mesh = new THREE.Mesh(
      mergeGeometries(parts, false),
      flatVertex("concrete"),
    );
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
  private crossings(): Array<Crossing> {
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

/** A ring of numbers, averaged over a window either side of each one. */
function smooth(ring: ReadonlyArray<number>, window: number): Array<number> {
  const out: Array<number> = [];
  for (let i = 0; i < ring.length; i++) {
    let sum = 0;
    for (let k = -window; k <= window; k++) {
      sum += ring[wrapIndex(i + k)];
    }
    out.push(sum / (window * 2 + 1));
  }
  return out;
}

/** How far apart two sample indices are, the short way round. */
export function ringGap(a: number, b: number): number {
  const d = ((b - a) % TRACK.segments) + TRACK.segments;
  const w = d % TRACK.segments;
  return w > TRACK.segments / 2 ? w - TRACK.segments : w;
}

/**
 * A lap fraction as a signed distance from zero: -0.5..0.5.
 *
 * `wrap` puts everything in 0..1, which makes a car a whisker *behind* the
 * start line read as almost a whole lap ahead of it. Anything comparing two
 * places on the circuit wants this instead.
 */
export function signed(t: number): number {
  const w = wrap(t);
  return w > 0.5 ? w - 1 : w;
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
  const mesh = new THREE.Mesh(merged, flatVertex("concrete"));
  mesh.receiveShadow = true;
  // The topmost of what went in: a merged pile is drawn in one go, so it can
  // only have one place in the order, and the highest is the one that matters.
  mesh.renderOrder = Math.max(...meshes.map(m => m.renderOrder));
  mesh.frustumCulled = false;
  return mesh;
}
