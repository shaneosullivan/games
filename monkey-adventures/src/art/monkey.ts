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
};

/** Arms up: hanging from a vine, and in the air, which look the same and
 *  should — a monkey in flight is a monkey reaching for the next vine. */
const HANG = [
  ".ff.......ff.",
  ".ff.ddddd.ff.",
  ".ffdfffffdff.",
  ".ffdllllllff.",
  "..fdleleldf..",
  "...dlmmmld...",
  "....dmmmd....",
  ".....ddd.....",
  "...fffffff...",
  "..ffffffffft.",
  "..fffffffftt.",
  "..ffffffff.t.",
  "...fff.fff...",
  "...dd...dd...",
  "....d...d....",
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

function bake(rows: Array<string>, flip: boolean): HTMLCanvasElement {
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
      const colour = PALETTE[key];
      if (!colour) {
        continue;
      }
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

const baked = new Map<string, HTMLCanvasElement>();

/** A pose, facing a way. Baked on first ask and kept. */
export function monkeySprite(
  pose: Pose,
  facingLeft: boolean,
): HTMLCanvasElement {
  const key = `${pose}${facingLeft ? "<" : ">"}`;
  let had = baked.get(key);
  if (!had) {
    had = bake(DRAWN[pose], facingLeft);
    baked.set(key, had);
  }
  return had;
}
