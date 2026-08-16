/**
 * Take a press from whatever the device sends.
 *
 * `click` is the strict reading of a tap: down and up on the same element,
 * near enough the same pixel, with nothing in between. On an iPad that is not
 * a safe thing to rely on. A finger that slides a little produces no click at
 * all; a pen produces pointer events that may not be followed by one; and a
 * lost `pointerup` can leave another element holding pointer capture, after
 * which every press goes there instead of to whatever is under the finger.
 *
 * So a button that matters takes the press the moment it lands, from
 * whichever family of events arrives first, and throws the duplicates away.
 *
 * Written after the map-drawing panel's tool buttons missed presses on a real
 * iPad, and used everywhere since — the "Back to the map" button worked with
 * a finger and not with a pen, which is the same fault wearing a hat.
 */
export function onTap(button: HTMLElement, run: (event: Event) => void): void {
  let last = -Infinity;

  const press = (event: Event): void => {
    // A keyboard press arrives as a click with no coordinates behind it, and
    // is the one kind that has no pointer or touch event of its own.
    const fromKeyboard =
      event.type === "click" && (event as MouseEvent).detail === 0;
    const now = performance.now();
    if (!fromKeyboard && now - last < DEDUPE_MS) {
      return;
    }
    last = now;

    // A finger or pen already on the glass may still be captured by whatever
    // it last touched — an iPad that loses a `pointerup` leaves it that way —
    // and everything after that is delivered there rather than here.
    const target = event.target as Element | null;
    const id = (event as PointerEvent).pointerId;
    if (target && typeof id === "number" && target.hasPointerCapture?.(id)) {
      try {
        target.releasePointerCapture(id);
      } catch {
        // Nothing held it, which is the normal case.
      }
    }

    event.preventDefault();
    run(event);
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("touchstart", press, {passive: false});
  button.addEventListener("click", press);
}

/**
 * How long after a press the same button ignores another.
 *
 * Long enough to cover the click that follows a pointerdown, short enough that
 * a child deliberately pressing twice is still two presses.
 */
const DEDUPE_MS = 350;
