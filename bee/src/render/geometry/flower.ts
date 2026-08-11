import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, type PollenKind } from '../../config';
import { paint } from '../materials';

export interface FlowerGeometry {
  /** Stem + leaves. Always visible. */
  stem: THREE.BufferGeometry;
  /** Petals + pollen centre. Scaled to 0 while the flower is spent. */
  head: THREE.BufferGeometry;
  /** Height of the head above the flower's base — where the bee hovers. */
  headHeight: number;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false);
  if (!geo) throw new Error('flower: geometry merge failed');
  geo.computeVertexNormals();
  return geo;
}

function stemAndLeaves(height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.035, 0.055, height, 6);
  stem.translate(0, height / 2, 0);
  parts.push(paint(stem, PALETTE.stem));

  for (const [angle, h] of [
    [0.6, height * 0.42],
    [3.6, height * 0.62],
  ] as const) {
    const leaf = new THREE.SphereGeometry(0.17, 8, 6);
    leaf.scale(1.5, 0.16, 0.7);
    leaf.translate(0.2, 0, 0);
    leaf.rotateZ(0.35);
    leaf.rotateY(angle);
    leaf.translate(0, h, 0);
    parts.push(paint(leaf, PALETTE.grassDark));
  }
  return merge(parts);
}

/** Daisy-like: a ring of flat rounded petals around a domed centre. */
function flatPetalHead(petalColor: number, centreColor: number, count: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.2, 8, 6);
    petal.scale(1.45, 0.28, 0.8);
    petal.translate(0.26, 0, 0);
    petal.rotateZ(0.22);
    petal.rotateY(a);
    parts.push(paint(petal, petalColor));
  }
  const centre = new THREE.SphereGeometry(0.16, 12, 8);
  centre.scale(1, 0.7, 1);
  centre.translate(0, 0.05, 0);
  parts.push(paint(centre, centreColor));
  return merge(parts);
}

/** Rose: three shrinking, rising rings of cupped petals. */
function roseHead(petalColor: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rings: Array<[number, number, number, number]> = [
    // [petals, radius, height, tilt]
    [7, 0.3, 0.0, 0.5],
    [6, 0.2, 0.09, 0.3],
    [4, 0.11, 0.17, 0.12],
  ];
  const shades = [petalColor, 0xfff8fb, 0xffe9f0];
  rings.forEach(([count, radius, height, tilt], ri) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ri * 0.5;
      const petal = new THREE.SphereGeometry(0.16, 8, 6);
      petal.scale(0.95, 1.15, 0.34);
      petal.translate(0, 0.08, 0);
      petal.rotateX(-tilt);
      petal.translate(0, height, radius);
      petal.rotateY(a);
      parts.push(paint(petal, shades[ri]));
    }
  });
  const core = new THREE.SphereGeometry(0.075, 8, 6);
  core.translate(0, 0.24, 0);
  parts.push(paint(core, 0xffe08a));
  return merge(parts);
}

/** Tulip-ish cup of upright pointed petals. */
function cupHead(petalColor: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.17, 8, 7);
    petal.scale(0.8, 1.5, 0.45);
    petal.translate(0, 0.18, 0);
    petal.rotateX(-0.42);
    petal.translate(0, 0, 0.14);
    petal.rotateY(a);
    parts.push(paint(petal, i % 2 === 0 ? petalColor : 0xffab5e));
  }
  const centre = new THREE.SphereGeometry(0.11, 10, 8);
  centre.scale(1, 0.8, 1);
  centre.translate(0, 0.16, 0);
  parts.push(paint(centre, 0x8a4b1d));
  return merge(parts);
}

export function createFlowerGeometry(kind: PollenKind): FlowerGeometry {
  switch (kind) {
    case 'white': {
      const h = 1.05;
      const head = roseHead(0xfff3f6);
      return { stem: stemAndLeaves(h), head, headHeight: h };
    }
    case 'yellow': {
      const h = 0.82;
      const head = flatPetalHead(0xffd23f, 0x8a5a12, 8);
      return { stem: stemAndLeaves(h), head, headHeight: h };
    }
    case 'orange': {
      const h = 0.95;
      const head = cupHead(0xff8a3d);
      return { stem: stemAndLeaves(h), head, headHeight: h };
    }
  }
}
