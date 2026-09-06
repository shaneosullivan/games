import {ProgressBar} from "../../../shared/progressBar";
import {DOGS} from "../config";

/**
 * What the run tells you: how far you are from home, and how close they are.
 *
 * The bar is the shared one, the same furniture the other games use. Two
 * readings and nothing else — a child being chased through a wood should be
 * looking at the wood.
 *
 * The dogs are the interesting one. They spend most of the run behind the
 * camera, so the only ways to know how they are doing are the barking, the
 * moment they fan out wide enough to come into shot, and this. It goes red
 * when they are close, because a number is no use to a child who cannot read
 * one yet and a colour is.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;
  private readonly dogs: HTMLDivElement;

  private shownGap = -1;
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

    this.dogs = document.createElement("div");
    this.dogs.className = "readout";
    this.root.appendChild(this.dogs);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** `along` is 0..1 down the wood; `gap` is how far off the nearest dog is. */
  update(along: number, gap: number): void {
    this.bar.set(along);
    const shown = Math.max(0, Math.round(gap));
    if (shown !== this.shownGap) {
      this.shownGap = shown;
      this.dogs.textContent = `🐕 ${shown}`;
    }
    const close = gap < DOGS.startGap * 0.6;
    if (close !== this.shownClose) {
      this.shownClose = close;
      this.dogs.classList.toggle("close", close);
    }
  }

  /** Mounted only once the game starts, so the intro card is clean. */
  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }
}
