/**
 * The noises, made rather than loaded.
 *
 * Nothing here is a file. A banana is two short notes of a triangle wave and
 * a splash is filtered noise, which is a few lines each and costs the
 * download nothing — the same argument the other games in this repo make for
 * building their models in code instead of shipping them.
 *
 * Everything is built on the first touch and not before. A browser will not
 * let a page make a noise until somebody has touched it, and a game that
 * sets up its audio on load spends the whole race with a context that is
 * suspended and silent.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private muted = false;
  /** The rain loop, once there is one, and whether it should be playing —
   *  which can be asked for before the page has been touched and there is
   *  anything to play it with. */
  private raining: GainNode | null = null;
  private wantsRain = false;

  /** Called from the first touch or key, when a browser will allow it. */
  wake(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as {webkitAudioContext?: typeof AudioContext})
        .webkitAudioContext;
    if (!Ctor) {
      return;
    }
    this.ctx = new Ctor();
    this.out = this.ctx.createGain();
    // Quiet. This is a game a child plays beside somebody else, and a
    // collect noise at full scale is the kind of thing that gets a game
    // turned off rather than turned down.
    this.out.gain.value = 0.22;
    this.out.connect(this.ctx.destination);
    if (this.wantsRain) {
      // Asked for while the page was still silent; now it can happen.
      this.rain(true);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.out && this.ctx) {
      this.out.gain.setTargetAtTime(
        muted ? 0 : 0.22,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  /**
   * A banana: a munch.
   *
   * Two bites rather than two notes. A bite is a short burst of noise
   * squeezed through a band that falls as it goes — which is what a crunch
   * is, physically: a lot of frequencies at once, the high ones dying
   * first. A little note under it gives the mouth a size; without it the
   * bites are a rustle rather than a monkey.
   *
   * Over in a fifth of a second, so three bananas in one swing are three
   * munches and not a mouthful.
   */
  banana(): void {
    // Loud for a bite, because a band this narrow throws most of the noise
    // away: measured against the splash, these levels land in the same
    // place the old two-note version did.
    this.bite(0, 1500, 2.6);
    this.bite(0.11, 1100, 2.2);
    this.blip(190, 0.09, "triangle", 0.02, 0.35);
  }

  /** One bite: noise through a band that falls away as it decays. */
  private bite(after: number, from: number, level: number): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.muted) {
      return;
    }
    const at = ctx.currentTime + after;
    const seconds = 0.09;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Noise that dies quickly, and dies faster than it starts: a bite is
      // a snap and then a crumble, not a hiss.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 1.6;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    // Narrow enough to have a pitch to it, wide enough to stay a crunch.
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(from * 0.35, at + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band);
    band.connect(gain);
    gain.connect(out);
    source.start(at);
  }

  /** The splash, for the lake: noise through a falling filter, which is
   *  about as close to water as two oscillators get. */
  splash(): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Noise that fades, so it lands and dies rather than hissing.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.3);
    source.connect(filter);
    filter.connect(out);
    source.start(now);
  }

  /**
   * A coconut landing in mud.
   *
   * Two things at once, which is what a thud is: a low note that falls as
   * it dies, for the weight of the thing, and a short burst of noise with
   * all the top taken off it, for the mud it lands in. The noise is what
   * makes it wet — the same thud without it is a drum, and with the
   * filter opened up it is a coconut landing on stone.
   *
   * Nothing rings. Mud does not ring.
   */
  thud(): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.muted) {
      return;
    }
    const now = ctx.currentTime;
    // The weight: a low note sliding lower, over before it is a pitch.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.13);
    // Measured against the splash: at 1.6 it peaked at three times it,
    // which is a boulder and not a coconut.
    gain.gain.setValueAtTime(0.78, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.18);

    // The mud: noise with everything above a few hundred hertz gone, so
    // it lands with a splat rather than a crack.
    const seconds = 0.14;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.setValueAtTime(760, now);
    soft.frequency.exponentialRampToValueAtTime(180, now + seconds);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    source.connect(soft);
    soft.connect(wet);
    wet.connect(out);
    source.start(now);
  }

  /**
   * The rain, on or off.
   *
   * A two-second loop of noise with a few hundred little drops cut into
   * it, played quietly under everything — that is what pitter-patter is:
   * not a hiss, but a great many small taps too close together to count.
   * Built once and left running, because starting and stopping a buffer
   * for every drop would be a thousand nodes a minute.
   *
   * Asked for before the audio exists (the page has not been touched
   * yet), it remembers and starts itself when the audio wakes up.
   */
  rain(on: boolean): void {
    this.wantsRain = on;
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) {
      return;
    }
    if (!this.raining) {
      const seconds = 2;
      const length = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Six hundred drops in two seconds, each a few milliseconds of
      // noise that dies at once. Thin on their own and rain together.
      for (let i = 0; i < 600; i++) {
        const at = Math.floor(Math.random() * (length - 400));
        const tall = 0.25 + Math.random() * 0.75;
        const over = 80 + Math.floor(Math.random() * 260);
        for (let k = 0; k < over; k++) {
          data[at + k] +=
            (Math.random() * 2 - 1) * tall * (1 - k / over) ** 2.5;
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // A band rather than the lot: the bottom is thunder and the very
      // top is static, and rain on leaves is neither.
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2400;
      band.Q.value = 0.6;
      this.raining = ctx.createGain();
      this.raining.gain.value = 0;
      source.connect(band);
      band.connect(this.raining);
      this.raining.connect(out);
      source.start();
    }
    // Faded rather than switched: rain that starts at full volume on the
    // frame a level loads sounds like a tap being turned on.
    // Quiet: this one never stops, and anything that never stops has to
    // sit well under the things that do. About half the splash.
    this.raining.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.25);
  }

  /** The crocodile's jaws coming together: a short, dry knock. */
  chomp(): void {
    this.blip(150, 0.06, "square", 0, 0.5);
  }

  /** One note. */
  private blip(
    hz: number,
    seconds: number,
    shape: OscillatorType,
    after: number,
    level = 1,
  ): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.muted) {
      return;
    }
    const at = ctx.currentTime + after;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(hz, at);
    // A quick rise and a soft fall. Starting a note at full level clicks,
    // and a click is the one sound a small speaker makes loudest.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }
}
