import * as THREE from "three";
import {PLAYER, STICKER} from "../config";

/**
 * The shape of the top of the car, and how to lay a flat thing on it.
 *
 * Everything painted or stuck on a car — the liveries, the stickers, a child's
 * name across the nose — has the same problem: it has to sit *on* the body,
 * which is a curved hull that tapers to a point at one end. This is the one
 * answer to it, shared, because two answers would be two chances to have the
 * decal floating a hand's width above the paint on one of them.
 *
 * There is no ray casting and no decal projector here. The hull is built from
 * a table of stations, each of which puts its roof points at a single height
 * right across the car, so the deck between two stations is a flat panel and a
 * straight interpolation lands exactly on it. Reading that table back is both
 * cheaper and more accurate than measuring the mesh it produced.
 */
export const STATIONS: ReadonlyArray<[number, number, number, number]> = [
  // z along the car as a fraction of its length, then half width, floor
  // height and roof height.
  [0.5, 0.16, 0.9, 1.5],
  [0.42, 0.4, 0.6, 2.1],
  [0.3, 0.72, 0.5, 2.9],
  [0.12, 0.86, 0.45, 4.2],
  [-0.04, 0.94, 0.45, 5.0],
  [-0.2, 0.88, 0.45, 4.6],
  [-0.36, 0.82, 0.5, 3.4],
  [-0.48, 0.7, 0.7, 2.6],
];

/** How much of the deck's width anything laid on it is allowed. Short of the
 *  shoulder, where the panel starts to curve away and paint would lift off. */
export const DECK_INSET = 0.86;

/** The two decks things go on: in front of the driver and behind them. The
 *  cockpit is a hole in the middle and nothing is laid across it. */
export const NOSE: [number, number] = [0.4, 0.15];
export const COVER: [number, number] = [-0.22, -0.45];

/** Where the top of the body is at a point along it, and how wide it is. */
export function deck(t: number, W: number): {y: number; half: number} {
  const first = STATIONS[0];
  const last = STATIONS[STATIONS.length - 1];
  if (t >= first[0]) {
    return {y: first[3], half: (W / 2) * first[1]};
  }
  for (let i = 1; i < STATIONS.length; i++) {
    const a = STATIONS[i - 1];
    const b = STATIONS[i];
    if (t >= b[0]) {
      const k = (a[0] - t) / (a[0] - b[0]);
      return {
        y: a[3] + (b[3] - a[3]) * k,
        half: (W / 2) * (a[1] + (b[1] - a[1]) * k),
      };
    }
  }
  return {y: last[3], half: (W / 2) * last[1]};
}

/**
 * The nearest point on a deck to somewhere on the car.
 *
 * Used when a finger drags a sticker: the raw place under the finger can be
 * the cockpit, or the tail behind the wing, and neither is a place a sticker
 * can be. Rather than refuse the drag, it is put on whichever deck is nearer,
 * which keeps the sticker under the finger everywhere it can be and pinned to
 * the edge of a deck everywhere it cannot.
 */
export function nearestDeck(v: number): number {
  const decks: Array<[number, number]> = [NOSE, COVER];
  let best = NOSE[0];
  let gap = Infinity;
  for (const [from, to] of decks) {
    const held = Math.min(from, Math.max(to, v));
    const d = Math.abs(held - v);
    if (d < gap) {
      gap = d;
      best = held;
    }
  }
  return best;
}

/**
 * A flat shape, dropped onto the deck.
 *
 * Shapes are drawn in the car's own terms — `u` across as a fraction of
 * however wide the deck is *there*, `v` along it as a fraction of the car's
 * length — so one lightning bolt fits both the nose, which tapers, and the
 * engine cover, which does not.
 */
export function onDeck(
  shape: THREE.Shape,
  L: number,
  W: number,
): THREE.BufferGeometry {
  // Non-indexed, because the winding is fixed triangle by triangle below and
  // a shared vertex belongs to triangles that may not agree about it.
  const flat = new THREE.ShapeGeometry(shape).toNonIndexed();
  const src = flat.attributes.position;
  const out = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    const on = deck(src.getY(i), W);
    out[i * 3] = src.getX(i) * on.half * DECK_INSET;
    out[i * 3 + 1] = on.y + PLAYER.decalLift;
    out[i * 3 + 2] = src.getY(i) * L;
  }
  flat.dispose();
  return facingUp(out);
}

/**
 * The same, for something already drawn in world units.
 *
 * A sticker is a fixed size in the world — a star is a star whether it is on
 * the wide part of the cover or the point of the nose — so it is placed in
 * units rather than in fractions of the deck. Only its height comes from the
 * deck, per vertex, which is what makes it follow the slope.
 */
export function dropOnDeck(
  geometry: THREE.BufferGeometry,
  L: number,
  W: number,
  lift = PLAYER.decalLift,
): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const src = flat.attributes.position;
  const out = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    const z = src.getZ(i);
    out[i * 3] = src.getX(i);
    out[i * 3 + 1] = deck(z / L, W).y + lift + src.getY(i);
    out[i * 3 + 2] = z;
  }
  return facingUp(out);
}

/** How far out the side of the body is at a point along it. The stations give
 *  the widest part of each, which is where a sign would go on a real one. */
export function flankAt(t: number, W: number): number {
  return deck(t, W).half;
}

/**
 * The same idea as the deck, for the sides.
 *
 * Words go on the flanks — that is where words go on a racing car, and the
 * nose is four units across while a name is not — so they need the profile
 * read the other way: the height and the length are whatever was drawn, and
 * only the distance out from the middle comes from the body.
 *
 * There is no winding fix here. A flank sign is drawn already facing out and
 * is double-sided anyway, since the two are the same word and the far one is
 * turned round for whoever is standing on that side.
 */
export function onFlank(
  geometry: THREE.BufferGeometry,
  side: number,
  L: number,
  W: number,
): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const out = flat.clone();
  const pos = out.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const room = flankAt(z / L, W) * STICKER.sideInset + STICKER.sideLift;
    pos.setX(i, side * room);
  }
  pos.needsUpdate = true;
  out.computeVertexNormals();
  return out;
}

/**
 * Triangles turned the right way up.
 *
 * The winding is fixed here rather than got right in the drawing. A shape
 * mapped onto a surface can come out facing either way depending on which way
 * its outline happened to be traced, and a decal facing into the bodywork is
 * an invisible decal — which is exactly how the first lightning bolt arrived,
 * as four triangles of which one could be seen.
 */
function facingUp(out: Float32Array): THREE.BufferGeometry {
  for (let i = 0; i < out.length; i += 9) {
    const ax = out[i + 3] - out[i];
    const az = out[i + 5] - out[i + 2];
    const bx = out[i + 6] - out[i];
    const bz = out[i + 8] - out[i + 2];
    // The Y of the cross product, which is all that says which way up it is.
    if (az * bx - ax * bz < 0) {
      for (let k = 0; k < 3; k++) {
        const swap = out[i + 3 + k];
        out[i + 3 + k] = out[i + 6 + k];
        out[i + 6 + k] = swap;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(out, 3));
  geometry.computeVertexNormals();
  return geometry;
}
