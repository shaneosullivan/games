import {SOUND} from "../config";

/**
 * The engine and the tyres.
 *
 * Made rather than loaded, the same as the other games here: this one ships as
 * a single self-contained html file and a minute of engine as an mp3 would be
 * most of it.
 *
 * An engine is a sawtooth whose pitch rides on the speed — that really is most
 * of what one is — and the tyres are filtered noise that only comes in when
 * the car is actually sliding. Which means the noise the game makes is a
 * readout of how you are driving: the pitch is how fast, and the hiss is how
 * sideways.
 *
 * Nothing is created until the player has touched the screen. A browser will
 * not start an audio context before a gesture.
 */
export class Engine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private skidSource: AudioBufferSourceNode | null = null;
  private skidGain: GainNode | null = null;
  private muted = false;
  /** Follows the speed lazily, so a kerb is not a gear change. */
  private revs = 0;

  /** Call from a real gesture — the button that starts the race. */
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

    // The engine. A sawtooth through a gentle lowpass: raw, it is a wasp.
    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = SOUND.idleHz;
    const tame = ctx.createBiquadFilter();
    tame.type = "lowpass";
    tame.frequency.value = 900;
    tame.Q.value = 0.6;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = SOUND.level;
    this.osc.connect(tame);
    tame.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.osc.start();

    // The tyres: a loop of noise, held at silence until something slides.
    const frames = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    // The seam. A loop point in noise is a click, and a click every two
    // seconds is the only thing anybody would hear.
    const blend = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < blend; i++) {
      const t = i / blend;
      data[i] = data[i] * t + data[frames - blend + i] * (1 - t);
    }
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = SOUND.skidCutoff;
    band.Q.value = 0.8;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSource = ctx.createBufferSource();
    this.skidSource.buffer = buffer;
    this.skidSource.loop = true;
    this.skidSource.connect(band);
    band.connect(this.skidGain);
    this.skidGain.connect(ctx.destination);
    this.skidSource.start();
  }

  /** `speed` in units a second, `slip` how fast it is going sideways. */
  update(dt: number, speed: number, slip: number, top: number): void {
    const want = Math.min(1, Math.max(0, speed / top));
    this.revs += (want - this.revs) * Math.min(1, SOUND.follow * dt);
    if (this.muted) {
      return;
    }
    if (this.osc) {
      this.osc.frequency.value =
        SOUND.idleHz + this.revs * (SOUND.fullHz - SOUND.idleHz);
    }
    if (this.skidGain) {
      // Straight from the slip rather than eased: a skid starts and stops
      // sharply and the noise should do the same, or it sounds like it is
      // catching up with what the car did a moment ago.
      const howSideways = Math.min(1, slip / 60);
      this.skidGain.gain.value = SOUND.skidLevel * howSideways;
    }
  }

  /** A crunch off the barrier: a short burst of low noise. */
  bump(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(700, now);
    low.frequency.exponentialRampToValueAtTime(160, now + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    source.connect(low);
    low.connect(g);
    g.connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.26);
  }

  /** The chequered flag: three notes going up. */
  flag(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    [523.25, 659.25, 880].forEach((hz, i) => {
      const at = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(hz, at);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.42);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain) {
      this.engineGain.gain.value = muted ? 0 : SOUND.level;
    }
    if (muted && this.skidGain) {
      this.skidGain.gain.value = 0;
    }
  }

  /**
   * Everything off, for good.
   *
   * The gallery is a link away and the games in it are pages, not tabs: a page
   * left revving behind the one a child has moved on to is a bug the
   * caterpillar game had once already.
   */
  stop(): void {
    this.osc?.stop();
    this.skidSource?.stop();
    this.osc = null;
    this.skidSource = null;
    void this.ctx?.close();
    this.ctx = null;
    this.engineGain = null;
    this.skidGain = null;
  }
}
