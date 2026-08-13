import * as THREE from 'three';
import { DANCE } from '../config';
import type { Rng } from '../core/rng';

export type DanceEvent =
  | { type: 'lit'; pad: number }
  | { type: 'hit'; pad: number }
  | { type: 'miss'; pad: number }
  /** The first cue of the round that lights two pads instead of one. */
  | { type: 'stepUp' }
  | { type: 'finished'; passed: boolean };

/** Pads 0..8 in reading order; 4 is the centre the bee waits on. */
const CENTRE = 4;
const OUTER = [0, 1, 2, 3, 5, 6, 7, 8];

const LIT = new THREE.Color(0xfff0a0);
const HIT = new THREE.Color(0x63ff9b);
const MISS = new THREE.Color(0xff5f6d);

/** One pad, lit for a window of musical beats. */
interface Prompt {
  pad: number;
  litBeat: number;
  endBeat: number;
  lit: boolean;
  resolved: boolean;
  /** First pad of the first paired cue, which is worth announcing. */
  stepUp?: boolean;
}

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
 *
 * The round starts one pad at a time and then steps up: after
 * `DANCE.soloCues`, each cue lights *two* pads, the second a fraction of a beat
 * behind the first. The window on each stays exactly as long — what gets harder
 * is having to watch two places at once and take them in the right order, not
 * having to be quicker.
 *
 * Prompts therefore overlap, so each carries its own window and resolves on its
 * own. Nothing here assumes there's only one live pad.
 */
export class DanceMat {
  /** Events since the last drain. */
  readonly events: DanceEvent[] = [];

  hits = 0;
  attempts = 0;

  private readonly prompts: Prompt[] = [];
  private finished = false;

  /** Pads currently flashing a hit/miss colour, with seconds remaining. */
  private readonly flashes = new Map<number, number>();
  private readonly baseColours: THREE.Color[] = [];

  /**
   * @param colours each pad's resting colour, from the scene that built them.
   *   Deliberately not read off the live materials: a mat built while a pad is
   *   still lit — replaying the level mid-round used to do exactly that — would
   *   take the lit colour for its resting one and leave that pad on for good.
   */
  constructor(
    private readonly pads: THREE.Mesh[],
    colours: readonly number[],
    rng: Rng,
  ) {
    for (const colour of colours) this.baseColours.push(new THREE.Color(colour));
    // Whatever the last round left behind is not this round's business.
    this.reset();

    // Build the whole round up front so it's deterministic. A pad is never
    // asked for twice in a row — a repeat reads as a dropped beat rather than
    // a new one — and with pairs that means avoiding *both* of the last cue's
    // pads, since the previous pair's window can still be open.
    let recent: number[] = [];
    for (let cue = 0; cue < DANCE.cues; cue++) {
      const beat = DANCE.countInBeats + cue * DANCE.beatsPerCue;
      const window = DANCE.beatsPerCue * DANCE.litFraction;
      const pair = cue >= DANCE.soloCues;

      const first = pick(rng, recent);
      this.prompts.push({
        pad: first,
        litBeat: beat,
        endBeat: beat + window,
        lit: false,
        resolved: false,
        stepUp: cue === DANCE.soloCues,
      });
      recent = [first];

      if (pair) {
        const second = pick(rng, recent);
        this.prompts.push({
          pad: second,
          litBeat: beat + DANCE.pairOffset,
          endBeat: beat + DANCE.pairOffset + window,
          lit: false,
          resolved: false,
        });
        recent = [first, second];
      }
    }
  }

  /** Pads asked for across a whole round, known before one is built. */
  static get totalPads(): number {
    return DANCE.soloCues + 2 * (DANCE.cues - DANCE.soloCues);
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

  /** Musical beat the whole round ends on, for a progress readout. */
  get endBeat(): number {
    return this.prompts[this.prompts.length - 1].endBeat;
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

    for (const prompt of this.prompts) {
      if (prompt.resolved) continue;

      if (!prompt.lit) {
        if (beats < prompt.litBeat) break; // the list is in time order
        prompt.lit = true;
        this.paint(prompt.pad, LIT);
        if (prompt.stepUp) this.events.push({ type: 'stepUp' });
        this.events.push({ type: 'lit', pad: prompt.pad });
        continue;
      }

      // Window expired without a tap.
      if (beats > prompt.endBeat) this.resolve(prompt, false);
    }
  }

  /** @returns true if this pad is one of the ones being asked for. */
  tap(pad: number): boolean {
    if (this.finished || pad === CENTRE) return false;
    // Oldest first, so tapping a pad that's somehow been asked for twice
    // answers the prompt that's about to run out.
    const prompt = this.prompts.find((p) => p.lit && !p.resolved && p.pad === pad);
    if (!prompt) return false;
    this.resolve(prompt, true);
    return true;
  }

  private resolve(prompt: Prompt, hit: boolean): void {
    prompt.resolved = true;
    this.attempts++;
    if (hit) this.hits++;

    this.paint(prompt.pad, hit ? HIT : MISS);
    this.flashes.set(prompt.pad, 0.28);
    this.events.push({ type: hit ? 'hit' : 'miss', pad: prompt.pad });

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

/** An outer pad that isn't one of the ones still in play. */
function pick(rng: Rng, avoid: readonly number[]): number {
  const options = OUTER.filter((p) => !avoid.includes(p));
  return options[rng.int(0, options.length)];
}
