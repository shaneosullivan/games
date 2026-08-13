import type * as THREE from "three";
import type {Audio} from "../core/audio";
import type {Save} from "../core/save";
import type {BabyRing} from "../entities/babyRing";
import type {BeeActor} from "../entities/beeActor";
import type {FlowerField, HarvestEvent} from "../entities/flowerField";
import type {BearActor} from "../entities/bearActor";
import type {WaspActor} from "../entities/waspActor";
import type {ParticleBurst} from "../fx/particles";
import type {HiveInterior} from "../render/geometry/hiveInterior";
import type {HoneyJar} from "../entities/honeyJar";
import type {CottageScene} from "../render/geometry/cottage";
import type {CottageInside} from "../render/geometry/cottageInside";
import type {HiveSite} from "../render/geometry/world";
import type {Hud} from "../ui/hud";

/** Which set of scenery is on screen. */
export type EnvironmentName = "meadow" | "hive" | "cottage" | "inside";

/** Playable volume and camera framing, which differ per level. */
export interface FlightSettings {
  boundsRadius: number;
  minHeight: number;
  maxHeight: number;
  cameraDistance: number;
  cameraHeight: number;
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
  wasp: WaspActor;
  bear: BearActor;
  cottage: CottageScene;
  inside: CottageInside;
  honeyJar: HoneyJar;
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
  /** Split the screen and show the sliding puzzle, or put it away. */
  showPuzzle(on: boolean): void;
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
  /** While true the level is driving the bee itself; ignore player input. */
  readonly controlsLocked: boolean;
  /**
   * Called when the player dismisses the completion card and keeps playing.
   * Lets a level re-arm whatever it was offering so the ending can be
   * replayed, rather than leaving the world inert.
   */
  resumeAfterCompletion(ctx: GameContext): void;
  /** Called when the sliding puzzle is completed, if this level uses one. */
  onPuzzleSolved?(ctx: GameContext): void;
  /** Shown on the level-complete card. */
  readonly completionTitle: string;
  readonly completionBody: string;
}
