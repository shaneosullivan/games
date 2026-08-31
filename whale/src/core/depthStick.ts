import {DEPTH} from "../config";

/**
 * The depth slider, down the right-hand side.
 *
 * The bee game's altitude stick, turned upside down and given a sea to work
 * in: unlike the movement thumbstick it is persistent and absolute — where you
 * leave the knob is the depth you asked for, and it stays there. The whale
 * then rises or sinks toward it at SWIM.climbSpeed rather than snapping.
 *
 * Top of the track is the surface and the bottom is the sea floor, which is
 * the way round a child expects: up is up. A faint marker on the rail shows
 * where the whale actually is, so the gap between "I asked to go down" and
 * "I am going down" is visible while it closes — and over a sandbank, where
 * the floor stops the whale short of what the slider asked for, that gap is
 * the only thing that explains why.
 */
export class DepthStick {
  /** 0..1 down the track; 0 is the surface, 1 is DEPTH.maxDepth. */
  private value: number;

  private pointerId: number | null = null;
  private readonly rail: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly current: HTMLDivElement;
  private readonly root: HTMLDivElement;

  constructor(host: HTMLElement, startDepth: number) {
    this.value = this.to01(startDepth);

    this.root = document.createElement("div");
    this.root.className = "depth ui-interactive";

    const track = document.createElement("div");
    track.className = "depth-track";

    this.fill = document.createElement("div");
    this.fill.className = "depth-fill";
    track.appendChild(this.fill);

    this.rail = document.createElement("div");
    this.rail.className = "depth-rail";

    this.current = document.createElement("div");
    this.current.className = "depth-current";

    this.knob = document.createElement("div");
    this.knob.className = "depth-knob";

    this.rail.append(this.current, this.knob);
    this.root.append(
      track,
      this.rail,
      cap("depth-cap depth-cap-top", "☀"),
      cap("depth-cap depth-cap-bottom", "🪸"),
    );
    host.appendChild(this.root);

    this.root.addEventListener("pointerdown", this.onDown, {passive: false});
    window.addEventListener("pointermove", this.onMove, {passive: false});
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);

    this.draw();
  }

  /**
   * The depth the player is asking for, in units below the surface.
   *
   * Curved, not linear. The track has to reach the bottom of the abyss, and a
   * linear one over that range gives the whole ordinary reef a third of its
   * travel — see DEPTH.curve.
   */
  get desiredDepth(): number {
    const t = Math.pow(this.value, DEPTH.curve);
    return DEPTH.minDepth + t * (DEPTH.maxDepth - DEPTH.minDepth);
  }

  /** Where the whale actually is, for the ghost marker on the rail. */
  setActualDepth(depth: number): void {
    this.current.style.top = `${this.to01(depth) * 100}%`;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
  }

  /** The inverse of `desiredDepth`, for putting the marker where the whale
   *  actually is. */
  private to01(depth: number): number {
    const t = clamp01(
      (depth - DEPTH.minDepth) / (DEPTH.maxDepth - DEPTH.minDepth),
    );
    return Math.pow(t, 1 / DEPTH.curve);
  }

  private setFromClientY(clientY: number): void {
    const r = this.rail.getBoundingClientRect();
    if (r.height <= 0) {
      return;
    }
    this.value = clamp01((clientY - r.top) / r.height);
    this.draw();
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) {
      return;
    }
    e.preventDefault();
    // Kept off the thumbstick: without this, a thumb landing on the slider
    // would also plant the movement stick underneath it, and the whale would
    // set off in whatever direction the second thumb happened to drag.
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

  /** Q and E nudge the depth on a laptop, matching the thumbstick's WASD. */
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
    this.knob.style.top = `${pct}%`;
    this.fill.style.height = `${pct}%`;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function cap(className: string, text: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  d.textContent = text;
  return d;
}
