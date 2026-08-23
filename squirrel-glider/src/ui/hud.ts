import {ProgressBar} from "../../../shared/progressBar";

/**
 * What the glide tells you: how far down the valley you are, what you have
 * caught, and how fast you are going.
 *
 * The bar is the shared one, the same furniture the other two games use. The
 * readouts beside it are deliberately few — a child gliding down a mountain
 * should be looking at the mountain.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;
  private readonly nuts: HTMLDivElement;
  private readonly arches: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private shownNuts = -1;
  private shownArches = -1;
  private shownSpeed = -1;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.bar = new ProgressBar({label: "Valley", width: 180});
    this.root.appendChild(this.bar.root);

    this.nuts = readout(this.root);
    this.arches = readout(this.root);
    this.speed = readout(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /**
   * `along` is 0..1 down the valley.
   *
   * The speed is rounded to whole numbers and not to fives, which it used to
   * be. At the old trim speed a five-wide step meant the readout sat on the
   * same number for most of a flight and said nothing; the flight is quicker
   * now and the number should move when the stick does, because it is the only
   * thing on screen that says what pulling back costs.
   */
  update(
    along: number,
    nuts: number,
    arches: number,
    speed: number,
    _height: number,
  ): void {
    this.bar.set(along);

    if (nuts !== this.shownNuts) {
      this.shownNuts = nuts;
      this.nuts.textContent = `🌰 ${nuts}`;
    }
    if (arches !== this.shownArches) {
      this.shownArches = arches;
      this.arches.textContent = `⛰ ${arches}`;
    }
    const rounded = Math.round(speed);
    if (rounded !== this.shownSpeed) {
      this.shownSpeed = rounded;
      this.speed.textContent = `${rounded}`;
    }
  }

  /** The HUD is only mounted once the game starts, so the intro is clean. */
  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }
}

function readout(parent: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "readout";
  parent.appendChild(el);
  return el;
}
