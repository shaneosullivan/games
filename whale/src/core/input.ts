const RADIUS = 68;
const DEADZONE = 0.08;

/**
 * What the flight model actually needs from a stick. Lets a cutscene hand the
 * bee a neutral input without standing up a second Joystick (and a second set
 * of window listeners).
 */
export interface StickInput {
  readonly x: number;
  readonly y: number;
  readonly magnitude: number;
}

/**
 * Floating thumbstick. The base is planted wherever the finger lands in the
 * lower-left region rather than living in a fixed corner, so a child never has
 * to find a control before they can move. Tracks a single pointerId, so the
 * second thumb on the depth slider can't steal it.
 *
 * This is the bee game's stick, brought over whole: the plan asks for the
 * bee's controls by name, and a child who has played that game should not have
 * to learn anything to play this one.
 *
 * Also accepts WASD / arrow keys, purely so the game is testable on a laptop.
 */
export class Joystick {
  /** -1..1, screen axes. y is positive downward (i.e. "pull back"). */
  x = 0;
  y = 0;
  /** 0..1 */
  magnitude = 0;

  /** The intro and the two finish cards switch this off, so a tap on a button
   *  is a tap on a button and not a swim. */
  enabled = true;

  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;
  private readonly keys = new Set<string>();

  private readonly root: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "stick";
    this.ring = document.createElement("div");
    this.ring.className = "stick-ring";
    this.knob = document.createElement("div");
    this.knob.className = "stick-knob";
    this.root.append(this.ring, this.knob);
    host.appendChild(this.root);

    window.addEventListener("pointerdown", this.onDown, {passive: false});
    window.addEventListener("pointermove", this.onMove, {passive: false});
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  /**
   * Whether the stick will plant itself under a finger landing here.
   *
   * The lower-left region owns it, which leaves the right of the screen free
   * for the depth slider. Both thumbs are in use in this game, so the two
   * halves have to stay out of each other's way.
   */
  private inZone(x: number, y: number): boolean {
    return x < window.innerWidth * 0.55 && y > window.innerHeight * 0.3;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) {
      return;
    }
    // Ignore taps on HUD buttons.
    if ((e.target as HTMLElement)?.closest?.(".ui-interactive")) {
      return;
    }
    if (!this.inZone(e.clientX, e.clientY)) {
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
    // Rescale past the deadzone so the first responsive pixel is still gentle.
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

  private onKey = (e: KeyboardEvent): void => {
    const down = e.type === "keydown";
    const k = e.key.toLowerCase();
    if (!this.enabled) {
      return;
    }
    if (
      ![
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(k)
    ) {
      return;
    }
    if (down) {
      this.keys.add(k);
    } else {
      this.keys.delete(k);
    }

    const kx =
      (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
      (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const ky =
      (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) -
      (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0);

    if (this.pointerId !== null) {
      return;
    } // touch wins
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
