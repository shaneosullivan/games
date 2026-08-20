/**
 * A small seeded generator, so the forest is laid out the same way every time
 * you load the game. A child who learns where the blackberries are should find
 * them there tomorrow.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Never let the state be zero — mulberry32 gets stuck there.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** 0..1 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  pick<T>(items: ReadonlyArray<T>): T {
    return items[
      Math.min(items.length - 1, Math.floor(this.next() * items.length))
    ];
  }
}
