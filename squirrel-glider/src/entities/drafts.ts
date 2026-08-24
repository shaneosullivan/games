import * as THREE from "three";
import {DRAFT, WORLD} from "../config";
import {Rng} from "../core/rng";

/** A thermal standing in the open valley. See DRAFT.columns. */
export interface Column {
  readonly x: number;
  readonly z: number;
}

/** One stretch of wall with rising air on it. */
export interface Band {
  /** Which wall: -1 for the left one, +1 for the right. */
  readonly side: number;
  /** Where it starts and ends down the valley. `from` is nearer the cliff. */
  readonly from: number;
  readonly to: number;
}

/**
 * The rising air along the valley walls, and the seeds turning over in it.
 *
 * See DRAFT in the config for why it is bands along the rock rather than
 * columns in the middle. The lift is added to the squirrel's height directly
 * and the flight model is never told: it goes on gliding down exactly as it
 * did, through air that is going up faster than it is coming down. That is
 * both what really happens and the only version that cannot break anything —
 * there is no state to get wrong and no way for a draft to leave the squirrel
 * flying at a speed it could not otherwise reach.
 */
export class Drafts {
  readonly group = new THREE.Group();
  readonly bands: Array<Band> = [];
  readonly columns: Array<Column> = [];

  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  /** Each streak's place within its band: how far along, how far in from the
   *  rock, and how far up from the valley floor it currently is. */
  private readonly along: Array<number> = [];
  private readonly inward: Array<number> = [];
  private readonly rise: Array<number> = [];
  private readonly band: Array<number> = [];
  /** Which thermal a streak stands in, or -1 if it is on a wall. */
  private readonly column: Array<number> = [];
  /** Where in that thermal: an angle, and how far out from its middle. */
  private readonly turn: Array<number> = [];
  private readonly spread: Array<number> = [];
  private clock = 0;

  constructor(
    rng: Rng,
    private readonly wallAt: (z: number, y: number, side: number) => number,
    private readonly pathAt: (z: number) => number,
    reach: number,
  ) {
    // Alternating sides, so following the lift down the valley means crossing
    // it — the flight is a series of decisions rather than one long lean.
    let z = -DRAFT.firstAt;
    const last = -reach * 0.94;
    for (let i = 0; i < DRAFT.count && z > last; i++) {
      const length = rng.range(DRAFT.lengthMin, DRAFT.lengthMax);
      this.bands.push({side: i % 2 === 0 ? 1 : -1, from: z, to: z - length});
      z -= length + rng.range(70, 130);
    }

    // Thermals standing in the open, between the wall bands.
    let cz = -DRAFT.columnFirstAt;
    for (let i = 0; i < DRAFT.columns && cz > last; i++) {
      this.columns.push({
        x: rng.range(-DRAFT.columnWander, DRAFT.columnWander),
        z: cz,
      });
      cz -= rng.range(DRAFT.columnGapMin, DRAFT.columnGapMax);
    }

    for (let i = 0; i < DRAFT.lines; i++) {
      // Two in five of the streaks stand in the open thermals and the rest on
      // the walls, roughly in proportion to how much air each of them is.
      const inColumn = this.columns.length > 0 && rng.next() < 0.4;
      this.column.push(inColumn ? rng.int(0, this.columns.length - 1) : -1);
      this.band.push(rng.int(0, Math.max(0, this.bands.length - 1)));
      this.along.push(rng.next());
      this.turn.push(rng.next() * Math.PI * 2);
      this.spread.push(Math.sqrt(rng.next()));
      // A share rather than a distance, so the streaks stay inside the lift
      // wherever the valley happens to narrow. See widthAt.
      this.inward.push(rng.next());
      // A fraction of the way from the floor to the top of the lift, so the
      // streaks fill the whole standing column however tall it is here.
      this.rise.push(rng.next());
    }

    this.positions = new Float32Array(DRAFT.lines * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    // Re-placed every frame the length of a valley, so a fitted bounding
    // sphere is a lie that would blink the lot out of view.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: DRAFT.lineColour,
        transparent: true,
        opacity: DRAFT.lineOpacity,
        depthWrite: false,
        // Unfogged: a draft two hundred units off is exactly the one a player
        // needs to see in time to turn towards it.
        fog: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  /**
   * How fast the air is going up where the squirrel is, in units a second.
   *
   * Zero nearly everywhere. Strongest against the rock, dying away inward and
   * dying away again above the ceiling — see DRAFT.ceiling for why there has
   * to be a lid on it.
   */
  liftAt(x: number, y: number, z: number): number {
    const thermal = this.columnLift(x, y, z);
    const band = this.bandAt(z);
    if (!band) {
      return thermal;
    }
    // On the correct side of the valley, and how far in from that rock face.
    if (Math.sign(x) !== band.side || x === 0) {
      return 0;
    }
    const width = this.widthAt(z, y, band.side);
    const inward = this.wallAt(z, y, band.side) - Math.abs(x);
    if (inward < 0 || inward > width) {
      return 0;
    }
    // Full strength against the rock, fading over the last stretch inward.
    const edge = Math.min(1, (width - inward) / DRAFT.fade);
    return Math.max(thermal, DRAFT.strength * edge * this.lidAt(y, z));
  }

  /** The rising air standing in the open middle. See DRAFT.columns. */
  private columnLift(x: number, y: number, z: number): number {
    let best = 0;
    for (const c of this.columns) {
      const away = Math.hypot(x - c.x, z - c.z);
      if (away > DRAFT.columnRadius) {
        continue;
      }
      // Strongest in the core and dying away at the edge, the way a thermal is.
      const core = Math.min(1, (DRAFT.columnRadius - away) / DRAFT.fade);
      best = Math.max(best, DRAFT.columnStrength * core * this.lidAt(y, z));
    }
    return best;
  }

  /** How much of the lift survives at this height. See DRAFT.ceiling, which is
   *  why the game has an end. */
  private lidAt(y: number, z: number): number {
    const top = this.pathAt(z) + DRAFT.ceiling;
    return Math.min(1, Math.max(0, (top - y) / DRAFT.fade));
  }

  /** How far in from the rock the lift reaches here. Never more than a share
   *  of the half-width — see DRAFT.maxShare. */
  private widthAt(z: number, y: number, side: number): number {
    return Math.min(DRAFT.width, this.wallAt(z, y, side) * DRAFT.maxShare);
  }

  /** The band covering a point down the valley, if there is one. */
  bandAt(z: number): Band | null {
    for (const band of this.bands) {
      if (z <= band.from && z >= band.to) {
        return band;
      }
    }
    return null;
  }

  /**
   * `at` is the squirrel. The motes live in a window that follows its height,
   * so a band is thick with them wherever it is met without needing a mote for
   * every unit of a six-hundred-unit valley.
   */
  update(dt: number): void {
    this.clock += dt;
    for (let i = 0; i < DRAFT.lines; i++) {
      const o = i * 6;
      const c = this.column[i] >= 0 ? this.columns[this.column[i]] : null;
      const band = c ? null : this.bands[this.band[i]];
      if (!band && !c) {
        continue;
      }
      const z = c
        ? c.z + Math.sin(this.turn[i]) * this.spread[i] * DRAFT.columnRadius
        : band!.from + (band!.to - band!.from) * this.along[i];

      // Up off the valley floor and round again at the lid, so the whole
      // standing column is drawn and the top of a draft is a thing you can see
      // rather than something you discover by ceasing to climb.
      const top = this.pathAt(z) + DRAFT.ceiling;
      const span = Math.max(1, top - WORLD.floorY);
      this.rise[i] += (DRAFT.lineRise * dt) / span;
      if (this.rise[i] > 1) {
        this.rise[i] -= 1;
      }
      const y = WORLD.floorY + this.rise[i] * span;
      // Against the rock at *this* height, because the wall leans back as it
      // rises: a streak drawn on the foot of the slope would hang in open air
      // with the mountain well behind it. A thermal stands where it stands.
      const x = c
        ? c.x + Math.cos(this.turn[i]) * this.spread[i] * DRAFT.columnRadius
        : band!.side *
          (this.wallAt(z, y, band!.side) -
            this.inward[i] * this.widthAt(z, y, band!.side));

      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.positions[o + 3] = x;
      this.positions[o + 4] = Math.min(top, y + DRAFT.lineLength);
      this.positions[o + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
