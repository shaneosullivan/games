import {Sticker, StickerKind, STICKER} from "../config";

/**
 * What is stuck on your car, kept in this browser.
 *
 * Its own store rather than part of the colour and the design, for the same
 * reason those are apart from each other: a child clearing the stickers off is
 * not choosing a colour again, and a saved car from before any of this existed
 * still opens with nothing on it rather than with nonsense on it.
 */
const KEY = "vroom.car.stickers.v1";

const KINDS: ReadonlyArray<StickerKind> = [
  "star",
  "heart",
  "flag",
  "skull",
  "smiley",
  "bolt",
  "crown",
  "text",
];

export function myStickers(): Array<Sticker> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) {
      return [];
    }
    return saved.filter(isSticker).slice(0, STICKER.most).map(tidy);
  } catch {
    // A blocked store, or something that is not a sticker any more, means a
    // plain car. Nothing here is worth a broken garage.
    return [];
  }
}

export function keepStickers(stickers: ReadonlyArray<Sticker>): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(stickers.slice(0, STICKER.most)),
    );
  } catch {
    // As above.
  }
}

/** Everything a sticker has to have to be one. Written out rather than trusted
 *  because this comes back off a disk a year later. */
function isSticker(value: unknown): value is Sticker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const s = value as Partial<Sticker>;
  return (
    KINDS.includes(s.kind as StickerKind) &&
    Number.isFinite(s.u) &&
    Number.isFinite(s.v) &&
    Number.isFinite(s.size)
  );
}

/** Held inside the limits it was saved under, which may not be the limits the
 *  game has now. */
function tidy(s: Sticker): Sticker {
  return {
    ...s,
    u: Math.max(-1, Math.min(1, s.u)),
    size: Math.max(STICKER.smallest, Math.min(STICKER.largest, s.size)),
    text: s.kind === "text" ? (s.text ?? "").slice(0, 24) : undefined,
  };
}
