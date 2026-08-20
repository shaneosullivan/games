import "./ui/styles.css";
import {Game} from "./game";

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing #app element");
}

// The UI lives on its own layer above the canvas, not inside #app, so nothing
// the renderer does to its container can disturb it.
const ui = document.createElement("div");
ui.id = "ui";
document.body.appendChild(ui);

const game = new Game(app, ui);

// The whole toolkit for driving the game from devtools, the way the bee game
// does it — there is no test suite here, so this is how a change gets checked.
if (import.meta.env.DEV) {
  (window as unknown as {game: Game}).game = game;
}
