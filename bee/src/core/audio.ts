/**
 * Tiny WebAudio synth — no asset files, no loading. iOS requires the context
 * to be created/resumed inside a user gesture, which is what the codename
 * screen's Start button is for.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private threatOsc: OscillatorNode | null = null;
  private threatGain: GainNode | null = null;
  muted = false;

  /** Must be called from inside a touch/click handler. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startHum();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** Wing hum, its pitch and volume driven by flight speed (0..1). */
  private startHum(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 90;
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    this.humOsc = osc;
    this.humGain = gain;
  }

  /**
   * Menace drone for the wasp: a detuned growl well below the wing hum that
   * swells as it closes in. `t` is 0 (far/absent) to 1 (right on top of you).
   */
  setThreat(t: number): void {
    if (!this.ctx || !this.master) return;
    if (!this.threatOsc) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = 'square';
      osc.frequency.value = 52;
      osc.detune.value = 18;
      filter.type = 'lowpass';
      filter.frequency.value = 210;
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.threatOsc = osc;
      this.threatGain = gain;
    }
    const now = this.ctx.currentTime;
    this.threatOsc.frequency.setTargetAtTime(48 + t * 34, now, 0.15);
    this.threatGain!.gain.setTargetAtTime(t * 0.09, now, 0.2);
  }

  /** Nasty little zap when the wasp connects. */
  sting(): void {
    this.blip(220, 0, 0.18, 0.3, 'square');
    this.blip(140, 0.05, 0.3, 0.24, 'sawtooth');
  }

  setFlightIntensity(t: number): void {
    if (!this.ctx || !this.humOsc || !this.humGain) return;
    const now = this.ctx.currentTime;
    this.humOsc.frequency.setTargetAtTime(88 + t * 46, now, 0.08);
    this.humGain.gain.setTargetAtTime(0.035 + t * 0.05, now, 0.12);
  }

  private blip(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'triangle'): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Rising chime; `step` climbs with a collection streak for a satisfying ladder. */
  collect(step: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const f = scale[Math.min(step, scale.length - 1)];
    this.blip(f, 0, 0.22, 0.28);
    this.blip(f * 2, 0.02, 0.14, 0.1, 'sine');
  }

  quotaComplete(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.blip(f, i * 0.09, 0.42, 0.26));
  }

  levelComplete(): void {
    [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      this.blip(f, i * 0.11, 0.6, 0.28),
    );
  }
}
