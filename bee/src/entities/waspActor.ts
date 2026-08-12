import * as THREE from 'three';
import { WASP } from '../config';
import { createWasp } from '../render/geometry/wasp';

export type WaspPhase = 'gone' | 'arriving' | 'seeking' | 'chasing' | 'veering' | 'leaving';

/** Things the wasp does that the level needs to react to. */
export type WaspEvent = 'locked-on' | 'lost-you' | 'bumped' | 'departed';

const tmpTarget = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpForward = new THREE.Vector3();

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The wasp.
 *
 * It wants the hive, and circles it until something distracts it. The bee is
 * only distracting when it crosses the wasp's field of view — that's the
 * "fly in front of it" from the design brief. Once locked on it pursues at a
 * speed the bee can beat, so the player's job is to hold its attention without
 * getting bumped, and the level's countdown only runs while it's chasing.
 */
export class WaspActor {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  phase: WaspPhase = 'gone';

  private readonly model = createWasp();
  private readonly prevPosition = new THREE.Vector3();
  private readonly hive = new THREE.Vector3();
  private readonly veerTarget = new THREE.Vector3();
  /** Lagged guess at where the bee is, used while chasing. */
  private readonly aim = new THREE.Vector3();

  private yaw = 0;
  /** Direction it is actually committed to flying, separate from its facing. */
  private heading = 0;
  private prevYaw = 0;
  private elapsed = 0;
  private phaseTime = 0;
  private orbitAngle = 0;

  constructor() {
    this.object.add(this.model.group);
    this.object.visible = false;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  /** 0..1 of top speed. */
  get speed01(): number {
    return Math.min(1, this.velocity.length() / WASP.speed);
  }

  /** Unit vector the wasp is facing. */
  forward(target: THREE.Vector3): THREE.Vector3 {
    return target.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Drop it in from off the edge of the meadow, heading for the hive. */
  spawn(hive: THREE.Vector3, fromAngle = 0.8): void {
    this.hive.copy(hive);
    const r = 46;
    this.position.set(
      hive.x + Math.cos(fromAngle) * r,
      WASP.maxHeight,
      hive.z + Math.sin(fromAngle) * r,
    );
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.atan2(hive.x - this.position.x, hive.z - this.position.z);
    this.prevYaw = this.yaw;
    this.heading = this.yaw;
    this.aim.copy(this.position);
    this.orbitAngle = fromAngle;
    this.phase = 'arriving';
    this.phaseTime = 0;
    this.object.visible = true;
  }

  /** Send it home. The level calls this once the countdown is done. */
  leave(): void {
    if (this.phase === 'leaving' || this.phase === 'gone') return;
    this.phase = 'leaving';
    this.phaseTime = 0;
  }

  reset(): void {
    this.phase = 'gone';
    this.object.visible = false;
  }

  update(dt: number, beePosition: THREE.Vector3): WaspEvent | null {
    if (this.phase === 'gone') return null;

    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.elapsed += dt;
    this.phaseTime += dt;

    let event: WaspEvent | null = null;
    const toBee = tmpDir.copy(beePosition).sub(this.position);
    const distance = toBee.length();

    switch (this.phase) {
      case 'arriving':
        tmpTarget.copy(this.hive).setY(WASP.height + 2);
        if (this.phaseTime >= WASP.arriveSeconds || this.position.distanceTo(this.hive) < 12) {
          this.phase = 'seeking';
          this.phaseTime = 0;
        }
        break;

      case 'seeking': {
        // Circle the hive, menacingly, until the bee shows itself.
        this.orbitAngle += WASP.hiveOrbitRate * dt;
        tmpTarget.set(
          this.hive.x + Math.cos(this.orbitAngle) * WASP.hiveOrbitRadius,
          WASP.height + 1.4,
          this.hive.z + Math.sin(this.orbitAngle) * WASP.hiveOrbitRadius,
        );
        if (distance < WASP.baitRadius && this.beeIsInFront(toBee, distance)) {
          this.phase = 'chasing';
          this.phaseTime = 0;
          // Start the lag from where the bee actually is, or it lunges at stale
          // coordinates from before it noticed you.
          this.aim.copy(beePosition);
          event = 'locked-on';
        }
        break;
      }

      case 'chasing':
        // Aim at a lagged copy of the bee, so it commits to where you *were*
        // for a beat after you cut away.
        this.aim.lerp(beePosition, 1 - Math.exp(-dt / WASP.reactionLag));
        tmpTarget.copy(this.aim);
        if (distance < WASP.catchRadius) {
          this.beginVeer(beePosition);
          event = 'bumped';
        } else if (distance > WASP.loseRadius) {
          this.phase = 'seeking';
          this.phaseTime = 0;
          event = 'lost-you';
        }
        break;

      case 'veering':
        tmpTarget.copy(this.veerTarget);
        if (this.phaseTime >= WASP.veerSeconds) {
          this.phase = 'seeking';
          this.phaseTime = 0;
        }
        break;

      case 'leaving':
        // Up and out, away from the hive.
        tmpTarget
          .copy(this.position)
          .sub(this.hive)
          .setY(0)
          .normalize()
          .multiplyScalar(70)
          .add(this.hive)
          .setY(WASP.maxHeight + 14);
        if (this.phaseTime >= WASP.leaveSeconds) {
          this.phase = 'gone';
          this.object.visible = false;
          event = 'departed';
        }
        break;
    }

    this.steerToward(dt, tmpTarget);
    return event;
  }

  private beeIsInFront(toBee: THREE.Vector3, distance: number): boolean {
    if (distance < 0.001) return true;
    this.forward(tmpForward);
    // Compare on the horizontal plane; altitude shouldn't break the lock-on.
    const dot = (toBee.x * tmpForward.x + toBee.z * tmpForward.z) / distance;
    return dot > WASP.baitCone;
  }

  private beginVeer(beePosition: THREE.Vector3): void {
    this.phase = 'veering';
    this.phaseTime = 0;
    // Peel away from the bee and climb, so the bump reads as a swipe-and-miss.
    this.veerTarget
      .copy(this.position)
      .sub(beePosition)
      .setY(0)
      .normalize()
      .multiplyScalar(14)
      .add(this.position)
      .setY(WASP.maxHeight);
  }

  /**
   * Fly toward `target` like something with momentum rather than something
   * being dragged.
   *
   * The heading is what steers, and it can only swing so fast — while chasing,
   * slowly. So a sharp turn by the bee sends the wasp sailing past on its old
   * course before it can arc back round. That's the whole reason a slower bee
   * can escape a faster wasp.
   */
  private steerToward(dt: number, target: THREE.Vector3): void {
    tmpDir.copy(target).sub(this.position);
    const distance = tmpDir.length();

    const chasing = this.phase === 'chasing';
    const turnRate = chasing ? WASP.chaseTurnRate : WASP.turnRate;

    if (distance > 0.001) {
      const desired = Math.atan2(tmpDir.x, tmpDir.z);
      const swing = shortestAngle(this.heading, desired);
      this.heading += THREE.MathUtils.clamp(swing, -turnRate * dt, turnRate * dt);
    }

    // Ease off near the target so it doesn't jitter around orbit points.
    const speed = WASP.speed * Math.min(1, distance / 2.5);
    tmpForward.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(speed);
    // Climb and dive freely; only the horizontal turn is constrained.
    tmpForward.y = THREE.MathUtils.clamp(target.y - this.position.y, -WASP.speed, WASP.speed);

    tmpForward.sub(this.velocity);
    const maxChange = WASP.accel * dt;
    if (tmpForward.length() > maxChange) tmpForward.setLength(maxChange);
    this.velocity.add(tmpForward);

    this.position.addScaledVector(this.velocity, dt);
    this.position.y = THREE.MathUtils.clamp(this.position.y, WASP.minHeight, WASP.maxHeight + 16);

    this.yaw += shortestAngle(this.yaw, this.heading) * Math.min(1, 8 * dt);
  }

  render(alpha: number): void {
    this.object.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.object.rotation.y = this.prevYaw + shortestAngle(this.prevYaw, this.yaw) * alpha;
    this.model.animate(this.elapsed, this.speed01, this.phase === 'chasing' ? 1 : 0);
  }
}
