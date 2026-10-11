import {Game} from "./game";

/**
 * The way in.
 *
 * Everything the game is lives in `Game`; this finds somewhere to put it and
 * hands the canvas over. Kept on `window` in a dev build, the way the other
 * games in this repo do, because the only honest way to check a swing is to
 * reach into the running one and measure it.
 */
const into = document.querySelector<HTMLElement>("#app");
if (!into) {
  throw new Error("no #app to mount into");
}
const game = new Game(into);
if (import.meta.env.DEV) {
  (window as unknown as {game: Game}).game = game;
}
