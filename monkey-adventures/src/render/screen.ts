import {SCREEN} from "../config";

/**
 * A small picture, blown up until it fills the glass.
 *
 * The whole look of this game is that a pixel is a *thing* — big, square and
 * countable. That only happens if the drawing is done once, small, and then
 * magnified with no smoothing whatever: draw it large and "pixel art" is just
 * art, and let the browser interpolate and it is mush.
 *
 * So there is one canvas whose backing store is the small picture, scaled up
 * by CSS with `image-rendering: pixelated`. Nothing in the game knows the size
 * of the screen; everything is in picture pixels, and this is the only file
 * that has heard of a device.
 */
export class Screen {
  readonly canvas = document.createElement("canvas");
  readonly ctx: CanvasRenderingContext2D;
  /** The picture's size, in its own pixels. */
  wide: number = SCREEN.narrowest;
  readonly tall = SCREEN.tall;

  constructor(into: HTMLElement) {
    const ctx = this.canvas.getContext("2d", {alpha: false});
    if (!ctx) {
      throw new Error("no 2d context");
    }
    this.ctx = ctx;
    this.canvas.style.display = "block";
    this.canvas.style.margin = "0 auto";
    this.canvas.style.imageRendering = "pixelated";
    into.append(this.canvas);
    this.fit();
    window.addEventListener("resize", this.fit);
    // An iPad turned on its side fires this rather than resize, sometimes
    // before the new size is readable, so it waits a beat.
    window.addEventListener("orientationchange", () =>
      window.setTimeout(this.fit, 120),
    );
  }

  /**
   * Picks the picture's width from the shape of the window, and the
   * magnification from its size.
   *
   * The picture is always `SCREEN.tall` pixels high and as wide as the window
   * is shaped, within limits — so a wide screen is given more jungle to look
   * at rather than a bigger monkey, and every device agrees about how big a
   * monkey is. That is what keeps the game the same game on a phone and on an
   * iPad.
   */
  fit = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const want = Math.round(this.tall * (w / Math.max(1, h)));
    this.wide = Math.max(SCREEN.narrowest, Math.min(SCREEN.widest, want));
    // The backing store is `SCREEN.fine` canvas pixels to each picture
    // pixel, and the context is scaled to match, so every drawing call in
    // the game stays in picture pixels and lands on the same blocks it
    // always did. The vines are the only thing that spends the extra.
    const fine = SCREEN.fine;
    if (
      this.canvas.width !== this.wide * fine ||
      this.canvas.height !== this.tall * fine
    ) {
      this.canvas.width = this.wide * fine;
      this.canvas.height = this.tall * fine;
    }
    this.ctx.setTransform(fine, 0, 0, fine, 0, 0);
    // Whole numbers of screen pixels per picture pixel wherever it fits,
    // because a pixel and a half is a pixel with a blurred edge and the eye
    // picks it up as shimmer the moment anything scrolls. Below one, the
    // window is smaller than the picture and there is nothing to be done but
    // take the fraction.
    const fits = Math.min(w / this.wide, h / this.tall);
    const scale = fits >= 1 ? Math.floor(fits) : fits;
    this.canvas.style.width = `${this.wide * scale}px`;
    this.canvas.style.height = `${this.tall * scale}px`;
    this.ctx.imageSmoothingEnabled = false;
  };

  /** Where a point on the glass falls in the picture. */
  toPicture(clientX: number, clientY: number): {x: number; y: number} {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - box.left) / Math.max(1, box.width)) * this.wide,
      y: ((clientY - box.top) / Math.max(1, box.height)) * this.tall,
    };
  }
}
