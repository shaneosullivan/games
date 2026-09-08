import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {material, Substance} from "../render/materials";
import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {paint} from "../render/sprites";

/**
 * A model under construction: a pile of shapes, each made of something.
 *
 * A car has painted panels, rubber tyres, chrome and glass, and each of those
 * wants a different material — but a car is also four cars on the screen at
 * once and everything else besides. So the parts are collected by *substance*
 * and merged, and what comes out is one mesh per material rather than one per
 * shape: a whole car in four draw calls however many pieces went into it.
 *
 * Colour rides on the vertices, which is why a single bodywork material can
 * serve a red car and a green one.
 */
export class Assembly {
  private readonly piles = new Map<Substance, Array<THREE.BufferGeometry>>();

  /** One shape, in one substance, in one colour. */
  add(
    geometry: THREE.BufferGeometry,
    substance: Substance,
    colour: number,
  ): this {
    const pile = this.piles.get(substance) ?? [];
    pile.push(paint(geometry, colour));
    this.piles.set(substance, pile);
    return this;
  }

  /** The merged geometry for each substance used, for instancing. */
  parts(): Array<{substance: Substance; geometry: THREE.BufferGeometry}> {
    const out: Array<{substance: Substance; geometry: THREE.BufferGeometry}> =
      [];
    for (const [substance, pile] of this.piles) {
      const geometry = mergeGeometries(pile, false);
      if (geometry) {
        out.push({substance, geometry});
      }
    }
    return out;
  }

  /** The finished model, ready to drop into a scene. */
  build(options: {flat?: boolean} = {}): THREE.Group {
    const group = new THREE.Group();
    for (const {substance, geometry} of this.parts()) {
      const mesh = new THREE.Mesh(geometry, material(substance, options));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

/** How many pixels of geometry to spend. Turned down in one place if a device
 *  ever needs it, rather than scattered through every model. */
export const DETAIL = {
  /** Segments round a wheel, a tube, a trunk. */
  round: 24,
  /** Segments round the small stuff — a bolt, a light, a cone. */
  coarse: 12,
  /** Subdivisions on a rounded box edge. */
  bevel: 4,
} as const;

/** A rounded box, which is most of what a made thing is: nothing in the world
 *  has a truly sharp edge, and a bevel is what catches the light along one. */
export function rounded(
  width: number,
  height: number,
  depth: number,
  radius: number,
): THREE.BufferGeometry {
  const r = Math.min(radius, width / 2, height / 2, depth / 2) * 0.999;
  return new RoundedBoxGeometry(width, height, depth, DETAIL.bevel, r);
}
