import {ProgressBar} from "../../../shared/progressBar";

/**
 * What the swim tells you: how far along the reef you are, and how many fish
 * you have caught.
 *
 * The bar is the shared one, the same furniture the other games use. Two
 * readings and nothing else — a child swimming through a coral reef should be
 * looking at the reef.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;
  private readonly fish: HTMLDivElement;
  private readonly squid: HTMLDivElement;

  private shownFish = -1;
  private shownSquid = -1;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.bar = new ProgressBar({
      label: "Reef",
      width: 180,
      fillColour: "#4fd0e0",
      doneColour: "#8fe36b",
    });
    this.root.appendChild(this.bar.root);

    this.fish = document.createElement("div");
    this.fish.className = "readout";
    this.root.appendChild(this.fish);

    // Hidden until the first one is caught. Most swims never go down to the
    // abyss, and a counter reading zero for two minutes is an accusation.
    this.squid = document.createElement("div");
    this.squid.className = "readout hidden";
    this.root.appendChild(this.squid);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** `along` is 0..1 down the reef. */
  update(along: number, fish: number, squid: number): void {
    this.bar.set(along);
    if (fish !== this.shownFish) {
      this.shownFish = fish;
      this.fish.textContent = `🐟 ${fish}`;
    }
    if (squid !== this.shownSquid) {
      this.shownSquid = squid;
      this.squid.textContent = `🦑 ${squid}`;
      this.squid.classList.toggle("hidden", squid === 0);
    }
  }

  /** Mounted only once the game starts, so the intro card is clean. */
  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }
}
