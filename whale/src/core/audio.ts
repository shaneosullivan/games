import {SOUND} from "../config";

/**
 * The sea.
 *
 * Made rather than loaded, the same as the other games here: this one ships as
 * a single self-contained html file, and a minute of ambience as an mp3 would
 * be most of it. Underwater is a muffled sound, which is brown noise with the
 * top taken off it — the lowpass never opens, however fast the whale goes.
 *
 * Nothing is created until the player has touched the screen. A browser will
 * not start an audio context before a gesture, and asking it to only produces
 * a warning in the console.
 */
export class Ocean {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private muted = false;
  /** Follows the speed, lazily, so the swell swells rather than switches. */
  private level = 0;

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
    // Brown-ish noise: white noise leaned on by a running average, which is
    // what makes it sound like water moving rather than like a broken radio.
    let last = 0;
    for (let i = 0; i < frames; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + white * 0.08) / 1.02;
      data[i] = last * 3.4;
    }
    // The seam. A loop point in noise is a click, and a click every four
    // seconds is the only thing anybody would hear.
    const blend = Math.floor(ctx.sampleRate * 0.06);
    for (let i = 0; i < blend; i++) {
      const t = i / blend;
      data[i] = data[i] * t + data[frames - blend + i] * (1 - t);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = SOUND.cutoff;
    filter.Q.value = 0.5;

    this.gain = ctx.createGain();
    this.gain.gain.value = SOUND.gain;

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(filter);
    filter.connect(this.gain);
    this.gain.connect(ctx.destination);
    this.source.start();
  }

  /** `run` is 0 drifting and 1 flat out. */
  update(dt: number, run: number): void {
    this.level += (run - this.level) * Math.min(1, SOUND.rate * dt);
    if (!this.gain || this.muted) {
      return;
    }
    const t = Math.min(1, Math.max(0, this.level));
    this.gain.gain.value = SOUND.gain + t * (SOUND.gainFast - SOUND.gain);
  }

  /**
   * A swallowed fish: a short bubble of a note that falls away.
   *
   * Pitched a little higher each time within a mouthful — `step` is how many
   * fish have gone down in a row — so eating a whole school sounds like a run
   * up a scale rather than the same click fourteen times.
   */
  gulp(step: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const base = 260 * Math.pow(1.06, Math.min(11, step));
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.9, now + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * A breath at the surface: the blow out and the gasp in.
   *
   * Noise rather than a note, because that is what it is — a lungful of air
   * through a hole in the top of a head. Bandpassed and swept downward so it
   * reads as a spout rather than as static, and short enough that hanging
   * about at the surface is pleasant instead of noisy.
   */
  breath(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(1900, now);
    band.frequency.exponentialRampToValueAtTime(420, now + 0.34);
    band.Q.value = 0.9;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    source.connect(band);
    band.connect(g);
    g.connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.45);
  }

  /**
   * A ton of whale landing flat on the sea.
   *
   * The same noise the breath is made of, but the other way up: it starts low
   * and opens out, because a splash is a thump and then a long hiss of white
   * water, where a breath is a sharp puff that dies.
   */
  splash(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * 1.1);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + 0.12);
    filter.frequency.exponentialRampToValueAtTime(700, now + 0.9);
    filter.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.34, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1);

    source.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    source.start(now);
    source.stop(now + 1.05);
  }

  /** A mouthful of plastic: the same note, falling instead of rising. */
  oops(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain) {
      this.gain.gain.value = muted ? 0 : SOUND.gain;
    }
  }

  /**
   * Everything off, for good.
   *
   * The gallery is a link away and the games in it are pages, not tabs: a page
   * left running its own ocean behind the one a child has moved on to is a bug
   * the caterpillar game had once already.
   */
  stop(): void {
    this.source?.stop();
    this.source = null;
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
  }
}
