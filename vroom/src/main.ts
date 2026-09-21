import "./ui/styles.css";
import {Game} from "./game";
import {lockZoom} from "./core/lockZoom";
import {loadBeasts} from "./models/beastModels";
import {dealRivals} from "./entities/rivals";
import {Party} from "./net/party";
import {tidyCode} from "./net/room";
import {Editor} from "./ui/editor";
import {Lobby} from "./ui/lobby";
import {Menu} from "./ui/menu";
import {ModelViewer, MODELS_HASH} from "./ui/models";
import {Loading} from "./ui/loading";
import {Garage} from "./ui/garage";
import {LOADING} from "./config";
import {BUILT_IN, TrackSpec} from "./track/spec";
import {saveTrack} from "./track/store";
import {givenUp, setQuality} from "./core/quality";

// Before anything else. On an iPad a stray pinch or a double tap zooms the
// page, and a zoomed page puts the readouts and the corner buttons off the top
// of the screen with no way to get them back — the game has no scrollbars and
// nothing to grab. iOS has ignored `user-scalable=no` since iOS 10, so the
// viewport meta tag on its own does nothing about it.
lockZoom();

// Straight away, so the cow is here by the time anybody opens the garage or
// starts a race.
void loadBeasts();

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing #app element");
}

/**
 * The shell: which of the three screens is up.
 *
 * A race, the track list and the builder are genuinely separate things —
 * different DOM, different input, and only one of them wants a WebGL context.
 * So a screen is torn all the way down when it is left rather than hidden.
 * Half a dozen races and a few visits to the builder is enough for a browser
 * to start quietly dropping the oldest GL context if they are only stacked up.
 */
let game: Game | null = null;
let editor: Editor | null = null;
let models: ModelViewer | null = null;
let garage: Garage | null = null;
let menu: Menu | null = null;
let lobby: Lobby | null = null;
/**
 * The other children, while there are any.
 *
 * Deliberately outside `clear()`: every other screen here is torn all the way
 * down when it is left, and the people you are racing are the one thing that
 * must survive that. The lobby, the race, the finish card and the next race are
 * four screens, and walking between them cannot mean joining again.
 */
let party: Party | null = null;

function clear(): void {
  game?.dispose();
  game = null;
  editor?.dispose();
  editor = null;
  models?.dispose();
  models = null;
  garage?.dispose();
  garage = null;
  window.garage = null;
  menu?.dispose();
  menu = null;
  lobby?.dispose();
  lobby = null;
  app!.replaceChildren();
}

/** Leaves the race everybody is in, if any. */
function leaveParty(): void {
  party?.close();
  party = null;
}

function showMenu(note?: string): void {
  clear();
  if (window.location.hash.startsWith(MODELS_HASH)) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  menu = new Menu({
    onPlay: spec => void showRace(spec),
    onBuild: () => showEditor(),
    onEdit: spec => showEditor(spec),
    onModels: showModels,
    onGarage: () => showGarage(showMenu),
    onTogether: () => void hostRace(),
  });
  app!.appendChild(menu.root);
  if (note) {
    // Why the last screen went away — a race that ended because somebody left,
    // or a code that led nowhere. Said on the screen it happened *to*, rather
    // than in a dialog a child has to dismiss before they can play again.
    const says = document.createElement("p");
    says.className = "menu-note";
    says.textContent = note;
    menu.root.appendChild(says);
  }
}

/**
 * Opening a race for somebody else to join.
 *
 * The broker is on the internet and can take a moment, so this waits behind a
 * card like everything else that takes a moment — and if it cannot be reached,
 * says so in words a child can act on rather than leaving a dead screen.
 */
async function hostRace(): Promise<void> {
  clear();
  const card = new Loading("Race a friend");
  card.mount(app!);
  card.set(0.4, "Opening the race\u2026");
  try {
    party = await Party.open();
  } catch {
    await card.close();
    showMenu("Could not open a race. Is this iPad on the wi-fi?");
    return;
  }
  await card.close();
  listen(party);
  showLobby();
}

/** Joining one, from a scanned code. */
async function joinRace(code: string): Promise<void> {
  clear();
  // Out of the address bar straight away: a reload half an hour later must not
  // try to join a race that finished long ago.
  window.history.replaceState(null, "", window.location.pathname);
  const card = new Loading("Joining the race");
  card.mount(app!);
  card.set(0.4, "Looking for the other iPad\u2026");
  try {
    party = await Party.join(code);
  } catch {
    await card.close();
    showMenu("Could not find that race. Ask for a new code.");
    return;
  }
  await card.close();
  listen(party);
  showLobby();
}

/**
 * What the shell does about the things a race decides for itself.
 *
 * Set once, when the party is made, rather than by each screen: the host can
 * start a race while a guest is in the garage, and a guest that only listened
 * while it happened to be in the lobby would sit there and miss it.
 */
function listen(joined: Party): void {
  joined.onRace = spec => void showRace(spec, joined);
  joined.onEnd = why => {
    leaveParty();
    showMenu(why);
  };
}

function showLobby(back = false): void {
  clear();
  const joined = party;
  if (!joined) {
    showMenu();
    return;
  }
  lobby = new Lobby(joined, {
    onExit: () => {
      leaveParty();
      showMenu();
    },
    onStart: spec =>
      joined.start(spec, (count, taken) =>
        dealRivals(count, spec.environment, taken),
      ),
    onGarage: () => showGarage(() => showLobby(true)),
  });
  app!.appendChild(lobby.root);
  if (back) {
    lobby.cameBack();
  }
}

/**
 * The model viewer, and the reason it puts itself in the URL.
 *
 * It exists to be looked at while a model is being changed, and changing a
 * model reloads the page — so without the hash every edit would land back on
 * the track list and the tool would be useless for the one job it has.
 */
function showModels(hash = ""): void {
  clear();
  models = new ModelViewer(showMenu);
  app!.appendChild(models.root);
  if (hash) {
    models.restore(hash);
  }
}

/** The garage: which car is yours. Where it goes back to depends on where it
 *  was opened from — the track list, or a lobby with a race waiting. */
function showGarage(onDone: () => void): void {
  clear();
  garage = new Garage(onDone);
  window.garage = garage;
  app!.appendChild(garage.root);
}

function showEditor(existing?: TrackSpec): void {
  clear();
  editor = new Editor(
    {
      onSave: spec => {
        saveTrack(spec);
        showMenu();
      },
      onChange: saveTrack,
      onCancel: showMenu,
      // A test drive saves first, so a child who races off to try their track
      // and then taps the gallery button still has it tomorrow.
      onTest: spec => {
        saveTrack(spec);
        void showRace(spec);
      },
    },
    existing,
  );
  app!.appendChild(editor.root);
}

/**
 * A race, built behind a waiting card.
 *
 * Nothing is shown until it is ready. The card is put up first and given a
 * frame to paint, then the game builds itself in steps — each handing the
 * frame back so the bar moves — and the last of those steps compiles every
 * shader and draws a few frames nobody sees. Only then does the card come
 * down. Before this, all of that happened with the countdown already running,
 * which is exactly the wrong moment for a game to be at its slowest.
 */
async function showRace(
  spec: TrackSpec,
  joined: Party | null = null,
): Promise<void> {
  clear();
  const card = new Loading(spec.name);
  card.mount(app!);

  // The UI layer sits over the canvas: the readouts, the stick, the overlays
  // and the corner buttons all live here rather than in the scene.
  const ui = document.createElement("div");
  ui.className = "ui";
  app!.appendChild(ui);

  const mine = new Game(
    app!,
    ui,
    spec,
    () => {
      leaveParty();
      showMenu();
    },
    () => {
      // Another go. On your own that is simply another race; with other
      // children it is the host putting everybody back on the grid, and
      // everybody's screen hears about it the same way it heard about the
      // first one.
      if (!joined) {
        void showRace(spec);
      } else if (joined.isHost) {
        joined.start(spec, (count, taken) =>
          dealRivals(count, spec.environment, taken),
        );
      }
    },
    joined,
  );
  game = mine;
  window.game = mine;

  const began = performance.now();
  await mine.load((done, what) => card.set(done, what));

  // A card that flashes past in eighty milliseconds on a fast machine reads as
  // a glitch rather than as the game getting ready.
  const spent = (performance.now() - began) / 1000;
  if (spent < LOADING.atLeast) {
    await new Promise(done =>
      setTimeout(done, (LOADING.atLeast - spent) * 1000),
    );
  }
  // Unless the child has already gone somewhere else while it loaded.
  if (game === mine) {
    await card.close();
  } else {
    card.root.remove();
  }
}

/** What a scanned code looks like in the address: see `ui/qr.ts`. */
const JOIN_HASH = "#join=";

// Straight into the list rather than into a race — unless the URL says the
// model viewer was open, in which case a reload goes back to it.
/** The code in the address, if there is one. */
function scannedCode(): string {
  return window.location.hash.startsWith(JOIN_HASH)
    ? tidyCode(window.location.hash.slice(JOIN_HASH.length))
    : "";
}

// A code can also arrive at a page that is *already* open — a browser given a
// link to the address it is already at changes the hash and loads nothing. That
// is exactly what happens when a child scans a second code without closing the
// first race, and without this it looks like the camera did not work.
window.addEventListener("hashchange", () => {
  const code = scannedCode();
  if (code) {
    leaveParty();
    void joinRace(code);
  }
});

const scanned = scannedCode();
if (window.location.hash.startsWith(MODELS_HASH)) {
  showModels(window.location.hash);
} else if (scanned) {
  // A scanned code opens the game straight into the race it belongs to. This is
  // the whole of joining: one camera, one tap on whatever the camera offers.
  void joinRace(scanned);
} else {
  showMenu();
}

// The live game, for driving it from the console while it is built. See
// CLAUDE.md — there is no test suite, and this is how a change is checked.
declare global {
  interface Window {
    game: Game | null;
    /** The shell, so a race can be started from the console without tapping
     *  through the list. */
    play: (spec?: TrackSpec) => void;
    builtIn: TrackSpec;
    /** Reads or sets how many quality concessions have been made; see the
     *  note where it is defined. */
    quality: (level?: number) => string;
    /** The garage, while it is open, for the same reason `game` is here: the
     *  only way to check where a sticker actually landed is to ask it. */
    garage: Garage | null;
  }
}
window.game = null;
window.garage = null;
/**
 * The quality knob, at the console.
 *
 * The game finds its own level by watching its frame rate, which is the right
 * behaviour and a slow way to see what a machine in trouble is looking at.
 * `quality(4)` gives up the first four things at once and remembers it, the
 * same as if the game had decided; `quality()` says what has gone.
 */
window.quality = (level?: number) => {
  if (level !== undefined) {
    setQuality(level);
  }
  const gone = givenUp();
  return gone.length === 0
    ? "everything on"
    : `given up (${gone.length}): ${gone.join(", ")}`;
};
window.play = (spec?: TrackSpec) => void showRace(spec ?? BUILT_IN);
window.builtIn = BUILT_IN;
