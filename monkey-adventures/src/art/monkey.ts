/**
 * The monkey, drawn a pixel at a time.
 *
 * Written out as letters rather than generated from shapes. Everywhere else
 * in this repo the rule is to make the art in code, and this is that rule
 * kept rather than broken: these *are* the instructions for the drawing, in
 * the only form that makes sense at thirteen pixels across. Circles and
 * rectangles rounded to a grid this small come out as mush, and the whole
 * point of the look is that every pixel was put somewhere on purpose.
 *
 * Each pose is baked once into its own little canvas, and again flipped, so
 * that drawing a monkey is one `drawImage` and the game can do it sixty times
 * a second without thinking about it.
 */
const PALETTE: Record<string, string> = {
  f: "#8a5a32",
  d: "#64401f",
  l: "#d2a269",
  m: "#f3d3a8",
  e: "#2a1a10",
  t: "#8a5a32",
  y: "#ffd257",
  b: "#c98f2a",
  /** The pale inside of a banana's curve, and the dark line round it.
   *  A banana at this size needs three yellows and an outline or it is a
   *  yellow smudge: the outline is what makes it an object. */
  Y: "#ffeca8",
  /** The coconut: a dark shell with the husk showing lighter where the
   *  light is, the way the one in the picture is mottled rather than
   *  flat. */
  n: "#4a2d14",
  N: "#6d4420",
  H: "#9a6a36",
  /** A mushroom's cap and its stalk, and the spots on it. */
  c: "#d6453c",
  C: "#a32e28",
  s: "#f1e0c0",
  /** An elephant: the grey-green of the reference rather than a blue
   *  grey, a darker underside, and the white of a tusk. */
  p: "#68786b",
  P: "#4a5950",
  q: "#e8efe6",
  /** A snake: green, with darker bands and a yellow eye. */
  k: "#4f9440",
  K: "#2f6b34",
  j: "#ffd257",
  /** A heart: the red, the shade down its right side, and the glint. */
  r: "#ed1c24",
  R: "#b10f14",
  g: "#5bb04a",
  G: "#3c8035",
  B: "#c9d98a",
  w: "#f6f4ec",
};

/**
 * Hanging from a vine, and in the air, which look the same and should — a
 * monkey in flight is a monkey reaching for the next vine.
 *
 * Both hands on the rope, side by side with it running down between them.
 * The arms used to be out at either side like a child on monkey bars, and
 * a vine is not monkey bars: nothing was holding it. The hands are where
 * the rope ends, so the grip is a grip and not a coincidence.
 */
const HANG = [
  "....ff.ff....",
  "....ff.ff....",
  "....ff.ff....",
  "...fdddddf...",
  "..ffdfffffdf.",
  "..fdllllllf..",
  "...dleleld...",
  "...dlmmmld...",
  "....dmmmd....",
  "...fffffff...",
  "..ffffffffft.",
  "..fffffffftt.",
  "..ffffffff.t.",
  "...fff.fff...",
  "...dd...dd...",
];

/** Standing on the ground, arms down. */
const STAND = [
  "....ddddd....",
  "..dddfffddd..",
  "..ddfffffdd..",
  "...dlllllld..",
  "...dleleld...",
  "...dlmmmld...",
  "....dmmmd....",
  ".....ddd.....",
  "...fffffff...",
  "..ffffffffft.",
  "..fffffffftt.",
  "..ffffffff.t.",
  "...fff.fff...",
  "...dd...dd...",
  "..ddd...ddd..",
];

/** Running: the same monkey with its legs somewhere else. Two frames is
 *  plenty at this size — the eye reads the change, not the drawing. */
const RUN_A = [
  ...STAND.slice(0, 12),
  "...fff.fff...",
  "..dd......dd.",
  ".ddd.........",
];
const RUN_B = [
  ...STAND.slice(0, 12),
  "...fff.fff...",
  "....dd.dd....",
  "...ddd.ddd...",
];

/** The other half of a climb: the same reach with the legs swapped, so a
 *  monkey going up a trunk is plainly working at it. */
const CLIMB_B = [
  ...HANG.slice(0, 12),
  "...fff.fff...",
  "....dd..d....",
  "...dd....d...",
];

export type Pose = "hang" | "stand" | "runA" | "runB" | "climbB";

const DRAWN: Record<Pose, Array<string>> = {
  hang: HANG,
  stand: STAND,
  runA: RUN_A,
  runB: RUN_B,
  climbB: CLIMB_B,
};

/**
 * The other monkeys at home are the same monkey in a different coat.
 *
 * Three fur colours swapped into the palette rather than three more sets of
 * letters: a family should look like a family, and redrawing the same
 * thirteen-pixel animal three times would give three subtly different
 * animals and no more information.
 */
export const COATS: ReadonlyArray<Record<string, string>> = [
  {},
  {f: "#a3703c", d: "#7a4e23", l: "#e0b67c"},
  {f: "#6f4526", d: "#4f3119", l: "#bb8d58"},
  {f: "#b98a52", d: "#8a5f32", l: "#ecd0a0"},
];

function bake(
  rows: Array<string>,
  flip: boolean,
  coat: Record<string, string> = {},
): HTMLCanvasElement {
  const wide = rows[0].length;
  const tall = rows.length;
  const canvas = document.createElement("canvas");
  canvas.width = wide;
  canvas.height = tall;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context");
  }
  for (let y = 0; y < tall; y++) {
    for (let x = 0; x < wide; x++) {
      const key = rows[y][flip ? wide - 1 - x : x];
      const colour = coat[key] ?? PALETTE[key];
      if (!colour) {
        continue;
      }
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/**
 * A banana, hung by the vines to be swung through.
 *
 * Drawn from a reference rather than invented: a black outline the whole
 * way round, the amber underside, the yellow body, the cream along the
 * inside of the curve, and the stub of a stem at the fat end. The old one
 * was a seven-pixel crescent of two yellows and it read as a moon.
 *
 * Twelve across and eight down: long rather than tall, which is the shape
 * of the thing — a banana as wide as the monkey is too much fruit, but one
 * that is only as long as it is deep is a croissant.
 */
const BANANA = [
  "...ee.......",
  "..edde......",
  ".eeYYe......",
  "ebyYYYe.....",
  "ebyyYYYee...",
  ".ebbyyYYYYe.",
  "..eebbyyYYYe",
  "....eeeeeeee",
];

/**
 * A crocodile, mostly under the water.
 *
 * Two pieces, because the jaw has to move: the body carries the eyes, the
 * back and the upper jaw, and the lower jaw is drawn under it and dropped
 * by a pixel or three to open the mouth. Facing right, which is the way the
 * jungle goes; swimming the other way flips it.
 */
const CROC_BODY = [
  "..G...G.........yy....",
  ".GGG.GGG....GGGGGGGG..",
  "GGGGGGGGGGgggggggggggg",
  ".gggggggggggggggggggg.",
  ".ggggggggggwwwwwwwwww.",
  "..BBBBBBBB............",
];

/** The lower jaw, drawn under the snout and dropped to open the mouth. */
const CROC_JAW = [
  "..........wwwwwwwwww..",
  "..........gggggggggg..",
  "...........BBBBBBBB...",
];

const baked = new Map<string, HTMLCanvasElement>();

/** The crocodile, body and jaw, each baked facing both ways. */
export function crocSprite(
  part: "body" | "jaw",
  facingLeft: boolean,
): HTMLCanvasElement {
  const key = `croc-${part}${facingLeft ? "<" : ">"}`;
  let had = baked.get(key);
  if (!had) {
    had = bake(part === "body" ? CROC_BODY : CROC_JAW, facingLeft);
    baked.set(key, had);
  }
  return had;
}

/**
 * A coconut, drawn from the reference: a dark outline all the way round, a
 * shell that is browner at the bottom than at the top, and the husk showing
 * through lighter in patches. Mottled on purpose — a flat brown egg at this
 * size reads as a stone.
 */
const COCONUT_NUT = [
  "..eeee..",
  ".eHHNHe.",
  "eHHNHHNe",
  "eNHHNHNe",
  "eNNHNNHe",
  "enNNHNNe",
  "ennNNnNe",
  ".ennNne.",
  "..eeee..",
];

/** What is left of one, for a moment, after it has hit the mud. */
const COCONUT_SPLAT = ["..e..e..", ".eNnnNe.", "eNnnnnNe", ".eeeeee."];

/**
 * A mushroom: the thing you come back to life at.
 *
 * Big spots and a fat stalk, because at seven pixels across the only way to
 * say "mushroom" is to say it loudly. The sparkle is drawn around it in
 * code rather than here: it turns, and a turning thing cannot be a letter
 * map.
 */
const MUSHROOM_CAP = [
  "..eee..",
  ".ecsce.",
  "ecsccce",
  "ecccsce",
  "eCCCCCe",
  ".essse.",
  ".essse.",
  "..eee..",
];

/**
 * A heart, for the lives in the corner.
 *
 * The one from the reference: a black border the whole way round, the
 * shade down its right-hand side, and the white glint top left that is
 * what makes a flat red shape read as something shiny.
 */
const HEART = [
  ".ee.ee.",
  "ewrrrRe",
  "errrrRe",
  "errrrRe",
  ".errRe.",
  "..eRe..",
  "...e...",
];

/** A heart with the life gone out of it: the same shape, dark. */
const HEART_GONE = [
  ".ee.ee.",
  "eeeeeee",
  "eeeeeee",
  "eeeeeee",
  ".eeeee.",
  "..eee..",
  "...e...",
];

/**
 * An elephant, side on, standing in the river.
 *
 * Drawn from the reference: one heavy block of a body with the back
 * stepping up to the head, the ear outlined on the head rather than
 * shaded, a dark eye, a white tusk and a fat trunk down the front. Legs
 * and all, even though the river covers the bottom third of it — an
 * elephant drawn from the knees up looks like an elephant with no legs
 * the moment the water moves.
 *
 * Facing right, which is the way the jungle goes.
 */
const ELEPHANT = [
  ".........eeeee......",
  "......eeepppppee....",
  "...eeeppppppppppe...",
  "..eppppppeppppppppe.",
  ".eppppppppepppppppee",
  "eppppppppepppppppppe",
  "eppppppppeppppeppqqe",
  "eppppppppeepppppeppe",
  "epppppppppppppppeppe",
  "ePPPPPPPPPPPPPPeeppe",
  ".eppeeeeeeppppe.eppe",
  ".eppe....eppppe..ppe",
  ".eppe....eppppe.eppe",
  ".eeee....eeeeee.eee.",
];

/**
 * A snake's head, at the bottom end of the thing that is not a vine.
 *
 * Eyes and a tongue, which at seven pixels across is the whole argument:
 * a child has to be able to tell this from a vine at a glance and from
 * the far side of the screen, so it is the one green thing in the game
 * with a face.
 */
const SNAKE_HEAD = [
  "..KKK..",
  ".KkkkK.",
  "KkjkjkK",
  "KkkkkkK",
  ".KkkkK.",
  "..KeK..",
  "...e...",
];

/** The coconut, the mushroom and the hearts, baked like everything else. */
export function propSprite(
  which:
    | "coconut"
    | "splat"
    | "mushroom"
    | "heart"
    | "heartGone"
    | "elephant"
    | "snake",
  facingLeft = false,
): HTMLCanvasElement {
  const key = `${which}${facingLeft ? "<" : ">"}`;
  let had = baked.get(key);
  if (!had) {
    const maps = {
      coconut: COCONUT_NUT,
      splat: COCONUT_SPLAT,
      mushroom: MUSHROOM_CAP,
      heart: HEART,
      heartGone: HEART_GONE,
      elephant: ELEPHANT,
      snake: SNAKE_HEAD,
    };
    had = bake(maps[which], facingLeft);
    baked.set(key, had);
  }
  return had;
}

/** The banana, baked like the monkey is. */
export function bananaSprite(): HTMLCanvasElement {
  let had = baked.get("banana");
  if (!had) {
    had = bake(BANANA, false);
    baked.set("banana", had);
  }
  return had;
}

/** A pose, facing a way. Baked on first ask and kept. */
export function monkeySprite(
  pose: Pose,
  facingLeft: boolean,
  coat = 0,
): HTMLCanvasElement {
  const key = `${pose}${facingLeft ? "<" : ">"}${coat}`;
  let had = baked.get(key);
  if (!had) {
    had = bake(DRAWN[pose], facingLeft, COATS[coat % COATS.length]);
    baked.set(key, had);
  }
  return had;
}
