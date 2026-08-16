/**
 * Up and down on the left, left and right on the bottom right — the Silent
 * Islands' whole control.
 *
 * The islands aren't flown, they're hopped: one press is one square, and there
 * is no such thing as pressing slightly wrong. That rules out the thumbstick,
 * which reads a whole circle of directions, and it rules out holding, which
 * would turn a board game into a flight.
 *
 * Split across two corners on purpose. Two hands hold an iPad, and up and down
 * are asked for far more often than left and right — so up and down go under
 * the left thumb where they can be found without looking, and the pair that
 * only steers goes under the right.
 */
export type Hop = "up" | "down" | "left" | "right";

export class HopButtons {
  /**
   * Presses waiting to be read, oldest first.
   *
   * A queue rather than a flag, because a hop takes a fifth of a second and a
   * child pressing twice quickly means both — dropping the second would feel
   * like the button failed. Capped, so leaning on the buttons can't bank a
   * dozen hops that then play out with nobody holding anything.
   */
  private readonly queue: Array<Hop> = [];
  private static readonly MAX_QUEUED = 2;

  /** Take the oldest press, if there is one. */
  take(): Hop | null {
    return this.queue.shift() ?? null;
  }

  clear(): void {
    this.queue.length = 0;
  }

  /** Press one from the console, bypassing the glass. */
  press(hop: Hop): void {
    this.push(hop);
  }

  private readonly root: HTMLDivElement;
  private readonly pads: Array<HTMLDivElement> = [];
  /**
   * When each button last fired, so the same tap can't count twice.
   *
   * Every one of these takes the press from pointer, touch *and* click,
   * because on an iPad any one of them can be the only one that arrives — see
   * the buttons on the map-drawing panel, which had presses go missing. A hop
   * is not idempotent the way choosing a tool is, so unlike those, this one
   * has to throw the duplicates away.
   */
  private readonly lastFired = new Map<Hop, number>();
  private static readonly DEDUPE_MS = 350;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hoppad-root hidden";

    const updown = document.createElement("div");
    updown.className = "hoppad hoppad-updown ui-interactive";
    updown.append(
      this.button("▲", "up", "Hop forward"),
      this.button("▼", "down", "Hop back"),
    );
    const leftright = document.createElement("div");
    leftright.className = "hoppad hoppad-leftright ui-interactive";
    leftright.append(
      this.button("◀", "left", "Hop left"),
      this.button("▶", "right", "Hop right"),
    );
    this.pads.push(updown, leftright);
    this.root.append(updown, leftright);
    host.appendChild(this.root);

    // The arrows and WASD, so it's playable at a laptop.
    window.addEventListener("keydown", e => {
      const hop = KEYS.get(e.key);
      if (!hop || e.repeat || typing(e)) {
        return;
      }
      e.preventDefault();
      this.push(hop);
    });
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    if (!visible) {
      this.clear();
    }
  }

  private push(hop: Hop): void {
    if (this.queue.length >= HopButtons.MAX_QUEUED) {
      return;
    }
    this.queue.push(hop);
  }

  private button(glyph: string, hop: Hop, label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hop-btn ui-interactive";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);

    const fire = (e: Event): void => {
      // A keyboard press arrives as a click with no coordinates behind it, and
      // is the one kind that never has a pointer or touch event of its own.
      const fromKeyboard = e.type === "click" && (e as MouseEvent).detail === 0;
      const now = performance.now();
      const last = this.lastFired.get(hop) ?? -Infinity;
      if (!fromKeyboard && now - last < HopButtons.DEDUPE_MS) {
        return;
      }
      this.lastFired.set(hop, now);
      e.preventDefault();
      b.classList.add("pressed");
      setTimeout(() => b.classList.remove("pressed"), 110);
      this.push(hop);
    };

    b.addEventListener("pointerdown", fire);
    b.addEventListener("touchstart", fire, {passive: false});
    b.addEventListener("click", fire);
    return b;
  }
}

const KEYS = new Map<string, Hop>([
  ["ArrowUp", "up"],
  ["Up", "up"],
  ["w", "up"],
  ["W", "up"],
  ["ArrowDown", "down"],
  ["Down", "down"],
  ["s", "down"],
  ["S", "down"],
  ["ArrowLeft", "left"],
  ["Left", "left"],
  ["a", "left"],
  ["A", "left"],
  ["ArrowRight", "right"],
  ["Right", "right"],
  ["d", "right"],
  ["D", "right"],
]);

/** Is this key going into a text field rather than into the game? */
function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable]");
}
