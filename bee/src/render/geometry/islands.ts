import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ISLANDS as I, ISLANDS_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, vertexToon} from "../materials";
import {loadIslandModels} from "./islandModels";

/** One thing riding one stream. */
export interface Rider {
  kind: "frog" | "gator";
  /** Which stream it rides, 1-based, counted from the near bank. */
  lane: number;
  /** Where along the stream it is, in squares from the middle of the board. */
  x: number;
  /** Squares per second, signed: the direction its stream runs. */
  speed: number;
  /** How far it reaches, in squares — a tongue for a frog, a mouth for a
      gator. Kept here so the level's hit test doesn't have to know which is
      which. */
  reach: number;
  /** What is moved along the stream: a container, not the model itself. */
  mesh: THREE.Object3D;
}

export interface IslandsScene {
  group: THREE.Group;
  riders: ReadonlyArray<Rider>;
  /** Middle of column `col`, in world x. Column 0 is the left-hand edge. */
  columnX(col: number): number;
  /** Middle of row `row`, in world z. Row 0 is the near bank, and row
      `streams + 1` is the far one. */
  rowZ(row: number): number;
  /**
   * Where a baby stands while it waits, on the bank behind the playing rows:
   * three at the near end for the ones still to be taken across, three at the
   * far end for the ones that made it. Tops of the pedestals, so a baby put
   * here is standing on one rather than in one.
   */
  readonly nearPedestals: ReadonlyArray<THREE.Vector3>;
  readonly farPedestals: ReadonlyArray<THREE.Vector3>;
  /** Put the tongue out from this frog towards a point, 0..1 extended. */
  strike(rider: Rider, at: THREE.Vector3, extent: number): void;
  /**
   * Throw a rider at what it has caught, 0..1, without a tongue.
   *
   * What an alligator does. It has no tongue to put out — it takes things in
   * its mouth — so all it gets is the lunge, which is the half of the strike
   * that reads from overhead anyway.
   */
  lunge(rider: Rider, extent: number): void;
  hideTongue(): void;
  update(dt: number): void;
  dispose(): void;
}

const tmp = new THREE.Vector3();

/**
 * Bee vs Frog: eight streams, and a bee who has to get across them.
 *
 * A board, drawn as a place. Every position is a whole number of squares, and
 * the only things that move continuously are the streams themselves and what
 * rides on them — which is the whole game, because a hop lands you somewhere
 * that was safe when you pressed the button.
 *
 * Each stream runs the opposite way to the one before it, so crossing is never
 * a matter of learning one rhythm; and the riders on it are spread evenly
 * round a loop wider than the board, so the gap in the traffic spends part of
 * its time off-screen. See ISLANDS.lanes for how speed is traded against how
 * many things ride.
 */
export function createIslandsScene(rng: Rng): IslandsScene {
  const group = new THREE.Group();
  const sq = I.square;
  const halfBoard = ((I.cols - 1) / 2) * sq;
  const columnX = (col: number): number => (col - (I.cols - 1) / 2) * sq;
  const rowZ = (row: number): number => -row * sq;
  /** How far the water runs either side of the board. */
  const waterHalf = (I.wrapSpan / 2 + 1) * sq;

  // ---- the water ----------------------------------------------------------
  //
  // One slab per stream rather than one pond, because the lanes have to read
  // as separate things running separate ways — the alternating tint is doing
  // as much work here as anything the riders do.
  const still: Array<THREE.BufferGeometry> = [];
  for (let lane = 1; lane <= I.streams; lane++) {
    const slab = new THREE.BoxGeometry(waterHalf * 2, 0.6, sq);
    slab.translate(0, -0.3, rowZ(lane));
    still.push(paint(slab, lane % 2 === 0 ? P.water : P.waterAlt));
  }

  // ---- the banks ----------------------------------------------------------
  //
  // The near one she starts on and the far one she is trying to reach, plus a
  // margin behind each so the board doesn't end at a cliff edge.
  for (const [row, depth] of [
    [0, 4],
    [I.streams + 1, 4],
  ] as const) {
    // Centred so the bank covers the row she stands on and then runs away
    // behind it — the first draft started a square too far back and left the
    // sky showing through the square she starts the level on.
    const dir = row === 0 ? 1 : -1;
    const slab = new THREE.BoxGeometry(waterHalf * 2, 1.4, sq * depth);
    slab.translate(0, -0.7, rowZ(row) + dir * ((sq * depth) / 2 - sq / 2));
    still.push(paint(slab, P.bank));
    // A lip of sand where the grass meets the water, which is what tells you
    // at a glance which rows are solid ground.
    const lip = new THREE.BoxGeometry(waterHalf * 2, 1.45, sq * 0.3);
    lip.translate(0, -0.7, rowZ(row) + (row === 0 ? -1 : 1) * sq * 0.35);
    still.push(paint(lip, P.sand));
  }

  // ---- the pedestals ------------------------------------------------------
  //
  // Three at each end, a row behind the squares that are played on: the near
  // three are where the brood waits its turn, and the far three are what
  // "across" looks like — an empty one is a baby still to fetch, and a full
  // one is one she has already saved.
  const nearPedestals: Array<THREE.Vector3> = [];
  const farPedestals: Array<THREE.Vector3> = [];
  for (const [row, into] of [
    [-1, nearPedestals],
    [I.streams + 2, farPedestals],
  ] as const) {
    for (const col of I.babyColumns) {
      const x = columnX(col);
      const z = rowZ(row);
      const stone = new THREE.CylinderGeometry(
        sq * 0.3,
        sq * 0.36,
        I.pedestalHeight,
        10,
      );
      stone.translate(x, I.pedestalHeight / 2, z);
      still.push(paint(stone, P.rock));
      // A mossy cap, so the top reads as somewhere to stand rather than as the
      // end of a post.
      const cap = new THREE.CylinderGeometry(sq * 0.33, sq * 0.33, 0.22, 10);
      cap.translate(x, I.pedestalHeight + 0.11, z);
      still.push(paint(cap, P.lily));
      into.push(new THREE.Vector3(x, I.pedestalHeight + 0.22, z));
    }
  }

  // Reeds and rocks along both banks — the islands the place is named for.
  // Kept outside the playable columns, so nothing decorative can be mistaken
  // for something you are meant to land on.
  for (let i = 0; i < 30; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (halfBoard + sq * rng.range(0.7, 3.4));
    const z = rowZ(rng.next() < 0.5 ? 0 : I.streams + 1) + rng.range(-4, 4);
    if (rng.next() < 0.45) {
      const rock = new THREE.DodecahedronGeometry(rng.range(0.5, 1.3), 0);
      rock.scale(1, 0.7, 1);
      rock.translate(x, 0.2, z);
      still.push(paint(rock, P.rock));
      continue;
    }
    for (let b = 0; b < 4; b++) {
      const h = rng.range(1.4, 3);
      const reed = new THREE.CylinderGeometry(0.07, 0.1, h, 4);
      reed.translate(0, h / 2, 0);
      reed.rotateZ(rng.range(-0.25, 0.25));
      reed.translate(x + rng.range(-0.8, 0.8), 0, z + rng.range(-0.8, 0.8));
      still.push(paint(reed, P.reed));
    }
  }

  const board = new THREE.Mesh(mergeGeometries(still, false), vertexToon());
  board.receiveShadow = true;
  group.add(board);
  for (const geo of still) {
    geo.dispose();
  }

  // ---- the current --------------------------------------------------------
  //
  // Dashes of foam that run with each stream. They carry no danger and are
  // never tested against; they are there so a lane's direction and speed can
  // be read without waiting for a rider to come past.
  const foamGeo = paint(new THREE.BoxGeometry(sq * 0.9, 0.08, 0.22), P.foam);
  const foamMat = vertexToon();
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, I.streams * 7);
  const foamX: Array<number> = [];
  const foamSpeed: Array<number> = [];
  const foamMatrix = new THREE.Matrix4();
  const foamQuat = new THREE.Quaternion();
  const foamScale = new THREE.Vector3(1, 1, 1);
  let f = 0;
  for (let lane = 1; lane <= I.streams; lane++) {
    const dir = lane % 2 === 0 ? 1 : -1;
    for (let n = 0; n < 7; n++) {
      foamX.push(rng.range(-waterHalf, waterHalf));
      foamSpeed.push(dir * I.lanes[lane - 1].speed * sq);
      foamMatrix.compose(
        tmp.set(foamX[f], 0.32, rowZ(lane) + rng.range(-sq * 0.35, sq * 0.35)),
        foamQuat,
        foamScale,
      );
      foam.setMatrixAt(f, foamMatrix);
      f++;
    }
  }
  const foamZ = new Float32Array(f);
  for (let i = 0; i < f; i++) {
    foam.getMatrixAt(i, foamMatrix);
    foamZ[i] = foamMatrix.elements[14];
  }
  group.add(foam);

  // ---- the riders ---------------------------------------------------------
  const lilyGeo = frogOnLily();
  const padGeo = lilyPad();
  /** Each rider, with the hand-built shape the model file will replace. */
  const swapped: Array<{rider: Rider; drawn: THREE.Object3D}> = [];
  const gatorGeo = gator();
  const mat = vertexToon();
  const riders: Array<Rider> = [];
  for (let lane = 1; lane <= I.streams; lane++) {
    const settings = I.lanes[lane - 1];
    const dir = lane % 2 === 0 ? 1 : -1;
    const spacing = I.wrapSpan / settings.riders;
    // Which of this stream's riders are alligators, spread rather than
    // clumped: a stream of nothing but gators has no tongues in it, and one
    // with them side by side has a hole you can't miss.
    const start = rng.range(0, spacing);
    for (let n = 0; n < settings.riders; n++) {
      const isGator = n < settings.gators;
      // A container that is moved along the stream, with the shape inside it.
      // The shape is hand-built to begin with and is replaced by the model
      // file when that arrives — the level is built in one synchronous call
      // and cannot wait for a download, so this is what it puts up meanwhile.
      const mesh = new THREE.Group();
      const drawn = new THREE.Mesh(isGator ? gatorGeo : lilyGeo, mat);
      drawn.castShadow = true;
      mesh.add(drawn);
      // Facing the way it travels. Everything here is built pointing along +x.
      mesh.rotation.y = dir > 0 ? 0 : Math.PI;
      group.add(mesh);
      riders.push({
        kind: isGator ? "gator" : "frog",
        lane,
        x: wrap(start + n * spacing - I.wrapSpan / 2),
        speed: dir * settings.speed,
        reach: isGator ? I.gatorHalf + I.beeHalf : I.strikeSquares,
        mesh,
      });
      swapped.push({rider: riders[riders.length - 1], drawn});
    }
  }

  // ---- the model files ----------------------------------------------------
  //
  // When they land, every rider trades its hand-built shape for one. A frog
  // keeps its lilypad — that is still ours, and a frog that could drift off
  // its pad would be a bug rather than a feature.
  let alive = true;
  /** Geometry this scene built rather than loaded, and so has to dispose. */
  const built: Array<THREE.BufferGeometry> = [];
  /**
   * Where a frog's mouth is, in its own frame. Zero until the models land,
   * which is also when it starts being asked for — the hand-built frog's mouth
   * is close enough to the model's that the fallback below covers the gap.
   */
  const mouth = new THREE.Vector3();
  void loadIslandModels()
    .then(models => {
      // The level may have been left while the files were still coming down.
      if (!alive) {
        return;
      }
      // One geometry per kind, the frog's with its lilypad merged into it:
      // the pad never moves relative to the frog, so keeping them apart would
      // only cost a second draw call per rider.
      const pad = padGeo.clone().translate(0, -I.frogModel.sit, 0);
      // The pad is built from primitives and still carries their uvs; the
      // model's were dropped when it was baked. `mergeGeometries` answers a
      // mismatch with null rather than an error, and the pads simply vanish.
      pad.deleteAttribute("uv");
      const frogGeo =
        mergeGeometries([models.frog.clone(), pad], false) ?? models.frog;
      pad.dispose();
      built.push(frogGeo);
      mouth.copy(models.mouth);
      for (const {rider, drawn} of swapped) {
        rider.mesh.remove(drawn);
        const mesh = new THREE.Mesh(
          rider.kind === "gator" ? models.croc : frogGeo,
          mat,
        );
        mesh.castShadow = true;
        mesh.position.y = rider.kind === "gator" ? 0 : I.frogModel.sit;
        rider.mesh.add(mesh);
      }
    })
    .catch(() => {
      // The hand-built frogs and gators are already on screen and will do.
    });

  // ---- the tongue ---------------------------------------------------------
  //
  // One of them, moved to whichever frog is using it. It is built along +x
  // from the origin and one unit long, so pointing it is a lookAt and a
  // scale — the only thing in the level that isn't on the grid.
  const tongueGeo = new THREE.CylinderGeometry(0.24, 0.3, 1, 6);
  tongueGeo.rotateZ(-Math.PI / 2);
  tongueGeo.translate(0.5, 0, 0);
  const tongue = new THREE.Mesh(paint(tongueGeo, P.tongue), vertexToon());
  tongue.visible = false;
  group.add(tongue);
  // The end of it, which is what makes it read as a tongue rather than a
  // stick. Its own mesh, because the tongue is stretched along one axis and
  // anything merged into it would be stretched with it.
  const tip = new THREE.Mesh(
    paint(new THREE.SphereGeometry(0.42, 8, 6), P.tongue),
    vertexToon(),
  );
  tip.visible = false;
  group.add(tip);

  const riderPos = (r: Rider, out: THREE.Vector3): THREE.Vector3 =>
    out.set(r.x * sq, r.kind === "gator" ? 0.35 : 0.5, rowZ(r.lane));

  let elapsed = 0;
  return {
    group,
    riders,
    columnX,
    rowZ,
    nearPedestals,
    farPedestals,

    lunge(rider, extent) {
      riderPos(rider, tmp);
      rider.mesh.position.x =
        tmp.x + Math.sign(rider.speed) * extent * sq * I.frogModel.lunge;
    },

    strike(rider, at, extent) {
      riderPos(rider, tmp);
      // The lunge first, and the tongue measured from where the lunge puts it.
      // Worked out here and applied to both, because the two coming from
      // different places is what made the tongue appear to trail out of the
      // frog's back: the frog had moved and the tongue had not.
      const lunge = Math.sign(rider.speed) * extent * sq * I.frogModel.lunge;
      tmp.x += lunge;
      rider.mesh.position.x = tmp.x;
      // Out of the frog's face. `mouth` is measured off the model itself and
      // is in the frog's own frame, so which way it faces decides which way
      // the tongue leaves it; until the model lands, half a body forward and
      // a little up is close enough for the shape that is standing in.
      const forward = mouth.lengthSq() > 0 ? mouth.x : sq * 0.3;
      tmp.x += Math.sign(rider.speed) * forward;
      // `tmp.y` is the height the rider itself rides at; the mouth is that far
      // up the frog again.
      tmp.y += mouth.lengthSq() > 0 ? mouth.y + I.frogModel.sit : 0.25;
      tongue.position.copy(tmp);
      tongue.visible = true;
      const reach = tmp.distanceTo(at) * extent;
      tongue.lookAt(at);
      // `lookAt` points -z at the target; the model runs along +x.
      tongue.rotateY(Math.PI / 2);
      // Thinner the further it goes, like something flicked out.
      tongue.scale.set(reach, 1 - extent * 0.3, 1 - extent * 0.3);
      // The tip travels along it, so the tongue arrives at the bee rather than
      // appearing already there.
      tip.visible = true;
      tip.position.lerpVectors(tmp, at, extent);
      tip.scale.setScalar(0.7 + extent * 0.5);
    },

    hideTongue() {
      tongue.visible = false;
      tip.visible = false;
    },

    update(dt) {
      elapsed += dt;
      for (const rider of riders) {
        rider.x = wrap(rider.x + rider.speed * dt);
        riderPos(rider, tmp);
        rider.mesh.position.copy(tmp);
        // Riding water, not standing on it.
        rider.mesh.position.y +=
          Math.sin(elapsed * 2.2 + rider.lane * 1.7 + rider.x) * 0.09;
      }
      for (let i = 0; i < foamX.length; i++) {
        foamX[i] += foamSpeed[i] * dt;
        if (foamX[i] > waterHalf) {
          foamX[i] -= waterHalf * 2;
        } else if (foamX[i] < -waterHalf) {
          foamX[i] += waterHalf * 2;
        }
        foamMatrix.compose(
          tmp.set(foamX[i], 0.32, foamZ[i]),
          foamQuat,
          foamScale,
        );
        foam.setMatrixAt(i, foamMatrix);
      }
      foam.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      // Anything still downloading is no longer wanted.
      alive = false;
      for (const geo of built) {
        geo.dispose();
      }
      board.geometry.dispose();
      lilyGeo.dispose();
      padGeo.dispose();
      gatorGeo.dispose();
      tongue.geometry.dispose();
      tip.geometry.dispose();
      (tip.material as THREE.Material).dispose();
      foamGeo.dispose();
      foam.dispose();
      mat.dispose();
      foamMat.dispose();
      (board.material as THREE.Material).dispose();
      (tongue.material as THREE.Material).dispose();
    },
  };
}

/** Keep a rider's position inside the loop it travels. */
function wrap(x: number): number {
  const span = I.wrapSpan;
  let v = x;
  while (v > span / 2) {
    v -= span;
  }
  while (v < -span / 2) {
    v += span;
  }
  return v;
}

/**
 * A frog sitting on a lilypad, built as one thing.
 *
 * They never appear apart, and a frog that could drift off its pad would be a
 * bug rather than a feature, so the pad is part of the model. Built facing +x,
 * which is the direction its stream runs.
 */
function frogOnLily(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [lilyPad()];

  const body = new THREE.SphereGeometry(0.62, 10, 8);
  body.scale(1.25, 0.85, 1);
  body.translate(0, 0.52, 0);
  parts.push(paint(body, P.frog));
  const belly = new THREE.SphereGeometry(0.42, 8, 6);
  belly.scale(1.2, 0.5, 0.9);
  belly.translate(0.12, 0.28, 0);
  parts.push(paint(belly, P.frogBelly));

  // Eyes up on top, which is where a frog's are and what makes it read as one
  // from directly above — the only angle this level is played from.
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.17, 8, 6);
    eye.translate(0.26, 0.98, side * 0.28);
    parts.push(paint(eye, P.eye));
    // The pupil sits on top of the eye rather than in front of it: from
    // overhead — the angle this level is played from — a pupil on the front of
    // the eye is hidden by it, and the frog reads as two white blobs.
    const pupil = new THREE.SphereGeometry(0.1, 6, 5);
    pupil.translate(0.3, 1.08, side * 0.28);
    parts.push(paint(pupil, P.pupil));
    // Back legs, folded.
    const leg = new THREE.SphereGeometry(0.3, 6, 5);
    leg.scale(1.3, 0.6, 0.7);
    leg.translate(-0.5, 0.34, side * 0.52);
    parts.push(paint(leg, P.frogDark));
    const foot = new THREE.SphereGeometry(0.18, 6, 5);
    foot.scale(1.4, 0.4, 1);
    foot.translate(0.55, 0.18, side * 0.42);
    parts.push(paint(foot, P.frogDark));
  }

  const merged = mergeGeometries(parts, false);
  for (const geo of parts) {
    geo.dispose();
  }
  return merged ?? new THREE.BufferGeometry();
}

/**
 * The lilypad on its own.
 *
 * The pad is ours whichever frog is sitting on it: the bought model is a frog
 * and nothing else, and a frog without a pad would be swimming.
 */
function lilyPad(): THREE.BufferGeometry {
  const sq = I.square;
  const pad = paint(
    new THREE.CylinderGeometry(sq * 0.42, sq * 0.42, 0.18, 14),
    P.lily,
  );
  // The notch every lilypad has, sitting slightly proud of the pad so it reads
  // from above without needing a second material.
  const notch = new THREE.CylinderGeometry(sq * 0.13, sq * 0.13, 0.2, 8);
  notch.translate(-sq * 0.33, 0.01, 0);
  const merged = mergeGeometries([pad, paint(notch, P.lilyDark)], false);
  pad.dispose();
  notch.dispose();
  return merged ?? new THREE.BufferGeometry();
}

/** An alligator, built facing +x like the frogs. */
function gator(): THREE.BufferGeometry {
  const sq = I.square;
  const parts: Array<THREE.BufferGeometry> = [];
  const length = I.gatorHalf * 2 * sq;

  const body = new THREE.BoxGeometry(length * 0.5, 0.5, sq * 0.5);
  body.translate(-length * 0.1, 0.25, 0);
  parts.push(paint(body, P.gator));

  // The snout: a box tapering to the nose, and the mouth line under it. The
  // dangerous end has to be obvious from above, because which way a gator
  // faces is the whole of what you need to know about it.
  const snout = new THREE.BoxGeometry(length * 0.3, 0.36, sq * 0.33);
  snout.translate(length * 0.3, 0.2, 0);
  parts.push(paint(snout, P.gatorDark));
  const jaw = new THREE.BoxGeometry(length * 0.32, 0.12, sq * 0.3);
  jaw.translate(length * 0.31, 0.1, 0);
  parts.push(paint(jaw, P.gatorBelly));
  for (let t = 0; t < 5; t++) {
    const tooth = new THREE.ConeGeometry(0.07, 0.2, 4);
    tooth.rotateX(Math.PI);
    tooth.translate(
      length * (0.18 + t * 0.07),
      0.22,
      (t % 2 === 0 ? 1 : -1) * sq * 0.11,
    );
    parts.push(paint(tooth, P.tooth));
  }

  const tail = new THREE.ConeGeometry(sq * 0.2, length * 0.45, 4);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-length * 0.45, 0.22, 0);
  parts.push(paint(tail, P.gator));

  // Ridges down the spine, and eyes that sit above the waterline.
  for (let r = 0; r < 5; r++) {
    const ridge = new THREE.ConeGeometry(0.12, 0.3, 4);
    ridge.translate(-length * 0.3 + r * length * 0.11, 0.5, 0);
    parts.push(paint(ridge, P.gatorDark));
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.15, 6, 5);
    eye.translate(length * 0.12, 0.56, side * sq * 0.15);
    parts.push(paint(eye, P.eye));
    const pupil = new THREE.SphereGeometry(0.08, 5, 4);
    pupil.translate(length * 0.15, 0.6, side * sq * 0.16);
    parts.push(paint(pupil, P.pupil));
  }

  const merged = mergeGeometries(parts, false);
  for (const geo of parts) {
    geo.dispose();
  }
  return merged ?? new THREE.BufferGeometry();
}
