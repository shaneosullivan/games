import {ENVIRONMENTS, LAYOUT, Palette} from "../config";
import {deleteTrack, loadTracks} from "../track/store";
import {BUILT_INS, TrackSpec} from "../track/spec";
import {outline} from "../track/outline";
import {rate, RATING_NAMES} from "../track/rating";
import {Garage} from "./garage";

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
  /** The model viewer. Development builds only. */
  onModels: () => void;
  /** The garage: which car is yours. */
  onGarage: () => void;
}

/** SVG lives in its own namespace, and an element made without it is an
 *  element the browser draws as nothing at all. */
const SVG = "http://www.w3.org/2000/svg";

/** The card's picture, in its own little coordinate system: a hundred across,
 *  with room at the edges for half the width of the road. */
const SHAPE = {
  size: 100,
  pad: 14,
  road: 15,
  middle: 2,
  dashes: "5 7",
} as const;

export class Menu {
  readonly root = document.createElement("div");

  /** The car, beside the list, when there is room for it. */
  private garage: Garage | null = null;
  private wide = Menu.roomForBoth();

  constructor(private readonly handlers: MenuHandlers) {
    this.root.className = "screen menu";
    this.draw();
    window.addEventListener("resize", this.onResize);
  }

  /** Is there room for the track list and the car side by side? */
  private static roomForBoth(): boolean {
    return window.innerWidth >= LAYOUT.wide;
  }

  /**
   * Rebuilt only when the answer changes.
   *
   * The garage owns a WebGL context, so it is built when it is shown and given
   * back when it is not — a browser hands out about sixteen of those and then
   * starts quietly dropping the oldest, and a phone turned back and forth
   * would get through them.
   */
  private onResize = (): void => {
    const now = Menu.roomForBoth();
    if (now !== this.wide) {
      this.wide = now;
      this.draw();
    }
  };

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.garage?.dispose();
    this.garage = null;
  }

  /** Rebuilt from the store rather than patched, so deleting a track and the
   *  list agreeing about it cannot come apart. */
  private draw(): void {
    this.garage?.dispose();
    this.garage = null;
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
    for (const spec of BUILT_INS) {
      list.appendChild(this.card(spec, false));
    }

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

    // On a phone the car goes behind a button; on anything wider it is already
    // on the screen and the button would only lead to where you are.
    const garage = document.createElement("button");
    garage.type = "button";
    garage.className = "chip";
    garage.textContent = "🎨 Your car";
    garage.addEventListener("click", () => this.handlers.onGarage());

    const foot = document.createElement("div");
    foot.className = "menu-foot";

    // In the built game as well as the dev server. It began as a tool for
    // building the game and it was hidden in a production build, which meant
    // the one place anybody actually plays this was the one place it could not
    // be reached. It is a room full of the things in the game, turning round;
    // there is nothing in it a child should not find.
    const models = document.createElement("button");
    models.type = "button";
    models.className = "chip";
    models.textContent = "🧊 Models";
    models.addEventListener("click", () => this.handlers.onModels());
    foot.appendChild(models);
    const home = document.createElement("a");
    home.className = "chip";
    home.href = "../../";
    home.textContent = "🏠 Chofter Games";
    foot.append(build);
    if (!this.wide) {
      foot.appendChild(garage);
    }
    foot.appendChild(home);

    if (!this.wide) {
      this.root.append(head, list, foot);
      return;
    }

    // Two columns: the races on one side, the car on the other.
    const split = document.createElement("div");
    split.className = "menu-split";
    const races = document.createElement("div");
    races.className = "menu-races";
    races.append(list, foot);

    this.garage = new Garage(null, true);
    const beside = document.createElement("div");
    beside.className = "menu-car";
    beside.appendChild(this.garage.root);

    split.append(races, beside);
    this.root.append(head, split);
  }

  /**
   * The little picture on a card: the circuit itself, in its own colours.
   *
   * It was a plain square of the environment's ground colour, which told a
   * child which of their four green tracks this was — that is, nothing. The
   * road is drawn as one fat stroke with a thin centre line down it, the same
   * two colours the real thing uses, on the same ground.
   */
  private shapeOf(spec: TrackSpec, palette: Palette): HTMLElement {
    const box = document.createElementNS(SVG, "svg");
    box.setAttribute("class", "track-swatch");
    box.setAttribute("viewBox", `0 0 ${SHAPE.size} ${SHAPE.size}`);
    box.setAttribute("aria-hidden", "true");
    box.style.background = hex(palette.ground);
    box.style.borderColor = hex(palette.kerbA);

    const d = outline(spec, SHAPE.size, SHAPE.pad);
    const road = document.createElementNS(SVG, "path");
    road.setAttribute("d", d);
    road.setAttribute("fill", "none");
    road.setAttribute("stroke", hex(palette.tarmac));
    road.setAttribute("stroke-width", String(SHAPE.road));
    road.setAttribute("stroke-linejoin", "round");

    const line = document.createElementNS(SVG, "path");
    line.setAttribute("d", d);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", hex(palette.line));
    line.setAttribute("stroke-width", String(SHAPE.middle));
    line.setAttribute("stroke-dasharray", SHAPE.dashes);
    line.setAttribute("stroke-linejoin", "round");

    box.append(road, line);
    return box as unknown as HTMLElement;
  }

  private card(spec: TrackSpec, mine: boolean): HTMLElement {
    const card = document.createElement("div");
    card.className = "track-card";

    const palette = ENVIRONMENTS[spec.environment];
    const swatch = this.shapeOf(spec, palette);

    const words = document.createElement("div");
    words.className = "track-words";
    const name = document.createElement("strong");
    name.textContent = spec.name;
    const sub = document.createElement("span");
    const bits: Array<string> = [palette.name];
    bits.push(spec.laps === 1 ? "1 lap" : `${spec.laps} laps`);
    if (spec.items.length > 0) {
      bits.push(
        `${spec.items.length} ${spec.items.length === 1 ? "thing" : "things"} on it`,
      );
    }
    sub.textContent = bits.join(" · ");
    words.append(name, sub);

    // Worked out from the track, not claimed by whoever drew it — which is the
    // only way a rating means anything to the next person to pick it.
    const rating = rate(spec);
    const badge = document.createElement("span");
    badge.className = "rating";
    badge.dataset.rating = rating;
    badge.textContent = RATING_NAMES[rating];
    words.appendChild(badge);

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
