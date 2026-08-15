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

/** One obstacle or two, with the way through between them. */
export interface LairGate {
  x: number;
  /** The opening, floor to roof. A one-sided gate opens onto one of them. */
  gapBottom: number;
  gapTop: number;
  /**
   * The height the gate was laid out around.
   *
   * For a pair it is the middle of the two. For a one-sided gate the opening
   * runs all the way to the floor or the roof, so its middle is nowhere near
   * where the level means you to be — this is the line the run was designed
   * along, and it is what keeps successive gates a flyable distance apart.
   */
  pathY: number;
  obstacles: ReadonlyArray<LairObstacle>;
}

export interface LairScene {
  group: THREE.Group;
  gates: ReadonlyArray<LairGate>;
  /** Where the run ends and she's out in the open again. */
  endX: number;
  /**
   * How solid the wall across the mouth is: 1 shuts the cave off completely,
   * 0 takes it away. The opening shot wants the cave to be a dark hole in a
   * cliff rather than a diagram of the level you are about to play.
   */
  setMouthCover(amount: number): void;
  /** Run the water. Everything else in the cave is still. */
  update(elapsed: number): void;
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

/**
 * Is the bee — a box `2 * halfLength` by `2 * halfHeight`, centred on (x, y) —
 * touching this gate?
 *
 * A box, not a circle. She is drawn 3.3 long and 1.7 tall, and a circle can
 * only match one of those: the first version used a radius of 0.9, which let
 * her nose three quarters of a unit into a rock before anything happened. Both
 * numbers here are measured off the model she is actually drawn from.
 *
 * The test is exact rather than sampled. Every profile here narrows away from
 * its root, so within the band of heights her box covers, the widest the
 * obstacle ever gets is at whichever end of that band is nearest the root —
 * one lookup, no marching.
 */
export function gateHit(
  gate: LairGate,
  x: number,
  y: number,
  halfLength: number,
  halfHeight: number,
): boolean {
  for (const o of gate.obstacles) {
    const dx = Math.abs(x - o.x);
    if (dx > o.halfWidth + halfLength) {
      continue;
    }
    // The heights her box shares with the obstacle. None, and there is nothing
    // to hit — which is what makes the empty air above a spike empty, the one
    // place the player is aiming for.
    const lo = Math.min(o.rootY, o.tipY);
    const hi = Math.max(o.rootY, o.tipY);
    const from = Math.max(y - halfHeight, lo);
    const to = Math.min(y + halfHeight, hi);
    if (from > to) {
      continue;
    }
    // Widest where the obstacle is thickest: the end of that band nearest its
    // root. Below the tip the profile is monotone, so this is the maximum.
    const widest = o.from === 1 ? from : to;
    if (dx <= halfWidthAt(o, widest) + halfLength) {
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
  //
  // Not a row of matched pairs on a fixed pitch. Every gate the same shape at
  // the same interval reads as a grid rather than a cave — so some gates are a
  // spike from the floor with open air above it, some are the roof coming down
  // with open air below, and the distance between them varies too.
  //
  // What doesn't vary is how much room she is left. A one-sided gate leaves
  // exactly the clearance a pair would, on the side she has to be: the shapes
  // change, the flying doesn't get harder.
  const gates: Array<LairGate> = [];

  let centre: number = LAIR.startHeight;
  let x = LAIR.mouthX + LAIR.runIn;
  /** Is the gate about to be built the bottom half of a stair? */
  let stairing = false;
  for (let i = 0; i < LAIR.gateCount; i++) {
    // 0 at the mouth, 1 at the far end. Everything that gets harder does so
    // against this, so the level tightens the whole way rather than arriving
    // at its real difficulty in the first ten gates and staying there.
    const progress = LAIR.gateCount > 1 ? i / (LAIR.gateCount - 1) : 1;
    const gap = LAIR.gapEasy + (LAIR.gap - LAIR.gapEasy) * progress;
    const spacing =
      (LAIR.spacingStart + (LAIR.spacingEnd - LAIR.spacingStart) * progress) *
      rng.range(1 - LAIR.spacingJitter, 1 + LAIR.spacingJitter);

    // Does a stair start at this gate? Decided *before* the gate is placed,
    // because the top of one has to stand high enough for the whole drop to
    // fit above the floor — work it out afterwards and the clamp pulls the
    // second gate back up, and the diagonal comes out as two gates in a row.
    //
    // Never at the very start and never three deep: a stair is one drop, not a
    // staircase to the floor.
    const startsStair: boolean =
      !stairing &&
      progress > LAIR.stairsFrom &&
      i < LAIR.gateCount - 1 &&
      rng.next() < LAIR.stairChanceEnd * progress;

    /** Is this gate itself the bottom half of a stair? */
    const wasStair = stairing;

    // Where the opening can sit without pinching against floor or roof.
    const lo = floorY + LAIR.gapMargin + gap / 2;
    const hi = ceilingY - LAIR.gapMargin - gap / 2;
    if (i > 0 && wasStair) {
      // The bottom of a stair: closer behind the last gate than anything else
      // in the cave, and its way through a little lower. Only a little — the
      // two openings still overlap, so the diagonal is the natural line
      // through the pair rather than the only one that fits.
      x += LAIR.stairSpacing;
      centre -= LAIR.stairOffset;
    } else if (i > 0) {
      x += spacing;
      // How far the way through moves, scaled by how far there is to move in.
      // A gate close behind the last one asking for the same climb as a distant
      // one is the only way irregular spacing can make the level harder rather
      // than just less regular.
      const room = spacing / LAIR.spacingStart;
      centre += rng.range(-LAIR.gapStep, LAIR.gapStep) * room;
    }
    if (startsStair) {
      // Leave room to drop into. Nothing else about a stair is special: it is
      // an ordinary gate with an ordinary opening, and the one after it is an
      // ordinary gate sitting slightly lower and much closer.
      centre = Math.max(centre, lo + LAIR.stairOffset);
    }
    centre = Math.min(hi, Math.max(lo, centre));
    stairing = startsStair;

    // The first few are pairs whatever the dice say: a pair is the shape that
    // teaches the level, and a one-sided gate only reads as a variation once
    // you know what it is varying from. Both halves of a stair are pairs, so
    // that what you are flying down through is plainly two offset gates.
    const roll = rng.next();
    const shape =
      wasStair || startsStair || i < LAIR.pairsToStart || roll < LAIR.pairChance
        ? "pair"
        : roll < LAIR.pairChance + (1 - LAIR.pairChance) / 2
          ? "floor"
          : "roof";

    /** A spike or a rock, chosen per obstacle so a pair can be one of each. */
    const pick = (): {kind: LairObstacle["kind"]; halfWidth: number} =>
      // Slim ones through a stair: they stand close together and a pair of
      // wide rocks a stair's length apart reads as one lump of cave.
      wasStair || startsStair
        ? {kind: "spike", halfWidth: LAIR.stairSpikeHalfWidth}
        : rng.next() < 0.5
          ? {kind: "spike", halfWidth: LAIR.spikeHalfWidth}
          : {kind: "rock", halfWidth: LAIR.rockHalfWidth};

    const obstacles: Array<LairObstacle> = [];
    let gapBottom = floorY;
    let gapTop = ceilingY;
    if (shape !== "roof") {
      gapBottom = centre - gap / 2;
      obstacles.push({x, from: 1, rootY: floorY, tipY: gapBottom, ...pick()});
    }
    if (shape !== "floor") {
      gapTop = centre + gap / 2;
      obstacles.push({x, from: -1, rootY: ceilingY, tipY: gapTop, ...pick()});
    }
    gates.push({x, gapBottom, gapTop, pathY: centre, obstacles});
  }

  const endX = x + LAIR.runOut;

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
  /** The ledge outside the mouth, which is visible before she has flown in. */
  const ledge: Array<THREE.BufferGeometry> = [];
  const slab = (
    y: number,
    thickness: number,
    colour: number,
    startX = from,
    into: Array<THREE.BufferGeometry> = shell,
  ): void => {
    const run = to - startX;
    const geo = new THREE.BoxGeometry(run, thickness, caveDepth);
    geo.translate(startX + run / 2, y, caveMidZ);
    into.push(paint(geo, colour));
  };
  slab(floorY - 1.5, 3, P.ground);
  slab(ceilingY + 1.5, 3, P.rock);
  // Separately, so it can stay on screen while the cave behind it is not
  // drawn at all: she stands on this in the opening shot.
  const ledgeGeo = new THREE.BoxGeometry(from - outside, 3, caveDepth);
  ledgeGeo.translate((outside + from) / 2, floorY - 1.5, caveMidZ);
  ledge.push(paint(ledgeGeo, P.ground));
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
      rng.range(from, to),
      roof ? ceilingY + rng.range(-1, 0.4) : floorY + rng.range(-0.4, 1),
      rng.range(caveBack + 1, caveFront - 1),
    );
    shell.push(paint(lump, roof ? P.rockDark : P.ground));
  }

  const shellMesh = new THREE.Mesh(mergeGeometries(shell, false), vertexToon());
  shellMesh.renderOrder = -1;
  group.add(shellMesh);
  const ledgeMesh = new THREE.Mesh(mergeGeometries(ledge, false), vertexToon());
  group.add(ledgeMesh);
  for (const geo of [...shell, ...ledge]) {
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
  /** Half-width of the opening. The corridor behind it is built from this. */
  const archRz = 11;
  // Two rings, the outer one bigger and set back: one ring alone reads as a
  // circle of stones standing in a field, and it is the thickness that makes
  // it a hole in a cliff.
  for (const ring of [
    {rz: archRz, scale: 1, back: 0, light: 3},
    {rz: archRz + 5, scale: 1.5, back: -5, light: 4},
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

  // ---- the corridor you can see into --------------------------------------
  //
  // What the opening shot shows through the arch. Not the real cave — that is
  // not drawn at all yet, because looking straight down it would show the
  // player the first several gates before they had flown one.
  //
  // The same arch again and again, running back into the hill: identical
  // profile, barely tapering, each ring a little darker than the one in front
  // until they are lost. That is what makes it read as one construction with
  // the doorway rather than as something sitting behind it — earlier goes at
  // this were a flat wall across the opening, then a narrow stone tube, and
  // both looked like an object stopping the hole rather than a cave carrying
  // on.
  //
  // Rings of boulders alone are not a wall, though: they are beads on a
  // thread, and you can see between them and out the other side. So the rock
  // is relief on top of a solid surface — a skinned arch running the length of
  // the corridor, shaded the same way — and the boulders break its silhouette
  // up so it doesn't read as a moulded tube.

  /** The arch's profile at a given depth: `i` runs 0..profileSteps over it. */
  const profileSteps = 20;
  const profileAt = (
    along: number,
    i: number,
    out: THREE.Vector3,
  ): THREE.Vector3 => {
    const shrink = 1 - along * LAIR.tunnelTaper;
    const a = (i / profileSteps) * Math.PI;
    return out.set(
      LAIR.mouthX + along * LAIR.tunnelLength,
      floorY + Math.sin(a) * archRy * shrink,
      archZ + Math.cos(a) * archRz * shrink,
    );
  };

  const dark = new THREE.Color(0x06050b).convertSRGBToLinear();
  const skinPositions: Array<number> = [];
  const skinColours: Array<number> = [];
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const pD = new THREE.Vector3();
  const shadeA = new THREE.Color();
  const shadeB = new THREE.Color();
  const skinShade = (along: number, out: THREE.Color): THREE.Color =>
    out
      .set(P.rockDark)
      .convertSRGBToLinear()
      .lerp(dark, Math.min(1, along ** 0.7));
  const quad = (c0: THREE.Color, c1: THREE.Color): void => {
    for (const [p, c] of [
      [pA, c0],
      [pB, c0],
      [pC, c1],
      [pA, c0],
      [pC, c1],
      [pD, c1],
    ] as Array<[THREE.Vector3, THREE.Color]>) {
      skinPositions.push(p.x, p.y, p.z);
      skinColours.push(c.r, c.g, c.b);
    }
  };
  const skinSpans = LAIR.tunnelRings * 2;
  for (let span = 0; span < skinSpans; span++) {
    const t0 = span / skinSpans;
    const t1 = (span + 1) / skinSpans;
    skinShade(t0, shadeA);
    skinShade(t1, shadeB);
    for (let i = 0; i < profileSteps; i++) {
      profileAt(t0, i, pA);
      profileAt(t0, i + 1, pB);
      profileAt(t1, i + 1, pC);
      profileAt(t1, i, pD);
      quad(shadeA, shadeB);
    }
  }
  // ...and a floor for it, since the arch stands on the ground and the cave's
  // own floor is one of the things not being drawn yet.
  profileAt(0, 0, pA);
  profileAt(0, profileSteps, pB);
  profileAt(1, profileSteps, pC);
  profileAt(1, 0, pD);
  skinShade(0, shadeA);
  skinShade(1, shadeB);
  quad(shadeA, shadeB);

  const skinGeo = new THREE.BufferGeometry();
  skinGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(skinPositions), 3),
  );
  skinGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(skinColours), 3),
  );

  const tunnelPieces: Array<THREE.BufferGeometry> = [];
  const tunnelColours = [P.rock, P.rockLight, P.spike, P.rockDark];
  const shade = new THREE.Color();
  const ringGap = LAIR.tunnelLength / LAIR.tunnelRings;
  for (let ring = 0; ring < LAIR.tunnelRings; ring++) {
    const along = ring / (LAIR.tunnelRings - 1);
    const ringX = LAIR.mouthX + (ring + 1) * ringGap;
    // Only just narrowing. The corridor is the doorway continued, so it keeps
    // the doorway's size; the taper is there to help the eye read depth in
    // something this dark, not to make a funnel.
    const shrink = 1 - along * LAIR.tunnelTaper;
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      const boulder = new THREE.IcosahedronGeometry(
        rng.range(2.6, 4.4) * shrink,
        0,
      );
      boulder.scale(0.7, 1, 1.1);
      boulder.translate(
        ringX + rng.range(-1.2, 1.2),
        floorY + Math.sin(a) * archRy * shrink,
        archZ + Math.cos(a) * archRz * shrink,
      );
      // The doorway's own stone, taken down toward black with distance.
      shade
        .set(tunnelColours[(ring + i) % tunnelColours.length])
        .convertSRGBToLinear()
        .lerp(dark, along ** 0.8);
      const pos = boulder.attributes.position;
      const colours = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        colours[v * 3] = shade.r;
        colours[v * 3 + 1] = shade.g;
        colours[v * 3 + 2] = shade.b;
      }
      boulder.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      // The skin is written by hand with nothing but positions and colours,
      // and merging only works across geometries with the same attributes —
      // an unlit material wants neither of these anyway.
      boulder.deleteAttribute("normal");
      boulder.deleteAttribute("uv");
      tunnelPieces.push(boulder);
    }
  }
  const coverMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // Seen from inside the arch, so both faces are drawn: the skin is a shell
    // with no thickness at all.
    side: THREE.DoubleSide,
    // Unlit: the shading is painted in, so the far end stays black however the
    // sun happens to be pointing.
    fog: false,
  });
  const cover = new THREE.Mesh(
    mergeGeometries([skinGeo, ...tunnelPieces], false),
    coverMaterial,
  );
  skinGeo.dispose();
  cover.renderOrder = 1;
  group.add(cover);
  for (const geo of tunnelPieces) {
    geo.dispose();
  }

  // Blackness behind the last ring, so the corridor finishes in nothing rather
  // than in a view of whatever is beyond it. Sized to the last ring and stood
  // just inside it, because anything wider shows past the edge of the arch as
  // a black shape hanging outside the cave.
  const capShrink = 1 - LAIR.tunnelTaper;
  const capGeo = new THREE.PlaneGeometry(
    archRz * 2 * capShrink,
    archRy * capShrink,
  );
  capGeo.rotateY(Math.PI / 2);
  capGeo.translate(
    LAIR.mouthX + LAIR.tunnelLength - 1,
    floorY + (archRy * capShrink) / 2,
    archZ,
  );
  const cap = new THREE.Mesh(
    capGeo,
    new THREE.MeshBasicMaterial({
      color: 0x06050b,
      transparent: true,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  cap.renderOrder = 0;
  group.add(cap);

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
        // Turned an eighth of a facet, so a vertex faces the camera.
        //
        // ConeGeometry puts its vertices at x = r·sin(θ) for θ = 0, 60, 120…,
        // which never reaches sin 90° — so a six-sided spike is only drawn
        // 0.866·r wide, while collision uses r. Raycasting the mesh put the
        // gap at 0.33 units on the widest spike: a third of a unit of solid
        // air, exactly the invisible wall this level must not have. Rotating
        // by 30° lands a vertex on the silhouette and makes the drawing as
        // wide as the model says it is.
        geo.rotateY(Math.PI / 6);
        geo.translate(0, span / 2, 0);
      } else {
        // Twelve around and eight up. Coarser than this and the rings near the
        // pole cut the corner off the dome: at 8x6 the drawn tip came back
        // 0.19 narrower than the curve collision tests against, which is five
        // or six pixels of rock that isn't there.
        geo = new THREE.SphereGeometry(
          o.halfWidth,
          12,
          8,
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
      // Flattened almost to a cut-out, and stood just behind the bee.
      //
      // Both for the same reason: what the player judges is the gap between
      // two silhouettes, and silhouettes at different depths don't measure the
      // same. With the obstacles three units behind her they projected about
      // 11% narrower than collision tested them — a third of a unit of clear
      // air on the widest rock that still counted as a hit. Thin and close
      // brings that to under 3%, which is a pixel or two on screen.
      geo.scale(1, 1, LAIR.obstacleFlatten);
      geo.translate(o.x, o.rootY, LAIR.beeZ - LAIR.obstacleStandoff);
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

  // ---- water off the stalactites ------------------------------------------
  //
  // Only the ones hanging from the roof, which is what a stalactite is — the
  // spikes standing on the floor are stalagmites and have nothing to drip.
  const drippers = gates
    .flatMap(gate => gate.obstacles)
    .filter(
      o => o.from === -1 && o.kind === "spike" && rng.next() < LAIR.dripChance,
    );

  const dripGeo = new THREE.SphereGeometry(LAIR.dripSize, 6, 5);
  // Slightly tall, the way a drop hanging off something is.
  dripGeo.scale(1, 1.35, 1);
  const drips = new THREE.InstancedMesh(
    dripGeo,
    solidToon(P.water),
    Math.max(1, drippers.length),
  );
  drips.frustumCulled = false;
  group.add(drips);

  const dripState = drippers.map(o => ({
    x: o.x,
    // Just under the point, in the plane the obstacles are drawn in.
    tipY: o.tipY,
    z: LAIR.beeZ - LAIR.obstacleStandoff,
    period: rng.range(LAIR.dripPeriod[0], LAIR.dripPeriod[1]),
    phase: rng.range(0, 10),
  }));
  const dripDummy = new THREE.Object3D();

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
    update(elapsed) {
      for (let i = 0; i < dripState.length; i++) {
        const d = dripState[i];
        const t = (elapsed + d.phase) % d.period;
        const fallFrom = d.tipY;
        let y: number;
        let scale: number;
        if (t < LAIR.dripHang) {
          // Hanging on, swelling. This is most of what makes it read as a
          // drip rather than a falling pebble.
          y = fallFrom;
          scale = 0.35 + 0.65 * (t / LAIR.dripHang);
        } else {
          const fallen = (t - LAIR.dripHang) * LAIR.dripSpeed;
          y = fallFrom - fallen;
          // An instance can't be skipped, so one that has landed is scaled to
          // nothing instead — see the note in render/geometry/maze.ts.
          scale = y > floorY ? 1 : 0;
        }
        dripDummy.position.set(d.x, Math.max(floorY, y), d.z);
        dripDummy.scale.setScalar(scale);
        dripDummy.updateMatrix();
        drips.setMatrixAt(i, dripDummy.matrix);
      }
      drips.instanceMatrix.needsUpdate = true;
    },

    setMouthCover(amount) {
      const a = Math.max(0, Math.min(1, amount));
      coverMaterial.opacity = a;
      (cap.material as THREE.MeshBasicMaterial).opacity = a;
      cap.visible = a > 0.01;
      // Fully transparent still costs a draw call and still writes nothing
      // useful; once it is gone it is gone.
      cover.visible = a > 0.01;
      // The corridor isn't merely hidden behind the wall — it isn't drawn.
      //
      // A wall across the opening is not enough on its own: the cave runs six
      // hundred units off to the right, and from a shot standing outside and
      // to one side you see the length of it past the edge of the arch, which
      // nothing placed in the doorway can cover. Everything except the ledge
      // she is standing on and the arch itself goes away until the camera has
      // committed to going in.
      const shut = a >= 0.999;
      shellMesh.visible = !shut;
      obstacleMesh.visible = !shut;
      crystalMesh.visible = !shut;
      drips.visible = !shut;
    },
    dispose() {
      group.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
    },
  };
}
