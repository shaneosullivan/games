import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ASCENT_PALETTE as P} from "../config";
import {paint, vertexToon} from "../render/materials";

/**
 * Everything the ball can pick up on the way down.
 *
 * Each shape is built at radius 1 and scaled to whatever size it happens to be
 * at that point on the hill, because in this level size is the rule rather
 * than a decoration: the same rabbit is an obstacle at the top and a mouthful
 * at the bottom, and it has to be the same rabbit.
 *
 * Built about their own centres rather than standing on their feet, so that
 * scaling one doesn't sink it into the hillside — the level lifts each one by
 * its radius when it places it.
 */
export type RollKind =
  "flower" | "bush" | "honey" | "bucket" | "rabbit" | "goat" | "tree";

export interface RollKit {
  material: THREE.Material;
  shapes: Record<RollKind, THREE.BufferGeometry>;
  dispose(): void;
}

export function createRollKit(): RollKit {
  const material = vertexToon();
  const shapes: Record<RollKind, THREE.BufferGeometry> = {
    flower: flower(),
    bush: bush(),
    tree: tree(),
    honey: honey(),
    bucket: bucket(),
    rabbit: rabbit(),
    goat: goat(),
  };
  return {
    material,
    shapes,
    dispose() {
      for (const geo of Object.values(shapes)) {
        geo.dispose();
      }
      material.dispose();
    },
  };
}

const LEAF = 0x4f9a3c;
const LEAF_DARK = 0x3b7a2c;
const BARK = 0x7a5433;
const HONEY = 0xf0a52c;
const GLASS = 0xdfe9ef;
const WOOD = 0x9a6b3f;
const IRON = 0x7e8a94;
const FUR = 0xd8cfc0;
const FUR_DARK = 0x9d9182;
const GOAT = 0xe8e4dc;
const HORN = 0xb9a487;

/** A big meadow flower, seen from the side. */
function flower(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const stem = new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6);
  stem.translate(0, -0.35, 0);
  parts.push(paint(stem, 0x4f9a3c));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.32, 8, 6);
    petal.scale(1, 0.35, 1);
    petal.translate(Math.cos(a) * 0.42, 0.42, Math.sin(a) * 0.42);
    parts.push(paint(petal, 0xf2607e));
  }
  const eye = new THREE.SphereGeometry(0.26, 8, 6);
  eye.scale(1, 0.5, 1);
  eye.translate(0, 0.5, 0);
  parts.push(paint(eye, 0xffd84a));
  return merge(parts);
}

/** A round bush: three overlapping blobs, two shades. */
function bush(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  for (const [x, y, z, r, dark] of [
    [0, 0, 0, 0.72, false],
    [0.5, -0.16, 0.2, 0.52, true],
    [-0.44, -0.1, -0.22, 0.46, false],
    [0.06, 0.42, -0.24, 0.42, true],
  ] as const) {
    const blob = new THREE.SphereGeometry(r, 8, 6);
    blob.scale(1, 0.86, 1);
    blob.translate(x, y, z);
    parts.push(paint(blob, dark ? LEAF_DARK : LEAF));
  }
  const stump = new THREE.CylinderGeometry(0.12, 0.16, 0.4, 6);
  stump.translate(0, -0.72, 0);
  parts.push(paint(stump, BARK));
  return merge(parts);
}

/**
 * A pine, built about its middle.
 *
 * Everything here is scaled by its radius and lifted by it, so a tree that
 * stood on its own origin would be buried to the waist. Its trunk hangs below
 * the centre and its canopy above, which also means it rolls convincingly once
 * it is stuck to the ball: the mass is off to one side of where it is held.
 */
function tree(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.3, 7);
  trunk.translate(0, -0.5, 0);
  parts.push(paint(trunk, BARK));
  const tiers = [
    [0.05, 0.9, 0.8],
    [0.5, 0.75, 0.72],
    [0.95, 0.55, 0.62],
  ] as const;
  tiers.forEach(([y, r, h], i) => {
    const tier = new THREE.ConeGeometry(r, h, 8);
    tier.translate(0, y, 0);
    parts.push(paint(tier, i % 2 === 0 ? LEAF : LEAF_DARK));
  });
  return merge(parts);
}

/** A pot of honey with the lid still on. */
function honey(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.CylinderGeometry(0.62, 0.5, 1.1, 12);
  parts.push(paint(body, GLASS));
  const fill = new THREE.CylinderGeometry(0.58, 0.47, 0.7, 12);
  fill.translate(0, -0.16, 0);
  parts.push(paint(fill, HONEY));
  const lid = new THREE.CylinderGeometry(0.68, 0.68, 0.22, 12);
  lid.translate(0, 0.62, 0);
  parts.push(paint(lid, 0xc0532f));
  return merge(parts);
}

/** A wooden bucket with glowing moss heaped over the rim. */
function bucket(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const pail = new THREE.CylinderGeometry(0.66, 0.5, 1.05, 12, 1, true);
  parts.push(paint(pail, WOOD));
  const base = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12);
  base.translate(0, -0.5, 0);
  parts.push(paint(base, WOOD));
  const band = new THREE.TorusGeometry(0.63, 0.06, 6, 14);
  band.rotateX(Math.PI / 2);
  band.translate(0, 0.2, 0);
  parts.push(paint(band, IRON));
  // The moss stands proud of the rim rather than filling it flush — a bucket
  // whose contents stop exactly at the lip reads as an empty bucket.
  for (const [x, y, z, r] of [
    [0, 0.6, 0, 0.5],
    [0.34, 0.52, 0.16, 0.34],
    [-0.3, 0.5, -0.2, 0.3],
  ] as const) {
    const lump = new THREE.SphereGeometry(r, 8, 6);
    lump.scale(1, 0.7, 1);
    lump.translate(x, y, z);
    parts.push(paint(lump, P.moss));
  }
  return merge(parts);
}

/** A rabbit, sitting up. */
function rabbit(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(0.62, 10, 8);
  body.scale(0.9, 1, 1.05);
  body.translate(0, -0.15, 0);
  parts.push(paint(body, FUR));
  const head = new THREE.SphereGeometry(0.38, 10, 8);
  head.translate(0, 0.52, 0.12);
  parts.push(paint(head, FUR));
  for (const side of [-1, 1]) {
    const ear = new THREE.CapsuleGeometry(0.1, 0.5, 4, 6);
    ear.rotateZ(side * 0.18);
    ear.translate(side * 0.16, 1, 0.04);
    parts.push(paint(ear, FUR));
  }
  const tail = new THREE.SphereGeometry(0.2, 8, 6);
  tail.translate(0, -0.3, -0.6);
  parts.push(paint(tail, 0xffffff));
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.07, 6, 5);
    eye.translate(side * 0.17, 0.56, 0.42);
    parts.push(paint(eye, 0x2a2318));
  }
  const foot = new THREE.SphereGeometry(0.24, 8, 6);
  foot.scale(1, 0.5, 1.5);
  foot.translate(0, -0.62, 0.28);
  parts.push(paint(foot, FUR_DARK));
  return merge(parts);
}

/** A mountain goat, standing broadside. */
function goat(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(0.6, 10, 8);
  body.scale(0.72, 0.78, 1.25);
  body.translate(0, 0.08, 0);
  parts.push(paint(body, GOAT));
  const neck = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8);
  neck.rotateX(-0.5);
  neck.translate(0, 0.42, 0.5);
  parts.push(paint(neck, GOAT));
  const head = new THREE.SphereGeometry(0.28, 8, 6);
  head.scale(0.85, 0.85, 1.2);
  head.translate(0, 0.62, 0.76);
  parts.push(paint(head, GOAT));
  for (const side of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.1, 0.5, 6);
    horn.rotateX(0.7);
    horn.translate(side * 0.15, 0.86, 0.62);
    parts.push(paint(horn, HORN));
    const eye = new THREE.SphereGeometry(0.06, 6, 5);
    eye.translate(side * 0.2, 0.68, 0.9);
    parts.push(paint(eye, 0x2a2318));
  }
  const beard = new THREE.ConeGeometry(0.1, 0.3, 6);
  beard.rotateX(Math.PI);
  beard.translate(0, 0.42, 0.82);
  parts.push(paint(beard, HORN));
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    const leg = new THREE.CylinderGeometry(0.09, 0.08, 0.7, 6);
    leg.translate(sx * 0.28, -0.5, sz * 0.5);
    parts.push(paint(leg, GOAT));
    const hoof = new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6);
    hoof.translate(sx * 0.28, -0.85, sz * 0.5);
    parts.push(paint(hoof, 0x4a4038));
  }
  const tail = new THREE.ConeGeometry(0.11, 0.28, 6);
  tail.rotateX(-2.4);
  tail.translate(0, 0.34, -0.72);
  parts.push(paint(tail, GOAT));
  return merge(parts);
}

function merge(parts: Array<THREE.BufferGeometry>): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  // mergeGeometries returns null when the parts disagree about their
  // attributes, which is silent and looks like a missing model. Everything
  // here is painted the same way, so this is a guard rather than a case.
  return merged ?? new THREE.BufferGeometry();
}
