import {ENVIRONMENTS, NET, SHAPES} from "../config";
import chofterUrl from "../assets/chofter.png";
import {Party} from "../net/party";
import {Look} from "../net/protocol";
import {BUILT_INS, TrackSpec} from "../track/spec";
import {loadTracks} from "../track/store";
import {joinUrl, qrSquare} from "./qr";

/**
 * The room before the race: a code on the screen and the cars arriving.
 *
 * One screen for both ends of it, because they are the same screen with one
 * thing swapped — the host has the code and the button, a guest has the words
 * telling it what is about to happen. Writing them as two screens would have
 * meant keeping two lists of who is here in step.
 *
 * Joining is one camera and one scan: the host's code carries the whole address
 * of the game with the race on the end of it, so the other child points their
 * camera at it and their browser opens straight into the race. There is nothing
 * to type. The code is printed underneath all the same, because a camera that
 * will not focus is not a reason to give up on the game.
 */
export interface LobbyHandlers {
  /** Back to the track list. Closes the race. */
  onExit: () => void;
  /** The host, starting it: everybody loads this track. */
  onStart: (spec: TrackSpec) => void;
  /** The garage, so a child can pick their car while they wait. */
  onGarage: () => void;
}

export class Lobby {
  readonly root = document.createElement("div");

  /** Which track the host has picked. Guests have no say and are not shown a
   *  picker; it is the host's track, the way it is the host's house. */
  private chosen: TrackSpec;
  private readonly tracks: Array<TrackSpec>;
  /** The bits that are redrawn as people arrive, rather than the whole screen —
   *  rebuilding it all would take the QR code away and put it back, which on a
   *  screen somebody is pointing a camera at reads as a flicker. */
  private readonly who = document.createElement("div");
  private readonly says = document.createElement("p");
  private readonly go = document.createElement("button");
  private ticking = 0;

  constructor(
    private readonly party: Party,
    private readonly handlers: LobbyHandlers,
  ) {
    this.root.className = "screen lobby";
    this.tracks = [...BUILT_INS, ...loadTracks()];
    this.chosen = this.tracks[0];
    this.draw();
    party.onRoster = () => this.refresh();
    // The ping is worth showing: it is the one number that says whether the
    // race is going to feel right, and a child on the far side of a house can
    // watch it get better by walking towards the router.
    this.ticking = window.setInterval(() => this.refresh(), 1000);
  }

  dispose(): void {
    window.clearInterval(this.ticking);
    this.party.onRoster = undefined;
  }

  /** Called when the garage hands the screen back, since the car may have
   *  changed while it was away. */
  cameBack(): void {
    this.party.refreshLook();
    this.refresh();
  }

  private draw(): void {
    this.root.replaceChildren();

    const head = document.createElement("header");
    head.className = "menu-head";
    const title = document.createElement("h1");
    title.textContent = this.party.isHost ? "Race a friend" : "You're in!";
    head.append(homeLink(), title);

    const body = document.createElement("div");
    body.className = "lobby-body";

    if (this.party.isHost) {
      const card = document.createElement("div");
      card.className = "lobby-code";
      card.appendChild(qrSquare(joinUrl(this.party.code)));
      const how = document.createElement("p");
      how.className = "lobby-how";
      how.textContent = "Point the other iPad's camera at this.";
      const code = document.createElement("strong");
      code.className = "lobby-letters";
      code.textContent = this.party.code;
      card.append(how, code);
      body.appendChild(card);
    }

    const list = document.createElement("div");
    list.className = "lobby-side";
    this.who.className = "lobby-who";
    this.says.className = "lobby-says";
    list.append(this.who, this.says);

    if (this.party.isHost) {
      const picker = document.createElement("div");
      picker.className = "lobby-tracks";
      for (const spec of this.tracks) {
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "chip";
        pick.textContent = spec.name;
        pick.dataset.on = spec.id === this.chosen.id ? "yes" : "no";
        pick.style.borderColor = hex(ENVIRONMENTS[spec.environment].tarmac);
        pick.addEventListener("click", () => {
          this.chosen = spec;
          for (const other of picker.querySelectorAll("button")) {
            other.dataset.on = "no";
          }
          pick.dataset.on = "yes";
        });
        picker.appendChild(pick);
      }
      list.appendChild(picker);
    }

    body.appendChild(list);

    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const garage = document.createElement("button");
    garage.type = "button";
    garage.className = "chip";
    garage.textContent = "🎨 Your car";
    garage.addEventListener("click", () => this.handlers.onGarage());
    foot.appendChild(garage);

    if (this.party.isHost) {
      this.go.type = "button";
      this.go.className = "big-button";
      this.go.textContent = "Start the race";
      this.go.addEventListener("click", () =>
        this.handlers.onStart(this.chosen),
      );
      foot.appendChild(this.go);
    }

    const out = document.createElement("button");
    out.type = "button";
    out.className = "chip ghost";
    out.textContent = "Leave";
    out.addEventListener("click", () => this.handlers.onExit());
    foot.appendChild(out);

    this.root.append(head, body, foot);
    this.refresh();
  }

  /** Who is here, as their cars. No names anywhere: a child's car *is* their
   *  name, which needs no keyboard and no reading. */
  private refresh(): void {
    this.who.replaceChildren();
    for (const seat of [...this.party.seats.values()].sort(
      (a, b) => a.seat - b.seat,
    )) {
      this.who.appendChild(
        carChip(
          seat.look,
          this.party.name(seat.seat),
          seat.seat === this.party.seat,
        ),
      );
    }
    for (let empty = this.party.seats.size; empty < NET.most; empty++) {
      const slot = document.createElement("div");
      slot.className = "lobby-car empty";
      slot.textContent = "waiting…";
      this.who.appendChild(slot);
    }

    const ping = this.party.ping;
    const lag = ping > 0 ? ` (${ping} ms away)` : "";
    if (this.party.isHost) {
      const alone = this.party.size < 2;
      this.go.disabled = alone;
      this.says.textContent = alone
        ? "Nobody has joined yet."
        : `Ready when you are${lag}.`;
    } else {
      this.says.textContent = `Waiting for the other iPad to start${lag}.`;
    }
  }
}

/** One car, as a chip: the shape it is, in the colour it is painted. */
function carChip(look: Look, name: string, mine: boolean): HTMLElement {
  const chip = document.createElement("div");
  chip.className = mine ? "lobby-car mine" : "lobby-car";
  const dot = document.createElement("span");
  dot.className = "lobby-dot";
  dot.style.background = hex(look.colour);
  const what = SHAPES.find(s => s.id === look.shape);
  const words = document.createElement("span");
  words.textContent = `${what?.emoji ?? "🏎️"} ${name}`;
  chip.append(dot, words);
  return chip;
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
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
