import {ENVIRONMENTS} from "../config";
import {deleteTrack, loadTracks} from "../track/store";
import {BUILT_IN, TrackSpec} from "../track/spec";

/**
 * The track list: what you see when the game opens.
 *
 * Two sections, because there are two kinds of track and they are not the same
 * kind of thing. The circuit the game ships with is furniture — always there,
 * cannot be deleted. The custom ones are a child's own, and each carries the
 * buttons that only make sense for something you made: edit it, throw it away.
 */
export interface MenuHandlers {
  onPlay: (spec: TrackSpec) => void;
  onBuild: () => void;
  onEdit: (spec: TrackSpec) => void;
}

export class Menu {
  readonly root = document.createElement("div");

  constructor(private readonly handlers: MenuHandlers) {
    this.root.className = "screen menu";
    this.draw();
  }

  /** Rebuilt from the store rather than patched, so deleting a track and the
   *  list agreeing about it cannot come apart. */
  private draw(): void {
    this.root.replaceChildren();

    const head = document.createElement("header");
    head.className = "menu-head";
    const title = document.createElement("h1");
    title.textContent = "Vroom";
    const blurb = document.createElement("p");
    blurb.textContent = "Pick a track, or draw one of your own.";
    head.append(title, blurb);

    const list = document.createElement("div");
    list.className = "menu-list";

    list.appendChild(section("Race"));
    list.appendChild(this.card(BUILT_IN, false));

    list.appendChild(section("Custom tracks"));
    const mine = loadTracks();
    if (mine.length === 0) {
      const empty = document.createElement("p");
      empty.className = "menu-empty";
      empty.textContent = "None yet. Tap Build your own track to draw one.";
      list.appendChild(empty);
    }
    for (const spec of mine) {
      list.appendChild(this.card(spec, true));
    }

    const build = document.createElement("button");
    build.type = "button";
    build.className = "big-button";
    build.textContent = "Build your own track";
    build.addEventListener("click", () => this.handlers.onBuild());

    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const home = document.createElement("a");
    home.className = "chip";
    home.href = "../../";
    home.textContent = "🏠 Chofter Games";
    foot.append(build, home);

    this.root.append(head, list, foot);
  }

  private card(spec: TrackSpec, mine: boolean): HTMLElement {
    const card = document.createElement("div");
    card.className = "track-card";

    const swatch = document.createElement("span");
    swatch.className = "track-swatch";
    const palette = ENVIRONMENTS[spec.environment];
    swatch.style.background = hex(palette.ground);
    swatch.style.borderColor = hex(palette.kerbA);

    const words = document.createElement("div");
    words.className = "track-words";
    const name = document.createElement("strong");
    name.textContent = spec.name;
    const sub = document.createElement("span");
    const bits: Array<string> = [palette.name];
    if (spec.items.length > 0) {
      bits.push(
        `${spec.items.length} ${spec.items.length === 1 ? "thing" : "things"} on it`,
      );
    }
    sub.textContent = bits.join(" · ");
    words.append(name, sub);

    const play = document.createElement("button");
    play.type = "button";
    play.className = "chip strong";
    play.textContent = "Race";
    play.addEventListener("click", () => this.handlers.onPlay(spec));

    card.append(swatch, words, play);

    if (mine) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "chip";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => this.handlers.onEdit(spec));

      const bin = document.createElement("button");
      bin.type = "button";
      bin.className = "chip ghost";
      bin.textContent = "Delete";
      bin.addEventListener("click", () => {
        // Two taps to lose a track: the button turns into its own
        // confirmation rather than opening a dialog, which is one fewer thing
        // on the screen and impossible to mis-tap.
        if (bin.dataset.sure === "yes") {
          deleteTrack(spec.id);
          this.draw();
        } else {
          bin.dataset.sure = "yes";
          bin.textContent = "Sure?";
        }
      });
      card.append(edit, bin);
    }

    return card;
  }
}

function section(text: string): HTMLElement {
  const h = document.createElement("h2");
  h.className = "menu-section";
  h.textContent = text;
  return h;
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
