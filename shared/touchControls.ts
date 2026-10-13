/**
 * The hands: a thumbstick and a round button.
 *
 * Shared for the furniture reason the progress bar and the sound switch are
 * shared, and with the extra argument that these two have to match each
 * other: they are the same piece of glass under the same pair of thumbs, and
 * a stick in one game that looked or behaved differently from the stick in
 * the next would be a new control to learn rather than the one a child
 * already knows. They bring their own stylesheet, because the games have no
 * class names in common.
 *
 * The stick shows up two ways. `whenTouched` plants it wherever the thumb
 * lands and fades it out again, which is what a game with nothing else on
 * the glass wants. `always` draws it in the corner and leaves it there, so a
 * child can see what there is to press before they press it — but the thumb
 * still does not have to land on it: a drag anywhere in the stick's half of
 * the screen moves the knob, measured from wherever the thumb went down. A
 * visible stick you are also required to hit would be worse than an
 * invisible one.
 */

/** What a flight or walk model needs from a stick, without the stick. */
export interface StickInput {
  readonly x: number;
  readonly y: number;
  readonly magnitude: number;
}

export interface JoystickOptions {
  /** `whenTouched` plants it under the thumb; `always` keeps it in the
   *  corner. */
  shows?: "whenTouched" | "always";
  /** How far the knob travels before the axis reads 1, in screen pixels. */
  radius?: number;
  /** Which side of the screen the visible one sits on. */
  side?: "left" | "right";
}

/** How far the knob travels for a full push, and how much of the middle is
 *  nothing. A thumb resting on glass is never quite still. */
const RADIUS = 68;
const DEADZONE = 0.08;

export class Joystick {
  /** -1..1, screen axes. y is positive downward. */
  x = 0;
  y = 0;
  /** 0..1 */
  magnitude = 0;

  /** Games that stop being about moving switch this off so taps reach the
   *  world instead. */
  enabled = true;

  /**
   * Whether the stick will plant itself under a finger landing anywhere.
   *
   * Normally its own half of the screen owns it, so the other half is free
   * for a button and the world can be tapped. A level with nothing else on
   * the glass can widen that to everywhere — the bee's mountain does,
   * because there the same finger both moves her and fires.
   */
  anywhere = false;

  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;
  private readonly keys = new Set<string>();

  private readonly radius: number;
  private readonly always: boolean;
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(host: HTMLElement, options: JoystickOptions = {}) {
    style();
    this.radius = options.radius ?? RADIUS;
    this.always = options.shows === "always";

    this.root = document.createElement("div");
    this.root.className = this.always
      ? `stick stick-home stick-${options.side ?? "left"}`
      : "stick";
    const ring = document.createElement("div");
    ring.className = "stick-ring";
    this.knob = document.createElement("div");
    this.knob.className = "stick-knob";
    // Drawn the size it actually reads: the ring is exactly the distance
    // the knob can travel, so a knob against the edge of the ring means a
    // full push and not eighty per cent of one.
    size(ring, this.knob, this.radius);
    if (this.always) {
      // Pinned a ring's width in from the corner of whatever it was given,
      // which is the picture and not the window: the root is a point and
      // the ring is drawn around it, so the inset has to carry the radius
      // or half the stick hangs off the bottom of the glass.
      place(this.root, options.side ?? "left", this.radius);
    }
    this.root.append(ring, this.knob);
    host.appendChild(this.root);

    window.addEventListener("pointerdown", this.onDown, {passive: false});
    window.addEventListener("pointermove", this.onMove, {passive: false});
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
  }

  /** Hidden by levels that are not about moving at all. */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
  }

  private inZone(x: number, y: number): boolean {
    if (this.anywhere) {
      return true;
    }
    return x < window.innerWidth * 0.55 && y > window.innerHeight * 0.3;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) {
      return;
    }
    // Taps on a button belong to the button.
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
    if (!this.always) {
      // The floating one goes to the thumb. The fixed one stays where the
      // player can see it and only its knob moves.
      this.root.style.transform = `translate(${this.baseX}px, ${this.baseY}px)`;
    }
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
    if (dist > this.radius) {
      dx = (dx / dist) * this.radius;
      dy = (dy / dist) * this.radius;
    }
    this.setKnob(dx, dy);

    let nx = dx / this.radius;
    let ny = dy / this.radius;
    const mag = Math.min(1, Math.hypot(nx, ny));
    if (mag < DEADZONE) {
      this.x = this.y = this.magnitude = 0;
      return;
    }
    // Rescaled past the deadzone, so the first responsive pixel is still
    // gentle rather than a jump to eight per cent.
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
      // A thumb beats a keyboard: both at once is a laptop with a
      // touchscreen, and the thumb is the one that is being looked at.
      return;
    }
    const mag = Math.hypot(kx, ky);
    if (mag === 0) {
      this.x = this.y = this.magnitude = 0;
    } else {
      this.x = kx / mag;
      this.y = ky / mag;
      this.magnitude = 1;
    }
    // The knob shows the keys too, so the picture on screen is never a lie
    // about what the game thinks is being pressed.
    this.setKnob(this.x * this.radius, this.y * this.radius);
    this.root.classList.toggle("active", mag > 0);
  };
}

/**
 * Puts a control in a bottom corner of its host, clear of the rounded
 * corners of a tablet and of whatever the system has put along the edge.
 */
function place(
  root: HTMLDivElement,
  side: "left" | "right",
  radius: number,
): void {
  const inset = Math.round(radius * 0.42);
  root.style.bottom = `calc(${radius + inset}px + env(safe-area-inset-bottom))`;
  root.style[side] = `calc(${radius + inset}px + env(safe-area-inset-${side}))`;
}

/** Sizes a ring, and the knob inside it, from the stick's travel. */
function size(
  ring: HTMLDivElement,
  knob: HTMLDivElement | null,
  radius: number,
): void {
  ring.style.width = `${radius * 2}px`;
  ring.style.height = `${radius * 2}px`;
  ring.style.margin = `${-radius}px 0 0 ${-radius}px`;
  if (knob) {
    const k = Math.round(radius * 0.85);
    knob.style.width = `${k}px`;
    knob.style.height = `${k}px`;
    knob.style.margin = `${-k / 2}px 0 0 ${-k / 2}px`;
  }
}

export interface TouchButtonOptions {
  /** Which side of the screen it sits on. */
  side?: "left" | "right";
  /** How big it is, as the stick's radius is big: the pair should match. */
  radius?: number;
  /** What it says, if anything. The ring on its own is the look from the
   *  reference; a word is for a button whose job is not obvious. */
  label?: string;
  onPress: () => void;
}

/**
 * The round button that goes with the stick.
 *
 * The stick's ring without the knob in it, which is what makes the pair read
 * as one set of controls. It fires on pointerdown rather than on click: a
 * jump that waits for the finger to come up is a jump that happens after the
 * player meant it.
 */
export class TouchButton {
  readonly root: HTMLDivElement;

  constructor(host: HTMLElement, options: TouchButtonOptions) {
    style();
    this.root = document.createElement("div");
    const side = options.side ?? "right";
    const radius = options.radius ?? RADIUS;
    this.root.className = `tapper ui-interactive tapper-${side}`;
    const ring = document.createElement("div");
    ring.className = "stick-ring";
    size(ring, null, radius);
    place(this.root, side, radius);
    this.root.append(ring);
    if (options.label) {
      const word = document.createElement("div");
      word.className = "tapper-word";
      word.textContent = options.label;
      this.root.append(word);
    }
    host.appendChild(this.root);

    this.root.addEventListener(
      "pointerdown",
      e => {
        e.preventDefault();
        this.root.classList.add("pressed");
        options.onPress();
      },
      {passive: false},
    );
    const done = (): void => this.root.classList.remove("pressed");
    this.root.addEventListener("pointerup", done);
    this.root.addEventListener("pointercancel", done);
    this.root.addEventListener("pointerleave", done);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
  }
}

let styled = false;

/**
 * The stylesheet, injected once.
 *
 * A shared widget brings its own CSS in this repo, because the games have
 * separate hand-written stylesheets with no class names in common. The sizes
 * are in screen pixels rather than anything the game knows about: a thumb is
 * the same size on every device, which is the one measurement in these games
 * that must not scale with the picture.
 */
function style(): void {
  if (styled) {
    return;
  }
  styled = true;
  const sheet = document.createElement("style");
  sheet.textContent = `
.stick {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  opacity: 0;
  transition: opacity 130ms ease-out;
  pointer-events: none;
}
.stick.active {
  opacity: 1;
}
.stick-home {
  position: absolute;
  top: auto;
  left: auto;
  opacity: 0.72;
}
.stick-ring {
  position: absolute;
  width: 136px;
  height: 136px;
  margin: -68px 0 0 -68px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(2px);
}
.stick-knob {
  position: absolute;
  width: 58px;
  height: 58px;
  margin: -29px 0 0 -29px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
.tapper {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0.72;
  transition: opacity 90ms ease-out, transform 90ms ease-out;
  touch-action: none;
}
.tapper.pressed {
  opacity: 1;
  transform: scale(0.93);
}
.tapper-word {
  position: absolute;
  width: 136px;
  margin: -12px 0 0 -68px;
  text-align: center;
  font: 700 20px/1 system-ui, -apple-system, sans-serif;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
`;
  document.head.append(sheet);
}
