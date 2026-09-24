import {SOUND} from "../config";

/**
 * The engines and the tyres.
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
 * The rivals have the same two sounds, quieter, and quieter again the further
 * away they are, and off to whichever side of you they are on. You hear a car
 * coming up behind before you see it, which is what a car behind is for.
 *
 * Nothing is created until the player has touched the screen. A browser will
 * not start an audio context before a gesture.
 */
export class Engine {
  private ctx: AudioContext | null = null;
  /** Everything goes through this, so the sound switch is one knob. */
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private me: Voice | null = null;
  private readonly others: Array<Voice> = [];
  private muted = false;
  /** The track's own music, looping, and the knob it comes through. The knob is
   *  its own rather than the master's so the music can be balanced against the
   *  engines without touching them — see `SOUND.music`. */
  private tune: AudioBufferSourceNode | null = null;
  private tuneGain: GainNode | null = null;

  /**
   * Call from a real gesture — the button that starts the race, or the first
   * touch on the glass.
   *
   * Called again later it wakes a context the browser suspended, which is not
   * an edge case: a child who joined a race by scanning a code never pressed
   * anything, so the context they got was made outside a gesture and is asleep
   * until they touch the screen.
   */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    if (this.muted) {
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
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    // The tyres' noise, made once and shared: a loop of it per car costs a
    // few bytes of node, and two seconds of samples per car would not.
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
    this.noise = buffer;
    this.me = new Voice(ctx, this.master, buffer, 1, SOUND.tone);
  }

  /** `speed` in units a second, `slip` how fast it is going sideways. */
  update(dt: number, speed: number, slip: number, top: number): void {
    this.me?.update(dt, speed, slip, top, SOUND.level, SOUND.skidLevel, 0);
  }

  /**
   * The other cars, heard from where the player is.
   *
   * `dx` and `dz` are how far each is from the player's car, in world units.
   * The shot looks straight down and never turns, so world x *is* left and
   * right on the screen, which is all the panning needs to know.
   */
  hear(
    dt: number,
    cars: ReadonlyArray<{speed: number; slip: number; dx: number; dz: number}>,
    top: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) {
      return;
    }
    cars.forEach((car, i) => {
      // A slightly different engine each, or three cars at the same speed are
      // one loud car with a beat in it.
      this.others[i] ??= new Voice(
        ctx,
        this.master!,
        this.noise!,
        SOUND.rivalPitch[i % SOUND.rivalPitch.length],
        SOUND.rivalTone,
      );
      const far = Math.hypot(car.dx, car.dz) / SOUND.hearFrom;
      const near = SOUND.rivals / (1 + far * far);
      const pan = Math.max(-1, Math.min(1, car.dx / (SOUND.hearFrom * 2)));
      this.others[i].update(
        dt,
        car.speed,
        car.slip,
        top,
        SOUND.level * near,
        SOUND.skidLevel * near,
        pan,
      );
    });
  }

  /** A crunch off the barrier: a short burst of low noise. */
  bump(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) {
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
    g.connect(this.master);
    source.start(now);
    source.stop(now + 0.26);
  }

  /**
   * The music for this track, from the bytes the loader fetched.
   *
   * Decoded here rather than where it was fetched, because decoding wants an
   * audio context and there is no context until somebody has touched the
   * screen. Looped by the audio clock rather than by an `<audio>` element on
   * purpose: an encoded file carries a few milliseconds of silence at each end,
   * and a gap that size every time a two-minute loop comes round is the sort of
   * thing nobody can name and everybody notices.
   *
   * It comes up over `SOUND.musicFade` rather than starting at full: a race
   * begins with a countdown, and music that arrives all at once on "three"
   * lands like a switch being thrown.
   */
  async play(bytes: ArrayBuffer | null): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.master || !bytes || this.tune) {
      return;
    }
    let audio: AudioBuffer;
    try {
      audio = await ctx.decodeAudioData(bytes);
    } catch {
      // Something this browser cannot play. Quieter than it should be, and
      // still a race.
      return;
    }
    // Gone again while it was decoding — a child who left before the flag.
    if (!this.ctx || !this.master) {
      return;
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      SOUND.music,
      ctx.currentTime + SOUND.musicFade,
    );
    gain.connect(this.master);
    const source = ctx.createBufferSource();
    source.buffer = audio;
    source.loop = true;
    // Round again the moment the music ends rather than a hole later; see
    // `SOUND.musicLookBack`.
    source.loopEnd = lastSound(audio);
    source.connect(gain);
    source.start();
    this.tune = source;
    this.tuneGain = gain;
  }

  /**
   * Everything down, gently: the chequered flag.
   *
   * Crossing the line is the end of the racing, so it is the end of the music —
   * it goes out over `SOUND.musicFade` and the player is stopped for good
   * rather than left looping silently behind the finish card.
   *
   * The engines go with it. Not with `setMuted`, which is the child's own
   * switch: using that here would leave the sound button showing the game muted
   * when nobody had muted it, and the next race would open silent.
   */
  fade(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) {
      return;
    }
    const now = ctx.currentTime;
    const done = now + SOUND.musicFade;
    for (const knob of [this.master.gain, this.tuneGain?.gain]) {
      if (!knob) {
        continue;
      }
      knob.cancelScheduledValues(now);
      knob.setValueAtTime(knob.value, now);
      knob.linearRampToValueAtTime(0, done);
    }
    const tune = this.tune;
    this.tune = null;
    try {
      tune?.stop(done);
    } catch {
      // Already stopped, which is the same outcome by a different road.
    }
  }

  /**
   * One of the lights on the grid: `beat` 0, 1, 2, then 3 for "go".
   *
   * Three the same and then one that is higher and longer, which is what a
   * countdown sounds like — and by the fourth a child is already pushing the
   * stick, so the last one is the only one that has to be unmistakable.
   */
  light(beat: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) {
      return;
    }
    const go = beat >= 3;
    const at = ctx.currentTime;
    const hz = go ? SOUND.goHz : SOUND.beepHz;
    const held = go ? SOUND.goFor : SOUND.beepFor;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(hz, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(SOUND.beepLevel, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + held);
    osc.connect(g);
    g.connect(this.master);
    osc.start(at);
    osc.stop(at + held + 0.02);

    if (!go) {
      return;
    }
    // And the blip of throttle everybody gives it as the flag drops. A swept
    // sawtooth under the note, which is the same thing the engines are made
    // of, so it sits in the same sound rather than beside it.
    const rev = ctx.createOscillator();
    rev.type = "sawtooth";
    rev.frequency.setValueAtTime(SOUND.idleHz, at);
    rev.frequency.exponentialRampToValueAtTime(SOUND.fullHz * 0.8, at + 0.3);
    const tame = ctx.createBiquadFilter();
    tame.type = "lowpass";
    tame.frequency.value = SOUND.tone;
    const revGain = ctx.createGain();
    revGain.gain.setValueAtTime(0.0001, at);
    revGain.gain.exponentialRampToValueAtTime(SOUND.goRev, at + 0.06);
    revGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    rev.connect(tame);
    tame.connect(revGain);
    revGain.connect(this.master);
    rev.start(at);
    rev.stop(at + 0.47);
  }

  /** The chequered flag: three notes going up. */
  flag(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) {
      return;
    }
    // Straight to the speakers rather than through the master, which is
    // turned down for the finish the moment this has been played.
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
    if (this.master) {
      this.master.gain.value = muted ? 0 : 1;
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
    try {
      this.tune?.stop();
    } catch {
      // A source that was never started throws; nothing to do about it and
      // nothing that matters.
    }
    this.tune = null;
    this.tuneGain?.disconnect();
    this.tuneGain = null;
    this.me?.stop();
    for (const voice of this.others) {
      voice.stop();
    }
    this.me = null;
    this.others.length = 0;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }
}

/**
 * Where the music actually stops, as opposed to where the file does.
 *
 * Only the last second is looked at, and only the first channel: this is
 * hunting for an encoder's padding, which is a few milliseconds of digital
 * silence on the end, not for a fade-out somebody wrote.
 */
function lastSound(audio: AudioBuffer): number {
  const ch = audio.getChannelData(0);
  const from = Math.max(
    0,
    ch.length - Math.floor(SOUND.musicLookBack * audio.sampleRate),
  );
  for (let i = ch.length - 1; i >= from; i--) {
    if (Math.abs(ch[i]) >= SOUND.musicQuiet) {
      return (i + 1) / audio.sampleRate;
    }
  }
  return audio.duration;
}

/** One car's worth of sound: an engine, its tyres, and where it is. */
class Voice {
  private readonly osc: OscillatorNode;
  private readonly engineGain: GainNode;
  private readonly skid: AudioBufferSourceNode;
  private readonly skidGain: GainNode;
  private readonly panner: StereoPannerNode | null;
  /** Follows the speed lazily, so a kerb is not a gear change. */
  private revs = 0;

  constructor(
    ctx: AudioContext,
    out: AudioNode,
    noise: AudioBuffer,
    private readonly pitch: number,
    tone: number,
  ) {
    // Panned where the browser can; an older Safari without a stereo panner
    // simply hears the rivals from the middle.
    this.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const into = this.panner ?? out;
    this.panner?.connect(out);

    // The engine. A sawtooth through a gentle lowpass: raw, it is a wasp.
    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = SOUND.idleHz * pitch;
    const tame = ctx.createBiquadFilter();
    tame.type = "lowpass";
    tame.frequency.value = tone;
    tame.Q.value = 0.6;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.osc.connect(tame);
    tame.connect(this.engineGain);
    this.engineGain.connect(into);
    this.osc.start();

    // The tyres: noise, held at silence until something slides.
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = SOUND.skidCutoff;
    band.Q.value = 0.8;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skid = ctx.createBufferSource();
    this.skid.buffer = noise;
    this.skid.loop = true;
    // Each from a different point in the loop, so two cars sliding at once
    // are two hisses and not one hiss twice as loud.
    this.skid.connect(band);
    band.connect(this.skidGain);
    this.skidGain.connect(into);
    this.skid.start(0, Math.random() * noise.duration);
  }

  update(
    dt: number,
    speed: number,
    slip: number,
    top: number,
    level: number,
    skidLevel: number,
    pan: number,
  ): void {
    const want = Math.min(1, Math.max(0, speed / top));
    this.revs += (want - this.revs) * Math.min(1, SOUND.follow * dt);
    this.osc.frequency.value =
      (SOUND.idleHz + this.revs * (SOUND.fullHz - SOUND.idleHz)) * this.pitch;
    this.engineGain.gain.value = level;
    // Straight from the slip rather than eased: a skid starts and stops
    // sharply and the noise should do the same, or it sounds like it is
    // catching up with what the car did a moment ago.
    const howSideways = Math.min(1, slip / 60);
    this.skidGain.gain.value = skidLevel * howSideways;
    if (this.panner) {
      this.panner.pan.value = pan;
    }
  }

  stop(): void {
    this.osc.stop();
    this.skid.stop();
  }
}
