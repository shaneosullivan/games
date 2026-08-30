import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {REEF, WATER} from "../config";
import {Rng} from "../core/rng";
import {coralKinds, coralRock} from "./coral";
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
  private readonly weedBase: Array<{
    pos: THREE.Vector3;
    scale: number;
    lean: number;
    phase: number;
  }> = [];
  private readonly shafts: THREE.Group;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3();

  constructor(rng: Rng) {
    this.group.add(this.buildFloor());
    this.group.add(this.buildCoral(rng));
    this.group.add(this.buildRocks(rng));

    this.weeds = this.buildWeeds(rng);
    this.group.add(this.weeds);

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

    // The weeds lean, which is the only motion on the sea floor and does more
    // for "this is under water" than anything else here.
    for (let i = 0; i < this.weedBase.length; i++) {
      const w = this.weedBase[i];
      const lean = w.lean + Math.sin(time * 0.9 + w.phase) * 0.16;
      this.e.set(0, w.phase, lean);
      this.q.setFromEuler(this.e);
      this.one.setScalar(w.scale);
      this.m.compose(w.pos, this.q, this.one);
      this.weeds.setMatrixAt(i, this.m);
    }
    this.weeds.instanceMatrix.needsUpdate = true;
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
      group.add(mesh);
    }

    const rocks = new THREE.InstancedMesh(coralRock(), mat, total);
    for (let i = 0; i < total; i++) {
      rocks.setMatrixAt(i, placed[i]);
      colour.set(rng.pick(rockColours)).convertSRGBToLinear();
      rocks.setColorAt(i, colour);
    }
    rocks.instanceMatrix.needsUpdate = true;
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
    return mesh;
  }

  /** Sea grass. Kept in `weedBase` as well as in the matrices, because these
   *  are the one thing on the floor that moves and the sway is rebuilt every
   *  frame from the rest pose. */
  private buildWeeds(rng: Rng): THREE.InstancedMesh {
    const blades: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < 7; i++) {
      const h = 4 + (i % 3) * 2.2;
      const blade = new THREE.CylinderGeometry(0.12, 0.42, h, 4, 1);
      blade.translate(
        Math.cos((i / 7) * TAU) * 1.1,
        h / 2,
        Math.sin((i / 7) * TAU) * 1.1,
      );
      blade.rotateZ(Math.cos(i * 2.1) * 0.22);
      blades.push(paint(blade, i % 2 === 0 ? 0xffffff : 0xc9c9c9));
    }
    const geo = mergeGeometries(blades, false);
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
      REEF.weeds,
    );
    const greens = [0x4f9e5c, 0x76b84a, 0x3f8f77, 0x9dc45a];
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
    const span = 60;
    const legHeight = 16;

    const arch = paint(
      new THREE.TorusGeometry(span / 2, 4.6, 10, 26, Math.PI),
      0xffb3d1,
    );
    const parts: Array<THREE.BufferGeometry> = [arch];
    for (const side of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(5.2, 7.4, legHeight, 10);
      leg.translate((side * span) / 2, -legHeight / 2, 0);
      parts.push(paint(leg, 0xff8fbe));
      // Knobbles up the legs, so the arch reads as grown rather than built.
      for (let i = 0; i < 3; i++) {
        const bud = new THREE.IcosahedronGeometry(3.4, 0);
        bud.translate((side * span) / 2 + side * 4, -legHeight + 3 + i * 7, 0);
        parts.push(paint(bud, 0xffd166));
      }
    }
    const mesh = new THREE.Mesh(
      mergeGeometries(parts, false),
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
    );
    // The origin is where the arch springs from the tops of the legs, so this
    // is the leg height above the sand and no more. Hanging it any higher
    // leaves the legs floating, and any higher again pushes the crown up
    // through the surface, where the translucent water washes it out.
    mesh.position.set(0, floor + legHeight, this.finishZ);
    group.add(mesh);
    return group;
  }

  /**
   * A spot on the floor to put something on.
   *
   * Out to the ridges rather than only inside the lane, so the sides of the
   * reef are furnished too — a bare grey wall either side would undo the work
   * the coral is doing.
   */
  private scatter(rng: Rng): {x: number; z: number} {
    const reach = REEF.halfWidth + REEF.ridgeWidth * 0.7;
    return {
      x: rng.range(-reach, reach),
      z: rng.range(40, this.finishZ - 40),
    };
  }
}
