import * as THREE from "three";
import {TrackSpec} from "./spec";

/**
 * The shape of a circuit, as a path you can draw.
 *
 * Used by the track list, where every card had a coloured square that said
 * which environment the track was in and nothing whatever about the track. A
 * child who has drawn four circuits knows them by their shape and not by their
 * name, and "Green hills" was on three of them.
 *
 * Sampled from the same curve the real road is built from — a closed
 * Catmull-Rom through the corner points, at the same tension — so the picture
 * on the card is the circuit, not an impression of it.
 */
export function outline(spec: TrackSpec, size: number, pad: number): string {
  const points = spec.shape.map(p => new THREE.Vector3(p.x, 0, p.z));
  if (points.length < 3) {
    return "";
  }
  const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);

  const at: Array<{x: number; z: number}> = [];
  let low = {x: Infinity, z: Infinity};
  let high = {x: -Infinity, z: -Infinity};
  for (let i = 0; i < SAMPLES; i++) {
    const p = curve.getPointAt(i / SAMPLES);
    at.push({x: p.x, z: p.z});
    low = {x: Math.min(low.x, p.x), z: Math.min(low.z, p.z)};
    high = {x: Math.max(high.x, p.x), z: Math.max(high.z, p.z)};
  }

  // Fitted to the box on its longer side and centred on the other, so a track
  // twice as wide as it is tall is drawn in the middle of the square rather
  // than stretched into it. The stroke is drawn *on* the path, so the padding
  // has to leave room for half of it or the road is clipped at the edges.
  const room = size - pad * 2;
  const wide = Math.max(1e-6, high.x - low.x);
  const tall = Math.max(1e-6, high.z - low.z);
  const scale = Math.min(room / wide, room / tall);
  const shiftX = (size - wide * scale) / 2 - low.x * scale;
  const shiftZ = (size - tall * scale) / 2 - low.z * scale;

  return `${at
    .map((p, i) => {
      const x = (p.x * scale + shiftX).toFixed(1);
      const z = (p.z * scale + shiftZ).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x} ${z}`;
    })
    .join("")}Z`;
}

/** Enough that a hairpin is a hairpin at forty pixels across, and few enough
 *  that the path is a line of text rather than a paragraph. */
const SAMPLES = 96;
