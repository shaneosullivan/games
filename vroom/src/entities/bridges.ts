import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {BRIDGE, Palette, TRACK} from "../config";
import {flatVertex, LAYER, order} from "../render/sprites";
import {KERB, ringGap, Track, wrapIndex} from "./track";

/**
 * The flyovers.
 *
 * Where the circuit runs over itself, the later part of the lap goes on top.
 * That is not a preference: a driver arriving at a crossing has to be able to
 * see at a glance which road they are on, and drawing both halves into each
 * other tells them nothing.
 *
 * Each crossing gets a **deck** — a short stretch of the later road, rebuilt
 * complete with its ground, run-off, barrier and kerbs, and drawn over
 * everything including the cars. Complete, because the road underneath draws
 * all of those too and every one of them has to be hidden; drawn over the
 * cars, because a car on the lower road is under a bridge and should not be
 * visible through it.
 *
 * Which leaves the one case that matters: when the player *is* the car under
 * the bridge. Then the deck fades back to a ghost of itself so they can see
 * where they are. It fades rather than vanishing — a hole in the road would
 * say the bridge was gone, and a ghost says "you are beneath this".
 *
 * A car on top of a deck is lifted above it instead, by `Car.setAbove`, so the
 * two never argue about which is in front.
 */
export class Bridges {
  readonly group = new THREE.Group();

  /** Each deck: the stretch of lap it covers, and the stretch underneath it. */
  private readonly decks: Array<{
    material: THREE.Material & {opacity: number; transparent: boolean};
    /** The stretch the deck covers, and the stretch underneath it, each as a
     *  middle and a half-width in samples. */
    high: number;
    highPad: number;
    low: number;
    lowPad: number;
  }> = [];

  constructor(track: Track, palette: Palette) {
    const crossings = track.tangles;
    if (crossings.length === 0) {
      return;
    }

    for (const crossing of crossings) {
      // The circuit works these out, because the same stretches decide where
      // the barrier stops being built.
      const highPad = track.deckHalfWidth(crossing.highFrom, crossing.highTo);
      const lowPad = track.deckHalfWidth(crossing.lowFrom, crossing.lowTo);
      const span = {
        start: wrapIndex(crossing.high - highPad),
        count: highPad * 2,
      };
      const mesh = deck(track, palette, span);
      // Over the cars. `Car.setAbove` is what puts a car back on top when it
      // is the one driving over the bridge.
      mesh.renderOrder = order(LAYER.car) + 10;
      this.group.add(mesh);
      this.decks.push({
        material: mesh.material as THREE.Material & {
          opacity: number;
          transparent: boolean;
        },
        high: crossing.high,
        highPad,
        low: crossing.low,
        lowPad,
      });
    }
  }

  /** Is this point on the circuit up on a deck? */
  above(index: number): boolean {
    return this.decks.some(d => Math.abs(ringGap(d.high, index)) <= d.highPad);
  }

  /**
   * Fades whichever deck the player is under.
   *
   * The test is against the *lower* stretch and a little wider than the deck
   * itself, so the fade has begun by the time the car is actually beneath
   * anything rather than starting as it disappears.
   */
  update(dt: number, playerIndex: number): void {
    const ease = 1 - Math.exp(-BRIDGE.fade * dt);
    for (const d of this.decks) {
      const under = Math.abs(ringGap(d.low, playerIndex)) <= d.lowPad * 1.3;
      const want = under ? BRIDGE.under : 1;
      const now = d.material.opacity + (want - d.material.opacity) * ease;
      d.material.opacity = now;
      // Only transparent while it actually is: an opaque deck belongs in the
      // opaque pass, where its renderOrder is obeyed against the opaque cars.
      d.material.transparent = now < 0.995;
    }
  }
}

/** A colour at a bit over half strength, for the shadowed side of a thing. */
function darken(colour: number): number {
  return new THREE.Color(colour).multiplyScalar(0.55).getHex();
}

/**
 * One deck: a short stretch of road, complete.
 *
 * Ground first and widest. The road underneath paints its run-off and its
 * barrier onto the grass, and grass is the scene background rather than a mesh
 * — so there is nothing already covering those, and without this the lower
 * road's barrier would run straight across the bridge.
 */
function deck(
  track: Track,
  palette: Palette,
  span: {start: number; count: number},
): THREE.Mesh {
  const limit = Track.limit;
  const edge = limit + 7;
  const stripe = {other: palette.kerbB, every: 6};
  const wall = {other: palette.kerbB, every: 3};

  // The bridge's own thickness, seen from above: a dark band down each outer
  // side. Without it the deck is a stripe painted on the ground rather than
  // something the road below passes under, and a child has no way to read
  // which of the two roads they are looking at.
  const parts = [
    track.ribbon(
      -edge - 8,
      edge + 8,
      darken(palette.ground),
      LAYER.grass,
      undefined,
      span,
    ),
    track.ribbon(
      -edge - 5,
      edge + 5,
      palette.ground,
      LAYER.grass,
      undefined,
      span,
    ),
    track.ribbon(limit - 10, limit, palette.sand, LAYER.sand, undefined, span),
    track.ribbon(
      -limit,
      -limit + 10,
      palette.sand,
      LAYER.sand,
      undefined,
      span,
    ),
    track.ribbon(limit, edge, palette.kerbA, LAYER.kerb, wall, span),
    track.ribbon(-edge, -limit, palette.kerbA, LAYER.kerb, wall, span),
    track.ribbon(
      -TRACK.half,
      TRACK.half,
      palette.tarmac,
      LAYER.tarmac,
      undefined,
      span,
    ),
    track.ribbon(
      TRACK.half,
      TRACK.half + KERB,
      palette.kerbA,
      LAYER.kerb,
      stripe,
      span,
    ),
    track.ribbon(
      -TRACK.half - KERB,
      -TRACK.half,
      palette.kerbA,
      LAYER.kerb,
      stripe,
      span,
    ),
  ];

  const merged = mergeGeometries(
    parts.map(m => m.geometry as THREE.BufferGeometry),
    false,
  );
  const material = flatVertex();
  // One opacity for the whole deck, so it fades as a single thing.
  material.depthWrite = false;
  // And no depth *test* either, which matters now that the cars and the
  // barrier walls are solid and write depth. The deck is a flat lying on the
  // ground; a car on the road beneath it is nearer the camera than it is, so
  // tested against depth the deck would lose and the car would show through
  // the bridge it is supposed to be under. Drawn last and untested, it simply
  // paints over everything — which is the whole idea of it.
  material.depthTest = false;
  const mesh = new THREE.Mesh(merged, material);
  mesh.frustumCulled = false;
  return mesh;
}
