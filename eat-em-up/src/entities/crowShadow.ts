import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CROW} from "../config";
import {Rng} from "../core/rng";

/** What the crow did this frame, for the game to act on. */
export type CrowEvent = "none" | "began" | "left" | "caught";

/**
 * A crow's shadow, and the one thing in this wood that can go wrong for you.
 *
 * It comes over, circles, and closes in. You have CROW.warnFor seconds to get
 * into the long grass; reach it and the crow gives up and goes, and if you do
 * not it takes you and the game is over. Nothing else here can be lost, which
 * is exactly what makes this land — for two minutes the wood is entirely safe
 * and then, once, it isn't.
 *
 * Drawn flat on the ground rather than cast: a real shadow would want a light
 * with shadow maps for one dark shape. This is a dark patch laid on the floor,
 * unlit and see-through, which reads the same and costs a draw call.
 */
export class CrowShadow {
  readonly group = new THREE.Group();

  private readonly wings: Array<THREE.Mesh> = [];
  /** Seconds until the next one comes over. */
  private wait: number;
  /** How far through a pass it is, or null between them. */
  private crossing: number | null = null;
  private readonly from = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private beat = 0;
  /**
   * The hunt: seconds left of it, or null when there is none on.
   *
   * Counted down rather than up so what the HUD needs to show — how long you
   * have — is the number itself.
   */
  private hunt: number | null = null;
  /** Where it is round the circle, and how long the dive has left. */
  private circle = 0;
  private dive = 0;

  constructor(private readonly rng: Rng) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x101a10,
      transparent: true,
      opacity: CROW.opacity,
      // A shadow must not hide what is behind it, and several of these
      // overlapping should not darken each other in steps.
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const body = new THREE.Mesh(bodyShape(), material);
    this.group.add(body);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingShape(side), material);
      this.group.add(wing);
      this.wings.push(wing);
    }

    this.group.visible = false;
    this.group.scale.setScalar(CROW.size);
    // The first one is at a fixed two minutes; see CROW.firstGap.
    this.wait = CROW.firstGap;
  }

  /** True while it is circling and the clock is running. */
  get hunting(): boolean {
    return this.hunt !== null;
  }

  /** Seconds left to reach the grass, for the HUD to show. */
  get secondsLeft(): number {
    return Math.max(0, Math.ceil(this.hunt ?? 0));
  }

  /** Calls off a hunt without a catch — see the note about fits in Game. */
  callOff(): void {
    if (this.hunt === null) {
      return;
    }
    this.hunt = null;
    this.dive = 0;
    this.group.visible = false;
    this.wait = this.nextWait();
  }

  /**
   * How long until the next one. Rolled fresh every time, so an early crow is
   * no promise about the one after it.
   */
  private nextWait(): number {
    return this.rng.next() < CROW.earlyChance
      ? this.rng.range(CROW.earlyMin, CROW.earlyMax)
      : this.rng.range(CROW.minGap, CROW.maxGap);
  }

  /** True while a shadow is actually crossing. */
  get passing(): boolean {
    return this.crossing !== null;
  }

  /**
   * `near` is the caterpillar and `safe` whether it is somewhere the crow
   * cannot see it. Returns what happened, for the game to act on.
   *
   * Safety is judged at the end of the count and not before: diving the
   * instant you step out of the grass would punish a wobble, and standing in
   * the grass for nine seconds and stepping out on the tenth is a mistake a
   * child should be allowed to make and see.
   */
  update(dt: number, near: THREE.Vector3, safe: boolean): CrowEvent {
    if (this.dive > 0) {
      this.dive -= dt;
      // Down onto the caterpillar. The shadow shrinking is the crow coming
      // down to meet the ground it is drawn on.
      const t = 1 - Math.max(0, this.dive) / CROW.diveFor;
      this.group.position.lerp(near, Math.min(1, t * 0.4));
      this.group.position.y = CROW.height;
      this.group.scale.setScalar(CROW.size * (1 - t * 0.55));
      this.beatWings(dt * 2.5);
      return "none";
    }

    if (this.hunt !== null) {
      this.hunt -= dt;
      this.circle += dt * CROW.circleRate * Math.PI * 2;

      // Closing in over the whole count, so how much time is left is
      // something you can see as well as read.
      const through = 1 - Math.max(0, this.hunt) / CROW.warnFor;
      const r = CROW.circleFrom + (CROW.circleTo - CROW.circleFrom) * through;
      this.group.position.set(
        near.x + Math.cos(this.circle) * r,
        CROW.height,
        near.z + Math.sin(this.circle) * r,
      );
      // Facing the way it is going round, which is a quarter turn on from the
      // direction it lies from the caterpillar.
      this.group.rotation.y = -this.circle + Math.PI / 2;
      this.beatWings(dt);

      if (this.hunt > 0) {
        return "none";
      }
      this.hunt = null;
      if (safe) {
        // Gives up and goes. It leaves the way any of them used to: straight
        // across and out of the wood.
        this.crossing = 0;
        this.heading.subVectors(this.group.position, near).setY(0).normalize();
        this.from.copy(this.group.position);
        this.group.scale.setScalar(CROW.size);
        return "left";
      }
      this.dive = CROW.diveFor;
      return "caught";
    }

    if (this.crossing !== null) {
      this.crossing += dt;
      const t = this.crossing / CROW.crossTime;
      if (t >= 1) {
        this.crossing = null;
        this.group.visible = false;
        this.wait = this.nextWait();
        return "none";
      }
      this.group.position
        .copy(this.from)
        .addScaledVector(this.heading, t * CROW.travel);
      this.group.position.y = CROW.height;
      this.beatWings(dt);
      return "none";
    }

    this.wait -= dt;
    if (this.wait <= 0) {
      this.begin(near);
      return "began";
    }
    return "none";
  }

  /**
   * The wings beat by folding along the body rather than flapping up and down:
   * seen from directly above, which is what a shadow on the ground is, that is
   * what a wing beat looks like.
   */
  private beatWings(dt: number): void {
    this.beat += dt * CROW.beatHz * Math.PI * 2;
    const fold = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.beat));
    for (const wing of this.wings) {
      wing.scale.z = fold;
    }
  }

  /** Starts a hunt: it arrives already circling, and the clock starts. */
  private begin(near: THREE.Vector3): void {
    this.hunt = CROW.warnFor;
    this.circle = this.rng.next() * Math.PI * 2;
    this.group.scale.setScalar(CROW.size);
    this.group.position.set(
      near.x + Math.cos(this.circle) * CROW.circleFrom,
      CROW.height,
      near.z + Math.sin(this.circle) * CROW.circleFrom,
    );
    this.group.visible = true;
  }
}

/** The body and tail, lying flat in the XZ plane. */
function bodyShape(): THREE.BufferGeometry {
  const body = new THREE.CircleGeometry(0.32, 14);
  body.scale(0.5, 1, 1);
  body.rotateX(-Math.PI / 2);

  const tail = new THREE.CircleGeometry(0.22, 3);
  tail.scale(0.55, 1, 1);
  tail.rotateX(-Math.PI / 2);
  tail.rotateY(Math.PI);
  tail.translate(0, 0, -0.42);

  const head = new THREE.CircleGeometry(0.12, 10);
  head.rotateX(-Math.PI / 2);
  head.translate(0, 0, 0.34);

  const geo = mergeGeometries([body, tail, head]);
  if (!geo) {
    throw new Error("could not merge crow shadow body");
  }
  return geo;
}

/** One wing, swept back from the body, hinged at nothing — the render folds it
 *  by scaling it along the bird's own axis. */
function wingShape(side: number): THREE.BufferGeometry {
  // An ellipse rather than a triangle. A three-sided circle is cheaper and
  // from above it read as a paper dart: the outline of a wing is what makes a
  // dark patch on the ground a bird rather than a shape.
  const wing = new THREE.CircleGeometry(0.66, 14);
  wing.scale(1, 1, 0.3);
  wing.rotateX(-Math.PI / 2);
  wing.translate(0.62, 0, 0);
  // Swept back from the shoulder, and mirrored for the other side.
  wing.rotateY(-0.5);
  if (side < 0) {
    wing.scale(-1, 1, 1);
  }
  wing.translate(0, 0, 0.02);
  return wing;
}
