import {NAME} from "../config";

/**
 * What to call you, when there is somebody else in the race.
 *
 * On your own the game never needs a name — you are the car you chose, and
 * there is nobody to tell apart from you. Racing a friend, "Player 2 finished
 * first" is a sentence about nobody, and a child who has just been beaten by
 * their sister would quite like it to say so.
 *
 * Kept in this browser beside the car, and apart from it: a child changing
 * their name is not choosing a colour again. Nothing is required — a race with
 * no names in it still works, and the seat number is the fallback.
 */
const KEY = "vroom.name.v1";

export function myName(): string {
  try {
    return tidyName(window.localStorage.getItem(KEY) ?? "");
  } catch {
    // A blocked store just means everybody is Player One and Player Two.
    return "";
  }
}

export function chooseName(name: string): void {
  try {
    window.localStorage.setItem(KEY, tidyName(name));
  } catch {
    // As above.
  }
}

/**
 * A name held to something that will fit on a card.
 *
 * Whatever a child types, short enough to sit on the finish card beside a time
 * and with no line breaks in it. Emoji are left alone on purpose: a name that
 * is one cat face is a perfectly good name and exactly the sort of thing that
 * gets typed here.
 */
export function tidyName(raw: string): string {
  return [...raw.replace(/\s+/g, " ").trim()].slice(0, NAME.most).join("");
}
