import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ANT_HUNT as A, ANT_PALETTE as P, WATER} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, vertexToon} from "../materials";

/** One island, with the hill its ants run home to. */
export interface Island {
  readonly centre: THREE.Vector3;
  /** Mouth of the ant hill: where a robbed ant goes to disappear. */
  readonly hill: THREE.Vector3;
}

export interface AntIslands {
  group: THREE.Group;
  readonly islands: ReadonlyArray<Island>;
  /** Open the gate on a bridge, or ask whether it is open. */
  openGate(bridge: number): void;
  isGateOpen(bridge: number): boolean;
  /**
   * Pull a position back into where the bee is allowed to be.
   *
   * The allowed world is the three islands and whichever bridges have been
   * opened — not a circle, which is all the flight model itself can express,
   * so the level does this by hand every frame after she has moved. Returns
   * true if it had to move her.
   */
  contain(position: THREE.Vector3): boolean;
  /** Which island a position is over, or -1 out on a bridge or the water. */
  islandAt(position: THREE.Vector3): number;
  update(dt: number): void;
  dispose(): void;
}

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/**
 * The Ant Hunt's world: three islands, two bridges and two gates.
 *
 * The shape of it is the level. Each island is a room the bee cannot leave
 * until she has done what she came for, and the only door is a wooden bridge
 * with a bar across it — so there is never a moment where the next thing to do
 * is somewhere else. The third island joins the second and nothing joins it
 * back to the first, which is what makes the last hunt the end of the level
 * rather than a lap of a ring.
 *
 * Containment is done here rather than by the flight model because the flight
 * model knows about one circle and this is three of them with corridors
 * between — see `contain`.
 */
export function createAntIslands(rng: Rng): AntIslands {
  const group = new THREE.Group();
  const still: Array<THREE.BufferGeometry> = [];
  const islands: Array<Island> = [];

  // ---- the islands --------------------------------------------------------
  for (const [i, spec] of A.islands.entries()) {
    const centre = new THREE.Vector3(spec.x, 0, spec.z);
    // Grass on top of a wider skirt of rock, so the island reads as standing
    // out of the water rather than floating on it.
    const top = new THREE.CylinderGeometry(
      A.islandRadius,
      A.islandRadius,
      0.8,
      28,
    );
    top.translate(centre.x, -0.4, centre.z);
    still.push(paint(top, P.grass));
    const rim = new THREE.CylinderGeometry(
      A.islandRadius + 0.6,
      A.islandRadius - 1.6,
      A.islandHeight,
      28,
    );
    rim.translate(centre.x, -A.islandHeight / 2 - 0.6, centre.z);
    still.push(paint(rim, P.sand));
    const base = new THREE.CylinderGeometry(
      A.islandRadius - 1.6,
      A.islandRadius - 5,
      3.4,
      24,
    );
    base.translate(centre.x, -A.islandHeight - 2.3, centre.z);
    still.push(paint(base, P.cliff));

    // A ring of surf at the waterline.
    //
    // Cheap, static, and doing the job the waves can't: a rippling plane cuts
    // through an island in a hard line, and that line is what gives the whole
    // thing away. A band of foam sits over it. It floats a little above the
    // crests on purpose — at this size, water that laps *over* the ring reads
    // as the ring being underwater rather than as surf.
    const foam = new THREE.RingGeometry(
      A.islandRadius - 0.3,
      A.islandRadius + WATER.foamWidth,
      36,
    );
    foam.rotateX(-Math.PI / 2);
    foam.translate(centre.x, WATER.level + 0.42, centre.z);
    still.push(paint(foam, WATER.foamColour));

    // ---- the ant hill ----
    //
    // Off centre, so the island has a near side and a far side and the run
    // home is a different length depending on where an ant is robbed.
    const angle = rng.range(0, Math.PI * 2);
    const hill = new THREE.Vector3(
      centre.x + Math.cos(angle) * A.islandRadius * 0.42,
      0,
      centre.z + Math.sin(angle) * A.islandRadius * 0.42,
    );
    /*
     * A mound with its top taken off, and the hole set into that.
     *
     * It was a plain cone with a collar and a dark funnel stacked on top, and
     * the collar was far wider than the cone was at that height — so the hole
     * floated in the air above the peak instead of being a way into the hill.
     * Flattening the top to exactly the collar's width is what makes the two
     * meet: everything below is the mound, everything above it is the rim, and
     * the funnel drops away inside.
     */
    /*
     * A low mound with its top taken off, and the hole laid into that top.
     *
     * Everything here is flat and faces up, which is the whole trick. The
     * first version had a funnel sunk into the mound and it could not be seen
     * at all — looking into a cone means looking at its inside, and back faces
     * are culled. The second made the opening nearly as wide as the top, which
     * read as a dark lid on the hill rather than a way into it. This is a
     * brown collar with a black opening inside it, in the proportions of a
     * real ant hill: mostly earth, with a small dark mouth.
     */
    const topRadius = A.hillRadius * 0.62;
    const mound = new THREE.CylinderGeometry(
      topRadius,
      A.hillRadius,
      A.hillHeight,
      16,
    );
    mound.translate(hill.x, A.hillHeight / 2, hill.z);
    still.push(paint(mound, P.hill));
    const collar = new THREE.RingGeometry(topRadius * 0.55, topRadius, 16);
    collar.rotateX(-Math.PI / 2);
    collar.translate(hill.x, A.hillHeight + 0.02, hill.z);
    still.push(paint(collar, P.hillDark));
    const hole = new THREE.CircleGeometry(topRadius * 0.56, 16);
    hole.rotateX(-Math.PI / 2);
    hole.translate(hill.x, A.hillHeight + 0.03, hill.z);
    still.push(paint(hole, P.hillHole));
    hill.y = A.hillHeight;
    islands.push({centre, hill});

    // Tufts and stones, kept off the middle where the ants run.
    for (let n = 0; n < 26; n++) {
      const a = rng.range(0, Math.PI * 2);
      const r = A.islandRadius * Math.sqrt(rng.range(0.35, 0.98));
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      if (rng.next() < 0.3) {
        const stone = new THREE.DodecahedronGeometry(rng.range(0.4, 1.1), 0);
        stone.scale(1, 0.7, 1);
        stone.translate(x, 0.2, z);
        still.push(paint(stone, P.rock));
        continue;
      }
      for (let b = 0; b < 3; b++) {
        const h = rng.range(0.6, 1.5);
        const blade = new THREE.ConeGeometry(0.13, h, 3);
        blade.translate(0, h / 2, 0);
        blade.rotateZ(rng.range(-0.3, 0.3));
        blade.translate(x + rng.range(-0.7, 0.7), 0, z + rng.range(-0.7, 0.7));
        still.push(paint(blade, b === 0 ? P.grassDark : P.grass));
      }
    }
    void i;
  }

  // ---- the bridges --------------------------------------------------------
  //
  // Planks, posts and a rope handrail: old-fashioned, and narrow enough that
  // crossing one is a thing you aim at rather than a thing that happens.
  const gates: Array<{
    pivot: THREE.Group;
    open: boolean;
    swing: number;
    bar: THREE.Mesh;
    /** The angle at which the bar lies across the deck, barring the way. */
    shutYaw: number;
  }> = [];
  const spans: Array<{a: THREE.Vector3; b: THREE.Vector3}> = [];

  for (const [i, bridge] of A.bridges.entries()) {
    const from = islands[bridge.from].centre;
    const to = islands[bridge.to].centre;
    const along = tmp.copy(to).sub(from).setY(0).normalize().clone();
    const start = from
      .clone()
      .addScaledVector(along, A.islandRadius - A.bridgeOverlap);
    const end = to
      .clone()
      .addScaledVector(along, -(A.islandRadius - A.bridgeOverlap));
    spans.push({a: start, b: end});
    const length = start.distanceTo(end);
    const mid = start.clone().lerp(end, 0.5);
    const yaw = Math.atan2(along.x, along.z);

    // The deck, laid as separate planks so it reads as boards rather than a
    // ramp — the gaps are the whole character of the thing.
    const planks = Math.max(4, Math.round(length / 1.1));
    for (let p = 0; p < planks; p++) {
      const t = (p + 0.5) / planks;
      const plank = new THREE.BoxGeometry(A.bridgeHalfWidth * 2, 0.22, 0.78);
      plank.rotateY(yaw);
      const at = start.clone().lerp(end, t);
      plank.translate(at.x, -0.5 + Math.sin(t * Math.PI) * 0.35, at.z);
      still.push(paint(plank, p % 2 === 0 ? P.plank : P.plankDark));
    }
    // Two stringers under the planks, so it isn't floating slats.
    for (const side of [-1, 1]) {
      const beam = new THREE.BoxGeometry(0.28, 0.26, length);
      beam.rotateY(yaw);
      beam.translate(
        mid.x + Math.cos(yaw) * side * A.bridgeHalfWidth * 0.8,
        -0.75,
        mid.z - Math.sin(yaw) * side * A.bridgeHalfWidth * 0.8,
      );
      still.push(paint(beam, P.plankDark));
    }
    // Posts and a rope between them.
    const posts = Math.max(3, Math.round(length / 4));
    for (const side of [-1, 1]) {
      for (let p = 0; p <= posts; p++) {
        const t = p / posts;
        const at = start.clone().lerp(end, t);
        const post = new THREE.CylinderGeometry(0.13, 0.16, 1.5, 6);
        post.translate(
          at.x + Math.cos(yaw) * side * A.bridgeHalfWidth,
          0.1,
          at.z - Math.sin(yaw) * side * A.bridgeHalfWidth,
        );
        still.push(paint(post, P.plankDark));
      }
      const rail = new THREE.CylinderGeometry(0.06, 0.06, length, 5);
      rail.rotateX(Math.PI / 2);
      rail.rotateY(yaw);
      rail.translate(
        mid.x + Math.cos(yaw) * side * A.bridgeHalfWidth,
        0.75,
        mid.z - Math.sin(yaw) * side * A.bridgeHalfWidth,
      );
      still.push(paint(rail, P.rope));
    }

    // ---- the gate ----
    //
    // At the near end, and its own object because it swings. A bar across two
    // posts: shut it is a red line across the deck, open it stands aside.
    const gateAt = start.clone().addScaledVector(along, 0.6);
    const pivot = new THREE.Group();
    pivot.position.set(
      gateAt.x + Math.cos(yaw) * A.bridgeHalfWidth,
      0.55,
      gateAt.z - Math.sin(yaw) * A.bridgeHalfWidth,
    );
    /*
     * Shut is a quarter turn off the bridge's own heading — and which quarter
     * matters.
     *
     * The bar is built along its pivot's -z and hung from one end, and the
     * pivot stands on one rail. At the bridge's own yaw the bar lies *down*
     * the bridge, which is what a gate standing open looks like. A quarter
     * turn the wrong way swings it out over the water beside the bridge: still
     * square to the way through, and still not barring it. This is the quarter
     * that lays it from its own rail across to the other one.
     */
    const shutYaw = yaw + Math.PI / 2;
    pivot.rotation.y = shutYaw;
    const barGeo = new THREE.BoxGeometry(0.2, 0.9, A.bridgeHalfWidth * 2);
    // Hung from one end, so rotating the pivot swings it like a farm gate.
    barGeo.translate(0, 0, -A.bridgeHalfWidth);
    // Painted white and coloured by the material, not the vertices: the bar
    // changes colour as it swings, and vertex colours multiply — tinting a red
    // bar green gives mud rather than green.
    const bar = new THREE.Mesh(
      paint(barGeo, 0xffffff),
      new THREE.MeshToonMaterial({vertexColors: true, color: P.gate}),
    );
    const slats: Array<THREE.BufferGeometry> = [];
    for (const y of [-0.25, 0.25]) {
      const slat = new THREE.BoxGeometry(0.16, 0.16, A.bridgeHalfWidth * 1.9);
      slat.translate(0, y, -A.bridgeHalfWidth);
      slats.push(paint(slat, 0xffffff));
    }
    const barMerged = mergeGeometries([bar.geometry, ...slats], false);
    if (barMerged) {
      bar.geometry.dispose();
      bar.geometry = barMerged;
    }
    for (const slat of slats) {
      slat.dispose();
    }
    pivot.add(bar);
    group.add(pivot);
    gates.push({pivot, open: false, swing: 0, bar, shutYaw});
    void i;
  }

  const board = new THREE.Mesh(mergeGeometries(still, false), vertexToon());
  board.receiveShadow = true;
  board.castShadow = true;
  group.add(board);
  for (const geo of still) {
    geo.dispose();
  }

  // ---- containment --------------------------------------------------------
  //
  // The allowed world as a list of shapes: a disc per island, and a corridor
  // per bridge that only counts once its gate is open.
  const nearestOnDisc = (
    at: THREE.Vector3,
    centre: THREE.Vector3,
    radius: number,
    out: THREE.Vector3,
  ): number => {
    tmpB.copy(at).sub(centre).setY(0);
    const d = tmpB.length();
    if (d <= radius) {
      out.copy(at);
      return 0;
    }
    out.copy(centre).addScaledVector(tmpB.divideScalar(d), radius).setY(at.y);
    return d - radius;
  };

  const nearestOnSpan = (
    at: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3,
    halfWidth: number,
    out: THREE.Vector3,
  ): number => {
    tmpB.copy(b).sub(a).setY(0);
    const lengthSq = tmpB.lengthSq();
    const t =
      lengthSq > 0
        ? Math.max(
            0,
            Math.min(1, tmp.copy(at).sub(a).setY(0).dot(tmpB) / lengthSq),
          )
        : 0;
    tmp.copy(a).addScaledVector(tmpB, t);
    const away = tmpB.copy(at).sub(tmp).setY(0);
    const d = away.length();
    if (d <= halfWidth) {
      out.copy(at);
      return 0;
    }
    out.copy(tmp).addScaledVector(away.divideScalar(d), halfWidth).setY(at.y);
    return d - halfWidth;
  };

  const candidate = new THREE.Vector3();
  const best = new THREE.Vector3();
  /**
   * The shape she was last legitimately inside.
   *
   * Containment clamps to *this*, not to whichever shape happens to be
   * nearest. Nearest is wrong in the obvious way: out on the water between two
   * islands the far one can be the closer, and she was teleported across the
   * very gap she was being stopped from crossing. Clamping to where she
   * already was means the only way onto another island is to fly there — over
   * a bridge, which is the whole point of the gates.
   */
  let home: {kind: "island" | "span"; index: number} = {
    kind: "island",
    index: 0,
  };

  const clampToHome = (position: THREE.Vector3): void => {
    if (home.kind === "island") {
      nearestOnDisc(
        position,
        islands[home.index].centre,
        A.islandRadius,
        candidate,
      );
    } else {
      const span = spans[home.index];
      nearestOnSpan(position, span.a, span.b, A.bridgeHalfWidth, candidate);
    }
    position.copy(candidate);
  };

  return {
    group,
    islands,

    openGate(bridge) {
      const gate = gates[bridge];
      if (gate) {
        gate.open = true;
      }
    },

    isGateOpen(bridge) {
      return gates[bridge]?.open ?? false;
    },

    islandAt(position) {
      for (const [i, island] of islands.entries()) {
        if (
          tmp.copy(position).sub(island.centre).setY(0).length() <=
          A.islandRadius
        ) {
          return i;
        }
      }
      return -1;
    },

    contain(position) {
      // Somewhere allowed? Then that is where she now belongs, and there is
      // nothing to do.
      for (const [i, island] of islands.entries()) {
        if (
          nearestOnDisc(position, island.centre, A.islandRadius, best) === 0
        ) {
          home = {kind: "island", index: i};
          return false;
        }
      }
      for (const [i, span] of spans.entries()) {
        // A shut bridge is a wall, not a corridor.
        if (!gates[i]?.open) {
          continue;
        }
        if (
          nearestOnSpan(position, span.a, span.b, A.bridgeHalfWidth, best) === 0
        ) {
          home = {kind: "span", index: i};
          return false;
        }
      }
      clampToHome(position);
      return true;
    },

    update(dt) {
      for (const gate of gates) {
        const want = gate.open ? 1 : 0;
        if (gate.swing === want) {
          continue;
        }
        const step = dt / A.gateSwing;
        gate.swing = Math.min(1, gate.swing + step);
        // A quarter turn back, from across the way through to alongside it.
        gate.pivot.rotation.y = gate.shutYaw - ease(gate.swing) * (Math.PI / 2);
        // And it goes green as it swings. The angle is the truth of it, but
        // the colour is what carries at the height the camera watches from.
        (gate.bar.material as THREE.MeshToonMaterial).color
          .set(P.gate)
          .lerp(new THREE.Color(P.gateOpen), ease(gate.swing));
      }
    },

    dispose() {
      board.geometry.dispose();
      (board.material as THREE.Material).dispose();
      for (const gate of gates) {
        gate.bar.geometry.dispose();
        (gate.bar.material as THREE.Material).dispose();
      }
    },
  };
}

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;
