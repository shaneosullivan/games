import * as THREE from 'three';
import { DANCE } from '../config';
import type { Rng } from '../core/rng';

export type DanceEvent =
  | { type: 'lit'; pad: number }
  | { type: 'hit'; pad: number }
  | { type: 'miss'; pad: number }
  | { type: 'finished'; passed: boolean };

/** Pads 0..8 in reading order; 4 is the centre the bee waits on. */
const CENTRE = 4;
const OUTER = [0, 1, 2, 3, 5, 6, 7, 8];

const LIT = new THREE.Color(0xfff0a0);
const HIT = new THREE.Color(0x63ff9b);
const MISS = new THREE.Color(0xff5f6d);

/**
 * The dance-mat minigame.
 *
 * Prompts are pinned to musical beats rather than to frame time, so the pads
 * land exactly with the track however the framerate wobbles. Everything is
 * driven by `update(beats)` — the level reads beats off the audio clock and
 * passes them in.
 *
 * The reaction window is most of a prompt's length (`DANCE.litFraction`), which
 * is generous by rhythm-game standards. That's deliberate: this is meant to be
 * playable by a child, and the challenge is watching the mat, not frame-perfect
 * timing.
 */
export class DanceMat {
  /** Events since the last drain. */
  readonly events: DanceEvent[] = [];

  hits = 0;
  attempts = 0;

  private readonly prompts: number[] = [];
  private index = -1;
  private active: { pad: number; endBeat: number } | null = null;
  private resolved = true;
  private finished = false;

  /** Pads currently flashing a hit/miss colour, with seconds remaining. */
  private readonly flashes = new Map<number, number>();
  private readonly baseColours: THREE.Color[] = [];

  constructor(
    private readonly pads: THREE.Mesh[],
    rng: Rng,
  ) {
    for (const pad of pads) {
      this.baseColours.push((pad.material as THREE.MeshToonMaterial).color.clone());
    }

    // Build the prompt list up front so the whole round is deterministic, and
    // avoid asking for the same pad twice in a row — a repeat reads as a
    // dropped beat rather than a new one.
    let previous = -1;
    for (let i = 0; i < DANCE.prompts; i++) {
      let pad = OUTER[rng.int(0, OUTER.length)];
      if (pad === previous) pad = OUTER[(OUTER.indexOf(pad) + 1 + rng.int(0, 3)) % OUTER.length];
      this.prompts.push(pad);
      previous = pad;
    }
  }

  get total(): number {
    return this.prompts.length;
  }

  get ratio(): number {
    return this.attempts === 0 ? 0 : this.hits / this.total;
  }

  get passed(): boolean {
    return this.hits / this.total >= DANCE.passRatio;
  }

  /** Which pad is lit right now, or null. */
  get litPad(): number | null {
    return this.active && !this.resolved ? this.active.pad : null;
  }

  /** Beat on which prompt `i` lights up. */
  private beatOf(i: number): number {
    return DANCE.countInBeats + i * DANCE.beatsPerPrompt;
  }

  /** Musical beat the whole round ends on, for a progress readout. */
  get endBeat(): number {
    return this.beatOf(this.prompts.length - 1) + DANCE.beatsPerPrompt;
  }

  update(beats: number, dt: number): void {
    // Fade any hit/miss flashes back to the pad's own colour.
    for (const [pad, left] of this.flashes) {
      const next = left - dt;
      if (next <= 0) {
        this.flashes.delete(pad);
        this.paint(pad, this.baseColours[pad]);
      } else {
        this.flashes.set(pad, next);
      }
    }

    if (this.finished) return;

    // Time to light the next pad?
    const next = this.index + 1;
    if (next < this.prompts.length && beats >= this.beatOf(next)) {
      if (this.active && !this.resolved) this.resolve(false);
      this.index = next;
      this.active = {
        pad: this.prompts[next],
        endBeat: this.beatOf(next) + DANCE.beatsPerPrompt * DANCE.litFraction,
      };
      this.resolved = false;
      this.paint(this.active.pad, LIT);
      this.events.push({ type: 'lit', pad: this.active.pad });
      return;
    }

    // Window expired without a tap.
    if (this.active && !this.resolved && beats > this.active.endBeat) this.resolve(false);
  }

  /** @returns true if this was the pad we were asking for. */
  tap(pad: number): boolean {
    if (this.finished || !this.active || this.resolved) return false;
    if (pad !== this.active.pad || pad === CENTRE) return false;
    this.resolve(true);
    return true;
  }

  private resolve(hit: boolean): void {
    if (!this.active) return;
    const pad = this.active.pad;
    this.resolved = true;
    this.attempts++;
    if (hit) this.hits++;

    this.paint(pad, hit ? HIT : MISS);
    this.flashes.set(pad, 0.28);
    this.events.push({ type: hit ? 'hit' : 'miss', pad });

    if (this.attempts >= this.prompts.length) {
      this.finished = true;
      this.events.push({ type: 'finished', passed: this.passed });
    }
  }

  /** Put every pad back to its resting colour. */
  reset(): void {
    for (let i = 0; i < this.pads.length; i++) this.paint(i, this.baseColours[i]);
    this.flashes.clear();
  }

  private paint(pad: number, colour: THREE.Color): void {
    const mat = this.pads[pad].material as THREE.MeshToonMaterial;
    mat.color.copy(colour);
    // Lift the lit pad slightly so it reads even at a glancing camera angle.
    this.pads[pad].scale.y = colour === LIT ? 2.2 : 1;
  }
}
