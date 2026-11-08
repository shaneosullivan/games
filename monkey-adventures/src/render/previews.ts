import {PARTS, PREVIEW, SCREEN} from "../config";
import {Monkey} from "../entities/monkey";
import {Jungle} from "../world/jungle";
import {paint} from "./draw";
import {Party} from "./particles";

type Part = (typeof PARTS)[number];

/**
 * A still of each place the chooser can start you, for under its button.
 *
 * Painted by the game's own painter from the game's own worlds rather than
 * kept as screenshots, so a picture can never show a jungle the game no
 * longer has: change a sprite or a level and its picture changes with it.
 * The same seeds as the levels themselves, so it is the actual place.
 */
export function previewOf(part: Part): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const wide = PREVIEW.wide;
  const tall = SCREEN.tall;
  canvas.width = wide * SCREEN.fine;
  canvas.height = tall * SCREEN.fine;
  const ctx = canvas.getContext("2d", {alpha: false});
  if (!ctx) {
    return canvas;
  }
  ctx.setTransform(SCREEN.fine, 0, 0, SCREEN.fine, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const jungle = worldOf(part);
  // Framed on the thing the part is named after, kept inside the world
  // the same way the game's own camera is, with the monkey standing at
  // the left of it looking on.
  const camera = Math.round(
    Math.max(0, Math.min(jungle.far - wide + 40, part.shows - wide / 2)),
  );
  const monkey = new Monkey();
  monkey.doing = "ground";
  monkey.x = camera + PREVIEW.monkeyAt;
  monkey.y = jungle.floorAt(monkey.x);
  monkey.wasX = monkey.x;
  monkey.wasY = monkey.y;
  paint(
    {ctx, wide, tall},
    jungle,
    monkey,
    camera,
    PREVIEW.time,
    1,
    new Party(),
    false,
  );
  return canvas;
}

/** The dry jungle is built once and shared: four of the parts are in it. */
let dry: Jungle | null = null;

function worldOf(part: Part): Jungle {
  if (part.rain) {
    return new Jungle(7, "rain");
  }
  if (part.river) {
    return new Jungle(3, "river");
  }
  dry ??= new Jungle();
  return dry;
}
