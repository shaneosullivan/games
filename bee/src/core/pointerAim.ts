/**
 * Where the finger is — the mountain's whole control.
 *
 * Level 9 has no buttons and no stick: the bee simply goes where the pointer
 * is. That means the level needs one thing this doesn't otherwise have, which
 * is the pointer's position on the canvas rather than the fact of a press.
 *
 * Reported in normalised device coordinates so it can be compared directly
 * against `ctx.projectToScreen` — the same frame, so the level can ask "where
 * on the mountain is that?" without knowing anything about pixels. Measured
 * against the canvas and not the window, because the canvas is not always the
 * window: level 4 gives the right-hand half of the screen to the puzzle.
 *
 * A mouse reports its position whenever it moves; a finger only while it is
 * down. So the last position is kept after a lift rather than cleared — she
 * holds her ground when the finger comes off instead of snapping to the middle
 * of the screen, which is what "let go" should mean on a touchscreen.
 */
export class PointerAim {
  /** -1..1 across and up the canvas; +1 is the top, as in three's NDC. */
  x = 0;
  y = 0;
  /** Has the pointer been seen at all since the level began? */
  active = false;
  /** Is something on the glass (or the mouse button down) right now? */
  down = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const track = (e: PointerEvent): void => {
      // The HUD's own buttons are not the mountain.
      if ((e.target as HTMLElement | null)?.closest?.(".ui-interactive")) {
        return;
      }
      // A touch that isn't down isn't anywhere; only a mouse hovers.
      if (e.pointerType !== "mouse" && !this.down) {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      this.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.active = true;
    };

    window.addEventListener(
      "pointerdown",
      e => {
        if ((e.target as HTMLElement | null)?.closest?.(".ui-interactive")) {
          return;
        }
        this.down = true;
        track(e);
      },
      {passive: true},
    );
    window.addEventListener("pointermove", track, {passive: true});
    for (const type of ["pointerup", "pointercancel"]) {
      window.addEventListener(type, () => {
        this.down = false;
      });
    }
    window.addEventListener("blur", () => {
      this.down = false;
    });
  }

  /**
   * Forget where the pointer was.
   *
   * Called when a level starts, so she isn't flung at wherever the finger
   * happened to be when the last one's card was tapped.
   */
  reset(): void {
    this.active = false;
    this.down = false;
    this.x = 0;
    this.y = 0;
  }
}

/**
 * How to tell this player to steer, in their own terms.
 *
 * The same question as `flapInstruction`: a child on an iPad is told about a
 * finger and someone at a laptop about the mouse, and being told about the
 * wrong one is worse than being told nothing.
 */
export function aimInstruction(): string {
  const touch =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return touch
    ? "Slide your finger — she follows it!"
    : "Move the mouse — she follows it!";
}
