import * as THREE from "three";
import {CAMERA} from "../config";
import type {BeeActor} from "../entities/beeActor";

const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const smoothedLook = new THREE.Vector3();
const boom = new THREE.Vector3();
const outward = new THREE.Vector3();
const sideways = new THREE.Vector3();
const framed = new THREE.Vector3();

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

  /**
   * A second multiplier on top of the level's, set from the viewport rather
   * than from the game: a phone gets a much smaller window onto the same world,
   * so the shot widens to compensate. Kept separate from `zoom` because it
   * isn't eased — it changes when the screen does, and a rotate shouldn't look
   * like a camera move.
   */
  private viewportZoom = 1;

  /**
   * Ceiling on the two multiplied together. Rooms that were sized around the
   * camera can't take the extra pull-back — the cottage interior has half a
   * unit of clearance between the boom and the wall — so they cap it.
   */
  private maxZoom = Infinity;

  /** Set while a level is driving the camera itself. */
  private cinematicEye: THREE.Vector3 | null = null;
  private readonly cinematicLook = new THREE.Vector3();

  /**
   * A sphere about the world origin the camera may not leave, or null.
   *
   * This is what lets a level be played right up against a wall. The rig sits
   * `distance` behind the bee, so flying at anything solid puts the camera on
   * the far side of it — in the royal chamber, where the food is in the dome
   * wall itself, that would mean looking at the back of the honeycomb every
   * time you went to feed. Clamped, the boom shortens instead, and the shot
   * tightens as you come in. It's what a third-person camera does when it
   * meets geometry; this one only has to know about the one sphere.
   */
  private enclosure: number | null = null;

  /**
   * A last say over where the eye may stand, for a shape an enclosure sphere
   * can't describe. The maze uses it to keep the camera in the corridors: it
   * sits low and behind the bee in there, so without this every corner would
   * park the shot inside a tree trunk.
   */
  private confine: ((point: THREE.Vector3, bee: THREE.Vector3) => void) | null =
    null;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    smoothedLook.set(0, 1, 0);
  }

  /** Keep the camera inside a sphere of this radius, or pass null to stop. */
  setEnclosure(radius: number | null): void {
    this.enclosure = radius;
  }

  /** Hand the eye to `fn` for a final correction, or null to stop. */
  setConfine(
    fn: ((point: THREE.Vector3, bee: THREE.Vector3) => void) | null,
  ): void {
    this.confine = fn;
  }

  /**
   * Swing `point` round the bee until it is inside the enclosure, keeping the
   * boom the length it was.
   *
   * Shortening the boom instead — walking in along the line from the bee — is
   * the obvious move and it doesn't work here. At a food cell the bee is a
   * unit and a half off the comb, so the moment the shot faces inward there is
   * no room behind her at all: the boom collapsed to 1.5 and the screen filled
   * with honeycomb, with the bee off the bottom edge. There is no *distance*
   * that works, only a *direction*, and swinging round to it is what a
   * third-person camera does when it meets a wall.
   *
   * The eye must satisfy |bee + d|^2 <= E^2 with |d| fixed, which reduces to a
   * cap on `bee · d` — a cone of legal directions about the inward axis. So
   * take the desired direction, and if it falls outside the cone, rotate it in
   * the plane it shares with the outward axis until it lands on the edge. That
   * is the closest legal shot to the one that was asked for.
   */
  private clampToEnclosure(point: THREE.Vector3, bee: THREE.Vector3): void {
    const limit = this.enclosure;
    if (limit === null || point.length() <= limit) {
      return;
    }

    boom.copy(point).sub(bee);
    const reach = boom.length();
    const beeLen = bee.length();
    if (reach < 1e-6) {
      return;
    }
    // Bee at the very centre: any direction is as good as another, so the only
    // thing that can be wrong is the distance.
    if (beeLen < 1e-6) {
      point.copy(bee).addScaledVector(boom, Math.min(1, limit / reach));
      return;
    }

    // |bee|^2 + 2(bee · d) + |d|^2 <= E^2
    const maxDot = (limit * limit - beeLen * beeLen - reach * reach) / 2;
    if (boom.dot(bee) <= maxDot) {
      return;
    }

    outward.copy(bee).divideScalar(beeLen);
    // The part of the boom at right angles to the outward axis — the direction
    // we rotate toward. If the boom is dead along the axis there's no plane to
    // rotate in, so pick one: straight up, which is where a chase camera would
    // rather be anyway.
    sideways.copy(boom).addScaledVector(outward, -boom.dot(outward));
    if (sideways.lengthSq() < 1e-8) {
      sideways.set(0, 1, 0).addScaledVector(outward, -outward.y);
      if (sideways.lengthSq() < 1e-8) {
        sideways.set(1, 0, 0).addScaledVector(outward, -outward.x);
      }
    }
    sideways.normalize();

    // Land exactly on the cone: cos from the dot cap, sin from the identity.
    const cos = Math.max(-1, Math.min(1, maxDot / (beeLen * reach)));
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    point
      .copy(bee)
      .addScaledVector(outward, reach * cos)
      .addScaledVector(sideways, reach * sin);
  }

  /** `immediate` skips the ease — used when a level places the bee. */
  setZoom(z: number, immediate = false): void {
    this.zoomTarget = z;
    if (immediate) {
      this.zoom = z;
    }
  }

  /**
   * Where the camera has to stand for a flat square lying on the ground to
   * fill the frame — used for the dance mat, which is the whole of that stage
   * and wants to be looked at squarely rather than followed.
   *
   * Worked out from the real FOV and aspect rather than picked by eye, because
   * "large on screen" means something different on an iPad and on a portrait
   * phone: the board's width is measured against the horizontal axis and its
   * foreshortened depth against the vertical, and whichever needs the camera
   * further back wins. Recomputing it each frame means a rotate re-fits.
   *
   * @param centre middle of the square, on the ground
   * @param halfWidth half its side
   * @param pitch radians above the horizontal to look down from
   * @param fill how much of the tighter screen axis it should span, 0..1
   * @returns a shared vector — copy it if you need to keep it
   */
  framedEye(
    centre: THREE.Vector3,
    halfWidth: number,
    pitch: number,
    fill: number,
  ): THREE.Vector3 {
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanH = tanV * this.camera.aspect;
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);

    // The camera's axes at this pitch, looking down the boom at the centre.
    // Right is world +X because the boom only ever leans in the ZY plane.
    const fx = 0,
      fy = -sp,
      fz = -cp;
    const ux = 0,
      uy = cp,
      uz = -sp;

    /**
     * How far out the worst corner lands, in screen units where 1 is the edge.
     *
     * Projected properly rather than by the small-angle shortcut: the shot is
     * close enough that perspective matters a lot — the near edge of the board
     * subtends far more than the far edge, and treating them alike put the
     * back row off the top of the screen.
     */
    const worst = (d: number): number => {
      let out = 0;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          // Corner relative to the eye, which sits `d` up the boom.
          const vx = sx * halfWidth;
          const vy = -sp * d;
          const vz = sz * halfWidth - cp * d;
          const depth = vx * fx + vy * fy + vz * fz;
          if (depth <= 1e-3) {
            return Infinity;
          }
          const sxn = Math.abs(vx / (depth * tanH));
          const syn = Math.abs((vx * ux + vy * uy + vz * uz) / (depth * tanV));
          out = Math.max(out, sxn, syn);
        }
      }
      return out;
    };

    // Monotonic in `d`, so bisect. Twenty steps lands well inside a pixel.
    let lo = halfWidth * 0.5;
    let hi = halfWidth * 40;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (worst(mid) > fill) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return framed.set(0, sp, cp).multiplyScalar(hi).add(centre);
  }

  /** Extra pull-back for a small screen. Applied at once, not eased. */
  setViewportZoom(z: number): void {
    this.viewportZoom = z;
  }

  /** Cap on zoom * viewportZoom, for a level with no room to widen into. */
  setMaxZoom(z: number | null): void {
    this.maxZoom = z ?? Infinity;
  }

  /** How far back the boom actually is, once everything has had its say. */
  private get scale(): number {
    return Math.min(this.zoom * this.viewportZoom, this.maxZoom);
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
    if (look) {
      this.cinematicLook.copy(look);
    }
  }

  /**
   * @param steering whether the player is actually pushing the stick. It
   *   decides which of the two follow rates applies — see `followYaw`.
   */
  update(dt: number, bee: BeeActor, steering = false): void {
    if (this.cinematicEye) {
      this.camera.position.copy(this.cinematicEye);
      // Ease the look target so a moving subject doesn't make the shot jitter.
      smoothedLook.lerp(this.cinematicLook, 1 - Math.exp(-9 * dt));
      this.camera.lookAt(smoothedLook);
      return;
    }

    this.followYaw(dt, bee, steering);

    // Ease the pull-back so entering and leaving a chase glides.
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-2.6 * dt));
    const scale = this.scale;

    // Sit behind the heading: bee position minus its forward vector.
    desired.set(
      bee.position.x - Math.sin(this.yaw) * this.distance * scale,
      bee.position.y + this.height * scale,
      bee.position.z - Math.cos(this.yaw) * this.distance * scale,
    );

    this.clampToEnclosure(desired, bee.position);
    this.confine?.(desired, bee.position);

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
   * Drift the shot round to sit behind the bee.
   *
   * Two rates, because the problem is two different problems.
   *
   * While the player is steering, the stick is read in this camera's frame, so
   * turning the camera turns the bee's heading by the same amount: the offset
   * between them is a fixed point, and no gain closes it. All the follow can do
   * is widen the arc, so it stays gentle and keeps its dead zone.
   *
   * The moment nobody is pushing, that loop is gone — the heading is fixed in
   * the world and the camera can simply come round behind it. It used to stop
   * dead here instead: the follow was gated on `planarSpeed > 1.2` and scaled
   * by speed, and a released stick drops under that inside a second, which is
   * what left the bee parked side-on to the camera after every turn. Now it
   * lines up on `bee.heading`, which holds its value at a standstill.
   */
  private followYaw(dt: number, bee: BeeActor, steering: boolean): void {
    const diff = shortestAngle(this.yaw, bee.heading);
    const size = Math.abs(diff);
    if (size < 1e-4) {
      return;
    }

    let rate: number;
    if (steering) {
      const off = size - CAMERA.yawDeadzone;
      if (off <= 0) {
        return;
      }
      const planarSpeed = Math.hypot(bee.velocity.x, bee.velocity.z);
      rate =
        Math.min(off * CAMERA.yawGain, CAMERA.yawMaxRate) *
        Math.min(1, planarSpeed / 4.5);
    } else {
      rate = Math.min(size * CAMERA.yawIdleGain, CAMERA.yawIdleMaxRate);
    }

    // Never overshoot the heading in a single step.
    this.yaw += Math.sign(diff) * Math.min(rate * dt, size);
  }

  /**
   * Snap immediately, used on level entry so there's no swoop-in.
   *
   * @param yaw which way to look. Defaults to facing the world origin, which
   *   is right for scenes built around it — but not for the cottage clearing,
   *   which stands off at the far end of the meadow, so levels that place the
   *   bee somewhere else say what they mean.
   */
  snap(
    bee: BeeActor,
    yaw = Math.atan2(-bee.position.x, -bee.position.z),
  ): void {
    this.zoom = this.zoomTarget;
    this.yaw = yaw;
    const scale = this.scale;
    desired.set(
      bee.position.x - Math.sin(this.yaw) * this.distance * scale,
      bee.position.y + this.height * scale,
      bee.position.z - Math.cos(this.yaw) * this.distance * scale,
    );
    this.clampToEnclosure(desired, bee.position);
    this.confine?.(desired, bee.position);
    this.camera.position.copy(desired);
    smoothedLook
      .copy(bee.position)
      .add(new THREE.Vector3(0, CAMERA.lookHeight, 0));
    this.camera.lookAt(smoothedLook);
  }
}
