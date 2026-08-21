import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {COTTAGE, DANCE, INSIDE, WORLD} from "../../config";
import type {Rng} from "../../core/rng";
import {createGlowBubble, type GlowBubble} from "../glow";
import {loadHouseModel} from "./houseModel";
import {createHoneyJar} from "./honeyJar";
import {paint, solidToon, vertexToon} from "../materials";

export interface CottageScene {
  group: THREE.Group;
  /** Centre of the mat, on the ground. */
  matCentre: THREE.Vector3;
  /** The nine pads, index 4 being the centre. */
  pads: Array<THREE.Mesh>;
  /**
   * What colour each pad is at rest.
   *
   * Stated, not sampled from the live materials: the mat repaints pads as it
   * lights them, so anything reading the material to learn the resting colour
   * can adopt a lit one and leave that pad glowing for good.
   */
  padColours: ReadonlyArray<number>;
  /** World centres of each pad. */
  padCentres: Array<THREE.Vector3>;
  /** Swing the gate to the meadow. Shut until the cottage is unlocked. */
  setGateOpen(open: boolean): void;
  /** Where the bee flies to on her way through the opening. */
  doorway: THREE.Vector3;
  /** The gap in the fence, and the way home to the meadow. */
  gate: THREE.Vector3;
  /** The jar of honey on the mantel, reparented to the bee when picked up. */
  jar: THREE.Group;
  /** Where the jar rests on the mantel above the fire, in world space. */
  jarRest: THREE.Vector3;
  /** Force field around the jar; hidden once it's taken. */
  glow: GlowBubble;
  /** Just inside the opening, where the bee arrives after flying in. */
  entryPosition: THREE.Vector3;
  /**
   * Fade any wall the camera has been pushed behind while she flies the room.
   * Pass the camera-to-bee distance; pass null to leave the house solid (the
   * default, and what every view but the interior gather wants).
   */
  /** Where the eye is, and where the bee is; a null eye leaves the walls
   *  solid. See fadeInFront. */
  setWallFade(eye: THREE.Vector3 | null, bee: THREE.Vector3): void;
  update(elapsed: number): void;
}

/**
 * Caramel Cottage: an open-fronted gingerbread dollhouse (house.glb) with a
 * dance mat laid out in front of its wide opening.
 *
 * The house faces +Z, so the opening — and the mat in front of it — are at +Z,
 * and the bee approaches from further out still. The same model is the outside
 * of the cottage and the room she flies into for the honey.
 */
export function createCottage(rng: Rng): CottageScene {
  const group = new THREE.Group();
  // The clearing stands at the north end of the meadow's world rather than in
  // a scene of its own, so the flight home is one continuous flight. Everything
  // in the yard is authored around a local origin at the house and shifted
  // bodily; the vectors handed back are converted to world space at the end.
  //
  // The gate is the exception — it stands at the other end of the lane
  // entirely — so it hangs off the root in world coordinates instead.
  const yard = new THREE.Group();
  yard.position.z = COTTAGE.yardOffsetZ;
  group.add(yard);

  // ---- clearing ----------------------------------------------------------
  // Mown grass, a shade lighter than the meadow's, laid just above it. It has
  // to stay inside the meadow's ground disc or it hangs over the edge of the
  // world.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(COTTAGE.clearingRadius, 48),
    solidToon(0x8ecb6d),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  yard.add(ground);

  // A worn path from the mat to the door.
  const path = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 24),
    solidToon(0xd8bb84),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, COTTAGE.matOffsetZ);
  path.scale.set(1.1, 1.25, 1);
  yard.add(path);

  yard.add(createHedge(rng));

  // ---- the gate ----------------------------------------------------------
  //
  // It stands in the gap in the *meadow's* hedge, not the clearing's, which is
  // a lane's length further north. That is deliberate: from level 1 the player
  // is looking at a shut gate at the edge of the world they're allowed in, so
  // there is visibly somewhere to go later. The clearing's own hedge just
  // leaves its gap open — nothing bars the way once you're up there.
  //
  // The meadow's hedge is a ring, so the ends of the gap are at
  // (±sin(laneGap), -cos(laneGap)) * its radius. Sitting the straight fence on
  // that chord is what makes it meet the hedge rather than float in front of
  // it.
  const gateRing = WORLD.radius + WORLD.hedgeOffset;
  const gateZ = -Math.cos(WORLD.laneGap) * gateRing;
  const fence = createFence(gateZ, Math.sin(WORLD.laneGap) * gateRing);
  group.add(fence.group);

  // ---- the house, as a model ---------------------------------------------
  //
  // An open-fronted dollhouse (house.glb): the same model is the outside of the
  // cottage and the room the bee flies into for the honey. It loads
  // asynchronously — the level is built synchronously and cannot wait — so an
  // empty container goes in now and the model is dropped into it when ready.
  // Nothing the level steers by depends on the mesh; the opening, the mantel
  // and the mat are all fixed by config, so a late model only changes what is
  // drawn, never where anything is.
  const houseHolder = new THREE.Group();
  yard.add(houseHolder);
  // Set once the model resolves; until then setWallFade has nothing to drive.
  let setModelFade:
    | ((eye: THREE.Vector3 | null, bee: THREE.Vector3, radius: number) => void)
    | null = null;
  loadHouseModel(COTTAGE.modelScale, {
    band: COTTAGE.wallFade.band,
    cutoff: COTTAGE.wallFade.cutoff,
  })
    .then(model => {
      houseHolder.add(model.group);
      setModelFade = model.setFadeFocus;
    })
    .catch(() => {
      // A missing model is not fatal — the clearing, mat and jar still play.
    });

  const O = COTTAGE.opening;

  // ---- dance mat ---------------------------------------------------------
  const matCentre = new THREE.Vector3(0, 0, COTTAGE.matOffsetZ);
  const {mat, pads, padCentres, padColours} = createMat(matCentre);
  yard.add(mat);

  // Everything the level steers by is handed back in world space, so callers
  // never have to know the clearing is parked away from the origin.
  const toWorld = (v: THREE.Vector3) => v.clone().add(yard.position);

  // ---- the honey jar on the mantel ---------------------------------------
  // The jar and its halo live on the group's root, not in the offset yard: the
  // DanglingLoad that flies it writes world-space positions, so its parent has
  // to be an identity frame. Its rest is the mantel, in world space.
  const jarRest = toWorld(
    new THREE.Vector3(COTTAGE.mantel.x, COTTAGE.mantel.y, COTTAGE.mantel.z),
  );
  const jar = createHoneyJar();
  jar.position.copy(jarRest);
  group.add(jar);

  const glow = createGlowBubble({
    radius: INSIDE.jarHeight * 1.25,
    squashY: 1.05,
    hue: 0.11,
    hueRate: 0.05,
    saturation: 0.75,
    lightness: 0.66,
  });
  glow.mesh.position.copy(jarRest);
  // Hidden until the bee is inside for the honey — the cottage scene shows in
  // the meadow too, and a glowing halo out at the far cottage would be a
  // beacon on levels that have nothing to do with it. beginInside lights it.
  glow.mesh.visible = false;
  group.add(glow.mesh);

  // ---- the fire in the hearth --------------------------------------------
  const fire = createFire();
  yard.add(fire.group);

  return {
    group,
    matCentre: toWorld(matCentre),
    pads,
    padColours,
    padCentres: padCentres.map(toWorld),
    // The opening's centre, where the bee crosses the threshold flying in.
    doorway: toWorld(new THREE.Vector3(0, O.y, O.z)),
    // Just inside the opening.
    entryPosition: toWorld(
      new THREE.Vector3(0, COTTAGE.entry.y, COTTAGE.entry.z),
    ),
    // Already world space: the gate never moved with the yard.
    gate: new THREE.Vector3(0, 3, gateZ),
    jar,
    jarRest,
    glow,
    setGateOpen(open) {
      fence.setOpen(open);
    },
    setWallFade(eye, bee) {
      // A null eye — which is everywhere but the interior gather — leaves the
      // house solid, because nothing is ever counted as in front of her.
      if (eye === null) {
        setModelFade?.(null, bee, COTTAGE.wallFade.radius);
        return;
      }
      // Pulled a little toward the camera so she is never caught by her own
      // fade; see the same margin in the Windy Woods.
      const gap = eye.distanceTo(bee);
      const at = bee
        .clone()
        .lerp(
          eye,
          gap > 0.01 ? Math.min(0.9, COTTAGE.wallFade.margin / gap) : 0,
        );
      setModelFade?.(eye, at, COTTAGE.wallFade.radius);
    },
    update(elapsed) {
      glow.update(elapsed);
      jar.getWorldPosition(glow.mesh.position);
      fire.update(elapsed);
      fence.update();
    },
  };
}

/**
 * A roaring fire in the hearth: a few layered flame cones from deep orange up
 * to a white-hot core, unlit so they glow rather than take the room's shading,
 * and a warm point light above them whose intensity flickers so the light it
 * throws across the room is never still.
 */
function createFire(): {group: THREE.Group; update(elapsed: number): void} {
  const group = new THREE.Group();
  group.position.set(COTTAGE.fire.x, COTTAGE.fire.y, COTTAGE.fire.z);

  const {height: H, radius: R} = COTTAGE.fire;
  // A cluster of overlapping tongues rather than concentric cones: the cooler
  // reds flank and sit at the back, the hotter orange/yellow/white stand in
  // front (higher z, toward the opening the camera watches from) so they aren't
  // hidden inside the outer flame. Each licks upward at its own rate.
  const layers = [
    {
      color: 0xff3a12,
      r: R * 0.72,
      h: H * 0.86,
      x: -0.85,
      z: -0.6,
      freq: 8.5,
      phase: 0,
    }, // back-left red
    {
      color: 0xff3a12,
      r: R * 0.66,
      h: H * 0.8,
      x: 0.85,
      z: -0.6,
      freq: 9.3,
      phase: 1.1,
    }, // back-right red
    {color: 0xff7a1e, r: R * 0.7, h: H, x: 0, z: -0.15, freq: 11, phase: 2.0}, // central orange, tallest
    {
      color: 0xffc23a,
      r: R * 0.48,
      h: H * 0.72,
      x: 0.15,
      z: 0.55,
      freq: 13.5,
      phase: 2.6,
    }, // front yellow
    {
      color: 0xfff0b4,
      r: R * 0.26,
      h: H * 0.48,
      x: -0.1,
      z: 0.85,
      freq: 16,
      phase: 3.9,
    }, // hot core, frontmost
  ];
  const flames = layers.map(L => {
    const geo = new THREE.ConeGeometry(L.r, L.h, 7);
    // Base at the group origin so a flame grows from the hearth, not its middle.
    geo.translate(0, L.h / 2, 0);
    const material = new THREE.MeshBasicMaterial({color: L.color});
    // Fire is a light source, not a lit surface — keep it off the tone map so
    // it reads as a glow rather than being crushed with the rest of the scene.
    material.toneMapped = false;
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(L.x, 0, L.z);
    group.add(mesh);
    return {mesh, ox: L.x, freq: L.freq, phase: L.phase};
  });

  // A fiery haze around the flames: soft additive glow billboards that stretch,
  // drift and spin so the hot air around the fire is forever changing shape.
  const hazeTex = makeGlowTexture();
  const hazeSpecs = [
    // A broad dim aura, then brighter cores — all hung in front of the flames
    // (higher z, toward the opening) so the glow reads over them, not behind.
    {
      color: 0xff5a18,
      scale: R * 5.0,
      y: H * 0.45,
      z: 1.4,
      freq: 1.5,
      phase: 0,
      opacity: 0.4,
    },
    {
      color: 0xff8a2a,
      scale: R * 3.2,
      y: H * 0.6,
      z: 1.8,
      freq: 2.3,
      phase: 1.6,
      opacity: 0.55,
    },
    {
      color: 0xffb648,
      scale: R * 2.4,
      y: H * 0.3,
      z: 2.1,
      freq: 1.9,
      phase: 3.1,
      opacity: 0.6,
    },
  ];
  const hazes = hazeSpecs.map(s => {
    const material = new THREE.SpriteMaterial({
      map: hazeTex,
      color: s.color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: s.opacity,
    });
    material.toneMapped = false;
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, s.y, s.z);
    group.add(sprite);
    return {
      sprite,
      base: s.scale,
      y: s.y,
      z: s.z,
      freq: s.freq,
      phase: s.phase,
      opacity: s.opacity,
    };
  });

  const {colour, intensity, distance, y} = COTTAGE.fire.light;
  const light = new THREE.PointLight(colour, intensity, distance, 2);
  light.position.set(0, y, 0);
  group.add(light);

  // A restless flicker: three sines that don't share a period, so it never
  // settles into an obvious pulse. In [0, 1].
  const flicker = (t: number): number =>
    (Math.sin(t * 11.1) + Math.sin(t * 17.7 + 1.1) + Math.sin(t * 23.3 + 2.7)) /
      6 +
    0.5;

  return {
    group,
    update(elapsed) {
      for (const f of flames) {
        // Each flame licks upward at its own rate, swaying and leaning a touch.
        const lick = 1 + Math.sin(elapsed * f.freq + f.phase) * 0.22;
        const sway =
          Math.sin(elapsed * f.freq * 0.6 + f.phase) * COTTAGE.fire.sway;
        f.mesh.scale.set(1 + sway * 0.15, lick, 1 + sway * 0.15);
        f.mesh.position.x = f.ox + sway;
        f.mesh.rotation.z = -sway * 0.12;
      }
      for (const h of hazes) {
        // Stretched unevenly in x and y, so the blob's outline keeps morphing.
        const pulse = 1 + Math.sin(elapsed * h.freq + h.phase) * 0.2;
        const sx =
          h.base *
          pulse *
          (1 + Math.sin(elapsed * h.freq * 1.3 + h.phase) * 0.16);
        const sy =
          h.base *
          pulse *
          (1 + Math.cos(elapsed * h.freq * 1.1 + h.phase) * 0.2);
        h.sprite.scale.set(sx, sy, 1);
        h.sprite.position.x = Math.sin(elapsed * h.freq * 0.7 + h.phase) * 0.6;
        h.sprite.position.y =
          h.y + Math.sin(elapsed * h.freq * 0.9 + h.phase * 1.3) * 0.7;
        h.sprite.material.rotation =
          Math.sin(elapsed * h.freq * 0.5 + h.phase) * 0.5;
        h.sprite.material.opacity =
          h.opacity * (0.6 + 0.4 * flicker(elapsed + h.phase));
      }
      // The light rides the flicker so the whole room breathes with the fire.
      light.intensity = intensity * (0.72 + 0.5 * flicker(elapsed));
    },
  };
}

/**
 * A soft round glow, white fading to nothing, for tinting into fire haze. Drawn
 * once on a canvas — a radial gradient is a couple of lines there and needs no
 * asset file.
 */
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Signed difference between two angles, in (-PI, PI]. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  }
  if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

/**
 * A picket fence across the gap in the meadow's hedge, with a gate in it.
 *
 * It's the signpost for the whole of stage 3: the way home is through there,
 * and from up the lane you can see the hive glowing beyond it. It's shut until
 * Caramel Cottage is unlocked, though — there's nothing up the lane before
 * then, and a gate is a kinder way to say so than an invisible wall.
 *
 * @param z where the run stands, on the meadow's northern boundary
 * @param reach how far either side of the gateway the pickets run
 */
function createFence(
  z: number,
  reach: number,
): {
  group: THREE.Group;
  setOpen(open: boolean): void;
  update(): void;
} {
  const g = new THREE.Group();
  const parts: Array<THREE.BufferGeometry> = [];
  const push = (geo: THREE.BufferGeometry, color: number) =>
    parts.push(paint(geo, color));

  const WOOD = 0xdcc39a;
  const WOOD_DARK = 0xb69466;
  const half = COTTAGE.gateHalfWidth;

  const picket = (x: number, height: number, color: number) => {
    const post = new THREE.BoxGeometry(0.55, height, 0.4);
    post.translate(x, height / 2, z);
    push(post, color);
    // Pointed cap, so it reads as a picket rather than a block.
    const cap = new THREE.ConeGeometry(0.42, 0.7, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(x, height + 0.3, z);
    push(cap, color);
  };

  for (const side of [-1, 1]) {
    for (let x = half + 1.4; x <= reach; x += 1.7) {
      picket(side * x, 3.2, WOOD);
    }
    // Two rails tying the pickets together.
    for (const y of [1.1, 2.4]) {
      const run = reach - half;
      const rail = new THREE.BoxGeometry(run, 0.34, 0.24);
      rail.translate(side * (half + run / 2), y, z);
      push(rail, WOOD_DARK);
    }
    // Gateposts, taller and chunkier than the pickets.
    const gatepost = new THREE.BoxGeometry(0.9, 4.4, 0.9);
    gatepost.translate(side * half, 2.2, z);
    push(gatepost, WOOD_DARK);
    const finial = new THREE.SphereGeometry(0.55, 12, 10);
    finial.translate(side * half, 4.6, z);
    push(finial, WOOD);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) {
    throw new Error("cottage fence: geometry merge failed");
  }
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, vertexToon());
  mesh.castShadow = true;
  g.add(mesh);

  // The two gate leaves, hinged on the gateposts. Shut, they meet in the
  // middle; open, they swing back against the fence.
  const hinges: Array<THREE.Object3D> = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Object3D();
    hinge.position.set(side * half, 0, z);
    // Shut to begin with: the lane is closed until the cottage is unlocked.
    hinge.rotation.y = Math.PI;
    // Wide enough that the pair meet in the middle when shut — a gap between
    // them is an invitation to try to fly through it.
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.9, 0.22),
      solidToon(WOOD),
    );
    leaf.position.set(side * 2.2, 1.55, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    for (const y of [0.9, 2.2]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 0.3, 0.3),
        solidToon(WOOD_DARK),
      );
      bar.position.set(side * 2.2, y, 0.12);
      hinge.add(bar);
    }
    g.add(hinge);
    hinges.push(hinge);
  }

  let open = false;
  return {
    group: g,
    setOpen(next) {
      open = next;
    },
    update() {
      // A leaf sits along its own +x from the hinge, so PI points it across the
      // gap (shut) and the swing back out through 0 leaves it standing proud of
      // the fence. Eased rather than snapped, so a gate that opens mid-level
      // swings rather than teleports.
      for (let i = 0; i < hinges.length; i++) {
        const side = i === 0 ? -1 : 1;
        const target = open ? side * 1.25 : Math.PI;
        hinges[i].rotation.y += (target - hinges[i].rotation.y) * 0.08;
      }
    },
  };
}

/**
 * A ring of bushes so the clearing reads as enclosed — with a gap left at the
 * south side, where the gate through to the meadow is.
 */
function createHedge(rng: Rng): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const bushes = new THREE.InstancedMesh(geo, solidToon(0x4e8f47), 90);
  bushes.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < bushes.count; i++) {
    const a = (i / bushes.count) * Math.PI * 2 + rng.range(-0.03, 0.03);
    // Due south is +Z, i.e. angle PI/2 — leave that stretch clear.
    if (Math.abs(shortestAngle(a, Math.PI / 2)) < COTTAGE.gateGap) {
      // Instances can't be skipped, only hidden: scale it to nothing.
      m.makeScale(0, 0, 0);
      bushes.setMatrixAt(i, m);
      continue;
    }
    const r = COTTAGE.boundsRadius + rng.range(1.5, 5);
    const s = rng.range(1.8, 3.4);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, s * 0.35, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rng.range(0, 1), rng.range(0, 6.28), 0),
      ),
      new THREE.Vector3(s, s * 0.8, s),
    );
    bushes.setMatrixAt(i, m);
  }
  bushes.instanceMatrix.needsUpdate = true;
  return bushes;
}

/**
 * The 3x3 mat. Index 0..8 reading left-to-right, back-to-front; 4 is the
 * centre the bee hovers over. Each pad is its own mesh so it can light up
 * individually.
 */
function createMat(centre: THREE.Vector3): {
  mat: THREE.Group;
  pads: Array<THREE.Mesh>;
  padCentres: Array<THREE.Vector3>;
  padColours: Array<number>;
} {
  const mat = new THREE.Group();
  mat.position.copy(centre);

  const step = DANCE.padSize + DANCE.padGap;

  // Backing board under the pads.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(step * 3 + 0.5, 0.08, step * 3 + 0.5),
    solidToon(0x2f2a3a),
  );
  board.position.y = 0.04;
  board.receiveShadow = true;
  mat.add(board);

  const pads: Array<THREE.Mesh> = [];
  const padCentres: Array<THREE.Vector3> = [];
  const padColours: Array<number> = [];
  const padGeo = new THREE.BoxGeometry(
    DANCE.padSize,
    DANCE.padHeight,
    DANCE.padSize,
  );

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      const isCentre = i === 4;
      const colour = isCentre ? 0xffd75e : 0x6f6890;
      padColours.push(colour);
      const pad = new THREE.Mesh(padGeo, solidToon(colour));
      pad.position.set((col - 1) * step, 0.1, (row - 1) * step);
      pad.receiveShadow = true;
      mat.add(pad);
      pads.push(pad);
      padCentres.push(new THREE.Vector3().copy(centre).add(pad.position));

      // Arrow decal on the eight outer pads, pointing away from the centre.
      if (!isCentre) {
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.34, 0.5, 3),
          solidToon(0xd6d2e8),
        );
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = -Math.atan2(col - 1, -(row - 1));
        arrow.position.set(pad.position.x, 0.17, pad.position.z);
        mat.add(arrow);
      }
    }
  }

  return {mat, pads, padCentres, padColours};
}
