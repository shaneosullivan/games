import {STICK} from "../config";

/**
 * The controls, which are the penguin game's: a floating thumbstick.
 *
 * The base is planted wherever the finger lands rather than living in a fixed
 * corner, so a child never has to find a control before they can move, and the
 * car goes the way the stick is pushed.
 *
 * It was an *absolute* aim for a while — the car drove to wherever the finger
 * was on the screen — and that is a lovely control for pointing at a place and
 * a poor one for driving. Touching behind the car meant "go that way", so the
 * car braked, spun on the spot and drove back where it came from, and every
 * accidental touch on the wrong half of the glass was a U-turn. A stick has to
 * be *pushed* somewhere, which is the difference between asking for a
 * direction and brushing the screen.
 *
 * Screen axes straight into world axes: the shot in this game looks down at a
 * fixed angle and never turns, so the way the stick is pushed *is* the way on
 * the screen the car should go. Every other game in this repo has to read its
 * stick against a swinging camera; this one does not.
 *
 * Tracks a single pointerId, so a second finger on the glass can't steal the
 * stick out from under the first.
 *
 * WASD and the arrow keys work too, and they are **not** the same control. A
 * thumb on glass points at where the car should go; a hand on a keyboard has
 * one key for left and one for right, and expects them to mean left and right
 * *of the car* — which is a steering wheel, not a direction. So the keys give
 * a steer and a throttle instead of a vector, and the car reads whichever of
 * the two is being used.
 */
export class Joystick {
  /** -1..1 in screen axes. y is positive downward, i.e. "pull back". */
  x = 0;
  y = 0;
  /** 0..1. How hard the stick is over, which is the throttle. */
  magnitude = 0;

  /** Car-relative, for a keyboard: left and right of the nose, and forward or
   *  back. Both -1..1, and only meaningful while `onKeys` is true. */
  steer = 0;
  throttle = 0;

  /** The chequered flag takes the controls away, so the finish plays out. */
  enabled = true;

  /** Is the keyboard driving? A finger on the glass always wins. */
  get onKeys(): boolean {
    return this.pointerId === null && this.keys.size > 0;
  }

  private pointerId: number | null = null;
  /** Where the finger went down: the middle of the stick, in screen pixels. */
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
    // mid-press — would otherwise leave the car steering on its own.
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
      return;
    }

    e.preventDefault();
    this.pointerId = e.pointerId;
    this.baseX = e.clientX;
    this.baseY = e.clientY;
    this.root.style.transform = `translate(${this.baseX}px, ${this.baseY}px)`;
    this.root.classList.add("active");
    this.setKnob(0, 0);
    // Planted, not pushed: a finger down and still is a car coasting.
    this.x = this.y = this.magnitude = 0;
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    e.preventDefault();
    let dx = e.clientX - this.baseX;
    let dy = e.clientY - this.baseY;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK.radius) {
      dx = (dx / dist) * STICK.radius;
      dy = (dy / dist) * STICK.radius;
    }
    this.setKnob(dx, dy);

    let nx = dx / STICK.radius;
    let ny = dy / STICK.radius;
    const mag = Math.min(1, Math.hypot(nx, ny));
    if (mag < STICK.deadzone) {
      this.x = this.y = this.magnitude = 0;
      this.root.classList.remove("pulling");
      return;
    }
    // Rescaled past the deadzone, so the first pixel that responds still moves
    // you gently rather than jumping to a third of full deflection.
    const scaled = (mag - STICK.deadzone) / (1 - STICK.deadzone);
    nx = (nx / mag) * scaled;
    ny = (ny / mag) * scaled;
    this.x = nx;
    this.y = ny;
    this.magnitude = scaled;
    this.root.classList.add("pulling");
  };

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Lets go of the pointer. The stick has no memory of where it was. */
  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    this.pointerId = null;
    this.root.classList.remove("active");
    this.root.classList.remove("pulling");
    this.setKnob(0, 0);
    this.x = this.y = this.magnitude = 0;
  };

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
    this.root.classList.remove("pulling");
    this.setKnob(0, 0);
    this.x = this.y = this.magnitude = 0;
    this.steer = this.throttle = 0;
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
    // Left and right of the car's own nose, forward on the throttle and back
    // on the brake. Nothing here is in screen axes, which is the whole point.
    //
    // Left is the *positive* steer, which looks backwards and is not. The
    // heading turns from +Z toward +X, and the camera puts +Z down the screen
    // and +X to the right — so a rising heading swings the nose from six
    // o'clock to three o'clock, which is anticlockwise on the glass and a left
    // turn from the driver's seat.
    this.steer =
      (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0) -
      (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0);
    this.throttle =
      (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) -
      (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    // The stick's own reading goes to nothing, so nobody downstream can pick
    // up a vector left over from the last key that was pressed.
    this.x = this.y = this.magnitude = 0;
  };
}
