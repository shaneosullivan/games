import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FADE, HOME, PROPS, WOOD} from "../config";
import {Rng} from "../core/rng";
import {PALETTE, paint, toonRamp, vertexToon} from "../render/materials";
import {fadeInFront, type NearFade} from "../../../shared/fadeInFront";

const TAU = Math.PI * 2;

/** What a thing in the wood does when you reach it. */
export type Kind = "solid" | "low" | "hollow";

export interface Obstacle {
  x: number;
  z: number;
  /** How far out it actually stops you, which is less than it looks. */
  radius: number;
  /**
   * The band of heights you cannot be in.
   *
   * `top` is the height you clear it at and `bore` the height you pass under
   * it at, so between the two is what actually stops you. A log is (0, 4.6):
   * nothing goes under, a jump goes over. A tree is (0, 99). A hollow log is
   * (3.9, 6.6) — you run straight through the middle of it, and jumping is
   * what catches you out, which makes it the one obstacle in this wood that
   * punishes the button instead of rewarding it.
   */
  top: number;
  bore: number;
  kind: Kind;
}

/**
 * The wood: the ground, the path through it, and everything standing in it.
 *
 * The ground is a function — heightAt — and the mesh is sampled off it.
 * Everything else asks the function rather than the mesh: the hare runs on it,
 * the dogs run on it, the trees are planted on it and the fireflies drift
 * above it. A model would have to be raycast a few hundred times a step to
 * answer the same questions.
 *
 * There is nothing invisible holding you in. The path wanders and the wood
 * thickens either side of it, and past a certain point the trunks are simply
 * too close together to run through — which is a wall a child never has to be
 * told about.
 */
export class Wood {
  readonly group = new THREE.Group();

  /** Where the burrow stands. */
  readonly homeZ = -(WOOD.length - HOME.bankAt);

  /** Everything you can run into, bucketed by how far down the wood it is, so
   *  a collision check looks at the dozen things nearby instead of all nine
   *  hundred. */
  private readonly buckets = new Map<number, Array<Obstacle>>();
  private static readonly BUCKET = 30;

  private readonly gradient = new THREE.Vector2();

  /**
   * One material for every solid thing in the wood, so a single dissolve
   * covers the lot. See setFadeFocus — this is what stops six hundred trees
   * from hiding the one animal you are steering.
   */
  private readonly fade: NearFade<THREE.MeshToonMaterial> = fadeInFront(
    vertexToon(),
    {band: FADE.band, cutoff: FADE.cutoff, cacheKey: "chaseWoodFade"},
  );
  private readonly fadeAt = new THREE.Vector3();

  constructor(rng: Rng) {
    this.group.add(this.buildGround());
    this.plantWood(rng);
    this.plantPath(rng);
    this.plantScenery(rng);
  }

  /**
   * The middle of the path at this point down the wood.
   *
   * Two waves whose lengths do not divide into one another, so the run never
   * repeats a shape a child could learn by heart — and, more to the point, so
   * the corners do not arrive on a beat.
   */
  pathAt(z: number): number {
    return (
      Math.sin(z / WOOD.meanderWave) * WOOD.meander +
      Math.sin(z / WOOD.meanderWave2 + 1.3) * WOOD.meander2
    );
  }

  /** How high the ground is here. Gentle: this is a wood floor, not a hill. */
  heightAt(x: number, z: number): number {
    return (
      Math.sin(z / WOOD.rollAlong) *
        Math.cos(x / WOOD.rollAcross) *
        WOOD.rollHeight +
      Math.sin(z / WOOD.rollAlong2 + 2.1) *
        Math.cos(x / WOOD.rollAcross2 + 0.7) *
        WOOD.rollHeight2
    );
  }

  /**
   * Which way the ground falls away here, as a 2D gradient.
   *
   * Sampled rather than differentiated, so the shape can change without a
   * second thing to keep in step with it.
   */
  slopeAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2 {
    const e = 1.5;
    return out.set(
      (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    );
  }

  steepness(x: number, z: number): number {
    return this.slopeAt(x, z, this.gradient).length();
  }

  /**
   * What is in the way, or null.
   *
   * `y` is how high off the ground the hare is: a log at five units is not in
   * the way of anything above five units, which is the whole of what makes
   * jumping worth doing. Three buckets are checked rather than one, because a
   * fast step crosses a bucket boundary and a thing sitting exactly on one
   * would otherwise be a ghost.
   */
  hit(x: number, z: number, radius: number, y: number): Obstacle | null {
    const key = Math.floor(z / Wood.BUCKET);
    for (let k = key - 1; k <= key + 1; k++) {
      const list = this.buckets.get(k);
      if (!list) {
        continue;
      }
      for (const o of list) {
        if (y > o.top || y < o.bore) {
          continue;
        }
        const reach = o.radius + radius;
        const dx = o.x - x;
        const dz = o.z - z;
        if (dx * dx + dz * dz < reach * reach) {
          return o;
        }
      }
    }
    return null;
  }

  /**
   * Dissolves whatever is between the eye and the hare.
   *
   * The focus is pulled a little toward the camera so the animal is never
   * caught by its own fade — a distance rather than a fraction, because at
   * twenty units away and again at forty it has to clear the same margin.
   */
  setFadeFocus(eye: THREE.Vector3, watching: THREE.Vector3): void {
    const gap = eye.distanceTo(watching);
    this.fadeAt
      .copy(watching)
      .lerp(eye, gap > 0.01 ? Math.min(0.9, FADE.margin / gap) : 0);
    this.fade.setFocus(eye, this.fadeAt, FADE.radius);
  }

  private remember(o: Obstacle): void {
    const key = Math.floor(o.z / Wood.BUCKET);
    const list = this.buckets.get(key);
    if (list) {
      list.push(o);
    } else {
      this.buckets.set(key, [o]);
    }
  }

  /**
   * The floor.
   *
   * Smooth-shaded, with the colour going deeper where the ground dips. A wood
   * floor lit through a canopy is mottled, and the mottling is what stops a
   * few hundred square metres of one green from reading as a carpet.
   */
  private buildGround(): THREE.Mesh {
    const zTop = 50;
    const zBottom = -WOOD.length;
    const along = Math.ceil((zTop - zBottom) / WOOD.cell);
    const across = Math.ceil((WOOD.halfWidth * 2) / WOOD.cell);

    const geo = new THREE.PlaneGeometry(
      WOOD.halfWidth * 2,
      zTop - zBottom,
      across,
      along,
    );
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, (zTop + zBottom) / 2);

    const pos = geo.attributes.position;
    const colour = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(PALETTE.grass).convertSRGBToLinear();
    const deep = new THREE.Color(PALETTE.grassDeep).convertSRGBToLinear();
    const earth = new THREE.Color(PALETTE.earth).convertSRGBToLinear();
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      // Deeper green in the hollows, and bare earth down the middle of the
      // path where a hundred years of hares have worn it through. The worn
      // strip is the one thing telling a child where to run.
      c.copy(grass);
      c.lerp(deep, Math.min(1, Math.max(0, 0.5 - h * 0.22)));
      const off = Math.abs(x - this.pathAt(z));
      // Only the middle of the path is worn through, and it does not go all
      // the way to bare: at full strength over eighty per cent of the path it
      // was a river of mud running down a green wood.
      c.lerp(
        earth,
        0.75 * Math.min(1, Math.max(0, 1 - off / (WOOD.pathHalf * 0.45))),
      );
      colour[i * 3] = c.r;
      colour[i * 3 + 1] = c.g;
      colour[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colour, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The trees.
   *
   * Thin along the path and thick outside it, thickening further the further
   * out you go: that gradient is the boundary of the game. Placed by drawing a
   * spot and throwing it away if it does not pass — rejecting is both shorter
   * to write and easier to change than any scheme that generates only legal
   * spots.
   */
  private plantWood(rng: Rng): void {
    const mesh = new THREE.InstancedMesh(
      treeGeometry(),
      this.fade.material,
      PROPS.trees,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // An InstancedMesh is culled against the bounds of its *geometry* — one
    // tree, at the origin — and not against where its instances are. Leave it
    // on and the whole wood vanishes the moment the first tree goes off the
    // back of the screen.
    mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    let placed = 0;
    let tries = 0;
    while (placed < PROPS.trees && tries < PROPS.trees * 40) {
      tries++;
      const z = rng.range(20, -WOOD.length + 20);
      const centre = this.pathAt(z);
      const x = centre + rng.range(-1, 1) * WOOD.halfWidth * 0.85;
      const off = Math.abs(x - centre);

      // The gradient. Nothing on the path itself; a scattering in the roaming
      // room either side; and out past that, everything.
      if (off < WOOD.pathHalf) {
        continue;
      }
      const chance =
        off < WOOD.roamHalf
          ? 0.12
          : Math.min(1, 0.35 + (off - WOOD.roamHalf) / 40);
      if (rng.next() > chance) {
        continue;
      }
      // Not on top of the burrow, or you cannot get home.
      if (z > this.homeZ - 30 && z < this.homeZ + 46 && Math.abs(x) < 52) {
        continue;
      }

      pos.set(x, this.heightAt(x, z) - 0.4, z);
      e.set(0, rng.range(0, TAU), 0);
      q.setFromEuler(e);
      const s = rng.range(0.8, 1.45);
      scale.set(s, rng.range(0.85, 1.25) * s, s);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(placed, m);
      this.remember({
        x,
        z,
        radius: 2.3 * s * PROPS.forgive,
        top: 99,
        bore: 0,
        kind: "solid",
      });
      placed++;
    }
    // Anything that never found a spot is scaled to nothing — an instanced
    // mesh cannot skip an instance, and a stack of unplaced trees at the
    // origin is the alternative.
    scale.setScalar(0);
    for (let i = placed; i < PROPS.trees; i++) {
      m.compose(pos.set(0, 0, 0), q.identity(), scale);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  /**
   * What is actually on the path: logs to jump, stones and brambles to go
   * round.
   *
   * Every one of them is placed on the path on purpose. A thing you can run
   * past without noticing is not an obstacle, and the plan asks for a game
   * about dodging.
   */
  private plantPath(rng: Rng): void {
    // `near` and `far` are how far off the middle of the path a thing may
    // stand, in path-widths: 0 to 1 is on it, 1 and up is out on the verge.
    const log = logGeometry();
    const stone = stoneGeometry();
    const bramble = brambleGeometry();
    const kinds = [
      // The two you cannot jump, first.
      //
      // Order matters here and it cost a measurement to find out: nothing may
      // stand within PROPS.spacing of anything else, and the path is only
      // fifty units wide — so whichever kind is placed last finds the path
      // already full. Put the trees at the end of the list and two of the
      // twenty-six found room. These are the ones that make you steer, so
      // they get first refusal and the clutter fills in around them.
      {
        count: PROPS.boulders,
        geo: boulderGeometry(),
        radius: 4.2,
        // Jumpable, like everything else on the path except the trees.
        //
        // Seven units, and the boulder was shrunk to match rather than the
        // number fudged: a hare's jump peaks between ten and twelve above the
        // grass, and at its old size the biggest boulders stood ten and a half
        // — clearing them would have come down to which end of the scale range
        // the generator happened to roll, which is the worst kind of unfair
        // because it looks like the same obstacle every time.
        top: 7,
        bore: 0,
        kind: "low" as Kind,
        across: false,
        near: 0.4,
        far: 2.1,
      },
      {
        count: PROPS.pathTrees,
        geo: pathTreeGeometry(),
        radius: 2.3,
        top: 99,
        bore: 0,
        kind: "solid" as Kind,
        across: false,
        near: 0,
        far: 0.9,
      },
      // The two interesting logs, and they go near the front of the queue for
      // the same reason the boulders do: nothing may stand within
      // PROPS.spacing of anything else, both of these sit in the narrow strip
      // down the middle of the path, and whatever is placed last finds that
      // strip full. Left at the end of the list, not one of the twelve hollow
      // logs found room.
      //
      // A big fallen tree with its branches still on it: longer and taller
      // than the ordinary log, so it is a jump you have to mean.
      {
        count: PROPS.longLogs,
        geo: longLogGeometry(),
        radius: 8.5,
        top: 6.4,
        bore: 0,
        kind: "low" as Kind,
        across: true,
        near: 0,
        far: 0.45,
      },
      // And a hollow one, which you go *through*. See Obstacle.top.
      {
        count: PROPS.hollowLogs,
        geo: hollowLogGeometry(),
        radius: 7,
        // No top: it is far too big to jump, and that is the point of it. The
        // tunnel is the only way past, so this is the one thing in the wood
        // where pressing the jump button is the wrong answer — at 6.6 it could
        // be cleared as well as gone through, which made it decoration.
        top: 99,
        bore: 4.6,
        kind: "hollow" as Kind,
        // Not "across": this one is already built pointing down the path, and
        // the small random yaw an across-log gets is exactly what it wants.
        across: true,
        near: 0,
        far: 0.5,
      },
      {
        count: PROPS.logs,
        geo: log,
        // Six, not nine: a log is a long thing and a circle is a round one,
        // and the circle has to match what a child can see or they get stopped
        // by a gap they were sure they had.
        radius: 6,
        top: 4.6,
        bore: 0,
        kind: "low" as Kind,
        // Logs lie across the path, so they are turned to face along it and
        // the whole width of them is in the way.
        across: true,
        near: 0,
        far: 0.5,
      },
      {
        count: PROPS.stones,
        geo: stone,
        radius: 3.1,
        // Clearable, like everything else on the path. Only the boulders and
        // the trees stop you outright: a hare that can jump ten units and
        // still gets pulled up short by a rock five high is a hare with a rule
        // nobody can guess.
        top: 6.8,
        bore: 0,
        kind: "low" as Kind,
        across: false,
        near: 0,
        far: 1,
      },
      {
        count: PROPS.brambles,
        geo: bramble,
        radius: 3.4,
        top: 5.6,
        bore: 0,
        kind: "low" as Kind,
        across: false,
        near: 0,
        far: 1.2,
      },
      // Then what is on the path, and the same three again out on the verges.
      {
        count: PROPS.vergeLogs,
        geo: log,
        radius: 6,
        top: 4.6,
        bore: 0,
        kind: "low" as Kind,
        across: false,
        near: 1,
        far: 2.3,
      },
      {
        count: PROPS.vergeStones,
        geo: stone,
        radius: 3.1,
        top: 6.8,
        bore: 0,
        kind: "low" as Kind,
        across: false,
        near: 1,
        far: 2.3,
      },
      {
        count: PROPS.vergeBrambles,
        geo: bramble,
        radius: 3.4,
        top: 5.6,
        bore: 0,
        kind: "low" as Kind,
        across: false,
        near: 1,
        far: 2.3,
      },
    ];

    for (const k of kinds) {
      const mesh = new THREE.InstancedMesh(k.geo, this.fade.material, k.count);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const pos = new THREE.Vector3();
      const scale = new THREE.Vector3();

      let placed = 0;
      let tries = 0;
      while (placed < k.count && tries < k.count * 80) {
        tries++;
        // Down to the burrow, not to the end of the ground: everything past
        // the hole is scenery nobody runs through.
        const z = rng.range(-PROPS.clearStart, this.homeZ + PROPS.clearEnd);
        const side = rng.next() < 0.5 ? -1 : 1;
        const x =
          this.pathAt(z) +
          side * rng.range(WOOD.pathHalf * k.near, WOOD.pathHalf * k.far);
        const s = rng.range(0.85, 1.25);

        // Nothing lands on top of anything else — including the wood's own
        // trees, which are already in the buckets by the time this runs.
        // Asking the collision list rather than keeping a second one of our
        // own means a boulder cannot end up inside a trunk, which is what
        // happened when the two were tracked separately.
        if (this.hit(x, z, PROPS.spacing, 0)) {
          continue;
        }
        const i = placed;
        placed++;

        pos.set(x, this.heightAt(x, z) - 0.2, z);
        // A log lies across the way you are going, give or take; everything
        // else is turned at random.
        e.set(0, k.across ? rng.range(-0.35, 0.35) : rng.range(0, TAU), 0);
        q.setFromEuler(e);
        scale.set(s, s, s);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
        this.remember({
          x,
          z,
          radius: k.radius * s * PROPS.forgive,
          top: k.top * s,
          bore: k.bore * s,
          kind: k.kind,
        });
      }
      // Anything that never found room is scaled to nothing — an instanced
      // mesh cannot skip an instance.
      scale.setScalar(0);
      for (let i = placed; i < k.count; i++) {
        m.compose(pos.set(0, 0, 0), q.identity(), scale);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  /** Toadstools and glowing caps. Nothing collides with these: they are the
   *  magic the plan asks for, and being tripped by magic is no fun. */
  private plantScenery(rng: Rng): void {
    const kinds = [
      {count: PROPS.toadstools, geo: toadstoolGeometry(), lit: false, clump: 1},
      // Grass grows in patches, not evenly over a wood, and a patch is the
      // only thing that reads as long grass from a moving camera — scattered
      // one at a time it is a field of little green spikes.
      {count: PROPS.grass, geo: grassGeometry(), lit: false, clump: 7},
      {count: PROPS.glowCaps, geo: glowCapGeometry(), lit: true, clump: 1},
    ];
    for (const k of kinds) {
      const mesh = new THREE.InstancedMesh(
        k.geo,
        k.lit
          ? // Unlit, so a glowing mushroom glows in the shade under a tree
            // rather than going the same colour as everything else there.
            new THREE.MeshBasicMaterial({vertexColors: true})
          : // On the same dissolving material as everything else. The grass in
            // particular had to join: it stands nine units tall, there are
            // eight hundred tufts of it, and it was the one thing left in the
            // wood that could stand between the camera and the hare and not
            // get out of the way.
            this.fade.material,
        k.count,
      );
      mesh.castShadow = !k.lit;
      mesh.frustumCulled = false;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const pos = new THREE.Vector3();
      const scale = new THREE.Vector3();

      let cx = 0;
      let cz = 0;
      for (let i = 0; i < k.count; i++) {
        if (i % k.clump === 0) {
          cz = rng.range(10, -WOOD.length + 20);
          cx = this.pathAt(cz) + rng.range(-1, 1) * WOOD.roamHalf * 1.6;
        }
        const spread = k.clump > 1 ? 9 : 0;
        const z = cz + rng.range(-spread, spread);
        const x = cx + rng.range(-spread, spread);
        pos.set(x, this.heightAt(x, z) - 0.15, z);
        e.set(0, rng.range(0, TAU), 0);
        q.setFromEuler(e);
        const s = rng.range(0.7, 1.4);
        scale.set(s, s, s);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }
}

/**
 * A tree: a trunk and three overlapping crowns.
 *
 * Three rather than one, because a single sphere on a stick is a lollipop and
 * three overlapping ones at different sizes is a tree — the overlap is the
 * whole of the difference.
 */
function treeGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const trunk = new THREE.CylinderGeometry(1, 1.6, 17, 7);
  trunk.translate(0, 8.5, 0);
  parts.push(paint(trunk, PALETTE.bark));

  const crowns = [
    {x: 0, y: 21, z: 0, r: 7, c: PALETTE.leaf},
    {x: 3.4, y: 17.6, z: 1.8, r: 5.2, c: PALETTE.leafDeep},
    {x: -2.9, y: 18.6, z: -2.4, r: 4.7, c: PALETTE.leafLight},
  ];
  for (const crown of crowns) {
    const blob = new THREE.IcosahedronGeometry(crown.r, 1);
    blob.scale(1, 0.85, 1);
    blob.translate(crown.x, crown.y, crown.z);
    parts.push(paint(blob, crown.c));
  }

  return mergeGeometries(parts, false);
}

/**
 * A tree standing on the path: the same tree on a much longer trunk.
 *
 * The shot rides seventeen units above the hare, and an ordinary tree's crown
 * starts at fifteen — so running under one put a wall of leaves across the top
 * third of the screen exactly where the next obstacle was. Up here the camera
 * goes under the branches and what you can see is what is coming.
 */
function pathTreeGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const trunk = new THREE.CylinderGeometry(1.1, 1.8, 28, 8);
  trunk.translate(0, 14, 0);
  parts.push(paint(trunk, PALETTE.bark));

  const crowns = [
    {x: 0, y: 33, z: 0, r: 8, c: PALETTE.leaf},
    {x: 4, y: 29, z: 2.2, r: 6, c: PALETTE.leafDeep},
    {x: -3.4, y: 30, z: -2.8, r: 5.4, c: PALETTE.leafLight},
  ];
  for (const crown of crowns) {
    const blob = new THREE.IcosahedronGeometry(crown.r, 1);
    blob.scale(1, 0.85, 1);
    blob.translate(crown.x, crown.y, crown.z);
    parts.push(paint(blob, crown.c));
  }

  return mergeGeometries(parts, false);
}

/** A fallen log, lying along +X so it can be turned across the path. */
function logGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const trunk = new THREE.CylinderGeometry(2.2, 2.4, 12, 9);
  trunk.rotateZ(Math.PI / 2);
  trunk.translate(0, 2.4, 0);
  parts.push(paint(trunk, PALETTE.bark));

  // The cut ends, a shade lighter and standing a hair proud, so the log has
  // ends rather than stopping.
  for (const side of [-1, 1]) {
    const end = new THREE.CylinderGeometry(2.25, 2.25, 0.5, 9);
    end.rotateZ(Math.PI / 2);
    end.translate(side * 6.1, 2.4, 0);
    parts.push(paint(end, PALETTE.barkDark));
  }

  // Moss along the top. It also tells you which way up it is at a glance,
  // which at sixty units a second is the only look you get.
  const moss = new THREE.CylinderGeometry(
    2.32,
    2.32,
    15,
    9,
    1,
    false,
    0.9,
    1.4,
  );
  moss.rotateZ(Math.PI / 2);
  moss.translate(0, 2.4, 0);
  parts.push(paint(moss, PALETTE.leafDeep));

  return mergeGeometries(parts, false);
}

/**
 * A big fallen tree, with the stumps of its branches still on it.
 *
 * Longer and thicker than the ordinary log, and the branches are the point:
 * they stick out past the trunk, so what you have to clear is visibly wider
 * than the log itself and you cannot sneak round the end of it.
 */
function longLogGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const trunk = new THREE.CylinderGeometry(2.7, 3, 19, 10);
  trunk.rotateZ(Math.PI / 2);
  trunk.translate(0, 3, 0);
  parts.push(paint(trunk, PALETTE.bark));

  for (const side of [-1, 1]) {
    const end = new THREE.CylinderGeometry(2.75, 2.75, 0.5, 10);
    end.rotateZ(Math.PI / 2);
    end.translate(side * 9.6, 3, 0);
    parts.push(paint(end, PALETTE.barkDark));
  }

  const stubs = [
    {x: -5, tilt: 0.9, turn: 0.5, len: 6},
    {x: 2, tilt: 1.1, turn: -0.7, len: 5},
    {x: 8, tilt: 0.7, turn: 0.2, len: 7},
  ];
  for (const stub of stubs) {
    const branch = new THREE.CylinderGeometry(0.55, 0.9, stub.len, 6);
    branch.translate(0, stub.len / 2, 0);
    branch.rotateX(stub.turn);
    branch.rotateZ(stub.tilt);
    branch.translate(stub.x, 3.4, 0);
    parts.push(paint(branch, PALETTE.bark));
  }

  const moss = new THREE.CylinderGeometry(
    2.85,
    2.85,
    17,
    10,
    1,
    false,
    0.9,
    1.4,
  );
  moss.rotateZ(Math.PI / 2);
  moss.translate(0, 3, 0);
  parts.push(paint(moss, PALETTE.leafDeep));

  return mergeGeometries(parts, false);
}

/**
 * A hollow log: a tunnel you run through.
 *
 * Built as a ring of staves rather than a tube with a hole bored through it.
 * There is no cutting one solid out of another here, and painting the inside
 * of an open cylinder does not work either — the inside of an open cylinder is
 * its own back faces, and back faces are not drawn. Eleven solid staves in a
 * circle are hollow for real, from any angle, with nothing to get wrong.
 */
function hollowLogGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  // Big. The tunnel is the only way past it, so it has to look like something
  // no hare could ever hop over — and the bore has to sit on the ground, or
  // the hare would have to jump up into it.
  const ring = 3.4;
  const staves = 13;

  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * TAU;
    const stave = new THREE.CylinderGeometry(0.85, 0.85, 15, 6);
    // Along Z, not X.
    //
    // Every other log in this wood lies across the path, because you jump over
    // those. This one you run *through*, so its bore has to point the way you
    // are going — built along X it was a tunnel at ninety degrees to the
    // direction of travel, which the collision test was perfectly happy with
    // and which made no sense whatever to look at.
    stave.rotateX(Math.PI / 2);
    stave.translate(Math.sin(a) * ring, ring + Math.cos(a) * ring, 0);
    // Moss along the top, bare bark underneath. The dark underside is what
    // makes the mouth of the tunnel read as a mouth from up the path.
    const lit = Math.cos(a) > 0.35;
    parts.push(
      paint(
        stave,
        lit ? PALETTE.leafDeep : i % 2 ? PALETTE.bark : PALETTE.barkDark,
      ),
    );
  }

  // A rim at each end, so the tunnel has a mouth rather than just stopping.
  // A torus is already in the XY plane, which is square on to the bore.
  for (const side of [-1, 1]) {
    const rim = new THREE.TorusGeometry(ring, 0.55, 6, staves * 2);
    rim.translate(0, ring, side * 7.5);
    parts.push(paint(rim, PALETTE.barkDark));
  }

  return mergeGeometries(parts, false);
}

/** A rock with a bit of moss on it. */
function stoneGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  // Taller than it is wide. Flattened, it read from the chase camera as a
  // paving slab lying on the grass rather than as something to go round.
  const rock = new THREE.IcosahedronGeometry(3.1, 0);
  rock.scale(1, 1.3, 1);
  rock.translate(0, 2.6, 0);
  parts.push(paint(rock, PALETTE.stone));

  const lump = new THREE.IcosahedronGeometry(1.7, 0);
  lump.translate(1.9, 1.1, -0.8);
  parts.push(paint(lump, PALETTE.stoneDark));

  const moss = new THREE.SphereGeometry(2, 8, 5, 0, TAU, 0, Math.PI / 2);
  moss.scale(1, 0.34, 1);
  moss.translate(-0.2, 4.4, 0.2);
  parts.push(paint(moss, PALETTE.leafDeep));

  return mergeGeometries(parts, false);
}

/**
 * A boulder: the big grey one, as against the small grey one.
 *
 * It used to be too big to jump and had to look it. It is jumpable now, so it
 * has come down to seven units — still half again the height of the stones,
 * with a smaller rock leaning on it and moss down one side, but honestly
 * inside a hare's jump rather than a coin toss against it.
 */
function boulderGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const rock = new THREE.IcosahedronGeometry(3.6, 0);
  rock.scale(1, 1.1, 0.95);
  rock.rotateY(0.7);
  rock.translate(0, 3, 0);
  parts.push(paint(rock, PALETTE.stone));

  const lump = new THREE.IcosahedronGeometry(2.1, 0);
  lump.rotateY(2.1);
  lump.translate(2.5, 1.5, -0.9);
  parts.push(paint(lump, PALETTE.stoneDark));

  const cap = new THREE.SphereGeometry(2.5, 9, 6, 0, TAU, 0, Math.PI / 2);
  cap.scale(1, 0.3, 1);
  cap.translate(-0.2, 5.9, 0.2);
  parts.push(paint(cap, PALETTE.leafDeep));

  const skirt = new THREE.SphereGeometry(1.5, 8, 5, 0, TAU, 0, Math.PI / 2);
  skirt.scale(1.3, 0.35, 1.1);
  skirt.translate(-2.4, 0.9, 1);
  parts.push(paint(skirt, PALETTE.leafDeep));

  return mergeGeometries(parts, false);
}

/** A bramble: a low tangle with berries in it. */
function brambleGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  // Built upward as well as outward. Flat and wide, it read from the chase
  // camera as a dark puddle on the grass rather than as something to go round.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const blob = new THREE.IcosahedronGeometry(1.7, 0);
    blob.scale(1.1, 1, 1.1);
    blob.translate(Math.cos(a) * 1.5, 1.4 + (i % 3) * 1.1, Math.sin(a) * 1.5);
    parts.push(paint(blob, i % 2 === 0 ? PALETTE.bramble : PALETTE.leafDeep));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.4;
    const berry = new THREE.SphereGeometry(0.42, 6, 5);
    berry.translate(Math.cos(a) * 1.9, 2.4 + (i % 2) * 1.2, Math.sin(a) * 1.9);
    parts.push(paint(berry, PALETTE.berry));
  }

  return mergeGeometries(parts, false);
}

/** A toadstool: a red cap on a pale stalk. */
function toadstoolGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const stalk = new THREE.CylinderGeometry(0.24, 0.36, 1.5, 7);
  stalk.translate(0, 0.75, 0);
  parts.push(paint(stalk, PALETTE.stalk));

  const cap = new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2);
  cap.scale(1, 0.7, 1);
  cap.translate(0, 1.4, 0);
  parts.push(paint(cap, PALETTE.cap));

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.7;
    const spot = new THREE.SphereGeometry(0.2, 6, 5);
    spot.translate(Math.cos(a) * 0.5, 2, Math.sin(a) * 0.5);
    parts.push(paint(spot, 0xffffff));
  }

  return mergeGeometries(parts, false);
}

/**
 * A tuft of long grass.
 *
 * Scenery, and deliberately nothing else: it is in the list that never gets
 * remembered as an obstacle, so a hare goes straight through it without so
 * much as slowing down. That is the whole point of it — a wood wants somewhere
 * that looks like it ought to cost you something and doesn't.
 *
 * Blades rather than a blob: five thin cones leaning different ways, which
 * from a chase camera reads as grass where a green lump reads as a bush.
 */
function grassGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  // Lighter than the wood behind it, or a tuft is a dark smudge on dark grass.
  const greens = [
    PALETTE.leafLight,
    PALETTE.grass,
    PALETTE.leaf,
    PALETTE.leafLight,
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    // Thin and tall. Fat and short, they were a handful of green pyramids
    // stuck in the ground; grass is nearly all length and no width.
    const height = 5.5 + (i % 3) * 1.8;
    const blade = new THREE.ConeGeometry(0.2, height, 3);
    // Leaning out from the middle, and a different way each time, so a tuft
    // has a shape instead of being a bundle of sticks.
    blade.rotateX(0.22 + (i % 2) * 0.14);
    blade.rotateZ(Math.sin(a) * 0.34);
    blade.rotateY(a);
    blade.translate(Math.cos(a) * 0.45, height * 0.44, Math.sin(a) * 0.45);
    parts.push(paint(blade, greens[i % greens.length]));
  }
  return mergeGeometries(parts, false);
}

/** The glowing kind: a pale blue cap that is drawn unlit, so it is brightest
 *  exactly where the wood is darkest. */
function glowCapGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const stalk = new THREE.CylinderGeometry(0.16, 0.26, 1.2, 6);
  stalk.translate(0, 0.6, 0);
  parts.push(paint(stalk, 0xdff6ff));

  const cap = new THREE.SphereGeometry(0.75, 9, 6, 0, TAU, 0, Math.PI / 2);
  cap.scale(1, 0.8, 1);
  cap.translate(0, 1.1, 0);
  parts.push(paint(cap, PALETTE.capGlow));

  return mergeGeometries(parts, false);
}
