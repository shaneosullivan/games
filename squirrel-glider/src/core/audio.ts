import {WIND} from "../config";

/**
 * The wind.
 *
 * Made rather than loaded: wind is noise through a filter, which is a few
 * lines of Web Audio and nothing at all in the build — this game ships as one
 * self-contained html file, and a minute of stereo mp3 would be most of it.
 *
 * Loudness and brightness both follow the speed, so it tells a child how fast
 * they are going while they are looking at the arch they are aiming for. It is
 * the only readout in the game that does not need eyes.
 *
 * Nothing is created until the player has touched the screen: a browser will
 * not start an audio context before a gesture, and asking it to only produces
 * a warning in the console.
 */
export class Wind {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private muted = false;
  /** The flight is over: fade out and stay out. See hush(). */
  private hushed = false;
  /** Follows the speed, but lazily. See WIND.rate. */
  private level = 0;

  /** Call from a real gesture — the jump, or the button that starts the game. */
  start(): void {
    if (this.ctx || this.muted) {
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;

    const frames = Math.floor(ctx.sampleRate * WIND.loopSeconds);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: white noise leaned on by a running average, which is
    // what makes it sound like air moving rather than like a broken radio.
    let last = 0;
    for (let i = 0; i < frames; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + white * 0.09) / 1.02;
      data[i] = last * 3.2;
    }
    // The seam. A loop point in noise is a click, and a click every three
    // seconds is the only thing anybody would hear.
    const blend = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < blend; i++) {
      const t = i / blend;
      data[i] = data[i] * t + data[frames - blend + i] * (1 - t);
    }

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = WIND.cutoffSlow;
    this.filter.Q.value = 0.6;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(ctx.destination);
    this.source.start();
  }

  /**
   * The flight is over — down the valley or down early, it makes no odds.
   *
   * Wanted because a landed squirrel stops being simulated, so its speed
   * freezes at whatever it touched down at and the wind howls on underneath
   * the card at exactly that pitch, for as long as the card is up. Fades
   * rather than cuts: wind that stops dead sounds like a bug.
   */
  hush(): void {
    this.hushed = true;
  }

  /** `run` is 0 at trim and 1 flat out. */
  update(dt: number, run: number): void {
    const want = this.hushed ? 0 : run;
    const rate = this.hushed ? WIND.hushRate : WIND.rate;
    this.level += (want - this.level) * Math.min(1, rate * dt);
    if (!this.gain || !this.filter || this.muted) {
      return;
    }
    const t = Math.min(1, Math.max(0, this.level));
    const floor = this.hushed ? 0 : WIND.gainSlow;
    this.gain.gain.value = floor + t * (WIND.gainFast - floor);
    this.filter.frequency.value =
      WIND.cutoffSlow + t * (WIND.cutoffFast - WIND.cutoffSlow);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain) {
      this.gain.gain.value = muted ? 0 : WIND.gainSlow;
    }
  }

  /**
   * Everything off, for good.
   *
   * The gallery is a link away and the games in it are pages, not tabs: a page
   * left running its own weather behind the one a child has moved on to is the
   * bug the caterpillar game already had once.
   */
  stop(): void {
    this.source?.stop();
    this.source = null;
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
    this.filter = null;
  }
}
