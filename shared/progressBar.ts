/**
 * The progress bar both games use.
 *
 * The one piece of code in this repo that two games share, and it is here
 * rather than copied into each of them because it is a piece of *furniture*: a
 * child who has learned what a filling bar means in one game should meet the
 * same thing in the next, and two copies drift the moment one of them is
 * touched.
 *
 * It brings its own stylesheet. A shared widget cannot depend on the host
 * game's CSS — the games have separate hand-written stylesheets with no class
 * names in common — so the rules are injected once, under their own prefix,
 * the first time a bar is made. Colours defer to the host's variables where it
 * has them and fall back to its own where it doesn't.
 */

const CLASS = "sharedbar";

const CSS = `
.${CLASS} {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel, rgba(20, 26, 20, 0.55));
  border: 1px solid var(--stroke, rgba(255, 255, 255, 0.22));
  border-radius: 999px;
  padding: 6px 14px 6px 12px;
  backdrop-filter: blur(8px);
  color: var(--ink, #fff);
  font-weight: 700;
}

.${CLASS}.${CLASS}-hidden {
  display: none;
}

.${CLASS}-label {
  font-size: 12px;
  letter-spacing: 0.4px;
  opacity: 0.85;
  white-space: nowrap;
}

.${CLASS}-track {
  width: 116px;
  height: 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.${CLASS}-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  background: #ffd257;
  transition:
    width 180ms ease-out,
    background 240ms linear;
}
`;

let styled = false;

function injectStyles(): void {
  if (styled) {
    return;
  }
  styled = true;
  const style = document.createElement("style");
  style.dataset.sharedbar = "";
  style.textContent = CSS;
  document.head.appendChild(style);
}

export interface ProgressBarOptions {
  /** Words in front of the track. Empty for a bar that needs none. */
  label?: string;
  /** How wide the track is, in pixels. */
  width?: number;
  /**
   * Colour it goes when it is full. Until then it is amber — the change is
   * what says "that's it, you're done" without any words to read.
   */
  doneColour?: string;
  /** Colour while it is filling. */
  fillColour?: string;
}

export class ProgressBar {
  /** Put this where you want the bar. It is styled and sized already. */
  readonly root: HTMLDivElement;

  private readonly labelEl: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly doneColour: string;
  private readonly fillColour: string;
  /** What is on screen now, so an unchanged value doesn't restart the ease. */
  private shown = -1;

  constructor(options: ProgressBarOptions = {}) {
    injectStyles();
    this.doneColour = options.doneColour ?? "#8fe36b";
    this.fillColour = options.fillColour ?? "#ffd257";

    this.root = document.createElement("div");
    this.root.className = CLASS;

    this.labelEl = document.createElement("div");
    this.labelEl.className = `${CLASS}-label`;
    this.labelEl.textContent = options.label ?? "";

    const track = document.createElement("div");
    track.className = `${CLASS}-track`;
    if (options.width !== undefined) {
      track.style.width = `${options.width}px`;
    }

    this.fill = document.createElement("div");
    this.fill.className = `${CLASS}-fill`;
    this.fill.style.background = this.fillColour;
    track.appendChild(this.fill);

    this.root.append(this.labelEl, track);
  }

  setLabel(text: string): void {
    this.labelEl.textContent = text;
    this.labelEl.style.display = text === "" ? "none" : "";
  }

  /** How full it is, from 0 to 1. Anything outside that is clamped. */
  set(fraction: number): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    if (clamped === this.shown) {
      return;
    }
    this.shown = clamped;
    this.fill.style.width = `${clamped * 100}%`;
    this.fill.style.background =
      clamped >= 1 ? this.doneColour : this.fillColour;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle(`${CLASS}-hidden`, !visible);
  }
}
