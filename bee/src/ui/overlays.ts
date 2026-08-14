import chofterUrl from "../assets/chofter.png";
import mapUrl from "../assets/levelmap.jpg";
import {LANDS, landForLevel, type Land} from "../levels/lands";

/** Full-screen modal cards: codename entry and level-complete. */

export interface Overlay {
  root: HTMLDivElement;
  show(): void;
  hide(): void;
  /** Re-word the card, so one overlay can serve every level. */
  setText(title: string, body: string): void;
  /** Re-word the button too. Only the message card has one to re-word. */
  setButton?(label: string): void;
}

function makeOverlay(host: HTMLElement): {
  root: HTMLDivElement;
  card: HTMLDivElement;
} {
  const root = document.createElement("div");
  // `ui-interactive` keeps the floating thumbstick from planting itself when
  // you drag on a modal.
  root.className = "overlay ui-interactive hidden";
  const card = document.createElement("div");
  card.className = "card";
  root.appendChild(card);
  host.appendChild(root);
  return {root, card};
}

/**
 * The Chofter mark in the corner of the menu, and the way out of the game.
 *
 * It points at the site root rather than a relative path on purpose: the game
 * is staged at /games/<name>/, and the thing a player wants from this is the
 * gallery of every game, which is always at "/". That holds in the installed
 * app too — games live on the gallery's own origin, so this stays inside it
 * rather than kicking out to a browser.
 */
function createHomeLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "home-link";
  link.href = "/";
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

/**
 * Keep an overlay inside the *visible* viewport.
 *
 * When iPad Safari raises the keyboard the layout viewport doesn't shrink, so a
 * vertically-centred card stays put and the keyboard covers it — which is
 * exactly what hides the codename field. The visual viewport does shrink, so
 * we size the overlay to that instead and the card re-centres above the keys.
 */
function trackVisualViewport(root: HTMLDivElement): () => void {
  const vv = window.visualViewport;
  if (!vv) {
    return () => {};
  }

  const apply = () => {
    root.style.top = `${vv.offsetTop}px`;
    root.style.bottom = "auto";
    root.style.height = `${vv.height}px`;
  };
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  apply();

  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    root.style.top = "";
    root.style.bottom = "";
    root.style.height = "";
  };
}

/**
 * Codenames are shown back to the player and persisted, so keep them to
 * ordinary printable characters. This also cleans up anything odd that iOS
 * AutoFill might drop in — it offers to fill contact details and passwords
 * into any text field, and one tap can leave junk in a field meant for
 * "ROSIE".
 */
function sanitizeCodename(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .replace(/[^\p{L}\p{N} '\-!?.]/gu, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, 14);
}

export interface LevelChoice {
  number: number;
  name: string;
  /** Shown under the name, e.g. "Replay". */
  note?: string;
}

export interface CodenameOptions {
  existing: string;
  /** Every level that exists, whether or not it's unlocked yet. */
  levels: ReadonlyArray<LevelChoice>;
  /** Highest level the player has reached; anything above it stays locked. */
  unlocked: number;
  /** Which level is selected when the card opens. */
  selected: number;
  onStart: (codename: string, level: number) => void;
  onReset: () => void;
}

export function createCodenameScreen(
  host: HTMLElement,
  opts: CodenameOptions,
): Overlay {
  const {levels, unlocked, selected, onStart, onReset} = opts;
  const existing = sanitizeCodename(opts.existing);
  const {root, card} = makeOverlay(host);
  card.appendChild(createHomeLink());

  const h1 = document.createElement("h1");
  h1.textContent = existing ? "Where to?" : "Bee a Queen";
  const p = document.createElement("p");
  p.textContent = existing
    ? levels.length > 1
      ? "Pick where you want to fly."
      : "Ready to get back to the meadow?"
    : "Every queen needs a code name. Choose yours.";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 14;
  input.spellcheck = false;
  input.placeholder = "CODE NAME";
  input.value = existing;
  // Talk iOS out of offering AutoFill / Passwords on what is just a nickname.
  // `name` matters as much as `autocomplete` — Safari sniffs it.
  input.name = "codename";
  input.autocomplete = "off";
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "characters");
  input.setAttribute("enterkeyhint", "go");
  input.setAttribute("data-1p-ignore", "");
  input.setAttribute("data-lpignore", "true");

  const start = document.createElement("button");
  start.textContent = existing ? "Continue" : "Start";

  /*
   * Once you have a name, this screen is the map and nothing else.
   *
   * It is reached far more often mid-game than at the start — the 🏠 button,
   * and finishing the last level — and every one of those times the player is
   * here to choose where to fly, not to introduce themselves. Leading with a
   * big text box makes it read as a sign-in and buries the thing they came
   * for. The name becomes a quiet chip that turns back into the field if it's
   * tapped, so it can still be changed without erasing a hive to do it.
   */
  const nameChip = document.createElement("button");
  nameChip.type = "button";
  nameChip.className = "name-chip";
  nameChip.textContent = existing;
  nameChip.title = "Change your code name";
  nameChip.setAttribute("aria-label", `Code name ${existing}. Tap to change.`);
  nameChip.addEventListener("click", () => {
    nameChip.replaceWith(input);
    input.focus();
    input.select();
  });

  const sync = () => {
    // Clean as they type, so autofilled junk never survives to the save.
    const cleaned = sanitizeCodename(input.value);
    if (cleaned !== input.value) {
      const caret = input.selectionStart ?? cleaned.length;
      input.value = cleaned;
      input.setSelectionRange(caret - 1, caret - 1);
    }
    start.disabled = cleaned.trim().length === 0;
  };
  input.addEventListener("input", sync);
  input.addEventListener("change", sync);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !start.disabled) {
      input.blur(); // drop the keyboard before the card goes away
      start.click();
    }
  });
  // Focusing raises the keyboard; make sure the field ends up in view.
  input.addEventListener("focus", () => {
    setTimeout(
      () => input.scrollIntoView({block: "center", behavior: "smooth"}),
      250,
    );
  });
  sync();

  // ---- world map picker ---------------------------------------------------
  //
  // The map is the navigation: tap a land, then (if it holds more than one)
  // pick a level within it. Lands you haven't reached show a padlock, and
  // lands with nothing built yet are marked as still to come.

  let chosen = selected;
  const picker = document.createElement("div");
  picker.className = "levels";

  const hasMap = levels.length > 1;
  const side = document.createElement("div");
  side.className = "picker-side";

  if (hasMap) {
    card.classList.add("card-wide");

    const heading = document.createElement("div");
    heading.className = "levels-heading";
    heading.textContent = "Where to?";

    const mapWrap = document.createElement("div");
    mapWrap.className = "map";
    const img = document.createElement("img");
    img.className = "map-img";
    img.src = mapUrl;
    img.alt = "Map of the bee lands";
    mapWrap.appendChild(img);

    const landName = document.createElement("div");
    landName.className = "land-name";

    const hint = document.createElement("div");
    hint.className = "land-hint";

    const row = document.createElement("div");
    row.className = "levels-row";

    const pins = new Map<string, HTMLButtonElement>();
    const chips: Array<HTMLButtonElement> = [];

    const levelsOf = (land: Land) =>
      land.levels
        .map(n => levels.find(l => l.number === n))
        .filter(l => l !== undefined);

    /** Redraw the chips and highlight for whichever land is now current. */
    const selectLand = (land: Land, level?: number) => {
      const playable = levelsOf(land).filter(l => l.number <= unlocked);
      if (playable.length === 0) {
        return;
      }
      chosen = level ?? playable[0].number;

      for (const [id, pin] of pins) {
        pin.classList.toggle("selected", id === land.id);
      }
      landName.textContent = land.name;
      hint.textContent = "";

      row.replaceChildren();
      chips.length = 0;
      // A single-level land needs no chips — the pin said it all.
      if (playable.length < 2) {
        return;
      }

      for (const choice of playable) {
        const chip = document.createElement("button");
        chip.className = "level-chip";
        chip.type = "button";

        const num = document.createElement("span");
        num.className = "level-chip-num";
        num.textContent = String(choice.number);

        const text = document.createElement("span");
        text.className = "level-chip-text";
        text.textContent = choice.name;
        if (choice.note) {
          const note = document.createElement("em");
          note.textContent = choice.note;
          text.appendChild(note);
        }

        chip.append(num, text);
        chip.addEventListener("click", () => {
          chosen = choice.number;
          for (const c of chips) {
            c.classList.toggle("selected", c === chip);
          }
        });
        chip.classList.toggle("selected", choice.number === chosen);
        chips.push(chip);
        row.appendChild(chip);
      }
    };

    for (const land of LANDS) {
      const built = levelsOf(land);
      const open = built.some(l => l.number <= unlocked);

      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = `map-pin ${open ? "open" : built.length ? "locked" : "soon"}`;
      pin.style.left = `${land.x * 100}%`;
      pin.style.top = `${land.y * 100}%`;
      pin.title = open ? land.name : `${land.name} — locked`;
      pin.setAttribute("aria-label", pin.title);
      pin.textContent = open ? "🐝" : "🔒";
      if (open) {
        pin.addEventListener("click", () => selectLand(land));
      } else {
        // Locked pins report themselves in their own line — overwriting the
        // land name would leave it contradicting the level list underneath.
        pin.addEventListener("click", () => {
          hint.textContent = built.length
            ? `🔒 ${land.name} — finish the levels before it to open this`
            : `🔒 ${land.name} — coming soon`;
        });
      }
      pins.set(land.id, pin);
      mapWrap.appendChild(pin);
    }

    // Map on the left, everything you choose or type on the right.
    const split = document.createElement("div");
    split.className = "picker-split";
    side.append(heading, landName, hint, row);
    split.append(mapWrap, side);
    picker.append(split);

    const startLand = landForLevel(chosen) ?? landForLevel(1);
    if (startLand) {
      selectLand(startLand, chosen);
    }
  }

  start.addEventListener("click", () => {
    const name = sanitizeCodename(input.value).trim();
    if (!name) {
      return;
    }
    onStart(name, chosen);
  });

  const reset = document.createElement("button");
  reset.className = "ghost";
  reset.textContent = "Start a new hive (erases progress)";
  reset.addEventListener("click", () => {
    if (confirm("Erase your hive and start over?")) {
      onReset();
    }
  });

  // Returning players get the chip; a new one gets the field, because naming
  // yourself is the whole of the first screen.
  const nameField = existing ? nameChip : input;

  if (hasMap) {
    // The right-hand column carries the name and the buttons too, so the map
    // gets the full height of the card beside it.
    side.append(nameField, start);
    if (existing) {
      side.append(reset);
    }
    card.append(h1, p, picker);
  } else {
    card.append(h1, p, nameField, start);
    if (existing) {
      card.append(reset);
    }
  }

  let untrack: (() => void) | null = null;

  return {
    root,
    show() {
      root.classList.remove("hidden");
      untrack ??= trackVisualViewport(root);
      // Don't autofocus on iPad — it yanks the software keyboard up over the game.
      if (!("ontouchstart" in window)) {
        setTimeout(() => input.focus(), 60);
      }
    },
    hide() {
      root.classList.add("hidden");
      input.blur();
      untrack?.();
      untrack = null;
    },
    setText(nextTitle, nextBody) {
      h1.textContent = nextTitle;
      p.textContent = nextBody;
    },
  };
}

export function createMessageScreen(
  host: HTMLElement,
  title: string,
  body: string,
  buttonLabel: string,
  onContinue: () => void,
): Overlay {
  const {root, card} = makeOverlay(host);
  const h1 = document.createElement("h1");
  h1.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  const btn = document.createElement("button");
  btn.textContent = buttonLabel;
  btn.addEventListener("click", onContinue);
  card.append(h1, p, btn);
  return {
    root,
    show: () => root.classList.remove("hidden"),
    hide: () => root.classList.add("hidden"),
    setText(nextTitle, nextBody) {
      h1.textContent = nextTitle;
      p.textContent = nextBody;
    },
    setButton(label) {
      btn.textContent = label;
    },
  };
}
