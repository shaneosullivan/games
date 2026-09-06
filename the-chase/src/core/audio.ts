import {SOUND} from "../config";

/**
 * The wood.
 *
 * Made rather than loaded, the same as the other games here: this one ships as
 * a single self-contained html file, and a minute of woodland as an mp3 would
 * be most of it.
 *
 * The bed is noise through a lowpass, and both the volume and the cutoff ride
 * on how fast the hare is going. That pair is the whole trick — running
 * through a wood at a lope is a rustle and at a gallop it is a roar, and
 * moving the cutoff is what turns one into the other. Volume alone just gets
 * louder, which sounds like somebody turning a knob rather than like speed.
 *
 * Nothing is created until the player has touched the screen. A browser will
 * not start an audio context before a gesture, and asking it to only produces
 * a warning in the console.
 */
export class Woodland {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private muted = false;
  /** Follows the speed, lazily, so the rush rises rather than switches. */
  private level = 0;
  /** Seconds until the next bark. */
  private barkIn = 0;

  /** Call from a real gesture — the button that starts the game. */
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

    const frames = Math.floor(ctx.sampleRate * SOUND.loopSeconds);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    // The seam. A loop point in noise is a click, and a click every four
    // seconds is the only thing anybody would hear.
    const blend = Math.floor(ctx.sampleRate * 0.06);
    for (let i = 0; i < blend; i++) {
      const t = i / blend;
      data[i] = data[i] * t + data[frames - blend + i] * (1 - t);
    }

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = SOUND.cutoffMin;
    this.filter.Q.value = 0.6;

    this.gain = ctx.createGain();
    this.gain.gain.value = SOUND.levelMin;

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(ctx.destination);
    this.source.start();
  }

  /**
   * `speed` in units a second, `gap` how far off the nearest dog is.
   *
   * The barking is here rather than in the game because it is a *reading* of
   * the gap, not an event: the dogs spend most of the run behind the camera,
   * so how loud and how often they bark is the main way a child knows how they
   * are doing.
   */
  update(dt: number, speed: number, gap: number): void {
    const want = Math.min(1, Math.max(0, speed / SOUND.fullSpeed));
    this.level += (want - this.level) * Math.min(1, SOUND.follow * dt);
    if (this.gain && this.filter && !this.muted) {
      this.gain.gain.value =
        SOUND.levelMin + this.level * (SOUND.levelMax - SOUND.levelMin);
      // Squared, so most of the brightening happens in the top half of the
      // speed range, which is where it is actually felt.
      const bright = this.level * this.level;
      this.filter.frequency.value =
        SOUND.cutoffMin + bright * (SOUND.cutoffMax - SOUND.cutoffMin);
    }

    this.barkIn -= dt;
    if (this.barkIn <= 0) {
      const near = Math.min(
        1,
        Math.max(
          0,
          1 - (gap - SOUND.barkFrom) / (SOUND.barkTo - SOUND.barkFrom),
        ),
      );
      // Closer dogs bark more often as well as louder, so the run gets busier
      // as it gets worse.
      this.barkIn =
        SOUND.barkEvery * (1.4 - near * 0.9) * (0.7 + Math.random() * 0.6);
      this.bark(SOUND.barkFar + (SOUND.barkNear - SOUND.barkFar) * near);
    }
  }

  /**
   * A dog barking: two short yaps, a fifth apart.
   *
   * A bandpassed noise burst with a falling tone under it. Nothing here is
   * meant to be frightening — the plan asks for a wood that is friendly — so
   * they are pitched up, short and a bit silly.
   */
  private bark(level: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || level < 0.01) {
      return;
    }
    for (let i = 0; i < 2; i++) {
      const at = ctx.currentTime + i * 0.19;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const base = 260 * (i === 0 ? 1 : 0.82) * (0.9 + Math.random() * 0.25);
      osc.frequency.setValueAtTime(base * 1.8, at);
      osc.frequency.exponentialRampToValueAtTime(base * 0.7, at + 0.11);

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900;
      band.Q.value = 1.1;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

      osc.connect(band);
      band.connect(g);
      g.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    }
  }

  /** Running into something: a soft thump and a rustle, no crash. */
  thud(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    this.rustle(0.3, 1500, 0.11);
  }

  /** Feet leaving the ground, and feet landing in leaves. */
  hop(up: boolean): void {
    this.rustle(up ? 0.16 : 0.26, up ? 2400 : 1400, up ? 0.06 : 0.09);
  }

  /**
   * Safe: a little rising phrase as the hare goes into the burrow.
   *
   * Three notes rather than one, because the end of a run is the one moment in
   * the game that is worth more than a click.
   */
  safe(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((hz, i) => {
      const at = ctx.currentTime + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(hz, at);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.44);
    });
  }

  /** Caught: the same phrase the other way up, and gently. Nothing here is
   *  meant to sting. */
  caught(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(392, now);
    osc.frequency.exponentialRampToValueAtTime(147, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.62);
  }

  /** A short spray of filtered noise: leaves, one way or another. */
  private rustle(seconds: number, cutoff: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(cutoff, now);
    band.frequency.exponentialRampToValueAtTime(cutoff * 0.4, now + seconds);
    band.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(level, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source.connect(band);
    band.connect(g);
    g.connect(ctx.destination);
    source.start(now);
    source.stop(now + seconds + 0.02);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain) {
      this.gain.gain.value = muted ? 0 : SOUND.levelMin;
    }
  }

  /**
   * Everything off, for good.
   *
   * The gallery is a link away and the games in it are pages, not tabs: a page
   * left barking behind the one a child has moved on to is a bug the
   * caterpillar game had once already.
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
