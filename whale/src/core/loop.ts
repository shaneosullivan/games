import {SIM} from "../config";

type UpdateFn = (dt: number) => void;
type RenderFn = (alpha: number, dt: number) => void;

/**
 * Fixed-timestep simulation with an interpolated render pass, so the swim
 * behaves identically on a 60Hz laptop and a 120Hz iPad.
 */
export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  /** Smoothed frames a second, for the console when something feels slow. */
  fps = 0;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) {
      return;
    }
    this.raf = requestAnimationFrame(this.tick);

    let frame = (now - this.last) / 1000;
    this.last = now;
    if (frame > SIM.maxFrame) {
      frame = SIM.maxFrame;
    }
    if (frame > 0) {
      this.fps += (1 / frame - this.fps) * 0.08;
    }

    this.accumulator += frame;
    // Capped so a long stall can't spiral into ever more catch-up steps.
    let steps = 0;
    while (this.accumulator >= SIM.step && steps < 8) {
      this.update(SIM.step);
      this.accumulator -= SIM.step;
      steps++;
    }

    this.render(this.accumulator / SIM.step, frame);
  };
}
