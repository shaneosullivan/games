import * as THREE from "three";
import {LAMP, NEON} from "../config";
import {glow} from "../render/materials";
import {paint} from "../render/sprites";
import {Assembly, DETAIL, rounded} from "./assembly";

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

/** The material lit windows and lamp heads share. */
export function litMaterial(): THREE.Material {
  return glow(NEON.emissive * 0.75);
}
