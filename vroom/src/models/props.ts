import * as THREE from "three";
import {HEIGHT, Palette, TYRES} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";

/**
 * The things standing beside the road.
 *
 * All of them are built once and drawn many times — the trees and the stacks
 * go into instanced meshes — so it is worth spending geometry on them. A tyre
 * stack is five separate tyres with a gap between each, not a cylinder, and
 * from a low camera you can see daylight through the gaps.
 */

/** A stack of tyres, roped together, the way a real one is. */
export function tyreStack(palette: Palette): Assembly {
  const a = new Assembly();
  const layers = 4;
  const step = HEIGHT.tyreStack / layers;

  for (let i = 0; i < layers; i++) {
    const tyre = new THREE.TorusGeometry(
      TYRES.radius * 0.72,
      step * 0.46,
      DETAIL.coarse,
      DETAIL.round,
    );
    tyre.rotateX(Math.PI / 2);
    // Each one turned a little, because nobody ever stacked tyres straight.
    tyre.rotateY((i * Math.PI) / 7);
    tyre.translate(0, step * (i + 0.5), 0);
    a.add(tyre, "rubber", palette.tyre);
  }

  // A bright cap so the stack reads as a thing to avoid, and a post through
  // the middle holding it down.
  const cap = new THREE.CylinderGeometry(
    TYRES.radius * 0.5,
    TYRES.radius * 0.62,
    step * 0.5,
    DETAIL.round,
  );
  cap.translate(0, HEIGHT.tyreStack + step * 0.2, 0);
  a.add(cap, "matte", palette.kerbA);

  const post = new THREE.CylinderGeometry(0.5, 0.5, HEIGHT.tyreStack, 8);
  post.translate(0, HEIGHT.tyreStack / 2, 0);
  a.add(post, "chrome", 0x60646c);
  return a;
}

/** A traffic cone. Cheap, and nothing says "circuit" faster. */
export function cone(palette: Palette): Assembly {
  const a = new Assembly();
  const body = new THREE.ConeGeometry(2.1, 6, DETAIL.round);
  body.translate(0, 3, 0);
  a.add(body, "matte", palette.kerbA);

  const band = new THREE.CylinderGeometry(1.5, 1.75, 1.1, DETAIL.round);
  band.translate(0, 3.2, 0);
  a.add(band, "matte", palette.kerbB);

  const base = rounded(4.6, 0.7, 4.6, 0.25);
  base.translate(0, 0.35, 0);
  a.add(base, "matte", palette.kerbA);
  return a;
}

/**
 * A section of barrier: two rails on a post.
 *
 * Built as a section rather than as one long wall so it can be repeated along
 * the circuit with a real gap under the rails — which is the whole look of a
 * racing barrier, and the thing a solid painted band could never give.
 */
export function barrier(palette: Palette, length: number): Assembly {
  const a = new Assembly();
  const h = HEIGHT.wall;

  for (const [y, thick] of [
    [h * 0.82, 1.5],
    [h * 0.46, 1.5],
  ] as Array<[number, number]>) {
    const rail = rounded(0.9, thick, length, 0.35);
    rail.translate(0, y, 0);
    a.add(rail, "matte", palette.kerbB);
  }

  const post = rounded(1.1, h, 1.4, 0.3);
  post.translate(0, h / 2, 0);
  a.add(post, "concrete", palette.kerbA);
  return a;
}

/**
 * The gantry over the start line.
 *
 * Two legs, a beam and a row of lights. It is the one piece of furniture that
 * says "this is a race" before anything has moved, and it is the first thing a
 * child sees when a track loads.
 */
export function gantry(palette: Palette, span: number): Assembly {
  const a = new Assembly();
  const h = 34;

  for (const side of [-1, 1]) {
    const leg = rounded(3, h, 3, 0.8);
    leg.translate((side * span) / 2, h / 2, 0);
    a.add(leg, "concrete", 0x8d919a);

    const foot = rounded(7, 1.6, 7, 0.4);
    foot.translate((side * span) / 2, 0.8, 0);
    a.add(foot, "concrete", 0x6d7178);
  }

  const beam = rounded(span, 5.5, 3.4, 0.7);
  beam.translate(0, h - 2, 0);
  a.add(beam, "matte", palette.kerbA);

  const trim = rounded(span * 0.98, 1.1, 3.8, 0.4);
  trim.translate(0, h - 5.4, 0);
  a.add(trim, "matte", palette.kerbB);

  // Five start lights across the middle of the beam.
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.SphereGeometry(1.5, DETAIL.coarse, DETAIL.coarse);
    lamp.translate((i - 2) * 6, h - 2, 2);
    a.add(lamp, "glass", 0x2a0c0c);
  }
  return a;
}
