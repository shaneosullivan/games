import {TOUCH} from "../config";

/**
 * Two thumbs on a sheet of glass.
 *
 * The left half of the screen is a stick that appears wherever the thumb goes
 * down — not a stick drawn in a fixed corner, because a child does not look at
 * their thumbs and a fixed stick is a thing you have to find. The right half
 * is a button: a tap jumps, or lets go of a vine.
 *
 * A keyboard does the same two jobs, because this is developed on a laptop and
 * being unable to play it there would mean never playing it while building it.
 * The iPad is what it is *for*, though, so nothing here needs a keyboard.
 */
export class Input {
  /** Left and right, and up and down, each -1 to 1. Two axes because the
   *  monkey climbs: the same thumb that walks it along the floor takes it up
   *  a tree, which is one gesture to learn instead of two. */
  lean = 0;
  leanY = 0;
  /** True on the frame the player asked to jump or let go. Read with `took`,
   *  which clears it: a tap is an event, and a game that reads it twice jumps
   *  twice. */
  private tapped = false;

  private stick: {id: number; fromX: number; fromY: number} | null = null;
  private keys = new Set<string>();

  constructor(on: HTMLElement) {
    on.style.touchAction = "none";
    on.addEventListener("pointerdown", this.down);
    on.addEventListener("pointermove", this.move);
    on.addEventListener("pointerup", this.up);
    on.addEventListener("pointercancel", this.up);
    window.addEventListener("keydown", e => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") {
        if (!e.repeat) {
          this.tapped = true;
        }
        e.preventDefault();
      }
      this.keys.add(e.key);
    });
    window.addEventListener("keyup", e => this.keys.delete(e.key));
  }

  private down = (e: PointerEvent): void => {
    const side = e.clientX / Math.max(1, window.innerWidth);
    if (side < TOUCH.stickSide) {
      this.stick = {id: e.pointerId, fromX: e.clientX, fromY: e.clientY};
      this.lean = 0;
      this.leanY = 0;
    } else {
      this.tapped = true;
    }
  };

  private move = (e: PointerEvent): void => {
    if (!this.stick || this.stick.id !== e.pointerId) {
      return;
    }
    const byX = e.clientX - this.stick.fromX;
    const byY = e.clientY - this.stick.fromY;
    const pastX = Math.abs(byX) < TOUCH.deadZone ? 0 : byX;
    const pastY = Math.abs(byY) < TOUCH.deadZone ? 0 : byY;
    this.lean = Math.max(-1, Math.min(1, pastX / TOUCH.throw));
    this.leanY = Math.max(-1, Math.min(1, pastY / TOUCH.throw));
  };

  private up = (e: PointerEvent): void => {
    if (this.stick && this.stick.id === e.pointerId) {
      this.stick = null;
      this.lean = 0;
      this.leanY = 0;
    }
  };

  /** How far the player is leaning, thumb or keyboard. */
  get push(): number {
    const left = this.keys.has("ArrowLeft") || this.keys.has("a") ? -1 : 0;
    const right = this.keys.has("ArrowRight") || this.keys.has("d") ? 1 : 0;
    return left + right !== 0 ? left + right : this.lean;
  }

  /** Up and down: negative is up the tree, to match the screen. */
  get climb(): number {
    const up = this.keys.has("ArrowUp") || this.keys.has("w") ? -1 : 0;
    const down = this.keys.has("ArrowDown") || this.keys.has("s") ? 1 : 0;
    return up + down !== 0 ? up + down : this.leanY;
  }

  /** Whether a jump or a let-go was asked for since this was last asked. */
  took(): boolean {
    const was = this.tapped;
    this.tapped = false;
    return was;
  }
}
