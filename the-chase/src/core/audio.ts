import squeak1 from "../assets/haresqueak1.m4a";
import squeak2 from "../assets/haresqueak2.m4a";
import squeak3 from "../assets/haresqueak3.m4a";
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
/**
 * The sounds of the chase.
 *
 * Made rather than loaded, the same as the other games here: this one ships as
 * a single self-contained html file, and a minute of woodland as an mp3 would
 * be most of it.
 *
 * There is no background at all. A rush of leaves used to run under the whole
 * game with its volume and brightness riding on the hare's speed, and it went:
 * the only continuous sound in a game gets listened past inside a minute, and
 * after that it is just something a child's parent can hear from the next
 * room. Everything left in here *means* something — a bark, a bump, a squeak,
 * and the four notes that say you are home.
 *
 * Nothing is created until the player has touched the screen. A browser will
 * not start an audio context before a gesture, and asking it to only produces
 * a warning in the console.
 */
export class Woodland {
  private ctx: AudioContext | null = null;
  private muted = false;
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
    if (Ctor) {
      this.ctx = new Ctor();
    }
  }

  /**
   * `gap` is how far off the nearest dog is.
   *
   * The barking is here rather than in the game because it is a *reading* of
   * the gap, not an event: the dogs spend most of the run behind the camera,
   * so how loud and how often they bark is the main way a child knows how they
   * are doing.
   */
  update(dt: number, gap: number): void {
    this.barkIn -= dt;
    if (this.barkIn > 0) {
      return;
    }
    const near = Math.min(
      1,
      Math.max(0, 1 - (gap - SOUND.barkFrom) / (SOUND.barkTo - SOUND.barkFrom)),
    );
    // Closer dogs bark more often as well as louder, so the run gets busier as
    // it gets worse.
    this.barkIn =
      SOUND.barkEvery * (1.4 - near * 0.9) * (0.7 + Math.random() * 0.6);
    this.bark(SOUND.barkFar + (SOUND.barkNear - SOUND.barkFar) * near);
  }

  /**
   * A dog barking: two woofs, a fifth apart.
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
      const at = ctx.currentTime + i * 0.23;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      // Low, and it drops rather than squeaks.
      //
      // It was a yip: two hundred and sixty hertz through a bandpass at nine
      // hundred, which is all edge and no chest — a very small dog a very long
      // way off. A hundred and forty through a lowpass at five hundred has a
      // body to it, and the slower fall and longer tail are what turn a yip
      // into a woof.
      const base = 140 * (i === 0 ? 1 : 0.86) * (0.92 + Math.random() * 0.2);
      osc.frequency.setValueAtTime(base * 1.5, at);
      osc.frequency.exponentialRampToValueAtTime(base * 0.72, at + 0.17);

      // A second voice a fifth below, which is most of what makes it sound
      // like a chest rather than a whistle.
      const growl = ctx.createOscillator();
      growl.type = "triangle";
      growl.frequency.setValueAtTime(base * 0.66, at);
      growl.frequency.exponentialRampToValueAtTime(base * 0.42, at + 0.19);

      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(1100, at);
      low.frequency.exponentialRampToValueAtTime(360, at + 0.2);
      low.Q.value = 0.7;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);

      osc.connect(low);
      growl.connect(low);
      low.connect(g);
      g.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.28);
      growl.start(at);
      growl.stop(at + 0.28);
    }
  }

  /**
   * The bush it went into.
   *
   * Only the leaves now: the squeak itself is a recording, played by the game
   * alongside this. It was an oscillator, which was a fair impression of a
   * small animal and no match at all for a real one.
   */
  leaves(): void {
    this.rustle(0.26, 1600, SOUND.rustle);
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
  }

  /**
   * Everything off, for good.
   *
   * The gallery is a link away and the games in it are pages, not tabs: a page
   * left barking behind the one a child has moved on to is a bug the
   * caterpillar game had once already.
   */
  stop(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}

/**
 * The squeaks.
 *
 * Three recordings, one picked at random every time the hare runs into
 * something. `Audio` elements rather than the WebAudio graph, the same as the
 * caterpillar game's bites and the penguin's: nothing here has to be mixed,
 * positioned or timed against anything else, and an element decodes and plays
 * on its own.
 */
export class Squeaks {
  private readonly voices: Array<Array<HTMLAudioElement>> = [];
  /** Which was used last, so the same one never comes round twice running. */
  private last = -1;
  /** Which copy of each clip to use next. See SOUND.squeakVoices. */
  private readonly next: Array<number> = [];
  private muted = false;

  constructor() {
    for (const url of [squeak1, squeak2, squeak3]) {
      const voices: Array<HTMLAudioElement> = [];
      for (let i = 0; i < SOUND.squeakVoices; i++) {
        const voice = new Audio(url);
        voice.volume = SOUND.squeak;
        voice.preload = "auto";
        voices.push(voice);
      }
      this.voices.push(voices);
      this.next.push(0);
    }
  }

  /**
   * One of them, at random — but never the one that just played.
   *
   * Picking freely from three means the same clip comes up twice in a row one
   * time in three, and two identical squeaks a second apart do not sound
   * random, they sound broken.
   */
  play(): void {
    if (this.muted || this.voices.length === 0) {
      return;
    }
    let pick = Math.floor(Math.random() * this.voices.length);
    if (pick === this.last && this.voices.length > 1) {
      pick =
        (pick + 1 + Math.floor(Math.random() * (this.voices.length - 1))) %
        this.voices.length;
    }
    this.last = pick;

    const voices = this.voices[pick];
    const voice = voices[this.next[pick]];
    this.next[pick] = (this.next[pick] + 1) % voices.length;
    voice.currentTime = 0;
    // A play() the browser refuses — no gesture yet, or the element is still
    // loading — rejects a promise, and an unhandled rejection is a red line in
    // the console for something nobody needs to know about.
    void voice.play().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) {
      return;
    }
    for (const voices of this.voices) {
      for (const voice of voices) {
        voice.pause();
        voice.currentTime = 0;
      }
    }
  }

  /** Everything off on the way out, the same as the wood. */
  stop(): void {
    this.setMuted(true);
  }
}
