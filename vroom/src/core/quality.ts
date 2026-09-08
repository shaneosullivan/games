import {QUALITY, Tier} from "../config";

/**
 * What the machine this is running on can afford.
 *
 * The game watches its own frame rate and gives something up when it cannot
 * keep sixty — and then remembers, so the next race on the same iPad starts
 * where the last one ended up rather than stuttering its way back down again.
 *
 * Deliberately one-way. A version of this that turned the quality back up on
 * a good stretch of road would hunt between two settings for the whole race,
 * and the hunting is more distracting than the lower setting ever was.
 */
const KEY = "vroom.quality.v1";

let index = load();
const listeners: Array<(tier: Tier) => void> = [];

/** Seconds counted in the current window, and how many frames were in it. */
let elapsed = 0;
let frames = 0;
let bad = 0;
let warm = 0;

export function tier(): Tier {
  return QUALITY.tiers[index];
}

export function tierName(): string {
  return tier().name;
}

/** Told when the tier changes, so the stage can re-apply it. */
export function onQualityChange(fn: (tier: Tier) => void): void {
  listeners.push(fn);
}

/**
 * Sets the tier by name and remembers it.
 *
 * Exposed on `window.quality` in a development build so a tier can be tried
 * without waiting for the game to decide — which is the only practical way to
 * see what "low" actually looks like on a machine that never needs it.
 */
export function setQuality(name: string): boolean {
  const found = QUALITY.tiers.findIndex(t => t.name === name);
  if (found < 0) {
    return false;
  }
  index = found;
  save();
  for (const fn of listeners) {
    fn(tier());
  }
  return true;
}

/** Starts a fresh judgement, at the beginning of a race. */
export function beginWatching(): void {
  elapsed = 0;
  frames = 0;
  bad = 0;
  warm = 0;
}

/**
 * One frame's worth of evidence.
 *
 * Frame times rather than a running average: an average is dragged around by
 * whatever happened ten seconds ago, and what matters is whether the last
 * couple of seconds were playable.
 */
export function sawFrame(dt: number): void {
  if (index >= QUALITY.tiers.length - 1) {
    return;
  }
  warm += dt;
  if (warm < QUALITY.warmup) {
    return;
  }

  elapsed += dt;
  frames++;
  if (elapsed < QUALITY.window) {
    return;
  }

  const fps = frames / elapsed;
  elapsed = 0;
  frames = 0;
  bad = fps < QUALITY.floor ? bad + 1 : 0;
  if (bad < QUALITY.patience) {
    return;
  }

  bad = 0;
  index++;
  save();
  for (const fn of listeners) {
    fn(tier());
  }
}

function load(): number {
  try {
    const saved = window.localStorage.getItem(KEY);
    const found = QUALITY.tiers.findIndex(t => t.name === saved);
    if (found >= 0) {
      return found;
    }
  } catch {
    // A blocked or full store is not worth a crash — the game simply starts
    // at the top and works its own way down again.
  }
  return Math.max(
    0,
    QUALITY.tiers.findIndex(t => t.name === QUALITY.start),
  );
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, tier().name);
  } catch {
    // As above.
  }
}
