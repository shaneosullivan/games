import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {NEON, Palette} from "../config";
import {Rng} from "../core/rng";
import {glow, material} from "../render/materials";
import {paint} from "../render/sprites";
import {Assembly, DETAIL, rounded} from "./assembly";

/**
 * A neon sign: a hoarding, a frame, and bent tubes that actually give off
 * light.
 *
 * Two things make this read as neon rather than as a bright shape. The tubes
 * are drawn with an emissive well above white, which is what the bloom pass
 * keys off — the glow around a tube is the renderer spilling light that the
 * screen cannot hold, exactly as a camera does. And each sign carries a real
 * point light, so the road under it is lit its own colour and a car driving
 * past is washed pink and then blue.
 *
 * Some of them are broken. A neon city where every tube works looks like an
 * architect's drawing; the ones that stutter are what make it a place.
 */
export interface NeonSign {
  group: THREE.Group;
  /** Ticked every frame: this is what flickers. */
  update(time: number): void;
}

const SHAPES = ["ring", "bars", "zigzag", "arrow", "spiral"] as const;
type Shape = (typeof SHAPES)[number];

export function neonSign(
  palette: Palette,
  rng: Rng,
  options: {shape?: Shape; broken?: boolean} = {},
): NeonSign {
  const group = new THREE.Group();
  const colour = rng.pick([...palette.crowd]);
  const shape = options.shape ?? rng.pick([...SHAPES]);
  const height = rng.range(NEON.minHeight, NEON.maxHeight);
  const width = height * rng.range(0.6, 1.0);

  // The pole and the board it is bolted to. Dark, so the tubes are the only
  // thing the eye finds.
  const solid = new Assembly();
  const pole = new THREE.CylinderGeometry(0.9, 1.2, height, DETAIL.coarse);
  pole.translate(0, height / 2, 0);
  solid.add(pole, "concrete", 0x1b1b26);

  const board = rounded(width, height * 0.52, 1.4, 0.5);
  board.translate(0, height + height * 0.26, 0);
  solid.add(board, "matte", 0x14141d);

  const frame = rounded(width * 1.06, height * 0.58, 0.9, 0.4);
  frame.translate(0, height + height * 0.26, -0.4);
  solid.add(frame, "chrome", 0x3a3a4a);
  group.add(solid.build());

  // The tubes themselves.
  const tubes = tubeGeometry(shape, width * 0.7, height * 0.36);
  tubes.translate(0, height + height * 0.26, 1.1);
  const lit = new THREE.Mesh(paint(tubes, colour), glow(NEON.emissive));
  group.add(lit);

  // And the light it throws. One per sign, and the reason a neon city is worth
  // the trouble: the ground under a sign is its colour.
  const lamp = new THREE.PointLight(colour, NEON.lampPower, NEON.lampReach, 2);
  lamp.position.set(0, height + height * 0.26, 4);
  group.add(lamp);

  // Whether this one is faulty, and how it fails. A dying tube does not blink
  // politely on a timer — it stutters, catches, and holds.
  const broken = options.broken ?? rng.next() < NEON.brokenChance;
  const rate = rng.range(NEON.flickerFrom, NEON.flickerTo);
  const phase = rng.range(0, 100);
  const stutter = rng.range(0.3, 0.75);
  const material = lit.material as THREE.MeshStandardMaterial;
  const fullEmissive = NEON.emissive;

  return {
    group,
    update(time: number): void {
      if (!broken) {
        return;
      }
      // Two sine waves that do not divide into each other, thresholded. The
      // result is a pattern that never repeats on any beat a person can count,
      // which is what makes it read as a fault rather than as a decoration.
      const a = Math.sin((time + phase) * rate);
      const b = Math.sin((time + phase) * rate * 2.7 + 1.3);
      const on = a + b * 0.6 > stutter - 0.9 ? 1 : NEON.dimmed;
      material.emissiveIntensity = fullEmissive * on;
      lamp.intensity = NEON.lampPower * on;
    },
  };
}

/** Every material a sign uses, so the stage can hand them its environment. */
export function neonMaterials(): Array<THREE.Material> {
  return [material("concrete"), material("matte"), material("chrome")];
}

/**
 * The bent glass.
 *
 * Real neon is one tube bent into a shape, so these are built out of tube
 * segments along a path rather than as separate pieces — a TubeGeometry over a
 * curve, which gives the round cross-section and the continuous bend that a
 * row of cylinders cannot.
 */
function tubeGeometry(
  shape: Shape,
  width: number,
  height: number,
): THREE.BufferGeometry {
  const r = NEON.tube;
  const parts: Array<THREE.BufferGeometry> = [];
  const along = (points: Array<THREE.Vector3>, closed = false): void => {
    const curve = new THREE.CatmullRomCurve3(points, closed, "catmullrom", 0.4);
    parts.push(new THREE.TubeGeometry(curve, 48, r, DETAIL.coarse, closed));
  };
  const v = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x, y, 0);

  if (shape === "ring") {
    const ring: Array<THREE.Vector3> = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      ring.push(v(Math.cos(t) * width * 0.45, Math.sin(t) * height * 0.85));
    }
    along(ring, true);
    along([v(-width * 0.3, 0), v(width * 0.3, 0)]);
  } else if (shape === "bars") {
    for (let i = 0; i < 3; i++) {
      const y = (i - 1) * height * 0.6;
      along([v(-width * 0.45, y), v(width * 0.45, y)]);
    }
  } else if (shape === "zigzag") {
    const zig: Array<THREE.Vector3> = [];
    for (let i = 0; i <= 6; i++) {
      zig.push(
        v(
          -width * 0.45 + (i / 6) * width * 0.9,
          i % 2 === 0 ? -height * 0.7 : height * 0.7,
        ),
      );
    }
    along(zig);
  } else if (shape === "arrow") {
    along([v(-width * 0.45, 0), v(width * 0.25, 0)]);
    along([
      v(width * 0.05, height * 0.55),
      v(width * 0.42, 0),
      v(width * 0.05, -height * 0.55),
    ]);
  } else {
    const spiral: Array<THREE.Vector3> = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 4;
      const k = 0.15 + (i / 40) * 0.45;
      spiral.push(v(Math.cos(t) * width * k, Math.sin(t) * height * k * 1.6));
    }
    along(spiral);
  }

  return mergeGeometries(parts, false) ?? parts[0];
}
