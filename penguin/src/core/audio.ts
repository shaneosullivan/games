import chomp1 from "../assets/chomp1.m4a";
import chomp2 from "../assets/chomp2.m4a";
import ow1 from "../assets/ow1.m4a";
import ow2 from "../assets/ow2.m4a";
import ow3 from "../assets/ow3.m4a";
import ow4 from "../assets/ow4.m4a";
import ow5 from "../assets/ow5.m4a";
import {SOUND} from "../config";

/**
 * The mountain.
 *
 * Made rather than loaded, the same as the other games here: this one ships as
 * a single self-contained html file, and a minute of wind as an mp3 would be
 * most of it.
 *
 * The bed is white noise through a lowpass, and both the volume and the cutoff
 * ride on how fast the penguin is going. That pair is the whole trick — snow
 * under a belly at walking pace is a low rumble and at fifty is a hiss, and
 * moving the cutoff is what turns one into the other. Volume alone just gets
 * louder, which sounds like someone turning a knob rather than like speed.
 *
 * Nothing is created until the player has touched the screen. A browser will
 * not start an audio context before a gesture, and asking it to only produces
 * a warning in the console.
 */
export class Wind {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private muted = false;
  /** Follows the speed, lazily, so the wind rises rather than switches. */
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

  /** `speed` in units a second; SOUND.fullSpeed is the top of the range. */
  update(dt: number, speed: number): void {
    const want = Math.min(1, Math.max(0, speed / SOUND.fullSpeed));
    this.level += (want - this.level) * Math.min(1, SOUND.follow * dt);
    if (this.muted || !this.gain || !this.filter) {
      return;
    }
    this.gain.gain.value =
      SOUND.levelMin + this.level * (SOUND.levelMax - SOUND.levelMin);
    // Squared, so the top half of the speed range is where most of the
    // brightening happens — which is where it is actually felt.
    const bright = this.level * this.level;
    this.filter.frequency.value =
      SOUND.cutoffMin + bright * (SOUND.cutoffMax - SOUND.cutoffMin);
  }

  /**
   * Snow going up: what a snowman sounds like coming apart.
   *
   * A puff and nothing else. Hitting a snowman does not hurt — you go straight
   * through it — so it does not get one of the "ow" clips; see Bumps, which is
   * for the trees.
   */
  poof(): void {
    this.puff(0.35, 900, 0.16);
  }

  /** Landing a jump: the same puff without the note under it. */
  land(): void {
    this.puff(0.3, 1400, 0.12);
  }

  /**
   * Going in at the bottom: a thump and then a long hiss of white water.
   *
   * The lowpass opens fast and closes slowly, which is the shape of a splash —
   * all the high frequencies are in the first tenth of a second, and what is
   * left is foam.
   */
  splash(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const source = this.noise(1.1);
    if (!source) {
      return;
    }
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

  /** A short spray of filtered noise: snow thrown up, one way or another. */
  private puff(seconds: number, cutoff: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const source = this.noise(seconds);
    if (!source) {
      return;
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.35, now + seconds);
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(level, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    source.start(now);
    source.stop(now + seconds + 0.02);
  }

  private noise(seconds: number): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx) {
      return null;
    }
    const frames = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
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
   * left running its own weather behind the one a child has moved on to is a
   * bug the caterpillar game had once already.
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

/**
 * A handful of recordings, one picked at random.
 *
 * Everything else in this game makes its own noise out of oscillators and
 * filtered noise; these are the exception, and they earn it — a real voice
 * going "ow" is funnier than anything an oscillator can do, and the whole
 * point of hitting a tree in this game is that it is funny rather than
 * punishing.
 *
 * `Audio` elements rather than the WebAudio graph, the same as the caterpillar
 * game's bites: nothing here has to be mixed, positioned or timed against
 * anything else, and an element decodes and plays on its own.
 */
export class Clips {
  private readonly voices: Array<Array<HTMLAudioElement>> = [];
  /** Which was used last, so the same one never comes round twice running. */
  private last = -1;
  /** Which copy of each clip to use next. See SOUND.bumpVoices. */
  private readonly next: Array<number> = [];
  private muted = false;

  constructor(urls: ReadonlyArray<string>, volume: number, copies: number) {
    for (const url of urls) {
      const voices: Array<HTMLAudioElement> = [];
      for (let i = 0; i < copies; i++) {
        const voice = new Audio(url);
        voice.volume = volume;
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
   * Picking freely means the same clip comes up twice in a row one time in
   * however many there are, and two identical noises a tenth of a second apart
   * do not sound random, they sound broken. Choosing among the others is what
   * actually feels like chance. With only two clips that makes it strict
   * alternation, which for a trail of fish taken in quick succession is
   * exactly what you want anyway.
   *
   * `pitch` plays it faster and higher; see the streak in Game.collect.
   */
  play(pitch = 1): void {
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
    voice.playbackRate = pitch;
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

  /** Everything off on the way out, the same as the wind. */
  stop(): void {
    this.setMuted(true);
  }
}

/** The five "ow" clips, for hitting a tree or a rock. */
export function bumpClips(): Clips {
  return new Clips(
    [ow1, ow2, ow3, ow4, ow5],
    SOUND.bumpVolume,
    SOUND.bumpVoices,
  );
}

/** The two chomps, for a fish going down. */
export function chompClips(): Clips {
  return new Clips([chomp1, chomp2], SOUND.chompVolume, SOUND.chompVoices);
}
