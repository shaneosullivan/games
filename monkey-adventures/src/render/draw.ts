import {JUNGLE, LAKE, MONKEY, PAINT, WORLD} from "../config";
import {bananaSprite, monkeySprite, type Pose} from "../art/monkey";
import type {Party} from "./particles";
import type {Jungle, Tree} from "../world/jungle";
import type {Monkey} from "../entities/monkey";
import type {Screen} from "./screen";

/**
 * The jungle, painted back to front.
 *
 * Everything is snapped to whole pixels before it is drawn. That is the one
 * rule that matters in a picture this small: half a pixel of scroll turns a
 * crisp trunk into two grey trunks, and a game that shimmers while it scrolls
 * looks broken in a way nobody can name.
 */
export function paint(
  screen: Screen,
  jungle: Jungle,
  monkey: Monkey,
  camera: number,
  time: number,
  alpha: number,
  party: Party,
): void {
  const g = screen.ctx;
  const w = screen.wide;
  const h = screen.tall;

  sky(g, w, h);
  canopy(g, w, camera);

  // Two layers of trees at different speeds. The far ones are lighter and
  // hazier, which is most of what makes them look far away.
  layer(
    g,
    jungle.farTrees,
    camera * JUNGLE.farParallax,
    PAINT.farTree,
    PAINT.trunkDark,
    w,
    0.72,
  );
  layer(
    g,
    jungle.nearTrees,
    camera * JUNGLE.nearParallax,
    PAINT.nearTree,
    PAINT.trunk,
    w,
    1,
  );

  ground(g, w, h, camera);
  lake(g, w, camera, time);

  // The vines, and the monkey among them: the vine being held is drawn after
  // the others so the monkey is never behind the thing it is holding.
  for (const vine of jungle.vines) {
    const x = Math.round(vine.x - camera);
    if (x < -80 || x > w + 80) {
      continue;
    }
    rope(g, x, vine.y, vine.angle, vine.long, vine === monkey.vine);
  }

  bananas(g, jungle, camera, w);
  home(g, Math.round(jungle.homeX - camera), h);
  drawMonkey(g, monkey, camera, alpha);
  party.draw(g, camera);
  dapples(g, jungle, camera, time, w, h);
}

/**
 * The leaves overhead.
 *
 * A band along the top, so the vines hang from something rather than from
 * the sky, and so the picture is closed in at the top the way a jungle is.
 * Drawn off the world so it scrolls, with a slow parallax of its own because
 * it is nearer the eye than anything else.
 */
function canopy(g: CanvasRenderingContext2D, w: number, camera: number): void {
  g.fillStyle = PAINT.canopy;
  g.fillRect(0, 0, w, 8);
  g.fillStyle = PAINT.canopyLight;
  const shift = camera * 0.9;
  const first = Math.floor(shift / 14) * 14;
  for (let x = first; x < first + w + 28; x += 14) {
    const at = Math.round(x - shift);
    const drop = 4 + ((x / 14) % 4) * 2;
    g.fillRect(at, 6, 10, drop);
  }
}

function sky(g: CanvasRenderingContext2D, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PAINT.skyHigh);
  grad.addColorStop(1, PAINT.skyLow);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/** A row of trees: a trunk and a lumpy crown, all on whole pixels. */
function layer(
  g: CanvasRenderingContext2D,
  trees: Array<Tree>,
  shift: number,
  leaf: string,
  bark: string,
  w: number,
  solid: number,
): void {
  g.globalAlpha = solid;
  for (const tree of trees) {
    const x = Math.round(tree.x - shift);
    if (x < -tree.wide * 2 || x > w + tree.wide * 2) {
      continue;
    }
    const base = WORLD.floor;
    const top = Math.round(base - tree.tall);
    g.fillStyle = bark;
    g.fillRect(x - 3, top + 8, 6, base - top - 8);
    g.fillStyle = leaf;
    // Three overlapping blocks rather than a circle: a circle at this size
    // has to be drawn as blocks anyway, and choosing them is better than
    // letting the rasteriser choose.
    const r = Math.round(tree.wide / 2);
    g.fillRect(x - r, top, r * 2, 10);
    g.fillRect(x - r + 3, top - 6, r * 2 - 6, 10);
    g.fillRect(x - r + 7, top - 10, r * 2 - 14, 9);
  }
  g.globalAlpha = 1;
}

/** The jungle floor. */
function ground(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: number,
): void {
  g.fillStyle = PAINT.earth;
  g.fillRect(0, WORLD.floor, w, h - WORLD.floor);
  g.fillStyle = PAINT.ground;
  g.fillRect(0, WORLD.floor, w, 5);
  g.fillStyle = PAINT.groundDark;
  // Tufts, placed off the world rather than off the screen so they scroll
  // with the ground instead of swimming across it.
  const first = Math.floor(camera / 11) * 11;
  for (let x = first; x < first + w + 22; x += 11) {
    const at = Math.round(x - camera);
    const tall = 2 + ((x / 11) % 3);
    g.fillRect(at, WORLD.floor - tall + 1, 2, tall);
  }
}

/**
 * The lake halfway along.
 *
 * Cut into the ground rather than laid on top of it, so there is a bank to
 * fall off: the earth stops at the water's edge and the water sits a little
 * below the floor. Three bands of blue and a moving line of light on top,
 * which at this size is all a lake needs to be wet.
 */
function lake(
  g: CanvasRenderingContext2D,
  w: number,
  camera: number,
  time: number,
): void {
  const from = Math.round(LAKE.from - camera);
  const wide = LAKE.wide;
  if (from > w || from + wide < 0) {
    return;
  }
  const top = WORLD.floor + LAKE.deep;
  // The gap in the ground, filled with water.
  g.fillStyle = PAINT.waterDark;
  g.fillRect(from, WORLD.floor, wide, 200);
  g.fillStyle = PAINT.water;
  g.fillRect(from, top - 4, wide, 200);
  // Glints, moving along the surface. Off the world so they travel with the
  // lake, and on a slow sine so the water looks like it is working.
  g.fillStyle = PAINT.waterLight;
  for (let x = 0; x < wide; x += 9) {
    const bob = Math.sin(time * 1.4 + x * 0.21);
    if (bob < 0.25) {
      continue;
    }
    g.fillRect(from + x, top - 4 + Math.round(bob), 4, 1);
  }
}

/** The bananas nobody has taken yet. */
function bananas(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
): void {
  const sprite = bananaSprite();
  for (const banana of jungle.bananas) {
    if (banana.taken) {
      continue;
    }
    const x = Math.round(banana.x - camera);
    if (x < -10 || x > w + 10) {
      continue;
    }
    g.drawImage(sprite, x - 3, Math.round(banana.y) - 3);
  }
}

/** One vine. Drawn as a line of short segments so it bends like a rope
 *  rather than hanging like a stick. */
function rope(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  long: number,
  held: boolean,
): void {
  // One step a pixel, so the rope is a rope and not a dotted line. At this
  // size that is eighty little squares, which is nothing.
  const steps = Math.max(8, Math.round(long));
  g.fillStyle = held ? PAINT.vine : PAINT.vineDark;
  for (let i = 0; i <= steps; i++) {
    const at = i / steps;
    // A rope sags: the lower it hangs the further it has swung, which is
    // near enough true for a thing eighty pixels long and reads as rope.
    const bend = Math.sin(at * Math.PI) * 1.6;
    const px = Math.round(
      x + Math.sin(angle) * long * at + bend * Math.cos(angle),
    );
    const py = Math.round(y + Math.cos(angle) * long * at);
    g.fillRect(px, py, 2, 2);
  }
  // A leafy knot at the top, so a vine starts somewhere rather than
  // appearing out of the canopy.
  g.fillStyle = PAINT.canopyLight;
  g.fillRect(Math.round(x) - 3, Math.round(y) - 2, 7, 4);
}

function drawMonkey(
  g: CanvasRenderingContext2D,
  monkey: Monkey,
  camera: number,
  alpha: number,
): void {
  // Between the last step and this one, so the monkey moves smoothly even
  // though the world is worked out sixty times a second.
  const x = monkey.wasX + (monkey.x - monkey.wasX) * alpha;
  const y = monkey.wasY + (monkey.y - monkey.wasY) * alpha;
  let pose: Pose = "hang";
  if (monkey.doing === "climb") {
    // Arms up, legs working: the hanging pose with the run's legs is near
    // enough a climb at this size, and the alternation sells it.
    pose = Math.floor(monkey.stride / 7) % 2 === 0 ? "hang" : "climbB";
  } else if (monkey.doing === "ground") {
    pose =
      Math.abs(monkey.vx) < 6
        ? "stand"
        : Math.floor(monkey.stride / 9) % 2 === 0
          ? "runA"
          : "runB";
  }
  const sprite = monkeySprite(pose, monkey.facingLeft);
  g.drawImage(
    sprite,
    Math.round(x - camera - MONKEY.wide / 2),
    Math.round(y - MONKEY.tall),
  );
}

/** Home: a little hut in the trees at the end of the jungle. */
function home(g: CanvasRenderingContext2D, x: number, h: number): void {
  if (x < -40 || x > 400) {
    return;
  }
  const base = WORLD.floor;
  g.fillStyle = PAINT.homeDark;
  g.fillRect(x - 14, base - 26, 28, 26);
  g.fillStyle = PAINT.home;
  g.fillRect(x - 12, base - 24, 24, 22);
  g.fillStyle = PAINT.homeDark;
  g.fillRect(x - 5, base - 14, 10, 14);
  // A roof of leaves, because it is a monkey's house.
  g.fillStyle = PAINT.canopy;
  g.fillRect(x - 17, base - 32, 34, 7);
  g.fillRect(x - 13, base - 36, 26, 6);
  void h;
}

/** The light coming through the canopy. */
function dapples(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  time: number,
  w: number,
  h: number,
): void {
  g.globalAlpha = JUNGLE.dappleAlpha;
  g.fillStyle = PAINT.dapple;
  for (const spot of jungle.dapples) {
    const x = Math.round(spot.x - camera * JUNGLE.dappleParallax);
    if (x < -spot.size || x > w + spot.size) {
      continue;
    }
    // Breathing slowly, as light through leaves in a breeze does. The whole
    // effect is worth about a tenth of an alpha and should never be more:
    // it is weather, not a light source.
    const breathe = 0.8 + Math.sin(time * 0.6 + spot.x) * 0.2;
    const size = Math.round(spot.size * breathe);
    g.fillRect(x - size / 2, Math.round(spot.y - size / 3), size, size / 2);
  }
  g.globalAlpha = 1;
  void h;
}
