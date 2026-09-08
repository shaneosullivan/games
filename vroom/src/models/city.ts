import * as THREE from "three";
import {LAMP, NEON, Palette} from "../config";
import {Rng} from "../core/rng";
import {glow} from "../render/materials";
import {paint} from "../render/sprites";
import {Assembly, DETAIL, rounded} from "./assembly";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A street light: a post, an arm over the road, and a lamp under it.
 *
 * Built leaning over +X, so it is turned to whichever side of the road it is
 * standing on. The head is emissive rather than a light — the actual lighting
 * is done by the pool in `Glow`, which moves a handful of real lights to
 * whichever lamps the car is nearest.
 */
export function lamp(): {solid: Assembly; bulb: THREE.BufferGeometry} {
  const solid = new Assembly();

  const post = new THREE.CylinderGeometry(1.1, 1.6, LAMP.height, DETAIL.round);
  post.translate(0, LAMP.height / 2, 0);
  solid.add(post, "chrome", 0x2b2f3a);

  const foot = new THREE.CylinderGeometry(2.6, 3.2, 2.4, DETAIL.round);
  foot.translate(0, 1.2, 0);
  solid.add(foot, "concrete", 0x23262e);

  // The arm: out over the road and curved down at the end.
  const arm = new THREE.CylinderGeometry(0.8, 0.8, LAMP.reach, DETAIL.coarse);
  arm.rotateZ(Math.PI / 2);
  arm.translate(LAMP.reach / 2, LAMP.height - 1, 0);
  solid.add(arm, "chrome", 0x2b2f3a);

  const hood = rounded(7, 1.6, 4.2, 0.6);
  hood.translate(LAMP.reach, LAMP.height - 2.4, 0);
  solid.add(hood, "chrome", 0x353a45);

  // The lit part, in its own geometry so it can take the emissive material.
  const bulb = new THREE.SphereGeometry(LAMP.bulb, DETAIL.coarse, 6);
  bulb.scale(1.5, 0.5, 1);
  bulb.translate(LAMP.reach, LAMP.height - 3.4, 0);
  return {solid, bulb: paint(bulb, LAMP.colour)};
}

/**
 * A tower block with its lights on.
 *
 * The windows are the whole model. A block on its own is a box; a box with a
 * grid of lit windows up it is a building somebody is in, and at night that is
 * the only difference there is. They are emissive well past white so the bloom
 * pass spills a halo off each one, which is what a lit window looks like from
 * across a street.
 *
 * Not every window is lit. A tower with all of them on is an office block at
 * five o'clock rather than a city at night.
 */
export function building(
  palette: Palette,
  rng: Rng,
): {solid: Assembly; windows: THREE.BufferGeometry} {
  const solid = new Assembly();
  const w = NEON.blockWide * rng.range(0.7, 1.3);
  const d = NEON.blockDeep * rng.range(0.7, 1.3);
  const h = rng.range(NEON.blockLow, NEON.blockHigh);

  const shell = rounded(w, h, d, 2);
  shell.translate(0, h / 2, 0);
  solid.add(shell, "concrete", 0x14121e);

  // A parapet, so the top is a roof and not a cut.
  const cap = rounded(w + 4, 4, d + 4, 1);
  cap.translate(0, h, 0);
  solid.add(cap, "concrete", 0x1d1a2a);

  const lit: Array<THREE.BufferGeometry> = [];
  const step = NEON.windowGap;
  const colours = [0xffd9a0, 0xcfe4ff, 0xfff2cc, 0x9fd8ff];

  // Up all four faces. The two along Z and the two along X are the same grid
  // turned a quarter turn, which is why this is a loop over sides rather than
  // four blocks of nearly identical arithmetic.
  for (const [nx, nz, across] of [
    [0, 1, w],
    [0, -1, w],
    [1, 0, d],
    [-1, 0, d],
  ] as Array<[number, number, number]>) {
    const columns = Math.max(1, Math.floor((across - step) / step));
    const rows = Math.max(1, Math.floor((h - step * 1.5) / step));
    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng.next() > NEON.windowsLit) {
          continue;
        }
        const pane = new THREE.PlaneGeometry(NEON.window, NEON.window * 1.2);
        // Turned to face out of whichever wall it is in.
        pane.rotateY(Math.atan2(nx, nz));
        const along = (c - (columns - 1) / 2) * step;
        pane.translate(
          nx * (d / 2 + 0.3) + -nz * along * 0,
          step * 1.2 + r * step,
          nz * (d / 2 + 0.3),
        );
        // Slide it along the face it is on.
        pane.translate(nz * along, 0, -nx * along);
        lit.push(paint(pane, rng.pick(colours)));
      }
    }
  }

  const windows =
    lit.length > 0
      ? (mergeGeometries(lit, false) ?? lit[0])
      : new THREE.BufferGeometry();
  void palette;
  return {solid, windows};
}

/** The material lit windows and lamp heads share. */
export function litMaterial(): THREE.Material {
  return glow(NEON.emissive * 0.75);
}
