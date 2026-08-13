import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FLIGHT, PALETTE} from "../../config";
import {paint, solidToon, vertexToon} from "../materials";

export interface BeeModel {
  group: THREE.Group;
  /**
   * Advance wing flap and body attitude. `speed01` is 0..1 of max speed;
   * `climb01` is -1..1 of max climb rate (positive is climbing).
   */
  animate(elapsed: number, speed01: number, climb01: number): void;
  /** Show or hide the royal crown. Hidden by default. */
  setCrown(on: boolean): void;
}

/**
 * Little gold crown, sized for the standard bee head. Shared by the player
 * (once she's queen enough to have founded a hive) and by the queen herself.
 */
function createCrown(): THREE.Group {
  const crown = new THREE.Group();
  const bandMat = solidToon(0xffe066);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.21, 0.09, 10),
    bandMat,
  );
  crown.add(band);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.16, 6),
      bandMat,
    );
    spike.position.set(Math.cos(a) * 0.17, 0.11, Math.sin(a) * 0.17);
    crown.add(spike);

    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      solidToon(0xff5b8a),
    );
    jewel.position.set(Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17);
    crown.add(jewel);
  }

  // Sits on top of the head, tilted back a touch so it reads from behind.
  crown.position.set(0, 0.3, 0.46);
  crown.rotation.x = -0.18;
  return crown;
}

/**
 * The bee is built entirely from primitives and merged into a single
 * vertex-coloured mesh (one draw call) plus two wings that need their own
 * transforms. No rig, no glTF, no baked animation.
 *
 * Local space: +Z is forward, +Y is up.
 */
export function createBee(): BeeModel {
  const parts: Array<THREE.BufferGeometry> = [];

  const add = (geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4) => {
    geo.applyMatrix4(m);
    parts.push(paint(geo, color));
  };
  const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    );

  // Thorax
  add(
    new THREE.SphereGeometry(0.34, 18, 14),
    PALETTE.beeBody,
    at(0, 0, 0.02, 1, 0.92, 1.05),
  );
  // Fuzzy collar between thorax and head
  add(
    new THREE.SphereGeometry(0.3, 16, 12),
    0xfff0c2,
    at(0, 0.01, 0.22, 1, 0.9, 0.7),
  );

  // Abdomen: three shrinking spheres give a tapered, segmented look cheaply
  const seg: Array<[number, number, number]> = [
    [-0.34, 0.36, 0.0],
    [-0.66, 0.31, -0.02],
    [-0.92, 0.22, -0.05],
  ];
  for (const [z, r, y] of seg) {
    add(
      new THREE.SphereGeometry(r, 16, 12),
      PALETTE.beeBody,
      at(0, y, z, 1, 0.92, 1.1),
    );
  }
  // Stripes — a torus in the XY plane wraps the Z axis, which is exactly right.
  for (const [z, r] of [
    [-0.2, 0.345],
    [-0.5, 0.33],
    [-0.79, 0.255],
  ] as const) {
    add(
      new THREE.TorusGeometry(r, 0.075, 6, 18),
      PALETTE.beeStripe,
      at(0, 0, z, 1, 0.92, 1),
    );
  }
  // Stinger
  add(
    new THREE.ConeGeometry(0.07, 0.22, 8),
    PALETTE.beeStripe,
    at(0, -0.06, -1.14).multiply(
      new THREE.Matrix4().makeRotationX(-Math.PI / 2),
    ),
  );

  // Head + face
  add(
    new THREE.SphereGeometry(0.27, 16, 12),
    PALETTE.beeHead,
    at(0, 0.03, 0.48, 1, 0.95, 0.92),
  );
  for (const sx of [-1, 1]) {
    add(
      new THREE.SphereGeometry(0.1, 12, 10),
      0xffffff,
      at(sx * 0.13, 0.08, 0.68, 1, 1.15, 0.8),
    );
    add(
      new THREE.SphereGeometry(0.05, 8, 8),
      0x241a10,
      at(sx * 0.15, 0.08, 0.73, 1, 1.1, 0.7),
    );
    // Antenna
    const ant = new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6);
    const m = new THREE.Matrix4()
      .makeTranslation(sx * 0.1, 0.32, 0.55)
      .multiply(new THREE.Matrix4().makeRotationZ(sx * 0.5))
      .multiply(new THREE.Matrix4().makeRotationX(-0.5));
    add(ant, PALETTE.beeStripe, m);
    add(
      new THREE.SphereGeometry(0.045, 8, 6),
      PALETTE.beeStripe,
      at(sx * 0.24, 0.46, 0.63),
    );
  }

  const bodyGeo = mergeGeometries(parts, false);
  if (!bodyGeo) {
    throw new Error("bee: geometry merge failed");
  }
  bodyGeo.computeVertexNormals();

  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, vertexToon());
  body.castShadow = true;
  group.add(body);

  // Wings: a flattened disc pivoting at its inner edge.
  const wingMat = solidToon(PALETTE.wing);
  wingMat.transparent = true;
  wingMat.opacity = 0.55;
  wingMat.side = THREE.DoubleSide;
  wingMat.depthWrite = false;

  const wingGeo = new THREE.CircleGeometry(0.52, 14);
  wingGeo.scale(1, 0.46, 1);
  wingGeo.translate(0.52, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);

  const wings: Array<THREE.Object3D> = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(sx * 0.12, 0.26, 0.0);
    pivot.scale.x = sx;
    const mesh = new THREE.Mesh(wingGeo, wingMat);
    pivot.add(mesh);
    group.add(pivot);
    wings.push(pivot);
  }

  const crown = createCrown();
  crown.visible = false;
  group.add(crown);

  return {
    group,
    setCrown(on) {
      crown.visible = on;
    },
    animate(elapsed, speed01, climb01) {
      const flap = Math.sin(elapsed * Math.PI * 2 * FLIGHT.flapHz);
      // Climbing means working harder: wider, faster-looking beats.
      const spread = 0.35 + speed01 * 0.35 + Math.max(0, climb01) * 0.25;
      for (let i = 0; i < wings.length; i++) {
        const dir = i === 0 ? -1 : 1;
        wings[i].rotation.z = dir * (0.12 + flap * spread);
        wings[i].rotation.y = dir * flap * 0.12;
      }
      // Nose down as it speeds up, and up when climbing (+x pitches down).
      body.rotation.x =
        speed01 * 0.18 - climb01 * 0.4 + Math.sin(elapsed * 4.5) * 0.015;
    },
  };
}

/**
 * The queen: the same construction, scaled up and re-coloured, with a crown.
 * She never flies in level 2 — she sits on her dais and breathes.
 */
export function createQueen(): BeeModel {
  const model = createBee();
  const group = new THREE.Group();
  group.add(model.group);
  group.scale.setScalar(1.9);

  // Recolour the body to a deeper royal amber so she reads as distinct.
  const body = model.group.children[0] as THREE.Mesh;
  const mat = body.material as THREE.MeshToonMaterial;
  mat.color = new THREE.Color(0xffb347);

  model.setCrown(true);

  return {
    group,
    setCrown: model.setCrown,
    animate(elapsed, speed01, climb01) {
      model.animate(elapsed, speed01, climb01);
      // Slow regal sway rather than flight. The bob goes on the inner group —
      // the outer one carries the placement the caller gave us, and writing
      // to it here would drag her down into the dais.
      group.rotation.y = Math.sin(elapsed * 0.35) * 0.22;
      model.group.position.y = Math.sin(elapsed * 0.9) * 0.09;
    },
  };
}

export interface BabyModel {
  group: THREE.Group;
  animate(elapsed: number, wiggle: number): void;
  /** 0..1 through its three feeds; drives how plump and grown it looks. */
  setGrowth(t: number): void;
}

/**
 * A grub-ish baby bee: fat, pale, oversized eyes, stubby wings. Deliberately
 * rounder than the adults so the ring around the queen reads as nursery.
 */
export function createBaby(): BabyModel {
  const parts: Array<THREE.BufferGeometry> = [];
  const push = (geo: THREE.BufferGeometry, color: number) =>
    parts.push(paint(geo, color));

  // Segmented body
  for (const [z, r, c] of [
    [-0.36, 0.26, 0xf6d98a],
    [-0.12, 0.31, 0xffe6a3],
    [0.16, 0.28, 0xf6d98a],
  ] as const) {
    const seg = new THREE.SphereGeometry(r, 14, 10);
    seg.scale(1, 0.92, 1.05);
    seg.translate(0, 0, z);
    push(seg, c);
  }
  // Head
  const head = new THREE.SphereGeometry(0.26, 14, 10);
  head.translate(0, 0.05, 0.42);
  push(head, 0x4a3520);
  for (const sx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.115, 10, 8);
    eye.translate(sx * 0.12, 0.09, 0.6);
    push(eye, 0xffffff);
    const pupil = new THREE.SphereGeometry(0.06, 8, 8);
    pupil.translate(sx * 0.13, 0.08, 0.68);
    push(pupil, 0x211608);
  }

  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error("baby: geometry merge failed");
  }
  geo.computeVertexNormals();

  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, vertexToon());
  body.castShadow = true;
  group.add(body);

  // Proper bee stripes, earned at full growth. Parented to the body mesh so
  // they inherit the growth scaling for free. A torus lies in the XY plane,
  // which wraps the Z axis — the direction the body runs. Each radius is
  // matched to the body's girth where it sits.
  const stripes: Array<THREE.Mesh> = [];
  for (const [z, r] of [
    [-0.29, 0.288],
    [0.02, 0.302],
  ] as const) {
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.07, 6, 18),
      solidToon(PALETTE.beeStripe),
    );
    stripe.position.z = z;
    stripe.scale.y = 0.92; // match the body's squash
    stripe.castShadow = true;
    stripe.visible = false;
    body.add(stripe);
    stripes.push(stripe);
  }

  // Stubby wings that only flutter when it wiggles.
  const wingMat = solidToon(PALETTE.wing);
  wingMat.transparent = true;
  wingMat.opacity = 0.5;
  wingMat.side = THREE.DoubleSide;
  wingMat.depthWrite = false;
  const wingGeo = new THREE.CircleGeometry(0.22, 10);
  wingGeo.scale(1, 0.5, 1);
  wingGeo.translate(0.22, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);

  // The left wing is the right one mirrored through x. That sign lives in the
  // pivot's scale, so anything rescaling a wing has to preserve it — a plain
  // setScalar() flips the left wing onto the right and the baby looks
  // one-winged.
  const wings: Array<THREE.Object3D> = [];
  const wingSigns: Array<number> = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(sx * 0.1, 0.2, -0.05);
    pivot.scale.set(sx, 1, 1);
    pivot.add(new THREE.Mesh(wingGeo, wingMat));
    group.add(pivot);
    wings.push(pivot);
    wingSigns.push(sx);
  }

  let growth = 0;

  return {
    group,
    setGrowth(t) {
      growth = THREE.MathUtils.clamp(t, 0, 1);
      // Big enough to read as a bee from across the dome even when newly
      // hatched, and it lengthens out rather than ballooning as it grows.
      const s = 0.92 + growth * 0.4;
      body.scale.setScalar(s);
      const w = 0.85 + growth * 0.5;
      for (let i = 0; i < wings.length; i++) {
        wings[i].scale.set(wingSigns[i] * w, w, w);
      }
      // Fully grown, so it earns its stripes.
      for (const stripe of stripes) {
        stripe.visible = growth >= 1;
      }
    },
    animate(elapsed, wiggle) {
      // Hungry babies rock side to side and flap; full ones just breathe.
      const rock = Math.sin(elapsed * 5.5) * 0.22 * wiggle;
      group.rotation.z = rock;
      group.rotation.x = Math.sin(elapsed * 2.2) * 0.05;
      const flap = Math.sin(elapsed * Math.PI * 2 * 9) * (0.15 + wiggle * 0.5);
      for (let i = 0; i < wings.length; i++) {
        wings[i].rotation.z = (i === 0 ? -1 : 1) * (0.2 + flap);
      }
      const breathe = 1 + Math.sin(elapsed * 1.7 + growth) * 0.03;
      group.scale.y = breathe;
    },
  };
}
