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
  pollen: Record<PollenKind, number>;
  /** Lifetime totals, kept separate so spending pollen doesn't erase progress stats. */
  gathered: Record<PollenKind, number>;
  /** Wall-clock ms of the last write; the day system will read this. */
  updatedAt: number;
}

function blank(): SaveData {
  return {
    version: 1,
    codename: "",
    level: 1,
    maxLevel: 1,
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
