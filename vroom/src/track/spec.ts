import {CIRCUITS, ENVIRONMENTS, RACE, TRACK} from "../config";
import type {Environment} from "../config";

export type {Environment};

/**
 * What a race track *is*, as data.
 *
 * The built-in circuit used to be a list of corners in the config and nothing
 * else. Now that a child can draw their own, a track has to be a thing that
 * can be written down, saved, handed about and played — so this is the shape
 * of it, and the game reads a track from one of these whether it came from the
 * config or off the end of somebody's finger.
 *
 * Everything positional is stored against the circuit rather than in world
 * coordinates: an item knows how far round the lap it sits (`t`) and how far
 * off the middle (`across`). That is deliberate. World coordinates would come
 * unstuck from the road the moment anything about the track changed, and this
 * way an oil patch is on the road by construction.
 */
export const SPEC_VERSION = 1;

/** The things that can be dropped onto a track. */
export type ItemKind = "ramp" | "oil" | "mud";

export const ITEM_NAMES: Record<ItemKind, string> = {
  ramp: "Ramp",
  oil: "Oil",
  mud: "Mud",
};

export interface TrackItem {
  kind: ItemKind;
  /** How far round the lap, 0..1. */
  t: number;
  /** How far off the centre line, in world units. */
  across: number;
}

export interface TrackSpec {
  version: number;
  id: string;
  name: string;
  environment: Environment;
  /** How many times round. One to RACE.maxLaps. */
  laps: number;
  /** The corners, in world units. Smoothed into a closed curve. */
  shape: Array<{x: number; z: number}>;
  /** Where the start line sits, as a fraction round the lap. */
  startAt: number;
  items: Array<TrackItem>;
}

/** The circuit the game opens on. */
export const BUILT_IN: TrackSpec = {
  version: SPEC_VERSION,
  id: "built-in",
  name: "Sunday Hills",
  environment: "hills",
  laps: 1,
  shape: TRACK.shape.map(p => ({x: p.x, z: p.z})),
  startAt: TRACK.startAt,
  items: [],
};

/**
 * The ones the game ships with: one for each place there is, one that was
 * drawn with a finger, and six that were generated.
 *
 * More than one because two of the three environments were only ever seen by a
 * child who drew a track and remembered to change the setting — a whole desert
 * and a whole city, built and lit and never opened. Peanut is the odd one out
 * and deliberately so: it was drawn with a finger in the builder rather than
 * written down here.
 *
 * The six after it are generated, and in difficulty order: two easy, two
 * medium, two hard, spread across the three places. Their ratings are the
 * game's own reading of them rather than a label — see `CIRCUITS` for how they
 * were arrived at.
 */
export const BUILT_INS: ReadonlyArray<TrackSpec> = [
  BUILT_IN,
  {
    version: SPEC_VERSION,
    id: "built-in-desert",
    name: CIRCUITS.desert.name,
    environment: "desert",
    laps: 1,
    shape: CIRCUITS.desert.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.desert.startAt,
    items: [],
  },
  {
    version: SPEC_VERSION,
    id: "built-in-neon",
    name: CIRCUITS.neon.name,
    environment: "neon",
    laps: 1,
    shape: CIRCUITS.neon.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.neon.startAt,
    items: [],
  },
  {
    version: SPEC_VERSION,
    id: "built-in-buttercup",
    name: CIRCUITS.buttercup.name,
    environment: "hills",
    laps: 1,
    shape: CIRCUITS.buttercup.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.buttercup.startAt,
    items: CIRCUITS.buttercup.items.map(i => ({...i})),
  },
  {
    version: SPEC_VERSION,
    id: "built-in-sandy",
    name: CIRCUITS.sandy.name,
    environment: "desert",
    laps: 1,
    shape: CIRCUITS.sandy.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.sandy.startAt,
    items: CIRCUITS.sandy.items.map(i => ({...i})),
  },
  {
    version: SPEC_VERSION,
    id: "built-in-market",
    name: CIRCUITS.market.name,
    environment: "neon",
    laps: 1,
    shape: CIRCUITS.market.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.market.startAt,
    items: CIRCUITS.market.items.map(i => ({...i})),
  },
  {
    version: SPEC_VERSION,
    id: "built-in-fox",
    name: CIRCUITS.fox.name,
    environment: "hills",
    laps: 1,
    shape: CIRCUITS.fox.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.fox.startAt,
    items: CIRCUITS.fox.items.map(i => ({...i})),
  },
  {
    version: SPEC_VERSION,
    id: "built-in-scorpion",
    name: CIRCUITS.scorpion.name,
    environment: "desert",
    laps: 1,
    shape: CIRCUITS.scorpion.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.scorpion.startAt,
    items: CIRCUITS.scorpion.items.map(i => ({...i})),
  },
  {
    version: SPEC_VERSION,
    id: "built-in-skyline",
    name: CIRCUITS.skyline.name,
    environment: "neon",
    laps: 1,
    shape: CIRCUITS.skyline.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.skyline.startAt,
    items: CIRCUITS.skyline.items.map(i => ({...i})),
  },
  {
    version: SPEC_VERSION,
    id: "built-in-peanut",
    name: CIRCUITS.peanut.name,
    environment: "neon",
    laps: 1,
    shape: CIRCUITS.peanut.shape.map(p => ({x: p.x, z: p.z})),
    startAt: CIRCUITS.peanut.startAt,
    items: CIRCUITS.peanut.items.map(i => ({...i})),
  },
];

/** One to ten, whole. Ten is the limit because a child racing an eleventh lap
 *  of their own track has stopped playing and started commuting. */
export function clampLaps(laps: unknown): number {
  const n = Math.round(Number(laps));
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.max(1, Math.min(RACE.maxLaps, n));
}

export function newId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Is this actually a track?
 *
 * Worth being fussy about, because two of the ways a spec gets here are a
 * browser's local storage and a paste into the export box, and neither of them
 * is under this game's control. A malformed track must come back as "no" and
 * not as a game that throws halfway through drawing a circuit.
 */
export function isSpec(value: unknown): value is TrackSpec {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const s = value as Partial<TrackSpec>;
  if (typeof s.id !== "string" || typeof s.name !== "string") {
    return false;
  }
  if (typeof s.environment !== "string" || !(s.environment in ENVIRONMENTS)) {
    return false;
  }
  if (!Array.isArray(s.shape) || s.shape.length < 4) {
    return false;
  }
  for (const p of s.shape) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) {
      return false;
    }
  }
  if (!Number.isFinite(s.startAt)) {
    return false;
  }
  // Laps arrived after the first tracks were saved, so a spec without them is
  // not broken — it is a one-lap race, which is what it was when it was made.
  s.laps = clampLaps(s.laps);
  if (!Array.isArray(s.items)) {
    return false;
  }
  for (const it of s.items) {
    if (!(it?.kind in ITEM_NAMES)) {
      return false;
    }
    if (!Number.isFinite(it?.t) || !Number.isFinite(it?.across)) {
      return false;
    }
  }
  return true;
}
