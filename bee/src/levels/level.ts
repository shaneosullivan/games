import type * as THREE from "three";
import type {Audio} from "../core/audio";
import type {Save} from "../core/save";
import type {BabyRing} from "../entities/babyRing";
import type {Larder} from "../entities/larder";
import type {BeeActor} from "../entities/beeActor";
import type {FlowerField, HarvestEvent} from "../entities/flowerField";
import type {BearActor} from "../entities/bearActor";
import type {WaspActor} from "../entities/waspActor";
import type {ParticleBurst} from "../fx/particles";
import type {HiveInterior} from "../render/geometry/hiveInterior";
import type {DanglingLoad} from "../entities/danglingLoad";
import type {CottageScene} from "../render/geometry/cottage";
import type {CottageInside} from "../render/geometry/cottageInside";
import type {HiveSite} from "../render/geometry/world";
import type {Hud} from "../ui/hud";
import type {HopButtons} from "../core/hopButtons";

/** Which set of scenery is on screen. */
export type EnvironmentName =
  | "meadow"
  | "hive"
  | "cottage"
  | "inside"
  | "woods"
  | "lair"
  | "islands"
  | "mountain";

/** Playable volume and camera framing, which differ per level. */
export interface FlightSettings {
  boundsRadius: number;
  /**
   * How the stick is read. Omit for the game's usual camera-relative flying;
   * "tank" turns her on the spot with left/right and drives with forward/back,
   * which is what the maze wants — see BeeActor.steering.
   */
  steering?: "camera" | "tank";
  /**
   * Multiplier on the bee's top speed and acceleration. Omit for the game's
   * usual pace; the maze flies faster because its corridors are long and
   * straight.
   */
  speedScale?: number;
  /**
   * Distance from the centre the bee may not exceed, rounding off the corner
   * where `boundsRadius` meets `maxHeight`. Set it for a level played inside a
   * dome; omit it and only the disc and the ceiling apply.
   */
  boundsSphere?: number;
  minHeight: number;
  maxHeight: number;
  cameraDistance: number;
  cameraHeight: number;
  /**
   * Radius of a sphere about the origin the camera may not leave. Set it for a
   * level played up against a wall — the boom shortens instead of the shot
   * ending up outside the room. Omit it and the camera is unconstrained.
   */
  cameraEnclosure?: number;
  /**
   * Ceiling on the camera's total pull-back, including the extra a small
   * screen asks for. Set it in a room that was sized around the boom and has
   * no slack to give — otherwise the phone's wider shot puts the camera
   * through the wall. Omit it where there's open space behind the bee.
   */
  maxCameraZoom?: number;
}

export interface GameContext {
  scene: THREE.Scene;
  save: Save;
  hud: Hud;
  audio: Audio;
  bee: BeeActor;
  flowers: FlowerField;
  hive: HiveSite;
  interior: HiveInterior;
  babies: BabyRing;
  larder: Larder;
  wasp: WaspActor;
  bear: BearActor;
  cottage: CottageScene;
  /**
   * The container the Windy Woods is built into. Empty until level 5 fills it:
   * that maze is generated fresh on entry rather than owned by the Game, so
   * what the Game keeps is somewhere to put it and something to toggle.
   */
  woods: THREE.Group;
  /**
   * The container the Bear's Lair is built into — the same arrangement as
   * `woods`, and for the same reason: the cave belongs to level 6, not to the
   * Game, so what the Game keeps is somewhere to put it.
   */
  lair: THREE.Group;
  /**
   * The container the island levels are built into — the same arrangement as
   * `woods` and `lair`: the board belongs to level 7, and what the Game keeps
   * is somewhere to put it.
   */
  islands: THREE.Group;
  /**
   * The container the Mouldy Mountain is built into — the same arrangement as
   * `woods`, `lair` and `islands`.
   */
  mountain: THREE.Group;
  /**
   * The four hop buttons. Level 7's only control, and the only level that
   * shows them — every other level is switched out of them by the Game.
   */
  hopButtons: HopButtons;
  /**
   * The thumbstick, read directly.
   *
   * Level 9 is a shooter, not a flight: it writes the bee's position itself
   * and wants the stick as a lean rather than as a request to the flight
   * model. Everything else should leave this alone and use `configureFlight`.
   */
  readonly stick: {x: number; y: number; magnitude: number};
  /** True while anything at all is held on the screen — level 9's trigger. */
  readonly holding: boolean;
  inside: CottageInside;
  honeyJar: DanglingLoad;
  /** Small pollen motes. */
  puff: ParticleBurst;
  /** Big sparks for celebrations. */
  fireworks: ParticleBurst;

  /** Points the on-screen beacon at a world position, or hides it with null. */
  setObjectiveMarker(position: THREE.Vector3 | null): void;
  /** Brief full-screen colour wash. */
  flashScreen(): void;
  /**
   * Hold the screen behind a white wash: 0 is clear, 1 is opaque. Unlike
   * `flashScreen` this doesn't animate itself — the cutscene drives it, so it
   * can cover a scene change of any length and open again when it's ready.
   */
  setScreenFade(alpha: number): void;
  /** Swap scenery, sky, fog and lighting. */
  setEnvironment(name: EnvironmentName): void;
  /**
   * Push this environment's fog out by a multiple of itself, for a shot that
   * has to see further than the level normally lets you. 1 is normal;
   * `setEnvironment` resets it.
   */
  setFogScale(scale: number): void;
  /** Re-bound the player and re-frame the camera for this level. */
  configureFlight(settings: FlightSettings): void;
  /** Drop the bee somewhere and settle the camera behind it immediately. */
  /**
   * Drop the bee somewhere and snap the camera behind her.
   *
   * @param yaw which way the shot faces; defaults to looking at the world
   *   origin, which is only right for scenes built around it.
   */
  placeBee(position: THREE.Vector3, desiredHeight?: number, yaw?: number): void;
  /**
   * Widen or tighten the shot, as a multiple of the level's camera settings.
   * Eases in and out; 1 is normal.
   */
  setCameraZoom(zoom: number): void;
  /**
   * Drive the camera directly for a scripted shot; pass null to hand it back
   * to the follow rig, which then glides in from wherever the shot ended.
   */
  setCameraCinematic(eye: THREE.Vector3 | null, look?: THREE.Vector3): void;
  /** Where the camera is right now, for a cutscene that eases away from it. */
  readonly cameraPosition: THREE.Vector3;
  /**
   * Where a scripted shot has to stand for a flat square of side `2 *
   * halfWidth`, centred on `centre` and lying on the ground, to fill `fill` of
   * the tighter screen axis when looked down at from `pitch` radians above the
   * horizontal. Feed it to `setCameraCinematic`. Returns a shared vector.
   */
  framedCameraEye(
    centre: THREE.Vector3,
    halfWidth: number,
    pitch: number,
    fill: number,
  ): THREE.Vector3;
  /** Split the screen and show the sliding puzzle, or put it away. */
  showPuzzle(on: boolean): void;
  /**
   * Put up the "draw the map" task, or take it away.
   *
   * The level is told through `onMapDrawn` when the player has finished it and
   * asked to carry on — the same shape as the sliding puzzle.
   */
  showMapDraw(on: boolean): void;
  /** Rainbow confetti over the puzzle panel. */
  celebratePuzzle(): void;
  /** Move the honey jar into the meadow so it survives the scene change. */
  bringHoney(): void;
  /**
   * Show or hide the thumbstick and altitude slider. Levels that aren't about
   * flying (the dance mat) turn them off so taps reach the world instead.
   */
  setFlightControls(enabled: boolean): void;
  /**
   * Consume this frame's screen tap, if any, and return the first of
   * `objects` under it. Null when nothing was tapped.
   */
  pickTap(objects: ReadonlyArray<THREE.Object3D>): THREE.Object3D | null;
  /**
   * Consume this frame's screen tap without caring where it landed — for
   * "tap to get on with it". Taps on the HUD are never offered here.
   */
  takeTap(): boolean;
  /**
   * Consume one press of the screen, if one has begun since the last call.
   *
   * The Bear's Lair's flap, and its whole control. A press rather than a
   * state, counted as it arrives rather than sampled, so a tap that starts and
   * ends inside a single frame still counts — that tap is the one the player
   * meant most. Presses on the HUD never reach here, so the home button is
   * still the home button. See `core/holdInput.ts`.
   */
  takePress(): boolean;
  /**
   * The camera's width over its height. For a scripted shot that has to frame
   * something against the screen it will actually be seen on — a portrait
   * phone and a landscape iPad crop a side-on view completely differently.
   */
  readonly cameraAspect: number;
  /**
   * Turn the brood loose in the meadow, pouring out of `origin`. Moves the ring
   * out of the hive interior so it renders outdoors.
   */
  releaseBabies(origin: THREE.Vector3): void;
}

export interface Level {
  readonly name: string;
  enter(ctx: GameContext): void;
  /**
   * Called before the Game moves on to another level. Anything a level started
   * that outlives its own `update()` — a music track, a timer — has to be
   * stopped here; the level object itself is thrown away.
   */
  exit?(ctx: GameContext): void;
  update(dt: number, ctx: GameContext, harvest: HarvestEvent | null): void;
  /** True once the player has met the win condition. */
  readonly complete: boolean;
  /**
   * True once the player has lost and the level has finished saying so — the
   * Game then offers another go or the map. Only levels you can actually fail
   * have one; everywhere else the worst that happens is you try again.
   */
  readonly failed?: boolean;
  /** While true the level is driving the bee itself; ignore player input. */
  readonly controlsLocked: boolean;
  /**
   * Pick up from a fail rather than start again, if this level can.
   *
   * Offered by the level, not decided by the Game: most levels here are short
   * enough that starting again *is* the retry, and rebuilding them is both
   * simpler and what the player expects. Bee vs Frog is not — it is
   * five crossings, and losing three of them to one mistake is more than a
   * child will sit through twice. A level with one of these keeps whatever it
   * thinks is worth keeping; a level without one is rebuilt as before.
   *
   * **It must clear `failed` itself.** The Game raises the try-again card on
   * that flag going from false to true, so a level that picks up again while
   * still reporting failure never raises another one: the next death is
   * silent, and the level sits there with its controls locked. A rebuilt level
   * gets this for free by being a new object, which is exactly why the first
   * one to implement this got it wrong.
   */
  retry?(ctx: GameContext): void;
  /**
   * Called when the player dismisses the completion card and keeps playing.
   * Lets a level re-arm whatever it was offering so the ending can be
   * replayed, rather than leaving the world inert.
   */
  resumeAfterCompletion(ctx: GameContext): void;
  /** Called when the sliding puzzle is completed, if this level uses one. */
  onPuzzleSolved?(ctx: GameContext): void;
  /**
   * Called when the map has been drawn well enough and the player has tapped
   * to go on. Only level 6 has one.
   */
  onMapDrawn?(ctx: GameContext): void;
  /** Shown on the level-complete card. */
  readonly completionTitle: string;
  readonly completionBody: string;
  /**
   * Shown on the try-again card, for a level you can fail.
   *
   * Optional, and the default is the Bear's Lair's — it was the first level
   * with a fail state and its words were written into the card itself. A level
   * that can be failed some other way has to say so, or it tells the player
   * they bumped into a rock in a place that has no rocks.
   */
  readonly failTitle?: string;
  readonly failBody?: string;
  /**
   * True if there is nothing to carry on to. The completion card then offers
   * the menu instead of "Keep flying" — at the end of the last level, leaving
   * the player alone in a finished world with no prompt is a dead end, not a
   * reward.
   */
  readonly finishesGame?: boolean;
}
