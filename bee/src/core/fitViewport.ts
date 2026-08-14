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

    // How far the app runs past what the user can actually see.
    //
    // Taking the maximum above means it is deliberately allowed to be bigger
    // than the visible viewport — right for the background, which should reach
    // into every corner, and wrong for anything anchored to an edge, which
    // lands in a strip that cannot be tapped at all.
    //
    // This is not hypothetical. On an iPad the maze's turn buttons, anchored
    // 22px from the right, could not be pressed; sliding them 173px left made
    // them work and 172px did not — an edge that sharp is a boundary, not a
    // hit-testing quirk. The throttle beside them was fine throughout because
    // it is anchored to the *left*. Edge-anchored UI adds these to its offsets;
    // see `--ui-right` and friends in ui/styles.css.
    const seenW = vv ? Math.round(vv.width) : width;
    const seenH = vv ? Math.round(vv.height) : height;
    const style = document.documentElement.style;
    style.setProperty("--ui-left", `${Math.round(vv?.offsetLeft ?? 0)}px`);
    style.setProperty("--ui-top", `${Math.round(vv?.offsetTop ?? 0)}px`);
    style.setProperty(
      "--ui-right",
      `${Math.max(0, width - seenW - Math.round(vv?.offsetLeft ?? 0))}px`,
    );
    style.setProperty(
      "--ui-bottom",
      `${Math.max(0, height - seenH - Math.round(vv?.offsetTop ?? 0))}px`,
    );

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
