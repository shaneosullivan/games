/**
 * Pin the app to the *visible* viewport, in pixels, rather than trusting CSS.
 *
 * On an iPad with the app installed to the home screen, `position: fixed;
 * inset: 0` doesn't reliably mean "the screen". iOS lays the page out against a
 * viewport that can be a status bar taller than what's actually on screen, and
 * the app ends up sitting a strip short at the bottom — a band of bare page
 * background under the game.
 *
 * `visualViewport` is the one measurement that always describes what the user
 * can actually see, so this sizes the root to it outright and re-applies on
 * every resize, orientation change and viewport scroll. On anything without a
 * visualViewport it falls back to `innerWidth`/`innerHeight`, which is what the
 * CSS would have done anyway.
 *
 * @param onResize called after the size changes, so the renderer can follow
 */
export function fitViewport(root: HTMLElement, onResize: () => void): void {
  const vv = window.visualViewport;
  let lastW = 0;
  let lastH = 0;

  const apply = (): void => {
    const width = Math.round(vv?.width ?? window.innerWidth);
    const height = Math.round(vv?.height ?? window.innerHeight);
    // The keyboard shrinks the visual viewport and offsets it; the game itself
    // has no text fields, so following that is exactly right here.
    const top = Math.round(vv?.offsetTop ?? 0);
    const left = Math.round(vv?.offsetLeft ?? 0);

    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;

    if (width === lastW && height === lastH) return;
    lastW = width;
    lastH = height;
    onResize();
  };

  apply();
  window.addEventListener('resize', apply);
  // iOS finishes its launch animation after load, and the viewport it settles
  // on is often not the one the first layout saw.
  window.addEventListener('orientationchange', () => setTimeout(apply, 120));
  window.addEventListener('pageshow', apply);
  vv?.addEventListener('resize', apply);
  vv?.addEventListener('scroll', apply);
}
