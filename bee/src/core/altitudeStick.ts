import { FLIGHT } from '../config';

/**
 * Vertical altitude control in the bottom-right corner. Unlike the movement
 * thumbstick this one is persistent and absolute: where you leave the knob is
 * the altitude you asked for, and it stays there. The bee then climbs or dives
 * toward it at `FLIGHT.climbSpeed` rather than snapping.
 *
 * A faint bar on the track shows the bee's *actual* altitude, so the gap
 * between "what I asked for" and "where I am" is visible while it travels.
 */
export class AltitudeStick {
  /** 0..1 along the track; 0 is `min`, 1 is `max`. */
  private value: number;

  /** Levels override the ceiling — the hive dome is lower than the treeline. */
  private min: number = FLIGHT.minHeight;
  private max: number = FLIGHT.maxHeight;

  private pointerId: number | null = null;
  private readonly rail: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly current: HTMLDivElement;
  private readonly keys = new Set<string>();

  constructor(host: HTMLElement, initialHeight: number) {
    this.value = this.to01(initialHeight);

    const root = document.createElement('div');
    root.className = 'alt ui-interactive';

    const track = document.createElement('div');
    track.className = 'alt-track';

    this.fill = document.createElement('div');
    this.fill.className = 'alt-fill';

    this.rail = document.createElement('div');
    this.rail.className = 'alt-rail';

    this.current = document.createElement('div');
    this.current.className = 'alt-current';

    this.knob = document.createElement('div');
    this.knob.className = 'alt-knob';

    this.rail.append(this.current, this.knob);
    track.append(this.fill);
    root.append(track, this.rail, label('alt-cap alt-cap-top', '▲'), label('alt-cap alt-cap-bottom', '▼'));
    host.appendChild(root);

    root.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);

    this.draw();
  }

  /** The altitude the player is asking for, in world units. */
  get desiredHeight(): number {
    return this.min + this.value * (this.max - this.min);
  }

  /**
   * Re-map the track to a level's altitude range, keeping the requested
   * height where possible so switching levels doesn't jerk the bee.
   */
  setRange(min: number, max: number, keepHeight?: number): void {
    const target = keepHeight ?? this.desiredHeight;
    this.min = min;
    this.max = max;
    this.value = this.to01(target);
    this.draw();
  }

  /** Move the knob to a specific altitude, e.g. when a level places the bee. */
  setHeight(h: number): void {
    this.value = this.to01(h);
    this.draw();
  }

  /** Called each frame with where the bee actually is, for the ghost marker. */
  setActualHeight(h: number): void {
    this.current.style.bottom = `${this.to01(h) * 100}%`;
  }

  private to01(h: number): number {
    return clamp01((h - this.min) / (this.max - this.min));
  }

  private setFromClientY(clientY: number): void {
    const r = this.rail.getBoundingClientRect();
    if (r.height <= 0) return;
    const t = (clientY - r.top) / r.height;
    this.value = clamp01(1 - t);
    this.draw();
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    this.pointerId = e.pointerId;
    this.knob.classList.add('active');
    this.setFromClientY(e.clientY);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.setFromClientY(e.clientY);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.knob.classList.remove('active');
  };

  /** Q / E nudge the target on a laptop, matching the thumbstick's WASD. */
  private onKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k !== 'q' && k !== 'e') return;
    if (e.type === 'keyup') {
      this.keys.delete(k);
      return;
    }
    this.keys.add(k);
    this.value = clamp01(this.value + (k === 'e' ? 0.06 : -0.06));
    this.draw();
  };

  private draw(): void {
    const pct = this.value * 100;
    this.knob.style.bottom = `${pct}%`;
    this.fill.style.height = `${pct}%`;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function label(className: string, text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  d.textContent = text;
  return d;
}
