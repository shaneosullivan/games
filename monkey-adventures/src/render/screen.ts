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
  /**
   * A box exactly the size of the picture on the glass.
   *
   * Everything that is not the jungle hangs off this rather than off the
   * window: the bar, the sound switch, the stick and the jump button. The
   * picture fills the window in one direction and is centred in the other,
   * so a control pinned to the window would sit in the black beside the
   * game — which is where the stick ended up, half of it off the bottom of
   * the screen.
   */
  readonly frame = document.createElement("div");
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
    this.frame.style.position = "relative";
    this.frame.append(this.canvas);
    into.append(this.frame);
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
   *
   * It fills the window. The magnification used to be rounded down to a
   * whole number of screen pixels per picture pixel, which left a band of
   * black along the bottom — on a laptop a sixth of the window, with the
   * stick and the jump button stranded in it, because they are fixed to the
   * window and not to the picture. So the height is filled exactly and the
   * width follows from it. The backing store is two canvas pixels to the
   * picture pixel (`SCREEN.fine`), which halves what the fraction costs,
   * and `image-rendering: pixelated` keeps every edge hard: a block may come
   * out a screen pixel wider than its neighbour, but no block is ever blurred
   * across two.
   */
  fit = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Screen pixels to the picture pixel is a fraction now, and the picture
    // is as many columns wide as that fraction leaves room for. A window
    // shaped past what `narrowest` allows is the one case the height cannot
    // set the scale: there the width does, and the picture is letterboxed
    // top and bottom rather than run off the sides of the glass.
    let scale = h / this.tall;
    const want = Math.round(w / scale);
    if (want < SCREEN.narrowest) {
      this.wide = SCREEN.narrowest;
      scale = w / this.wide;
    } else {
      this.wide = Math.min(SCREEN.widest, want);
    }
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
    // The picture at that scale, which fills the window in whichever
    // direction the shape of it allows. Letterboxed in the other, never
    // stretched and never run off the edge: a stretched pixel is the one
    // thing this look cannot survive, and a cropped one takes the jungle
    // with it.
    const onGlass = Math.round(this.wide * scale);
    const tallOnGlass = Math.round(this.tall * scale);
    this.canvas.style.width = `${onGlass}px`;
    this.canvas.style.height = `${tallOnGlass}px`;
    this.frame.style.width = `${onGlass}px`;
    this.frame.style.height = `${tallOnGlass}px`;
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
