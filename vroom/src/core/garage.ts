import * as THREE from "three";
import {CarDesign, Environment, PLAYER} from "../config";

/**
 * Which car is yours.
 *
 * One colour, kept in this browser. It is a small thing and it is the first
 * thing a child asks for: the red car is only *your* car if you picked it.
 */
const KEY = "vroom.car.v1";
const DESIGN_KEY = "vroom.car.design.v1";

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

/**
 * Your colour as it is painted for a given track.
 *
 * Everywhere but the neon city this is simply the colour you chose. There it
 * is that colour turned up — see `PLAYER.neonSaturation`.
 */
export function carColour(environment: Environment): number {
  return environment === "neon" ? neonised(myColour()) : myColour();
}

/** The same hue, wound out to full. Colours with no hue come back unchanged. */
export function neonised(colour: number): number {
  const c = new THREE.Color(colour);
  const hsl = {h: 0, s: 0, l: 0};
  // In sRGB rather than the working space, so these are the saturation and
  // lightness the palette was picked in and not their linear counterparts.
  c.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.s < PLAYER.neonNeedsHue) {
    return colour;
  }
  c.setHSL(
    hsl.h,
    Math.max(hsl.s, PLAYER.neonSaturation),
    Math.max(hsl.l, PLAYER.neonLightness),
    THREE.SRGBColorSpace,
  );
  return c.getHex(THREE.SRGBColorSpace);
}

/** What is painted on it. The colour and the design are stored apart: a child
 *  changing one is not choosing the other again. */
export function myDesign(): CarDesign {
  try {
    const saved = window.localStorage.getItem(DESIGN_KEY);
    const known = PLAYER.designs.find(d => d.id === saved);
    if (known) {
      return known.id;
    }
  } catch {
    // A blocked store just means everybody drives a plain one.
  }
  return "plain";
}

export function chooseDesign(design: CarDesign): void {
  try {
    window.localStorage.setItem(DESIGN_KEY, design);
  } catch {
    // As above.
  }
}

export function chooseColour(colour: number): void {
  try {
    window.localStorage.setItem(KEY, String(colour));
  } catch {
    // As above.
  }
}
