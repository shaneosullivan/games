import {ProgressBar} from "../../../shared/progressBar";

/**
 * The waiting screen while a race is built.
 *
 * It exists for one reason: the first seconds of a race used to be the worst
 * of it. Shaders compile the first time a material is drawn, geometry and
 * textures go to the card on their first frame, and a level as heavy as the
 * neon city can spend most of a second doing that — while the car is already
 * moving. So all of it happens here instead, behind a card, and the race
 * starts when there is nothing left to do.
 *
 * The bar is the shared one, the same furniture the other games use.
 */
export class Loading {
  readonly root = document.createElement("div");

  private readonly bar: ProgressBar;
  private readonly says: HTMLParagraphElement;

  constructor(name: string) {
    this.root.className = "loading";

    const title = document.createElement("h1");
    title.textContent = name;

    const car = document.createElement("div");
    car.className = "loading-car";
    car.textContent = "🏎️";

    this.bar = new ProgressBar({
      label: "",
      width: 260,
      fillColour: "#f2c14a",
      doneColour: "#7fd46a",
    });

    this.says = document.createElement("p");
    this.says.textContent = "Warming up…";

    this.root.append(title, car, this.bar.root, this.says);
  }

  /** `done` is 0..1, and the words say what is being waited for. */
  set(done: number, what?: string): void {
    this.bar.set(Math.max(0, Math.min(1, done)));
    if (what) {
      this.says.textContent = what;
    }
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }

  /**
   * Fades out and removes itself.
   *
   * Resolves when it has gone, so whatever is behind it can be sure it is
   * looking at a clear screen.
   */
  async close(): Promise<void> {
    this.root.classList.add("gone");
    await new Promise(done => setTimeout(done, 260));
    this.root.remove();
  }
}
