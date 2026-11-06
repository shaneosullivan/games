import {MONKEY} from "../config";

/**
 * Turns the sprite sheets in `assets/sprites` into the letter maps in
 * `motion.ts`.
 *
 * The sheets are smooth cartoon art, a monkey a few hundred pixels tall,
 * and this game's monkey is fifteen pixels, drawn at two letters to the
 * pixel. Shrunk the ordinary way it comes out as a brown smudge — the
 * reason the rest of the art here is written as letters. So each frame is
 * cut into blocks the size of one letter,
 * and every block becomes whichever of the game's letters most of it
 * already is. A vote rather than an average: averaging a tan face against
 * a black outline gives a muddy brown that is neither, where a vote keeps
 * the face tan and the eye dark, which is what makes it a face at this
 * size.
 *
 * Run from the console of a dev build and paste what it gives over the
 * whole of `motion.ts`:
 *
 *   const {convert} = await import("/src/art/convert.ts");
 *   copy(await convert());
 *
 * Never imported by the game. The sheets are six megabytes between them
 * and the game is built to one self-contained page, so anything that
 * brought them into the build would inline them into it; the letter maps
 * are a few kilobytes and are the only form they reach a child in.
 */

type Rgb = [number, number, number];

/**
 * One sheet: where it is, how big its cells are, what its colours are,
 * and which of its frames are kept and under what names.
 *
 * Every sheet is six frames by six.
 */
interface Sheet {
  url: string;
  cell: [number, number];
  /**
   * What each letter looks like *in this sheet*.
   *
   * Matched against the sheet's own colours and not the game's, and that
   * is the difference between a monkey that is one monkey and one that
   * changes colour as it changes what it is doing. The sheets were not
   * drawn to one palette — the run's body brown is #783c18 and the
   * stand's is #502000, both measured as their sheet's commonest colour —
   * and against the game's palette the first comes out dark fur and the
   * second nearly black. Matched against these, both come out `f`.
   *
   * The same goes for the face. Each sheet's main tan is `l` here, though
   * they range from #c09060 to #f0b484, so the face does not flash a
   * shade lighter every time the monkey sets off running.
   */
  colours: Partial<Record<string, Rgb>>;
  /** The sheet and frame whose standing monkey is the game's fifteen
   *  pixels tall, which sets how far everything in this sheet shrinks. */
  scaleFrom: [SheetName, number];
  /** What is kept, by name, as frame numbers in the order they play. */
  keep: Record<string, Array<number>>;
  /** How tall the \`scaleFrom\` frame's subject stands in the game, in
   *  picture pixels: fifteen for the monkey, unless it says otherwise. */
  tall?: number;
  /** True if the sheet already faces right, the way every drawing in the
   *  game does, and so must not be mirrored like the monkey's. */
  facesRight?: boolean;
  /** A frame whose feet are where every frame's box stops at the bottom —
   *  for a sheet with things falling past its feet, which would otherwise
   *  make the bottom of the box the bottom of a drop, not the ground. */
  feetOf?: number;
  /** Which letter is the face the eyes are found in: \`l\` for the
   *  monkey's tan, unless it says otherwise. */
  face?: string;
  /** Whether the face is cleared of everything dark but the eyes. Right for
   *  the monkey, whose face is just its face; wrong where the face letter
   *  is the whole animal, which would lose every line drawn on it. */
  clearFace?: boolean;
}

type SheetName = "run" | "jump" | "stand" | "bored" | "climb" | "elephant";

const SHEETS: Record<SheetName, Sheet> = {
  /**
   * The run starts from standing and settles into a stride that repeats
   * every thirteen frames — measured, frame 25 is frame 12 again — so six
   * from the one stride are a whole run.
   */
  run: {
    url: "/src/assets/sprites/run/monkey_run.png",
    cell: [320, 282],
    colours: {
      // The body, #783c18 and #6c3c18 between them.
      f: [0x72, 0x3c, 0x18],
      // The limbs and the shading round #543018.
      d: [0x52, 0x2e, 0x14],
      // The face and hands, #f0b484.
      l: [0xf0, 0xb4, 0x84],
      e: [0x08, 0x00, 0x00],
    },
    scaleFrom: ["jump", 0],
    keep: {run: [12, 14, 16, 18, 20, 22]},
  },
  /**
   * The jump goes stand, crouch, reach, arms up, come down, land, and the
   * game only needs the middle of it: reaching up on the way up, arms up
   * at the top, and the arm thrown forward on the way down.
   */
  jump: {
    url: "/src/assets/sprites/jump/monkey_jump.png",
    cell: [276, 400],
    colours: {
      f: [0x72, 0x3c, 0x18],
      d: [0x52, 0x2e, 0x14],
      l: [0xf0, 0xb4, 0x84],
      e: [0x08, 0x00, 0x00],
    },
    scaleFrom: ["jump", 0],
    keep: {jump: [9, 13, 20]},
  },
  /**
   * Climbing, side on: it starts from standing and settles into a climb,
   * reaching up an arm at a time, that comes round again every
   * twenty-two frames — measured, frames 33 to 35 are frame 12 again —
   * so every third from 12 to 33 is one whole climb that loops.
   */
  climb: {
    url: "/src/assets/sprites/climb/monkey_climb.png",
    cell: [232, 288],
    colours: {
      // The body, #783018 and #783c18.
      f: [0x72, 0x3c, 0x18],
      // The limbs, #543018 and #483018.
      d: [0x52, 0x2e, 0x14],
      // The face and hands, #e4a878.
      l: [0xe4, 0xac, 0x78],
      e: [0x08, 0x00, 0x00],
    },
    scaleFrom: ["climb", 0],
    keep: {climb: [12, 15, 18, 21, 24, 27, 30, 33]},
  },
  /**
   * The elephant in the river, spraying.
   *
   * Frame 0 is the elephant standing, trunk down, and is what it does
   * while it waits. The sheet then raises the trunk, sprays a fountain
   * and lets it rain down round it — but its sound is silent for its first
   * 850 milliseconds, frame 11 of the sheet, and that is where the water
   * starts: the trunk-raising is the wind-up. In the game the spray is
   * the monkey being thrown, and a fountain that arrived a second after
   * the monkey had gone would be a fountain about nothing, so the spray
   * starts at frame 10, trunk already up, and the sound at its 850.
   *
   * Every other frame from there, which is plenty for falling water at
   * this size. Twenty pixels wide, as the old one was, so sixteen tall.
   */
  elephant: {
    url: "/src/assets/sprites/elephant/elephant_spray.png",
    cell: [470, 504],
    colours: {
      // The body, #a0a0b0 and #9090a0, and the pinkish grey of its ear.
      p: [0x98, 0x98, 0xa8],
      // The shading, #808090 and #707080.
      P: [0x74, 0x74, 0x84],
      // Its eye, its teeth, the light on it.
      q: [0xe0, 0xdc, 0xe4],
      e: [0x10, 0x10, 0x14],
      // The water: #40b0ff and #50c0ff in the spray, #0090e0 deeper in.
      a: [0x40, 0xb4, 0xff],
      A: [0x08, 0x90, 0xe0],
    },
    scaleFrom: ["elephant", 0],
    tall: 16,
    facesRight: true,
    feetOf: 0,
    face: "p",
    clearFace: false,
    keep: {elephant: [0, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34]},
  },
  /**
   * Standing still, front on, with the tail swaying: one loop the whole
   * sheet long, of which every fourth frame is plenty at this size.
   */
  stand: {
    url: "/src/assets/sprites/stand/monkey_stand.png",
    cell: [324, 268],
    colours: {
      // The body, #502000 and #502010.
      f: [0x50, 0x20, 0x08],
      // The shading round #302010.
      d: [0x30, 0x14, 0x08],
      // The face and belly, #c09060.
      l: [0xc0, 0x90, 0x60],
      e: [0x04, 0x00, 0x04],
    },
    scaleFrom: ["stand", 0],
    keep: {stand: [0, 4, 8, 12, 16, 20, 24, 28, 32]},
  },
  /**
   * Bored: four things to do, one after another down the sheet. Read off
   * the sheet by eye — it turns to face you and hops on one leg waving;
   * crouches, sits and juggles bananas and throws them up; reaches up and
   * out in a long stretch and comes back down; and crouches and turns a
   * cartwheel. Each is cut where the next one starts.
   */
  bored: {
    url: "/src/assets/sprites/bored/monkey_bored.png",
    cell: [296, 438],
    colours: {
      // The body, #503010 and #603010.
      f: [0x58, 0x30, 0x10],
      // The shading round #402010.
      d: [0x38, 0x1c, 0x0c],
      // The face, belly and hands, #e0b070.
      l: [0xe0, 0xb0, 0x74],
      e: [0x04, 0x04, 0x04],
      // The bananas it juggles, #f0c800, in the game's banana yellow.
      y: [0xf0, 0xc8, 0x00],
      // Not its nose. The sheet's is red, #d00018, and the monkey's is
      // not: with no red here to match, the nose goes to whatever its
      // pixels are nearest — the tan of the face round it.
    },
    scaleFrom: ["bored", 1],
    keep: {
      wave: [3, 4, 5, 6, 7, 8],
      juggle: [9, 10, 12, 14, 16, 18, 20],
      stretch: [21, 22, 23, 24, 26, 28],
      cartwheel: [29, 30, 31, 32, 33, 34],
    },
  },
};

/** Under this much opaque in a block, the block is empty. */
const COVERS = 0.3;

/** The outline is thin in the sheets and in every block at this size, so
 *  a block that is mostly fur with a line through it stays fur. */
const OUTLINE_COUNTS = 0.45;

/**
 * What counts as an eye, in the sheets' own pixels.
 *
 * An eye is a black oval about twelve pixels across on a frame where a
 * letter is eight or nine, so it straddles two letters, and which two
 * depends on where the letter edges happen to fall: found letter by
 * letter, one eye came out a dot and the other a blob, a row apart, and
 * a different pair in every frame. So eyes are found before the frame is
 * cut up — a patch of black that is roughly round and has face all
 * round it — and each gets exactly one letter, at its middle.
 *
 * The outline is black but always runs along empty space, and an eye
 * never touches any; a mouth is black and in the face but long and flat;
 * nostrils are black and in the face but too small. Those are what the
 * tests are for. Not "face all round": tried first, it lost most of the
 * eyes, because in the standing sheet the eyes sit at the rim of the face
 * against the brown of the head, and measured only a third to two thirds
 * of what was round them was face.
 */
const EYE = {
  /** How big, as a share of one letter's area: a nostril is less. */
  smallest: 0.35,
  /** And at most, so a dark patch of fur is never taken for one. */
  biggest: 6,
  /** How much wider than tall, at most: a mouth is far more. */
  widest: 2.2,
  /** How much of what is round it must be face: some, so a dark patch in
   *  the fur is not an eye. */
  faceRound: 0.2,
  /** How much may be empty space: next to none, which is the test that
   *  tells an eye from the outline. */
  openRound: 0.05,
};

/** Of a letter's light pixels, how much face makes it a piece of face, in
 *  which nothing may be dark but the eyes. */
const FACE = 0.6;

interface Cell {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A kept set, ready to be written out. */
interface Made {
  frames: Array<Array<string>>;
  /** How long each kept frame shows for, in milliseconds. */
  ms: number;
  /** The first frame's body: how tall, and where its middle is across, in
   *  letters. */
  tall: number;
  middle: number;
}

/** The whole of `motion.ts`, as TypeScript source. */
export async function convert(): Promise<string> {
  const names = Object.keys(SHEETS) as Array<SheetName>;
  const images = {} as Record<SheetName, ImageBitmap>;
  const durations = {} as Record<SheetName, number>;
  for (const name of names) {
    images[name] = await load(SHEETS[name].url);
    durations[name] = await durationOf(SHEETS[name].url);
  }
  const cellOf = (name: SheetName, i: number): Cell => {
    const [w, h] = SHEETS[name].cell;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("no 2d context");
    }
    ctx.drawImage(
      images[name],
      (i % 6) * w,
      Math.floor(i / 6) * h,
      w,
      h,
      0,
      0,
      w,
      h,
    );
    return {w, h, data: ctx.getImageData(0, 0, w, h).data};
  };

  const made: Record<string, Made> = {};
  for (const name of names) {
    const sheet = SHEETS[name];
    const [from, frame] = sheet.scaleFrom;
    const standing = boxOf(cellOf(from, frame));
    const scale =
      (standing.y1 - standing.y0 + 1) / ((sheet.tall ?? 15) * MONKEY.detail);
    for (const [set, list] of Object.entries(sheet.keep)) {
      // One box for each set rather than one a frame: cropped one by one,
      // the monkey slides about as its tail swings, because the box does.
      const box = list
        .map(i => boxOf(cellOf(name, i)))
        .reduce((a, b) => ({
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
        }));
      if (sheet.feetOf !== undefined) {
        box.y1 = boxOf(cellOf(name, sheet.feetOf)).y1;
      }
      // Kept frames stand in for the ones between them, so each shows for
      // as long as the stretch of the sheet it stands for — counted from
      // the second kept frame where the first is a pose of its own.
      const playing = sheet.feetOf === list[0] ? list.slice(1) : list;
      const span = playing[playing.length - 1] - playing[0] + 1;
      // Where the standing frame's body is in the box, for a game that has
      // to put a back exactly where it says the back is.
      const body = boxOf(cellOf(name, list[0]));
      made[set] = {
        frames: list.map(i => toMap(cellOf(name, i), box, scale, sheet)),
        ms: Math.round((durations[name] * span) / playing.length),
        tall: Math.round((body.y1 - body.y0 + 1) / scale),
        middle: Math.round(((body.x0 + body.x1) / 2 - box.x0) / scale),
      };
    }
  }

  const frames = (set: string): string =>
    made[set].frames
      .map(
        map => "  [\n" + map.map(row => `    "${row}",`).join("\n") + "\n  ],",
      )
      .join("\n");
  const motion = (set: string, indent: string): string =>
    `{\n${indent}  ms: ${made[set].ms},\n${indent}  frames: [\n` +
    frames(set)
      .split("\n")
      .map(line => indent + "  " + line)
      .join("\n") +
    `\n${indent}  ],\n${indent}}`;

  return `/**
 * The monkey moving and keeping still: running, jumping, standing, and
 * being bored.
 *
 * Made by \`convert.ts\` from the sprite sheets in \`assets/sprites\`, not
 * drawn here — change the sheets or what it keeps of them and run it
 * again, rather than editing these by hand, or the next run puts back
 * whatever was changed. Letters as in \`monkey.ts\`, facing right, at
 * \`MONKEY.detail\` letters to the pixel: drawn half a pixel a letter.
 */

/** A set of frames played one after another, each for \`ms\`. */
export interface Motion {
  readonly ms: number;
  readonly frames: ReadonlyArray<ReadonlyArray<string>>;
}

/** Six frames of one stride, on all fours. Played by distance, not time:
 *  see \`MONKEY.strideFrame\`. */
export const RUN: ReadonlyArray<ReadonlyArray<string>> = [
${frames("run")}
];

/** Reaching up on the way up, arms up at the top, coming down. Chosen by
 *  which way the monkey is going, not played. */
export const JUMP: ReadonlyArray<ReadonlyArray<string>> = [
${frames("jump")}
];

/** Climbing a trunk, side on, an arm at a time. A loop, played by how far
 *  it has climbed, not by time: see \`MONKEY.climbFrame\`. */
export const CLIMB: ReadonlyArray<ReadonlyArray<string>> = [
${frames("climb")}
];

/**
 * The elephant in the river: standing, and spraying.
 *
 * Frame 0 is it standing, which is what it does until somebody lands on
 * it; the rest are the spray, played once from the top. Its feet are on
 * the bottom row. \`tall\` is how tall the standing elephant is and
 * \`middle\` where its body is across, both in letters, so the game can
 * put its back exactly where it says the back is — the box is far wider
 * and taller than the elephant, for the water.
 */
export const ELEPHANT = {
  ms: ${made.elephant.ms},
  tall: ${made.elephant.tall},
  middle: ${made.elephant.middle},
  frames: [
${frames("elephant")
  .split("\n")
  .map(line => "  " + line)
  .join("\n")}
  ],
} as const satisfies Motion & {tall: number; middle: number};

/** Standing still, front on, the tail swaying. A loop. */
export const STAND: Motion = ${motion("stand", "")};

/** The things a bored monkey does. Each plays once, start to end. */
export const BORED = {
  wave: ${motion("wave", "  ")},
  juggle: ${motion("juggle", "  ")},
  stretch: ${motion("stretch", "  ")},
  cartwheel: ${motion("cartwheel", "  ")},
} as const satisfies Record<string, Motion>;
`;
}

async function load(url: string): Promise<ImageBitmap> {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
}

/** How long a frame of a sheet lasts, from the JSON that came with it. */
async function durationOf(url: string): Promise<number> {
  const json = await (await fetch(url.replace(/\.png$/, ".json"))).json();
  const first = Object.values(json.frames)[0] as {duration: number};
  return first.duration;
}

/** Where in a cell the monkey actually is. */
function boxOf({w, h, data}: Cell): Box {
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return {x0, y0, x1, y1};
}

/**
 * One frame as rows of letters, mirrored to face right.
 *
 * Measured up from the foot of the box, so the feet are always on the
 * bottom row and the game can stand the drawing on the ground the way it
 * stands every other one. Mirrored because the run and jump sheets face
 * left and every drawing in this game faces right, the way the jungle
 * goes; the front-on ones are mirrored too, which only puts the tail on
 * the side the old drawing had it.
 */
function toMap(
  cell: Cell,
  box: Box,
  scale: number,
  sheet: Sheet,
): Array<string> {
  const {w, data} = cell;
  const colours = sheet.colours;
  const faceLetter = sheet.face ?? "l";
  const wide = Math.ceil((box.x1 - box.x0 + 1) / scale);
  const tall = Math.ceil((box.y1 - box.y0 + 1) / scale);
  const top = box.y1 + 1 - tall * scale;
  // Every letter's vote, and how much of an eye it would be if it were one.
  const grid: Array<Array<Letter>> = [];
  for (let gy = 0; gy < tall; gy++) {
    const row: Array<Letter> = [];
    for (let gx = 0; gx < wide; gx++) {
      const votes: Record<string, number> = {};
      // The plain count, without the outline's discount, for the eyes.
      const counts: Record<string, number> = {};
      let seen = 0;
      let total = 0;
      for (
        let sy = Math.max(0, Math.floor(top + gy * scale));
        sy < top + (gy + 1) * scale;
        sy++
      ) {
        for (
          let sx = Math.floor(box.x0 + gx * scale);
          sx < box.x0 + (gx + 1) * scale;
          sx++
        ) {
          total++;
          const k = (sy * w + sx) * 4;
          if (data[k + 3] < 100) {
            continue;
          }
          seen++;
          const colour = nearest(data[k], data[k + 1], data[k + 2], colours);
          votes[colour] =
            (votes[colour] ?? 0) + (colour === "e" ? OUTLINE_COUNTS : 1);
          counts[colour] = (counts[colour] ?? 0) + 1;
        }
      }
      if (seen / Math.max(1, total) < COVERS) {
        row.push({letter: ".", face: 0});
        continue;
      }
      // Face as a share of the light pixels and not of all of them, so a
      // letter that is mostly eye still knows it is in the face.
      const light = seen - (counts.e ?? 0);
      row.push({
        letter: Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0],
        face: light > 0 ? (counts[faceLetter] ?? 0) / light : 0,
      });
    }
    grid.push(row);
  }
  openTheEyes(
    grid,
    eyesOf(cell, colours, scale, faceLetter),
    box.x0,
    top,
    scale,
    sheet.clearFace ?? true,
  );
  return grid.map(row => {
    const letters = row.map(one => one.letter);
    return (sheet.facesRight ? letters : letters.reverse()).join("");
  });
}

/** One letter of a frame, before it is written out. */
interface Letter {
  letter: string;
  /** How much of its light part is face. */
  face: number;
}

/**
 * The middles of the eyes in a frame, in the sheet's own pixels.
 *
 * Every patch of near-black, then only the ones that pass all three of
 * `EYE`'s tests: the right size, round enough, and face all round.
 */
function eyesOf(
  {w, h, data}: Cell,
  colours: Partial<Record<string, Rgb>>,
  scale: number,
  faceLetter: string,
): Array<[number, number]> {
  const dark = (i: number): boolean =>
    data[i * 4 + 3] >= 100 &&
    nearest(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], colours) === "e";
  const isFace = (i: number): boolean =>
    data[i * 4 + 3] >= 100 &&
    nearest(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], colours) ===
      faceLetter;
  const seen = new Uint8Array(w * h);
  const eyes: Array<[number, number]> = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !dark(start)) {
      continue;
    }
    const patch: Array<number> = [];
    const queue = [start];
    seen[start] = 1;
    let round = 0;
    let face = 0;
    let open = 0;
    while (queue.length > 0) {
      const i = queue.pop() as number;
      patch.push(i);
      const x = i % w;
      const y = Math.floor(i / w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          round++;
          open++;
          continue;
        }
        const n = ny * w + nx;
        if (dark(n)) {
          if (!seen[n]) {
            seen[n] = 1;
            queue.push(n);
          }
          continue;
        }
        round++;
        if (isFace(n)) {
          face++;
        } else if (data[n * 4 + 3] < 100) {
          open++;
        }
      }
    }
    eyes.push(...(isAnEye(patch, w, round, face, open, scale) ?? []));
  }
  return eyes;
}

/** The middle of a patch, if the patch is an eye. */
function isAnEye(
  patch: Array<number>,
  w: number,
  round: number,
  face: number,
  open: number,
  scale: number,
): Array<[number, number]> | null {
  // Measured in letters, so the tests mean the same at any `MONKEY.detail`.
  const area = patch.length / (scale * scale);
  if (area < EYE.smallest || area > EYE.biggest) {
    return null;
  }
  if (
    face / Math.max(1, round) < EYE.faceRound ||
    open / Math.max(1, round) > EYE.openRound
  ) {
    return null;
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let sx = 0;
  let sy = 0;
  for (const i of patch) {
    const x = i % w;
    const y = Math.floor(i / w);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    sx += x;
    sy += y;
  }
  if ((x1 - x0 + 1) / (y1 - y0 + 1) > EYE.widest) {
    return null;
  }
  return [[sx / patch.length, sy / patch.length]];
}

/**
 * Puts the eyes in, one letter each, and takes everything else dark out
 * of the face.
 *
 * The face is cleared first — the mouth, the nostrils, the half of an eye
 * that fell into the letter next door — and then each eye found in the
 * sheet becomes the one letter its middle is in. Two dots front on, one
 * side on, the same size every frame.
 */
function openTheEyes(
  grid: Array<Array<Letter>>,
  eyes: Array<[number, number]>,
  left: number,
  top: number,
  scale: number,
  clear: boolean,
): void {
  for (const row of grid) {
    for (const letter of row) {
      if (clear && letter.letter === "e" && letter.face >= FACE) {
        letter.letter = "l";
      }
    }
  }
  for (const [x, y] of eyes) {
    const gx = Math.floor((x - left) / scale);
    const gy = Math.floor((y - top) / scale);
    if (grid[gy]?.[gx] && grid[gy][gx].letter !== ".") {
      grid[gy][gx].letter = "e";
    }
  }
}

/** The letter whose colour in this sheet a pixel is closest to. */
function nearest(
  r: number,
  g: number,
  b: number,
  colours: Partial<Record<string, Rgb>>,
): string {
  let best = "e";
  let by = Infinity;
  for (const [letter, rgb] of Object.entries(colours)) {
    if (!rgb) {
      continue;
    }
    const [R, G, B] = rgb;
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < by) {
      by = d;
      best = letter;
    }
  }
  return best;
}
