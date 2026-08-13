/**
 * Makes the page impossible to zoom on iPad.
 *
 * No single mechanism covers it: iOS Safari has ignored `user-scalable=no`
 * since iOS 10, so the viewport meta alone does nothing. Each listener here
 * closes a different route in:
 *
 *  - `gesture*`      — Safari's two-finger pinch zoom
 *  - `touchstart`    — any multi-touch, which is what a pinch starts as
 *  - `touchend`      — double-tap-to-zoom (two taps inside 300ms)
 *  - `dblclick`      — the mouse/trackpad equivalent
 *  - ctrl+wheel      — trackpad pinch and ctrl+scroll on desktop
 *  - ⌘ / ctrl +-0    — keyboard zoom while developing
 *
 * Form controls are exempt from the tap rules so the codename field still
 * takes focus.
 */
export function lockZoom(): void {
  const isFormControl = (target: EventTarget | null): boolean =>
    !!(target as HTMLElement | null)?.closest?.(
      "input, textarea, button, select",
    );

  /**
   * Is this touch inside something that has somewhere to scroll?
   *
   * Cancelling every touchmove is what keeps the page from rubber-banding
   * under the game, but it also cancels the only gesture a scrollable panel
   * has: the menu card is taller than a short phone screen, and no amount of
   * `overflow-y: auto` helps if the finger never reaches it. So walk up from
   * whatever was touched looking for a scroller with room left in it, and
   * leave that one alone.
   */
  const canScroll = (target: EventTarget | null): boolean => {
    let node = target as HTMLElement | null;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (
        /auto|scroll/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  };

  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, e => e.preventDefault(), {passive: false});
  }

  // A pinch always begins as a second finger landing.
  document.addEventListener(
    "touchstart",
    e => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    },
    {passive: false},
  );

  // One finger inside a scroller is a scroll and belongs to it. Everything
  // else — two fingers, or a drag over the game — is still ours to swallow.
  document.addEventListener(
    "touchmove",
    e => {
      if (e.touches.length === 1 && canScroll(e.target)) {
        return;
      }
      e.preventDefault();
    },
    {passive: false},
  );

  let lastTap = 0;
  document.addEventListener(
    "touchend",
    e => {
      const now = performance.now();
      if (now - lastTap < 300 && !isFormControl(e.target)) {
        e.preventDefault();
      }
      lastTap = now;
    },
    {passive: false},
  );

  document.addEventListener("dblclick", e => e.preventDefault(), {
    passive: false,
  });

  document.addEventListener(
    "wheel",
    e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    },
    {passive: false},
  );

  window.addEventListener(
    "keydown",
    e => {
      if (
        (e.metaKey || e.ctrlKey) &&
        ["+", "=", "-", "_", "0"].includes(e.key)
      ) {
        e.preventDefault();
      }
    },
    {passive: false},
  );

  document.addEventListener("contextmenu", e => e.preventDefault());
}
