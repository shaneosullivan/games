import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {REEF, WATER} from "../config";
import {Rng} from "../core/rng";
import {coralKinds, coralRock} from "./coral";
import {bladeMaterial, KELP_HEIGHT, kelpPlant, weedTuft} from "./flora";
import {
  causticTexture,
  driftCaustics,
  paint,
  shaftTexture,
  toonRamp,
} from "../render/materials";

const TAU = Math.PI * 2;

/**
 * The reef: the sea floor, everything growing on it, the surface overhead and
 * the light coming through it.
 *
 * The floor is a function first and a mesh second — `floorAt` is what the
 * whale, the coral, the fish and the camera all ask, and the mesh is only that
 * function sampled on a grid. Doing it the other way round (a mesh, then
 * raycasts against it to find out where the ground is) is how you end up with
 * a whale that swims through a sandbank on one frame in ten.
 */
export class Reef {
  readonly group = new THREE.Group();

  /** Where the run ends, in z. Everything is placed clear of it. */
  readonly finishZ = -(REEF.length - 90);

  private readonly caustics = causticTexture();
  private readonly surface: THREE.Mesh;
  private readonly surfaceMat: THREE.MeshBasicMaterial;
  private readonly below = new THREE.Color(WATER.fromBelowColour);
  private readonly above = new THREE.Color(WATER.fromAboveColour);
  private readonly surfaceRest: Float32Array;
  private readonly weeds: THREE.InstancedMesh;
  private readonly kelp: THREE.InstancedMesh;
  /** Rest poses for the two things on the floor that move. Rebuilt into
   *  matrices every frame, so they have to be kept as well as drawn. */
  private readonly weedBase: Array<Planted> = [];
  private readonly kelpBase: Array<Planted> = [];
  /** The bunches everything grows in. See REEF.gardens. */
  private readonly gardens: Array<{x: number; z: number}> = [];
  private readonly shafts: THREE.Group;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3();

  constructor(rng: Rng) {
    // Before anything is planted: the gardens are what everything else is
    // placed relative to.
    for (let i = 0; i < REEF.gardens; i++) {
      const along = (i + 0.5) / REEF.gardens;
      this.gardens.push({
        x: rng.range(-REEF.halfWidth, REEF.halfWidth) * 0.92,
        z: 20 + (this.finishZ - 60) * along + rng.range(-40, 40),
      });
    }

    this.group.add(this.buildFloor());
    this.group.add(this.buildCoral(rng));
    this.group.add(this.buildRocks(rng));

    this.weeds = this.buildWeeds(rng);
    this.group.add(this.weeds);

    this.kelp = this.buildKelp(rng);
    this.group.add(this.kelp);

    this.surface = this.buildSurface();
    this.surfaceMat = this.surface.material as THREE.MeshBasicMaterial;
    this.surfaceRest = Float32Array.from(
      this.surface.geometry.attributes.position.array,
    );
    this.group.add(this.surface);

    this.shafts = this.buildShafts(rng);
    this.group.add(this.shafts);

    this.group.add(this.buildFinish());
  }

  /**
   * The y of the sea floor under a point. Negative — the surface is y = 0.
   *
   * Two rolling terms along the reef make the sandbanks and trenches the plan
   * asks for, a cross term puts dunes on top of them, and the floor lifts as
   * it nears the sides so the swimmable lane is itself a shallow valley. Past
   * the lane the ridges climb out of it.
   */
  floorAt(x: number, z: number): number {
    let depth =
      REEF.floorBase +
      REEF.floorRoll * Math.sin((z / REEF.floorRollLength) * TAU + 0.7) +
      REEF.floorRoll *
        0.45 *
        Math.sin((z / (REEF.floorRollLength * 0.37)) * TAU + 2.1) +
      REEF.floorDune *
        Math.sin((x / REEF.floorDuneLength) * TAU) *
        Math.cos((z / REEF.floorDuneLength) * TAU * 0.8);

    // Shallower toward the sides. Squared, so the middle of the lane stays
    // flat and the lift is all in the last third.
    const edge = Math.min(1, Math.abs(x) / REEF.halfWidth);
    depth -= REEF.floorEdgeLift * edge * edge;

    // The ridges, beyond the lane.
    const out = Math.abs(x) - REEF.halfWidth;
    if (out > 0) {
      depth -= REEF.ridgeHeight * Math.min(1, out / REEF.ridgeWidth);
    }

    // Never let a ridge break the surface. An island would be a lovely thing
    // to swim round and a terrible thing to find out about by hitting it —
    // and it is thirteen rather than nine because the coral standing on the
    // ridge tops is ten units tall, and at nine it grew out into the air.
    return -Math.max(13, depth);
  }

  /**
   * The height of the water at a point — the same two wave trains the surface
   * mesh is built from.
   *
   * Public because the gulls sit on it. A bird bobbing to its own idea of
   * where the water is, half a unit off the water the player can see, is worse
   * than a bird that does not bob at all.
   */
  waveAt(x: number, z: number, time: number): number {
    const a = (x / WATER.waveLength) * TAU + time * WATER.waveSpeed;
    const b =
      ((z * 0.82 + x * 0.3) / (WATER.waveLength * 1.4)) * TAU +
      time * WATER.waveSpeed * 0.73;
    return (Math.sin(a) + Math.sin(b)) * 0.5 * WATER.waveHeight;
  }

  /** 0 at the start of the reef, 1 at the finish. For the bar along the top. */
  progressAt(z: number): number {
    return Math.min(1, Math.max(0, z / this.finishZ));
  }

  /**
   * Which side of the surface the camera is on, 0 under and 1 over.
   *
   * Everything about the surface changes with it: from below it is a thin
   * bright ceiling you can see the arch through, and from above it is the sea.
   */
  setAir(air: number): void {
    const a = Math.min(1, Math.max(0, air));
    this.surfaceMat.color.copy(this.below).lerp(this.above, a);
    this.surfaceMat.opacity =
      WATER.fromBelowOpacity +
      (WATER.fromAboveOpacity - WATER.fromBelowOpacity) * a;
  }

  /**
   * The dapple slides, the waves roll, the weeds lean and the surface follows
   * the whale so it is always overhead.
   *
   * `time` is seconds since the run began — passed in rather than read from a
   * clock here, so a paused game has a still sea.
   */
  update(time: number, centre: THREE.Vector3): void {
    driftCaustics(this.caustics, time);

    // The surface is a patch, not the whole ocean: it is moved to sit over the
    // whale, and the waves are computed from world coordinates so it does not
    // drag its own pattern along with it.
    this.surface.position.set(centre.x, 0, centre.z);
    const pos = this.surface.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      // Two trains crossing at an angle. One alone reads as corrugated iron.
      arr[i + 2] = this.waveAt(
        this.surfaceRest[i] + centre.x,
        this.surfaceRest[i + 1] + centre.z,
        time,
      );
    }
    pos.needsUpdate = true;

    this.shafts.position.set(centre.x, 0, centre.z);
    this.shafts.rotation.z = Math.sin(time * 0.21) * WATER.shaftSway;

    // The weed and the kelp lean, which is the only motion on the sea floor
    // and does more for "this is under water" than anything else here. The
    // kelp swings further and slower: it is forty units of rope with floats on
    // it, and it moves like one.
    this.sway(this.weeds, this.weedBase, time, 0.9, 0.16);
    this.sway(this.kelp, this.kelpBase, time, 0.42, 0.12);
  }

  /** Rebuilds a planted thing's matrices with a lean on them. */
  private sway(
    mesh: THREE.InstancedMesh,
    base: Array<Planted>,
    time: number,
    rate: number,
    amount: number,
  ): void {
    for (let i = 0; i < base.length; i++) {
      const w = base[i];
      const lean = w.lean + Math.sin(time * rate + w.phase) * amount;
      this.e.set(Math.cos(w.phase) * lean * 0.6, w.phase, lean);
      this.q.setFromEuler(this.e);
      this.one.setScalar(w.scale);
      this.m.compose(w.pos, this.q, this.one);
      mesh.setMatrixAt(i, this.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---- building ------------------------------------------------------------

  /**
   * The floor, as one grid sampled off `floorAt`.
   *
   * Vertex-coloured sand where it is flat and rock where it climbs, and the
   * caustic tile multiplied over the lot. The map is what makes it a sea floor
   * — an unlit expanse of one sand colour is a hundred metres of cardboard.
   */
  private buildFloor(): THREE.Mesh {
    const halfSpan = REEF.halfWidth + REEF.ridgeWidth + 60;
    const cols = Math.ceil((halfSpan * 2) / REEF.cell);
    const rows = Math.ceil((REEF.length + 260) / REEF.cell);
    const geo = new THREE.PlaneGeometry(
      halfSpan * 2,
      REEF.length + 260,
      cols,
      rows,
    );
    geo.rotateX(-Math.PI / 2);
    // The reef runs away down -Z from the start, with a little behind you.
    geo.translate(0, 0, -REEF.length / 2 + 60);

    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xf3e3b8).convertSRGBToLinear();
    const deepSand = new THREE.Color(0xdecda4).convertSRGBToLinear();
    const rock = new THREE.Color(0x7f8f86).convertSRGBToLinear();
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.floorAt(x, z);
      pos.setY(i, y);

      // Sand pales as it shallows and greys as it climbs the ridges.
      const deep = Math.min(1, Math.max(0, (-y - 30) / 60));
      c.copy(sand).lerp(deepSand, deep);
      const out = Math.abs(x) - REEF.halfWidth * 0.86;
      if (out > 0) {
        c.lerp(rock, Math.min(1, out / (REEF.ridgeWidth * 0.8)));
      }
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();

    const map = this.caustics;
    map.repeat.set(
      halfSpan * 2 * WATER.causticScale,
      (REEF.length + 260) * WATER.causticScale,
    );
    return new THREE.Mesh(
      geo,
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
        map,
      }),
    );
  }

  /**
   * The coral gardens.
   *
   * Four shapes, each an InstancedMesh, each instance tinted its own colour.
   * The geometry is painted in greys rather than in colours, because the
   * instance colour multiplies it — greys give the shape its light and shade
   * and the instance decides the hue, so one branching coral can be pink here
   * and orange twenty units along.
   */
  private buildCoral(rng: Rng): THREE.Group {
    const group = new THREE.Group();
    const kinds = coralKinds();
    // Straight out of the reference photographs: pinks, magentas, purples,
    // oranges and reds, and exactly one blue. Bright, because a reef is.
    const palette = [
      0xff5fa2, 0xe8397a, 0xa64bd6, 0x7b5bd6, 0xff7a3d, 0xe8452c, 0xff9ec2,
      0xc44bb0, 0x3fa9e8,
    ];
    const rockColours = [0xb9ad96, 0x9a8f7c, 0xc8bda6, 0x8b8477];

    const share = Math.ceil(REEF.coral / kinds.length);
    const total = share * kinds.length;
    const mat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: toonRamp(),
    });

    // Every coral's transform, kept so the rocks can be put under them. The
    // rock is a separate mesh because it shares the transform and not the
    // colour — a coral is magenta and the boulder it grew on is not.
    const placed: Array<THREE.Matrix4> = [];
    const colour = new THREE.Color();

    for (let k = 0; k < kinds.length; k++) {
      const mesh = new THREE.InstancedMesh(kinds[k], mat, share);
      for (let i = 0; i < share; i++) {
        const {x, z} = this.scatter(rng);
        const y = this.floorAt(x, z);
        this.v.set(x, y - 0.4, z);
        this.e.set(0, rng.range(0, TAU), 0);
        this.q.setFromEuler(this.e);
        this.one.setScalar(rng.range(0.8, 2));
        this.m.compose(this.v, this.q, this.one);
        mesh.setMatrixAt(i, this.m);
        placed.push(this.m.clone());
        colour.set(rng.pick(palette)).convertSRGBToLinear();
        mesh.setColorAt(i, colour);
      }
      mesh.instanceMatrix.needsUpdate = true;
      keepDrawn(mesh);
      group.add(mesh);
    }

    const rocks = new THREE.InstancedMesh(coralRock(), mat, total);
    for (let i = 0; i < total; i++) {
      rocks.setMatrixAt(i, placed[i]);
      colour.set(rng.pick(rockColours)).convertSRGBToLinear();
      rocks.setColorAt(i, colour);
    }
    rocks.instanceMatrix.needsUpdate = true;
    keepDrawn(rocks);
    group.add(rocks);

    return group;
  }

  /** Boulders, in greys and browns. Nothing to hit — they are scenery. */
  private buildRocks(rng: Rng): THREE.InstancedMesh {
    const geo = paint(new THREE.IcosahedronGeometry(3.2, 0), 0xffffff);
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
      REEF.rocks,
    );
    const greys = [0x8a938c, 0x6f7a74, 0xa39a86, 0x5d6a66];
    const colour = new THREE.Color();
    for (let i = 0; i < REEF.rocks; i++) {
      const {x, z} = this.scatter(rng);
      const y = this.floorAt(x, z);
      this.v.set(x, y + rng.range(-1.4, 0.6), z);
      this.e.set(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
      this.q.setFromEuler(this.e);
      this.one.set(
        rng.range(0.8, 2.6),
        rng.range(0.5, 1.5),
        rng.range(0.8, 2.6),
      );
      this.m.compose(this.v, this.q, this.one);
      mesh.setMatrixAt(i, this.m);
      colour.set(rng.pick(greys)).convertSRGBToLinear();
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    keepDrawn(mesh);
    return mesh;
  }

  /** Sea grass. Kept in `weedBase` as well as in the matrices, because these
   *  are the one thing on the floor that moves and the sway is rebuilt every
   *  frame from the rest pose. */
  private buildWeeds(rng: Rng): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      weedTuft(),
      bladeMaterial(toonRamp()),
      REEF.weeds,
    );
    const greens = [0x4f9e5c, 0x76b84a, 0x3f8f77, 0x9dc45a, 0x2f7f62];
    const colour = new THREE.Color();
    for (let i = 0; i < REEF.weeds; i++) {
      const {x, z} = this.scatter(rng);
      this.weedBase.push({
        pos: new THREE.Vector3(x, this.floorAt(x, z) - 0.5, z),
        scale: rng.range(0.7, 1.9),
        lean: rng.range(-0.12, 0.12),
        phase: rng.range(0, TAU),
      });
      colour.set(rng.pick(greens)).convertSRGBToLinear();
      mesh.setColorAt(i, colour);
    }
    keepDrawn(mesh);
    return mesh;
  }

  /**
   * The kelp forest.
   *
   * In stands rather than scattered, because that is the whole point of kelp:
   * a thicket you swim into and cannot see through, with open water either
   * side. Each plant is built at unit height and scaled to the water it is
   * standing in, so a stand in a trench is a tall wood and one on a sandbank
   * is a low one — which is what real kelp does, growing until it reaches the
   * light and then stopping.
   */
  private buildKelp(rng: Rng): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      kelpPlant(),
      bladeMaterial(toonRamp()),
      REEF.kelp,
    );
    const golds = [0xe6cf6a, 0xf0dd88, 0xd2bb52, 0xe8d878, 0xc9c563];
    const colour = new THREE.Color();
    const perStand = Math.ceil(REEF.kelp / REEF.kelpStands);

    // The middle of each stand, drawn once. Drawing it per plant instead —
    // which is what this did — gave every plant its own centre, so a "stand"
    // was a band of open water a hundred and fifty units wide with eighteen
    // lone plants in it. A thicket you can swim into has to be planted as one.
    const middles: Array<number> = [];
    for (let n = 0; n < REEF.kelpStands; n++) {
      middles.push(rng.range(-REEF.halfWidth, REEF.halfWidth) * 0.8);
    }

    for (let i = 0; i < REEF.kelp; i++) {
      const stand = Math.floor(i / perStand) % REEF.kelpStands;
      const along = (stand + 0.5) / REEF.kelpStands;
      const cx = middles[stand];
      const cz = 40 + (this.finishZ - 100) * along;
      const x = cx + rng.range(-REEF.kelpSpread, REEF.kelpSpread);
      const z = cz + rng.range(-REEF.kelpSpread, REEF.kelpSpread);
      // Sized to the water above it: how far up toward the light it gets,
      // divided by how tall the model is. One number, all three axes.
      const floor = this.floorAt(x, z);
      const reach = rng.range(REEF.kelpReachLow, REEF.kelpReachHigh);
      this.kelpBase.push({
        pos: new THREE.Vector3(x, floor - 1, z),
        scale: Math.max(0.35, Math.min(1.6, (-floor * reach) / KELP_HEIGHT)),
        lean: rng.range(-0.05, 0.05),
        phase: rng.range(0, TAU),
      });
      colour.set(rng.pick(golds)).convertSRGBToLinear();
      mesh.setColorAt(i, colour);
    }
    keepDrawn(mesh);
    return mesh;
  }

  /**
   * The surface, seen from underneath: a wide patch of rippling light.
   *
   * Basic rather than toon, because there is nothing to light — this is the
   * sky, and it should be the brightest thing in the game. Double-sided so a
   * whale that noses up through it still sees water rather than nothing.
   */
  private buildSurface(): THREE.Mesh {
    const cells = Math.ceil(WATER.surfaceSpan / WATER.surfaceCell);
    const geo = new THREE.PlaneGeometry(
      WATER.surfaceSpan,
      WATER.surfaceSpan,
      cells,
      cells,
    );
    const map = causticTexture().clone();
    map.needsUpdate = true;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(14, 14);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map,
        color: WATER.fromBelowColour,
        side: THREE.DoubleSide,
        transparent: true,
        // Not opaque from below, and this is not only prettier: the surface is
        // a ceiling, and any ray heading upward meets it before it meets
        // anything tall and far away. An opaque one would hide the finish arch
        // behind a sheet of water for the whole approach. See setAir for what
        // happens to it when the whale puts its head out.
        opacity: WATER.fromBelowOpacity,
      }),
    );
    // The plane is built in XY and laid flat here, which is why `update` reads
    // the rest positions as x and *y* and writes the wave into z.
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  /**
   * Sunbeams. Open cones, widest at the surface, fading as they go down.
   *
   * Additive and very faint: one of these is invisible and twenty of them
   * crossing is the whole look of a sunny day underwater. They sway together
   * as a group rather than individually — light through a swell moves as one
   * thing.
   */
  private buildShafts(rng: Rng): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: shaftTexture(),
      color: 0xeafaff,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < WATER.shafts; i++) {
      const height = rng.range(80, 150);
      const width = WATER.shaftWidth * rng.range(0.5, 1.2);
      const beam = new THREE.Group();
      // Two planes crossed at a right angle, so the beam has a width from
      // wherever you happen to be looking. A single plane vanishes edge-on,
      // which for a thing scattered all round the whale means half of them
      // blink out every time it turns.
      for (const turn of [0, Math.PI / 2]) {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(width, height),
          mat,
        );
        plane.rotation.y = turn;
        beam.add(plane);
      }
      // Tops just *under* the surface. Sitting them at the waterline put a
      // white additive smudge on the sea in every shot taken from the air.
      beam.position.set(
        rng.range(-280, 280),
        -height / 2 - 1.5,
        rng.range(-280, 280),
      );
      beam.rotation.z = rng.range(-0.16, 0.16);
      group.add(beam);
    }
    return group;
  }

  /**
   * The finish: an arch of bright coral across the lane, with the water
   * shallowing behind it.
   *
   * A gate rather than a line, because a child needs to see the end coming
   * from a long way off and know it when they get there.
   */
  private buildFinish(): THREE.Group {
    const group = new THREE.Group();
    const floor = this.floorAt(0, this.finishZ);
    const span = 62;
    const legHeight = 17;
    const rng = new Rng(66001);

    // An arch of rock that coral has grown over, rather than a smooth pink
    // croquet hoop. The hoop was the first version and read as playground
    // equipment: perfectly round, one colour, and the same thickness the whole
    // way over, which nothing in the sea is.
    const parts: Array<THREE.BufferGeometry> = [];

    // The span itself, as a chain of lumps of rock following a curve. Each is
    // a different size and sits a little off the line, so the arch has a bulge
    // and a narrow point like a thing that grew.
    const bands = 15;
    for (let i = 0; i <= bands; i++) {
      const t = i / bands;
      const a = Math.PI * t;
      const lump = new THREE.IcosahedronGeometry(
        4.2 + Math.sin(t * Math.PI) * 1.6 + rng.range(-0.9, 0.9),
        0,
      );
      lump.scale(1, 1, rng.range(0.7, 1.3));
      lump.rotateY(rng.range(0, TAU));
      lump.translate(
        Math.cos(a) * (span / 2) + rng.range(-1.2, 1.2),
        Math.sin(a) * (span / 2) * 0.92 + rng.range(-1, 1),
        rng.range(-2.2, 2.2),
      );
      parts.push(paint(lump, 0x9c8f7d));
    }

    // The two feet, thicker than the span and buried in the sand.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const foot = new THREE.IcosahedronGeometry(rng.range(5.5, 8), 0);
        foot.scale(1, 0.85, 1);
        foot.translate(
          (side * span) / 2 + rng.range(-2.5, 2.5),
          -legHeight + i * 6 + rng.range(-1, 1),
          rng.range(-3, 3),
        );
        parts.push(paint(foot, 0x8d8271));
      }
    }

    const rock = new THREE.Mesh(
      mergeGeometries(parts, false),
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
    );
    rock.position.set(0, floor + legHeight, this.finishZ);
    group.add(rock);

    // And the coral growing all over it, which is what makes it the end of a
    // reef rather than a rock. Pink and gold, thick enough to see from a long
    // way off — this is the thing a child is aiming at.
    const kinds = coralKinds();
    const bright = [0xff5fa2, 0xe8397a, 0xff9ec2, 0xffc65e, 0xff7a3d];
    const encrust = new THREE.InstancedMesh(
      kinds[1],
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
      54,
    );
    const colour = new THREE.Color();
    for (let i = 0; i < 54; i++) {
      // Round the arch, facing out of it — coral on an arch grows away from
      // the stone, so each one is tipped along the outward normal.
      const t = rng.next();
      const a = Math.PI * t;
      const out = rng.range(-1, 1);
      this.v.set(
        Math.cos(a) * (span / 2 + rng.range(-1, 4)),
        Math.sin(a) * (span / 2) * 0.92 + rng.range(-2, 3),
        out * rng.range(2, 5),
      );
      this.v.y += floor + legHeight;
      this.v.z += this.finishZ;
      this.e.set(rng.range(-0.6, 0.6), rng.range(0, TAU), a - Math.PI / 2);
      this.q.setFromEuler(this.e);
      this.one.setScalar(rng.range(0.6, 1.5));
      this.m.compose(this.v, this.q, this.one);
      encrust.setMatrixAt(i, this.m);
      colour.set(rng.pick(bright)).convertSRGBToLinear();
      encrust.setColorAt(i, colour);
    }
    encrust.instanceMatrix.needsUpdate = true;
    keepDrawn(encrust);
    group.add(encrust);

    return group;
  }

  /**
   * A spot on the floor to put something on.
   *
   * Mostly in a garden — coral comes in heads and thickets with bare sand
   * between them, and a reef laid out at random reads as wallpaper. A `loose`
   * share ignores the gardens so the gaps between them are not too tidy, and
   * everything may go out to the ridges rather than only inside the lane: a
   * bare grey wall either side would undo the work the coral is doing.
   */
  private scatter(rng: Rng): {x: number; z: number} {
    const reach = REEF.halfWidth + REEF.ridgeWidth * 0.7;
    if (rng.next() < REEF.loose || this.gardens.length === 0) {
      return {
        x: rng.range(-reach, reach),
        z: rng.range(40, this.finishZ - 40),
      };
    }
    const garden = rng.pick(this.gardens);
    // Two draws added together rather than one: it heaps things toward the
    // middle of the bunch instead of filling a disc evenly, which is the
    // difference between a thicket and a circle.
    const spread = REEF.gardenSpread;
    const dx = rng.range(-spread, spread) + rng.range(-spread, spread);
    const dz = rng.range(-spread, spread) + rng.range(-spread, spread);
    return {
      x: Math.max(-reach, Math.min(reach, garden.x + dx)),
      z: Math.max(this.finishZ - 40, Math.min(40, garden.z + dz)),
    };
  }
}

/**
 * Never cull one of these as a whole.
 *
 * An InstancedMesh's bounding volume is its *geometry's* — one plant's, a few
 * units across and sitting at the world origin — and not the volume its three
 * hundred instances actually occupy, which here is the entire reef. So the
 * renderer decides the whole mesh is off screen the moment you swim away from
 * the origin, and every kelp, coral and weed in the game vanishes at once.
 *
 * These are five draw calls between them and they always have something on
 * screen, so there was never anything to win by culling them.
 */
function keepDrawn(mesh: THREE.InstancedMesh): void {
  mesh.frustumCulled = false;
}

/** Something growing out of the sand, kept so its sway can be rebuilt. */
interface Planted {
  pos: THREE.Vector3;
  /** Uniform, always. Kelp is fitted to its water by choosing this, never by
   *  stretching one axis — see kelpPlant. */
  scale: number;
  lean: number;
  phase: number;
}
