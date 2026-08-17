/**
 * Up and down on the left, left and right on the bottom right — the Silent
 * Islands' whole control.
 *
 * The islands aren't flown, they're hopped: one press is one square, and there
 * is no such thing as pressing slightly wrong. That rules out the thumbstick,
 * which reads a whole circle of directions, and it rules out holding, which
 * would turn a board game into a flight.
 *
 * Split across two corners on purpose. Two hands hold an iPad, and the way
 * along the board is asked for far more often than sideways — so it goes under
 * the left thumb and the pair that only steers goes under the right.
 *
 * The left is one button rather than two, and it is the reason for the split.
 * A thumb reaching for the top half of a pair without looking finds the bottom
 * half about as often, and on this board that is a hop the wrong way into a
 * stream. There is only ever one way she is trying to go — out with a baby, or
 * back for the next — so the button is that way, and the level says which by
 * calling `setForward`. It cannot be missed and it cannot be misread.
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
  /** The big one on the left, and whichever way it is currently pointing. */
  private forward!: HTMLButtonElement;
  private forwardHop: Hop = "up";
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
    this.forward = this.button("▲", "up", "Hop forward");
    this.forward.classList.add("hop-btn-big");
    updown.append(this.forward);
    const leftright = document.createElement("div");
    leftright.className = "hoppad hoppad-leftright ui-interactive";
    leftright.append(
      this.button("◀", "left", "Hop left"),
      this.button("▶", "right", "Hop right"),
    );
    this.pads.push(updown, leftright);
    this.root.append(updown, leftright);
    host.appendChild(this.root);

    // Nothing queued survives the window going away, for the same reason the
    // maze's turn buttons let go of their keys: presses made in one place
    // should not arrive somewhere else.
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.clear();
      }
    });

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

  /**
   * Point the big button the way she needs to go.
   *
   * Called every frame by the level; only touches the DOM when the direction
   * actually changes, which is twice a crossing.
   */
  setForward(hop: "up" | "down"): void {
    if (hop === this.forwardHop) {
      return;
    }
    this.forwardHop = hop;
    this.forward.textContent = hop === "up" ? "▲" : "▼";
    this.forward.setAttribute(
      "aria-label",
      hop === "up" ? "Hop forward" : "Hop back",
    );
    // A direction that changed under a thumb that was already pressing should
    // not fire the old one; and a queued hop the other way is now wrong.
    this.clear();
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
    const isForward = hop === "up";
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
      this.push(isForward ? this.forwardHop : hop);
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
