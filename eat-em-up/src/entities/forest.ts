import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CLEARING, CLIMB, FADE, START_TREE, TREE_BRANCH, WORLD} from "../config";
import {paint, vertexToon} from "../render/materials";
import {fadeInFront, type NearFade} from "../render/fadeInFront";
import {Rng} from "../core/rng";

/** A trunk: something to crawl around, and something to climb. */
export interface Climbable {
  x: number;
  z: number;
  radius: number;
  /** How high you may climb. Stops short of the crown, so climbing never puts
   *  the camera inside the leaves. */
  climbTop: number;
  /** The start tree is special: you can step off it onto its branch. */
  isStartTree: boolean;
}

/**
 * A branch you can crawl along.
 *
 * The one you start on and the fruit branches up every trunk are the same
 * thing, so they are the same type: a round bough leaving a trunk at some
 * height, running out and gently up, tapering as it goes. Anything that asks
 * "what am I standing on?" walks this list.
 */
export interface Bough {
  /** Where it leaves the trunk. */
  base: THREE.Vector3;
  /** Horizontal unit direction it runs in. */
  dir: THREE.Vector2;
  /** Vertical rise per unit travelled horizontally. */
  gradient: number;
  /** Horizontal distance from the base to the tip. */
  length: number;
  /** How far out along it the crawlable part starts. */
  startAlong: number;
  radiusBase: number;
  radiusTip: number;
  /** The strip along the top you can crawl on. */
  walkWidth: number;
  /** The trunk it grows from, so standing on it can suspend that trunk's
   *  collision — otherwise you are pushed off your own branch. Set after the
   *  fact for the start bough, which is built before its trunk is. */
  trunk: Climbable | null;
}

/** Somewhere food can sit: a bush, a tree, or a patch of open floor. */
export interface Spot {
  x: number;
  z: number;
  /** Top of the thing at this spot — 0 for open floor. */
  top: number;
  radius: number;
  /** Set for trees, so leaves can be hung up a trunk within a climb's reach. */
  trunkRadius?: number;
  climbTop?: number;
}

const TRUNK_COLOUR = 0x9c7550;
const TRUNK_DARK = 0x82603f;
const CROWN_COLOURS = [0x6fbc52, 0x7fcc5e, 0x63ad49, 0x8ad866];
const BUSH_COLOURS = [0x5aa347, 0x66b350, 0x4f9440];

/**
 * The wood you crawl about in: the floor, the trees, the bushes, and the one
 * tree you start up.
 *
 * Everything is generated in code and merged down to a handful of meshes, so a
 * forest of seventy-odd trees is a few draw calls rather than hundreds.
 */
export class Forest {
  readonly group = new THREE.Group();

  /** Bushes and trees, for the food field to hang things on. */
  readonly bushSpots: Array<Spot> = [];
  readonly treeSpots: Array<Spot> = [];

  /** Every trunk in the wood: solid to crawl into, and climbable. */
  readonly climbables: Array<Climbable> = [];

  /** The tip of every fruit branch within reach of the play area, for the food
   *  field to hang fruit from. Branches on the ring of trees beyond the edge
   *  are scenery and are deliberately left out. */
  readonly fruitSpots: Array<THREE.Vector3> = [];

  /** Every branch you can crawl along, the start bough included. */
  readonly boughs: Array<Bough> = [];

  /** Trunks, crowns and bushes share one material so a single depth drives the
   *  whole wood's dissolve. */
  private readonly fade: NearFade = fadeInFront(vertexToon(), {
    band: FADE.band,
    cutoff: FADE.cutoff,
    cacheKey: "forestFade",
  });

  /** Unit vector along the start branch, in the (x, z) plane. */
  private readonly branchDir = new THREE.Vector2(
    Math.cos(START_TREE.branchAngle),
    Math.sin(START_TREE.branchAngle),
  );

  /** Height of the branch's axis. Its top is one radius above this. */
  private readonly branchAxisY =
    START_TREE.branchHeight - START_TREE.branchRadius;

  constructor(private readonly rng: Rng) {
    this.buildGround();
    this.buildStartTree();
    this.buildTrees();
    this.buildBushes();
  }

  // ---- queries the caterpillar asks ---------------------------------------

  /** Whether (x, z) is in the grass clearing, plus an optional margin. Trees
   *  and bushes stay out of it; that is what makes it a clearing. */
  inClearing(x: number, z: number, margin = 0): boolean {
    return (
      Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.radius + margin
    );
  }

  /** A bough's thickness at a distance along it. */
  private boughRadiusAt(b: Bough, along: number): number {
    const t = THREE.MathUtils.clamp(along / b.length, 0, 1);
    return THREE.MathUtils.lerp(b.radiusBase, b.radiusTip, t);
  }

  /**
   * Where you are on a bough: how far out along it, and how far off its centre
   * line. Returns null if you are not over its crawlable strip at all.
   */
  private onBough(
    b: Bough,
    x: number,
    z: number,
  ): {along: number; top: number} | null {
    const dx = x - b.base.x;
    const dz = z - b.base.z;
    const along = dx * b.dir.x + dz * b.dir.y;
    if (along < b.startAlong || along > b.length) {
      return null;
    }
    const across = -dx * b.dir.y + dz * b.dir.x;
    if (Math.abs(across) > b.walkWidth / 2) {
      return null;
    }
    return {
      along,
      top: b.base.y + along * b.gradient + this.boughRadiusAt(b, along),
    };
  }

  /** The start bough, which is always the first one built. */
  private get startBough(): Bough {
    return this.boughs[0];
  }

  /** Whether (x, z) is over the crawlable strip of the start bough. */
  onBranch(x: number, z: number): boolean {
    return this.onBough(this.startBough, x, z) !== null;
  }

  /**
   * The height of whatever you are standing on at (x, z).
   *
   * `from` is the height you are currently at: a bough only holds you up if
   * you are already at or above it, so walking under one at ground level
   * doesn't teleport you onto it.
   */
  surfaceAt(x: number, z: number, from: number): number {
    let best = 0;
    for (const b of this.boughs) {
      const on = this.onBough(b, x, z);
      if (on && from >= on.top - 0.35 && on.top > best) {
        best = on.top;
      }
    }
    return best;
  }

  /** How far (x, z) is to the side of a bough's centre line. */
  boughAcross(b: Bough, x: number, z: number): number {
    return -(x - b.base.x) * b.dir.y + (z - b.base.z) * b.dir.x;
  }

  /**
   * The bough whose surface you are standing on at this height, if any. Used
   * to suspend a trunk's collision while you are out on its own branch, and to
   * keep the caterpillar to the middle of it while it turns.
   */
  boughUnder(pos: THREE.Vector3, tolerance: number): Bough | null {
    for (const b of this.boughs) {
      const on = this.onBough(b, pos.x, pos.z);
      if (on && Math.abs(pos.y - on.top) < tolerance) {
        return b;
      }
    }
    return null;
  }

  /**
   * The bough a climber at this height and position could step onto, if any.
   * That is how you get from a trunk out onto its branches.
   *
   * Judged on its own generous windows rather than on the crawlable strip —
   * see TREE_BRANCH.boardAcross. Being fussy about this is the difference
   * between a branch you can get onto and one you can only watch.
   */
  boughToStepOnto(
    tree: Climbable,
    pos: THREE.Vector3,
    footHeight: number,
  ): Bough | null {
    let best: Bough | null = null;
    let bestGap = Infinity;
    for (const b of this.boughs) {
      if (b.trunk !== tree) {
        continue;
      }
      const dx = pos.x - b.base.x;
      const dz = pos.z - b.base.z;
      // Slightly before the base counts too: clinging to the bark you are
      // fractionally inside where the branch leaves the trunk.
      const along = dx * b.dir.x + dz * b.dir.y;
      if (along < -0.6 || along > b.length) {
        continue;
      }
      if (Math.abs(-dx * b.dir.y + dz * b.dir.x) > TREE_BRANCH.boardAcross) {
        continue;
      }
      const at = Math.max(0, along);
      const top = b.base.y + at * b.gradient + this.boughRadiusAt(b, at);
      const gap = Math.abs(footHeight - top);
      if (gap <= TREE_BRANCH.boardHeight && gap < bestGap) {
        best = b;
        bestGap = gap;
      }
    }
    return best;
  }

  /**
   * Where to stand when boarding `b`: on its centre line, facing out along it.
   *
   * The snap is what lets the grab be generous. Landing wherever you happened
   * to be would put you off the side of a branch you only just caught, and
   * facing whatever way you were climbing rather than along the branch you
   * are now standing on.
   */
  boardingSpot(
    b: Bough,
    x: number,
    z: number,
  ): {point: THREE.Vector3; heading: number} {
    const dx = x - b.base.x;
    const dz = z - b.base.z;
    const along = THREE.MathUtils.clamp(
      dx * b.dir.x + dz * b.dir.y,
      b.startAlong + 0.15,
      b.length - 0.3,
    );
    return {
      point: new THREE.Vector3(
        b.base.x + b.dir.x * along,
        b.base.y + along * b.gradient + this.boughRadiusAt(b, along),
        b.base.z + b.dir.y * along,
      ),
      heading: Math.atan2(b.dir.x, b.dir.y),
    };
  }

  /** Which way to face to crawl out along the start branch, radians about Y. */
  get branchHeading(): number {
    return Math.atan2(this.branchDir.x, this.branchDir.y);
  }

  /** A point on top of the start bough, `t` of the way along its crawlable
   *  part. This is where the game puts the caterpillar to begin with. */
  branchPoint(t: number, across: number): THREE.Vector3 {
    const b = this.startBough;
    const along = THREE.MathUtils.lerp(b.startAlong, b.length - 0.6, t);
    return new THREE.Vector3(
      b.base.x + b.dir.x * along - b.dir.y * across,
      b.base.y + along * b.gradient + this.boughRadiusAt(b, along),
      b.base.z + b.dir.y * along + b.dir.x * across,
    );
  }

  /**
   * Pushes a position out of any trunk it has got inside, and back inside the
   * edge of the wood.
   *
   * A push rather than a wall: a child steering into a tree they don't mean to
   * climb should slide along it and carry on, not stop dead.
   */
  collide(pos: THREE.Vector3, radius: number): void {
    const standingOn = pos.y > 1 ? this.boughUnder(pos, 0.7) : null;
    for (const o of this.climbables) {
      // A trunk stops being solid while you are out on one of its own boughs —
      // otherwise the branch you are crawling along pushes you off itself.
      if (standingOn && standingOn.trunk === o) {
        continue;
      }
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const min = o.radius + radius;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        pos.x = o.x + (dx / d) * min;
        pos.z = o.z + (dz / d) * min;
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    const edge = WORLD.radius - radius;
    if (r > edge) {
      pos.x = (pos.x / r) * edge;
      pos.z = (pos.z / r) * edge;
    }
  }

  /**
   * The nearest trunk the caterpillar is up against, or null.
   *
   * `reach` is how far past the bark counts as touching it.
   */
  climbableAt(
    pos: THREE.Vector3,
    radius: number,
    reach: number,
  ): Climbable | null {
    let best: Climbable | null = null;
    let bestDist = Infinity;
    for (const o of this.climbables) {
      const d = Math.hypot(pos.x - o.x, pos.z - o.z);
      if (d < o.radius + radius + reach && d < bestDist) {
        best = o;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Dissolves the wood in front of the caterpillar. `depth` is how far it is
   * from the eye, in view space; null leaves everything solid.
   */
  setFadeDepth(depth: number | null): void {
    // A depth behind the eye means nothing is ever in front of it.
    this.fade.setDepth(depth === null ? -1e9 : depth - FADE.margin);
  }

  // ---- building -----------------------------------------------------------

  private buildGround(): void {
    // Drawn far wider than the playable disc so the fog swallows the floor
    // before its edge ever comes into view.
    const disc = new THREE.CircleGeometry(WORLD.skyRadius, 64);
    const ground = new THREE.Mesh(
      paint(disc, WORLD.groundColour),
      vertexToon(),
    );
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    // Scattered lighter patches, so the floor isn't one flat sheet of green.
    const patches: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < 90; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * WORLD.radius;
      const size = this.rng.range(1.4, 4.2);
      const patch = new THREE.CircleGeometry(size, 7);
      patch.rotateX(-Math.PI / 2);
      // 0.02 proud of the floor: coplanar faces z-fight, and that flicker is
      // far more obvious on a big flat area than the offset is.
      patch.translate(Math.cos(a) * r, 0.02, Math.sin(a) * r);
      patches.push(paint(patch, this.rng.pick([0x7cb95f, 0x66a44c, 0x86c268])));
    }
    const merged = mergeGeometries(patches);
    if (merged) {
      this.group.add(new THREE.Mesh(merged, vertexToon()));
    }
  }

  /** The tree you begin on, with the bough you begin on. */
  private buildStartTree(): void {
    const parts: Array<THREE.BufferGeometry> = [];

    const trunk = new THREE.CylinderGeometry(
      START_TREE.trunkRadius * 0.82,
      START_TREE.trunkRadius,
      START_TREE.trunkHeight,
      12,
    );
    trunk.translate(0, START_TREE.trunkHeight / 2, 0);
    parts.push(paint(trunk, TRUNK_COLOUR));

    parts.push(...this.buildBranch());

    let lowestFoliage = Infinity;
    for (let i = 0; i < 5; i++) {
      const r = this.rng.range(2.6, 3.8);
      const y = START_TREE.trunkHeight + this.rng.range(0, 2);
      const blob = new THREE.IcosahedronGeometry(r, 1);
      blob.translate(this.rng.range(-2.4, 2.4), y, this.rng.range(-2.4, 2.4));
      parts.push(paint(blob, this.rng.pick(CROWN_COLOURS)));
      lowestFoliage = Math.min(lowestFoliage, y - r);
    }

    const trunkInfo: Climbable = {
      x: 0,
      z: 0,
      radius: START_TREE.trunkRadius,
      climbTop: lowestFoliage - CLIMB.canopyClearance,
      isStartTree: true,
    };
    // Above the big bough, so its fruit branches never crowd the one place the
    // player is guaranteed to be standing.
    this.addFruitBranches(
      parts,
      0,
      0,
      START_TREE.trunkRadius,
      START_TREE.branchHeight + 1.6,
      trunkInfo.climbTop - 0.5,
      true,
      trunkInfo,
    );

    const merged = mergeGeometries(parts);
    if (merged) {
      this.group.add(new THREE.Mesh(merged, this.fade.material));
    }
    // The start bough is built before this Climbable exists, so it is pointed
    // at it here. Without this it belongs to no trunk, and climbing the start
    // tree could never step back onto the branch the game begins on.
    this.startBough.trunk = trunkInfo;
    this.climbables.push(trunkInfo);
  }

  /**
   * The branch: a round, tapering bough rather than a plank, with a few twigs
   * and a tuft of leaves at the far end.
   *
   * A cylinder laid on its side, with its top exactly where surfaceAt puts the
   * crawling surface — so the caterpillar rides the crown of the bough the way
   * a caterpillar on a twig actually does.
   */
  private buildBranch(): Array<THREE.BufferGeometry> {
    const parts: Array<THREE.BufferGeometry> = [];

    // Registered first, so it is boughs[0] — the one branchPoint and
    // branchHeading mean when they say "the branch".
    this.boughs.push({
      base: new THREE.Vector3(0, this.branchAxisY, 0),
      dir: this.branchDir,
      gradient: 0,
      length: START_TREE.branchLength,
      startAlong: START_TREE.trunkRadius * 0.5,
      radiusBase: START_TREE.branchRadius,
      radiusTip: START_TREE.branchTipRadius,
      walkWidth: START_TREE.branchWalkWidth,
      trunk: null,
    });

    // Thick radius first, because that is the one that ends up at the trunk.
    // CylinderGeometry puts its first radius at +Y, and the rotateZ below maps
    // +Y to -X — which after the translate is the trunk end, not the tip. With
    // these the wrong way round the branch was drawn tapering the opposite way
    // to the surface the caterpillar walks on, so it floated above the branch
    // near the trunk and sank into it out at the end.
    const bough = new THREE.CylinderGeometry(
      START_TREE.branchRadius,
      START_TREE.branchTipRadius,
      START_TREE.branchLength,
      10,
    );
    // Built up the Y axis, so it is tipped on its side and swung round to the
    // branch's bearing. The centre sits half its length out from the trunk.
    bough.rotateZ(Math.PI / 2);
    bough.translate(START_TREE.branchLength / 2, this.branchAxisY, 0);
    bough.rotateY(-START_TREE.branchAngle);
    parts.push(paint(bough, TRUNK_DARK));

    // A collar where it meets the trunk, so the join isn't a bare seam.
    const collar = new THREE.SphereGeometry(
      START_TREE.branchRadius * 1.5,
      9,
      7,
    );
    collar.scale(1, 0.8, 1);
    collar.translate(
      this.branchDir.x * START_TREE.trunkRadius * 0.8,
      this.branchAxisY,
      this.branchDir.y * START_TREE.trunkRadius * 0.8,
    );
    parts.push(paint(collar, TRUNK_DARK));

    // Twigs and a leaf tuft, all beyond the crawlable end so they never stand
    // where the caterpillar is walking.
    for (let i = 0; i < 3; i++) {
      const along = START_TREE.branchLength + this.rng.range(-0.4, 0.9);
      const twig = new THREE.CylinderGeometry(
        0.05,
        0.08,
        this.rng.range(0.7, 1.3),
        5,
      );
      twig.rotateZ(this.rng.range(-0.9, 0.9));
      twig.rotateX(this.rng.range(-0.9, 0.9));
      twig.translate(
        this.branchDir.x * along,
        this.branchAxisY + 0.3,
        this.branchDir.y * along,
      );
      parts.push(paint(twig, TRUNK_DARK));
    }
    for (let i = 0; i < 3; i++) {
      const along = START_TREE.branchLength + this.rng.range(0.2, 1.4);
      const tuft = new THREE.IcosahedronGeometry(this.rng.range(0.5, 0.85), 0);
      tuft.translate(
        this.branchDir.x * along + this.rng.range(-0.5, 0.5),
        this.branchAxisY + this.rng.range(0.2, 0.9),
        this.branchDir.y * along + this.rng.range(-0.5, 0.5),
      );
      parts.push(paint(tuft, this.rng.pick(CROWN_COLOURS)));
    }
    return parts;
  }

  /**
   * Hangs small fruit branches up a trunk, between `from` and `to`.
   *
   * `reachable` says whether their tips should be offered to the food field:
   * a branch on a tree outside the playable disc is scenery, and fruit on it
   * would be a quota the player could never fill.
   */
  private addFruitBranches(
    parts: Array<THREE.BufferGeometry>,
    x: number,
    z: number,
    trunkRadius: number,
    from: number,
    to: number,
    reachable: boolean,
    trunk: Climbable,
  ): void {
    // A branch rises as it runs out, so its tip ends up higher than the point
    // it leaves the trunk. Without allowing for that, the topmost branch puts
    // its fruit above the highest the player can climb — visible, and
    // impossible.
    const top = to - Math.sin(TREE_BRANCH.rise) * TREE_BRANCH.lengthMax;
    if (top <= from) {
      return;
    }
    const count = this.rng.int(TREE_BRANCH.countMin, TREE_BRANCH.countMax);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      // Spread up the trunk rather than placed at random, so there is always
      // one low enough to be seen from the ground and the rest reward a climb.
      const t = (i + this.rng.range(0.15, 0.85)) / count;
      const y = THREE.MathUtils.lerp(from, top, t);
      const angle = this.rng.next() * Math.PI * 2;
      const length = this.rng.range(
        TREE_BRANCH.lengthMin,
        TREE_BRANCH.lengthMax,
      );
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

      const start = new THREE.Vector3(
        x + dir.x * trunkRadius * 0.75,
        y,
        z + dir.z * trunkRadius * 0.75,
      );
      const end = start
        .clone()
        .addScaledVector(dir, Math.cos(TREE_BRANCH.rise) * length)
        .setY(y + Math.sin(TREE_BRANCH.rise) * length);

      const axis = end.clone().sub(start);
      const bough = new THREE.CylinderGeometry(
        TREE_BRANCH.tipRadius,
        TREE_BRANCH.baseRadius,
        axis.length(),
        6,
      );
      // Built up the Y axis, so it is swung onto the branch's own line.
      bough.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(up, axis.clone().normalize()),
      );
      bough.translate(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        (start.z + end.z) / 2,
      );
      parts.push(paint(bough, TRUNK_DARK));

      // A tuft of leaves past the tip, so the branch isn't a bare spike. It
      // sits beyond the fruit rather than over it, or it would hide the very
      // thing the branch is there to show.
      const tuft = new THREE.IcosahedronGeometry(this.rng.range(0.34, 0.5), 0);
      tuft.translate(end.x + dir.x * 0.3, end.y + 0.16, end.z + dir.z * 0.3);
      parts.push(paint(tuft, this.rng.pick(CROWN_COLOURS)));

      if (reachable) {
        this.fruitSpots.push(
          new THREE.Vector3(end.x, end.y - TREE_BRANCH.fruitDrop, end.z),
        );
        // Only reachable branches are crawlable. Making the scenery ring
        // walkable would cost a surface test per branch per step for boughs no
        // player can ever stand on.
        this.boughs.push({
          base: start.clone(),
          dir: new THREE.Vector2(dir.x, dir.z),
          gradient: Math.tan(TREE_BRANCH.rise),
          length: Math.cos(TREE_BRANCH.rise) * length,
          startAlong: 0,
          radiusBase: TREE_BRANCH.baseRadius,
          radiusTip: TREE_BRANCH.tipRadius,
          walkWidth: TREE_BRANCH.walkWidth,
          trunk: trunk,
        });
      }
    }
  }

  private buildTrees(): void {
    const parts: Array<THREE.BufferGeometry> = [];

    const place = (x: number, z: number, scale: number): void => {
      // A high canopy, deliberately. The camera rides several units up, and a
      // lower canopy puts it inside the leaves — which reads as the screen
      // going dark for no reason the player can see.
      const height = this.rng.range(15, 20) * scale;
      const radius = this.rng.range(0.75, 1.15) * scale;

      const trunk = new THREE.CylinderGeometry(radius * 0.8, radius, height, 9);
      trunk.translate(x, height / 2, z);
      parts.push(paint(trunk, this.rng.pick([TRUNK_COLOUR, TRUNK_DARK])));

      let lowestFoliage = Infinity;
      const blobs = this.rng.int(3, 5);
      for (let i = 0; i < blobs; i++) {
        const r = this.rng.range(2.2, 3.6) * scale;
        // Never below the trunk top, for the same reason the trunks are tall.
        const y = height + this.rng.range(0, 2.2) * scale;
        const blob = new THREE.IcosahedronGeometry(r, 1);
        blob.translate(
          x + this.rng.range(-1.8, 1.8) * scale,
          y,
          z + this.rng.range(-1.8, 1.8) * scale,
        );
        parts.push(paint(blob, this.rng.pick(CROWN_COLOURS)));
        lowestFoliage = Math.min(lowestFoliage, y - r);
      }

      const climbTop = Math.max(2, lowestFoliage - CLIMB.canopyClearance);
      const trunkInfo: Climbable = {
        x,
        z,
        radius,
        climbTop,
        isStartTree: false,
      };
      this.addFruitBranches(
        parts,
        x,
        z,
        radius,
        TREE_BRANCH.lowest,
        climbTop - 0.5,
        Math.hypot(x, z) < WORLD.radius - 2,
        trunkInfo,
      );
      this.climbables.push(trunkInfo);
      this.treeSpots.push({
        x,
        z,
        top: height * 0.5,
        radius: radius * 2.6,
        trunkRadius: radius,
        climbTop,
      });
    };

    // Trees about the wood, kept off the middle so the start branch has
    // somewhere to reach out over, and out of the grass clearing entirely.
    for (let i = 0; i < WORLD.trees; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 20; tries++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = this.rng.range(WORLD.treeInnerRadius, WORLD.radius - 3);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (!this.inClearing(x, z, CLEARING.margin)) {
          break;
        }
      }
      if (this.inClearing(x, z, CLEARING.margin)) {
        continue;
      }
      place(x, z, this.rng.range(1.0, 1.3));
    }

    // A dense ring just outside the playable edge. This is what makes it read
    // as a small forest rather than a green disc: you can never see out.
    const ring = 46;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + this.rng.range(-0.05, 0.05);
      const r = WORLD.radius + this.rng.range(2, 9);
      place(Math.cos(a) * r, Math.sin(a) * r, this.rng.range(1.0, 1.5));
    }

    const merged = mergeGeometries(parts);
    if (merged) {
      this.group.add(new THREE.Mesh(merged, this.fade.material));
    }
  }

  private buildBushes(): void {
    const parts: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < WORLD.bushes; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(6, WORLD.radius - 4);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.inClearing(x, z)) {
        continue;
      }
      const size = this.rng.range(1.1, 2.0);

      for (let j = 0; j < 3; j++) {
        const blob = new THREE.IcosahedronGeometry(
          size * this.rng.range(0.6, 1),
          1,
        );
        blob.translate(
          x + this.rng.range(-size, size) * 0.6,
          size * this.rng.range(0.5, 0.85),
          z + this.rng.range(-size, size) * 0.6,
        );
        parts.push(paint(blob, this.rng.pick(BUSH_COLOURS)));
      }
      // Bushes are food furniture, not obstacles — a caterpillar crawls
      // straight through a bush, and being stopped by one would be baffling.
      this.bushSpots.push({x, z, top: size * 1.3, radius: size});
    }
    const merged = mergeGeometries(parts);
    if (merged) {
      this.group.add(new THREE.Mesh(merged, this.fade.material));
    }
  }
}
