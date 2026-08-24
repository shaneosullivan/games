import * as THREE from "three";
import {DRAFT, WORLD} from "../config";
import {Rng} from "../core/rng";

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

  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  /** Each streak's place within its band: how far along, how far in from the
   *  rock, and how far up from the valley floor it currently is. */
  private readonly along: Array<number> = [];
  private readonly inward: Array<number> = [];
  private readonly rise: Array<number> = [];
  private readonly band: Array<number> = [];
  private clock = 0;

  constructor(
    rng: Rng,
    private readonly wallAt: (z: number) => number,
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

    for (let i = 0; i < DRAFT.lines; i++) {
      this.band.push(rng.int(0, Math.max(0, this.bands.length - 1)));
      this.along.push(rng.next());
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
    const band = this.bandAt(z);
    if (!band) {
      return 0;
    }
    // On the correct side of the valley, and how far in from that rock face.
    if (Math.sign(x) !== band.side || x === 0) {
      return 0;
    }
    const width = this.widthAt(z);
    const inward = this.wallAt(z) - Math.abs(x);
    if (inward < 0 || inward > width) {
      return 0;
    }
    // Full strength against the rock, fading over the last stretch inward.
    const edge = Math.min(1, (width - inward) / DRAFT.fade);
    const top = this.pathAt(z) + DRAFT.ceiling;
    const lid = Math.min(1, Math.max(0, (top - y) / DRAFT.fade));
    return DRAFT.strength * edge * lid;
  }

  /** How far in from the rock the lift reaches here. Never more than a share
   *  of the half-width — see DRAFT.maxShare. */
  private widthAt(z: number): number {
    return Math.min(DRAFT.width, this.wallAt(z) * DRAFT.maxShare);
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
      const band = this.bands[this.band[i]];
      const o = i * 6;
      if (!band) {
        continue;
      }
      const z = band.from + (band.to - band.from) * this.along[i];
      const x = band.side * (this.wallAt(z) - this.inward[i] * this.widthAt(z));

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
