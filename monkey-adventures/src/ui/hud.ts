import {ProgressBar} from "../../../shared/progressBar";
import {SoundButton} from "../../../shared/soundButton";

/**
 * The few things on screen that are not jungle.
 *
 * Laid over the canvas as ordinary HTML rather than drawn into the picture,
 * for one reason: the picture is 180 pixels tall, and text at that size is
 * either unreadable or enormous. A bar and a button do not have to be made
 * of the same pixels the jungle is.
 *
 * The bar is the repo's shared one. It is furniture — a child who has
 * learned what a filling bar means in the bee game or the car game should
 * meet the same thing here — and it brings its own stylesheet, so it does
 * not care that this game has no CSS to speak of.
 */
export class Hud {
  private readonly bar = new ProgressBar({label: "Home", width: 132});
  private readonly score: HTMLDivElement;
  private readonly done: HTMLDivElement;
  private readonly again: HTMLButtonElement;
  readonly root: HTMLDivElement;

  constructor(
    into: HTMLElement,
    onRestart: () => void,
    onMute: (muted: boolean) => void,
  ) {
    inject();

    this.root = document.createElement("div");
    this.root.className = "hud";

    const top = document.createElement("div");
    top.className = "hud-top";
    this.score = document.createElement("div");
    this.score.className = "hud-score";
    this.score.textContent = "🍌 0";
    // The mute, which is the repo's shared one for the same reason the bar
    // is: a child should find it in the same place and the same shape in
    // every game here. A game that makes a noise and cannot be hushed is a
    // game that gets played with the iPad face down.
    const sound = new SoundButton({onToggle: onMute});
    sound.root.classList.add("hud-tap");
    top.append(this.bar.root, this.score, sound.root);

    this.done = document.createElement("div");
    this.done.className = "hud-done hud-gone";
    const words = document.createElement("div");
    words.className = "hud-words";
    words.textContent = "Home!";
    this.again = document.createElement("button");
    this.again.className = "hud-again";
    this.again.textContent = "Restart?";
    this.again.addEventListener("click", onRestart);
    this.done.append(words, this.again);

    this.root.append(top, this.done);
    into.append(this.root);
  }

  /** How far along the jungle, 0 to 1. */
  setProgress(at: number): void {
    this.bar.set(at);
  }

  setScore(bananas: number): void {
    this.score.textContent = `🍌 ${bananas}`;
  }

  /** The card at the end, with the button on it. */
  setFinished(finished: boolean, bananas = 0, of = 0): void {
    this.done.classList.toggle("hud-gone", !finished);
    if (finished) {
      const words = this.done.querySelector(".hud-words");
      if (words) {
        words.textContent =
          bananas >= of && of > 0
            ? `Home! Every banana — ${bananas}`
            : `Home! ${bananas} banana${bananas === 1 ? "" : "s"}`;
      }
    }
  }
}

let styled = false;

/**
 * The HUD's own rules.
 *
 * Injected rather than put in a stylesheet because this game has no
 * stylesheet: everything else about it is a canvas. `pointer-events: none`
 * on the layer and back on for the button, so the bar never swallows a
 * thumb that was aiming at the jump.
 */
function inject(): void {
  if (styled) {
    return;
  }
  styled = true;
  const style = document.createElement("style");
  style.textContent = `
.hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: system-ui, -apple-system, sans-serif;
  color: #fff;
}
.hud-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: max(10px, env(safe-area-inset-top));
}
.hud-score {
  background: rgba(20, 26, 20, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  padding: 6px 14px;
  font-weight: 700;
  font-size: 14px;
  backdrop-filter: blur(8px);
  white-space: nowrap;
}
.hud-done {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  pointer-events: auto;
}
.hud-done.hud-gone {
  display: none;
}
.hud-tap {
  pointer-events: auto;
}
.hud-words {
  font-size: clamp(28px, 7vw, 54px);
  font-weight: 800;
  text-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
}
.hud-again {
  font: inherit;
  font-size: clamp(18px, 4.2vw, 26px);
  font-weight: 800;
  color: #2a1a10;
  background: #ffd257;
  border: none;
  border-radius: 999px;
  padding: 14px 34px;
  box-shadow: 0 4px 0 #c98f2a;
  cursor: pointer;
}
.hud-again:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 #c98f2a;
}
`;
  document.head.append(style);
}
