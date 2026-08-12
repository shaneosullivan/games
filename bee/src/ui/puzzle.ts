import { PUZZLE } from '../config';
import { bearPuzzleUrl } from '../assets/bearPuzzle';

const SIZE = 4;
const TILES = SIZE * SIZE;
/** The blank always starts (and finishes) in the bottom-right. */
const BLANK = TILES - 1;

export interface SlidePuzzle {
  root: HTMLDivElement;
  /** @param moves how far to scramble; fewer is easier. */
  show(moves?: number): void;
  hide(): void;
  get solved(): boolean;
}

/**
 * A 4x4 sliding-tile puzzle of the bear.
 *
 * Tiles are one background image offset per tile, so there's a single image to
 * load and no slicing. Shuffling is done by walking the blank around with
 * random legal moves rather than permuting the array — a random permutation of
 * a 15-puzzle is unsolvable half the time, and an unsolvable puzzle in a game
 * for a child is unforgivable.
 */
export function createSlidePuzzle(
  host: HTMLElement,
  onSolved: () => void,
  imageUrl: string = bearPuzzleUrl,
): SlidePuzzle {
  const root = document.createElement('div');
  root.className = 'puzzle ui-interactive hidden';

  const title = document.createElement('div');
  title.className = 'puzzle-title';
  title.textContent = 'Fix the picture!';

  const board = document.createElement('div');
  board.className = 'puzzle-board';

  const hint = document.createElement('div');
  hint.className = 'puzzle-hint';
  hint.textContent = 'Slide the tiles next to the gap';

  root.append(title, board, hint);
  host.appendChild(root);

  /** order[slot] = which piece of the picture is sitting in that slot. */
  let order: number[] = Array.from({ length: TILES }, (_, i) => i);
  let solved = false;
  const cells: HTMLDivElement[] = [];

  for (let i = 0; i < TILES; i++) {
    const cell = document.createElement('div');
    cell.className = 'puzzle-tile';
    cell.addEventListener('click', () => tryMove(i));
    board.appendChild(cell);
    cells.push(cell);
  }

  function draw(): void {
    for (let slot = 0; slot < TILES; slot++) {
      const piece = order[slot];
      const cell = cells[slot];
      if (piece === BLANK && !solved) {
        cell.classList.add('blank');
        cell.style.backgroundImage = '';
        continue;
      }
      cell.classList.remove('blank');
      cell.style.backgroundImage = `url("${imageUrl}")`;
      // 4 columns => each step is 1/3 of the background's extra width.
      const col = piece % SIZE;
      const row = Math.floor(piece / SIZE);
      cell.style.backgroundPosition = `${(col * 100) / (SIZE - 1)}% ${(row * 100) / (SIZE - 1)}%`;
    }
  }

  const neighbours = (slot: number): number[] => {
    const col = slot % SIZE;
    const row = Math.floor(slot / SIZE);
    const out: number[] = [];
    if (col > 0) out.push(slot - 1);
    if (col < SIZE - 1) out.push(slot + 1);
    if (row > 0) out.push(slot - SIZE);
    if (row < SIZE - 1) out.push(slot + SIZE);
    return out;
  };

  function tryMove(slot: number): void {
    if (solved) return;
    const blankSlot = order.indexOf(BLANK);
    if (!neighbours(blankSlot).includes(slot)) return;
    [order[blankSlot], order[slot]] = [order[slot], order[blankSlot]];
    draw();
    checkSolved();
  }

  function checkSolved(): void {
    if (order.some((piece, slot) => piece !== slot)) return;
    solved = true;
    root.classList.add('solved');
    hint.textContent = 'You did it!';
    draw(); // fills the last tile back in, completing the picture
    onSolved();
  }

  /** Walk the blank around at random. Always solvable, by construction. */
  function shuffle(moves: number = PUZZLE.scrambleMoves): void {
    solved = false;
    root.classList.remove('solved');
    order = Array.from({ length: TILES }, (_, i) => i);
    let blankSlot = BLANK;
    let previous = -1;
    for (let i = 0; i < moves; i++) {
      const options = neighbours(blankSlot).filter((n) => n !== previous);
      const next = options[Math.floor(Math.random() * options.length)];
      [order[blankSlot], order[next]] = [order[next], order[blankSlot]];
      previous = blankSlot;
      blankSlot = next;
    }
    // A shuffle that happens to land solved would end the stage instantly.
    if (order.every((piece, slot) => piece === slot)) shuffle(moves);
    hint.textContent = 'Slide the tiles next to the gap';
    draw();
  }

  return {
    root,
    show(moves) {
      shuffle(moves);
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
    get solved() {
      return solved;
    },
  };
}

/** Rainbow confetti burst over the puzzle when it's solved. */
export function burstRainbow(host: HTMLElement): void {
  const colours = ['#ff3b6b', '#ff9f1c', '#ffe14d', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6'];
  for (let i = 0; i < 44; i++) {
    const dot = document.createElement('i');
    dot.className = 'confetti';
    dot.style.background = colours[i % colours.length];
    dot.style.left = `${10 + Math.random() * 80}%`;
    dot.style.top = `${20 + Math.random() * 50}%`;
    dot.style.setProperty('--dx', `${(Math.random() - 0.5) * 260}px`);
    dot.style.setProperty('--dy', `${-120 - Math.random() * 220}px`);
    dot.style.animationDelay = `${Math.random() * 0.25}s`;
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 1800);
  }
}
