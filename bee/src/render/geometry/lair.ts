import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {LAIR, LAIR_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, solidToon, vertexToon} from "../materials";

/**
 * One obstacle: a spike or a rock, growing from the floor or the roof.
 *
 * `halfWidthAt` is what collision asks. A cone tested as its bounding box
 * would stop the bee a body's width from a tip she can plainly see is thin,
 * and being hit by something that isn't there is the one thing this kind of
 * game must never do.
 */
export interface LairObstacle {
  x: number;
  /** Where it grows from: the floor (+1) or the roof (-1). */
  from: 1 | -1;
  /** The y its root sits at, and the y its point reaches. */
  rootY: number;
  tipY: number;
  halfWidth: number;
  kind: "spike" | "rock";
}

/** A pair of obstacles with a gap between them. */
export interface LairGate {
  x: number;
  gapBottom: number;
  gapTop: number;
  obstacles: ReadonlyArray<LairObstacle>;
}

export interface LairScene {
  group: THREE.Group;
  gates: ReadonlyArray<LairGate>;
  /** Where the run ends and she's out in the open again. */
  endX: number;
  dispose(): void;
}

/**
 * How wide an obstacle is at height `y` — 0 anywhere past its tip.
 *
 * A spike tapers straight to a point. A rock is a dome, so it stays broad for
 * most of its height and then falls away quickly, which is what it looks like.
 */
export function halfWidthAt(o: LairObstacle, y: number): number {
  const height = Math.abs(o.tipY - o.rootY);
  if (height <= 1e-6) {
    return 0;
  }
  const t = ((y - o.rootY) * o.from) / height;
  if (t < 0 || t > 1) {
    return 0;
  }
  return o.kind === "spike"
    ? o.halfWidth * (1 - t)
    : o.halfWidth * Math.sqrt(Math.max(0, 1 - t * t));
}

/** Is a circle at (x, y) touching this gate? */
export function gateHit(
  gate: LairGate,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (const o of gate.obstacles) {
    const dx = Math.abs(x - o.x);
    if (dx > o.halfWidth + radius) {
      continue;
    }
    // How far past the point she is, in the direction it grows.
    //
    // This case has to come first. Above the tip the profile is zero wide, and
    // testing `dx <= width + radius` there would make the empty air above every
    // spike solid for a body's width either side of it — which is the middle of
    // the gap, the one place the player is aiming for.
    const past = (y - o.tipY) * o.from;
    if (past > 0) {
      // Only the point itself is anywhere near, and a point is a point.
      if (Math.hypot(dx, past) <= radius) {
        return true;
      }
      continue;
    }
    // Inside its height: widen the silhouette by her radius and ask whether her
    // centre is in it. Exact enough at this scale, and it errs the forgiving
    // way where the taper is steepest.
    if (dx <= halfWidthAt(o, y) + radius) {
      return true;
    }
  }
  return false;
}

/**
 * The Bear's Lair: a cave laid out along +x, seen from the side.
 *
 * Everything is built once, in place. The run is only about 550 units long, so
 * there is nothing to gain from recycling obstacles behind the camera, and a
 * fixed cave means the same seed plays the same way — which matters when the
 * level's whole promise is that it is learnable.
 */
export function createLairScene(rng: Rng): LairScene {
  const group = new THREE.Group();
  const {floorY, ceilingY} = LAIR;
  const height = ceilingY - floorY;

  // How deep the cave is, front to back.
  //
  // Barely any: everything is seen from one side, and depth here costs rather
  // than gives. A floor eighteen units deep projects as a huge diagonal band
  // running up to the horizon and eats half the frame — a shallow box reads as
  // the flat slot the game is actually played in.
  const caveFront = LAIR.obstacleFrontZ + 1;
  const caveBack = LAIR.obstacleBackZ - 1;
  const caveDepth = caveFront - caveBack;
  const caveMidZ = (caveFront + caveBack) / 2;

  // ---- the gates, as data first ------------------------------------------
  const gates: Array<LairGate> = [];
  let centre: number = LAIR.startHeight;
  for (let i = 0; i < LAIR.gateCount; i++) {
    const x = LAIR.mouthX + LAIR.runIn + i * LAIR.gateSpacing;
    // Ease from the wide opening to the real one over the first few gates.
    const ramp = Math.min(1, i / LAIR.gatesToFullDifficulty);
    const gap = LAIR.gapEasy + (LAIR.gap - LAIR.gapEasy) * ramp;

    // Where the opening can sit without pinching against floor or roof.
    const lo = floorY + LAIR.gapMargin + gap / 2;
    const hi = ceilingY - LAIR.gapMargin - gap / 2;
    if (i > 0) {
      centre += rng.range(-LAIR.gapStep, LAIR.gapStep);
    }
    centre = Math.min(hi, Math.max(lo, centre));

    const gapBottom = centre - gap / 2;
    const gapTop = centre + gap / 2;
    // Alternating, not random: a spike and a rock at the same gate reads as two
    // different things to fly between rather than one shape repeated.
    const kind: LairObstacle["kind"] = i % 2 === 0 ? "spike" : "rock";
    const halfWidth =
      kind === "spike" ? LAIR.spikeHalfWidth : LAIR.rockHalfWidth;
    gates.push({
      x,
      gapBottom,
      gapTop,
      obstacles: [
        {x, from: 1, rootY: floorY, tipY: gapBottom, halfWidth, kind},
        {x, from: -1, rootY: ceilingY, tipY: gapTop, halfWidth, kind},
      ],
    });
  }

  const endX =
    LAIR.mouthX +
    LAIR.runIn +
    (LAIR.gateCount - 1) * LAIR.gateSpacing +
    LAIR.runOut;

  // ---- the shell ----------------------------------------------------------
  //
  // The cave proper starts at the mouth. Only the floor reaches back past it —
  // the opening shot stands the bee outside looking in, and a roof over her
  // there would mean she was already in the cave she is about to fly into.
  const outside = LAIR.mouthX - 70;
  const to = endX + 60;
  const from: number = LAIR.mouthX;
  const length = to - from;
  const midX = (from + to) / 2;

  const shell: Array<THREE.BufferGeometry> = [];
  const slab = (
    y: number,
    thickness: number,
    colour: number,
    startX = from,
  ): void => {
    const run = to - startX;
    const geo = new THREE.BoxGeometry(run, thickness, caveDepth);
    geo.translate(startX + run / 2, y, caveMidZ);
    shell.push(paint(geo, colour));
  };
  slab(floorY - 1.5, 3, P.ground, outside);
  slab(ceilingY + 1.5, 3, P.rock);
  // The back of the cave. Everything is seen against this, so it is the darkest
  // thing in the level — the silhouettes have to come off it.
  const back = new THREE.BoxGeometry(length, height + 12, 2);
  back.translate(midX, floorY + height / 2, caveBack - 1);
  shell.push(paint(back, P.rockDark));

  // Lumps along the floor and roof, so neither is a drawn line. Set back from
  // the play plane and small enough never to reach a gap.
  for (let i = 0; i < 90; i++) {
    const lump = new THREE.IcosahedronGeometry(rng.range(1.4, 3.6), 0);
    const roof = rng.next() < 0.5;
    lump.scale(rng.range(0.8, 1.6), rng.range(0.5, 1), 0.7);
    lump.translate(
      rng.range(roof ? from : outside, to),
      roof ? ceilingY + rng.range(-1, 0.4) : floorY + rng.range(-0.4, 1),
      rng.range(caveBack + 1, caveFront - 1),
    );
    shell.push(paint(lump, roof ? P.rockDark : P.ground));
  }

  const shellMesh = new THREE.Mesh(mergeGeometries(shell, false), vertexToon());
  shellMesh.renderOrder = -1;
  group.add(shellMesh);
  for (const geo of shell) {
    geo.dispose();
  }

  // ---- the mouth ----------------------------------------------------------
  //
  // An arch of boulders rather than a wall with a hole in it: there is no
  // boolean geometry here, and a ring of rocks reads as a cave mouth from the
  // outside and frames the first gates from the inside.
  const arch: Array<THREE.BufferGeometry> = [];
  // Centred on the plane the bee flies in, not on the cave's own middle. The
  // opening shot looks straight down the cave, and an arch centred behind her
  // puts her against its rim rather than in the middle of the hole.
  const archZ = LAIR.beeZ - 2;
  const archRy = ceilingY - 1;
  // Two rings, the outer one bigger and set back: one ring alone reads as a
  // circle of stones standing in a field, and it is the thickness that makes
  // it a hole in a cliff.
  for (const ring of [
    {rz: 11, scale: 1, back: 0, light: 3},
    {rz: 16, scale: 1.5, back: -5, light: 4},
  ]) {
    const steps = ring.rz > 12 ? 26 : 20;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      const boulder = new THREE.IcosahedronGeometry(
        rng.range(2.6, 4.4) * ring.scale,
        0,
      );
      boulder.scale(0.7, 1, 1.1);
      boulder.translate(
        LAIR.mouthX + ring.back + rng.range(-1, 1),
        floorY + Math.sin(a) * archRy * ring.scale,
        archZ + Math.cos(a) * ring.rz,
      );
      arch.push(paint(boulder, i % ring.light === 0 ? P.rockLight : P.rock));
    }
  }
  const archMesh = new THREE.Mesh(mergeGeometries(arch, false), vertexToon());
  group.add(archMesh);
  for (const geo of arch) {
    geo.dispose();
  }

  // ---- the obstacles ------------------------------------------------------
  const pieces: Array<THREE.BufferGeometry> = [];
  for (const gate of gates) {
    for (const o of gate.obstacles) {
      const span = Math.abs(o.tipY - o.rootY);
      if (span < 0.4) {
        continue;
      }
      let geo: THREE.BufferGeometry;
      if (o.kind === "spike") {
        // Six sides: enough to be round, few enough to keep the facets the
        // rest of the game is drawn with.
        geo = new THREE.ConeGeometry(o.halfWidth, span, 6);
        geo.translate(0, span / 2, 0);
      } else {
        geo = new THREE.SphereGeometry(
          o.halfWidth,
          8,
          6,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        );
        geo.scale(1, span / o.halfWidth, 1);
      }
      if (o.from === -1) {
        geo.rotateZ(Math.PI);
      }
      // Squashed in z so it is a silhouette, not a boulder: the camera only
      // ever sees this edge-on, and depth here would only muddy the outline.
      geo.scale(1, 1, 0.75);
      geo.translate(
        o.x,
        o.rootY,
        (LAIR.obstacleFrontZ + LAIR.obstacleBackZ) / 2 + 2,
      );
      pieces.push(paint(geo, o.kind === "spike" ? P.spike : P.rock));
    }
  }
  const obstacleMesh = new THREE.Mesh(
    mergeGeometries(pieces, false),
    vertexToon(),
  );
  group.add(obstacleMesh);
  for (const geo of pieces) {
    geo.dispose();
  }

  // ---- crystals -----------------------------------------------------------
  //
  // Purely so the cave has something in it that isn't grey. They sit against
  // the back wall, well clear of the play plane.
  const crystals: Array<THREE.BufferGeometry> = [];
  for (let i = 0; i < 44; i++) {
    const span = rng.range(1.4, 3.4);
    const geo = new THREE.ConeGeometry(rng.range(0.3, 0.7), span, 5);
    // Rooted in the floor or hanging from the roof, never floating in the
    // middle: a cone in mid-air reads as something you have to avoid.
    const roof = rng.next() < 0.4;
    geo.translate(0, roof ? -span / 2 : span / 2, 0);
    if (roof) {
      geo.rotateZ(Math.PI);
    }
    geo.rotateZ(rng.range(-0.35, 0.35));
    geo.translate(
      rng.range(from, to),
      roof ? ceilingY - 0.2 : floorY + 0.2,
      caveBack + rng.range(1, 2.5),
    );
    crystals.push(geo);
  }
  const crystalMesh = new THREE.Mesh(
    mergeGeometries(crystals, false),
    solidToon(P.crystal),
  );
  group.add(crystalMesh);
  for (const geo of crystals) {
    geo.dispose();
  }

  return {
    group,
    gates,
    endX,
    dispose() {
      group.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
    },
  };
}
