/**
 * "Hold the screen and she climbs" — the Bear's Lair's only control.
 *
 * Bound to the window rather than to a control of its own, deliberately. The
 * whole screen is the button, so there is nothing to lay out, nothing to
 * anchor to an edge, and nothing that can end up in the strip of the app that
 * runs past the visible viewport — which is exactly how the maze's turn
 * buttons became untappable on an iPad. Pointer and touch both, for the same
 * reason the maze takes both.
 *
 * Presses on the HUD are ignored, so the home and mute buttons still work.
 */
export class HoldInput {
  /** True while anything at all is held down on the screen. */
  held = false;

  /**
   * Presses that have begun and not yet been read.
   *
   * Counted rather than derived from `held`, because a flap is a press and not
   * a state: a quick tap can start and finish inside one frame, and a level
   * that only looked at `held` once a step would never see it. That tap is the
   * one the player meant most.
   */
  private pending = 0;

  /** Take one press, if there is one waiting. */
  takePress(): boolean {
    if (this.pending === 0) {
      return false;
    }
    this.pending = 0;
    return true;
  }

  /**
   * Live presses, keyed the way the maze's buttons key theirs: "p12" for a
   * pointer, "t0" for a touch. The same finger can arrive down both paths and
   * their ids are numbered independently, so one finger may hold two keys —
   * harmless, since all that is asked is whether the set is empty.
   */
  private readonly down = new Set<string>();
  private readonly keys = new Set<string>();

  constructor() {
    const onUi = (e: Event): boolean =>
      !!(e.target as HTMLElement | null)?.closest?.(".ui-interactive");

    window.addEventListener(
      "pointerdown",
      e => {
        if (onUi(e)) {
          return;
        }
        this.down.add(`p${e.pointerId}`);
        this.pending++;
        this.sync();
      },
      {passive: true},
    );
    for (const type of ["pointerup", "pointercancel"]) {
      window.addEventListener(type, e => {
        this.down.delete(`p${(e as PointerEvent).pointerId}`);
        this.sync();
      });
    }

    window.addEventListener(
      "touchstart",
      e => {
        if (onUi(e)) {
          return;
        }
        for (const t of Array.from(e.changedTouches)) {
          this.down.add(`t${t.identifier}`);
        }
        this.pending++;
        this.sync();
      },
      {passive: true},
    );
    for (const type of ["touchend", "touchcancel"]) {
      window.addEventListener(type, e => {
        const touch = e as TouchEvent;
        for (const t of Array.from(touch.changedTouches)) {
          this.down.delete(`t${t.identifier}`);
        }
        // Nothing on the glass means nothing held, whatever the ids said.
        if (touch.touches.length === 0) {
          this.down.clear();
        }
        this.sync();
      });
    }

    // Space, up and W, so it's playable on a laptop: each one is a flap,
    // exactly like a tap.
    window.addEventListener("keydown", e => {
      if (!HOLD_KEYS.has(e.key) || typing(e)) {
        return;
      }
      // Held off the game, this would stop the codename field taking a space
      // or the letter w — the keys a flap wants are also keys a name wants.
      e.preventDefault();
      // `keydown` repeats while a key is held; a flap is one press.
      if (!e.repeat && !this.keys.has(e.key)) {
        this.pending++;
      }
      this.keys.add(e.key);
      this.sync();
    });
    window.addEventListener("keyup", e => {
      this.keys.delete(e.key);
      this.sync();
    });

    // A press that ends while the tab is in the background never reports it.
    window.addEventListener("blur", () => {
      this.down.clear();
      this.keys.clear();
      this.sync();
    });
  }

  /** Let go of everything — for a level ending mid-press. */
  release(): void {
    this.down.clear();
    this.keys.clear();
    this.pending = 0;
    this.sync();
  }

  private sync(): void {
    this.held = this.down.size > 0 || this.keys.size > 0;
  }
}

/**
 * How to tell this player to flap, in their own terms.
 *
 * A child on an iPad is told to tap and someone at a laptop is told about the
 * space bar; being told about the wrong one is worse than being told nothing.
 * `pointer: coarse` is the question that actually matters — a laptop with a
 * touchscreen still has a keyboard in front of it and a mouse under the hand.
 */
export function flapInstruction(): string {
  const touch =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return touch ? "Tap the screen to fly up!" : "Press the space bar to fly up!";
}

const HOLD_KEYS = new Set([
  " ",
  // What older browsers call the same two keys.
  "Spacebar",
  "ArrowUp",
  "Up",
  "w",
  "W",
]);

/** Is this key going into a text field rather than into the game? */
function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable]");
}
