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

    // Space and up, so it's playable on a laptop.
    window.addEventListener("keydown", e => {
      if (HOLD_KEYS.has(e.key)) {
        e.preventDefault();
        this.keys.add(e.key);
        this.sync();
      }
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
    this.sync();
  }

  private sync(): void {
    this.held = this.down.size > 0 || this.keys.size > 0;
  }
}

const HOLD_KEYS = new Set([" ", "Spacebar", "ArrowUp", "w", "W"]);
