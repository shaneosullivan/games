import {PLAYER} from "../config";

/**
 * Which car is yours.
 *
 * One colour, kept in this browser. It is a small thing and it is the first
 * thing a child asks for: the red car is only *your* car if you picked it.
 */
const KEY = "vroom.car.v1";

export function myColour(): number {
  try {
    const saved = Number(window.localStorage.getItem(KEY));
    // Only a colour that is actually on offer. Anything else is a stale save
    // from a palette that has since changed, and the default is better than a
    // colour nobody can choose again.
    if (PLAYER.choices.includes(saved)) {
      return saved;
    }
  } catch {
    // A blocked store just means everybody drives the red one.
  }
  return PLAYER.colour;
}

export function chooseColour(colour: number): void {
  try {
    window.localStorage.setItem(KEY, String(colour));
  } catch {
    // As above.
  }
}
