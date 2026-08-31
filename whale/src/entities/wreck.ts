import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {Rng} from "../core/rng";
import {paint} from "../render/materials";

/**
 * The shipwreck.
 *
 * An old wooden ship lying on her side on the sea floor, broken in two, with a
 * gap amidships you can swim straight through. The gap is the whole point: it
 * is the only thing in the game a whale goes *inside*, and everything else
 * here is arranged so that the way through is obvious from a long way off.
 *
 * Built like everything else — merged primitives, vertex colours, one draw
 * call — and hollow, because a solid hull with a hole cut in it is a great
 * deal more geometry than a set of ribs with planking laid over them, which is
 * how a real ship is built anyway.
 *
 * She is drawn upright and lying along +Z; the reef rolls her onto her side
 * and settles her into the sand.
 */

// Lighter than real waterlogged oak. She lies in eighty-odd units of water
// where the fog is already most of the way to deep blue, and the first pass at
// these read as a black smear on the sand.
const OAK = 0x9a7852;
const DARK = 0x6f5639;
const PALE = 0xbb9a70;
const IRON = 0x6c737a;

export function shipwreck(): THREE.BufferGeometry {
  const rng = new Rng(55001);
  const parts: Array<THREE.BufferGeometry> = [];

  // Big, and then bigger. The whale is 34 units nose to tail, so at 300 she is
  // nearly nine whales long and reads as a ship rather than as a boat — the
  // first pass at 190 was still small enough to lose against a sand hill.
  const length = 300;
  const beam = 54;
  const depth = 40;

  // Where her back is broken. Everything between these is missing and that
  // hole is the main way through, wide enough to take a whale across its
  // flippers with room to spare.
  const gapFrom = -34;
  const gapTo = 46;

  // And two more ways in, so she is something to explore rather than one arch
  // to pass under: a hole stove in her side forward, and the open hold aft
  // where the deck has gone. A wreck with a single doorway is a gate.
  const holes: Array<[number, number]> = [
    [-length / 2 + 34, -length / 2 + 78],
    [96, 138],
  ];
  const isHole = (z: number): boolean => {
    if (z > gapFrom && z < gapTo) {
      return true;
    }
    for (const [from, to] of holes) {
      if (z > from && z < to) {
        return true;
      }
    }
    return false;
  };

  /** Half-width of the hull at a point along her length, 0 at the bow. */
  const widthAt = (z: number): number => {
    const t = Math.abs(z) / (length / 2);
    // Full through the middle and drawn in at both ends, but not to a point at
    // the stern — she is transom-sterned, like anything that old.
    const taper = z > 0 ? Math.pow(1 - t, 0.55) : Math.pow(1 - t * 0.82, 0.7);
    return (beam / 2) * Math.max(0.08, taper);
  };

  // The ribs, and the planking between them. Each rib is a half-ring; the
  // planks are thin boxes bent round the outside of them.
  const ribs = 34;
  for (let i = 0; i <= ribs; i++) {
    const z = -length / 2 + (i / ribs) * length;
    if (isHole(z)) {
      continue;
    }
    const w = widthAt(z);
    const rib = new THREE.TorusGeometry(1, 0.55, 5, 12, Math.PI);
    rib.scale(w, depth, 1);
    rib.rotateZ(Math.PI);
    rib.translate(0, 0, z);
    parts.push(paint(rib, i % 2 === 0 ? OAK : DARK));
  }

  // Planking: strakes running the length of her, following the rib line. Two
  // runs, fore and aft of the gap, so the hole stays a hole.
  // Planking, in the runs between the holes.
  for (const [from, to] of [
    [-length / 2, holes[0][0]],
    [holes[0][1], gapFrom],
    [gapTo, holes[1][0]],
    [holes[1][1], length / 2],
  ]) {
    const steps = 9;
    for (let s = 0; s <= steps; s++) {
      // Round the hull from the gunwale on one side to the other.
      const a = Math.PI * (s / steps);
      const run = to - from;
      const mid = (from + to) / 2;
      const w = widthAt(mid);
      const plank = new THREE.BoxGeometry(2.4, 1.1, run);
      plank.translate(
        -Math.cos(a) * w,
        -Math.sin(a) * depth,
        mid + rng.range(-0.6, 0.6),
      );
      parts.push(paint(plank, s % 3 === 0 ? PALE : OAK));
    }
  }

  // The deck, fore and aft, with the open hatch between them.
  // Deck, in the two stretches that still have one.
  for (const [from, to] of [
    [-length / 2 + 8, gapFrom],
    [gapTo, holes[1][0]],
  ]) {
    const mid = (from + to) / 2;
    const deck = new THREE.BoxGeometry(widthAt(mid) * 1.85, 1.4, to - from);
    deck.translate(0, 0.4, mid);
    parts.push(paint(deck, PALE));
  }

  // The broken ends of her, where the two halves came apart: a few jagged
  // timbers reaching into the gap. This is what says "broken" rather than
  // "built with a doorway in it".
  for (const edge of [gapFrom, gapTo]) {
    const inward = edge === gapFrom ? 1 : -1;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (i / 6);
      const spar = new THREE.BoxGeometry(1.5, 1.5, rng.range(3, 11));
      spar.translate(
        -Math.cos(a) * widthAt(edge) * rng.range(0.7, 1),
        -Math.sin(a) * depth * rng.range(0.5, 1),
        edge + inward * rng.range(2, 6),
      );
      parts.push(paint(spar, DARK));
    }
  }

  // Keel, stem and transom.
  const keel = new THREE.BoxGeometry(2.6, 2.4, length * 0.98);
  keel.translate(0, -depth - 0.6, 0);
  parts.push(paint(keel, DARK));

  const stem = new THREE.BoxGeometry(2.2, depth * 1.5, 3);
  stem.rotateX(-0.45);
  stem.translate(0, -depth * 0.3, length / 2 - 1);
  parts.push(paint(stem, DARK));

  const transom = new THREE.BoxGeometry(widthAt(-length / 2) * 2.1, depth, 2);
  transom.translate(0, -depth / 2 + 1, -length / 2);
  parts.push(paint(transom, OAK));

  // Two masts, snapped off short, and the stump of a third. A ship lying on
  // the bottom has no rigging left, but the stumps are what make the shape
  // read as a ship from a distance rather than as a wooden barrel.
  for (const [z, height] of [
    [72, 82],
    [-14, 62],
    [-104, 26],
  ]) {
    const mast = new THREE.CylinderGeometry(1.5, 2.4, height, 7);
    mast.translate(0, height / 2, z);
    parts.push(paint(mast, DARK));
    // A splintered top.
    const split = new THREE.ConeGeometry(2.2, 5, 5);
    split.translate(0, height + 1, z);
    parts.push(paint(split, OAK));
  }

  // A yardarm still across the foremast, at an angle.
  const yard = new THREE.CylinderGeometry(1.2, 1.2, 66, 6);
  yard.rotateZ(Math.PI / 2);
  yard.rotateY(0.2);
  yard.translate(0, 62, 72);
  parts.push(paint(yard, DARK));

  // Portholes down the side she is not lying on, so there is something to see
  // as you come past.
  for (let i = 0; i < 15; i++) {
    const z = -length / 2 + 18 + i * 19;
    if (isHole(z)) {
      continue;
    }
    const ring = new THREE.TorusGeometry(1.7, 0.4, 5, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(widthAt(z) + 0.4, -depth * 0.42, z);
    parts.push(paint(ring, IRON));
  }

  // The anchor, dropped beside her, still on its chain.
  const stock = new THREE.BoxGeometry(11, 1.4, 1.4);
  stock.translate(beam * 0.9, -depth - 1, length / 2 - 18);
  parts.push(paint(stock, IRON));
  const shank = new THREE.BoxGeometry(1.4, 1.4, 12);
  shank.rotateX(0.4);
  shank.translate(beam * 0.9, -depth - 3.5, length / 2 - 24);
  parts.push(paint(shank, IRON));

  return mergeGeometries(parts, false);
}
