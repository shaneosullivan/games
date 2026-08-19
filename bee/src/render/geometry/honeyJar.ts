import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {INSIDE} from "../../config";
import {paint, vertexToon} from "../materials";

/**
 * A fat jar of honey with a cork stopper and a paper label.
 *
 * The prize of Caramel Cottage — collected off the mantel above the fire — and
 * also what the Bear's Lair piles into a hoard: same jar in both, so the
 * treasure at the end of the cave is plainly the same stuff she carried home.
 */
export function createHoneyJar(): THREE.Group {
  const g = new THREE.Group();
  const h = INSIDE.jarHeight;
  const parts: Array<THREE.BufferGeometry> = [];
  const push = (geo: THREE.BufferGeometry, color: number) =>
    parts.push(paint(geo, color));

  // Honey body — the jar is mostly full, so this is the bulk of it.
  const body = new THREE.CylinderGeometry(h * 0.42, h * 0.36, h * 0.82, 16);
  body.translate(0, -h * 0.06, 0);
  push(body, 0xffb02e);

  // A paler rim of glass above the honey line.
  const neck = new THREE.CylinderGeometry(h * 0.3, h * 0.42, h * 0.22, 16);
  neck.translate(0, h * 0.46, 0);
  push(neck, 0xffe6a8);

  // Cork.
  const cork = new THREE.CylinderGeometry(h * 0.28, h * 0.3, h * 0.16, 14);
  cork.translate(0, h * 0.62, 0);
  push(cork, 0xc9a26a);

  // Label.
  const label = new THREE.CylinderGeometry(
    h * 0.425,
    h * 0.4,
    h * 0.34,
    16,
    1,
    true,
  );
  label.translate(0, -h * 0.08, 0);
  push(label, 0xfff6e8);

  const merged = mergeGeometries(parts, false);
  if (!merged) {
    throw new Error("honey jar: geometry merge failed");
  }
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, vertexToon());
  mesh.castShadow = true;
  g.add(mesh);

  return g;
}
