import * as THREE from 'three';
import { FLIGHT, WORLD } from '../config';
import type { StickInput } from '../core/input';
import { createBee } from '../render/geometry/bee';

const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The flight model. Input is interpreted in the camera's yaw frame — push the
 * stick "up" and the bee flies away from you, whichever way the camera faces.
 *
 * Altitude is never set directly. The right-hand slider writes `desiredHeight`
 * and the bee travels there at `FLIGHT.climbSpeed`, holding whatever height it
 * has reached in between.
 */
export class BeeActor {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3(0, FLIGHT.hoverHeight, 12);
  readonly velocity = new THREE.Vector3();

  /** Previous sim position, for render interpolation. */
  private readonly prevPosition = new THREE.Vector3();
  private prevYaw = 0;
  private prevRoll = 0;

  private yaw = Math.PI;
  private roll = 0;
  private bobPhase = 0;
  private elapsed = 0;

  /**
   * Playable volume. Levels override this — the meadow is a wide disc, the
   * hive interior is a much tighter one.
   *
   * `minZ` is a straight wall across the disc, used for the shut gate at the
   * mouth of the cottage lane: until the cottage is unlocked there's nothing up
   * there to find, so the meadow stops at the fence.
   */
  bounds = {
    radius: WORLD.radius as number,
    centreX: 0,
    centreZ: 0,
    minZ: -Infinity as number,
  };

  /** Altitude the player has asked for, via the right-hand slider. */
  desiredHeight: number = FLIGHT.hoverHeight;
  /** Altitude actually reached so far; chases `desiredHeight` at climbSpeed. */
  private baseHeight: number = FLIGHT.hoverHeight;
  /** Units/sec of climb (+) or dive (-), used for the nose-up/down pitch. */
  private climbRate = 0;

  private readonly model = createBee();

  constructor() {
    this.object.add(this.model.group);
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
  }

  /** 0..1 fraction of top speed. */
  get speed01(): number {
    return Math.min(1, this.velocity.length() / FLIGHT.maxSpeed);
  }

  /**
   * When true the flight model stands down and something else (a cutscene)
   * writes `position` directly. Wings keep flapping either way.
   */
  scripted = false;

  /** Drive the bee's facing from a cutscene. */
  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  /** Uniform scale, used to shrink the bee as it disappears into the hive. */
  setScale(s: number): void {
    this.object.scale.setScalar(s);
  }

  /** Seconds left of being knocked about; input is ignored while this runs. */
  private stunTime = 0;

  get stunned(): boolean {
    return this.stunTime > 0;
  }

  /**
   * Shove the bee away from `from`. Used when the wasp connects — the player
   * loses control for a moment instead of losing the level.
   */
  knockBackFrom(from: THREE.Vector3, speed: number, seconds: number): void {
    this.velocity.copy(this.position).sub(from).setY(0);
    if (this.velocity.lengthSq() < 0.0001) this.velocity.set(1, 0, 0);
    this.velocity.setLength(speed);
    this.stunTime = seconds;
  }

  /** Crown the bee — level 1 does this once the hive is finished. */
  setCrown(on: boolean): void {
    this.model.setCrown(on);
  }

  /** World position of the top of the bee's head, for crown sparkles. */
  headPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.set(0, 0.42, 0.46).applyMatrix4(this.object.matrixWorld);
  }

  /**
   * Move without interpolating from where she used to be. Render lerps from
   * `prevPosition`, so a teleport that doesn't reset it draws one frame back
   * at the old location — across a level change, that's a flicker on the far
   * side of the map.
   */
  teleport(position: THREE.Vector3): void {
    this.position.copy(position);
    this.prevPosition.copy(position);
    this.velocity.set(0, 0, 0);
  }

  /** Jump to an altitude without the climb, for level entry. */
  snapHeight(h: number): void {
    this.baseHeight = h;
    this.desiredHeight = h;
    this.position.y = h;
    this.prevPosition.y = h;
    this.climbRate = 0;
  }

  update(dt: number, stick: StickInput, cameraYaw: number): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.prevRoll = this.roll;
    this.elapsed += dt;

    if (this.scripted) {
      // Position and yaw belong to the cutscene; just keep the wings alive.
      this.bobPhase += dt * FLIGHT.bobRate;
      this.roll += (0 - this.roll) * Math.min(1, 4 * dt);
      this.baseHeight = this.position.y;
      this.climbRate = 0;
      return;
    }

    // Camera-space basis on the horizontal plane. The camera sits behind
    // `cameraYaw`, so "into the screen" is that yaw's forward vector, and
    // screen-right is forward x up.
    tmpForward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    tmpRight.set(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));

    // While stunned the stick is ignored and the bee just coasts out the shove.
    this.stunTime = Math.max(0, this.stunTime - dt);
    const stunned = this.stunTime > 0;

    tmpDesired
      .copy(tmpForward)
      .multiplyScalar(stunned ? 0 : -stick.y)
      .addScaledVector(tmpRight, stunned ? 0 : stick.x)
      .multiplyScalar(FLIGHT.maxSpeed);

    // Accelerate toward the desired velocity; coast to a stop when released.
    const rate = !stunned && stick.magnitude > 0 ? FLIGHT.accel : FLIGHT.drag;
    tmpDelta.copy(tmpDesired).sub(this.velocity);
    tmpDelta.y = 0;
    const maxChange = rate * dt;
    if (tmpDelta.length() > maxChange) tmpDelta.setLength(maxChange);
    this.velocity.add(tmpDelta);

    this.position.addScaledVector(this.velocity, dt);

    // Soft boundary: push back rather than hard-clamp, so it feels like wind.
    const dx = this.position.x - this.bounds.centreX;
    const dz = this.position.z - this.bounds.centreZ;
    const horiz = Math.hypot(dx, dz);
    if (horiz > this.bounds.radius) {
      const over = horiz - this.bounds.radius;
      const push = Math.min(1, over / 6) * 22 * dt;
      this.position.x -= (dx / horiz) * push;
      this.position.z -= (dz / horiz) * push;
      this.velocity.multiplyScalar(1 - Math.min(0.9, over / 8) * dt * 4);
    }

    // The same soft push, against a flat wall this time.
    if (this.position.z < this.bounds.minZ) {
      const over = this.bounds.minZ - this.position.z;
      this.position.z += Math.min(1, over / 6) * 22 * dt;
      this.velocity.multiplyScalar(1 - Math.min(0.9, over / 8) * dt * 4);
    }

    // Altitude: travel toward the height the player asked for at a fixed
    // climb speed — never snap — then add a bob that quickens with speed.
    const gap = this.desiredHeight - this.baseHeight;
    const step = FLIGHT.climbSpeed * dt;
    const move = Math.abs(gap) <= step ? gap : Math.sign(gap) * step;
    this.baseHeight += move;
    this.climbRate = dt > 0 ? move / dt : 0;

    this.bobPhase += dt * FLIGHT.bobRate * (1 + this.speed01);
    this.position.y = this.baseHeight + Math.sin(this.bobPhase) * FLIGHT.bobAmplitude;

    // Face the direction of travel.
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (planarSpeed > 0.35) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.yaw += shortestAngle(this.yaw, target) * Math.min(1, FLIGHT.yawLerp * dt);
    }

    // Bank into turns: roll proportional to how much velocity is turning.
    const turn = shortestAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z));
    const targetRoll = THREE.MathUtils.clamp(-turn * 2.2, -FLIGHT.maxBank, FLIGHT.maxBank) * this.speed01;
    this.roll += (targetRoll - this.roll) * Math.min(1, FLIGHT.bankLerp * dt);
  }

  /** Called once per rendered frame with the sub-step interpolation factor. */
  render(alpha: number): void {
    this.object.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.object.rotation.y = this.prevYaw + shortestAngle(this.prevYaw, this.yaw) * alpha;
    this.object.rotation.z = this.prevRoll + (this.roll - this.prevRoll) * alpha;
    this.model.animate(this.elapsed, this.speed01, this.climbRate / FLIGHT.climbSpeed);
  }

  /** Current altitude excluding the bob, for the slider's ghost marker. */
  get height(): number {
    return this.baseHeight;
  }
}
