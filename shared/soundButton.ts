/**
 * The sound switch both games use.
 *
 * Furniture, in the sense the repo's CLAUDE.md means it: a child who has
 * learned that the round speaker button turns the noise off should meet the
 * same button, in the same shape, in every game here. It came from the bee
 * game's HUD and keeps that game's look exactly — a 48px disc with the panel
 * background — because that is the one already in front of players.
 *
 * It brings its own stylesheet: the games have separate hand-written CSS with
 * no class names in common, so a shared widget that leaned on the host's rules
 * would look right in one game and unstyled in the other. Colours defer to the
 * host's variables where it has them, and fall back where it doesn't.
 */

const CLASS = "sharedsound";

const CSS = `
.${CLASS} {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--stroke, rgba(255, 255, 255, 0.22));
  background: var(--panel, rgba(20, 26, 20, 0.55));
  color: var(--ink, #fff);
  font-size: 20px;
  line-height: 1;
  display: grid;
  place-items: center;
  padding: 0;
  backdrop-filter: blur(8px);
  cursor: pointer;
}

.${CLASS}:active {
  transform: scale(0.93);
}
`;

let styled = false;

function injectStyles(): void {
  if (styled) {
    return;
  }
  styled = true;
  const style = document.createElement("style");
  style.dataset.sharedsound = "";
  style.textContent = CSS;
  document.head.appendChild(style);
}

export interface SoundButtonOptions {
  /** Called with the new state every time it is pressed. */
  onToggle: (muted: boolean) => void;
  /** Whether it starts muted. */
  muted?: boolean;
  /**
   * Extra classes for the host to position or hook it with — the bee game's
   * `ui-interactive`, for instance, which is how its overlay layer knows a tap
   * is meant for a control rather than for the world behind it.
   */
  className?: string;
}

export class SoundButton {
  /** Put this where you want it. It is styled and sized already. */
  readonly root: HTMLButtonElement;

  private muted: boolean;

  constructor(options: SoundButtonOptions) {
    injectStyles();
    this.muted = options.muted ?? false;

    this.root = document.createElement("button");
    this.root.className = options.className
      ? `${CLASS} ${options.className}`
      : CLASS;
    this.root.addEventListener("click", () => {
      this.set(!this.muted);
      options.onToggle(this.muted);
    });
    this.draw();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Sets the state without calling back — for a game restoring a save. */
  set(muted: boolean): void {
    this.muted = muted;
    this.draw();
  }

  private draw(): void {
    this.root.textContent = this.muted ? "🔇" : "🔊";
    // The label says what pressing it will do, not what is happening: that is
    // the way round anyone reads a button.
    this.root.setAttribute(
      "aria-label",
      this.muted ? "Turn the sound on" : "Turn the sound off",
    );
  }
}
