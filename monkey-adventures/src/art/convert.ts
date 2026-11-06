/**
 * Turns the sprite sheets in `assets/sprites` into the letter maps in
 * `motion.ts`.
 *
 * The sheets are smooth cartoon art, a monkey a few hundred pixels tall,
 * and this game's monkey is fifteen. Shrunk the ordinary way it comes out
 * as a brown smudge — the reason the rest of the art here is written as
 * letters. So each frame is cut into blocks the size of one picture pixel,
 * and every block becomes whichever of the monkey's own five colours most
 * of it already is. A vote rather than an average: averaging a cream face
 * against a black outline gives a muddy brown that is neither, where a
 * vote keeps the face cream and the eye dark, which is what makes it a
 * face at this size.
 *
 * Run from the console of a dev build and paste what it gives over the
 * whole of `motion.ts`:
 *
 *   const {convert} = await import("/src/art/convert.ts");
 *   copy(await convert());
 *
 * Never imported by the game. The sheets are two and a half megabytes and
 * the game is built to one self-contained page, so anything that brought
 * them into the build would inline them into it; the letter maps are a
 * few kilobytes and are the only form they reach a child in.
 */

/**
 * What each of the monkey's letters looks like *in the sheets*.
 *
 * Matched against the sheets' own colours and not against the game's,
 * which is the difference between a running monkey that matches the
 * standing one and one that goes a shade darker the moment it moves. The
 * sheets' body brown is #783c18, measured as their commonest colour, and
 * against the game's palette that is nearer the dark fur than the fur —
 * so matched that way the whole body came out `d`. Matched against this
 * it comes out `f`, and is drawn in the game's own `f`.
 */
const SOURCE: Record<string, [number, number, number]> = {
  // The body: #783c18 and #6c3c18, the two commonest colours in both
  // sheets, between them.
  f: [0x72, 0x3c, 0x18],
  // The limbs and the shading: #543018 and the browns around it.
  d: [0x52, 0x2e, 0x14],
  // The face and hands, #f0b484, and the mid cream round their edges.
  m: [0xf0, 0xb4, 0x84],
  l: [0xc4, 0x8c, 0x58],
  // The outline and the eye.
  e: [0x08, 0x00, 0x00],
};

/** The sheets: six frames by six, each cell this big. */
const SHEETS = {
  run: {url: "/src/assets/sprites/run/monkey_run.png", cell: [320, 282]},
  jump: {url: "/src/assets/sprites/jump/monkey_jump.png", cell: [276, 400]},
} as const;

/**
 * Which frames are kept.
 *
 * The run sheet starts from standing and settles into a stride that
 * repeats every thirteen frames — measured, frame 25 is frame 12 again —
 * so six from the one stride are a whole run. The jump sheet goes stand,
 * crouch, reach, arms up, come down, land, and the game only needs the
 * middle of it: reaching up on the way up, arms up at the top, and the
 * arm thrown forward on the way down.
 */
const KEEP = {run: [12, 14, 16, 18, 20, 22], jump: [9, 13, 20]};

/** How many of the sheets' pixels make one of the picture's. The standing
 *  monkey at the start of the jump sheet is the game's fifteen tall. */
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

/** The whole of `motion.ts`, as TypeScript source. */
export async function convert(): Promise<string> {
  const sheets = {
    run: await load(SHEETS.run.url),
    jump: await load(SHEETS.jump.url),
  };
  const cellOf = (which: "run" | "jump", i: number): Cell => {
    const [w, h] = SHEETS[which].cell;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("no 2d context");
    }
    ctx.drawImage(
      sheets[which],
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
  const stand = boxOf(cellOf("jump", 0));
  const scale = (stand.y1 - stand.y0 + 1) / TALL;

  // One box for each set rather than one a frame: cropped one by one, the
  // monkey slides about as its tail swings, because the box does.
  const sets: Record<"run" | "jump", Array<string>> = {run: [], jump: []};
  for (const which of ["run", "jump"] as const) {
    const box = KEEP[which]
      .map(i => boxOf(cellOf(which, i)))
      .reduce((a, b) => ({
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
      }));
    for (const i of KEEP[which]) {
      sets[which].push(
        `  // frame ${i}\n  [\n` +
          toMap(cellOf(which, i), box, scale)
            .map(row => `    "${row}",`)
            .join("\n") +
          "\n  ],",
      );
    }
  }
  return `/**
 * The monkey moving: running, and in the air.
 *
 * Made by \`convert.ts\` from the sprite sheets in \`assets/sprites\`, not
 * drawn here — change the sheets or what it keeps of them and run it
 * again, rather than editing these by hand, or the next run puts back
 * whatever was changed. Letters as in \`monkey.ts\`, facing right.
 */

/** Six frames of one stride, on all fours. */
export const RUN: ReadonlyArray<ReadonlyArray<string>> = [
${sets.run.join("\n")}
];

/** Reaching up on the way up, arms up at the top, coming down. */
export const JUMP: ReadonlyArray<ReadonlyArray<string>> = [
${sets.jump.join("\n")}
];
`;
}

async function load(url: string): Promise<ImageBitmap> {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
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
 * stands every other one. Mirrored because the sheets face left and every
 * drawing in this game faces right, the way the jungle goes.
 */
function toMap({w, data}: Cell, box: Box, scale: number): Array<string> {
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
          const colour = nearest(data[k], data[k + 1], data[k + 2]);
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

/** The letter whose colour in the sheets a pixel is closest to. */
function nearest(r: number, g: number, b: number): string {
  let best = "e";
  let by = Infinity;
  for (const [letter, [R, G, B]] of Object.entries(SOURCE)) {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < by) {
      by = d;
      best = letter;
    }
  }
  return best;
}
