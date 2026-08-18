import type {PollenKind} from "../config";

const KEY = "bee.save.v1";

export interface SaveData {
  version: 1;
  codename: string;
  level: number;
  /**
   * Furthest level ever reached. Drives the level picker on the welcome
   * screen — `level` alone can't, because picking an earlier level to replay
   * would otherwise throw away the unlock.
   */
  maxLevel: number;
  /**
   * Every level the player has actually *finished*, lowest first.
   *
   * The record of what has been done, as opposed to `maxLevel`, which only
   * ever said how far they had got — and could not tell "in the middle of the
   * cave" from "finished the cave", which is exactly the confusion that left
   * the Silent Islands locked for anyone who had already beaten level 6. What
   * is unlocked is computed from this; see `unlockedThrough`.
   */
  completed: Array<number>;
  pollen: Record<PollenKind, number>;
  /** Lifetime totals, kept separate so spending pollen doesn't erase progress stats. */
  gathered: Record<PollenKind, number>;
  /** Wall-clock ms of the last write; the day system will read this. */
  updatedAt: number;
  /**
   * Whether this save has been through the Silent Islands grant below.
   *
   * Set on the first load under any build that knows about it, which is what
   * makes the grant a one-off for saves that already existed rather than a
   * standing rule.
   */
  islandsGranted?: boolean;
}

function blank(): SaveData {
  return {
    version: 1,
    codename: "",
    level: 1,
    maxLevel: 1,
    completed: [],
    pollen: {white: 0, yellow: 0, orange: 0},
    gathered: {white: 0, yellow: 0, orange: 0},
    updatedAt: Date.now(),
  };
}

function read(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return blank();
    }
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) {
      return blank();
    }
    const base = blank();
    const merged = {
      ...base,
      ...parsed,
      pollen: {...base.pollen, ...parsed.pollen},
      gathered: {...base.gathered, ...parsed.gathered},
    };
    // Saves written before the level picker existed have no maxLevel; the
    // level they were on is the best evidence of how far they got.
    merged.maxLevel = Math.max(1, parsed.maxLevel ?? 1, merged.level);

    /*
     * A save from before this list existed: everything below the furthest
     * level reached has been finished, because finishing was the only way to
     * reach it. The level they are *on* is not, which is the whole point of
     * keeping the two apart.
     */
    if (!Array.isArray(parsed.completed)) {
      merged.completed = [];
      for (let n = 1; n < merged.maxLevel; n++) {
        merged.completed.push(n);
      }
    } else {
      merged.completed = parsed.completed
        .filter(n => typeof n === "number" && Number.isFinite(n))
        .sort((a, b) => a - b);
    }

    /*
     * One-off: hand the Silent Islands to a save that finished the Bear's Lair
     * before there was anything after it.
     *
     * Until level 7 existed, finishing the cave left the save saying 6 — the
     * same thing it says while you are still in the middle of the cave, so
     * there is no way to tell the two apart after the fact. Strictly, that
     * means anyone who had already finished it was locked out of the new level
     * unless they played the whole cave again. Generously, it means someone
     * halfway through the cave gets the next land a little early. For a game
     * for a child, the generous reading is the right one.
     *
     * The flag is what keeps this from becoming a standing rule: it is written
     * on the first load under any build that has this code, so a save made
     * from here on already carries it and reaching level 6 the ordinary way
     * still has to be finished to open what comes next.
     */
    if (!parsed.islandsGranted && merged.maxLevel === 6) {
      merged.maxLevel = 7;
    }
    merged.islandsGranted = true;
    // Never trust the stored codename to be a string — a bad write would
    // otherwise surface as "[object Object]" in the name field.
    if (typeof merged.codename !== "string") {
      merged.codename = "";
    }
    return merged;
  } catch {
    return blank();
  }
}

/**
 * Single JSON blob in localStorage. Writes are debounced, but always flushed
 * on visibilitychange/pagehide because iPad Safari kills backgrounded tabs
 * without warning.
 */
export class Save {
  data: SaveData = read();
  private pending = 0;

  constructor() {
    const flush = () => this.flush();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    });
    window.addEventListener("pagehide", flush);
  }

  /** Mutate then persist. */
  mutate(fn: (d: SaveData) => void): void {
    fn(this.data);
    this.schedule();
  }

  /** Write down that a level has been finished. */
  markComplete(n: number): void {
    if (this.data.completed.includes(n)) {
      return;
    }
    this.mutate(d => {
      d.completed.push(n);
      d.completed.sort((a, b) => a - b);
    });
  }

  isComplete(n: number): boolean {
    return this.data.completed.includes(n);
  }

  /**
   * The highest level the player may pick, computed from what they have
   * finished.
   *
   * One past the best level completed — and never less than how far they have
   * reached, so a level abandoned halfway through is still there to go back
   * to rather than being taken away from them.
   */
  unlockedThrough(): number {
    let best = this.data.maxLevel;
    for (const n of this.data.completed) {
      best = Math.max(best, n + 1);
    }
    return Math.max(1, best);
  }

  hasProfile(): boolean {
    return this.data.codename.trim().length > 0;
  }

  reset(): void {
    this.data = blank();
    this.flush();
  }

  private schedule(): void {
    if (this.pending) {
      return;
    }
    this.pending = window.setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = 0;
    }
    this.data.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private browsing / quota — the game still plays, it just won't persist */
    }
  }
}
