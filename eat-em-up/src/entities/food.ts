import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  CLEARING,
  FOOD,
  FOOD_KINDS,
  FOOD_SURPLUS,
  GOAL,
  FoodKind,
  START_TREE,
  WORLD,
} from "../config";
import {paint, vertexToon} from "../render/materials";
import {Rng} from "../core/rng";
import {Forest} from "./forest";

/** One thing you can eat. */
interface Item {
  kind: FoodKind;
  /** Which InstancedMesh it belongs to, and where in it. */
  variant: number;
  index: number;
  position: THREE.Vector3;
  scale: number;
  /** Offsets the sway so a bush of berries doesn't move as one lump. */
  phase: number;
  eaten: boolean;
  /** Counts down while an eaten item shrinks away. */
  vanish: number;
}

interface Variant {
  kind: FoodKind;
  geometry: THREE.BufferGeometry;
  mesh: THREE.InstancedMesh;
  items: Array<Item>;
}

/**
 * Everything edible in the forest.
 *
 * Each variety is one InstancedMesh, so three hundred pieces of food cost a
 * dozen draw calls. An eaten item is scaled to zero rather than removed —
 * an InstancedMesh has no way to skip an instance.
 */
export class FoodField {
  readonly group = new THREE.Group();

  /** How many of each kind have been eaten. */
  readonly eaten: Record<FoodKind, number> = {
    leaf: 0,
    flower: 0,
    berry: 0,
    fruit: 0,
    grass: 0,
  };

  private readonly variants: Array<Variant> = [];
  private readonly items: Array<Item> = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly scaleVec = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private clock = 0;

  constructor(
    private readonly rng: Rng,
    private readonly forest: Forest,
  ) {
    this.build();
  }

  /** How many of `kind` are still out there to be found. */
  remaining(kind: FoodKind): number {
    let n = 0;
    for (const item of this.items) {
      if (item.kind === kind && !item.eaten) {
        n++;
      }
    }
    return n;
  }

  /** Every kind's quota met? */
  get complete(): boolean {
    return FOOD_KINDS.every(kind => this.eaten[kind] >= GOAL[kind]);
  }

  get total(): number {
    return FOOD_KINDS.reduce((sum, kind) => sum + this.eaten[kind], 0);
  }

  /**
   * How far through the whole job you are, 0 to 1: the average of your
   * progress toward each quota, with anything past a quota not counting.
   *
   * Not the raw count of things eaten. A single pass through the meadow cuts
   * something like 155 tufts, which of a plain total would be half the game
   * gone in two seconds — you would be fully grown before you had found a
   * berry. Capping each kind at its own quota means the meadow can only ever
   * be a fifth of your growth, however much of it you eat.
   */
  get progress(): number {
    const sum = FOOD_KINDS.reduce(
      (acc, kind) => acc + Math.min(1, this.eaten[kind] / GOAL[kind]),
      0,
    );
    return sum / FOOD_KINDS.length;
  }

  /**
   * Eats anything the mouth is touching. Returns the kind swallowed, or null.
   *
   * Only one bite a step: swallowing a whole bush at once would rob the HUD of
   * its tick-up, which is most of the reward.
   */
  bite(
    mouth: THREE.Vector3,
    reach: number,
    headRadius: number,
  ): FoodKind | null {
    for (const item of this.items) {
      if (item.eaten) {
        continue;
      }
      const dx = item.position.x - mouth.x;
      const dz = item.position.z - mouth.z;
      const dy = item.position.y - mouth.y;
      // Generous vertically, and more so the bigger it is: a caterpillar on
      // the floor should still get the berry just above its head, and a fully
      // grown one stands high enough that a fixed allowance would put whatever
      // it is standing over out of its own reach.
      const vertical = FOOD.biteHeight + headRadius * FOOD.biteHeightPerRadius;
      if (Math.abs(dy) > vertical) {
        continue;
      }
      const r =
        item.kind === "grass"
          ? headRadius * FOOD.grassTouch
          : reach + item.scale * FOOD.biteRadius;
      if (dx * dx + dz * dz < r * r) {
        item.eaten = true;
        item.vanish = FOOD.vanish;
        this.eaten[item.kind]++;
        return item.kind;
      }
    }
    return null;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const variant of this.variants) {
      for (const item of variant.items) {
        if (item.eaten && item.vanish <= 0) {
          continue;
        }
        if (item.eaten) {
          item.vanish -= dt;
        }
        this.writeMatrix(variant, item);
      }
      variant.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private writeMatrix(variant: Variant, item: Item): void {
    let scale = item.scale;
    if (item.eaten) {
      // Shrink to nothing, with a little pop up in size first so a bite reads
      // as a bite rather than as the food quietly disappearing.
      const t = Math.max(0, item.vanish / FOOD.vanish);
      scale *= t < 0.7 ? t / 0.7 : 1 + (1 - t) * 1.6;
      if (item.vanish <= 0) {
        scale = 0;
      }
    }
    const sway =
      Math.sin(this.clock * FOOD.swayRate + item.phase) * FOOD.swayAmount;
    this.quat.setFromAxisAngle(this.up, item.phase + sway);
    this.scaleVec.set(scale, scale, scale);
    this.matrix.compose(item.position, this.quat, this.scaleVec);
    variant.mesh.setMatrixAt(item.index, this.matrix);
  }

  // ---- building -----------------------------------------------------------

  private build(): void {
    const geometries = this.buildGeometries();
    // Positions first, then one mesh per variety sized to what landed in it.
    const placed: Array<Array<Item>> = geometries.map(() => []);

    const add = (
      kind: FoodKind,
      variant: number,
      x: number,
      y: number,
      z: number,
      scale: number,
    ): void => {
      const item: Item = {
        kind,
        variant,
        index: placed[variant].length,
        position: new THREE.Vector3(x, y, z),
        scale,
        phase: this.rng.next() * Math.PI * 2,
        eaten: false,
        vanish: 0,
      };
      placed[variant].push(item);
      this.items.push(item);
    };

    this.placeLeaves(geometries, add);
    this.placeFlowers(geometries, add);
    this.placeBerries(geometries, add);
    this.placeFruits(geometries, add);
    this.placeGrass(geometries, add);

    for (let v = 0; v < geometries.length; v++) {
      const items = placed[v];
      // Nothing edible fades, grass included.
      //
      // Grass was on the wood's fading material for a while, on the grounds
      // that it stands taller than the caterpillar. It does — but the
      // caterpillar crawls *inside* the meadow rather than behind it, so its
      // own depth sits among the blades and the whole meadow dissolved at
      // once. A trunk is something you look past; grass is something you are
      // in.
      const mesh = new THREE.InstancedMesh(
        geometries[v].geometry,
        vertexToon(),
        Math.max(1, items.length),
      );
      // Food is scattered across the whole wood, so a bounding sphere fitted to
      // the instances is useless for culling and only risks popping it out of
      // view; frustum culling off is the cheaper, safer answer.
      mesh.frustumCulled = false;
      const variant: Variant = {
        kind: geometries[v].kind,
        geometry: geometries[v].geometry,
        mesh,
        items,
      };
      this.variants.push(variant);
      this.group.add(mesh);
      for (const item of items) {
        this.writeMatrix(variant, item);
      }
      // An unused tail instance would otherwise draw at the origin at full
      // size, so anything spare is scaled away.
      for (let i = items.length; i < mesh.count; i++) {
        this.matrix.compose(
          new THREE.Vector3(),
          this.quat.identity(),
          this.scaleVec.set(0, 0, 0),
        );
        mesh.setMatrixAt(i, this.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private count(kind: FoodKind): number {
    return Math.round(GOAL[kind] * FOOD_SURPLUS);
  }

  /** A point on open floor, clear of the start tree. */
  private openFloor(minR: number, maxR: number): THREE.Vector2 {
    for (let tries = 0; tries < 24; tries++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(minR, maxR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x, z) > START_TREE.trunkRadius + 1.5) {
        return new THREE.Vector2(x, z);
      }
    }
    return new THREE.Vector2(minR, 0);
  }

  private placeLeaves(
    geos: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}>,
    add: AddFn,
  ): void {
    const variants = indicesOf(geos, "leaf");
    const total = this.count("leaf");

    // A fifth of them on the branch you start on, so the very first thing you
    // do is eat, before you have worked out how to get down.
    const onBranch = Math.round(total * 0.2);
    for (let i = 0; i < onBranch; i++) {
      const p = this.forest.branchPoint(
        this.rng.range(0.08, 0.98),
        this.rng.range(-0.35, 0.35),
      );
      add(
        "leaf",
        this.rng.pick(variants),
        p.x,
        p.y + 0.14,
        p.z,
        this.rng.range(0.85, 1.15),
      );
    }

    // A quarter of them up the trunks, which is the reward for climbing: the
    // best patch of leaves in the wood is never on the floor.
    const climbable = this.forest.treeSpots.filter(
      s => (s.climbTop ?? 0) > 3 && Math.hypot(s.x, s.z) < WORLD.radius - 2,
    );
    const upTrees = Math.round(total * 0.25);
    for (let i = 0; i < upTrees && climbable.length > 0; i++) {
      const tree = this.rng.pick(climbable);
      const a = this.rng.next() * Math.PI * 2;
      // Just off the bark, where a climbing caterpillar's mouth passes.
      const r = (tree.trunkRadius ?? 1) + 0.32;
      add(
        "leaf",
        this.rng.pick(variants),
        tree.x + Math.cos(a) * r,
        this.rng.range(1.6, tree.climbTop ?? 6),
        tree.z + Math.sin(a) * r,
        this.rng.range(0.8, 1.2),
      );
    }

    // The rest around the skirts of bushes, low enough to reach from the floor.
    for (let i = onBranch + upTrees; i < total; i++) {
      if (this.rng.next() < 0.65 && this.forest.bushSpots.length > 0) {
        const bush = this.rng.pick(this.forest.bushSpots);
        const a = this.rng.next() * Math.PI * 2;
        const r = bush.radius * this.rng.range(0.7, 1.25);
        add(
          "leaf",
          this.rng.pick(variants),
          bush.x + Math.cos(a) * r,
          this.rng.range(0.25, 0.95),
          bush.z + Math.sin(a) * r,
          this.rng.range(0.8, 1.2),
        );
      } else {
        const p = this.openFloor(4, WORLD.radius - 2);
        add(
          "leaf",
          this.rng.pick(variants),
          p.x,
          0.2,
          p.y,
          this.rng.range(0.8, 1.2),
        );
      }
    }
  }

  private placeFlowers(
    geos: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}>,
    add: AddFn,
  ): void {
    const variants = indicesOf(geos, "flower");
    const total = this.count("flower");
    // In patches rather than evenly: a meadow of one colour is a nicer thing
    // to find than the same flowers spread thinly everywhere.
    let placed = 0;
    while (placed < total) {
      const centre = this.openFloor(6, WORLD.radius - 4);
      const variant = this.rng.pick(variants);
      const clump = Math.min(total - placed, this.rng.int(3, 7));
      for (let i = 0; i < clump; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = this.rng.range(0, 2.6);
        add(
          "flower",
          variant,
          centre.x + Math.cos(a) * r,
          0.32,
          centre.y + Math.sin(a) * r,
          this.rng.range(0.85, 1.15),
        );
        placed++;
      }
    }
  }

  private placeBerries(
    geos: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}>,
    add: AddFn,
  ): void {
    const variants = indicesOf(geos, "berry");
    const total = this.count("berry");
    let placed = 0;
    while (placed < total) {
      const bush = this.rng.pick(this.forest.bushSpots);
      const variant = this.rng.pick(variants);
      // Berries come in bunches on one bush, all the same kind.
      const bunch = Math.min(total - placed, this.rng.int(3, 6));
      for (let i = 0; i < bunch; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = bush.radius * this.rng.range(0.55, 1.1);
        add(
          "berry",
          variant,
          bush.x + Math.cos(a) * r,
          this.rng.range(0.4, 1.15),
          bush.z + Math.sin(a) * r,
          this.rng.range(0.9, 1.2),
        );
        placed++;
      }
    }
  }

  private placeFruits(
    geos: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}>,
    add: AddFn,
  ): void {
    const variants = indicesOf(geos, "fruit");
    const total = this.count("fruit");

    // Most of it hangs off the branches, which is the whole reason to climb.
    // Each branch tip takes one fruit, and they are dealt out from a shuffled
    // list so the same trees aren't loaded every game.
    const tips = [...this.forest.fruitSpots];
    for (let i = tips.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [tips[i], tips[j]] = [tips[j], tips[i]];
    }
    const onBranches = Math.min(tips.length, Math.round(total * 0.6));
    for (let i = 0; i < onBranches; i++) {
      const tip = tips[i];
      add(
        "fruit",
        this.rng.pick(variants),
        tip.x,
        tip.y,
        tip.z,
        this.rng.range(0.85, 1.05),
      );
    }

    // The rest lies fallen on the floor, so there is fruit to eat before a
    // player has worked out that trees can be climbed at all.
    for (let i = onBranches; i < total; i++) {
      // Fallen fruit, lying under a tree. It is the only honest way to put an
      // apple within reach of something that cannot climb.
      if (this.rng.next() < 0.7 && this.forest.treeSpots.length > 0) {
        const tree = this.rng.pick(this.forest.treeSpots);
        const a = this.rng.next() * Math.PI * 2;
        const r = tree.radius * this.rng.range(0.9, 2.4);
        const x = tree.x + Math.cos(a) * r;
        const z = tree.z + Math.sin(a) * r;
        if (Math.hypot(x, z) < WORLD.radius - 1.5) {
          add(
            "fruit",
            this.rng.pick(variants),
            x,
            0.3,
            z,
            this.rng.range(0.9, 1.15),
          );
          continue;
        }
      }
      const p = this.openFloor(5, WORLD.radius - 3);
      add(
        "fruit",
        this.rng.pick(variants),
        p.x,
        0.3,
        p.y,
        this.rng.range(0.9, 1.15),
      );
    }
  }

  private placeGrass(
    geos: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}>,
    add: AddFn,
  ): void {
    const variants = indicesOf(geos, "grass");
    // Density comes from the clearing, not from the quota — see CLEARING.tufts.
    for (let i = 0; i < CLEARING.tufts; i++) {
      // Square-rooted so the tufts spread evenly over the clearing's area
      // rather than bunching in the middle of it.
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * CLEARING.radius;
      add(
        "grass",
        this.rng.pick(variants),
        CLEARING.x + Math.cos(a) * r,
        0,
        CLEARING.z + Math.sin(a) * r,
        this.rng.range(0.8, 1.2),
      );
    }
  }

  // ---- the food itself ----------------------------------------------------

  private buildGeometries(): Array<{
    kind: FoodKind;
    geometry: THREE.BufferGeometry;
  }> {
    const out: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}> = [];

    // Yellow-greens, deliberately: a leaf the same green as the forest floor is
    // food the player cannot find.
    for (const colour of [0xa8d94b, 0xc2e85f, 0x93cc3e]) {
      out.push({kind: "leaf", geometry: makeLeaf(colour)});
    }
    for (const colour of [0xf2809f, 0xfff0f5, 0xffd94a, 0xb38fe0, 0x8fc7ff]) {
      out.push({kind: "flower", geometry: makeFlower(colour)});
    }
    for (const colour of [0xd8344a, 0x4a5fd8, 0x3a2350]) {
      out.push({kind: "berry", geometry: makeBerry(colour)});
    }
    for (const colour of [0x8fd155, 0x7ab942, 0xa6de63]) {
      out.push({kind: "grass", geometry: makeGrassTuft(colour, this.rng)});
    }
    out.push({kind: "fruit", geometry: makeApple()});
    out.push({kind: "fruit", geometry: makeStrawberry()});
    out.push({kind: "fruit", geometry: makeBlackberry()});
    out.push({kind: "fruit", geometry: makePeach()});

    return out;
  }
}

type AddFn = (
  kind: FoodKind,
  variant: number,
  x: number,
  y: number,
  z: number,
  scale: number,
) => void;

function indicesOf(
  geos: Array<{kind: FoodKind; geometry: THREE.BufferGeometry}>,
  kind: FoodKind,
): Array<number> {
  const out: Array<number> = [];
  geos.forEach((g, i) => {
    if (g.kind === kind) {
      out.push(i);
    }
  });
  return out;
}

function merged(parts: Array<THREE.BufferGeometry>): THREE.BufferGeometry {
  const geo = mergeGeometries(parts);
  if (!geo) {
    throw new Error("could not merge food geometry");
  }
  return geo;
}

/**
 * A leaf on a short stalk, the blade shaped the way the bee game shapes its:
 * a sphere squashed flat and drawn out along one axis, tilted a little so it
 * never reads as a flat disc. The stalk is this game's own addition — these
 * ones sit on the forest floor, and the stem is what tells you it is a leaf
 * rather than a smear of paint on the grass.
 */
function makeLeaf(colour: number): THREE.BufferGeometry {
  const blade = new THREE.SphereGeometry(0.26, 8, 6);
  blade.scale(1.5, 0.16, 0.7);
  blade.rotateZ(0.35);
  blade.rotateY(Math.PI / 2);
  blade.translate(0, 0.24, 0.14);
  const stalk = new THREE.CylinderGeometry(0.025, 0.03, 0.3, 5);
  stalk.translate(0, 0.15, -0.28);
  return merged([paint(blade, colour), paint(stalk, 0x4a7c2f)]);
}

/** Five petals round a middle, on a stem. */
function makeFlower(colour: number): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.16, 6, 5);
    petal.scale(1, 0.4, 1.35);
    petal.translate(0, 0, 0.2);
    petal.rotateY(a);
    petal.translate(0, 0.42, 0);
    parts.push(paint(petal, colour));
  }
  const middle = new THREE.SphereGeometry(0.1, 7, 6);
  // 0.02 proud of the petals: they are all round the same centre and would
  // otherwise z-fight where they meet.
  middle.translate(0, 0.44, 0);
  parts.push(paint(middle, 0xffc531));

  const stem = new THREE.CylinderGeometry(0.03, 0.035, 0.44, 5);
  stem.translate(0, 0.22, 0);
  parts.push(paint(stem, 0x4a8b3d));
  return merged(parts);
}

function makeBerry(colour: number): THREE.BufferGeometry {
  const berry = new THREE.SphereGeometry(0.17, 8, 7);
  berry.translate(0, 0.17, 0);
  const stalk = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 4);
  stalk.translate(0, 0.36, 0);
  return merged([paint(berry, colour), paint(stalk, 0x5a7c3a)]);
}

/**
 * A tuft of tall grass: a handful of blades leaning different ways.
 *
 * Built from the tuft's base upward, because that is the point the caterpillar
 * is measured against — the blades themselves stand well over its head.
 */
function makeGrassTuft(colour: number, rng: Rng): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < CLEARING.bladesPerTuft; i++) {
    const height = rng.range(CLEARING.bladeMin, CLEARING.bladeMax);
    // Tapered to a point at the top, which is what makes it read as a blade
    // rather than a stick.
    const blade = new THREE.CylinderGeometry(0.008, 0.055, height, 3);
    blade.translate(0, height / 2, 0);
    // Leaned over, and further over the taller it is, so the tuft splays.
    blade.rotateZ(rng.range(-0.34, 0.34));
    blade.rotateX(rng.range(-0.34, 0.34));
    blade.rotateY(rng.next() * Math.PI * 2);
    blade.translate(rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18));
    // The tips catch the light, so the meadow isn't one flat green.
    parts.push(paint(blade, i % 3 === 0 ? lighten(colour) : colour));
  }
  return merged(parts);
}

/** A shade up from a colour, for grass tips. */
function lighten(colour: number): number {
  const c = new THREE.Color(colour);
  c.offsetHSL(0.02, 0, 0.09);
  return c.getHex();
}

function makeApple(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.3, 10, 8);
  body.scale(1, 0.92, 1);
  body.translate(0, 0.29, 0);
  const stalk = new THREE.CylinderGeometry(0.024, 0.024, 0.16, 4);
  stalk.translate(0, 0.6, 0);
  const leaf = new THREE.SphereGeometry(0.11, 6, 5);
  leaf.scale(0.7, 0.25, 1.4);
  leaf.translate(0, 0.62, 0.12);
  return merged([
    paint(body, 0xe03a3a),
    paint(stalk, 0x6b4a2f),
    paint(leaf, 0x5da048),
  ]);
}

/** Wild strawberry: small, pointed, with a green cap. */
function makeStrawberry(): THREE.BufferGeometry {
  const body = new THREE.ConeGeometry(0.21, 0.42, 9);
  // Point down, the way a strawberry hangs.
  body.rotateX(Math.PI);
  body.translate(0, 0.23, 0);
  const cap = new THREE.SphereGeometry(0.16, 7, 5);
  cap.scale(1, 0.35, 1);
  cap.translate(0, 0.44, 0);
  const stalk = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4);
  stalk.translate(0, 0.52, 0);
  return merged([
    paint(body, 0xe33f4e),
    paint(cap, 0x4f9740),
    paint(stalk, 0x5a7c3a),
  ]);
}

/** Blackberry: a clump of little dark drupelets. */
function makeBlackberry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const drupelets = 11;
  for (let i = 0; i < drupelets; i++) {
    // A spiral round a squat egg, which is close enough to the real thing at
    // the size this is ever seen.
    const t = i / drupelets;
    const a = t * Math.PI * 2 * 3.1;
    const y = 0.12 + t * 0.3;
    const r = 0.17 * Math.sin(Math.PI * (0.25 + t * 0.7));
    const bud = new THREE.SphereGeometry(0.085, 6, 5);
    bud.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    parts.push(paint(bud, i % 3 === 0 ? 0x3d2a55 : 0x2a1b3d));
  }
  const cap = new THREE.SphereGeometry(0.12, 6, 5);
  cap.scale(1, 0.3, 1);
  cap.translate(0, 0.1, 0);
  parts.push(paint(cap, 0x4f7a3a));
  return merged(parts);
}

function makePeach(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.33, 10, 8);
  body.scale(1, 0.94, 1);
  body.translate(0, 0.32, 0);
  // A slightly proud crease down one side, the peach's seam.
  const crease = new THREE.SphereGeometry(0.34, 8, 7);
  crease.scale(0.1, 0.9, 1);
  crease.translate(0.3, 0.32, 0);
  const leaf = new THREE.SphereGeometry(0.12, 6, 5);
  leaf.scale(0.7, 0.25, 1.4);
  leaf.translate(0, 0.63, 0.1);
  return merged([
    paint(body, 0xffab6b),
    paint(crease, 0xf58a5a),
    paint(leaf, 0x5da048),
  ]);
}
