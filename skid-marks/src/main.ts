import "./ui/styles.css";
import {Game} from "./game";
import {lockZoom} from "./core/lockZoom";
import {Editor} from "./ui/editor";
import {Menu} from "./ui/menu";
import {BUILT_IN, TrackSpec} from "./track/spec";
import {saveTrack} from "./track/store";

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

function clear(): void {
  game?.dispose();
  game = null;
  editor?.dispose();
  editor = null;
  app!.replaceChildren();
}

function showMenu(): void {
  clear();
  const menu = new Menu({
    onPlay: showRace,
    onBuild: () => showEditor(),
    onEdit: spec => showEditor(spec),
  });
  app!.appendChild(menu.root);
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
        showRace(spec);
      },
    },
    existing,
  );
  app!.appendChild(editor.root);
}

function showRace(spec: TrackSpec): void {
  clear();
  // The UI layer sits over the canvas: the readouts, the stick, the overlays
  // and the corner buttons all live here rather than in the scene.
  const ui = document.createElement("div");
  ui.className = "ui";
  app!.appendChild(ui);
  game = new Game(app!, ui, spec, showMenu, () => showRace(spec));
  window.game = game;
}

// Straight into the list rather than into a race. There is more than one track
// now, and one of them might be the child's own.
showMenu();

// The live game, for driving it from the console while it is built. See
// CLAUDE.md — there is no test suite, and this is how a change is checked.
declare global {
  interface Window {
    game: Game | null;
    /** The shell, so a race can be started from the console without tapping
     *  through the list. */
    play: (spec?: TrackSpec) => void;
    builtIn: TrackSpec;
  }
}
window.game = null;
window.play = (spec?: TrackSpec) => showRace(spec ?? BUILT_IN);
window.builtIn = BUILT_IN;
