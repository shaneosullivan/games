import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {GATES, LINE, SIM, WORLD} from "../config";
import {Squirrel} from "./squirrel";
import {paint, vertexToon} from "../render/materials";
import {Rng} from "../core/rng";

/** How far ahead the startup flight aims, and how hard it leans to get there.
 *  A long enough look that it flies the line smoothly rather than sawing at
 *  it — the path it traces is the one everything else is hung on. */
const PATH_LOOK = 55;
const PATH_GAIN = 2.2;

/** How finely the flown path is sampled, in units down the valley. */
const PATH_STEP = 5;

const ROCK_COLOURS = [0x8e8b86, 0x9b978f, 0x807d78, 0xa39d93];
const SNOW = 0xeef4f7;
const GRASS = 0x6f9a52;
const TRUNK = 0x6b4f3a;
const FOLIAGE = [0x4f7d3f, 0x5d8c47, 0x446f37];

/**
 * The valley you glide down: a launch cliff, a floor, and mountains either
 * side.
 *
 * All of it generated, the way the rest of this repo generates everything —
 * merged primitives with vertex colours, toon-shaded, a handful of draw calls
 * for the whole landscape.
 *
 * It runs along -Z from the cliff at the origin, so "forward" is one direction
 * for the whole game. That is worth the loss of generality: the camera, the
 * gates and the finish can all be reasoned about as distances down the valley
 * rather than as positions in a world.
 */
export class Terrain {
  readonly group = new THREE.Group();

  constructor(private readonly rng: Rng) {
    this.flyThePath();
    this.buildFloor();
    this.buildCliff();
    this.buildWalls();
    this.buildTrees();
  }

  /** The height of the ground under a point. Only the floor, for now: the
   *  walls are scenery and the game keeps you off them. */
  groundAt(): number {
    return WORLD.floorY;
  }

  /**
   * The line a hands-off glide actually traces down the valley.
   *
   * Flown, not calculated. The steady-state glide ratio is easy arithmetic —
   * drag over lift — but it is not what a flight looks like: the leap off the
   * ledge starts well below flying speed, so the first seconds are a dive to
   * find it, and the whole path sits lower than the arithmetic says. Placed on
   * the tidy version, every arch hung above the squirrel's head and none of
   * them could be reached at all.
   *
   * So the model is run once at startup and the heights are sampled off it. It
   * costs a few hundred steps of arithmetic, and it cannot be wrong about the
   * game the way a formula can.
   *
   * And it is flown along the *flight line*, not straight down the middle,
   * because a turn costs height: a straight flight hung everything eleven
   * units too high, and following the acorns dropped you underneath the arches
   * they were leading you to. The line and the height it leaves you at have to
   * be measured by the same flight, or they are answers to different
   * questions.
   */
  private readonly path: Array<number> = [];

  glidePathAt(z: number): number {
    const i = Math.max(
      0,
      Math.min(this.path.length - 1, Math.round(-z / PATH_STEP)),
    );
    return this.path[i];
  }

  private flyThePath(): void {
    const squirrel = new Squirrel();
    squirrel.place(new THREE.Vector3(0, WORLD.cliffHeight + 2.5, -2));
    squirrel.jump();
    const stick = new THREE.Vector3();
    let next = 0;
    for (let i = 0; i < 60 * 120; i++) {
      const along = -squirrel.position.z;
      while (along >= next * PATH_STEP && this.path.length <= next) {
        this.path.push(squirrel.position.y);
        next++;
      }
      if (squirrel.position.y <= WORLD.floorY + 1) {
        this.reach = -squirrel.position.z;
        break;
      }
      // Flown the way a player would fly it: aim at the line some way ahead
      // and lean until you are pointed at it. Nothing here is a shortcut round
      // the physics — it works the same stick a child does, so the height it
      // arrives at is a height a child can arrive at.
      const ahead = squirrel.position.z - PATH_LOOK;
      const want = this.ribbonAt(ahead) - squirrel.position.x;
      let off = Math.PI - Math.atan2(want, PATH_LOOK) - squirrel.heading;
      while (off > Math.PI) {
        off -= Math.PI * 2;
      }
      while (off < -Math.PI) {
        off += Math.PI * 2;
      }
      stick.set(Math.max(-1, Math.min(1, -off * PATH_GAIN)), 0, 0);
      squirrel.update(SIM.step, stick);
    }
    // Anything past where the glide reached sits just above the floor, so a
    // gate placed down there is still something a good flight can catch.
    if (this.reach <= 0) {
      this.reach = WORLD.length;
    }
    while (this.path.length < Math.ceil(WORLD.length / PATH_STEP) + 2) {
      this.path.push(WORLD.floorY + 14);
    }
  }

  /**
   * How far a hands-off glide gets before it touches down.
   *
   * Measured by the same flight that traces the path, and it is what the
   * valley is scored against — so "the end of the valley" means "as far as
   * this squirrel can fly", which is a target a child can actually be given
   * rather than a number somebody picked.
   */
  reach = 0;

  /**
   * The height the arches and the acorns hang at: a steady diagonal ramp down
   * the valley, rather than the exact line a glide happens to trace.
   *
   * A hands-off flight is not a straight line and never will be. It leaves the
   * cliff below flying speed, dives to find it, pulls out, floats, and settles
   * — the long slow porpoise every glider does, and a real one. Hanging the
   * arches on it exactly meant they rose and fell with it, and from the air a
   * chain that bobs reads as scattered rather than as a route.
   *
   * So this is the straight line from the first arch to the last, pulled back
   * toward the real path wherever the two disagree by more than LINE.ramp. The
   * result descends steadily the whole way — which is the thing you can see and
   * aim down — while never sitting further off the flyable line than an arch
   * can swallow. The clamp is well inside an arch's half height, so a squirrel
   * flying the glide passes through every one of them.
   */
  rampAt(z: number): number {
    const first = GATES.firstAt;
    const last = Math.max(first + 1, this.reach * GATES.until);
    const t = Math.max(0, Math.min(1, (-z - first) / (last - first)));
    const straight =
      this.glidePathAt(-first) +
      (this.glidePathAt(-last) - this.glidePathAt(-first)) * t;
    const real = this.glidePathAt(z);
    return Math.max(real - LINE.ramp, Math.min(real + LINE.ramp, straight));
  }

  /**
   * The line the game wants you to fly, side to side. See LINE in the config.
   *
   * Deliberately not the line a hands-off glide takes, which is straight down
   * the middle: everything worth having in the valley hangs on this, so every
   * acorn is a reason to lean on the stick. Clamped inside the walls, which
   * move — the valley closes in and opens out, and a route that ignored that
   * would post a child at a rock face.
   */
  ribbonAt(z: number): number {
    const wave =
      Math.sin(-z * LINE.waveA) * (1 - LINE.share) +
      Math.sin(-z * LINE.waveB + 1.7) * LINE.share;
    const room = Math.max(0, this.wallAt(z) - LINE.wallGap);
    return Math.max(-room, Math.min(room, wave * LINE.wander));
  }

  /** How far down the valley a point is, as a fraction of that. */
  progressAt(z: number): number {
    return Math.min(1, Math.max(0, -z / this.reach));
  }

  private buildFloor(): void {
    // A long plane rather than the game's whole width: the valley is a
    // corridor, and the mountains take care of the sides.
    const floor = new THREE.PlaneGeometry(
      WORLD.halfWidth * 2.4,
      WORLD.length + 400,
    );
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, WORLD.floorY, -WORLD.length / 2 + 100);
    this.group.add(new THREE.Mesh(paint(floor, GRASS), vertexToon()));
  }

  /**
   * The cliff you start on: a shelf at WORLD.cliffHeight with the valley
   * dropping away in front of it.
   *
   * Built as a box behind the launch point rather than a hole in the ground,
   * because what a child needs to see at the start is an edge with nothing
   * beyond it — and the simplest thing that reads as that is a block they are
   * standing on top of.
   */
  private buildCliff(): void {
    const parts: Array<THREE.BufferGeometry> = [];

    const w = WORLD.halfWidth * 1.6;
    const d = 140;
    const block = new THREE.BoxGeometry(w, WORLD.cliffHeight, d);
    block.translate(0, WORLD.cliffHeight / 2, d / 2 - 4);
    parts.push(paint(block, ROCK_COLOURS[0] as number));

    // A lip of grass on top, so the ledge reads as ground rather than as the
    // top of a grey box.
    const lip = new THREE.BoxGeometry(w, 1.2, d);
    lip.translate(0, WORLD.cliffHeight + 0.2, d / 2 - 4);
    parts.push(paint(lip, GRASS));

    // Broken rock down the face, so it is not one flat wall.
    for (let i = 0; i < 26; i++) {
      const r = this.rng.range(6, 16);
      const rock = new THREE.IcosahedronGeometry(r, 0);
      rock.translate(
        this.rng.range(-w / 2, w / 2),
        this.rng.range(6, WORLD.cliffHeight - 6),
        this.rng.range(-6, 2),
      );
      parts.push(paint(rock, this.rng.pick(ROCK_COLOURS)));
    }

    const merged = mergeGeometries(parts);
    if (merged) {
      this.group.add(new THREE.Mesh(merged, vertexToon()));
    }
  }

  /**
   * How far out the wall stands at a point down the valley.
   *
   * The valley is not a straight corridor: the walls close in and open out, so
   * that flying it is a thing you have to steer rather than a tube you fall
   * along. One function, used three times over — to build the wall, to
   * decorate it, and to know when the squirrel has hit it.
   */
  wallAt(z: number): number {
    const along = -z;
    return (
      WORLD.halfWidth +
      Math.sin(along * 0.0075) * WORLD.wallWander +
      Math.sin(along * 0.021 + 1.7) * WORLD.wallWander * 0.4
    );
  }

  /** How high the wall is at a point, which is its silhouette. */
  private wallHeight(z: number, side: number): number {
    const along = -z;
    // Three waves of falling size, the longest carrying most of it. One wave
    // is a corrugation and two are a pattern; three read as a ridge line that
    // happens to be where it is. The short one is deliberately gentle — at any
    // strength it turns the wall into a row of standing stones.
    return (
      WORLD.wallHeight +
      Math.sin(along * 0.0042 + side * 2.1) * WORLD.wallRelief +
      Math.sin(along * 0.0115 + side * 0.9) * WORLD.wallRelief * 0.42 +
      Math.sin(along * 0.028 + side * 4.3) * WORLD.wallRelief * 0.12
    );
  }

  /**
   * The two walls, as solid ridges rather than a scatter of separate peaks.
   *
   * Built as a strip: the inner face is a run of quads from the floor up to a
   * wandering ridge line, and the top slopes away outward so the far side is
   * never a paper edge against the sky. Peaks standing on their own left gaps
   * between them that a squirrel could fly through and out of the world, and
   * read as traffic cones from the air besides.
   */
  private buildWalls(): void {
    const parts: Array<THREE.BufferGeometry> = [];
    const decor: Array<THREE.BufferGeometry> = [];

    for (const side of [-1, 1]) {
      const face: Array<number> = [];
      const colours: Array<number> = [];
      const from = 200;
      const to = -(WORLD.length + 400);

      for (let z = from; z > to; z -= WORLD.wallStep) {
        const zNext = z - WORLD.wallStep;
        const x0 = side * this.wallAt(z);
        const x1 = side * this.wallAt(zNext);
        const h0 = this.wallHeight(z, side);
        const h1 = this.wallHeight(zNext, side);
        // Out and up: the ridge leans away from the valley, so what the player
        // sees is a slope rather than a wall of card.
        const ox0 = x0 + side * WORLD.wallThickness;
        const ox1 = x1 + side * WORLD.wallThickness;

        // The inner face, floor to ridge.
        quad(
          face,
          [x0, WORLD.floorY, z],
          [x1, WORLD.floorY, zNext],
          [x1, h1, zNext],
          [x0, h0, z],
        );
        // And the shoulder, ridge to the back.
        quad(
          face,
          [x0, h0, z],
          [x1, h1, zNext],
          [ox1, h1 - WORLD.wallDrop, zNext],
          [ox0, h0 - WORLD.wallDrop, z],
        );

        const rock =
          h0 > WORLD.wallHeight + WORLD.wallRelief * 0.55
            ? SNOW
            : ROCK_COLOURS[0];
        for (let i = 0; i < 12; i++) {
          colours.push(rock as number);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(face, 3));
      geo.computeVertexNormals();
      parts.push(paintEach(geo, colours));

      // Decoration on the face: boulders and a scattering of pines clinging to
      // it, so the ridge has a scale and is not one smooth sheet of grey.
      for (let i = 0; i < WORLD.wallRocks; i++) {
        const z = this.rng.range(to, from);
        const up = this.rng.range(0.05, 0.8);
        const h = this.wallHeight(z, side);
        const x = side * (this.wallAt(z) + this.rng.range(0, 5));
        const r = this.rng.range(3, 9);
        const rock = new THREE.IcosahedronGeometry(r, 0);
        rock.translate(x, WORLD.floorY + h * up, z);
        decor.push(paint(rock, this.rng.pick(ROCK_COLOURS)));
      }
    }

    const merged = mergeGeometries(parts);
    if (merged) {
      // Double-sided, because the two walls are built by the same loop with
      // the sign flipped — which reverses the winding on one of them. Left
      // face-culling to sort out, one wall faced into the valley and the other
      // faced away, and the far one rendered as slabs hanging in mid-air.
      const material = vertexToon();
      material.side = THREE.DoubleSide;
      this.group.add(new THREE.Mesh(merged, material));
    }
    const mergedDecor = mergeGeometries(decor);
    if (mergedDecor) {
      this.group.add(new THREE.Mesh(mergedDecor, vertexToon()));
    }
  }

  /**
   * Pines on the floor of the valley.
   *
   * They are not decoration: from a hundred and fifty units up, bare ground
   * gives a player nothing to judge their height or their speed against, and
   * the whole feel of a glide is in both. Scattered things of a known size are
   * what turn a green plane into a distance.
   */
  private buildTrees(): void {
    const parts: Array<THREE.BufferGeometry> = [];

    for (let i = 0; i < WORLD.trees; i++) {
      const z = -this.rng.range(60, WORLD.length + 120);
      // Inside the walls, wherever they happen to be at this point.
      const room = this.wallAt(z) - 6;
      const x = this.rng.range(-room, room);
      const h = this.rng.range(7, 14);

      const trunk = new THREE.CylinderGeometry(0.5, 0.7, h * 0.4, 5);
      trunk.translate(x, h * 0.2, z);
      parts.push(paint(trunk, TRUNK));

      const top = new THREE.ConeGeometry(h * 0.3, h * 0.8, 6);
      top.translate(x, h * 0.55, z);
      parts.push(paint(top, this.rng.pick(FOLIAGE)));
    }

    const merged = mergeGeometries(parts);
    if (merged) {
      this.group.add(new THREE.Mesh(merged, vertexToon()));
    }
  }
}

/** Two triangles, wound so the face looks into the valley. */
function quad(
  out: Array<number>,
  a: Array<number>,
  b: Array<number>,
  c: Array<number>,
  d: Array<number>,
): void {
  out.push(...a, ...b, ...c);
  out.push(...a, ...c, ...d);
}

/**
 * Paints a strip a triangle at a time.
 *
 * `paint` in materials.ts gives a whole geometry one colour, which is right
 * for a merged prop and wrong for a ridge that wants snow on its tops and rock
 * everywhere else.
 */
function paintEach(
  geo: THREE.BufferGeometry,
  perTriangleVertex: Array<number>,
): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    c.set(perTriangleVertex[Math.min(i, perTriangleVertex.length - 1)]);
    c.convertSRGBToLinear();
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}
