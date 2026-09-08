import {QUALITY, Settings} from "../config";

/**
 * What the machine this is running on can afford, given up one thing at a time.
 *
 * The game watches its own frame rate and makes a concession when it cannot
 * keep up, then remembers how many it has made — so the next race on the same
 * iPad starts where the last one ended rather than stuttering its way back
 * down again.
 *
 * **One concession at a time, in a stated order.** This started out as three
 * coarse tiers and that was worse: a machine a few frames short of smooth lost
 * its shadows, its bloom and a third of its scenery at once, when turning the
 * resolution down a notch would have done. The order lives in
 * `QUALITY.ladder`, cheapest-looking concession first, with the reasoning
 * beside it.
 *
 * Deliberately one-way. A version that put things back on a good stretch of
 * road would hunt between two settings for the whole race, and the hunting is
 * more distracting than the concession ever was.
 */
const KEY = "vroom.quality.v2";

let given = load();
const listeners: Array<(now: Settings) => void> = [];

let elapsed = 0;
let frames = 0;
let bad = 0;
let warm = 0;

/** Everything as it currently stands, with the concessions applied in order. */
export function settings(): Settings {
  const now = {...QUALITY.full};
  for (let i = 0; i < given && i < QUALITY.ladder.length; i++) {
    Object.assign(now, {...QUALITY.ladder[i], name: undefined});
    delete (now as Record<string, unknown>).name;
  }
  return now;
}

/** How many concessions have been made, and what they were. */
export function givenUp(): Array<string> {
  return QUALITY.ladder.slice(0, given).map(rung => rung.name);
}

export function onQualityChange(fn: (now: Settings) => void): void {
  listeners.push(fn);
}

/**
 * Stops telling something about changes.
 *
 * A stage that has been torn down must stop listening, and not only to save
 * the work: it took a race or two for the list to fill with dead stages, one
 * of which threw when it was told about a change — and the throw came out of
 * the loop and skipped every listener after it, including the live one. The
 * symptom was quality settings that quietly did nothing at all.
 */
export function offQualityChange(fn: (now: Settings) => void): void {
  const at = listeners.indexOf(fn);
  if (at >= 0) {
    listeners.splice(at, 1);
  }
}

/**
 * Sets how many concessions have been made, and remembers it.
 *
 * Exposed on `window.quality` in a development build: the only practical way
 * to see what a machine that needs six of them is actually looking at.
 */
export function setQuality(level: number): void {
  given = Math.max(0, Math.min(QUALITY.ladder.length, Math.round(level)));
  save();
  const now = settings();
  // A copy, and each in its own try: nothing listening here matters enough
  // that its failure should stop the rest being told. See above.
  for (const fn of [...listeners]) {
    try {
      fn(now);
    } catch {
      // Ignored on purpose.
    }
  }
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
 * Frame times rather than a running average: an average is dragged about by
 * whatever happened ten seconds ago, and what matters is whether the last
 * couple of seconds were playable.
 */
export function sawFrame(dt: number): void {
  if (given >= QUALITY.ladder.length) {
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
  setQuality(given + 1);
}

function load(): number {
  try {
    const saved = Number(window.localStorage.getItem(KEY));
    if (Number.isFinite(saved)) {
      return Math.max(0, Math.min(QUALITY.ladder.length, Math.round(saved)));
    }
  } catch {
    // A blocked or full store is not worth a crash — the game simply starts at
    // the top and works its own way down again.
  }
  return 0;
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, String(given));
  } catch {
    // As above.
  }
}
