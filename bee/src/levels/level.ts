import type * as THREE from 'three';
import type { Audio } from '../core/audio';
import type { Save } from '../core/save';
import type { BabyRing } from '../entities/babyRing';
import type { BeeActor } from '../entities/beeActor';
import type { FlowerField, HarvestEvent } from '../entities/flowerField';
import type { WaspActor } from '../entities/waspActor';
import type { ParticleBurst } from '../fx/particles';
import type { HiveInterior } from '../render/geometry/hiveInterior';
import type { HiveSite } from '../render/geometry/world';
import type { Hud } from '../ui/hud';

/** Which set of scenery is on screen. */
export type EnvironmentName = 'meadow' | 'hive';

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
  /** Small pollen motes. */
  puff: ParticleBurst;
  /** Big sparks for celebrations. */
  fireworks: ParticleBurst;

  /** Points the on-screen beacon at a world position, or hides it with null. */
  setObjectiveMarker(position: THREE.Vector3 | null): void;
  /** Brief full-screen colour wash. */
  flashScreen(): void;
  /** Swap scenery, sky, fog and lighting. */
  setEnvironment(name: EnvironmentName): void;
  /** Re-bound the player and re-frame the camera for this level. */
  configureFlight(settings: FlightSettings): void;
  /** Drop the bee somewhere and settle the camera behind it immediately. */
  placeBee(position: THREE.Vector3, desiredHeight?: number): void;
  /**
   * Widen or tighten the shot, as a multiple of the level's camera settings.
   * Eases in and out; 1 is normal.
   */
  setCameraZoom(zoom: number): void;
}

export interface Level {
  readonly name: string;
  enter(ctx: GameContext): void;
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
  /** Shown on the level-complete card. */
  readonly completionTitle: string;
  readonly completionBody: string;
}
