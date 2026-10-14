import {
  CROC,
  HOME,
  JUNGLE,
  LAKE,
  MONKEY,
  PAINT,
  SCREEN,
  VOLCANO,
  WORLD,
} from "../config";
import {bananaSprite, crocSprite, monkeySprite, type Pose} from "../art/monkey";
import type {Party} from "./particles";
import type {Jungle, Tree, Vine} from "../world/jungle";
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
  /** Whether the monkey has got home, which is when the family stops
   *  waiting and starts jumping. */
  cheering: boolean,
): void {
  const g = screen.ctx;
  const w = screen.wide;
  const h = screen.tall;

  sky(g, w, h);
  canopy(g, w, camera);

  // Two layers of trees at different speeds. The far ones are lighter and
  // hazier, which is most of what makes them look far away.
  // The far trees are kept off the water. They are a backdrop at a
  // parallax, so there is no fixed place they "are": a tree behind the lake
  // slides across it as the camera moves, and one standing in the water is
  // wrong however faint it is. Clipped to the land, so behind the lake
  // there is open sky — which is what is behind a lake.
  layer(
    g,
    jungle.farTrees,
    camera * JUNGLE.farParallax,
    PAINT.farTree,
    PAINT.trunkDark,
    w,
    0.72,
    {
      from: Math.round(LAKE.from - camera),
      to: Math.round(LAKE.from + LAKE.wide - camera),
    },
  );
  layer(
    g,
    jungle.nearTrees,
    camera * JUNGLE.nearParallax,
    PAINT.nearTree,
    PAINT.trunk,
    w,
    1,
    undefined,
    x => jungle.floorAt(x),
  );

  ground(g, jungle, w, h, camera);
  lake(g, w, camera, time);
  crocs(g, jungle, camera, w);
  lava(g, jungle, camera, w, time);

  // The vines, and the monkey among them: the vine being held is drawn after
  // the others so the monkey is never behind the thing it is holding.
  for (const vine of jungle.vines) {
    if (vine.x - camera < -90 || vine.x - camera > w + 90) {
      continue;
    }
    rope(g, vine, camera, vine === monkey.vine);
  }

  bananas(g, jungle, camera, w);
  home(g, Math.round(jungle.homeX - camera), h);
  family(g, jungle, camera, w, time, cheering);
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
  /** A stretch of screen to leave empty — the lake, for the layer that
   *  would otherwise paddle in it. */
  notBetween?: {from: number; to: number},
  /** Where the ground is under a tree, so the near ones stand on the
   *  volcano rather than hanging over it. */
  baseAt: (x: number) => number = () => WORLD.floor,
): void {
  g.globalAlpha = solid;
  for (const tree of trees) {
    const x = Math.round(tree.x - shift);
    if (x < -tree.wide * 2 || x > w + tree.wide * 2) {
      continue;
    }
    if (notBetween && x > notBetween.from - 6 && x < notBetween.to + 6) {
      continue;
    }
    const base = Math.round(baseAt(tree.x));
    const top = Math.round(base - tree.tall);
    g.fillStyle = bark;
    // Trunks a little thicker than they were: six pixels read as saplings
    // in a jungle of this density.
    g.fillRect(x - 4, top + 8, 9, base - top - 8);
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
  jungle: Jungle,
  w: number,
  h: number,
  camera: number,
): void {
  // A column at a time, because the ground is not flat any more: the
  // volcano lifts it and the line has to follow.
  for (let sx = 0; sx < w; sx++) {
    const world = sx + camera;
    const top = Math.round(jungle.floorAt(world));
    g.fillStyle = PAINT.earth;
    g.fillRect(sx, top, 1, h - top);
    if (jungle.overCrater(world)) {
      // The crater is a hole in this earth, not a stripe on it: `lava()`
      // fills the column from here down, so leave it alone.
      continue;
    }
    g.fillStyle = PAINT.ground;
    g.fillRect(sx, top, 1, 5);
  }
  g.fillStyle = PAINT.groundDark;
  // Tufts, placed off the world rather than off the screen so they scroll
  // with the ground instead of swimming across it.
  const first = Math.floor(camera / 11) * 11;
  for (let x = first; x < first + w + 22; x += 11) {
    const at = Math.round(x - camera);
    if (jungle.overCrater(x) || jungle.overWater(x)) {
      continue;
    }
    const tall = 2 + ((x / 11) % 3);
    g.fillRect(at, Math.round(jungle.floorAt(x)) - tall + 1, 2, tall);
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

/**
 * The crocodiles, lying at the waterline.
 *
 * Drawn after the water and before everything else in the lake, so they
 * read as being *in* it: the body sits with its belly below the surface and
 * only the back, the eyes and the snout above. The lower jaw is a separate
 * piece dropped by up to three pixels, with the mouth painted in behind it
 * — three pixels is a wide open mouth on an animal five pixels tall.
 */
function crocs(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
): void {
  const line = WORLD.floor + LAKE.deep - 7;
  for (const croc of jungle.crocs) {
    const x = Math.round(croc.x - camera);
    if (x < -24 || x > w + 24) {
      continue;
    }
    const left = croc.dir < 0;
    const drop = Math.round(croc.jaw * CROC.opens);
    // Up out of the water as it lunges; see `CROC.rises`.
    const up = Math.round(croc.rise * CROC.rises);
    // The mouth behind the jaw, so an open one is dark inside rather than a
    // gap you can see the lake through.
    if (drop > 0) {
      g.fillStyle = PAINT.crocMouth;
      g.fillRect(x + (left ? -11 : 11), line + 4 - up, 10, drop + 1);
    }
    g.drawImage(crocSprite("jaw", left), x - 11, line + 4 - up + drop);
    g.drawImage(crocSprite("body", left), x - 11, line - up);
  }
}

/**
 * The lava in the crater, and what comes out of it.
 *
 * The surface bubbles slowly; a vent glows and spits before it fires, and
 * then throws a column up past the bottom of a swing. The warning is the
 * point of the whole thing — a hazard that cannot be seen coming is not a
 * hazard, it is a trick, and this game is for a child.
 */
function lava(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
  time: number,
): void {
  for (let sx = 0; sx < w; sx++) {
    const world = sx + camera;
    if (!jungle.overCrater(world)) {
      continue;
    }
    const top = Math.round(jungle.floorAt(world));
    // Slow bubbling, two waves so it never reads as a repeating pattern.
    const bob =
      Math.sin(world * 0.09 + time * 1.3) + Math.sin(world * 0.21 - time * 0.8);
    // Down the column: a bright, moving surface, then lava, then the dark
    // cooler stuff at the bottom. Three bands and nothing cleverer, which
    // is how the lake is painted too.
    g.fillStyle = bob > 0.9 ? PAINT.lavaBright : PAINT.lava;
    g.fillRect(sx, top, 1, 4);
    g.fillStyle = PAINT.lava;
    g.fillRect(sx, top + 4, 1, VOLCANO.deep - 11);
    g.fillStyle = PAINT.lavaDeep;
    g.fillRect(sx, top + VOLCANO.deep - 7, 1, 7);
    // The walls of the pool, where the earth it was cut out of ends. Drawn
    // from the edge inwards so a wall is on the lava side of the line and
    // the rim above it stays the hill's own colour.
    const edge = !jungle.overCrater(world - 2) || !jungle.overCrater(world + 2);
    if (edge) {
      g.fillStyle = PAINT.lavaCrust;
      g.fillRect(sx, top, 1, VOLCANO.deep);
      g.fillStyle = bob > 0.9 ? PAINT.lavaBright : PAINT.lava;
      g.fillRect(sx, top, 1, 2);
    }
  }
  for (const vent of jungle.vents) {
    const x = Math.round(vent.x - camera);
    if (x < -20 || x > w + 20) {
      continue;
    }
    const base = Math.round(jungle.floorAt(vent.x));
    if (vent.warning) {
      // Glowing and spitting: something is about to happen here.
      g.fillStyle = PAINT.lavaBright;
      g.fillRect(x - 4, base - 1, 9, 3);
      const spit = Math.round(Math.abs(Math.sin(time * 9)) * 4);
      g.fillRect(x - 1, base - 2 - spit, 2, 2);
    }
    if (vent.up > 0) {
      // How far through the firing this vent is, which the shape needs and
      // `up` cannot give: `up` is a sine, so it says the same thing on the
      // way up as on the way down, and a lump thrown off the top has to
      // keep climbing while the column underneath it is already falling.
      const t = (vent.at - VOLCANO.warns) / VOLCANO.spurts;
      spurt(g, x, base, vent.up, t, time);
    }
  }
}

/**
 * One column of lava, thrown.
 *
 * Three parts, which is what the picture is made of: a crown of tongues
 * splaying out of the hole, a column that narrows as it climbs with a
 * white-hot core, and lumps that come off the top and arc back down. The
 * part that catches the monkey is still the column — the crown and the
 * lumps are decoration and deliberately smaller than their hitbox, so
 * nothing that looks like a near miss is a burn.
 */
function spurt(
  g: CanvasRenderingContext2D,
  x: number,
  base: number,
  up: number,
  t: number,
  time: number,
): void {
  const tall = Math.round(up * VOLCANO.reaches);
  const wide = VOLCANO.wide2;

  // The crown. It blooms early and is gone before the column is, the way a
  // splash is over before the thing it threw comes down.
  const crown = Math.max(0, 1 - Math.abs(t - 0.26) * 1.7);
  if (crown > 0) {
    const middle = (VOLCANO.tongues - 1) / 2;
    for (let i = 0; i < VOLCANO.tongues; i++) {
      const outBy = (i - middle) / middle;
      const tongue = Math.round(
        VOLCANO.reaches * VOLCANO.crown * crown * (1 - Math.abs(outBy) * 0.55),
      );
      if (tongue <= 0) {
        continue;
      }
      const at = x + Math.round(outBy * VOLCANO.splays * (0.6 + crown * 0.4));
      g.fillStyle = PAINT.lava;
      g.fillRect(at - 1, base - tongue, 3, tongue + 2);
      g.fillStyle = PAINT.lavaBright;
      g.fillRect(at, base - tongue + 1, 1, tongue);
    }
  }

  // The column, a row at a time so it can taper and waver. Three pixels
  // across at the top and the full width at the bottom.
  for (let ry = 0; ry < tall; ry++) {
    const up2 = ry / Math.max(1, tall);
    const half = Math.max(1, Math.round((wide / 2) * (1 - up2 * 0.72)));
    const waver = Math.round(
      Math.sin(ry * 0.55 + time * 11) * VOLCANO.wavers * up2,
    );
    const left = x - half + waver;
    const y = base - ry;
    g.fillStyle = PAINT.lava;
    g.fillRect(left, y, half * 2 + 1, 1);
    g.fillStyle = PAINT.lavaBright;
    g.fillRect(left + 1, y, Math.max(1, half * 2 - 1), 1);
    // The core, white-hot, which stops a third of the way short of the tip
    // where the column has thinned to nothing much.
    if (up2 < 0.66) {
      g.fillStyle = PAINT.lavaHot;
      g.fillRect(x + waver, y, 1, 1);
    }
  }
  if (tall > 4) {
    // A lump on the tip, where the next thing to come off is gathering.
    const top = base - tall;
    g.fillStyle = PAINT.lava;
    g.fillRect(x - 1, top - 2, 3, 3);
    g.fillStyle = PAINT.lavaBright;
    g.fillRect(x - 1, top - 2, 2, 2);
  }

  // The lumps off the tip. Each is launched a little later than the last
  // and carries a little less far; the arc is a plain parabola that starts
  // and lands inside the firing, so none of them is cut off in mid-air.
  for (let i = 0; i < VOLCANO.blobs; i++) {
    const launch = 0.18 + i * 0.1;
    const over = 1 - launch;
    const u = (t - launch) / over;
    if (u <= 0 || u >= 1) {
      continue;
    }
    // Zero at both ends, one in the middle.
    const arc = 4 * u * (1 - u);
    const high = VOLCANO.reaches * VOLCANO.blobsBy * (1 - i * 0.22) * arc;
    const size = i === 0 ? 2 : 1;
    // Thrown out as well as up, each a different way, so three lumps are a
    // scatter and not a stack of boxes going up the middle.
    const aside = i === 1 ? -1 : i === 2 ? 1.6 : 0.6;
    const at = x + Math.round(aside * 5 * u);
    const y = Math.round(base - high);
    g.fillStyle = PAINT.lava;
    g.fillRect(at - 1, y - 1, size + 2, size + 2);
    g.fillStyle = PAINT.lavaBright;
    g.fillRect(at, y, size, size);
    g.fillStyle = PAINT.lavaHot;
    g.fillRect(at, y, 1, 1);
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
    // Centred on the point the game thinks the banana is at, taken from
    // the sprite rather than written down, so changing the drawing does
    // not quietly move what you have to swing through.
    g.drawImage(
      sprite,
      x - Math.round(sprite.width / 2),
      Math.round(banana.y) - Math.round(sprite.height / 2),
    );
  }
}

/**
 * One vine, drawn along its knots.
 *
 * Nothing is faked here any more. The old one drew a straight line with a
 * sine added to suggest a sag; this walks the rope the physics produced,
 * filling the gaps between knots so that a bend is a bend and a whip is a
 * whip. The knots are eight pixels apart and the picture is 180 tall, so
 * the line between two of them is a handful of squares.
 *
 * Those squares are half a picture pixel each, which is the one place in
 * the game that draws finer than the grid (see `SCREEN.fine`). A rope is a
 * long thin diagonal, and a long thin diagonal in whole blocks is a
 * staircase — the only thing in this picture where the blocks look like a
 * mistake instead of the style. Everything else still steps in whole ones.
 */
function rope(
  g: CanvasRenderingContext2D,
  vine: Vine,
  camera: number,
  held: boolean,
): void {
  g.fillStyle = held ? PAINT.vine : PAINT.vineDark;
  const knots = vine.knots;
  // Half a picture pixel: the size of a block of rope, the distance the
  // walk steps, and what positions are snapped to, all the same number so
  // the rope lands on a grid of its own rather than between two.
  const bit = 1 / SCREEN.fine;
  const snap = (v: number): number => Math.round(v / bit) * bit;
  for (let i = 0; i < knots.length - 1; i++) {
    const ax = knots[i].x - camera;
    const ay = knots[i].y;
    const bx = knots[i + 1].x - camera;
    const by = knots[i + 1].y;
    // Stepped at half a pixel so a steep diagonal has no gaps in it.
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / bit));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      g.fillRect(
        snap(ax + (bx - ax) * t),
        snap(ay + (by - ay) * t),
        bit * 2,
        bit * 2,
      );
    }
  }
  // A leafy knot at the top, so a vine starts somewhere rather than
  // appearing out of the canopy.
  g.fillStyle = PAINT.canopyLight;
  g.fillRect(Math.round(vine.x - camera) - 3, Math.round(vine.y) - 2, 7, 4);
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
    // Hung from the sprite's own height rather than the monkey's: the
    // hanging pose is taller than the monkey is, because its arms are
    // above its head, and its hands have to meet the rope.
    Math.round(y - sprite.height),
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

/**
 * The monkeys waiting at home.
 *
 * Milling about while you are away — a pixel or two either way, which is
 * enough to say "alive" at this size — and jumping with their arms up once
 * you arrive. The same sprite as the monkey being played, in other coats,
 * because they are the same animal and a family should look like one.
 */
function family(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
  time: number,
  cheering: boolean,
): void {
  for (const one of jungle.family) {
    const x = Math.round(one.x - camera);
    if (x < -20 || x > w + 20) {
      continue;
    }
    const beat = Math.sin(time * HOME.jumps + one.phase);
    const hop = cheering ? Math.max(0, beat) * HOME.jumpBy : 0;
    const shift = cheering
      ? 0
      : Math.round(Math.sin(time * HOME.fidgets + one.phase) * HOME.fidgetBy);
    const sprite = monkeySprite(
      cheering ? "hang" : "stand",
      one.facingLeft,
      one.coat,
    );
    g.drawImage(
      sprite,
      x - Math.round(MONKEY.wide / 2) + shift,
      Math.round(WORLD.floor - MONKEY.tall - hop),
    );
  }
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
