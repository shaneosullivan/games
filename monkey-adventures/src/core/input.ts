import {TOUCH} from "../config";
import {Joystick, TouchButton} from "../../../shared/touchControls";

/**
 * Two thumbs on a sheet of glass.
 *
 * A stick in the bottom-left and a round button in the bottom-right, both of
 * them visible: the controls are drawn on the screen rather than hidden in
 * it, because a child who cannot see a control does not know it is there. It
 * is the repo's shared pair, so the stick here is the stick in the bee game.
 *
 * The stick is visible but not fussy — a drag anywhere in the left half
 * works, measured from wherever the thumb went down, and the knob shows it.
 * The right half still jumps as well as the button does; the button is the
 * thing that says so.
 *
 * Left and right walks and pumps a swing. Up and down climbs: a tree, or the
 * vine it is hanging from. One gesture, three places, which is one thing to
 * learn rather than three.
 *
 * A keyboard does the same jobs for whoever is building the game: the arrow
 * keys are the stick, and the space bar is the button.
 */
export class Input {
  /** True on the frame the player asked to jump or let go. Read with `took`,
   *  which clears it: a tap is an event, and a game that reads it twice jumps
   *  twice. */
  private tapped = false;

  private readonly stick: Joystick;

  constructor(on: HTMLElement, into: HTMLElement) {
    on.style.touchAction = "none";
    this.stick = new Joystick(into, {
      shows: "always",
      radius: TOUCH.throw,
      side: "left",
    });
    new TouchButton(into, {
      side: "right",
      radius: TOUCH.throw,
      onPress: () => {
        this.tapped = true;
      },
    });

    // The whole right half jumps too. The button is where a child looks for
    // it; the half is where their thumb already is.
    on.addEventListener("pointerdown", e => {
      if (e.clientX / Math.max(1, window.innerWidth) >= TOUCH.stickSide) {
        this.tapped = true;
      }
    });

    window.addEventListener("keydown", e => {
      if (e.key === " " || e.key === "Enter") {
        if (!e.repeat) {
          this.tapped = true;
        }
        e.preventDefault();
      }
      // The arrows belong to the stick, and the page must not scroll under
      // the game while they are held.
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
      }
    });
  }

  /** How far the player is leaning, thumb or keyboard. */
  get push(): number {
    return this.stick.x;
  }

  /** Up and down: negative is up a tree or up a vine, to match the screen. */
  get climb(): number {
    return this.stick.y;
  }

  /** Whether a jump or a let-go was asked for since this was last asked. */
  took(): boolean {
    const was = this.tapped;
    this.tapped = false;
    return was;
  }
}
