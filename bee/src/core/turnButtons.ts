/**
 * Turn left / turn right, bottom right, for the maze.
 *
 * The maze doesn't fly like the rest of the game: the corridors are narrow
 * enough that "the direction the stick points" stops meaning anything once the
 * camera is part-way round a corner, so the bee turns on the spot instead. Two
 * buttons say that far more plainly than an axis does — you hold one and she
 * rotates, and there is no way to hold it slightly wrong.
 *
 * It takes the altitude slider's corner. Nothing in the maze needs altitude:
 * she flies at one height under the canopy the whole way.
 */
export class TurnButtons {
  /** -1 turning left, +1 turning right, 0 when nothing is held. */
  turn = 0;

  private readonly root: HTMLDivElement;
  /** Which button each active pointer is on, so two thumbs can't fight. */
  private readonly held = new Map<number, number>();
  private readonly keys = new Set<string>();

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "turnpad ui-interactive hidden";

    this.root.append(
      this.button("◀", -1, "Turn left"),
      this.button("▶", 1, "Turn right"),
    );
    host.appendChild(this.root);

    window.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        this.keys.add(e.key);
        this.sync();
      }
    });
    window.addEventListener("keyup", e => {
      this.keys.delete(e.key);
      this.sync();
    });
    // A pointer released anywhere — dragged off the button, or off the screen
    // entirely — has to stop the turn, or she spins forever. On window rather
    // than on the button, so it arrives whether or not the press was captured.
    for (const type of ["pointerup", "pointercancel"]) {
      window.addEventListener(type, e => {
        this.held.delete((e as PointerEvent).pointerId);
        this.sync();
      });
    }
    // Belt and braces for iOS, where a captured pointer's `pointerup` can go
    // missing: when the last finger leaves the glass, nothing is held.
    for (const type of ["touchend", "touchcancel"]) {
      window.addEventListener(type, e => {
        if ((e as TouchEvent).touches.length === 0) {
          this.held.clear();
          this.sync();
        }
      });
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    if (!visible) {
      this.held.clear();
      this.sync();
    }
  }

  private button(glyph: string, dir: number, label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "turn-btn ui-interactive";
    b.type = "button";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    b.addEventListener(
      "pointerdown",
      e => {
        e.preventDefault();
        // Register the press *first*. Capture is a nicety — it keeps the turn
        // going if a thumb slides off the button — and `setPointerCapture`
        // throws NotFoundError whenever the pointer isn't one the element can
        // claim. Doing it before this line meant any such throw killed the
        // handler on its way past and the button did nothing at all, which is
        // the worst way for a control to fail.
        this.held.set(e.pointerId, dir);
        this.sync();
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          // Without capture the window-level pointerup below still ends it.
        }
      },
      {passive: false},
    );
    return b;
  }

  /** Both held cancel out, which is the least surprising thing to do. */
  private sync(): void {
    let turn = 0;
    for (const dir of this.held.values()) {
      turn += dir;
    }
    if (this.keys.has("ArrowLeft")) {
      turn -= 1;
    }
    if (this.keys.has("ArrowRight")) {
      turn += 1;
    }
    this.turn = Math.max(-1, Math.min(1, turn));
  }
}
