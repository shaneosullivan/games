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
  private readonly lap: HTMLDivElement;

  private shown = -1;
  private shownLap = -1;
  /** How many times round. One lap needs no counter at all. */
  private laps = 1;

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

    this.lap = document.createElement("div");
    this.lap.className = "readout hidden";
    this.root.appendChild(this.lap);

    this.place = document.createElement("div");
    this.place.className = "readout";
    this.root.appendChild(this.place);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /** How many laps this race is. A one-lap race says nothing about laps —
   *  there is nothing to count, and a "1 / 1" is only clutter. */
  setLaps(laps: number): void {
    this.laps = laps;
    this.lap.classList.toggle("hidden", laps <= 1);
  }

  /**
   * `done` is 0..1 through the *whole race* rather than round the lap: on a
   * five-lap race the bar fills once, over five laps, because what a child
   * wants to know is how much is left of the thing they are doing.
   */
  update(done: number, place: number): void {
    this.bar.set(done);
    if (this.laps > 1) {
      // Clamped at both ends. The grid sits a few metres *behind* the line, so
      // for the first second of every race the progress is slightly negative
      // and the readout said "Lap 0".
      const on = Math.max(
        1,
        Math.min(this.laps, Math.floor(done * this.laps) + 1),
      );
      if (on !== this.shownLap) {
        this.shownLap = on;
        this.lap.textContent = `Lap ${on} / ${this.laps}`;
      }
    }
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
