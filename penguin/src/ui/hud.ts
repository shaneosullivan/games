import {ProgressBar} from "../../../shared/progressBar";

/**
 * What the run tells you: how far down the hill you are, and how many fish you
 * have.
 *
 * The bar is the shared one, the same furniture the other games use. Two
 * readings and nothing else — a child going down a mountain at fifty units a
 * second should be looking at the mountain.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;
  private readonly fish: HTMLDivElement;

  private shownFish = -1;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.bar = new ProgressBar({
      label: "Hill",
      width: 180,
      fillColour: "#7ec4ee",
      doneColour: "#8fe36b",
    });
    this.root.appendChild(this.bar.root);

    this.fish = document.createElement("div");
    this.fish.className = "readout";
    this.root.appendChild(this.fish);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** `along` is 0..1 down the hill. */
  update(along: number, fish: number): void {
    this.bar.set(along);
    if (fish !== this.shownFish) {
      this.shownFish = fish;
      this.fish.textContent = `🐟 ${fish}`;
    }
  }

  /** Mounted only once the game starts, so the intro card is clean. */
  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }
}
