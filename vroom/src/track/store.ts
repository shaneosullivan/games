import {isSpec, TrackSpec} from "./spec";

/**
 * The tracks a child has drawn, kept in this browser.
 *
 * Local storage and nothing else for now: the plan is a server one day, with
 * short codes for swapping tracks about, and the Export button is the bridge
 * until then. Everything here is written so that losing the store or finding
 * rubbish in it is a shrug — a game that will not start because a saved track
 * is malformed would be much worse than one that quietly has fewer tracks.
 */
const KEY = "vroom.tracks.v1";
/* What the key was called when the game was. A track drawn before the game was
   renamed is still somebody's track, so the old key is read once and moved
   over rather than left behind. */
const OLD_KEY = "skid-marks.tracks.v1";

export function loadTracks(): Array<TrackSpec> {
  try {
    const raw =
      window.localStorage.getItem(KEY) ?? window.localStorage.getItem(OLD_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isSpec);
  } catch {
    return [];
  }
}

export function saveTrack(spec: TrackSpec): void {
  const all = loadTracks().filter(t => t.id !== spec.id);
  all.push(spec);
  write(all);
}

export function deleteTrack(id: string): void {
  write(loadTracks().filter(t => t.id !== id));
}

export function findTrack(id: string): TrackSpec | undefined {
  return loadTracks().find(t => t.id === id);
}

function write(all: Array<TrackSpec>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // A full or disabled store is not worth a crash: the child still gets to
    // play the track they just drew, they just will not find it tomorrow.
  }
}
