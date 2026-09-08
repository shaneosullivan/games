import * as THREE from "three";
import {CAR, RATING} from "../config";
import {TrackSpec} from "./spec";

/**
 * How hard a track is, worked out rather than asked for.
 *
 * A child who has just drawn a circuit is the worst possible judge of how hard
 * it is — they have not driven it — and the whole point of a rating is telling
 * somebody else what they are about to get. So this reads the track.
 *
 * Three things make a lap difficult and they are all here: how much speed its
 * corners take off you, what has been dropped on it, and how many times round
 * you have to go. Everything else — how long the lap is, how
 * many corners there are — turns out not to matter much: a long fast circuit
 * is a pleasant drive and a short vicious one is not.
 *
 * Built from the spec alone, on its own curve, and no geometry. The track list
 * rates every saved track every time it is drawn, and a rating that cost a
 * road to find out would be a rating nobody could afford.
 */
export type Rating = "easy" | "medium" | "hard";

export const RATING_NAMES: Record<Rating, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** The number behind the word, for tuning it and for testing it. */
export function score(spec: TrackSpec): number {
  const curve = new THREE.CatmullRomCurve3(
    spec.shape.map(p => new THREE.Vector3(p.x, 0, p.z)),
    true,
    "catmullrom",
    0.5,
  );
  const length = curve.getLength();

  // How slow the track's slowest corners make you, as a fraction of flat out.
  //
  // At each sample the corner radius is the distance travelled per radian the
  // tangent swings through — no calculus, and no second derivative to be noisy
  // about. A corner of radius r can be held at r times the car's turn rate.
  //
  // Then the slowest tenth of those, averaged. Not the mean over the whole
  // lap, which was the first thing tried and is nearly useless: straights are
  // most of any circuit, so the mean sat within a couple of per cent of flat
  // out for everything from a lazy oval to a scribble full of hairpins. A
  // track is as hard as its hardest corners. Measured on real shapes, the
  // slowest tenth runs 110 for an oval, 107 for the circuit the game ships
  // with, 96 for a figure of eight, 54 for a twisty one and 38 for a scribble
  // — which is the spread the bands below are cut from.
  const samples = 240;
  const step = length / samples;
  const turnRate = CAR.turn * CAR.turnAtSpeed;
  const allowed: Array<number> = [];
  const here = new THREE.Vector3();
  const next = new THREE.Vector3();
  for (let i = 0; i < samples; i++) {
    curve.getTangentAt(i / samples, here);
    curve.getTangentAt(((i + 1) % samples) / samples, next);
    // Clamped, because a dot product a hair over 1 comes back from Math.acos
    // as NaN and takes the whole rating with it.
    const dot = Math.max(-1, Math.min(1, here.dot(next)));
    const turn = Math.acos(dot);
    const radius = turn > 1e-6 ? step / turn : Infinity;
    allowed.push(Math.min(CAR.top, radius * turnRate));
  }
  allowed.sort((a, b) => a - b);
  const worst = allowed.slice(0, Math.max(1, Math.round(samples / 10)));
  const slowest = worst.reduce((sum, v) => sum + v, 0) / worst.length;

  let total = (1 - slowest / CAR.top) * RATING.perSlowing;

  for (const item of spec.items) {
    if (item.kind === "oil") {
      total += RATING.perOil;
    } else if (item.kind === "mud") {
      total += RATING.perMud;
    } else {
      total += RATING.perRamp;
    }
  }

  total += crossings(curve) * RATING.perCrossing;
  total += (spec.laps - 1) * RATING.perExtraLap;
  return total;
}

export function rate(spec: TrackSpec): Rating {
  const n = score(spec);
  if (n >= RATING.hard) {
    return "hard";
  }
  if (n >= RATING.medium) {
    return "medium";
  }
  return "easy";
}

/**
 * How many times the circuit runs over itself.
 *
 * A coarse count on its own samples rather than the real one from `Track` —
 * this only needs to know whether there are flyovers and roughly how many, and
 * the real answer costs a built road.
 */
function crossings(curve: THREE.CatmullRomCurve3): number {
  const samples = 120;
  const points = curve.getSpacedPoints(samples - 1);
  const apart = Math.round(samples * 0.08);
  let found = 0;
  let last = -apart;
  for (let i = 0; i < samples; i++) {
    for (let j = i + apart; j < samples; j++) {
      if (samples - (j - i) < apart) {
        continue;
      }
      if (points[i].distanceTo(points[j]) < 90 && i - last >= apart) {
        found++;
        last = i;
        break;
      }
    }
  }
  // Each crossing is met twice going round, once from each road.
  return Math.round(found / 2);
}
