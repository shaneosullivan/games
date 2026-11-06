/**
 * Turns the sprite sheets in `assets/sprites` into the letter maps in
 * `motion.ts`.
 *
 * The sheets are smooth cartoon art, a monkey a few hundred pixels tall,
 * and this game's monkey is fifteen. Shrunk the ordinary way it comes out
 * as a brown smudge — the reason the rest of the art here is written as
 * letters. So each frame is cut into blocks the size of one picture pixel,
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
}

type SheetName = "run" | "jump" | "stand" | "bored";

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

/** How tall the standing monkey is in the game, in picture pixels. */
const TALL = 15;

/** Under this much opaque in a block, the block is empty. */
const COVERS = 0.3;

/** The outline is thin in the sheets and in every block at this size, so
 *  a block that is mostly fur with a line through it stays fur. */
const OUTLINE_COUNTS = 0.45;

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
    const scale = (standing.y1 - standing.y0 + 1) / TALL;
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
      // Kept frames stand in for the ones between them, so each shows for
      // as long as the stretch of the sheet it stands for.
      const span = list[list.length - 1] - list[0] + 1;
      made[set] = {
        frames: list.map(i =>
          toMap(cellOf(name, i), box, scale, sheet.colours),
        ),
        ms: Math.round((durations[name] * span) / list.length),
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
 * whatever was changed. Letters as in \`monkey.ts\`, facing right.
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
  {w, data}: Cell,
  box: Box,
  scale: number,
  colours: Partial<Record<string, Rgb>>,
): Array<string> {
  const wide = Math.ceil((box.x1 - box.x0 + 1) / scale);
  const tall = Math.ceil((box.y1 - box.y0 + 1) / scale);
  const top = box.y1 + 1 - tall * scale;
  const rows: Array<string> = [];
  for (let gy = 0; gy < tall; gy++) {
    let row = "";
    for (let gx = 0; gx < wide; gx++) {
      const votes: Record<string, number> = {};
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
        }
      }
      if (seen / Math.max(1, total) < COVERS) {
        row += ".";
        continue;
      }
      row += Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    }
    rows.push([...row].reverse().join(""));
  }
  return rows;
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
