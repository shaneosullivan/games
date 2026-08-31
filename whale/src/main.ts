import "./ui/styles.css";
import {Game} from "./game";
import {lockZoom} from "./core/lockZoom";

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

// The UI layer sits over the canvas: the HUD, the two sticks, the overlays and
// the corner buttons all live here rather than in the scene.
const ui = document.createElement("div");
ui.className = "ui";
app.appendChild(ui);

const game = new Game(app, ui);

// The whole live game, for driving it from the console while it is built.
// See CLAUDE.md — there is no test suite, and this is how a change is checked.
declare global {
  interface Window {
    game: Game;
  }
}
window.game = game;
