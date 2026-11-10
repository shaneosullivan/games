import {
  CROC,
  HOME,
  JUNGLE,
  LAKE,
  MONKEY,
  MUSHROOM,
  PAINT,
  RAIN,
  SCREEN,
  VOLCANO,
  WORLD,
} from "../config";
import {
  bananaSprite,
  crocSprite,
  elephantSprite,
  motionSprite,
  propSprite,
} from "../art/monkey";
import {BORED, CELEBRATE, ELEPHANT, LAVA, STAND} from "../art/motion";
import {
  ELEPHANT_SPRAYS,
  branchPath,
  branchTop,
  trunkMiddle,
} from "../world/jungle";
import type {Branch} from "../world/jungle";
import type {Party} from "./particles";
import type {Jungle, Tree, Vine} from "../world/jungle";
import type {Monkey} from "../entities/monkey";

/**
 * The jungle, painted back to front.
 *
 * Everything is snapped to whole pixels before it is drawn. That is the one
 * rule that matters in a picture this small: half a pixel of scroll turns a
 * crisp trunk into two grey trunks, and a game that shimmers while it scrolls
 * looks broken in a way nobody can name.
 */
export function paint(
  /** The game's screen, or anything else with a context and a size —
   *  the chooser's pictures are painted into canvases of their own. */
  screen: {ctx: CanvasRenderingContext2D; wide: number; tall: number},
  jungle: Jungle,
  monkey: Monkey,
  camera: number,
  time: number,
  alpha: number,
  party: Party,
  /** Whether the monkey has got home, which is when the family stops
   *  waiting and starts jumping. */
  cheering: boolean,
  view: {
    /** A sky other than the level's own, for a picture of it. */
    sky?: {high: string; low: string};
    /** How far the camera has stood back: 1 while playing, less once you
     *  are home and it is showing you the tree. See `HOME.zoomTo`. */
    zoom?: number;
  } = {},
): void {
  const g = screen.ctx;
  const zoom = view.zoom ?? 1;
  // Stood back, the picture holds more world than it has pixels for: a
  // wider stretch, and taller — upwards only, because the ground stays
  // where it is along the bottom. `top` is where the top of the picture
  // now is, in the world: zero while playing, above it once stood back.
  const w = screen.wide / zoom;
  const h = screen.tall;
  const top = screen.tall - screen.tall / zoom;
  g.save();
  g.scale(zoom, zoom);
  g.translate(0, -top);

  sky(g, w, h, top, jungle.raining, view.sky);
  // The leaves overhead are the top of the picture, wherever that is.
  g.save();
  g.translate(0, top);
  canopy(g, w, camera);
  g.restore();

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
      from: Math.round(jungle.waterFrom - camera),
      to: Math.round(jungle.waterTo - camera),
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
  if (!jungle.raining) {
    lake(g, jungle, w, camera, time);
    crocs(g, jungle, camera, w);
    elephants(g, jungle, camera, w);
    lava(g, jungle, camera, w, time);
  } else {
    mushrooms(g, jungle, camera, w, time);
  }

  // The vines, and the monkey among them: the vine being held is drawn after
  // the others so the monkey is never behind the thing it is holding.
  for (const vine of jungle.vines) {
    if (vine.x - camera < -90 || vine.x - camera > w + 90) {
      continue;
    }
    rope(g, vine, camera, vine === monkey.vine, time, top);
  }

  if (jungle.raining) {
    coconuts(g, jungle, camera, w, top);
  }
  bananas(g, jungle, camera, w);
  tree(g, jungle, camera, w, time, cheering);
  drawMonkey(g, monkey, camera, alpha);
  party.draw(g, camera);
  if (jungle.raining) {
    // In front of everything, because rain is between you and the jungle.
    g.save();
    g.translate(0, top);
    rain(g, w, h - top, camera, time);
    g.restore();
  }
  g.save();
  g.translate(0, top);
  dapples(g, jungle, camera, time, w, h - top);
  g.restore();
  g.restore();
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

function sky(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: number,
  wet: boolean,
  own?: {high: string; low: string},
): void {
  const grad = g.createLinearGradient(0, top, 0, h);
  grad.addColorStop(0, own?.high ?? (wet ? PAINT.wetSkyHigh : PAINT.skyHigh));
  grad.addColorStop(1, own?.low ?? (wet ? PAINT.wetSkyLow : PAINT.skyLow));
  g.fillStyle = grad;
  g.fillRect(0, top, w, h - top);
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

/**
 * The rain, which never stops.
 *
 * Vertical strokes a pixel across, in two shades and a spread of lengths,
 * which is what the reference is: slanting it or softening it turns rain
 * into weather effects, and this picture does not have the pixels for
 * weather effects. Drawn in screen space off a hash of the drop's number
 * rather than off a list of drops — there is no state to keep, every drop
 * is wherever the clock says it is, and a hundred of them cost one loop.
 *
 * It drifts a little against the camera so the rain is in the world rather
 * than painted on the glass, but only a little: rain does not scroll with
 * the jungle, it falls through it.
 */
function rain(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: number,
  time: number,
): void {
  const down = h + RAIN.long * 3;
  for (let i = 0; i < RAIN.drops; i++) {
    // A hash, so every drop keeps its own column, speed and length for as
    // long as the level lasts.
    const hash = Math.sin(i * 12.9898) * 43758.5453;
    const own = hash - Math.floor(hash);
    const hash2 = Math.sin(i * 78.233) * 12345.6789;
    const own2 = hash2 - Math.floor(hash2);
    const speed = RAIN.falls * (0.7 + own2 * 0.6);
    const long = 2 + Math.round(own2 * RAIN.long);
    const x = Math.round(
      ((own * (w + 40) - camera * 0.25 + i * 37) % (w + 40)) - 20,
    );
    const fell = (own * down + time * speed) % down;
    const y = Math.round(fell) - RAIN.long;
    g.fillStyle = own2 > 0.55 ? PAINT.rain : PAINT.rainDark;
    g.fillRect(x, y, 1, long);
  }
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
    if (jungle.raining) {
      // Mud all the way along, the way the reference is mud: a dark band
      // with the lighter husk of it showing through in lumps and a wet
      // shine standing on the top. The lumps are taken off the world
      // position and not off the screen, so they scroll with the ground
      // instead of swimming across it.
      const lump = Math.sin(world * 0.7) + Math.sin(world * 0.23 + 2);
      const deep = 5 + Math.round(lump);
      g.fillStyle = PAINT.mud;
      g.fillRect(sx, top, 1, deep);
      g.fillStyle = PAINT.mudDark;
      g.fillRect(sx, top + deep - 2, 1, 2);
      if (lump > 1.1) {
        g.fillStyle = PAINT.mudLight;
        g.fillRect(sx, top + 1, 1, 2);
      }
      // Standing water, in the dips. A puddle at this size is two pixels
      // of something paler than the mud under it.
      if (lump < -1.3) {
        g.fillStyle = PAINT.mudWet;
        g.fillRect(sx, top, 1, 1);
      }
      continue;
    }
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
    // Nothing grows out of the lava, the water, or the mud: in the rain
    // the floor is churned up, and a tuft of grass standing in it is the
    // dry jungle showing through.
    if (jungle.raining || jungle.overCrater(x) || jungle.overWater(x)) {
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
  jungle: Jungle,
  w: number,
  camera: number,
  time: number,
): void {
  if (jungle.waterTo <= jungle.waterFrom) {
    return;
  }
  const from = Math.round(jungle.waterFrom - camera);
  const wide = jungle.waterTo - jungle.waterFrom;
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
      spurt(g, x, base, t, time);
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
  t: number,
  time: number,
): void {
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

  // The jet, as parcels of lava rather than as a column.
  //
  // Each one leaves the vent a little after the one before and a little
  // slower, and from then on it is on its own arc. Early on they are close
  // enough together to read as one thick jet; as they come down they
  // separate into drops, land at their own times, and the last of them are
  // still in the air when the first are back in the lava. That is the whole
  // trick: nothing here draws a break-up, the break-up is what eleven
  // parabolas look like.
  const firing = VOLCANO.spurts;
  const since = t * firing;
  // Chosen rather than tuned: this gravity and this launch speed put the
  // lead parcel at `reaches` exactly at the top of its arc and back in the
  // lava exactly as the firing ends.
  const falls = (8 * VOLCANO.reaches) / (firing * firing);
  const thrown = (falls * firing) / 2;
  for (let i = 0; i < VOLCANO.drops; i++) {
    const u = since - i * VOLCANO.dropEvery;
    if (u <= 0) {
      continue;
    }
    const core = i < VOLCANO.jet;
    const speed = thrown * (1 - i * VOLCANO.thins);
    const high = speed * u - 0.5 * falls * u * u;
    const lands = (2 * speed) / falls;
    // Thrown outwards as well as up, the further back in the queue the
    // wider — so the jet goes up as one thing and comes down as a fan.
    const out = core ? 0 : ((i % 2 === 0 ? 1 : -1) * (i - VOLCANO.jet + 1)) / 5;
    const by = Math.round(out * VOLCANO.fans * u);
    if (high <= 0) {
      // Back in the lava: a flat splash where it went in, for a moment.
      if (u < lands + 0.09) {
        g.fillStyle = PAINT.lavaBright;
        g.fillRect(x + by - 2, base - 1, 5, 2);
      }
      continue;
    }
    const at =
      x + by + Math.round(Math.sin(i * 1.7 + time * 9) * VOLCANO.wavers);
    const y = Math.round(base - high);
    // The jet is thick and the spray is thin: a drop at this size is a
    // streak a pixel or two across and three tall, brightest at its tail,
    // which is what falling lava looks like and what a square does not.
    const fat = core ? Math.min(wide, 3 + i) : i % 3 === 0 ? 2 : 1;
    const long = core ? 4 : 3;
    const half = Math.floor(fat / 2);
    g.fillStyle = PAINT.lava;
    g.fillRect(at - half - 1, y - 1, fat + 2, long + 2);
    g.fillStyle = PAINT.lavaBright;
    g.fillRect(at - half, y, fat, long);
    if (fat > 3) {
      g.fillStyle = PAINT.lavaHot;
      g.fillRect(at, y, 1, long);
    }
  }
}

/**
 * The elephants standing in the river, and spraying.
 *
 * From the sprite sheet: standing on its first frame, and once somebody
 * has landed on it, the spray played through once from the top — the
 * fountain and the drops raining round it are the sheet's own, not drawn
 * here any more. Drawn after the water, so its feet are in the river.
 *
 * Placed by the body rather than by the box: the box is far wider and
 * taller than the elephant, to hold the fountain, so the standing
 * elephant's middle goes on \`one.x\` and its back on \`backOf\`, which is
 * where the monkey lands. A box placed by its own middle put the back
 * somewhere the game did not think it was.
 */
function elephants(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
): void {
  for (const one of jungle.elephants) {
    const x = one.x - camera;
    if (x < -60 || x > w + 60) {
      continue;
    }
    const frame =
      one.spurt > 0
        ? 1 + Math.floor(((ELEPHANT_SPRAYS - one.spurt) * 1000) / ELEPHANT.ms)
        : 0;
    const sprite = elephantSprite(frame, one.facingLeft);
    const k = MONKEY.detail;
    // Its middle across, measured from whichever side it is drawn from.
    const middle = one.facingLeft
      ? sprite.width - ELEPHANT.middle
      : ELEPHANT.middle;
    const feet = jungle.backOf(one) + ELEPHANT.tall / k;
    const snap = (v: number): number =>
      Math.round(v * SCREEN.fine) / SCREEN.fine;
    g.drawImage(
      sprite,
      snap(x - middle / k),
      snap(feet - sprite.height / k),
      sprite.width / k,
      sprite.height / k,
    );
  }
}

/**
 * The coconuts: hanging, shaking, falling, and what is left of one.
 *
 * The shake is drawn as a sideways jitter of a pixel or two, fast, which
 * at this size is the loudest way to say "this one is about to go" without
 * drawing anything that is not the coconut itself.
 */
function coconuts(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
  /** Where the top of the picture is: see `paint`. */
  top: number,
): void {
  const nut = propSprite("coconut");
  const burst = propSprite("splat");
  for (const one of jungle.coconuts) {
    const x = Math.round(one.x - camera);
    if (x < -20 || x > w + 20) {
      continue;
    }
    if (one.splat > 0) {
      g.drawImage(
        burst,
        x - Math.round(burst.width / 2),
        Math.round(jungle.floorAt(one.x)) - burst.height + 2,
      );
      continue;
    }
    if (one.back > 0) {
      continue;
    }
    // Shaking on its stalk: a jitter either side, and the stalk above it so
    // the thing is hanging from the canopy rather than floating under it.
    const shake =
      one.wobble > 0 ? (Math.round(one.wobble * 40) % 2 === 0 ? 1 : -1) : 0;
    const at = x + shake;
    if (!one.falling) {
      g.fillStyle = PAINT.vineDark;
      // Up to the top of the picture, which is above the stalk's own
      // four pixels once the camera has stood back.
      const from = Math.min(Math.round(one.y) - 4, top);
      g.fillRect(at, from, 1, Math.round(one.y) - from);
    }
    g.drawImage(
      nut,
      at - Math.round(nut.width / 2),
      Math.round(one.y) - Math.round(nut.height / 2),
    );
  }
}

/**
 * The mushrooms you come back to life at, with the sparkle that says so.
 *
 * Four motes going round it rather than a glow: a glow at this size is a
 * smudge, and four pixels turning is unmistakably something magic. They
 * turn faster and sit wider once the mushroom has been passed, which is
 * the only way the picture says "this is the one you will come back to".
 */
function mushrooms(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
  time: number,
): void {
  const cap = propSprite("mushroom");
  for (const one of jungle.mushrooms) {
    const x = Math.round(one.x - camera);
    if (x < -20 || x > w + 20) {
      continue;
    }
    const foot = Math.round(jungle.floorAt(one.x));
    g.drawImage(cap, x - Math.round(cap.width / 2), foot - cap.height + 1);
    const spin = time * Math.PI * 2 * MUSHROOM.sparkles * (one.lit ? 1.6 : 1);
    const out = MUSHROOM.sparkleBy * (one.lit ? 1.3 : 1);
    for (let i = 0; i < 4; i++) {
      const turn = spin + (i / 4) * Math.PI * 2;
      const sx = x + Math.round(Math.cos(turn) * out);
      const sy = foot - 6 + Math.round(Math.sin(turn) * out * 0.6);
      g.fillStyle = i % 2 === 0 ? PAINT.dapple : PAINT.lavaHot;
      g.fillRect(sx, sy, 1, 1);
    }
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
  time: number,
  top: number,
): void {
  // Stood back at home, the leaves overhead are far above where the vine
  // was tied, and a vine stopping in the open sky is a vine hanging from
  // nothing: so it carries on up to them.
  if (top < 0) {
    g.fillStyle = PAINT.vineDark;
    g.fillRect(Math.round(vine.x - camera), top, 1, vine.y - top);
  }
  if (vine.snake) {
    snake(g, vine, camera, time);
    return;
  }
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

/**
 * A snake, hanging where a vine would.
 *
 * Three pixels across against a vine's one, two greens with a lighter
 * stripe down it, and a head with eyes and a tongue on the end: a child
 * must be able to tell this from a vine across the screen, long before
 * they are near enough to take hold of one. The reference has the stripe
 * in yellow and this one keeps the stripe and makes it green, because
 * the stripe is what makes it a snake rather than a rope.
 *
 * And it waves as it hangs, a pixel or so either way. That is drawing
 * only — the thing the game catches you on is where the physics says it
 * is — but a snake that hung perfectly still would be a rope painted
 * green.
 */
function snake(
  g: CanvasRenderingContext2D,
  vine: Vine,
  camera: number,
  time: number,
): void {
  const knots = vine.knots;
  const waveAt = (y: number): number =>
    Math.sin(y * 0.22 + vine.phase + time * 1.6) * 1.4;
  let along = 0;
  for (let i = 0; i < knots.length - 1; i++) {
    const ax = knots[i].x - camera;
    const ay = knots[i].y;
    const bx = knots[i + 1].x - camera;
    const by = knots[i + 1].y;
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const y = ay + (by - ay) * t;
      const x = Math.round(ax + (bx - ax) * t + waveAt(y));
      const row = Math.round(y);
      along += 1;
      g.fillStyle = PAINT.snakeDark;
      g.fillRect(x - 1, row, 3, 1);
      g.fillStyle = along % 3 === 0 ? PAINT.snakeLight : PAINT.snake;
      g.fillRect(x, row, 1, 1);
    }
  }
  const end = knots[knots.length - 1];
  const head = propSprite("snake");
  g.drawImage(
    head,
    Math.round(end.x - camera + waveAt(end.y)) - Math.round(head.width / 2),
    Math.round(end.y) - 2,
  );
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
  let sprite: HTMLCanvasElement;
  if (monkey.burning !== null) {
    // Thrown up off the lava, clutching its bottom: the lava sheet, played
    // once across the bounce, from the leap to the last of the clutching.
    const each = VOLCANO.watchFor / LAVA.length;
    sprite = motionSprite(
      "lava",
      Math.min(LAVA.length - 1, Math.floor(monkey.burning / each)),
      monkey.facingLeft,
    );
  } else if (monkey.doing === "ground" && Math.abs(monkey.vx) >= 6) {
    // Running, from the sheet: down on all fours, a frame per few pixels
    // of ground so the legs keep pace with it.
    sprite = motionSprite(
      "run",
      Math.floor(monkey.stride / MONKEY.strideFrame),
      monkey.facingLeft,
    );
  } else if (monkey.doing === "air") {
    // Jumping and flying, from the sheet: which of the three is down to
    // which way it is going.
    const frame =
      monkey.vy < MONKEY.rises ? 0 : monkey.vy > MONKEY.falls ? 2 : 1;
    sprite = motionSprite("jump", frame, monkey.facingLeft);
  } else if (monkey.doing === "ground" && monkey.bored) {
    // Passing the time: one of the bored things, played through once.
    const one = BORED[monkey.bored.what];
    sprite = motionSprite(
      monkey.bored.what,
      Math.min(
        one.frames.length - 1,
        Math.floor((monkey.bored.for * 1000) / one.ms),
      ),
      monkey.facingLeft,
    );
  } else if (monkey.doing === "ground") {
    // Standing about, the tail swaying, for as long as it has been still.
    sprite = motionSprite(
      "stand",
      Math.floor((monkey.stillFor * 1000) / STAND.ms),
      monkey.facingLeft,
    );
  } else {
    // On a trunk or on a rope — all that is left of what a monkey can be
    // doing — from the climbing sheet: an arm at a time, a frame for every
    // few pixels climbed, so the arms keep pace with the climbing. Stop
    // climbing and the frame stops with it, since the count only moves
    // while the monkey does, so a monkey just hanging, or swinging, hangs
    // in the position it was in when it stopped.
    sprite = motionSprite(
      "climb",
      Math.floor(monkey.stride / MONKEY.climbFrame),
      monkey.facingLeft,
    );
  }
  standOnFeet(g, sprite, x - camera, y, MONKEY.detail);
}

/**
 * Draws a monkey standing on a point: feet on it, centred on it.
 *
 * Whatever size the drawing is — the frames from the sheets are not the
 * monkey's own thirteen by fifteen, and placing them as if they were put
 * a running monkey's feet a few pixels into the ground. `perPixel` is how
 * many letters of it go to one picture pixel: the sheets' frames are
 * drawn at `MONKEY.detail`, half a pixel a letter, which is where the
 * extra detail comes from; the hand-drawn poses at one.
 *
 * Snapped to the canvas's own pixels rather than the picture's, so at two
 * letters to the pixel the monkey moves in half-pixel steps and every
 * letter still lands on exactly one canvas pixel — crisp, never smeared
 * across two.
 */
function standOnFeet(
  g: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  perPixel: number,
): void {
  const wide = sprite.width / perPixel;
  const tall = sprite.height / perPixel;
  const snap = (v: number): number => Math.round(v * SCREEN.fine) / SCREEN.fine;
  g.drawImage(sprite, snap(x - wide / 2), snap(y - tall), wide, tall);
}

/**
 * Home: one enormous tree at the end of the jungle, with the family up in
 * its branches.
 *
 * Built so that while you play it is only a trunk. Its lowest branch is
 * above the top of the picture, and the leaves overhead hide where the
 * trunk goes; it is when the camera stands back (`HOME.zoomTo`) that the
 * rest of it, and everybody standing in it, comes into view.
 *
 * Not the same on both sides — the trunk leans and bends, the roots
 * spread further one way, the branches are different each side and the
 * leaves sit off the middle — because a tree drawn the same both ways is
 * a drawing of a tree. Outlined, as the monkey is.
 *
 * In layers from the back: most of the cloud of leaves, the trunk with
 * its roots and the limbs it splits into, the rest of the leaves over the
 * tops of those, the branches across it all with their forks and twigs
 * and leaves, and the family on top of the lot — nothing may be
 * in front of a monkey, because a monkey in this tree is the point of it.
 */
function tree(
  g: CanvasRenderingContext2D,
  jungle: Jungle,
  camera: number,
  w: number,
  time: number,
  cheering: boolean,
): void {
  const x = Math.round(jungle.homeX - camera);
  if (x + HOME.leavesRight < -40 || x + HOME.leavesLeft > w + 40) {
    return;
  }

  const all = puffs();
  const front = all.filter((one, i) => one.y < HOME.frontAbove && i % 2 === 0);
  for (const one of all) {
    if (!front.includes(one)) {
      leafPuff(g, x + one.x, one.y, one.r);
    }
  }
  // The limbs and the roots share their outline with the trunk: all of
  // the outlines go down first, then the trunk, then the wood of the rest
  // over both, so where a limb leaves the trunk or a root meets it they
  // are one piece of wood and not two drawn round separately.
  const strokes = [
    ...HOME.limbs.flatMap(one => curve(x, one.points, one.from, one.to)),
    ...HOME.roots.map(root => ({
      ax: x + root.from[0],
      ay: root.from[1],
      bx: x + root.to[0],
      by: root.to[1],
      from: root.thick,
      to: 2,
    })),
  ];
  wood(g, strokes, "line");
  trunk(g, x);
  wood(g, strokes, "wood");

  // Leaves in front of the limbs, up where they end, but behind the
  // branches: the family stand on those, and a branch under leaves would
  // leave them standing on a bush.
  for (const one of front) {
    leafPuff(g, x + one.x, one.y, one.r);
  }
  for (const one of HOME.limbs) {
    const [ex, ey] = one.points[one.points.length - 1];
    leafPuff(g, x + ex, ey - 2, 16);
    leafPuff(g, x + ex - 12, ey + 6, 11);
  }

  for (const branch of HOME.branches) {
    limb(g, x, branch);
  }
  for (const branch of HOME.branches) {
    sprigs(g, x, branch);
  }

  family(g, jungle, camera, w, time, cheering);
}

/**
 * The trunk, from its roots up to where it splits, leaning and bending as
 * `trunkMiddle` says and narrowing as it climbs. A row of whole pixels at a
 * time, so the edges are a staircase of single pixels and not a smear.
 */
function trunk(g: CanvasRenderingContext2D, x: number): void {
  const base = WORLD.floor;
  for (let y = HOME.split; y < base; y++) {
    const up = (base - y) / (base - HOME.split);
    const half = HOME.trunk / 2 - up * (HOME.trunk / 5);
    // The roots: the last dozen pixels flare out, further to the left.
    const flare = Math.max(0, (y - (base - 14)) / 14) ** 2;
    const middle = x + trunkMiddle(y);
    const left = Math.round(middle - half - flare * (HOME.rootsLeft - half));
    const right = Math.round(middle + half + flare * (HOME.rootsRight - half));
    const wide = right - left;
    g.fillStyle = PAINT.barkLine;
    g.fillRect(left - 1, y, wide + 2, 1);
    g.fillStyle = PAINT.bark;
    g.fillRect(left, y, wide, 1);
    // Lit down its left side, which is where the jungle's light comes
    // from, and dark down its right.
    g.fillStyle = PAINT.barkLight;
    g.fillRect(left, y, 3, 1);
    g.fillStyle = PAINT.barkDark;
    g.fillRect(right - 5, y, 5, 1);
    // Moss low down, thickest at the foot and thinning out as it climbs,
    // and only on the shady side of the light stripe.
    const mossy = Math.max(0, 1 - (base - y) / 34);
    for (let k = 3; k < wide - 5; k++) {
      if (hash(k * 13.1 + y * 7.7) < mossy * 0.55) {
        g.fillStyle = hash(k + y) < 0.3 ? PAINT.mossLight : PAINT.moss;
        g.fillRect(left + k, y, 1, 1);
      }
    }
    g.fillStyle = PAINT.barkDark;
    // Grooves in the bark, wandering a pixel either way as they climb.
    for (let k = 1; k < 7; k++) {
      const at =
        left + Math.round((k / 7) * wide + Math.sin(y * 0.07 + k) * 1.6);
      g.fillRect(at, y, 1, 1);
    }
  }
}

/**
 * One of the branches the family stand on, along its points, in columns:
 * its top is exactly where `branchTop` says, which is where their feet
 * go. Thick at the trunk and thin at the tip, lit along the top and dark
 * underneath, with the outline round it.
 */
function limb(g: CanvasRenderingContext2D, x: number, branch: Branch): void {
  const path = branchPath(branch);
  const from = path[0][0];
  const to = path[path.length - 1][0];
  const way = Math.sign(to - from);
  const long = Math.abs(to - from);
  for (let d = 0; d <= long; d++) {
    const at = from + way * d;
    const top = branchTop(branch, at);
    if (top === null) {
      continue;
    }
    const out = d / long;
    const fat = Math.max(2, Math.round(branch.thick * (1 - out * 0.7)));
    const sx = Math.round(x + at);
    g.fillStyle = PAINT.barkLine;
    g.fillRect(sx, top - 1, 1, fat + 2);
    g.fillStyle = PAINT.bark;
    g.fillRect(sx, top, 1, fat);
    g.fillStyle = PAINT.barkLight;
    g.fillRect(sx, top, 1, 1);
    g.fillStyle = PAINT.barkDark;
    g.fillRect(sx, top + Math.ceil(fat * 0.6), 1, Math.floor(fat * 0.4));
  }
}

/** A straight piece of wood, `from` thick at its start and `to` at its
 *  end. */
interface Stroke {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  from: number;
  to: number;
}

/**
 * Pieces of wood at any angle — the limbs, the roots, the forks, the
 * twigs — stamped along their length a square at a time.
 *
 * In two goes, the outline and then the wood, and the outline goes down
 * for all of them before the wood of any: where two meet they join rather
 * than each being drawn round. `both` does the two at once, for the
 * pieces nothing else has to go between.
 *
 * The wood is lit along its upper side and, where it is thick enough to
 * stand on, mossy along the top.
 */
function wood(
  g: CanvasRenderingContext2D,
  strokes: Array<Stroke>,
  pass: "line" | "wood" | "both" = "both",
): void {
  const passes = pass === "both" ? ["line", "wood"] : [pass];
  for (const one of passes) {
    for (const s of strokes) {
      const long = Math.hypot(s.bx - s.ax, s.by - s.ay);
      for (let i = 0; i <= long; i += 0.5) {
        const t = long > 0 ? i / long : 0;
        const fat = Math.max(1, Math.round(s.from + (s.to - s.from) * t));
        const cx = s.ax + (s.bx - s.ax) * t;
        const cy = s.ay + (s.by - s.ay) * t;
        const px = Math.round(cx - fat / 2);
        const py = Math.round(cy - fat / 2);
        if (one === "line") {
          g.fillStyle = PAINT.barkLine;
          g.fillRect(px - 1, py - 1, fat + 2, fat + 2);
          continue;
        }
        g.fillStyle = fat > 2 ? PAINT.bark : PAINT.barkDark;
        g.fillRect(px, py, fat, fat);
        if (fat >= 5) {
          const lit = Math.max(1, Math.round(fat / 4));
          g.fillStyle = PAINT.barkLight;
          g.fillRect(px + 1, py, lit, lit);
          g.fillStyle = PAINT.barkDark;
          g.fillRect(px + fat - lit - 1, py + fat - lit, lit, lit);
        }
        if (fat >= 8 && hash(Math.round(cx) * 3.7 + Math.round(cy)) < 0.35) {
          g.fillStyle =
            hash(Math.round(cx) + 0.5) < 0.4 ? PAINT.mossLight : PAINT.moss;
          g.fillRect(Math.round(cx), py, 2, 1);
        }
      }
    }
  }
}

/**
 * A smooth curve through a limb's points, as short straight pieces of
 * wood narrowing from `from` to `to` — through every point, which a
 * curve fitted near them would not be.
 */
function curve(
  x: number,
  points: ReadonlyArray<readonly [number, number]>,
  from: number,
  to: number,
): Array<Stroke> {
  const out: Array<Stroke> = [];
  const n = points.length - 1;
  const at = (i: number): readonly [number, number] =>
    points[Math.max(0, Math.min(n, i))];
  const steps = 6;
  let last: [number, number] | null = null;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom, which passes through every point it is given.
      const px =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const py =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      const here: [number, number] = [x + px, py];
      if (last) {
        const u0 = (i + (k - 1) / steps) / n;
        const u1 = (i + t) / n;
        out.push({
          ax: last[0],
          ay: last[1],
          bx: here[0],
          by: here[1],
          from: from + (to - from) * u0,
          to: from + (to - from) * u1,
        });
      }
      last = here;
    }
  }
  return out;
}

/** A number from 0 to 1 that is the same every time for the same `n`:
 *  where the moss goes, so it stays put from one frame to the next. */
function hash(n: number): number {
  const h = Math.sin(n * 12.9898) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * The forks off a branch, the twigs off them, and the leaves on all their
 * ends.
 *
 * Every `forkEvery` or so along it, up and outwards mostly and now and
 * then hanging down; never where one of the family stands, or it would
 * come up through them. Scattered from a seed of the branch's own, so the
 * tree is the same every time and no two branches are the same.
 */
function sprigs(g: CanvasRenderingContext2D, x: number, branch: Branch): void {
  const path = branchPath(branch);
  const from = path[0][0];
  const to = path[path.length - 1][0];
  const way = Math.sign(to - from);
  let seed = Math.abs(Math.round(to * 31 + path[0][1] * 7)) + 1;
  const rng = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const strokes: Array<Stroke> = [];
  const tips: Array<[number, number, number]> = [];
  const standing = HOME.perches
    .filter(p => HOME.branches[p.branch] === branch)
    .map(p => p.at);
  for (
    let d = HOME.trunk / 2 + 6 + rng() * 8;
    d < Math.abs(to - from) - 4;
    d += HOME.forkEvery * (0.7 + rng() * 0.6)
  ) {
    const at = from + way * d;
    if (standing.some(p => Math.abs(p - at) < 10)) {
      continue;
    }
    const top = branchTop(branch, at);
    if (top === null) {
      continue;
    }
    const down = rng() < 0.25;
    // Up, between straight up and well out to the side; or down and out.
    const angle = down ? 0.3 + rng() * 0.5 : -(0.5 + rng() * 0.9);
    const long = HOME.forkShort + rng() * (HOME.forkLong - HOME.forkShort);
    const ax = x + at;
    const ay = down ? top + 3 : top;
    const bx = ax + way * Math.cos(angle) * long;
    const by = ay + Math.sin(angle) * long;
    strokes.push({ax, ay, bx, by, from: 3, to: 1});
    tips.push([bx, by, way]);
    // A twig off it, near its end, splaying the other way.
    const k = 0.55 + rng() * 0.2;
    const tx = ax + (bx - ax) * k;
    const ty = ay + (by - ay) * k;
    const turn = angle + (rng() < 0.5 ? -0.7 : 0.7);
    const twig = HOME.twigLong * (0.6 + rng() * 0.4);
    const ex = tx + way * Math.cos(turn) * twig;
    const ey = ty + Math.sin(turn) * twig;
    strokes.push({ax: tx, ay: ty, bx: ex, by: ey, from: 1, to: 1});
    tips.push([ex, ey, way]);
  }
  const [ex, ey] = path[path.length - 1];
  spray(g, x + ex, ey, way, Math.round(to));
  wood(g, strokes);
  for (const [tx, ty, w] of tips) {
    leaves(g, tx, ty, w);
  }
}

/**
 * A spray of three twigs off the end of a limb or a branch, splaying out
 * the way it was going, with leaves on each.
 */
function spray(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  way: number,
  seeded: number,
): void {
  const strokes: Array<Stroke> = [];
  const tips: Array<[number, number]> = [];
  for (const [i, turn] of [-1.1, -0.45, 0.25].entries()) {
    const long = 8 + hash(seeded + i) * 9;
    const bx = x + way * Math.cos(turn) * long;
    const by = y + Math.sin(turn) * long;
    strokes.push({ax: x, ay: y, bx, by, from: 2, to: 1});
    tips.push([bx, by]);
  }
  wood(g, strokes);
  for (const [tx, ty] of tips) {
    leaves(g, tx, ty, way);
  }
}

/**
 * A few leaves on the end of a twig: little pointed shapes, pixel by
 * pixel, two greens, scattered round the tip and pointing out the way
 * the twig was going.
 */
function leaves(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  way: number,
): void {
  const at: Array<[number, number]> = [
    [0, -3],
    [3 * way, 0],
    [-2 * way, 1],
  ];
  for (const [dx, dy] of at) {
    leaf(g, Math.round(x + dx), Math.round(y + dy), way);
  }
}

/** One leaf: a pointed shape five pixels long, its point outwards, in
 *  greens lighter than the leaves behind it so it shows against them. */
function leaf(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  way: number,
): void {
  const tip = way > 0 ? x + 3 : x - 3;
  g.fillStyle = PAINT.leafDark;
  g.fillRect(x - 2, y - 1, 5, 3);
  g.fillRect(tip, y, 1, 1);
  g.fillStyle = PAINT.sprig;
  g.fillRect(x - 1, y - 1, 3, 2);
  g.fillRect(way > 0 ? x + 2 : x - 2, y, 1, 1);
  g.fillStyle = PAINT.sprigLight;
  g.fillRect(x - 1, y - 1, 2, 1);
}

/** One puff of leaves: its dark underside, itself, the light on top. */
function leafPuff(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  disc(g, x, y + 4, r, PAINT.leafDark);
  disc(g, x, y, r - 2, PAINT.leaf);
  disc(
    g,
    x - Math.round(r * 0.2),
    y - Math.round(r * 0.35),
    r * 0.5,
    PAINT.leafLight,
  );
}

/** A filled circle, a row of whole pixels at a time. */
function disc(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: string,
): void {
  g.fillStyle = colour;
  const cx = Math.round(x);
  const cy = Math.round(y);
  const rr = Math.round(r);
  for (let dy = -rr; dy <= rr; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/**
 * Where the puffs of the tree's leaves are, across from the middle of the
 * trunk and down from the top of the picture.
 *
 * Scattered once from a fixed seed, so the tree is the same tree every
 * time, inside the lopsided outline `HOME.leaves*` gives — round at the
 * ends, higher on the left — with a row of smaller ones hanging below it.
 * In order from the top down: each puff is drawn over the one above it,
 * which puts every puff's lit top over the shadow of the last and is
 * what turns a heap of circles into a cloud.
 */
let scattered: Array<{x: number; y: number; r: number}> | null = null;

function puffs(): Array<{x: number; y: number; r: number}> {
  if (scattered) {
    return scattered;
  }
  let seed = 12345;
  const rng = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const left = HOME.leavesLeft;
  const right = HOME.leavesRight;
  const made: Array<{x: number; y: number; r: number}> = [];
  for (let i = 0; i < HOME.puffs; i++) {
    const r = HOME.puffSmall + rng() * (HOME.puffBig - HOME.puffSmall);
    const along = rng();
    const across = left + r + along * (right - left - 2 * r);
    // Higher at the left, and rounder towards the ends.
    const top = HOME.leavesTop + r * 0.6 + HOME.tilt * along;
    const bottom = HOME.leavesBottom - r * 0.4;
    const round = Math.sqrt(1 - (2 * along - 1) ** 2);
    const middle = (top + bottom) / 2;
    const half = ((bottom - top) / 2) * (0.35 + 0.65 * round);
    const y = middle + (rng() * 2 - 1) * half;
    // Thin in the middle low down, where the limbs climb out of the
    // trunk: a tree you can see into, rather than a lid on a pole.
    if (Math.abs(across) < HOME.open && y > HOME.leavesTop + 90) {
      continue;
    }
    made.push({x: across, y, r});
  }
  for (let i = 0; i < HOME.hangers; i++) {
    const along = (i + rng()) / HOME.hangers;
    const r = 8 + rng() * 6;
    const round = Math.sqrt(1 - (2 * along - 1) ** 2);
    made.push({
      x: left + 20 + along * (right - left - 40),
      y: HOME.leavesBottom - 20 * (1 - round) + rng() * HOME.hangBy,
      r,
    });
  }
  scattered = made.sort((p, q) => p.y - q.y);
  return scattered;
}

/**
 * The monkeys waiting at home, up in the tree.
 *
 * Milling about along their branches while you are away — a pixel or two either way, which is
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
    const shift = cheering
      ? 0
      : Math.round(Math.sin(time * HOME.fidgets + one.phase) * HOME.fidgetBy);
    // Waiting, they stand the way the monkey stands, tail and all — each
    // a little way round the loop from the others, or the three of them
    // sway in step like a chorus line. Cheering, they jump with their arms
    // up, out of step for the same reason; the jump is in the sprite.
    if (cheering) {
      standOnFeet(
        g,
        motionSprite(
          "celebrate",
          Math.floor((time * 1000) / CELEBRATE.ms + one.phase * 3),
          one.facingLeft,
          one.coat,
        ),
        x,
        one.y,
        MONKEY.detail,
      );
    } else {
      standOnFeet(
        g,
        motionSprite(
          "stand",
          Math.floor((time * 1000) / STAND.ms + one.phase * 3),
          one.facingLeft,
          one.coat,
        ),
        x + shift,
        one.y,
        MONKEY.detail,
      );
    }
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
