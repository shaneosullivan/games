const RADIUS = 68;
const DEADZONE = 0.08;
/** How long a press can last, and how far it can move, and still be a tap. */
const TAP_TIME = 260;
const TAP_SLOP = 14;

/**
 * The controls the plan asks for: the caterpillar game's floating thumbstick,
 * and a tap on the left of the screen to jump.
 *
 * The stick is planted wherever the finger lands rather than living in a fixed
 * corner, so a child never has to find a control before they can move. It is
 * a throttle as well as a tiller here — see Hare — so holding it is running
 * and letting go is slowing down.
 *
 * The jump has to share the glass with it, and there are two ways in:
 *
 *  - a **second finger**, anywhere, while the stick is already held. That is
 *    the one that gets used, because a hare at full pelt is a hare with a
 *    thumb already on the stick;
 *  - a **tap on the left half** — pressed and let go quickly, without
 *    dragging. A drag on the left is still the stick, so nothing is lost.
 *
 * Neither costs the stick anything, which is the point: the plan says the hare
 * slows down when you are not touching the screen, and a jump that made you
 * let go would be a jump that slowed you down.
 */
export class Joystick {
  /** -1..1 in screen axes. y is positive downward, i.e. "pull back". */
  x = 0;
  y = 0;
  /** 0..1. Doubles as the throttle. */
  magnitude = 0;

  /** The finish takes the controls away, so the ending plays out. */
  enabled = true;

  /** Called when the player asks for a jump. Set by the game. */
  onJump: (() => void) | null = null;

  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;
  /** When and where the stick's own pointer went down, so a press that turns
   *  out to have been a tap can be told from one that turned out to be a drag. */
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private dragged = false;
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
    // mid-press — would otherwise leave the hare steering on its own.
    window.addEventListener("blur", this.release);
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) {
      return;
    }
    // Taps on a button belong to the button, not to the stick.
    if ((e.target as HTMLElement)?.closest?.(".ui-interactive")) {
      return;
    }
    if (this.pointerId !== null) {
      // A second finger while the stick is held is always a jump, wherever it
      // lands. This is the one a child actually uses at speed.
      e.preventDefault();
      this.onJump?.();
      return;
    }

    e.preventDefault();
    this.pointerId = e.pointerId;
    this.baseX = e.clientX;
    this.baseY = e.clientY;
    this.downAt = performance.now();
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.dragged = false;
    this.root.style.transform = `translate(${this.baseX}px, ${this.baseY}px)`;
    this.root.classList.add("active");
    this.setKnob(0, 0);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    e.preventDefault();
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > TAP_SLOP) {
      this.dragged = true;
    }
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
    // Pressed and let go on the left, without dragging: that was a tap, and a
    // tap on the left is a jump. A drag is the stick and always was.
    const quick = performance.now() - this.downAt < TAP_TIME;
    if (
      !this.dragged &&
      quick &&
      this.downX < window.innerWidth * 0.5 &&
      this.enabled
    ) {
      this.onJump?.();
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
    // Space jumps. Only on the way down, and only the first one — a held key
    // repeats, and a repeating jump key is a hare that never comes back to
    // earth.
    if (k === " " || k === "spacebar") {
      e.preventDefault();
      if (e.type === "keydown" && !e.repeat) {
        this.onJump?.();
      }
      return;
    }
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
