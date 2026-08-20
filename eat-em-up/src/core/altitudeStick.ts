import {ENDING} from "../config";

/**
 * The butterfly's altitude control, in the bottom-right corner. Taken from the
 * bee game, which uses the same one to fly.
 *
 * Unlike the movement thumbstick this one is persistent and absolute: where you
 * leave the knob is the height you asked for, and it stays there. The butterfly
 * then climbs or dives toward it rather than snapping, so the control feels
 * like asking rather than teleporting.
 *
 * A faint bar on the track shows where the butterfly actually is, so the gap
 * between what you asked for and where you are is visible while it travels.
 */
export class AltitudeStick {
  /** 0..1 along the track; 0 is `minHeight`, 1 is `maxHeight`. */
  private value: number;

  private pointerId: number | null = null;
  private readonly root: HTMLDivElement;
  private readonly rail: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly current: HTMLDivElement;

  constructor(host: HTMLElement, initialHeight: number) {
    this.value = this.to01(initialHeight);

    this.root = document.createElement("div");
    this.root.className = "alt ui-interactive hidden";

    const track = document.createElement("div");
    track.className = "alt-track";

    this.fill = document.createElement("div");
    this.fill.className = "alt-fill";

    this.rail = document.createElement("div");
    this.rail.className = "alt-rail";

    this.current = document.createElement("div");
    this.current.className = "alt-current";

    this.knob = document.createElement("div");
    this.knob.className = "alt-knob";

    this.rail.append(this.current, this.knob);
    track.append(this.fill);
    this.root.append(
      track,
      this.rail,
      label("alt-cap alt-cap-top", "▲"),
      label("alt-cap alt-cap-bottom", "▼"),
    );
    host.appendChild(this.root);

    this.root.addEventListener("pointerdown", this.onDown, {passive: false});
    window.addEventListener("pointermove", this.onMove, {passive: false});
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);

    this.draw();
  }

  /** The height the player is asking for, in world units. */
  get desiredHeight(): number {
    return (
      ENDING.minHeight + this.value * (ENDING.maxHeight - ENDING.minHeight)
    );
  }

  /** There is nothing to fly until the butterfly exists, so it stays hidden
   *  until then rather than sitting on screen doing nothing all game. */
  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** Called each frame with where the butterfly actually is, for the ghost. */
  setActualHeight(h: number): void {
    this.current.style.bottom = `${this.to01(h) * 100}%`;
  }

  private to01(h: number): number {
    return clamp01(
      (h - ENDING.minHeight) / (ENDING.maxHeight - ENDING.minHeight),
    );
  }

  private setFromClientY(clientY: number): void {
    const r = this.rail.getBoundingClientRect();
    if (r.height <= 0) {
      return;
    }
    this.value = clamp01(1 - (clientY - r.top) / r.height);
    this.draw();
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) {
      return;
    }
    e.preventDefault();
    // Stops the movement thumbstick planting itself under the same finger.
    e.stopPropagation();
    this.pointerId = e.pointerId;
    this.knob.classList.add("active");
    this.setFromClientY(e.clientY);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    e.preventDefault();
    this.setFromClientY(e.clientY);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    this.pointerId = null;
    this.knob.classList.remove("active");
  };

  /** Q and E nudge it on a laptop, the way WASD stands in for the thumbstick. */
  private onKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k !== "q" && k !== "e") {
      return;
    }
    this.value = clamp01(this.value + (k === "e" ? 0.06 : -0.06));
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
  const d = document.createElement("div");
  d.className = className;
  d.textContent = text;
  return d;
}
