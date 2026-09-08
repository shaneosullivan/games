import * as THREE from "three";
import {HEIGHT, Palette} from "../config";
import {Rng} from "../core/rng";
import {Assembly, DETAIL} from "./assembly";

/**
 * What grows beside each circuit.
 *
 * One per environment, and they are genuinely different plants rather than the
 * same blob in three colours: a broadleaf for the hills, a saguaro for the
 * desert, and for the city a lit palm, because a neon city plants palms and
 * then floodlights them.
 */
export function plant(palette: Palette, rng: Rng): Assembly {
  if (palette.flora === "cactus") {
    return cactus(palette, rng);
  }
  if (palette.flora === "palm") {
    return palm(palette, rng);
  }
  return broadleaf(palette, rng);
}

/** A tree: a tapered trunk and three offset clumps of leaves. */
function broadleaf(palette: Palette, rng: Rng): Assembly {
  const a = new Assembly();
  const height = HEIGHT.trunk * rng.range(0.85, 1.3);
  const spread = rng.range(7, 11);

  const trunk = new THREE.CylinderGeometry(0.9, 1.7, height, DETAIL.coarse, 3);
  trunk.translate(0, height / 2, 0);
  a.add(trunk, "matte", palette.trunk);

  // Three overlapping spheres rather than one. A single sphere is a lollipop;
  // three at different sizes and heights is a canopy.
  const clumps: Array<[number, number, number, number]> = [
    [0, height + spread * 0.35, 0, 1],
    [spread * 0.42, height + spread * 0.05, spread * 0.2, 0.72],
    [-spread * 0.36, height + spread * 0.18, -spread * 0.3, 0.66],
  ];
  for (const [x, y, z, scale] of clumps) {
    const leaves = new THREE.SphereGeometry(
      spread * scale,
      DETAIL.round,
      DETAIL.coarse,
    );
    leaves.scale(1, 0.82, 1);
    leaves.translate(x, y, z);
    a.add(leaves, "foliage", rng.next() < 0.5 ? palette.treeA : palette.treeB);
  }
  return a;
}

/** A saguaro: a trunk and two arms, ribbed. */
function cactus(palette: Palette, rng: Rng): Assembly {
  const a = new Assembly();
  const height = HEIGHT.crown * rng.range(0.8, 1.2);

  const trunk = new THREE.CapsuleGeometry(2.4, height, 6, DETAIL.round);
  trunk.translate(0, height / 2 + 2.4, 0);
  a.add(trunk, "foliage", palette.treeA);

  for (const side of [-1, 1]) {
    if (rng.next() < 0.3) {
      continue;
    }
    const at = height * rng.range(0.45, 0.7);
    const arm = new THREE.CapsuleGeometry(1.5, height * 0.34, 5, DETAIL.coarse);
    arm.translate(0, height * 0.17, 0);
    arm.rotateZ(side * 0.55);
    arm.translate(side * 3.4, at, 0);
    a.add(arm, "foliage", palette.treeB);
  }
  return a;
}

/** A palm: a bare trunk and a crown of fronds. */
function palm(palette: Palette, rng: Rng): Assembly {
  const a = new Assembly();
  const height = HEIGHT.crown * rng.range(1.1, 1.5);

  const trunk = new THREE.CylinderGeometry(0.8, 1.4, height, DETAIL.coarse, 6);
  trunk.translate(0, height / 2, 0);
  a.add(trunk, "matte", palette.trunk);

  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const angle = (i / fronds) * Math.PI * 2 + rng.range(0, 0.4);
    const frond = new THREE.ConeGeometry(2.2, 11, 4, 1, true);
    frond.rotateX(Math.PI / 2);
    frond.translate(0, 0, 5.5);
    frond.rotateX(-0.6);
    frond.rotateY(angle);
    frond.translate(0, height, 0);
    a.add(frond, "foliage", i % 2 ? palette.treeA : palette.treeB);
  }
  return a;
}
