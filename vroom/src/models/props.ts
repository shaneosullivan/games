import * as THREE from "three";
import {HEIGHT, ITEM, Palette, TYRES} from "../config";
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

  // No white band. A cone is one colour: the reflective stripe on a real one
  // is a strip of tape, and at this size a band of white across the middle
  // reads as a different object stacked on top of it.
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

/**
 * A ramp: a wedge, low at the near end and cut off at the lip.
 *
 * Built pointing +Z, like everything else, so it is turned to the road by the
 * same yaw the rest of the game uses. The profile is drawn in the XY plane and
 * extruded across the car, which is the one way of building a wedge that reads
 * from the code as the shape it actually is.
 */
export function ramp(): Assembly {
  const a = new Assembly();
  const L = ITEM.ramp.long;
  const W = ITEM.ramp.wide;
  const H = ITEM.ramp.rise;

  const profile = new THREE.Shape();
  profile.moveTo(-L / 2, 0);
  profile.lineTo(L / 2, 0);
  profile.lineTo(L / 2, H);
  profile.closePath();

  const wedge = new THREE.ExtrudeGeometry(profile, {
    depth: W,
    bevelEnabled: false,
  });
  // The shape is drawn along X and extruded along Z; the quarter turn puts the
  // slope along the road and the width across it.
  wedge.translate(0, 0, -W / 2);
  wedge.rotateY(-Math.PI / 2);
  a.add(wedge, "matte", ITEM.ramp.colour);

  // Chevrons up the slope, lying on it. They point the way you are going,
  // which is the one thing a ramp has to say.
  const slope = Math.atan2(H, L);
  for (let i = 0; i < 3; i++) {
    const along = (i - 1) * L * 0.26;
    const bar = rounded(W * 0.82, 0.5, L * 0.1, 0.2);
    bar.rotateX(-slope);
    bar.translate(0, (along + L / 2) * Math.tan(slope) + 0.5, along);
    a.add(bar, "matte", ITEM.ramp.stripe);
  }

  // Cheeks down each side, so the wedge has an edge rather than fading into
  // the tarmac.
  for (const side of [-1, 1]) {
    const cheek = rounded(1.6, H * 0.5, L, 0.3);
    cheek.rotateX(-slope * 0.5);
    cheek.translate((side * W) / 2, H * 0.32, 0);
    a.add(cheek, "matte", ITEM.ramp.stripe);
  }
  return a;
}
