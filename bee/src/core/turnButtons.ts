import {controlLog, pointerNote} from "./controlLog";
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
  /** Held from the console, bypassing the buttons. See `force`. */
  private forced: number | null = null;

  /**
   * Turn without touching the screen: -1, 1, or null to hand it back.
   *
   * This is how you tell a dead button from a control the game isn't reading —
   * if `force(1)` turns her and pressing the button doesn't, the fault is in
   * the button, not in the flight model.
   */
  force(dir: number | null): void {
    this.forced = dir;
    this.sync();
  }

  /** -1 turning left, +1 turning right, 0 when nothing is held. */
  turn = 0;

  /** The buttons themselves, so a console helper can press the real thing. */
  readonly buttons: {left: HTMLButtonElement; right: HTMLButtonElement};

  private readonly root: HTMLDivElement;
  /**
   * Which button each live press is on, so two thumbs can't fight.
   *
   * Keyed by a string — "p12" for a pointer, "t0" for a touch — because the
   * same finger can arrive down both paths and their ids are numbered
   * independently. Two keys for one finger is harmless: `sync` clamps.
   */
  private readonly held = new Map<string, number>();
  private readonly keys = new Set<string>();

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "turnpad ui-interactive hidden";

    const left = this.button("◀", -1, "Turn left");
    const right = this.button("▶", 1, "Turn right");
    this.buttons = {left, right};
    this.root.append(left, right);
    host.appendChild(this.root);

    // A/D and the arrows, so the maze is playable on a laptop — the rest of
    // the game already takes WASD through the thumbstick, and this level's
    // thumbstick only does forward and back.
    window.addEventListener("keydown", e => {
      if (TURN_KEYS.has(e.key)) {
        this.keys.add(e.key);
        this.sync();
      }
    });
    window.addEventListener("keyup", e => {
      this.keys.delete(e.key);
      this.sync();
    });
    // A key released while the window is away never reports it, and a held
    // turn would survive into whatever happens next. HoldInput has had this
    // since the Bear's Lair; this control needed it just as much.
    window.addEventListener("blur", () => this.release());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.release();
      }
    });
    // A pointer released anywhere — dragged off the button, or off the screen
    // entirely — has to stop the turn, or she spins forever. On window rather
    // than on the button, so it arrives whether or not the press was captured.
    for (const type of ["pointerup", "pointercancel"]) {
      window.addEventListener(type, e => {
        const had = this.held.delete(`p${(e as PointerEvent).pointerId}`);
        this.sync();
        if (had) {
          controlLog(`turn ${type}`, {
            ...pointerNote(e as PointerEvent),
            turn: this.turn,
          });
        }
      });
    }
    // Belt and braces for iOS, where a captured pointer's `pointerup` can go
    // missing: when the last finger leaves the glass, nothing is held.
    for (const type of ["touchend", "touchcancel"]) {
      window.addEventListener(type, e => {
        if ((e as TouchEvent).touches.length === 0) {
          const had = this.held.size > 0;
          this.held.clear();
          this.sync();
          if (had) {
            controlLog(`turn released by ${type}`, {turn: this.turn});
          }
        }
      });
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    if (!visible) {
      this.release();
    }
  }

  /**
   * Let go of everything.
   *
   * Keys as well as fingers, which is the whole point of it. The key listeners
   * are on the window and live for the life of the game, so a key pressed in
   * *another* level is in this set too — and a keyup that never arrives leaves
   * a turn latched. Level 5 then starts with the bee spinning on the spot and
   * nothing on screen to explain it, until the page is reloaded.
   */
  release(): void {
    this.held.clear();
    this.keys.clear();
    this.sync();
  }

  private button(glyph: string, dir: number, label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "turn-btn ui-interactive";
    b.type = "button";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    const side = dir > 0 ? "right" : "left";

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
        this.press(`p${e.pointerId}`, dir);
        controlLog(`turn down ${side} (pointer)`, {
          ...pointerNote(e),
          turn: this.turn,
        });
        try {
          b.setPointerCapture(e.pointerId);
        } catch (err) {
          // Without capture the window-level pointerup below still ends it.
          controlLog("turn capture refused", String(err));
        }
      },
      {passive: false},
    );

    // ...and the same press as a touch.
    //
    // Not belt and braces: on an iPad the pointer event above simply never
    // arrives, while a synthetic one dispatched at the same element turns her
    // — so the handler and everything under it are fine and the browser is not
    // delivering. Touch events are the older, dumber path and iOS has always
    // delivered them. Both may fire; the two register under different keys and
    // `sync` clamps, so a doubled press is still one turn, and the release of
    // either ends it.
    b.addEventListener(
      "touchstart",
      e => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          this.press(`t${t.identifier}`, dir);
        }
        controlLog(`turn down ${side} (touch)`, {
          touches: e.changedTouches.length,
          turn: this.turn,
        });
      },
      {passive: false},
    );

    for (const type of ["touchend", "touchcancel"]) {
      b.addEventListener(type, e => {
        for (const t of Array.from((e as TouchEvent).changedTouches)) {
          this.held.delete(`t${t.identifier}`);
        }
        this.sync();
        controlLog(`turn ${type} ${side}`, {turn: this.turn});
      });
    }

    return b;
  }

  /** Register a press from whichever input path noticed it first. */
  private press(key: string, dir: number): void {
    this.held.set(key, dir);
    this.sync();
  }

  /** Both held cancel out, which is the least surprising thing to do. */
  private sync(): void {
    if (this.forced !== null) {
      this.turn = this.forced;
      return;
    }
    let turn = 0;
    for (const dir of this.held.values()) {
      turn += dir;
    }
    if (LEFT_KEYS.some(k => this.keys.has(k))) {
      turn -= 1;
    }
    if (RIGHT_KEYS.some(k => this.keys.has(k))) {
      turn += 1;
    }
    this.turn = Math.max(-1, Math.min(1, turn));
  }
}

const LEFT_KEYS = ["ArrowLeft", "a", "A"];
const RIGHT_KEYS = ["ArrowRight", "d", "D"];
const TURN_KEYS = new Set([...LEFT_KEYS, ...RIGHT_KEYS]);
