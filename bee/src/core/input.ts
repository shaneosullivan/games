/**
 * The thumbstick, which now lives in `shared/` with the progress bar and the
 * sound switch.
 *
 * It moved there when the monkey game needed one: two copies of the control
 * a child holds the game by would have drifted the first time either was
 * touched, which is the repo's argument for shared furniture. This file is
 * the door it used to come through, kept so nothing in the bee had to
 * change — and the class and its behaviour are the bee's own, unaltered.
 */
export {Joystick, type StickInput} from "../../../shared/touchControls";
