import {FOOD_KINDS, FoodKind, GOAL} from "../config";

/** What each counter is called and the colour of its pip. */
const LOOK: Record<FoodKind, {label: string; colour: string}> = {
  leaf: {label: "Leaves", colour: "#63b04a"},
  flower: {label: "Flowers", colour: "#f2809f"},
  berry: {label: "Berries", colour: "#4a5fd8"},
  fruit: {label: "Fruit", colour: "#ff9c3d"},
  grass: {label: "Grass", colour: "#8fd155"},
};

interface Tally {
  root: HTMLDivElement;
  count: HTMLSpanElement;
  goal: HTMLSpanElement;
  bumpTimer: number;
}

/**
 * The four counters along the top. Deliberately the only readout in the game:
 * there is no score, no timer and nothing to lose, so this is the whole of
 * what a player needs to know.
 */
export class Hud {
  private readonly bar: HTMLDivElement;
  private readonly tallies = new Map<FoodKind, Tally>();
  private readonly shown: Record<FoodKind, number> = {
    leaf: -1,
    flower: -1,
    berry: -1,
    fruit: -1,
    grass: -1,
  };

  constructor(host: HTMLElement) {
    const bar = document.createElement("div");
    bar.className = "hud";
    this.bar = bar;

    for (const kind of FOOD_KINDS) {
      const root = document.createElement("div");
      root.className = "tally";

      const pip = document.createElement("span");
      pip.className = "pip";
      pip.style.background = LOOK[kind].colour;

      const count = document.createElement("span");
      count.className = "count";
      const goal = document.createElement("span");
      goal.className = "goal";

      root.append(pip, count, goal);
      bar.appendChild(root);
      this.tallies.set(kind, {root, count, goal, bumpTimer: 0});
    }

    host.appendChild(bar);
    this.update();
  }

  /**
   * Taken off screen once the game is won and the butterfly is being flown.
   *
   * Every quota is met by then, so the counters have nothing left to say — and
   * on a narrow screen they wrap onto a second row and run into the Play again
   * button. The win overlay lists the totals anyway.
   */
  setVisible(visible: boolean): void {
    this.bar.classList.toggle("hidden", !visible);
  }

  /** Repaints any counter whose number has moved. */
  update(eaten?: Record<FoodKind, number>): void {
    for (const kind of FOOD_KINDS) {
      const tally = this.tallies.get(kind);
      if (!tally) {
        continue;
      }
      const n = eaten ? eaten[kind] : 0;
      if (n === this.shown[kind]) {
        continue;
      }
      const first = this.shown[kind] < 0;
      this.shown[kind] = n;

      const target = GOAL[kind];
      const left = Math.max(0, target - n);
      tally.count.textContent = String(Math.min(n, target));
      tally.goal.textContent = left > 0 ? `/ ${target}` : "";
      tally.root.classList.toggle("done", left === 0);

      // The pop is the reward for a bite, so it must not fire on the first
      // paint, when nothing has been eaten yet.
      if (!first) {
        tally.root.classList.add("bump");
        window.clearTimeout(tally.bumpTimer);
        tally.bumpTimer = window.setTimeout(() => {
          tally.root.classList.remove("bump");
        }, 150);
      }
    }
  }
}
