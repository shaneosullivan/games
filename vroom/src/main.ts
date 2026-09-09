import "./ui/styles.css";
import {Game} from "./game";
import {lockZoom} from "./core/lockZoom";
import {Editor} from "./ui/editor";
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

function clear(): void {
  game?.dispose();
  game = null;
  editor?.dispose();
  editor = null;
  models?.dispose();
  models = null;
  garage?.dispose();
  garage = null;
  menu?.dispose();
  menu = null;
  app!.replaceChildren();
}

function showMenu(): void {
  clear();
  if (window.location.hash.startsWith(MODELS_HASH)) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  menu = new Menu({
    onPlay: spec => void showRace(spec),
    onBuild: () => showEditor(),
    onEdit: spec => showEditor(spec),
    onModels: showModels,
    onGarage: showGarage,
  });
  app!.appendChild(menu.root);
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

/** The garage: which car is yours. */
function showGarage(): void {
  clear();
  garage = new Garage(showMenu);
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
async function showRace(spec: TrackSpec): Promise<void> {
  clear();
  const card = new Loading(spec.name);
  card.mount(app!);

  // The UI layer sits over the canvas: the readouts, the stick, the overlays
  // and the corner buttons all live here rather than in the scene.
  const ui = document.createElement("div");
  ui.className = "ui";
  app!.appendChild(ui);

  const mine = new Game(app!, ui, spec, showMenu, () => void showRace(spec));
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

// Straight into the list rather than into a race — unless the URL says the
// model viewer was open, in which case a reload goes back to it.
if (window.location.hash.startsWith(MODELS_HASH)) {
  showModels(window.location.hash);
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
  }
}
window.game = null;
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
