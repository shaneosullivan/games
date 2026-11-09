import {HOME, PARTS, PREVIEW, SCREEN, VOLCANO} from "../config";
import {Monkey} from "../entities/monkey";
import {Jungle} from "../world/jungle";
import {paint} from "./draw";
import {Party} from "./particles";

type Part = (typeof PARTS)[number];

/**
 * A still of each place the chooser can start you, for its button.
 *
 * Painted by the game's own painter from the game's own worlds rather than
 * kept as screenshots, so a picture can never show a jungle the game no
 * longer has: change a sprite or a level and its picture changes with it.
 * The same seeds as the levels themselves, so it is the actual place.
 *
 * Painted whole and then cut down to a close-up of the monkey and what is
 * in front of it, rather than painted small: the sky, the canopy and the
 * floor are all laid out for a picture `SCREEN.tall` high, and a shorter
 * one would be a different jungle.
 */
export function previewOf(part: Part): HTMLCanvasElement {
  const fine = SCREEN.fine;
  const wide = PREVIEW.wide;
  const tall = SCREEN.tall;
  const cutWide = wide / PREVIEW.zoom;
  const cutTall = tall / PREVIEW.zoom;

  const out = document.createElement("canvas");
  out.width = wide * fine;
  out.height = tall * fine;
  const whole = document.createElement("canvas");
  whole.width = wide * fine;
  whole.height = tall * fine;
  const ctx = whole.getContext("2d", {alpha: false});
  const g = out.getContext("2d", {alpha: false});
  if (!ctx || !g) {
    return out;
  }
  ctx.setTransform(fine, 0, 0, fine, 0, 0);
  ctx.imageSmoothingEnabled = false;
  g.imageSmoothingEnabled = false;

  const jungle = worldOf(part);
  if (part.whole) {
    standingBack(ctx, jungle, wide, tall, part);
    g.drawImage(whole, 0, 0);
    return out;
  }
  // The close-up is centred on what the part is named after, inside a
  // whole picture kept within the world the way the game's own camera is.
  const camera = Math.round(
    Math.max(0, Math.min(jungle.far - wide + 40, part.shows - wide / 2)),
  );
  const cutLeft = Math.round(
    Math.max(0, Math.min(wide - cutWide, part.shows - cutWide / 2 - camera)),
  );
  // With the monkey on the ground at the left of it, looking on.
  const monkey = new Monkey();
  monkey.doing = "ground";
  monkey.x = camera + cutLeft + PREVIEW.monkeyAt;
  monkey.y = jungle.floorAt(monkey.x);
  monkey.wasX = monkey.x;
  monkey.wasY = monkey.y;
  // And the ground where the monkey stands a little way up from the
  // bottom, wherever the ground is: on the volcano it is up a hill.
  const cutTop = Math.round(
    Math.max(0, Math.min(tall - cutTall, monkey.y - cutTall * PREVIEW.floor)),
  );

  spurting(jungle, camera + cutLeft, cutWide);
  paint(
    {ctx, wide, tall},
    jungle,
    monkey,
    camera,
    PREVIEW.time,
    1,
    new Party(),
    false,
    {sky: part.sky},
  );
  g.drawImage(
    whole,
    cutLeft * fine,
    cutTop * fine,
    cutWide * fine,
    cutTall * fine,
    0,
    0,
    out.width,
    out.height,
  );
  return out;
}

/**
 * Home's picture: the whole tree and the family in it, the way the camera
 * shows it once you get there, with the monkey at the foot of the trunk.
 */
function standingBack(
  ctx: CanvasRenderingContext2D,
  jungle: Jungle,
  wide: number,
  tall: number,
  part: Part,
): void {
  const monkey = new Monkey();
  monkey.doing = "ground";
  monkey.x = jungle.homeX - HOME.arriveBy;
  monkey.y = jungle.floorAt(monkey.x);
  monkey.wasX = monkey.x;
  monkey.wasY = monkey.y;
  paint(
    {ctx, wide, tall},
    jungle,
    monkey,
    Math.round(jungle.homeX - wide / HOME.zoomTo / 2),
    PREVIEW.time,
    1,
    new Party(),
    false,
    {sky: part.sky, zoom: HOME.zoomTo},
  );
}

/**
 * Catches the vents in the picture in the middle of throwing lava, each a
 * different way through it.
 *
 * Left to their own clocks most of them are resting at any one moment, and
 * a volcano with nothing coming out of it is a hill with a pond on top.
 * Only the vents' state is set, the same way the jungle's own tick sets
 * it: the painter draws a spurt from that and nothing else.
 */
function spurting(jungle: Jungle, from: number, wide: number): void {
  const seen = jungle.vents.filter(
    vent => vent.x >= from - 10 && vent.x <= from + wide + 10,
  );
  seen.forEach((vent, i) => {
    const t = PREVIEW.spurtsAt[i % PREVIEW.spurtsAt.length];
    vent.at = VOLCANO.warns + t * VOLCANO.spurts;
    vent.up = Math.sin(t * Math.PI);
    vent.warning = false;
  });
}

/** The dry jungle is built once and shared: four of the parts are in it.
 *  The pictures' own and not the game's, so stopping its vents mid-spurt
 *  stops nothing in play. */
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
