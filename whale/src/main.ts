import "./ui/styles.css";
import {Game} from "./game";

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
