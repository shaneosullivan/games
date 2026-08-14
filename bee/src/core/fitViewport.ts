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

/**
 * How often to re-measure with nothing having told us to.
 *
 * Events are not enough. iPadOS can resize an installed app's window without
 * firing a resize anywhere the page can hear it — taking a screenshot of a
 * standalone PWA is one way in — and every trigger below is an event, so the
 * app would keep the numbers it measured before the change until it was
 * restarted. That is not a cosmetic drift: the edge insets below come out of
 * those numbers, and stale ones put edge-anchored controls somewhere a finger
 * can't reach.
 *
 * Twice a second is far below anything a person notices and, because `apply`
 * returns early when nothing moved, an idle poll writes nothing.
 */
const POLL_MS = 500;

/** Fits worth remembering, for when a control misbehaves. See `core/probe.ts`. */
export interface Fit {
  t: number;
  why: string;
  size: [number, number];
  seen: [number, number];
  inset: [number, number, number, number];
}

/**
 * The last few fits, newest last.
 *
 * `chofter.probe()` reports these. The question they answer is the one that
 * can't be answered from a screenshot: when the app is laid out wrongly, is it
 * because nothing told us to re-measure — in which case the poll below will
 * have corrected it and the history shows the correction — or because the
 * numbers the browser hands back are themselves stale, in which case every
 * entry here agrees with every other and they are all wrong together.
 */
export const fits: Array<Fit> = [];
const FITS_MAX = 8;

export function fitViewport(root: HTMLElement, onResize: () => void): void {
  const vv = window.visualViewport;
  let lastW = 0;
  let lastH = 0;
  /** Everything last written, so an unchanged poll can do nothing at all. */
  let lastApplied = "";

  const apply = (why: string): void => {
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
    const offsetX = Math.round(vv?.offsetLeft ?? 0);
    const offsetY = Math.round(vv?.offsetTop ?? 0);
    const right = Math.max(0, width - seenW - offsetX);
    const bottom = Math.max(0, height - seenH - offsetY);

    const signature = [width, height, offsetX, offsetY, right, bottom].join();
    if (signature === lastApplied) {
      return;
    }
    lastApplied = signature;

    root.style.top = "0px";
    root.style.left = "0px";
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;

    const style = doc.style;
    style.setProperty("--ui-left", `${offsetX}px`);
    style.setProperty("--ui-top", `${offsetY}px`);
    style.setProperty("--ui-right", `${right}px`);
    style.setProperty("--ui-bottom", `${bottom}px`);

    fits.push({
      t: Math.round(performance.now()),
      why,
      size: [width, height],
      seen: [seenW, seenH],
      inset: [offsetX, offsetY, right, bottom],
    });
    if (fits.length > FITS_MAX) {
      fits.shift();
    }

    if (width === lastW && height === lastH) {
      return;
    }
    lastW = width;
    lastH = height;
    onResize();
  };

  apply("initial");
  window.addEventListener("resize", () => apply("resize"));
  // iOS finishes its launch animation after load, and the viewport it settles
  // on is often not the one the first layout saw.
  window.addEventListener("orientationchange", () =>
    setTimeout(() => apply("orientationchange"), 120),
  );
  window.addEventListener("pageshow", () => apply("pageshow"));
  vv?.addEventListener("resize", () => apply("vv-resize"));
  vv?.addEventListener("scroll", () => apply("vv-scroll"));

  // Coming back to the app is the likeliest moment for the window to have
  // changed under us — including the screenshot case, which puts a preview over
  // the app and takes it away again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      apply("visible");
    }
  });
  window.addEventListener("focus", () => apply("focus"));

  setInterval(() => apply("poll"), POLL_MS);
}
