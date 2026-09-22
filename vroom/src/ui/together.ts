import chofterUrl from "../assets/chofter.png";
import {ENVIRONMENTS} from "../config";
import {BUILT_INS, TrackSpec} from "../track/spec";
import {loadTracks} from "../track/store";
import {ratingBadge, swatch} from "./swatch";

/**
 * Racing a friend: which end of it are you?
 *
 * Two children with two iPads both tap the same button, and from there they
 * want opposite things — one of them is putting a race on and the other is
 * looking for one. Asking straight out is the whole of this screen, in the
 * plainest words there are for it: one of you picks the track, the other points
 * a camera at their screen or types what it says.
 *
 * It used to be one button that always made you the host, which meant the
 * second child had to know that joining was hidden somewhere else entirely.
 */
export interface TogetherHandlers {
  /** You are putting the race on: pick the track and show the code. */
  onHost: (spec: TrackSpec) => void;
  /** You are joining one: by typing the code, or by pointing at it. */
  onType: () => void;
  onScan: () => void;
  onCancel: () => void;
}

export class Together {
  readonly root = document.createElement("div");

  /** Which half of the screen is showing: the three choices, or the tracks. */
  private picking = false;

  constructor(
    private readonly handlers: TogetherHandlers,
    /** Straight to the tracks: a host having second thoughts about which one,
     *  with a race already open and people in it. */
    picking = false,
  ) {
    this.root.className = "screen together";
    this.picking = picking;
    this.draw();
  }

  private draw(): void {
    this.root.replaceChildren();

    const head = document.createElement("header");
    head.className = "menu-head";
    const title = document.createElement("h1");
    title.textContent = this.picking ? "Pick the track" : "Race a friend";
    head.append(homeLink(), title);

    const body = document.createElement("div");
    body.className = this.picking ? "menu-list" : "together-body";
    if (this.picking) {
      this.drawTracks(body);
    } else {
      this.drawChoices(body);
    }

    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "chip ghost";
    back.textContent = "Back";
    back.addEventListener("click", () => {
      if (this.picking) {
        this.picking = false;
        this.draw();
      } else {
        this.handlers.onCancel();
      }
    });
    foot.appendChild(back);

    this.root.append(head, body, foot);
  }

  private drawChoices(body: HTMLElement): void {
    const says = document.createElement("p");
    says.className = "together-says";
    says.textContent = "Both iPads need to be on the same wi-fi.";
    body.appendChild(says);

    body.appendChild(
      choice("🏁", "Choose a track", "You put the race on", () => {
        this.picking = true;
        this.draw();
      }),
    );
    body.appendChild(
      choice("⌨️", "Enter a code", "Type the letters they read out", () =>
        this.handlers.onType(),
      ),
    );
    body.appendChild(
      choice("📷", "Scan a QR code", "Point at the other screen", () =>
        this.handlers.onScan(),
      ),
    );
  }

  /** Every track there is, the ones that ship with the game and a child's own,
   *  in the same order and the same clothes as the front screen shows them. */
  private drawTracks(body: HTMLElement): void {
    for (const spec of [...BUILT_INS, ...loadTracks()]) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "track-card pick";
      const words = document.createElement("div");
      words.className = "track-words";
      const name = document.createElement("strong");
      name.textContent = spec.name;
      const sub = document.createElement("span");
      const bits: Array<string> = [ENVIRONMENTS[spec.environment].name];
      bits.push(spec.laps === 1 ? "1 lap" : `${spec.laps} laps`);
      if (spec.items.length > 0) {
        bits.push(
          `${spec.items.length} ${spec.items.length === 1 ? "thing" : "things"} on it`,
        );
      }
      sub.textContent = bits.join(" · ");
      // How hard it is, the same badge the front screen shows: picking the
      // track for a race with a friend is exactly the moment somebody wants to
      // know whether they are about to hand everybody a hairpin.
      words.append(name, sub, ratingBadge(spec));
      card.append(swatch(spec), words);
      card.addEventListener("click", () => this.handlers.onHost(spec));
      body.appendChild(card);
    }
  }
}

/** One of the three ways in: a big target with a picture, a name and a line
 *  saying what happens if you tap it. */
function choice(
  icon: string,
  name: string,
  what: string,
  onPress: () => void,
): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "together-choice";
  const mark = document.createElement("span");
  mark.className = "together-icon";
  mark.textContent = icon;
  const words = document.createElement("span");
  words.className = "together-words";
  const strong = document.createElement("strong");
  strong.textContent = name;
  const sub = document.createElement("span");
  sub.textContent = what;
  words.append(strong, sub);
  button.append(mark, words);
  button.addEventListener("click", onPress);
  return button;
}

/** The same mark as the menu's, and the same reason for it. */
function homeLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "home-link";
  link.href = "../../";
  link.title = "All the Chofter games";
  link.setAttribute("aria-label", "All the Chofter games");
  const img = document.createElement("img");
  img.src = chofterUrl;
  img.alt = "";
  img.width = 40;
  img.height = 40;
  link.appendChild(img);
  return link;
}
