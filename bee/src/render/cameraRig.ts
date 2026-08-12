import * as THREE from 'three';
import { CAMERA } from '../config';
import type { BeeActor } from '../entities/beeActor';

const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const smoothedLook = new THREE.Vector3();

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Spring-damped chase camera at a fixed pitch, matching the reference's
 * over-the-shoulder framing. Its yaw drifts to sit behind the bee's heading,
 * slowly enough that the input frame never feels like it's fighting the player.
 */
export class CameraRig {
  yaw = Math.PI;

  /** Levels override these; the hive interior needs a tighter rig than the meadow. */
  distance: number = CAMERA.distance;
  height: number = CAMERA.height;

  /**
   * Multiplier on the rig's distance and height. Both scale together so the
   * camera pitch stays put and the shot just widens. Level 3 pulls back to 2
   * while the wasp is on your tail, so you can see it behind you.
   */
  private zoomTarget = 1;
  private zoom = 1;

  /** Set while a level is driving the camera itself. */
  private cinematicEye: THREE.Vector3 | null = null;
  private readonly cinematicLook = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    smoothedLook.set(0, 1, 0);
  }

  /** `immediate` skips the ease — used when a level places the bee. */
  setZoom(z: number, immediate = false): void {
    this.zoomTarget = z;
    if (immediate) this.zoom = z;
  }

  /**
   * Hand the camera to a level for a scripted shot, or pass null to give it
   * back. While a cinematic is running the follow spring is bypassed entirely;
   * releasing it lets that same spring glide the camera back behind the bee,
   * so the handoff needs no extra blending.
   */
  setCinematic(eye: THREE.Vector3 | null, look?: THREE.Vector3): void {
    if (!eye) {
      this.cinematicEye = null;
      return;
    }
    this.cinematicEye = (this.cinematicEye ?? new THREE.Vector3()).copy(eye);
    if (look) this.cinematicLook.copy(look);
  }

  update(dt: number, bee: BeeActor): void {
    if (this.cinematicEye) {
      this.camera.position.copy(this.cinematicEye);
      // Ease the look target so a moving subject doesn't make the shot jitter.
      smoothedLook.lerp(this.cinematicLook, 1 - Math.exp(-9 * dt));
      this.camera.lookAt(smoothedLook);
      return;
    }

    const planarSpeed = Math.hypot(bee.velocity.x, bee.velocity.z);
    if (planarSpeed > 1.2) {
      const heading = Math.atan2(bee.velocity.x, bee.velocity.z);
      const diff = shortestAngle(this.yaw, heading);
      const off = Math.abs(diff) - CAMERA.yawDeadzone;
      if (off > 0) {
        const rate =
          Math.min(off * CAMERA.yawGain, CAMERA.yawMaxRate) * Math.min(1, planarSpeed / 4.5);
        // Never overshoot the heading in a single step.
        this.yaw += Math.sign(diff) * Math.min(rate * dt, Math.abs(diff));
      }
    }

    // Ease the pull-back so entering and leaving a chase glides.
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-2.6 * dt));

    // Sit behind the heading: bee position minus its forward vector.
    desired.set(
      bee.position.x - Math.sin(this.yaw) * this.distance * this.zoom,
      bee.position.y + this.height * this.zoom,
      bee.position.z - Math.cos(this.yaw) * this.distance * this.zoom,
    );

    const k = 1 - Math.exp(-CAMERA.followLerp * dt);
    this.camera.position.lerp(desired, k);

    lookTarget
      .copy(bee.position)
      .addScaledVector(bee.velocity, CAMERA.lookAhead)
      .add(new THREE.Vector3(0, CAMERA.lookHeight, 0));
    smoothedLook.lerp(lookTarget, 1 - Math.exp(-8 * dt));
    this.camera.lookAt(smoothedLook);
  }

  /**
   * Snap immediately, used on level entry so there's no swoop-in.
   *
   * @param yaw which way to look. Defaults to facing the world origin, which
   *   is right for scenes built around it — but not for the cottage clearing,
   *   which stands off at the far end of the meadow, so levels that place the
   *   bee somewhere else say what they mean.
   */
  snap(bee: BeeActor, yaw = Math.atan2(-bee.position.x, -bee.position.z)): void {
    this.zoom = this.zoomTarget;
    this.yaw = yaw;
    this.camera.position.set(
      bee.position.x - Math.sin(this.yaw) * this.distance * this.zoom,
      bee.position.y + this.height * this.zoom,
      bee.position.z - Math.cos(this.yaw) * this.distance * this.zoom,
    );
    smoothedLook.copy(bee.position).add(new THREE.Vector3(0, CAMERA.lookHeight, 0));
    this.camera.lookAt(smoothedLook);
  }
}
