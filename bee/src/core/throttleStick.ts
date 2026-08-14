/**
 * Forward and back, as a vertical track on the left, for the maze.
 *
 * It looks like the altitude slider on the other side because it is the same
 * kind of thing: one axis, always in the same place, with the ends labelled.
 * The floating thumbstick it replaces plants itself wherever a thumb lands and
 * reads a whole circle of directions — which is exactly wrong here, where left
 * and right belong to the turn buttons and the only question the stick has to
 * answer is "forward, back, or neither".
 *
 * Unlike the altitude slider it springs back to the middle. Altitude is a place
 * you leave the knob; this is a throttle, and letting go has to mean stop.
 */
export class ThrottleStick {
  /** -1 full astern to +1 full ahead. */
  value = 0;

  private readonly root: HTMLDivElement;
  private readonly rail: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private pointerId: number | null = null;
  private readonly keys = new Set<string>();

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "throttle ui-interactive";
    this.root.style.display = "none";

    const track = document.createElement("div");
    track.className = "throttle-track";
    this.fill = document.createElement("div");
    this.fill.className = "throttle-fill";
    track.appendChild(this.fill);

    this.rail = document.createElement("div");
    this.rail.className = "throttle-rail";
    this.knob = document.createElement("div");
    this.knob.className = "throttle-knob";
    this.rail.appendChild(this.knob);

    this.root.append(
      track,
      this.rail,
      cap("throttle-cap throttle-cap-top", "▲"),
      cap("throttle-cap throttle-cap-bottom", "▼"),
    );
    host.appendChild(this.root);

    this.root.addEventListener("pointerdown", this.onDown, {passive: false});
    window.addEventListener("pointermove", this.onMove, {passive: false});
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);

    window.addEventListener("keydown", e => {
      if (KEYS.has(e.key)) {
        this.keys.add(e.key);
        this.sync();
      }
    });
    window.addEventListener("keyup", e => {
      this.keys.delete(e.key);
      this.sync();
    });

    this.draw();
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
    if (!visible) {
      this.pointerId = null;
      this.keys.clear();
      this.sync();
    }
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.root.setPointerCapture(e.pointerId);
    this.track(e);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) {
      e.preventDefault();
      this.track(e);
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) {
      return;
    }
    this.pointerId = null;
    this.sync();
  };

  /** Where along the rail the finger is, as -1..1 with up positive. */
  private track(e: PointerEvent): void {
    const box = this.rail.getBoundingClientRect();
    const t = (e.clientY - box.top) / Math.max(1, box.height);
    this.value = Math.max(-1, Math.min(1, 1 - t * 2));
    // A dead zone in the middle, so resting a thumb on the centre is a stop
    // rather than a crawl.
    if (Math.abs(this.value) < 0.12) {
      this.value = 0;
    }
    this.draw();
  }

  private sync(): void {
    if (this.pointerId !== null) {
      return;
    }
    let v = 0;
    if (this.keys.has("w") || this.keys.has("W") || this.keys.has("ArrowUp")) {
      v += 1;
    }
    if (
      this.keys.has("s") ||
      this.keys.has("S") ||
      this.keys.has("ArrowDown")
    ) {
      v -= 1;
    }
    this.value = v;
    this.draw();
  }

  private draw(): void {
    // 0 at the top of the rail, 1 at the bottom; the knob rides the value.
    const t = (1 - this.value) / 2;
    this.knob.style.top = `${t * 100}%`;
    // The fill grows from the middle toward whichever end is being asked for.
    const half = Math.abs(this.value) * 50;
    this.fill.style.top = this.value >= 0 ? `${50 - half}%` : "50%";
    this.fill.style.height = `${half}%`;
  }
}

const KEYS = new Set(["w", "W", "s", "S", "ArrowUp", "ArrowDown"]);

function cap(className: string, glyph: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = glyph;
  return el;
}
