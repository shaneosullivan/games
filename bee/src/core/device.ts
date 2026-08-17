import {DEVICE} from "../config";

/**
 * Is this a phone, as far as the game is concerned?
 *
 * The short side of the screen, not the width: a phone is a phone whichever
 * way up it is held, and this game is played both ways. Not `pointer: coarse`
 * either — an iPad is as coarse as a phone and is the device this was built
 * for; what makes a phone different here is that there is no room on it.
 *
 * Asked of `screen` rather than the window, because the window on an installed
 * iPad app has been caught reporting a size it wasn't (see core/fitViewport.ts),
 * and because this decides what a level asks the player to do — it should not
 * change halfway through because a keyboard appeared.
 */
export function isPhone(): boolean {
  const short = Math.min(
    screen?.width ?? window.innerWidth,
    screen?.height ?? window.innerHeight,
  );
  return short > 0 && short < DEVICE.phoneShortSide;
}
