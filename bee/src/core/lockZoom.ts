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
    !!(target as HTMLElement | null)?.closest?.('input, textarea, button, select');

  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  // A pinch always begins as a second finger landing.
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  let lastTap = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      if (now - lastTap < 300 && !isFormControl(e.target)) e.preventDefault();
      lastTap = now;
    },
    { passive: false },
  );

  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.metaKey || e.ctrlKey) && ['+', '=', '-', '_', '0'].includes(e.key)) {
        e.preventDefault();
      }
    },
    { passive: false },
  );

  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
