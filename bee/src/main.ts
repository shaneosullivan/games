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

const game = new Game(app);

// CSS alone can't be trusted to mean "the screen" in an installed iPad app.
fitViewport(app, () => game.resize());

// Deployed builds poll for their own replacement and offer a reload; in
// development this is a no-op.
watchForUpdates(app);
