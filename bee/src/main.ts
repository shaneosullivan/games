import "./ui/styles.css";
import {fitViewport} from "./core/fitViewport";
import {lockZoom} from "./core/lockZoom";
import {watchForUpdates} from "./core/updates";
import {Game} from "./game";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app missing");
}

lockZoom();

// Before the Game, which hangs the maze's controls off the same handle: the
// console API has to exist for there to be anything to hang them on. The
// update polling this also starts is a no-op in development.
watchForUpdates(app);

const game = new Game(app);

// CSS alone can't be trusted to mean "the screen" in an installed iPad app.
fitViewport(app, () => game.resize());
