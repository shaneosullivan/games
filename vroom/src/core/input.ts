import {AIM} from "../config";

/**
 * The controls the plan asks for by name: the caterpillar game's floating
 * thumbstick.
 *
 * The car drives to wherever the finger is. Touch a point on the road and it
 * goes there; slide the finger about and it follows.
 *
 * It used to be a *relative* stick — planted where the finger landed, steered
 * by dragging away from that point — and that had a hole in it: a child who
 * touched the screen and held still saw nothing happen at all, because until
 * the finger moves a relative stick has no direction in it. Pointing at a
 * place is what a child does anyway.
 *
 * Here it is a tiller and a throttle at once, and it needs no camera-relative
 * arithmetic at all — the shot in this game looks straight down and never
 * turns, so the way you push the stick *is* the way on the screen you want the
 * car to go. Every other game in this repo has to read the stick against a
 * swinging camera; this one is the direction, full stop.
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
  /** Where the finger is, and where the car is, both in screen pixels. */
  private atX = 0;
  private atY = 0;
  private carX = 0;
  private carY = 0;
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
    this.atX = e.clientX;
    this.atY = e.clientY;
    this.root.classList.add("active");
    this.aim();
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    e.preventDefault();
    this.atX = e.clientX;
    this.atY = e.clientY;
    this.aim();
  };

  /**
   * Where the car is on the screen, so a touch can be measured against it.
   *
   * Pushed in every frame by whoever is drawing the car — the stick has no way
   * of knowing on its own, and the answer moves.
   */
  follow(x: number, y: number): void {
    this.carX = x;
    this.carY = y;
    if (this.pointerId !== null) {
      this.aim();
    }
  }

  /**
   * The direction and the throttle, from where the finger is relative to the
   * car.
   *
   * Screen straight into world: the camera never turns, so screen right is
   * world +X and screen down is world +Z, and there is nothing to convert.
   */
  private aim(): void {
    const dx = this.atX - this.carX;
    const dy = this.atY - this.carY;
    const d = Math.hypot(dx, dy);
    if (d < AIM.near) {
      // On the car. No direction in it, and a good place to coast.
      this.magnitude = 0;
      this.x = this.y = 0;
      this.ring(this.atX, this.atY, false);
      return;
    }
    this.x = dx / d;
    this.y = dy / d;
    this.magnitude = Math.max(
      AIM.least,
      Math.min(1, (d - AIM.near) / (AIM.far - AIM.near)),
    );
    this.ring(this.atX, this.atY, true);
  }

  /** The marker under the finger: where the car is being sent. */
  private ring(x: number, y: number, pulling: boolean): void {
    this.root.style.transform = `translate(${x}px, ${y}px)`;
    this.root.classList.toggle("pulling", pulling);
  }

  /** Lets go of the pointer. The stick has no memory of where it was. */
  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    this.pointerId = null;
    this.root.classList.remove("active");
    this.root.classList.remove("pulling");
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
