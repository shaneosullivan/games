import * as THREE from "three";
import {FLIGHT, WORLD} from "../config";
import type {StickInput} from "../core/input";
import {createBee} from "../render/geometry/bee";

const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

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
   *
   * `sphereRadius` caps the distance from the centre in 3D, not just across
   * the ground. A disc plus a height ceiling is a cylinder, and a cylinder's
   * top rim pokes out of anything domed: in the royal chamber, flying to the
   * bounds at full altitude put the bee through the roof. Levels played inside
   * a dome set this to keep the corner inside it; everywhere else it's off.
   */
  bounds = {
    radius: WORLD.radius as number,
    centreX: 0,
    centreZ: 0,
    minZ: -Infinity as number,
    sphereRadius: Infinity as number,
  };

  /**
   * How the stick is read.
   *
   * `camera` is the game's default: push a direction on screen and she flies
   * that way, whichever way the camera faces. That falls apart in the maze,
   * where the corridors are narrow and the camera is often part-way round a
   * corner — you push "left" meaning "down that lane" and get something else.
   * `tank` gives the maze its own scheme: left and right turn her on the spot,
   * forward and back drive along her nose. Slower to fly, but you can always
   * say which way she will go.
   */
  steering: "camera" | "tank" = "camera";

  /**
   * Multiplier on top speed and on how hard she accelerates, per level.
   *
   * The maze turns it up: its corridors are eighteen units long and you fly
   * them in a straight line, so at the meadow's pace the level is mostly
   * waiting. Acceleration scales with it or she would spend the whole of a
   * corridor getting up to speed.
   */
  speedScale = 1;

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

  /**
   * Which way the bee is pointing. This, not the velocity, is what the camera
   * lines up behind: it holds its last value when she slows to a stop, where
   * a velocity direction would be noise, and it's what the player can see.
   */
  get heading(): number {
    return this.yaw;
  }

  /** 0..1 fraction of top speed. */
  get speed01(): number {
    return Math.min(1, this.velocity.length() / this.topSpeed);
  }

  /** What this level lets her do, flat out. */
  private get topSpeed(): number {
    return FLIGHT.maxSpeed * this.speedScale;
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
    if (this.velocity.lengthSq() < 0.0001) {
      this.velocity.set(1, 0, 0);
    }
    this.velocity.setLength(speed);
    this.stunTime = seconds;
  }

  /**
   * Nose up or down while scripted: 1 climbing hard, -1 diving, 0 level.
   *
   * The flight model works this out from how fast she is actually climbing,
   * which is no use to a cutscene that writes `position` directly — the Bear's
   * Lair moves her a whole cave without the model ever seeing a metre of it.
   * Kept separate from `climbRate` so that a cutscene taking over a climbing
   * bee doesn't inherit her last pitch and hold it for good.
   */
  setClimb(t: number): void {
    this.scriptedClimb = Math.max(-1, Math.min(1, t));
  }

  private scriptedClimb = 0;

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
    // A level that placed her is starting fresh; a pitch held over from the
    // last one's cutscene would land her nose-down in the new scene.
    this.scriptedClimb = 0;
  }

  /** Jump to an altitude without the climb, for level entry. */
  snapHeight(h: number): void {
    this.baseHeight = h;
    this.desiredHeight = h;
    this.position.y = h;
    this.prevPosition.y = h;
    this.climbRate = 0;
  }

  /**
   * @param turn -1..1, only read under tank steering: the maze's turn buttons.
   *   Kept separate from the stick because they are separate controls — the
   *   thumbstick there is forward and back alone.
   */
  update(dt: number, stick: StickInput, cameraYaw: number, turn = 0): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    this.prevRoll = this.roll;
    this.elapsed += dt;

    if (this.scripted) {
      // Position and yaw belong to the cutscene; just keep the wings alive.
      this.bobPhase += dt * FLIGHT.bobRate;
      this.roll += (0 - this.roll) * Math.min(1, 4 * dt);
      this.baseHeight = this.position.y;
      this.climbRate = this.scriptedClimb * FLIGHT.climbSpeed;
      return;
    }

    // While stunned the stick is ignored and the bee just coasts out the shove.
    this.stunTime = Math.max(0, this.stunTime - dt);
    const stunned = this.stunTime > 0;
    const tank = this.steering === "tank";

    if (tank) {
      // Left and right are a turn, not a direction: she pivots where she is.
      // Right on the stick is a right turn, which is yaw *decreasing* — screen
      // right is -X when she faces +Z, and forward is (sin yaw, cos yaw).
      if (!stunned) {
        this.yaw -= turn * FLIGHT.tankTurnRate * dt;
      }
      tmpForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      tmpDesired
        .copy(tmpForward)
        .multiplyScalar(stunned ? 0 : -stick.y)
        .multiplyScalar(this.topSpeed);
    } else {
      // Camera-space basis on the horizontal plane. The camera sits behind
      // `cameraYaw`, so "into the screen" is that yaw's forward vector, and
      // screen-right is forward x up.
      tmpForward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
      tmpRight.set(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));

      tmpDesired
        .copy(tmpForward)
        .multiplyScalar(stunned ? 0 : -stick.y)
        .addScaledVector(tmpRight, stunned ? 0 : stick.x)
        .multiplyScalar(this.topSpeed);
    }

    // Accelerate toward the desired velocity; coast to a stop when released.
    const rate =
      (!stunned && stick.magnitude > 0 ? FLIGHT.accel : FLIGHT.drag) *
      this.speedScale;
    tmpDelta.copy(tmpDesired).sub(this.velocity);
    tmpDelta.y = 0;
    const maxChange = rate * dt;
    if (tmpDelta.length() > maxChange) {
      tmpDelta.setLength(maxChange);
    }
    this.velocity.add(tmpDelta);

    this.position.addScaledVector(this.velocity, dt);

    // Soft boundary: push back rather than hard-clamp, so it feels like wind.
    //
    // The push ramps to full strength over FLIGHT.boundsGive and the position
    // is then clamped at exactly that. Both matter. A push alone balances the
    // stick at whatever overshoot generates maxSpeed, which is a long way out
    // if the ramp is gentle — the bee used to settle 2.6 units past the edge,
    // which put her inside the hedge in the meadow and inside the honeycomb in
    // the royal chamber. The clamp is what makes the edge mean something; the
    // push is what stops it feeling like a wall.
    const dx = this.position.x - this.bounds.centreX;
    const dz = this.position.z - this.bounds.centreZ;
    const horiz = Math.hypot(dx, dz);
    if (horiz > this.bounds.radius) {
      const over = horiz - this.bounds.radius;
      const push = Math.min(1, over / FLIGHT.boundsGive) * FLIGHT.boundsPush;
      const limit = this.bounds.radius + FLIGHT.boundsGive;
      const pulled = Math.min(horiz - push * dt, limit);
      this.position.x = this.bounds.centreX + (dx / horiz) * pulled;
      this.position.z = this.bounds.centreZ + (dz / horiz) * pulled;
      this.velocity.multiplyScalar(1 - Math.min(0.9, over / 8) * dt * 4);
    }

    // The same soft push, against a flat wall this time.
    if (this.position.z < this.bounds.minZ) {
      const over = this.bounds.minZ - this.position.z;
      const push = Math.min(1, over / FLIGHT.boundsGive) * FLIGHT.boundsPush;
      this.position.z = Math.max(
        this.position.z + push * dt,
        this.bounds.minZ - FLIGHT.boundsGive,
      );
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
    this.position.y =
      this.baseHeight + Math.sin(this.bobPhase) * FLIGHT.bobAmplitude;

    // The domed ceiling, applied last because it needs the finished height.
    // Pulling straight in toward the centre would drag the bee down the wall
    // by itself, so only the horizontal part gives — the player keeps the
    // altitude they asked for and loses a little reach instead.
    this.clampToSphere();

    // Face the direction of travel — except under tank steering, where the
    // player owns the yaw outright and deriving it from velocity would fight
    // them every time she reverses.
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!tank && planarSpeed > 0.35) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.yaw +=
        shortestAngle(this.yaw, target) * Math.min(1, FLIGHT.yawLerp * dt);
    }

    // Bank into turns. Under tank steering the turn is the stick itself; under
    // camera steering it's how far the velocity has swung off her nose.
    const swing = tank
      ? -turn
      : shortestAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z));
    const targetRoll =
      THREE.MathUtils.clamp(-swing * 2.2, -FLIGHT.maxBank, FLIGHT.maxBank) *
      (tank ? 1 : this.speed01);
    this.roll += (targetRoll - this.roll) * Math.min(1, FLIGHT.bankLerp * dt);
  }

  /**
   * Hold the bee inside `bounds.sphereRadius` by giving up horizontal reach.
   *
   * The height is left alone deliberately: it's the one axis the player sets
   * directly, and silently sinking someone who asked to be at the top of the
   * room reads as the controls being broken rather than as a wall.
   */
  private clampToSphere(): void {
    const limit = this.bounds.sphereRadius;
    if (!isFinite(limit)) {
      return;
    }
    const dx = this.position.x - this.bounds.centreX;
    const dz = this.position.z - this.bounds.centreZ;
    const y = Math.min(Math.abs(this.position.y), limit);
    // How much horizontal room is left at this height.
    const room = Math.sqrt(limit * limit - y * y);
    const horiz = Math.hypot(dx, dz);
    if (horiz <= room || horiz < 1e-6) {
      return;
    }
    const k = room / horiz;
    this.position.x = this.bounds.centreX + dx * k;
    this.position.z = this.bounds.centreZ + dz * k;
  }

  /** Called once per rendered frame with the sub-step interpolation factor. */
  render(alpha: number): void {
    this.object.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.object.rotation.y =
      this.prevYaw + shortestAngle(this.prevYaw, this.yaw) * alpha;
    this.object.rotation.z =
      this.prevRoll + (this.roll - this.prevRoll) * alpha;
    this.model.animate(
      this.elapsed,
      this.speed01,
      this.climbRate / FLIGHT.climbSpeed,
    );
  }

  /** Current altitude excluding the bob, for the slider's ghost marker. */
  get height(): number {
    return this.baseHeight;
  }
}
