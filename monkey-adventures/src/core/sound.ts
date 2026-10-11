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
   * A banana.
   *
   * Two notes a fifth apart, the second a little shorter than the first:
   * up, which is the shape of every "you got it" noise ever made, and over
   * in a sixth of a second so that taking three bananas in one swing is
   * three sounds rather than a chord.
   */
  banana(): void {
    this.blip(760, 0.07, "triangle", 0);
    this.blip(1140, 0.1, "triangle", 0.06);
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
