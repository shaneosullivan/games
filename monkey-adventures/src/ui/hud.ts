import {PARTS, RAIN} from "../config";
import {propSprite} from "../art/monkey";
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
  private readonly start: HTMLDivElement;
  private readonly lives: HTMLDivElement;
  readonly root: HTMLDivElement;

  constructor(
    into: HTMLElement,
    onRestart: () => void,
    onMute: (muted: boolean) => void,
    onBegin: (at: number) => void,
    onRain: () => void,
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
    sound.root.classList.add("hud-tap", "ui-interactive");
    top.append(this.bar.root, this.score, sound.root);

    // The lives, in the top right, which is where a child who has played
    // anything else will look for them. Hearts drawn from the game's own
    // sprites and blown up, rather than an emoji or a number: the rest of
    // the picture is made of pixels and so is this.
    this.lives = document.createElement("div");
    this.lives.className = "hud-lives hud-gone";
    this.root.append(this.lives);

    this.done = document.createElement("div");
    this.done.className = "hud-done hud-gone";
    const words = document.createElement("div");
    words.className = "hud-words";
    words.textContent = "Home!";
    this.again = document.createElement("button");
    this.again.className = "hud-again ui-interactive";
    this.again.textContent = "Restart?";
    this.again.addEventListener("click", () => {
      this.again.blur();
      onRestart();
    });
    this.done.append(words, this.again);

    // The chooser the game opens on. One button a part, in order, and the
    // first of them is where the game starts if nobody cares — so a child
    // who taps the big obvious thing gets the beginning of the jungle.
    this.start = document.createElement("div");
    this.start.className = "hud-done hud-start";
    const asks = document.createElement("div");
    asks.className = "hud-words";
    asks.textContent = "Start where?";
    const row = document.createElement("div");
    row.className = "hud-parts";
    for (const part of PARTS) {
      const button = document.createElement("button");
      // Each button wears the colour of the place it goes to; the rule
      // reads them off these three custom properties, so the pressed
      // state keeps the right shadow without five more rules.
      button.className = "hud-again hud-part ui-interactive";
      button.style.setProperty("--face", part.tint.face);
      button.style.setProperty("--under", part.tint.under);
      button.style.setProperty("--ink", part.tint.ink);
      button.textContent = part.name;
      button.addEventListener("click", () => {
        // Handing the focus back, or the space bar presses this button
        // again instead of jumping for the rest of the game.
        button.blur();
        this.setChoosing(false);
        if (part.rain) {
          onRain();
        } else {
          onBegin(part.at);
        }
      });
      row.append(button);
    }
    this.start.append(asks, row);

    this.root.append(top, this.done, this.start);
    into.append(this.root);
  }

  /**
   * The hearts in the corner: how many are left of how many.
   *
   * Hidden altogether outside the rain level — the jungle has no lives to
   * lose, and a row of hearts that never changes is furniture a child
   * learns to ignore, which is the last thing you want of the one thing
   * that says how much trouble they are in.
   */
  setLives(left: number, of: number = RAIN.lives): void {
    this.lives.classList.toggle("hud-gone", of <= 0);
    if (of <= 0) {
      return;
    }
    if (this.lives.childElementCount !== of) {
      this.lives.replaceChildren();
      for (let i = 0; i < of; i++) {
        this.lives.append(document.createElement("canvas"));
      }
    }
    const hearts = Array.from(this.lives.children) as Array<HTMLCanvasElement>;
    hearts.forEach((canvas, i) => {
      const sprite = propSprite(i < left ? "heart" : "heartGone");
      const scale = 4;
      if (canvas.width !== sprite.width * scale) {
        canvas.width = sprite.width * scale;
        canvas.height = sprite.height * scale;
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
    });
  }

  /** Shows or hides the chooser. The game stands still behind it. */
  setChoosing(choosing: boolean): void {
    this.start.classList.toggle("hud-gone", !choosing);
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
  position: absolute;
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
.hud-lives {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
  display: flex;
  gap: 4px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4));
}
.hud-lives.hud-gone {
  display: none;
}
.hud-lives canvas {
  display: block;
  image-rendering: pixelated;
}
.hud-parts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 92vw;
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
/* A part of the course wears its own colour, set on the button as three
   custom properties. Written after the gold and not before it: the two
   rules have the same weight, so whichever is last is the one that
   counts, and the gold would otherwise paint every button again. */
.hud-part {
  font-size: clamp(15px, 3vw, 20px);
  padding: 12px 22px;
  background: var(--face);
  box-shadow: 0 4px 0 var(--under);
  color: var(--ink);
}
.hud-part:active {
  box-shadow: 0 1px 0 var(--under);
}

`;
  document.head.append(style);
}
