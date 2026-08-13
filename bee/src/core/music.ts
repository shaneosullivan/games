/**
 * A tiny step sequencer for the dance-mat level.
 *
 * There are no audio files anywhere in this game, so the "MIDI track" is a
 * synthesised loop: kick, clap, hats, a bouncing bass and a pentatonic melody.
 * Pentatonic means every note fits over every other, so the tune can wander
 * without ever sounding wrong.
 *
 * Notes are scheduled a little ahead of the clock (WebAudio needs that to stay
 * jitter-free), but the game reads `beats` straight off the audio clock rather
 * than accumulating frame deltas — that's what keeps the pads on the beat.
 */

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.25;

/** C major pentatonic, two octaves. */
const SCALE = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0, 880.0,
];

/** A cheerful 16-step melody, as indices into SCALE; -1 is a rest. */
const MELODY = [0, 2, 4, 2, 5, 4, 2, -1, 3, 5, 7, 5, 4, 2, 0, -1];
const BASS = [0, -1, 3, -1, 4, -1, 3, -1];

export class Music {
  private startTime = 0;
  private nextStep = 0;
  private timer = 0;
  private running = false;
  private readonly gain: GainNode;

  /** Sixteenth notes per beat's worth of sequencing resolution. */
  private readonly stepsPerBeat = 2; // eighth notes

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly bpm: number,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.34;
    this.gain.connect(destination);
  }

  get secondsPerBeat(): number {
    return 60 / this.bpm;
  }

  /** Musical position, in beats since `start()`. Negative before the downbeat. */
  get beats(): number {
    if (!this.running) {
      return 0;
    }
    return (this.ctx.currentTime - this.startTime) / this.secondsPerBeat;
  }

  /** AudioContext time of a given beat, for scheduling visuals against audio. */
  timeOfBeat(beat: number): number {
    return this.startTime + beat * this.secondsPerBeat;
  }

  /**
   * Declare that *now* is `beat`, sliding the whole track to match.
   *
   * The audio clock keeps running when the simulation doesn't — a paused menu,
   * a backgrounded tab — so on resume musical time would have leapt ahead and
   * the caller would find a dozen prompts already expired. Re-anchoring here
   * costs nothing musically (the loop just continues from where it is) and
   * keeps the game and the track together.
   */
  rebase(beat: number): void {
    if (!this.running) {
      return;
    }
    this.startTime = this.ctx.currentTime - beat * this.secondsPerBeat;
    // Drop any steps we've skipped past so the scheduler doesn't try to
    // catch up by firing them all at once.
    this.nextStep = Math.max(
      this.nextStep,
      Math.floor(beat * this.stepsPerBeat),
    );
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    // A beat of air before the downbeat, so nothing is clipped by the resume.
    this.startTime = this.ctx.currentTime + 0.15;
    this.nextStep = 0;
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS);
    this.schedule();
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    clearInterval(this.timer);
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  /** Queue every step that falls inside the lookahead window. */
  private schedule(): void {
    if (!this.running) {
      return;
    }
    const stepSeconds = this.secondsPerBeat / this.stepsPerBeat;
    while (
      this.startTime + this.nextStep * stepSeconds <
      this.ctx.currentTime + SCHEDULE_AHEAD
    ) {
      this.playStep(
        this.nextStep,
        this.startTime + this.nextStep * stepSeconds,
      );
      this.nextStep++;
    }
  }

  private playStep(step: number, at: number): void {
    const beat = Math.floor(step / this.stepsPerBeat);
    const onBeat = step % this.stepsPerBeat === 0;
    const barBeat = beat % 4;

    if (onBeat && (barBeat === 0 || barBeat === 2)) {
      this.kick(at);
    }
    if (onBeat && barBeat === 2) {
      this.clap(at);
    }
    this.hat(at, onBeat ? 0.05 : 0.03);

    if (onBeat) {
      const note = BASS[beat % BASS.length];
      if (note >= 0) {
        this.tone(SCALE[note] / 2, at, 0.28, 0.16, "triangle");
      }
    }

    const melodyNote = MELODY[step % MELODY.length];
    if (melodyNote >= 0) {
      this.tone(SCALE[melodyNote + 2], at, 0.22, 0.1, "square");
    }
  }

  // ---- instruments --------------------------------------------------------

  private tone(
    freq: number,
    at: number,
    duration: number,
    peak: number,
    type: OscillatorType,
  ): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(env).connect(this.gain);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private kick(at: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.11);
    env.gain.setValueAtTime(0.5, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    osc.connect(env).connect(this.gain);
    osc.start(at);
    osc.stop(at + 0.26);
  }

  private clap(at: number): void {
    const noise = this.noise(0.14);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1600;
    filter.Q.value = 1.2;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.28, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    noise.connect(filter).connect(env).connect(this.gain);
    noise.start(at);
  }

  private hat(at: number, peak: number): void {
    const noise = this.noise(0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(peak, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    noise.connect(filter).connect(env).connect(this.gain);
    noise.start(at);
  }

  private noise(seconds: number): AudioBufferSourceNode {
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
