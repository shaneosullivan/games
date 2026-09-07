import {ProgressBar} from "../../../shared/progressBar";

/**
 * What the race tells you: how far round the lap you are, and what place you
 * are in.
 *
 * The bar is the shared one, the same furniture the other games use. Two
 * readings and nothing else — a child driving a car at a hundred kilometres an
 * hour should be looking at the corner.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;
  private readonly place: HTMLDivElement;

  private shown = -1;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.bar = new ProgressBar({
      label: "Lap",
      width: 180,
      fillColour: "#f2c14a",
      doneColour: "#7fd46a",
    });
    this.root.appendChild(this.bar.root);

    this.place = document.createElement("div");
    this.place.className = "readout";
    this.root.appendChild(this.place);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** `lap` is 0..1 round the circuit; `place` is 1 for first. */
  update(lap: number, place: number): void {
    this.bar.set(lap);
    if (place !== this.shown) {
      this.shown = place;
      this.place.textContent = `🏁 ${ordinal(place)}`;
      // Leading is worth saying loudly. It is the only thing on the glass that
      // changes colour, so it is the only thing that catches the eye.
      this.place.classList.toggle("leading", place === 1);
    }
  }

  /** Mounted only once the race starts, so the intro card is clean. */
  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }
}

/** 1st, 2nd, 3rd, 4th. Worth the four lines: "place 1" is not how anybody
 *  says it, least of all a child. */
export function ordinal(n: number): string {
  if (n === 1) {
    return "1st";
  }
  if (n === 2) {
    return "2nd";
  }
  if (n === 3) {
    return "3rd";
  }
  return `${n}th`;
}
