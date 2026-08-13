import {PUZZLE} from "../config";
import {bearPuzzleUrl} from "../assets/bearPuzzle";

/** The picture is 3x3; eight of those nine cells hold a piece of it. */
const SIZE = 3;
const PIECES = SIZE * SIZE - 1;
/** A slot with nothing in it. Both gaps are the same — they have no identity. */
const HOLE = -1;

/**
 * The board, as (column, row) per slot.
 *
 * Slots 0-8 are the picture's own grid. Slot 9 is the extra gap that hangs
 * below the middle of the bottom row — a second place to slide into, which is
 * what makes this markedly easier than the plain 8-puzzle without making the
 * picture any smaller.
 */
const CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [1, 3],
];
const SLOTS = CELLS.length;
/** Where the picture's missing corner sits once everything is home. */
const CORNER = SIZE * SIZE - 1;

export interface SlidePuzzle {
  root: HTMLDivElement;
  /** @param moves how far to scramble; fewer is easier. */
  show(moves?: number): void;
  hide(): void;
  get solved(): boolean;
}

/**
 * A sliding-tile puzzle of the bear: a 3x3 picture with two gaps to slide into.
 *
 * Tiles are one background image offset per tile, so there's a single image to
 * load and no slicing. Shuffling is done by walking a gap around with random
 * legal moves rather than permuting the array — a random permutation of a
 * one-gap sliding puzzle is unsolvable half the time, and an unsolvable puzzle
 * in a game for a child is unforgivable. (With two gaps every arrangement is
 * reachable, but the random walk also keeps a lid on how hard it gets, which is
 * worth having on its own.)
 *
 * `CELLS` here and the board's `grid-template-columns` / `background-size` in
 * styles.css have to agree — change one and change the others.
 */
export function createSlidePuzzle(
  host: HTMLElement,
  onSolved: () => void,
  imageUrl: string = bearPuzzleUrl,
): SlidePuzzle {
  const root = document.createElement("div");
  root.className = "puzzle ui-interactive hidden";

  const title = document.createElement("div");
  title.className = "puzzle-title";
  title.textContent = "Fix the picture!";

  const board = document.createElement("div");
  board.className = "puzzle-board";

  const hint = document.createElement("div");
  hint.className = "puzzle-hint";
  hint.textContent = "Slide the tiles into a gap";

  root.append(title, board, hint);
  host.appendChild(root);

  /** order[slot] = the piece of the picture sitting there, or HOLE. */
  let order: Array<number> = solvedOrder();
  let solved = false;
  const cells: Array<HTMLDivElement> = [];

  for (let i = 0; i < SLOTS; i++) {
    const cell = document.createElement("div");
    cell.className = "puzzle-tile";
    // The hanging gap is outside the picture's grid, so it needs placing.
    if (i === SLOTS - 1) {
      cell.classList.add("puzzle-spare");
    }
    cell.addEventListener("click", () => {
      // A drag ends with a click on the same cell; the slide already happened.
      if (dragged) {
        return;
      }
      tryMove(i);
    });
    cell.addEventListener("pointerdown", e => beginDrag(i, e));
    board.appendChild(cell);
    cells.push(cell);
  }

  // ---- dragging ------------------------------------------------------------
  //
  // Tapping a tile beside a gap moves it, but a sliding puzzle should slide: a
  // tile follows your finger toward the gap and drops in once it's more than a
  // third of the way there, otherwise it springs back.
  //
  // The travel is measured from the two cells' own offsets rather than a
  // computed tile size, so it stays exact whatever the board's gap or scale is.
  //
  // A tile can be beside *both* gaps, so a drag carries every candidate and
  // picks whichever one the finger is actually heading for.

  /** How far along the gap you must drag before it counts as a move. */
  const COMMIT = 0.34;

  interface Candidate {
    /** Pixels from this tile to that gap; one of the two is always zero. */
    spanX: number;
    spanY: number;
  }
  interface Drag {
    slot: number;
    pointerId: number;
    startX: number;
    startY: number;
    options: Array<Candidate>;
  }
  let drag: Drag | null = null;
  /** Set when a drag has moved the tile, to swallow the click that follows. */
  let dragged = false;

  function beginDrag(slot: number, e: PointerEvent): void {
    dragged = false;
    if (solved || order[slot] === HOLE) {
      return;
    }

    const cell = cells[slot];
    const options = holesBeside(slot).map(hole => ({
      spanX: cells[hole].offsetLeft - cell.offsetLeft,
      spanY: cells[hole].offsetTop - cell.offsetTop,
    }));
    if (!options.length) {
      return;
    }

    drag = {
      slot,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      options,
    };
    cell.setPointerCapture(e.pointerId);
    cell.style.transition = "none";
    cell.style.zIndex = "2";
  }

  /** The gap this drag is heading for, and how far along it has got. */
  function dragTowards(
    e: PointerEvent,
    d: Drag,
  ): {option: Candidate; t: number} {
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    let best = d.options[0];
    let bestT = -Infinity;
    for (const option of d.options) {
      const along = option.spanX !== 0 ? dx : dy;
      const span = option.spanX !== 0 ? option.spanX : option.spanY;
      // Negative means the finger is going the other way; the closest match
      // wins, so a wrong-way drag still resolves to the gap behind it and
      // simply doesn't travel.
      const t = along / span;
      if (t > bestT) {
        bestT = t;
        best = option;
      }
    }
    return {option: best, t: Math.max(0, Math.min(1, bestT))};
  }

  board.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pointerId) {
      return;
    }
    // Any real movement counts as a drag, including away from the gap — that's
    // a deliberate "no", and the click that follows shouldn't move it anyway.
    if (
      Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) >
      6
    ) {
      dragged = true;
    }
    const {option, t} = dragTowards(e, drag);
    cells[drag.slot].style.transform =
      `translate(${option.spanX * t}px, ${option.spanY * t}px)`;
  });

  const endDrag = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) {
      return;
    }
    const {slot} = drag;
    const {option, t} = dragTowards(e, drag);
    const cell = cells[slot];
    // Clearing the transform first lets the tile spring back on its own
    // transition when the drag falls short; on a commit the redraw beats it.
    cell.style.transform = "";
    cell.style.transition = "";
    cell.style.zIndex = "";
    drag = null;
    if (t >= COMMIT) {
      slide(slot, holeAt(slot, option));
    }
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);

  function draw(): void {
    for (let slot = 0; slot < SLOTS; slot++) {
      const piece = order[slot];
      const cell = cells[slot];
      // Once it's solved the missing corner is filled back in, completing the
      // picture. The hanging gap is outside it and stays empty.
      const show = piece === HOLE && solved && slot === CORNER ? CORNER : piece;
      if (show === HOLE) {
        cell.classList.add("blank");
        cell.style.backgroundImage = "";
        continue;
      }
      cell.classList.remove("blank");
      cell.style.backgroundImage = `url("${imageUrl}")`;
      // The background is SIZE times the tile's size, so each step across is
      // 1/(SIZE-1) of the extra width — a percentage offset, not pixels, which
      // is what lets the board resize freely.
      const col = show % SIZE;
      const row = Math.floor(show / SIZE);
      cell.style.backgroundPosition = `${(col * 100) / (SIZE - 1)}% ${(row * 100) / (SIZE - 1)}%`;
    }
  }

  /** Slots sharing an edge with this one. */
  const neighbours = (slot: number): Array<number> => {
    const [col, row] = CELLS[slot];
    const out: Array<number> = [];
    for (let other = 0; other < SLOTS; other++) {
      if (other === slot) {
        continue;
      }
      const [c, r] = CELLS[other];
      if (Math.abs(c - col) + Math.abs(r - row) === 1) {
        out.push(other);
      }
    }
    return out;
  };

  const holesBeside = (slot: number): Array<number> =>
    neighbours(slot).filter(n => order[n] === HOLE);

  /** Which of the gaps beside `slot` a drag's span vector points at. */
  function holeAt(slot: number, option: Candidate): number {
    const cell = cells[slot];
    return (
      holesBeside(slot).find(
        hole =>
          cells[hole].offsetLeft - cell.offsetLeft === option.spanX &&
          cells[hole].offsetTop - cell.offsetTop === option.spanY,
      ) ?? -1
    );
  }

  function slide(slot: number, hole: number): void {
    if (solved || hole < 0 || order[slot] === HOLE) {
      return;
    }
    [order[hole], order[slot]] = [order[slot], order[hole]];
    draw();
    checkSolved();
  }

  /** A tap: slide into whichever gap is beside this tile. */
  function tryMove(slot: number): void {
    slide(slot, holesBeside(slot)[0] ?? -1);
  }

  function checkSolved(): void {
    // Only the picture's own pieces matter; that they're all home forces the
    // two gaps to be in the corner and the hanging slot anyway.
    for (let piece = 0; piece < PIECES; piece++) {
      if (order[piece] !== piece) {
        return;
      }
    }
    solved = true;
    root.classList.add("solved");
    hint.textContent = "You did it!";
    draw(); // fills the last tile back in, completing the picture
    onSolved();
  }

  function solvedOrder(): Array<number> {
    return Array.from({length: SLOTS}, (_, i) => (i < PIECES ? i : HOLE));
  }

  /** Walk a gap around at random, picking either one each step. */
  function shuffle(moves: number = PUZZLE.scrambleMoves): void {
    solved = false;
    root.classList.remove("solved");
    order = solvedOrder();

    let previous = -1;
    for (let i = 0; i < moves; i++) {
      const holes = order.flatMap((piece, slot) =>
        piece === HOLE ? [slot] : [],
      );
      const hole = holes[Math.floor(Math.random() * holes.length)];
      // Never undo the step just taken, or the walk marks time.
      const options = neighbours(hole).filter(
        n => n !== previous && order[n] !== HOLE,
      );
      if (!options.length) {
        continue;
      }
      const next = options[Math.floor(Math.random() * options.length)];
      [order[hole], order[next]] = [order[next], order[hole]];
      previous = hole;
    }

    // A shuffle that happens to land solved would end the stage instantly.
    if (order.every((piece, slot) => piece === HOLE || piece === slot)) {
      shuffle(moves);
    }
    hint.textContent = "Slide the tiles into a gap";
    draw();
  }

  return {
    root,
    show(moves) {
      shuffle(moves);
      root.classList.remove("hidden");
    },
    hide() {
      root.classList.add("hidden");
    },
    get solved() {
      return solved;
    },
  };
}

/** Rainbow confetti burst over the puzzle when it's solved. */
export function burstRainbow(host: HTMLElement): void {
  const colours = [
    "#ff3b6b",
    "#ff9f1c",
    "#ffe14d",
    "#4ade80",
    "#38bdf8",
    "#a78bfa",
    "#f472b6",
  ];
  for (let i = 0; i < 44; i++) {
    const dot = document.createElement("i");
    dot.className = "confetti";
    dot.style.background = colours[i % colours.length];
    dot.style.left = `${10 + Math.random() * 80}%`;
    dot.style.top = `${20 + Math.random() * 50}%`;
    dot.style.setProperty("--dx", `${(Math.random() - 0.5) * 260}px`);
    dot.style.setProperty("--dy", `${-120 - Math.random() * 220}px`);
    dot.style.animationDelay = `${Math.random() * 0.25}s`;
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 1800);
  }
}
