const RADIUS = 68;
const DEADZONE = 0.08;

/**
 * The floating thumbstick, which the plan asks for by name: "the same controls
 * as eat em up".
 *
 * It is the bee game's stick by way of the caterpillar's — the base is planted
 * wherever the finger lands rather than living in a fixed corner, so a child
 * never has to find a control before they can move. Brought over without the
 * docked mode, which only existed there to pair with an altitude slider; this
 * game has one control and nothing to line it up with.
 *
 * Tracks a single pointerId, so a second finger on the glass can't steal the
 * stick out from under the first. WASD and the arrow keys work too, purely so
 * the game can be driven on a laptop while it is being built.
 */
export class Joystick {
  /** -1..1 in screen axes. y is positive downward, i.e. "pull back". */
  x = 0;
  y = 0;
  /** 0..1 */
  magnitude = 0;

  /** The finish takes the controls away, so the splash plays out. */
  enabled = true;

  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;
  private readonly keys = new Set<string>();

  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "stick";
    const ring = document.createElement("div");
    ring.className = "stick-ring";
    this.knob = document.createElement("div");
    this.knob.className = "stick-knob";
    this.root.append(ring, this.knob);
    host.appendChild(this.root);

    window.addEventListener("pointerdown", this.onDown, {passive: false});
    window.addEventListener("pointermove", this.onMove, {passive: false});
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    // A keydown whose keyup never arrives — because focus moved elsewhere
    // mid-press — would otherwise leave the penguin steering on its own.
    window.addEventListener("blur", this.release);
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) {
      return;
    }
    // Taps on a button belong to the button, not to the stick.
    if ((e.target as HTMLElement)?.closest?.(".ui-interactive")) {
      return;
    }
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.baseX = e.clientX;
    this.baseY = e.clientY;
    this.root.style.transform = `translate(${this.baseX}px, ${this.baseY}px)`;
    this.root.classList.add("active");
    this.setKnob(0, 0);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    e.preventDefault();
    let dx = e.clientX - this.baseX;
    let dy = e.clientY - this.baseY;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    this.setKnob(dx, dy);

    let nx = dx / RADIUS;
    let ny = dy / RADIUS;
    const mag = Math.min(1, Math.hypot(nx, ny));
    if (mag < DEADZONE) {
      this.x = this.y = this.magnitude = 0;
      return;
    }
    // Rescaled past the deadzone, so the first pixel that responds still moves
    // you gently rather than jumping to a third of full deflection.
    const scaled = (mag - DEADZONE) / (1 - DEADZONE);
    nx = (nx / mag) * scaled;
    ny = (ny / mag) * scaled;
    this.x = nx;
    this.y = ny;
    this.magnitude = scaled;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    this.pointerId = null;
    this.root.classList.remove("active");
    this.setKnob(0, 0);
    this.x = this.y = this.magnitude = 0;
  };

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /**
   * Drops every held input. Used by the finish when it takes the controls
   * away, and on losing focus with a key still down.
   *
   * An arrow property rather than a method, because it is handed straight to
   * addEventListener and would otherwise lose its `this`.
   */
  release = (): void => {
    this.pointerId = null;
    this.keys.clear();
    this.root.classList.remove("active");
    this.setKnob(0, 0);
    this.x = this.y = this.magnitude = 0;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.enabled) {
      return;
    }
    const k = e.key.toLowerCase();
    const known = [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ];
    if (!known.includes(k)) {
      return;
    }
    e.preventDefault();
    if (e.type === "keydown") {
      this.keys.add(k);
    } else {
      this.keys.delete(k);
    }

    // A finger already on the glass wins; the keys are the fallback.
    if (this.pointerId !== null) {
      return;
    }
    const kx =
      (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
      (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const ky =
      (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) -
      (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0);
    const mag = Math.hypot(kx, ky);
    if (mag === 0) {
      this.x = this.y = this.magnitude = 0;
    } else {
      this.x = kx / mag;
      this.y = ky / mag;
      this.magnitude = 1;
    }
  };
}
