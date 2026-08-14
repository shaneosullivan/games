import type {Rng} from "../core/rng";

/**
 * The maze itself, as a grid — no geometry, no Three, nothing to look at.
 *
 * Kept separate because everything interesting about a maze is decided here:
 * that it's solvable, where the dead ends are, and which way is out. The woods
 * in `render/geometry/maze.ts` are only a drawing of this.
 */

/** Sides of a cell, in the order the bit flags below use. */
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;

/** Set bit = you can travel that way. */
const BIT = [1, 2, 4, 8] as const;
/** Column and row steps for each side. */
const STEP: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const OPPOSITE = [SOUTH, WEST, NORTH, EAST] as const;

export interface Maze {
  cols: number;
  rows: number;
  /** One byte per cell, holding the four "open" bits. */
  readonly open: Uint8Array;
  /** Where the bee starts, and the way out. */
  start: number;
  exit: number;
}

export const cellOf = (maze: Maze, col: number, row: number): number =>
  row * maze.cols + col;
export const colOf = (maze: Maze, cell: number): number => cell % maze.cols;
export const rowOf = (maze: Maze, cell: number): number =>
  Math.floor(cell / maze.cols);

export function isOpen(maze: Maze, cell: number, side: number): boolean {
  return (maze.open[cell] & BIT[side]) !== 0;
}

/** The cell through that side, or -1 at the edge of the grid. */
export function neighbour(maze: Maze, cell: number, side: number): number {
  const [dx, dy] = STEP[side];
  const col = colOf(maze, cell) + dx;
  const row = rowOf(maze, cell) + dy;
  if (col < 0 || row < 0 || col >= maze.cols || row >= maze.rows) {
    return -1;
  }
  return row * maze.cols + col;
}

/**
 * A perfect maze by randomised depth-first search: carve from a start cell,
 * always into an unvisited neighbour, backtracking when there are none left.
 *
 * "Perfect" means every cell is reachable and there is exactly one route
 * between any two of them — which is what makes the scent trail well-defined
 * and guarantees the player can never be walled in. The stack is explicit
 * rather than recursive because a big grid would otherwise be deep enough to
 * matter.
 */
export function generateMaze(cols: number, rows: number, rng: Rng): Maze {
  const maze: Maze = {
    cols,
    rows,
    open: new Uint8Array(cols * rows),
    start: 0,
    exit: cols * rows - 1,
  };

  const seen = new Uint8Array(cols * rows);
  const stack: Array<number> = [maze.start];
  seen[maze.start] = 1;
  const sides = [NORTH, EAST, SOUTH, WEST];

  while (stack.length > 0) {
    const cell = stack[stack.length - 1];

    // Shuffle the sides so the carve has no directional bias — walking them
    // in a fixed order produces mazes with a visible grain.
    for (let i = sides.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }

    let moved = false;
    for (const side of sides) {
      const next = neighbour(maze, cell, side);
      if (next < 0 || seen[next]) {
        continue;
      }
      maze.open[cell] |= BIT[side];
      maze.open[next] |= BIT[OPPOSITE[side]];
      seen[next] = 1;
      stack.push(next);
      moved = true;
      break;
    }
    if (!moved) {
      stack.pop();
    }
  }

  return maze;
}

/**
 * The one route from `from` to `to`, as cell indices including both ends.
 *
 * Breadth-first, so it doesn't care that the maze is perfect — but because it
 * is, this route is also the only one, which is what the scent trail claims.
 */
export function solve(maze: Maze, from: number, to: number): Array<number> {
  const cameFrom = new Int32Array(maze.cols * maze.rows).fill(-1);
  cameFrom[from] = from;
  const queue = [from];

  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (cell === to) {
      break;
    }
    for (const side of [NORTH, EAST, SOUTH, WEST]) {
      if (!isOpen(maze, cell, side)) {
        continue;
      }
      const next = neighbour(maze, cell, side);
      if (next < 0 || cameFrom[next] >= 0) {
        continue;
      }
      cameFrom[next] = cell;
      queue.push(next);
    }
  }

  if (cameFrom[to] < 0) {
    return [];
  }
  const path = [to];
  while (path[0] !== from) {
    path.unshift(cameFrom[path[0]]);
  }
  return path;
}

/**
 * Cells with only one way in or out — where the flowers go.
 *
 * The start and the exit are excluded even when they qualify: a flower on the
 * doorstep would hand out the answer before the player has had a chance to be
 * lost, which is the thing it's meant to rescue them from.
 */
export function deadEnds(maze: Maze): Array<number> {
  const out: Array<number> = [];
  for (let cell = 0; cell < maze.open.length; cell++) {
    if (cell === maze.start || cell === maze.exit) {
      continue;
    }
    const bits = maze.open[cell];
    // One bit set, i.e. a power of two.
    if (bits !== 0 && (bits & (bits - 1)) === 0) {
      out.push(cell);
    }
  }
  return out;
}
