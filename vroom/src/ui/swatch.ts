import {ENVIRONMENTS} from "../config";
import {outline} from "../track/outline";
import {rate, RATING_NAMES} from "../track/rating";
import {TrackSpec} from "../track/spec";

/**
 * How a track looks in a list: its picture, and how hard it is.
 *
 * Both of them here rather than in the track list, because two screens show
 * tracks now — the list you race from and the one you pick from when starting a
 * race with a friend — and a child choosing between four circuits wants the
 * same two facts on either screen. A second copy of these would be a second
 * thing to keep in step.
 */

/**
 * The little picture of a track: the circuit itself, in its own colours.
 *
 * It was a plain square of the environment's ground colour, which told a child
 * which of their four green tracks this was — that is, nothing. The road is
 * drawn as one fat stroke with a thin centre line down it, the same two colours
 * the real thing uses, on the same ground.
 */

/** SVG lives in its own namespace, and an element made without it is an element
 *  the browser draws as nothing at all. */
const SVG = "http://www.w3.org/2000/svg";

/** The picture's own little coordinate system: a hundred across, with room at
 *  the edges for half the width of the road. */
const SHAPE = {
  size: 100,
  pad: 14,
  road: 15,
  middle: 2,
  dashes: "5 7",
} as const;

export function swatch(spec: TrackSpec): HTMLElement {
  const palette = ENVIRONMENTS[spec.environment];
  const box = document.createElementNS(SVG, "svg");
  box.setAttribute("class", "track-swatch");
  box.setAttribute("viewBox", `0 0 ${SHAPE.size} ${SHAPE.size}`);
  box.setAttribute("aria-hidden", "true");
  box.style.background = hex(palette.ground);
  box.style.borderColor = hex(palette.kerbA);

  const d = outline(spec, SHAPE.size, SHAPE.pad);
  const road = document.createElementNS(SVG, "path");
  road.setAttribute("d", d);
  road.setAttribute("fill", "none");
  road.setAttribute("stroke", hex(palette.tarmac));
  road.setAttribute("stroke-width", String(SHAPE.road));
  road.setAttribute("stroke-linejoin", "round");

  const line = document.createElementNS(SVG, "path");
  line.setAttribute("d", d);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", hex(palette.line));
  line.setAttribute("stroke-width", String(SHAPE.middle));
  line.setAttribute("stroke-dasharray", SHAPE.dashes);
  line.setAttribute("stroke-linejoin", "round");

  box.append(road, line);
  return box as unknown as HTMLElement;
}

/**
 * How hard it is, as a badge.
 *
 * Worked out from the track rather than claimed by whoever drew it — which is
 * the only way a rating means anything to the next person to pick it. The word
 * is there as well as the colour: a badge that differs only by hue is a badge
 * half the people looking at it cannot use.
 */
export function ratingBadge(spec: TrackSpec): HTMLElement {
  const rating = rate(spec);
  const badge = document.createElement("span");
  badge.className = "rating";
  badge.dataset.rating = rating;
  badge.textContent = RATING_NAMES[rating];
  return badge;
}

export function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
