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
    // The *largest* of the three, not the visual viewport alone.
    //
    // On an installed iPad app the visual viewport comes back a status bar
    // shorter than the screen, and sizing to it left a strip of bare page
    // background along the bottom — the very bug this was added to fix. None of
    // the three is right on its own, but the game has no text fields and never
    // scrolls, so it can only ever be too small: taking the maximum is safe,
    // and overflow is hidden anyway.
    const doc = document.documentElement;
    const width = Math.max(
      Math.round(vv?.width ?? 0),
      doc.clientWidth,
      window.innerWidth,
    );
    const height = Math.max(
      Math.round(vv?.height ?? 0),
      doc.clientHeight,
      window.innerHeight,
    );

    root.style.top = "0px";
    root.style.left = "0px";
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;

    if (width === lastW && height === lastH) {
      return;
    }
    lastW = width;
    lastH = height;
    onResize();
  };

  apply();
  window.addEventListener("resize", apply);
  // iOS finishes its launch animation after load, and the viewport it settles
  // on is often not the one the first layout saw.
  window.addEventListener("orientationchange", () => setTimeout(apply, 120));
  window.addEventListener("pageshow", apply);
  vv?.addEventListener("resize", apply);
  vv?.addEventListener("scroll", apply);
}
