import * as THREE from "three";
import {BEAR} from "../config";
import {createBear} from "../render/geometry/bear";

export type BearPhase =
  "gone" | "waiting" | "chasing" | "recovering" | "distracted" | "fleeing";

export type BearEvent = "swiped" | "departed";

const tmpTarget = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  }
  if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

/**
 * The bear.
 *
 * A ground-bound cousin of the wasp: faster than the bee in a straight line,
 * but its heading swings slowly and it aims at where the bee *was*, so cutting
 * away sends it lumbering past. Same counter, bigger and heavier.
 *
 * It never hurts anyone. The worst it does is swipe, which knocks the bee
 * spinning and leaves the bear winded for a moment.
 */
export class BearActor {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  phase: BearPhase = "gone";

  private readonly model = createBear();
  private readonly prevPosition = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  /** Where it is standing and swatting while the babies tease it. */
  private readonly anchor = new THREE.Vector3();

  private yaw = 0;
  private prevYaw = 0;
  private heading = 0;
  private elapsed = 0;
  private phaseTime = 0;
  /** Eased 0..1 for rearing up and swatting. */
  private rear = 0;
  private swat = 0;

  constructor() {
    this.object.add(this.model.group);
    this.object.visible = false;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  get speed01(): number {
    return Math.min(1, this.velocity.length() / BEAR.speed);
  }

  /** Drop it into the world facing `lookAt`. */
  spawn(at: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.position.copy(at).setY(0);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.atan2(lookAt.x - at.x, lookAt.z - at.z);
    this.prevYaw = this.yaw;
    this.heading = this.yaw;
    this.aim.copy(lookAt);
    this.phase = "waiting";
    this.phaseTime = 0;
    this.rear = 0;
    this.swat = 0;
    this.object.visible = true;
  }

  /** Start the chase. */
  pursue(): void {
    if (this.phase === "gone") {
      return;
    }
    this.phase = "chasing";
    this.phaseTime = 0;
  }

  /**
   * The babies have its attention: give ground, then stand and swipe at air.
   *
   * @param from something to keep clear of — the hive, which it would
   *   otherwise stand on top of and hide.
   * @param standoff how far from `from` to end up
   */
  distract(from?: THREE.Vector3, standoff = 0): void {
    if (this.phase === "gone") {
      return;
    }
    this.phase = "distracted";
    this.phaseTime = 0;
    this.anchor.copy(this.position);

    if (from && standoff > 0) {
      tmpDir.copy(this.position).sub(from).setY(0);
      // Dead on top of it: any direction will do, so pick the one it's facing.
      if (tmpDir.lengthSq() < 0.01) {
        tmpDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      }
      this.anchor
        .copy(from)
        .addScaledVector(tmpDir.normalize(), standoff)
        .setY(0);
    }
  }

  /** Frightened off. */
  flee(away: THREE.Vector3): void {
    if (this.phase === "gone") {
      return;
    }
    this.phase = "fleeing";
    this.phaseTime = 0;
    this.aim
      .copy(this.position)
      .sub(away)
      .setY(0)
      .normalize()
      .multiplyScalar(120)
      .add(this.position);
  }

  reset(): void {
    this.phase = "gone";
    this.object.visible = false;
  }

  update(dt: number, beePosition: THREE.Vector3): BearEvent | null {
    if (this.phase === "gone") {
      return null;
    }

    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.elapsed += dt;
    this.phaseTime += dt;

    let event: BearEvent | null = null;
    const distance = this.position.distanceTo(beePosition);

    // Rearing and swatting only happen when the babies are teasing it.
    const wantRear = this.phase === "distracted" ? 1 : 0;
    this.rear += (wantRear - this.rear) * Math.min(1, 3 * dt);
    this.swat += (wantRear - this.swat) * Math.min(1, 2.2 * dt);

    switch (this.phase) {
      case "waiting":
        // Lumber into shot, then pull up short. It is meant to arrive beside
        // the bee during the reveal, not walk onto her and fill the frame —
        // which is what it did once that shot was lengthened.
        tmpTarget
          .copy(distance < BEAR.ambushStandoff ? this.position : beePosition)
          .setY(0);
        break;

      case "chasing":
        // Chase a lagged copy of the bee, so it commits to where she was.
        this.aim.lerp(beePosition, 1 - Math.exp(-dt / BEAR.reactionLag));
        tmpTarget.copy(this.aim).setY(0);
        if (distance < BEAR.swipeRadius) {
          this.phase = "recovering";
          this.phaseTime = 0;
          event = "swiped";
        }
        break;

      case "recovering":
        // Winded: coast, then take up the chase again.
        tmpTarget.copy(this.position);
        if (this.phaseTime >= BEAR.recoverSeconds) {
          this.phase = "chasing";
          this.phaseTime = 0;
          this.aim.copy(beePosition);
        }
        break;

      case "distracted":
        tmpTarget.copy(this.anchor);
        break;

      case "fleeing":
        tmpTarget.copy(this.aim).setY(0);
        if (this.phaseTime >= BEAR.fleeSeconds) {
          this.phase = "gone";
          this.object.visible = false;
          event = "departed";
        }
        break;
    }

    this.steerToward(dt, tmpTarget);
    return event;
  }

  /** Same steering as the wasp: the heading is capped, so turns are wide. */
  private steerToward(dt: number, target: THREE.Vector3): void {
    tmpDir.copy(target).sub(this.position).setY(0);
    const distance = tmpDir.length();

    const chasing = this.phase === "chasing" || this.phase === "fleeing";
    const turnRate = chasing ? BEAR.chaseTurnRate : BEAR.turnRate;

    if (distance > 0.001) {
      const desired = Math.atan2(tmpDir.x, tmpDir.z);
      const swing = shortestAngle(this.heading, desired);
      this.heading += THREE.MathUtils.clamp(
        swing,
        -turnRate * dt,
        turnRate * dt,
      );
    }

    // Winded, it plants. Distracted, it backs away to its standoff and *then*
    // plants — the speed taper below brings it to a stop on arrival.
    const wants = this.phase === "recovering" ? 0 : 1;
    const speed = BEAR.speed * wants * Math.min(1, distance / 3);

    tmpDir
      .set(Math.sin(this.heading), 0, Math.cos(this.heading))
      .multiplyScalar(speed);
    tmpDir.sub(this.velocity);
    const maxChange = BEAR.accel * dt;
    if (tmpDir.length() > maxChange) {
      tmpDir.setLength(maxChange);
    }
    this.velocity.add(tmpDir);

    this.position.addScaledVector(this.velocity, dt);
    this.position.y = 0;

    // While distracted it turns to face whatever is buzzing round its head.
    this.yaw += shortestAngle(this.yaw, this.heading) * Math.min(1, 6 * dt);
  }

  /**
   * Where its head is right now, in world space — the point the babies buzz
   * around while they're teasing it.
   *
   * Read off the model rather than guessed from `position`, so it follows the
   * head up as the bear rears onto its hind legs. The matrices are only
   * refreshed at render time, so force them current for the caller.
   */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    this.model.head.updateWorldMatrix(true, false);
    this.model.head.getWorldPosition(out);
    // Report it in the same space as `position` — i.e. the parent group's —
    // so it can be compared with anything else living in the meadow.
    if (this.object.parent) {
      this.object.parent.worldToLocal(out);
    }
    return out;
  }

  render(alpha: number): void {
    this.object.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.object.rotation.y =
      this.prevYaw + shortestAngle(this.prevYaw, this.yaw) * alpha;
    this.model.animate(this.elapsed, this.speed01, this.rear, this.swat);
  }
}
