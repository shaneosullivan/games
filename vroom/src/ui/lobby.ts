import {NET, SHAPES} from "../config";
import chofterUrl from "../assets/chofter.png";
import {Party} from "../net/party";
import {Look} from "../net/protocol";
import {TrackSpec} from "../track/spec";
import {joinUrl, qrSquare} from "./qr";
import {hex, swatch} from "./swatch";

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
  /** The host, starting it: everybody loads the track it was opened with. */
  onStart: (spec: TrackSpec) => void;
  /** The garage, so a child can pick their car while they wait. */
  onGarage: () => void;
  /** Second thoughts about the track, before anybody has driven anywhere. */
  onChangeTrack: () => void;
}

export class Lobby {
  readonly root = document.createElement("div");

  /** The track this race is on, chosen before the room was ever opened. Guests
   *  are shown it and have no say: it is the host's track, the way it is the
   *  host's house. */
  /** Which track was on the screen last time it was drawn, so a guest being
   *  told what the race is — which arrives after the lobby is already up —
   *  redraws it once rather than every second. */
  private shown: string | null = null;
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
    this.shown = this.party.spec?.id ?? null;

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

    // What everybody is about to race, so a guest knows what they have joined
    // and a host can see they picked the one they meant to.
    const chosen = this.party.spec;
    if (chosen) {
      const on = document.createElement("div");
      on.className = "lobby-track";
      const words = document.createElement("div");
      words.className = "track-words";
      const name = document.createElement("strong");
      name.textContent = chosen.name;
      const sub = document.createElement("span");
      sub.textContent = chosen.laps === 1 ? "1 lap" : `${chosen.laps} laps`;
      words.append(name, sub);
      on.append(swatch(chosen), words);
      if (this.party.isHost) {
        const change = document.createElement("button");
        change.type = "button";
        change.className = "chip ghost";
        change.textContent = "Change";
        change.addEventListener("click", () => this.handlers.onChangeTrack());
        on.appendChild(change);
      }
      list.appendChild(on);
    }

    body.appendChild(list);

    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const garage = document.createElement("button");
    garage.type = "button";
    garage.className = "chip";
    garage.textContent = "🎨 Your car and name";
    garage.addEventListener("click", () => this.handlers.onGarage());
    foot.appendChild(garage);

    if (this.party.isHost) {
      this.go.type = "button";
      this.go.className = "big-button";
      this.go.textContent = "Start the race";
      this.go.addEventListener("click", () => {
        const spec = this.party.spec;
        if (spec) {
          this.handlers.onStart(spec);
        }
      });
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
    if ((this.party.spec?.id ?? null) !== this.shown) {
      this.draw();
      return;
    }
    this.who.replaceChildren();
    for (const seat of [...this.party.seats.values()].sort(
      (a, b) => a.seat - b.seat,
    )) {
      // Your own name rather than "You" in this one place: a child who has
      // just typed it wants to see that it took.
      this.who.appendChild(
        carChip(
          seat.look,
          seat.name || this.party.name(seat.seat),
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
