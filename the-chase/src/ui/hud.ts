import {ProgressBar} from "../../../shared/progressBar";
import {DOGS} from "../config";

/**
 * What the run tells you: how far you are from home, and how close they are.
 *
 * The bar across the top is the shared one, the same furniture the other games
 * use. The dogs get a gauge of their own down the side, because they are the
 * thing you actually need to know about and a number is no use to a child who
 * cannot read one yet.
 *
 * It fills from the bulb upward as they close and goes from green through
 * amber to red on the way — a shape anybody has seen on a thermometer, read
 * the same way. The paw in the bulb is what says whose gauge it is.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;
  private readonly gauge: HTMLDivElement;
  private readonly fill: HTMLDivElement;

  /** What is on screen now, so an unchanged value does not restart the ease. */
  private shown = -1;
  private shownClose = false;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.bar = new ProgressBar({
      label: "Home",
      width: 180,
      fillColour: "#8fd46a",
      doneColour: "#ffd257",
    });
    this.root.appendChild(this.bar.root);

    // The gauge is its own element rather than part of the top row: the row is
    // the slow business of getting home, and this is the urgent one. They must
    // not read as the same kind of thing.
    this.gauge = document.createElement("div");
    this.gauge.className = "gauge";

    const tube = document.createElement("div");
    tube.className = "gauge-tube";
    this.fill = document.createElement("div");
    this.fill.className = "gauge-fill";
    tube.appendChild(this.fill);
    // Four marks up the inside of the tube. Not a scale anybody reads — they
    // are there so the column has something to rise past, which is what makes
    // a moving bar look like it is moving.
    for (let i = 0; i < 4; i++) {
      const tick = document.createElement("div");
      tick.className = "gauge-tick";
      tick.style.bottom = `${18 + i * 20}%`;
      tube.appendChild(tick);
    }
    this.gauge.appendChild(tube);

    const bulb = document.createElement("div");
    bulb.className = "gauge-bulb";
    bulb.textContent = "🐾";
    this.gauge.appendChild(bulb);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    this.gauge.classList.toggle("hidden", !visible);
  }

  /**
   * `along` is 0..1 down the wood; `gap` is how far off the nearest dog is.
   *
   * The gauge is empty at the distance they start from and full when they are
   * on you, so what it shows is how much of your head start is gone.
   */
  update(along: number, gap: number): void {
    this.bar.set(along);

    const span = DOGS.startGap - DOGS.reach;
    const close = Math.min(1, Math.max(0, (DOGS.startGap - gap) / span));
    const shown = Math.round(close * 100);
    if (shown !== this.shown) {
      this.shown = shown;
      this.fill.style.height = `${shown}%`;
      // Green while they are a field away, amber as they come up, red when
      // they are on your heels. Mixed in the fill itself rather than swapped at
      // a threshold, so there is no moment where it jumps.
      const hue = 120 - close * 120;
      // Saturated and mid-dark. Pale colours sat on a pale tube over a sunlit
      // wood and the column could not be picked out at all.
      this.fill.style.background = `linear-gradient(180deg,
        hsl(${hue} 85% 46%), hsl(${hue} 80% 34%))`;
    }
    const panic = close > 0.72;
    if (panic !== this.shownClose) {
      this.shownClose = panic;
      this.gauge.classList.toggle("panic", panic);
    }
  }

  /** Mounted only once the game starts, so the intro card is clean. */
  mount(host: HTMLElement): void {
    host.appendChild(this.root);
    host.appendChild(this.gauge);
  }
}
