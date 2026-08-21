import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BOULDER,
  CLEARING,
  CLIMB,
  FADE,
  START_TREE,
  TREE_BRANCH,
  WORLD,
} from "../config";
import {paint, vertexToon} from "../render/materials";
import {fadeInFront, type NearFade} from "../../../shared/fadeInFront";
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

/**
 * A rock on the floor.
 *
 * Stored as the smooth dome the caterpillar walks over rather than as the
 * lumpy thing that is drawn: `radius` across at the ground, `height` at the
 * middle. A dome falls away to nothing at its own rim, which is the whole
 * reason for using one — there is no lip anywhere on a rock, so crawling off
 * one is a walk down a slope and never the fall off an edge that a branch is.
 */
export interface Boulder {
  x: number;
  z: number;
  radius: number;
  height: number;
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
  /**
   * The actual blobs a bush is made of. Food goes on their surfaces: a bush is
   * three lumps of foliage at odd offsets, so anything placed on a nominal
   * radius around the middle of it hangs in the air beside the leaves rather
   * than sitting in them.
   */
  blobs?: Array<{x: number; y: number; z: number; r: number}>;
}

const TRUNK_COLOUR = 0x9c7550;
const TRUNK_DARK = 0x82603f;
const CROWN_COLOURS = [0x6fbc52, 0x7fcc5e, 0x63ad49, 0x8ad866];
const BUSH_COLOURS = [0x5aa347, 0x66b350, 0x4f9440];
// Light, because the toon ramp darkens anything not facing the sun by a band
// and a half — at a true stone grey the rocks came out nearly black and read
// as holes in the ground rather than as stone standing on it.
const ROCK_COLOURS = [0xc3c2bc, 0xb4b6b0, 0xcecdc5, 0xa9aeaa];
const MOSS_COLOURS = [0x5f9c3f, 0x6cae49, 0x548c37];

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

  /** Rocks on the floor. Not solid — you go over them, not round them. */
  readonly boulders: Array<Boulder> = [];

  /** Trunks, crowns and bushes share one material so a single depth drives the
   *  whole wood's dissolve. */
  /** Where the fade is centred, in view space; see setFadeFocus. */
  private readonly fadeAt = new THREE.Vector3();

  private readonly fade: NearFade<THREE.MeshToonMaterial> = fadeInFront(
    vertexToon(),
    {
      band: FADE.band,
      cutoff: FADE.cutoff,
      cacheKey: "forestFade",
    },
  );

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
    // Last: rocks are placed in whatever room the trees and bushes left.
    this.buildBoulders();
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
    // A rock holds you up from wherever you are: unlike a bough there is no
    // underneath to walk along, and its top falls to the floor at its own rim,
    // so there is nothing to be teleported on top of.
    let best = this.boulderTopAt(x, z);
    for (const b of this.boughs) {
      const on = this.onBough(b, x, z);
      if (on && from >= on.top - 0.35 && on.top > best) {
        best = on.top;
      }
    }
    return best;
  }

  /**
   * How high the rock under (x, z) is, or 0 for open floor.
   *
   * A paraboloid, and not the ellipsoid it started as. An ellipsoid stands
   * vertically where it meets the floor, and a wall is not something a
   * caterpillar can walk up: it sank into the stone at the rim of the steeper
   * rocks and was stopped dead by one of them. A paraboloid's steepest point
   * is its rim, at a slope of twice the height over the radius, which is a
   * climb rather than a wall.
   *
   * Overlapping rocks take the higher of the two, which is what stops a pair
   * of them having a crevice between them for the caterpillar to drop into.
   */
  boulderTopAt(x: number, z: number): number {
    let top = 0;
    for (const b of this.boulders) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d >= b.radius) {
        continue;
      }
      const h = b.height * (1 - (d / b.radius) ** 2);
      if (h > top) {
        top = h;
      }
    }
    return top;
  }

  /**
   * Somewhere on a rock a mushroom can grow: round its shoulders and its foot.
   *
   * The forest decides this rather than the food field, because it is the
   * forest that knows the shape of a rock — and the answer has to be on the
   * stone, since a mushroom hanging beside one is exactly the floating food
   * the wood is not allowed to have.
   */
  mushroomSpot(b: Boulder, rng: Rng): {x: number; y: number; z: number} {
    const a = rng.next() * Math.PI * 2;
    const up = rng.range(0, BOULDER.mushroomBelow);
    // Out from the middle by however far the dome has come down by then.
    const out = Math.sqrt(1 - up) * b.radius * rng.range(0.9, 1.02);
    return {
      x: b.x + Math.cos(a) * out,
      y: b.height * up,
      z: b.z + Math.sin(a) * out,
    };
  }

  /** Whether (x, z) is on a rock, with `margin` of clearance around it. */
  onBoulder(x: number, z: number, margin = 0): boolean {
    return this.boulders.some(
      b => Math.hypot(x - b.x, z - b.z) < b.radius + margin,
    );
  }

  /**
   * A bough whose crawlable top is within `reach` of `pos`, ignoring `except`.
   *
   * This is what lets the caterpillar cross from one tree's branch to
   * another's where the two nearly meet, instead of dropping off the end of
   * the first. Returns where on it to stand.
   */
  boughStepAcross(
    pos: THREE.Vector3,
    reach: number,
    except: Bough | null,
  ): {bough: Bough; point: THREE.Vector3} | null {
    let best: {bough: Bough; point: THREE.Vector3} | null = null;
    let bestDist = reach;
    for (const b of this.boughs) {
      if (b === except) {
        continue;
      }
      const dx = pos.x - b.base.x;
      const dz = pos.z - b.base.z;
      // The nearest point on its crawlable centre line.
      const along = THREE.MathUtils.clamp(
        dx * b.dir.x + dz * b.dir.y,
        b.startAlong,
        b.length,
      );
      const point = new THREE.Vector3(
        b.base.x + b.dir.x * along,
        b.base.y + along * b.gradient + this.boughRadiusAt(b, along),
        b.base.z + b.dir.y * along,
      );
      const d = point.distanceTo(pos);
      if (d < bestDist) {
        best = {bough: b, point};
        bestDist = d;
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
      // The allowance is an angle about the trunk, turned into a distance at
      // whatever radius the caterpillar is actually clinging at — so getting
      // onto a branch is the same job however big it has grown.
      const cling = Math.hypot(pos.x - tree.x, pos.z - tree.z);
      const allowed = Math.max(
        TREE_BRANCH.boardAcrossMin,
        cling * Math.sin(TREE_BRANCH.boardAngle),
      );
      if (Math.abs(-dx * b.dir.y + dz * b.dir.x) > allowed) {
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
  setFadeFocus(
    eye: THREE.Vector3 | null,
    watching: THREE.Vector3,
    radius: number,
  ): void {
    if (eye === null) {
      this.fade.setSolid();
      return;
    }
    // The focus pulled a little toward the camera, so the thing being watched
    // is never caught by its own fade. A distance, not a fraction: at four
    // units away and again at forty it has to clear the same margin.
    const gap = eye.distanceTo(watching);
    this.fadeAt
      .copy(watching)
      .lerp(eye, gap > 0.01 ? Math.min(0.9, FADE.margin / gap) : 0);
    this.fade.setFocus(eye, this.fadeAt, radius);
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
    ground.receiveShadow = true;
    this.group.add(ground);

    // Scattered lighter patches, so the floor isn't one flat sheet of green.
    const patches: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < WORLD.groundPatches; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * WORLD.radius;
      const size = this.rng.range(1.4, 4.2);
      const patch = new THREE.CircleGeometry(size, 7);
      patch.rotateX(-Math.PI / 2);
      // 0.02 proud of the floor: coplanar faces z-fight, and that flicker is
      // far more obvious on a big flat area than the offset is. Patches
      // overlap each other too, so each gets its own storey — all 90 on one
      // plane hatched the overlaps with exactly the flicker the 0.02 avoids.
      patch.translate(
        Math.cos(a) * r,
        0.02 + i * WORLD.groundPatchStep,
        Math.sin(a) * r,
      );
      patches.push(paint(patch, this.rng.pick([0x7cb95f, 0x66a44c, 0x86c268])));
    }
    const merged = mergeGeometries(patches);
    if (merged) {
      const mesh = new THREE.Mesh(merged, vertexToon());
      mesh.receiveShadow = true;
      this.group.add(mesh);
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
      const mesh = new THREE.Mesh(merged, this.fade.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
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
        // Resting on top of the bough, somewhere along its length — which is
        // exactly where the caterpillar's feet go when it crawls out here.
        const t = this.rng.range(
          TREE_BRANCH.fruitAlongMin,
          TREE_BRANCH.fruitAlongMax,
        );
        const inset = length * t;
        this.fruitSpots.push(
          new THREE.Vector3(
            start.x + dir.x * Math.cos(TREE_BRANCH.rise) * inset,
            start.y +
              Math.sin(TREE_BRANCH.rise) * inset +
              THREE.MathUtils.lerp(
                TREE_BRANCH.baseRadius,
                TREE_BRANCH.tipRadius,
                t,
              ),
            start.z + dir.z * Math.cos(TREE_BRANCH.rise) * inset,
          ),
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
      const mesh = new THREE.Mesh(merged, this.fade.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /**
   * Rocks, with moss on the sunlit half of some and mushrooms round the foot
   * of others.
   *
   * Each is drawn as a lumpy ball squashed flat and sunk into the floor, and
   * walked as the smooth dome of the same size — see Boulder for why the two
   * are kept apart.
   */
  private buildBoulders(): void {
    const parts: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < BOULDER.count; i++) {
      const radius = this.rng.range(BOULDER.radiusMin, BOULDER.radiusMax);
      // Keep trying for somewhere this one fits rather than giving its place
      // up: taking the first throw and dropping it on a clash left the wood
      // with barely half the rocks it was asked for.
      let x = 0;
      let z = 0;
      let found = false;
      for (let tries = 0; tries < BOULDER.tries && !found; tries++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = this.rng.range(6, WORLD.radius - 4);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        found = this.roomForBoulder(x, z, radius);
      }
      if (!found) {
        continue;
      }
      const height =
        radius * this.rng.range(BOULDER.squashMin, BOULDER.squashMax);
      this.boulders.push({x, z, radius, height});

      // Drawn as the very surface it is walked on. A unit hemisphere has each
      // vertex at height cos(phi) and distance sin(phi) out; squaring the
      // height gives cos^2 = 1 - sin^2, which is the paraboloid boulderTopAt
      // returns. Anything else and the caterpillar walks a shape the rock is
      // not, floating over one part of it and buried in another.
      const rock = new THREE.SphereGeometry(
        1,
        12,
        6,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      );
      const pos = rock.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        // Lumps go inward only, never out. A dent leaves the caterpillar
        // riding a little above the stone, which nobody notices; a bulge puts
        // it inside the stone, which everybody does.
        const k = 1 - this.rng.next() * BOULDER.jitter;
        pos.setXYZ(v, pos.getX(v) * k, y * y * k, pos.getZ(v) * k);
      }
      rock.computeVertexNormals();
      rock.scale(radius, height, radius);
      // Rocks are sunk a little: one sitting exactly on the floor shows the
      // seam where its rim meets it, and a buried one reads as bedrock.
      rock.translate(x, -height * 0.12, z);
      parts.push(paint(rock, this.rng.pick(ROCK_COLOURS)));

      if (this.rng.next() < BOULDER.mossChance) {
        parts.push(...this.mossOn(x, z, radius, height));
      }
    }
    const merged = mergeGeometries(parts);
    if (merged) {
      // Not the fading material the trees use. A trunk dissolves because it is
      // tall enough to stand between you and the camera for a long time; a
      // rock is knee-high and you are usually on top of it, so fading one
      // would mostly mean the thing you are climbing disappearing under you.
      const mesh = new THREE.Mesh(merged, vertexToon());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** Whether a rock of this size fits here without crowding anything. */
  private roomForBoulder(x: number, z: number, radius: number): boolean {
    // The whole rock out of the meadow, not just its middle: one lapping over
    // the edge stands in grass that is eaten where it touches your head, and
    // the tufts inside its footprint cannot be got at.
    if (this.inClearing(x, z, CLEARING.margin + radius)) {
      return false;
    }
    // Never over the start branch: the first thing a player does is crawl off
    // the end of it, and landing on a rock is a strange way to begin.
    if (this.onBranch(x, z) || Math.hypot(x, z) < START_TREE.branchLength) {
      return false;
    }
    const clear = radius + BOULDER.spacing;
    for (const t of this.climbables) {
      if (Math.hypot(x - t.x, z - t.z) < clear + t.radius) {
        return false;
      }
    }
    for (const b of this.bushSpots) {
      if (Math.hypot(x - b.x, z - b.z) < clear + b.radius) {
        return false;
      }
    }
    for (const b of this.boulders) {
      if (Math.hypot(x - b.x, z - b.z) < clear + b.radius) {
        return false;
      }
    }
    return true;
  }

  /** Cushions of moss on the upper half of a rock, lying along its surface. */
  private mossOn(
    x: number,
    z: number,
    radius: number,
    height: number,
  ): Array<THREE.BufferGeometry> {
    const out: Array<THREE.BufferGeometry> = [];
    const n = this.rng.int(BOULDER.mossPatchesMin, BOULDER.mossPatchesMax);
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      // Up the dome rather than across the floor, so the patch lands on the
      // stone wherever on it the angle happens to fall. The rock is a
      // paraboloid, so at a height of `up` of the way to the top it is
      // sqrt(1 - up) of the way out — the ellipsoid's sqrt(1 - up squared)
      // put every cushion of moss either inside the stone or floating off it.
      const up = this.rng.range(BOULDER.mossAbove, 0.94);
      const out2 = Math.sqrt(1 - up);
      const size = radius * this.rng.range(0.18, 0.34);
      const patch = new THREE.IcosahedronGeometry(size, 1);
      // Flattened hard and sunk a little in, so it lies on the rock like a
      // cushion of moss rather than sitting on it like a green pebble.
      patch.scale(1, 0.3, 1);
      patch.translate(
        x + Math.cos(a) * out2 * radius,
        height * up - size * 0.1,
        z + Math.sin(a) * out2 * radius,
      );
      out.push(paint(patch, this.rng.pick(MOSS_COLOURS)));
    }
    return out;
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
      const blobs: Array<{x: number; y: number; z: number; r: number}> = [];

      for (let j = 0; j < 3; j++) {
        const br = size * this.rng.range(0.6, 1);
        const bx = x + this.rng.range(-size, size) * 0.6;
        const by = size * this.rng.range(0.5, 0.85);
        const bz = z + this.rng.range(-size, size) * 0.6;
        const blob = new THREE.IcosahedronGeometry(br, 1);
        blob.translate(bx, by, bz);
        blobs.push({x: bx, y: by, z: bz, r: br});
        parts.push(paint(blob, this.rng.pick(BUSH_COLOURS)));
      }
      // Bushes are food furniture, not obstacles — a caterpillar crawls
      // straight through a bush, and being stopped by one would be baffling.
      this.bushSpots.push({x, z, top: size * 1.3, radius: size, blobs});
    }
    const merged = mergeGeometries(parts);
    if (merged) {
      const mesh = new THREE.Mesh(merged, this.fade.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }
}
