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
  g: "#5bb04a",
  G: "#3c8035",
  B: "#c9d98a",
  w: "#f6f4ec",
};

/**
 * Hanging, and in the air, which look the same and should — a monkey in
 * flight is a monkey reaching for the next vine.
 *
 * Both hands on the rope, one above the other the way anybody holds a rope,
 * and the far arm a shade darker behind the near one. Two rows taller than
 * the monkey is, because its arms are above its head: the drawing hangs
 * from its own height so the fists meet the end of the vine.
 */
const HANG = [
  ".....ddd.....",
  "....ddff.....",
  "....ddff.....",
  "...ddddfdd...",
  "..dffffffdd..",
  "..dfllllffd..",
  "..dflellmmd..",
  "..dfllllmmd..",
  "...dfllmmd...",
  "...dffffd....",
  "..tdfffffd...",
  ".ttdfffffd...",
  "..tdfffffd...",
  "...dfffffd...",
  "...dff.ffd...",
  "...dd..dd....",
];

/** Standing on the ground, side on, arms down. */
const STAND = [
  ".....ddddd...",
  "....dfffffd..",
  "....dllllfd..",
  "....dlellmd..",
  "....dllllmmd.",
  ".....dllmmd..",
  ".....dffdd...",
  "...dddffffd..",
  "..tdffffffd..",
  ".ttdffffffd..",
  "..tdffffffd..",
  "...dffffffd..",
  "...dffffffd..",
  "...dff.ffd...",
  "...dd..dd....",
];

/** Running: the near arm thrown forward and the legs apart, then both
 *  gathered under it. Two frames is all a run needs at this size. */
const RUN_A = [
  ".....ddddd...",
  "....dfffffd..",
  "....dllllfd..",
  "....dlellmd..",
  "....dllllmmd.",
  ".....dllmmd..",
  ".....dffdd...",
  "..dddffffd...",
  ".tdffffffdf..",
  "ttdffffffdff.",
  ".tdffffffd...",
  "..dffffffd...",
  "..dffffffd...",
  "..df..dffd...",
  "..dd...dd....",
];
const RUN_B = [
  ".....ddddd...",
  "....dfffffd..",
  "....dllllfd..",
  "....dlellmd..",
  "....dllllmmd.",
  ".....dllmmd..",
  ".....dffdd...",
  "...ddffffdd..",
  ".ttdffffffd..",
  "t..dffffffd..",
  "...dffffffd..",
  "...dffffffd..",
  "...dffffffd..",
  "...dffffd....",
  "...ddd.ddd...",
];

/** Climbing: the hang with the legs working, and the arms reaching a little
 *  to the side of the trunk rather than straight up a rope. */
const CLIMB_B = [
  ".....ddd.....",
  "....ddff.....",
  "...ddff......",
  "..ddddfdd....",
  "..dffffffdd..",
  "..dfllllffd..",
  "..dflellmmd..",
  "..dfllllmmd..",
  "...dfllmmd...",
  "...dffffd....",
  "..tdfffffd...",
  ".ttdfffffd...",
  "..tdfffffd...",
  "...dfffffd...",
  "...dffdffd...",
  "...dd...dd...",
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
