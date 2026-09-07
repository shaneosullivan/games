import {ENVIRONMENTS, TRACK} from "../config";
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
  /** The corners, in world units. Smoothed into a closed curve. */
  shape: Array<{x: number; z: number}>;
  /** Where the start line sits, as a fraction round the lap. */
  startAt: number;
  items: Array<TrackItem>;
}

/** The circuit the game ships with. */
export const BUILT_IN: TrackSpec = {
  version: SPEC_VERSION,
  id: "built-in",
  name: "Sunday Hills",
  environment: "hills",
  shape: TRACK.shape.map(p => ({x: p.x, z: p.z})),
  startAt: TRACK.startAt,
  items: [],
};

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
