import {FOOD_KINDS, FoodKind, GOAL} from "../config";
import {ProgressBar} from "../../../shared/progressBar";

/**
 * One bar across the top: how close you are to being a butterfly.
 *
 * It replaced a row of six counters, one per kind of food. Six numbers is six
 * things to read, and a child who cannot yet read numbers got nothing at all
 * from them — where a bar that fills says the only thing the game actually
 * asks, which is "how much further?".
 *
 * The bar itself is the shared one, the same furniture the bee game uses.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bar: ProgressBar;

  /** The crow warning; see setAlert. */
  private readonly alert: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.bar = new ProgressBar({
      label: "Butterfly",
      // Wider than the shared default: this is the whole readout of the game
      // rather than a second meter tucked under another one, and it is being
      // read across a room on an iPad on a child's knee.
      width: 240,
    });
    this.root.appendChild(this.bar.root);

    // The crow warning, under the bar. Its own element rather than words in
    // the bar: the bar is the slow business of becoming a butterfly and this
    // is the one urgent thing in the game, so they must not be read as the
    // same kind of thing.
    this.alert = document.createElement("div");
    this.alert.className = "alert hidden";
    this.root.appendChild(this.alert);

    host.appendChild(this.root);
    this.update();
  }

  /**
   * The crow warning: words and the seconds left, or null to take it away.
   *
   * Both, because a child who cannot yet read gets the number counting down
   * and a child who can gets told what to do about it.
   */
  setAlert(text: string | null, seconds = 0): void {
    this.alert.classList.toggle("hidden", text === null);
    if (text === null) {
      return;
    }
    this.alert.textContent = `${text}  ${seconds}`;
  }

  /**
   * Taken off screen once the game is won and the butterfly is being flown.
   *
   * There is nothing left to fill by then, and on a narrow screen the bar sits
   * where the Play again button wants to be.
   */
  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  /**
   * How full the bar is: the average of the quotas, each capped at its own.
   *
   * Averaged per kind rather than counted over everything eaten, so no one
   * kind can fill the bar on its own — eating the whole meadow is 120 things
   * and would be most of the way to a butterfly if the total were all that
   * mattered, without a single fruit having been found.
   */
  update(eaten?: Record<FoodKind, number>): void {
    if (!eaten) {
      this.bar.set(0);
      return;
    }
    let sum = 0;
    for (const kind of FOOD_KINDS) {
      sum += Math.min(1, eaten[kind] / GOAL[kind]);
    }
    this.bar.set(sum / FOOD_KINDS.length);
  }
}
